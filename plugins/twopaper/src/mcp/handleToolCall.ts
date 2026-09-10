import type { Searchers } from './searchers.js';
import type { ToolName } from './schemas.js';
import { parseToolArgs } from './schemas.js';
import { PaperFactory, type Paper } from '../models/Paper.js';
import { PaperSource, type SearchOptions } from '../platforms/PaperSource.js';
import { CitationService } from '../services/CitationService.js';
import { aggregateSearch } from '../services/AggregateSearch.js';
import { OASource } from '../services/OASource.js';
import { BridgesClient } from '../services/BridgesClient.js';
import { MinerUClient } from '../services/MinerUClient.js';
import { DownloadThrottle, DownloadLimitError } from '../services/DownloadThrottle.js';
import { PaperNamer } from '../services/PaperNamer.js';
import { PlatformRegistry } from '../services/PlatformRegistry.js';
import { missingCredentials } from '../services/config/credentials.js';
import { PDFExtractor } from '../utils/PDFExtractor.js';
import { sanitizeDownloadPath, sanitizeDoi } from '../utils/SecurityUtils.js';
import { logDebug } from '../utils/Logger.js';

const citationService = new CitationService();
const oaSource = new OASource();
const bridges = new BridgesClient();
const mineru = new MinerUClient();
const downloadThrottle = new DownloadThrottle();
const paperNamer = new PaperNamer();
const platformRegistry = new PlatformRegistry();
const pdfExtractor = new PDFExtractor();

/** 跨平台按 DOI 定位第一篇论文（为下载命名/全文获取提供元数据）。 */
async function findPaperByDoiAcrossPlatforms(searchers: Searchers, doi: string): Promise<Paper | null> {
  for (const [name, searcher] of Object.entries(searchers)) {
    if (['wos', 'scholar', 'scihub'].includes(name)) continue;
    try {
      const paper = await (searcher as PaperSource).getPaperByDoi(doi);
      if (paper) return paper;
    } catch {
      // 平台级隔离：单个平台失败不阻断
    }
  }
  return null;
}

interface DownloadOutcome {
  status: 'downloaded' | 'existed' | 'miss' | 'limit';
  path?: string;
  hint?: ReturnType<BridgesClient['hint']>;
  retryAfterMs?: number;
}

/** 统一下载：OA 直链/平台下载 → PaperNamer 命名 + DownloadThrottle 限流。 */
async function downloadPaperPdf(
  searchers: Searchers,
  paper: Paper | null,
  doi: string,
  savePathOverride?: string
): Promise<DownloadOutcome> {
  const doiResult = sanitizeDoi(doi);
  const cleanDoi = doiResult.valid ? doiResult.sanitized : doi;
  const meta = {
    author: paper?.authors?.[0],
    year: paper?.year,
    title: paper?.title,
    doi: cleanDoi
  };
  const target = savePathOverride
    ? sanitizeDownloadPath(savePathOverride, process.env.DEFAULT_DOWNLOAD_PATH || './downloads').sanitized
    : paperNamer.resolveTargetPath(meta).sanitized;

  // 1. 合法 OA 直链
  let url: string | null = paper?.pdfUrl || null;
  if (!url) {
    const oaLoc = await oaSource.findPdfByDoi(cleanDoi);
    url = oaLoc?.url || null;
  }
  if (url) {
    try {
      downloadThrottle.acquire();
    } catch (e) {
      if (e instanceof DownloadLimitError) return { status: 'limit', retryAfterMs: e.retryAfterMs };
      throw e;
    }
    const filePath = await pdfExtractor.downloadPdf(url, target);
    return { status: 'downloaded', path: filePath };
  }

  // 2. 平台下载（paper 来自可下载平台）
  if (paper?.source) {
    const searcher = (searchers as any)[paper.source];
    if (searcher?.getCapabilities?.()?.download) {
      try {
        downloadThrottle.acquire();
      } catch (e) {
        if (e instanceof DownloadLimitError) return { status: 'limit', retryAfterMs: e.retryAfterMs };
        throw e;
      }
      const filePath = await searcher.downloadPdf(paper.paperId || cleanDoi, { savePath: target });
      return { status: 'downloaded', path: filePath };
    }
  }

  // 3. 未命中 → 桥接指令块（hint）
  return { status: 'miss', hint: bridges.hint(cleanDoi) };
}

function jsonTextResponse(text: string) {
  return {
    content: [
      {
        type: 'text' as const,
        text
      }
    ]
  };
}

export async function handleToolCall(
  toolNameRaw: string,
  rawArgs: unknown,
  searchers: Searchers
) {
  const toolName = toolNameRaw as ToolName;
  const args = parseToolArgs(toolName, rawArgs);

  switch (toolName) {
    case 'search_papers': {
      const {
        query,
        platform,
        maxResults,
        year,
        author,
        journal,
        category,
        days,
        fetchDetails,
        fieldsOfStudy,
        sortBy,
        sortOrder
      } = args;

      const results: Record<string, any>[] = [];
      const searchOptions: SearchOptions = {
        maxResults,
        year,
        author,
        journal,
        category,
        days,
        fetchDetails,
        fieldsOfStudy,
        sortBy,
        sortOrder
      };

      if (platform === 'all') {
        const agg = await aggregateSearch(searchers, query, searchOptions, { maxResults });
        const papers = agg.papers.map((paper: Paper) => PaperFactory.toDict(paper));
        const summary = {
          count: papers.length,
          sources_hit: agg.sourcesHit,
          failures: agg.failures
        };
        return jsonTextResponse(`Found ${papers.length} papers.\n\n${JSON.stringify(summary, null, 2)}\n\n${JSON.stringify(papers, null, 2)}`);
      } else {
        const searcher = (searchers as any)[platform];
        if (!searcher) {
          throw new Error(`Unsupported platform: ${platform}`);
        }

        const platformResults = await (searcher as PaperSource).search(query, searchOptions);
        results.push(...platformResults.map((paper: Paper) => PaperFactory.toDict(paper)));
      }

      return jsonTextResponse(`Found ${results.length} papers.\n\n${JSON.stringify(results, null, 2)}`);
    }

    case 'search_arxiv': {
      const { query, maxResults, category, author, year, sortBy, sortOrder } = args;
      const results = await searchers.arxiv.search(query, {
        maxResults,
        category,
        author,
        year,
        sortBy,
        sortOrder
      });

      return jsonTextResponse(
        `Found ${results.length} arXiv papers.\n\n${JSON.stringify(
          results.map((paper: Paper) => PaperFactory.toDict(paper)),
          null,
          2
        )}`
      );
    }

    case 'search_webofscience': {
      const { query, maxResults, year, author, journal, sortBy, sortOrder } = args;
      if (!process.env.WOS_API_KEY) {
        throw new Error('Web of Science API key not configured. Please set WOS_API_KEY environment variable.');
      }

      const results = await searchers.webofscience.search(query, {
        maxResults,
        year,
        author,
        journal,
        sortBy,
        sortOrder
      } as any);

      return jsonTextResponse(
        `Found ${results.length} Web of Science papers.\n\n${JSON.stringify(
          results.map((paper: Paper) => PaperFactory.toDict(paper)),
          null,
          2
        )}`
      );
    }

    case 'search_pubmed': {
      const { query, maxResults, year, author, journal, publicationType, sortBy } = args;

      const results = await searchers.pubmed.search(query, {
        maxResults,
        year,
        author,
        journal,
        publicationType,
        sortBy
      });

      const rateStatus = searchers.pubmed.getRateLimiterStatus();
      const apiKeyStatus = searchers.pubmed.hasApiKey() ? 'configured' : 'not configured';
      const rateLimit = searchers.pubmed.hasApiKey() ? '10 requests/second' : '3 requests/second';

      return jsonTextResponse(
        `Found ${results.length} PubMed papers.\n\nAPI Status: ${apiKeyStatus} (${rateLimit})\nRate Limiter: ${rateStatus.availableTokens}/${rateStatus.maxTokens} tokens available\n\n${JSON.stringify(
          results.map((paper: Paper) => PaperFactory.toDict(paper)),
          null,
          2
        )}`
      );
    }

    case 'search_biorxiv': {
      const { query, maxResults, days, category } = args;
      const results = await searchers.biorxiv.search(query, {
        maxResults,
        days,
        category
      });

      return jsonTextResponse(
        `Found ${results.length} bioRxiv papers.\n\n${JSON.stringify(
          results.map((paper: Paper) => PaperFactory.toDict(paper)),
          null,
          2
        )}`
      );
    }

    case 'search_medrxiv': {
      const { query, maxResults, days, category } = args;
      const results = await searchers.medrxiv.search(query, {
        maxResults,
        days,
        category
      });

      return jsonTextResponse(
        `Found ${results.length} medRxiv papers.\n\n${JSON.stringify(
          results.map((paper: Paper) => PaperFactory.toDict(paper)),
          null,
          2
        )}`
      );
    }

    case 'search_semantic_scholar': {
      const { query, maxResults, year, fieldsOfStudy } = args;
      const results = await searchers.semantic.search(query, {
        maxResults,
        year,
        fieldsOfStudy
      });

      const rateStatus = searchers.semantic.getRateLimiterStatus();
      const apiKeyStatus = searchers.semantic.hasApiKey()
        ? 'configured'
        : 'not configured (using free tier)';
      const rateLimit = searchers.semantic.hasApiKey() ? '200 requests/minute' : '20 requests/minute';

      return jsonTextResponse(
        `Found ${results.length} Semantic Scholar papers.\n\nAPI Status: ${apiKeyStatus} (${rateLimit})\nRate Limiter: ${rateStatus.availableTokens}/${rateStatus.maxTokens} tokens available\n\n${JSON.stringify(
          results.map((paper: Paper) => PaperFactory.toDict(paper)),
          null,
          2
        )}`
      );
    }

    case 'search_iacr': {
      const { query, maxResults, fetchDetails } = args;
      const results = await searchers.iacr.search(query, { maxResults, fetchDetails });

      return jsonTextResponse(
        `Found ${results.length} IACR ePrint papers.\n\n${JSON.stringify(
          results.map((paper: Paper) => PaperFactory.toDict(paper)),
          null,
          2
        )}`
      );
    }

    case 'download_paper': {
      const { paperId, platform, savePath } = args;
      const pathResult = sanitizeDownloadPath(savePath, './downloads');
      if (!pathResult.valid) {
        throw new Error(pathResult.error || 'Invalid save path');
      }
      const resolvedSavePath = pathResult.sanitized;

      const searcher = (searchers as any)[platform];
      if (!searcher) {
        throw new Error(`Unsupported platform for download: ${platform}`);
      }

      if (!searcher.getCapabilities().download) {
        throw new Error(`Platform ${platform} does not support PDF download`);
      }

      const filePath = await searcher.downloadPdf(paperId, { savePath: resolvedSavePath });
      return jsonTextResponse(`PDF downloaded successfully to: ${filePath}`);
    }

    case 'search_google_scholar': {
      const { query, maxResults, yearLow, yearHigh, author } = args;
      const results = await searchers.googlescholar.search(query, {
        maxResults,
        yearLow,
        yearHigh,
        author
      } as any);

      return jsonTextResponse(
        `Found ${results.length} Google Scholar papers.\n\n${JSON.stringify(
          results.map((paper: Paper) => PaperFactory.toDict(paper)),
          null,
          2
        )}`
      );
    }

    case 'get_paper_by_doi': {
      const { doi, platform } = args;
      const doiResult = sanitizeDoi(doi);
      if (!doiResult.valid) {
        throw new Error(doiResult.error || 'Invalid DOI format');
      }
      const cleanDoi = doiResult.sanitized;
      const results: Record<string, any>[] = [];

      if (platform === 'all') {
        for (const [platformName, searcher] of Object.entries(searchers)) {
          if (platformName === 'wos' || platformName === 'scholar') continue;
          try {
            const paper = await (searcher as PaperSource).getPaperByDoi(cleanDoi);
            if (paper) {
              results.push(PaperFactory.toDict(paper));
            }
          } catch (error) {
            logDebug(`Error getting paper by DOI from ${platformName}:`, error);
          }
        }
      } else {
        const searcher = (searchers as any)[platform];
        if (!searcher) {
          throw new Error(`Unsupported platform: ${platform}`);
        }
        const paper = await searcher.getPaperByDoi(cleanDoi);
        if (paper) {
          results.push(PaperFactory.toDict(paper));
        }
      }

      if (results.length === 0) {
        return jsonTextResponse(`No paper found with DOI: ${cleanDoi}`);
      }
      return jsonTextResponse(`Found ${results.length} paper(s) with DOI ${cleanDoi}:\n\n${JSON.stringify(results, null, 2)}`);
    }

    case 'search_scihub': {
      const { doiOrUrl, downloadPdf, savePath } = args;
      const pathResult = sanitizeDownloadPath(savePath, './downloads');
      if (!pathResult.valid) {
        throw new Error(pathResult.error || 'Invalid save path');
      }
      const resolvedSavePath = pathResult.sanitized;

      const results = await searchers.scihub.search(doiOrUrl);
      if (results.length === 0) {
        return jsonTextResponse(`No paper found on Sci-Hub for: ${doiOrUrl}`);
      }

      const paper = results[0];
      let responseText = `Found paper on Sci-Hub:\n\n${JSON.stringify(PaperFactory.toDict(paper), null, 2)}`;

      if (downloadPdf && paper.pdfUrl) {
        try {
          const filePath = await searchers.scihub.downloadPdf(doiOrUrl, { savePath: resolvedSavePath });
          responseText += `\n\nPDF downloaded successfully to: ${filePath}`;
        } catch (downloadError: any) {
          responseText += `\n\nFailed to download PDF: ${downloadError.message}`;
        }
      }

      return jsonTextResponse(responseText);
    }

    case 'check_scihub_mirrors': {
      const { forceCheck } = args;

      if (forceCheck) {
        await searchers.scihub.forceHealthCheck();
      }
      const mirrorStatus = searchers.scihub.getMirrorStatus();
      return jsonTextResponse(`Sci-Hub Mirror Status:\n\n${JSON.stringify(mirrorStatus, null, 2)}`);
    }

    case 'search_sciencedirect': {
      const { query, maxResults, year, author, journal, openAccess } = args;
      if (!process.env.ELSEVIER_API_KEY) {
        throw new Error('Elsevier API key not configured. Please set ELSEVIER_API_KEY environment variable.');
      }
      const results = await searchers.sciencedirect.search(query, {
        maxResults,
        year,
        author,
        journal,
        openAccess
      });

      return jsonTextResponse(
        `Found ${results.length} ScienceDirect papers.\n\n${JSON.stringify(
          results.map((paper: Paper) => PaperFactory.toDict(paper)),
          null,
          2
        )}`
      );
    }

    case 'search_springer': {
      const { query, maxResults, year, author, journal, subject, openAccess, type } = args;
      if (!process.env.SPRINGER_API_KEY) {
        throw new Error('Springer API key not configured. Please set SPRINGER_API_KEY environment variable.');
      }

      const results = await searchers.springer.search(query, {
        maxResults,
        year,
        author,
        journal,
        subject,
        openAccess,
        type
      } as any);

      return jsonTextResponse(
        `Found ${results.length} Springer papers.\n\n${JSON.stringify(
          results.map((paper: Paper) => PaperFactory.toDict(paper)),
          null,
          2
        )}`
      );
    }

    case 'search_scopus': {
      const { query, maxResults, year, author, journal, affiliation, subject, openAccess, documentType } = args;
      if (!process.env.ELSEVIER_API_KEY) {
        throw new Error('Elsevier API key not configured. Please set ELSEVIER_API_KEY environment variable.');
      }

      const results = await searchers.scopus.search(query, {
        maxResults,
        year,
        author,
        journal,
        affiliation,
        subject,
        openAccess,
        documentType
      } as any);

      return jsonTextResponse(
        `Found ${results.length} Scopus papers.\n\n${JSON.stringify(
          results.map((paper: Paper) => PaperFactory.toDict(paper)),
          null,
          2
        )}`
      );
    }

    case 'search_crossref': {
      const { query, maxResults, year, author, sortBy, sortOrder } = args;
      const results = await searchers.crossref.search(query, {
        maxResults,
        year,
        author,
        sortBy,
        sortOrder
      });

      return jsonTextResponse(
        `Found ${results.length} Crossref papers.\n\n${JSON.stringify(
          results.map((paper: Paper) => PaperFactory.toDict(paper)),
          null,
          2
        )}`
      );
    }

    case 'get_citations': {
      const { doi, forceRefresh } = args;
      const doiResult = sanitizeDoi(doi);
      if (!doiResult.valid) {
        throw new Error(doiResult.error || 'Invalid DOI format');
      }

      const data = await citationService.getCitationDataByDoi(doiResult.sanitized, forceRefresh);

      if (!data) {
        return jsonTextResponse(`No citation data found for DOI: ${doiResult.sanitized}`);
      }

      const summary = {
        paper_id: data.paperId,
        title: data.title,
        citation_count: data.citationCount,
        reference_count: data.referenceCount,
        influential_citation_count: data.influentialCitationCount,
        year: data.year,
        venue: data.venue,
        doi: data.doi,
        url: data.url,
        authors: data.authors?.map(a => a.authorId ? `${a.name} (${a.authorId})` : a.name) ?? []
      };

      return jsonTextResponse(`Citations for ${doiResult.sanitized}:\n\n${JSON.stringify(summary, null, 2)}`);
    }

    case 'get_oa_pdf': {
      const { doi, title, year } = args;
      let location = null;
      if (doi) {
        const doiResult = sanitizeDoi(doi);
        if (!doiResult.valid) throw new Error(doiResult.error || 'Invalid DOI');
        location = await oaSource.findPdfByDoi(doiResult.sanitized);
      } else {
        location = await oaSource.findPdfByTitle(title, year);
      }
      if (!location) {
        return jsonTextResponse(`No open-access PDF found for ${doi || title}. Configure OA_EMAIL and retry; some sources need it.`);
      }
      return jsonTextResponse(`OA PDF found:\n\n${JSON.stringify(location, null, 2)}`);
    }

    case 'get_pdf': {
      const { doi, paperId, platform, savePath } = args;
      const cleanDoi = doi ? (sanitizeDoi(doi).valid ? sanitizeDoi(doi).sanitized : doi) : '';
      let paper: Paper | null = null;
      if (cleanDoi) {
        paper = await findPaperByDoiAcrossPlatforms(searchers, cleanDoi);
      } else if (platform && paperId) {
        const searcher = (searchers as any)[platform];
        if (searcher?.getPaperByDoi && cleanDoi) {
          paper = await searcher.getPaperByDoi(cleanDoi);
        }
      }

      const outcome = await downloadPaperPdf(searchers, paper, cleanDoi || doi || paperId, savePath);
      if (outcome.status === 'downloaded') {
        return jsonTextResponse(`PDF downloaded to: ${outcome.path}`);
      }
      if (outcome.status === 'limit') {
        return jsonTextResponse(`Download throttled: retry after ${Math.ceil((outcome.retryAfterMs || 0) / 1000)}s`);
      }
      if (outcome.hint) {
        return jsonTextResponse(`No legal OA / platform PDF. Host should call the scansci bridge:\n\n${JSON.stringify(outcome.hint, null, 2)}`);
      }
      return jsonTextResponse('Could not obtain PDF for this paper.');
    }

    case 'get_fulltext': {
      const { doi, paperId, platform, pdfPath, maxPages } = args;
      if (!mineru.hasToken) {
        // 降级：有本地 fullText 能力的平台用 readPaper，否则提示配置 token
        let paper: Paper | null = null;
        if (doi) {
          const r = sanitizeDoi(doi);
          if (r.valid) paper = await findPaperByDoiAcrossPlatforms(searchers, r.sanitized);
        } else if (platform && paperId) {
          const searcher = (searchers as any)[platform];
          if (searcher?.getPaperByDoi) paper = await searcher.getPaperByDoi(doi || '');
        }
        const searcher = paper?.source ? (searchers as any)[paper.source] : null;
        if (searcher?.getCapabilities?.()?.fullText) {
          const text = await searcher.readPaper(paper!.paperId || paperId);
          return jsonTextResponse(`degraded_to_text (MINERU_TOKEN not set).\n\n${text}`);
        }
        return jsonTextResponse('MINERU_TOKEN not configured; and no platform full-text available. Set MINERU_TOKEN for PDF→Markdown.');
      }

      let sourcePdf = pdfPath || null;
      if (!sourcePdf) {
        let paper: Paper | null = null;
        const cleanDoi = doi && sanitizeDoi(doi).valid ? sanitizeDoi(doi).sanitized : '';
        if (cleanDoi) paper = await findPaperByDoiAcrossPlatforms(searchers, cleanDoi);
        const outcome = await downloadPaperPdf(searchers, paper, cleanDoi || doi || paperId, undefined);
        if (outcome.status === 'downloaded' && outcome.path) sourcePdf = outcome.path;
        else if (outcome.hint) {
          return jsonTextResponse(`Need PDF first. Host should call scansci bridge:\n\n${JSON.stringify(outcome.hint, null, 2)}`);
        }
      }
      if (!sourcePdf) return jsonTextResponse('Could not obtain a PDF to convert.');

      const result = await mineru.pdfToMarkdown(sourcePdf);
      return jsonTextResponse(
        `Full-text (${result.modelVersion}) cached at ${result.cachePath}:\n\n${result.markdown}`
      );
    }

    case 'get_scansci_status': {
      const probe = bridges.probe();
      return jsonTextResponse(`scansci bridge status:\n\n${JSON.stringify(probe, null, 2)}`);
    }

    case 'get_platform_status': {
      const { validate } = args;
      const rows = await platformRegistry.getStatus(searchers, validate);
      const statusInfo = rows.map((r) => ({
        platform: r.platform,
        status: r.status,
        configured: r.configured,
        ability: r.ability,
        setup_hint: r.setupHint,
        key_env: r.keyEnv
      }));

      let scihubInfo: any = {};
      try {
        const mirrorStatus = searchers.scihub.getMirrorStatus();
        scihubInfo = {
          scihub: {
            mirrorCount: mirrorStatus.length,
            workingMirrors: mirrorStatus.filter((m) => m.status === 'Working').length
          }
        };
      } catch {
        // scihub 镜像状态不可用时忽略
      }

      const download = downloadThrottle.status();
      const missing = missingCredentials();

      const report = {
        channels: statusInfo,
        download_limits: download,
        bridge: bridges.probe(),
        missing_credentials: missing.map((m) => ({ env: m.env, platform: m.platform }))
      };

      return jsonTextResponse(`Platform Status:\n\n${JSON.stringify({ ...report, ...scihubInfo }, null, 2)}`);
    }

    default:
      throw new Error(`Unknown tool: ${toolNameRaw}`);
  }
}
