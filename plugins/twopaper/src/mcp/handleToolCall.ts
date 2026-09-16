import * as path from 'path';
import * as fs from 'fs';
import type { Searchers } from './searchers.js';
import { selectSearchable } from './searchers.js';
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
import { collectCredentials, missingCredentials, writeCredentials, WRITABLE_ENV_KEYS } from '../services/config/credentials.js';
import { PDFExtractor } from '../utils/PDFExtractor.js';
import { sanitizeDownloadPath, sanitizeDoi, withTimeout } from '../utils/SecurityUtils.js';
import { resolveOutputRoot } from '../utils/paths.js';
import { TIMEOUTS } from '../config/constants.js';
import { mapLimit } from '../utils/mapLimit.js';
import { logDebug } from '../utils/Logger.js';

// 这些客户端在**构造时**读取 env（MINERU_TOKEN / DOWNLOAD_PER_* / SCANSCI_CMD / MINERU_OUTPUT_DIR …）。
// 若在模块加载期就 new，会早于 server.ts 的 loadEnv()（ES import 提升先执行被导入模块），
// 于是读到空值并被永久缓存 —— 表现为「.env 明明配好了却报 not configured / 限流不生效」。
// 故改为首次调用 handleToolCall 时才惰性构造，确保 loadEnv() 一定已跑完。
let citationService!: CitationService;
let oaSource!: OASource;
let bridges!: BridgesClient;
let mineru!: MinerUClient;
let downloadThrottle!: DownloadThrottle;
let paperNamer!: PaperNamer;
let platformRegistry!: PlatformRegistry;
let pdfExtractor!: PDFExtractor;

let clientsReady = false;
function initClients(): void {
  if (clientsReady) return;
  citationService = new CitationService();
  oaSource = new OASource();
  bridges = new BridgesClient();
  mineru = new MinerUClient();
  downloadThrottle = new DownloadThrottle();
  paperNamer = new PaperNamer();
  platformRegistry = new PlatformRegistry();
  pdfExtractor = new PDFExtractor();
  clientsReady = true;
}

/** 跨平台 DOI 查找时，单平台元数据查询的封顶时间（避免一个慢平台吃掉整次调用的预算）。 */
const DOI_PLATFORM_TIMEOUT = 8000;

/**
 * 跨平台按 DOI 定位第一篇论文（为下载命名/全文获取提供元数据）。
 *
 * 我们只需要**任意一个**平台给出元数据，因此采用"首个命中即返回"：
 * 早期实现 await Promise.all(...)，必须等全部平台 settle，墙钟 = 最慢平台（曾实测 28s，几乎全是 GS 反爬）；
 * 改为竞速后，墙钟 ≈ 最快可用平台。单平台仍各自限时，避免个别慢渠道拖尾。
 */
async function findPaperByDoiAcrossPlatforms(searchers: Searchers, doi: string): Promise<Paper | null> {
  const { default: pLimit } = await import('p-limit');
  const limit = pLimit(4);

  return new Promise<Paper | null>((resolve) => {
    let pending = 0;
    let settled = false;
    const done = (paper: Paper | null) => {
      if (settled) return;
      if (paper) {
        settled = true;
        resolve(paper); // 首个命中 → 立即返回，放弃其余结果
      } else if (--pending === 0) {
        settled = true;
        resolve(null); // 全部落空
      }
    };

    const entries = selectSearchable(searchers, { exclude: ['scihub'] });
    pending = entries.length;
    if (pending === 0) return resolve(null);

    for (const [, searcher] of entries) {
      limit(async () => {
        try {
          // 单平台限时：getPaperByDoi 默认走 search()，内含 30s 超时 × 重试梯子，
          // 单个慢平台足以吃掉整个预算；这里按平台各自封顶。
          const paper = await withTimeout(
            (searcher as PaperSource).getPaperByDoi(doi),
            DOI_PLATFORM_TIMEOUT,
            'platform DOI lookup timed out'
          );
          done(paper);
        } catch {
          done(null); // 平台级隔离：单个平台失败/超时不阻断
        }
      }).catch(() => done(null));
    }

    // 总体兜底：即使所有平台都卡住，也必须在预算内返回，绝不无限等待。
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, DOI_OVERALL_TIMEOUT);
    timer.unref?.();
  });
}

/** 跨平台 DOI 查找的整体预算上限（首个命中即返回，故通常远快于此）。 */
const DOI_OVERALL_TIMEOUT = 15000;

interface DownloadOutcome {
  status: 'downloaded' | 'existed' | 'miss' | 'limit';
  path?: string;
  hint?: ReturnType<BridgesClient['hint']>;
  retryAfterMs?: number;
}

/**
 * 已知 platform+paperId 时补齐元数据（作者/年份/标题），使 PaperNamer 能产出
 * `作者_年份_短标题_哈希.pdf`，而不是退化成 `Unknown_paper_<hash>.pdf`。
 * 优先用该平台自己的 getPaperByDoi（对 arXiv 类 DOI 实测约 1s）；失败则回退 stub，不阻断下载。
 */
async function resolvePaperStub(searchers: Searchers, platform: string, paperId: string): Promise<Paper> {
  const stub = { paperId, source: platform } as unknown as Paper;
  const searcher = (searchers as any)[platform];
  if (!searcher) return stub;
  try {
    // 先按 DOI 查（对 10.48550/arXiv.x 这类有效）；裸平台 ID（如 2012.14096）不是 DOI，
    // 会被 getPaperByDoi 的校验挡下，再退回该平台自己的 search(paperId)。
    let meta: Paper | null = null;
    if (searcher.getPaperByDoi) {
      meta = await withTimeout(
        searcher.getPaperByDoi(paperId),
        TIMEOUTS.HEALTH_CHECK,
        `${platform} metadata lookup timed out`
      );
    }
    if (!meta && typeof searcher.search === 'function') {
      meta = await withTimeout(
        searcher.search(paperId, { maxResults: 1 }).then((r: Paper[]) => r?.[0] || null),
        TIMEOUTS.HEALTH_CHECK,
        `${platform} metadata search timed out`
      );
    }
    return meta ? ({ ...meta, paperId, source: platform } as Paper) : stub;
  } catch (e: any) {
    logDebug(`resolvePaperStub(${platform}/${paperId}) failed, using stub:`, e?.message);
    return stub;
  }
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
  // PaperNamer.resolveTargetPath 返回**文件全路径**（.../Author/Author_Year_Title_hash.pdf）。
  // OA 分支直接写该文件；平台 downloadPdf 则把 savePath 当**目录**、自己再拼文件名，
  // 因此两条分支必须分别传文件路径与目录，否则会产出 "名字以 .pdf 结尾的目录"。
  const target = savePathOverride
    ? sanitizeDownloadPath(savePathOverride, process.env.DEFAULT_DOWNLOAD_PATH || resolveOutputRoot()).sanitized
    : paperNamer.resolveTargetPath(meta).sanitized;
  const targetDir = savePathOverride ? target : path.dirname(target);

  // 1. 合法 OA 直链
  let url: string | null = paper?.pdfUrl || null;
  if (!url) {
    // 整体限时：三个 OA 源各带限流等待与重试，无界时单次可拖到分钟级。
    const oaLoc = await withTimeout(
      oaSource.findPdfByDoi(cleanDoi).catch((e: Error) => {
        logDebug(`OA lookup failed for ${cleanDoi}:`, e?.message);
        return null;
      }),
      TIMEOUTS.DEFAULT,
      'OA lookup timed out'
    );
    url = oaLoc?.url || null;
  }
  if (url) {
    try {
      downloadThrottle.acquire();
    } catch (e) {
      if (e instanceof DownloadLimitError) return { status: 'limit', retryAfterMs: e.retryAfterMs };
      throw e;
    }
    const filePath = await pdfExtractor.downloadPdf(url, target).catch((e) => {
      downloadThrottle.release(); // 失败不占用配额
      throw e;
    });
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
      const filePath = await searcher
        .downloadPdf(paper.paperId || cleanDoi, { savePath: targetDir })
        .catch((e: Error) => {
          downloadThrottle.release(); // 失败不占用配额
          throw e;
        });
      return { status: 'downloaded', path: filePath };
    }
  }

  // 3. 未命中 → 桥接指令块（hint）
  return { status: 'miss', hint: bridges.hint(cleanDoi) };
}

/** 裸名判定：arXiv 纯 id（1706.03762）或元数据缺失时的 Unknown_* 回退名，均视为"未命名好"。 */
export function isBareName(pdfPath: string): boolean {
  const base = path.basename(pdfPath).replace(/\.pdf$/i, '');
  if (/^\d{4}\.\d{4,5}(v\d+)?$/.test(base)) return true; // arXiv id
  if (/^Unknown(_|$)/i.test(base)) return true;           // PaperNamer 回退名
  return false;
}

/**
 * 从 MinerU 产出的 Markdown 里启发式解析论文元数据（不引入新依赖）。
 * 结构通常是：可选的期刊抬头 → `# 标题` → 作者行（一人一行或逗号列表）→ 机构行 → …
 *
 * 注意作者行没有统一格式：
 *   - 多作者一人一行、带 <sup>†</sup> 上标与邮箱（如 arXiv 版式）
 *   - 单行逗号分隔（如 PLOS 版式）
 * 故按 "截断到首个 HTML 标签 / 邮箱 → 取逗号前第一人 → 去掉尾部标记" 抽取。
 */
export function parseMetadataFromMarkdown(md: string): { title?: string; author?: string; year?: string } {
  const lines = md.split(/\r?\n/).map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim() !== '');

  const h1 = lines.find((l) => /^#\s+\S/.test(l));
  let title = h1 ? h1.replace(/^#\s+/, '').trim() : '';
  if (!title) {
    // 无 H1 时退回第一段"像标题"的正文行
    title = lines.find(
      (l) => !/^!\[/.test(l) && !/^[A-Z\s]{6,}$/.test(l) && l.length > 12 && l.length < 200 && !/[.!?]$/.test(l)
    ) || '';
  }

  // 作者：标题之后的第一个"像人名"的行（跳过机构行），再抽取第一作者
  let author = '';
  const startIdx = h1 ? lines.indexOf(h1) + 1 : 0;
  for (let i = startIdx; i < Math.min(startIdx + 8, lines.length); i++) {
    const l = lines[i];
    if (/^[#!|>]/.test(l) || /^https?:/i.test(l)) continue;
    if (/universit|institut|department|school|laborator|college|academy|research\s+group|\binc\b|\bltd\b/i.test(l)) continue;
    const name = extractFirstAuthor(l);
    if (name && /\s/.test(name) && /[A-Za-zÀ-ɏ]/.test(name)) { author = name; break; }
  }

  // 年份只在**摘要之前**的头部找（摘要正文里的 "WMT 2014" 之类会误导），优先带 citation/doi/© 的行
  const absIdx = lines.findIndex((l) => /^#{1,6}\s*abstract\b/i.test(l) || /^abstract\b/i.test(l));
  const head = lines.slice(0, absIdx > 0 ? absIdx : 20);
  const citeLine = head.find((l) => /citation|doi:|©|\(19\d{2}\)|\(20\d{2}\)/i.test(l));
  const ym = /\b(19|20)\d{2}\b/.exec(citeLine || head.join('\n'));
  const year = ym ? ym[0] : '';

  return { title: title || undefined, author: author || undefined, year: year || undefined };
}

/** 从一行里抽取第一作者姓名：截断到首个 HTML 标签/邮箱，取逗号前第一人，再去掉尾部符号与数字标记。 */
function extractFirstAuthor(line: string): string {
  let s = line;
  const tag = s.indexOf('<');
  if (tag >= 0) s = s.slice(0, tag);            // <sup>†</sup> 之后通常是机构，舍去
  const at = s.search(/[A-Za-z0-9._%+-]+@/);    // 邮箱前的内容才是人名
  if (at >= 0) s = s.slice(0, at);
  s = s.split(/[,;]/)[0];                        // 逗号/分号列表取第一人
  return s.replace(/[\s*†‡§¶#\d.]+$/g, '').trim();
}

/**
 * 若 PDF 是裸名，则用 Markdown 解析出的元数据把它和 Markdown 一起重命名为「作者_年份_标题_哈希」。
 * 目标已存在（同篇论文已下载过）时跳过，不覆盖。失败静默——重命名是锦上添花，不应阻塞返回。
 */
function tryRenameFromMarkdown(
  namer: PaperNamer,
  pdfPath: string,
  mdPath: string,
  markdown: string
): { renamed: boolean; pdfPath: string; mdPath: string } {
  const fallback = { renamed: false, pdfPath, mdPath };
  try {
    if (!isBareName(pdfPath)) return fallback;
    const meta = parseMetadataFromMarkdown(markdown);
    if (!meta.title) return fallback;

    const { sanitized } = namer.resolveTargetPath(meta);
    if (!sanitized || sanitized === pdfPath) return fallback;

    const newPdf = sanitized;
    const newMd = newPdf.replace(/\.pdf$/i, '.md');
    if (fs.existsSync(newPdf) || (newMd !== mdPath && fs.existsSync(newMd))) return fallback;

    fs.renameSync(pdfPath, newPdf);
    if (fs.existsSync(mdPath)) fs.renameSync(mdPath, newMd);
    return { renamed: true, pdfPath: newPdf, mdPath: newMd };
  } catch (e: any) {
    logDebug('rename-from-markdown failed:', e?.message);
    return fallback;
  }
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
  initClients(); // 惰性构造，确保在 loadEnv() 之后才读取各客户端所需的 env

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
      const pathResult = sanitizeDownloadPath(savePath, resolveOutputRoot());
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
        const { default: pLimit } = await import('p-limit');
        const limit = pLimit(4);
        const hits = await withTimeout(
          Promise.all(
            selectSearchable(searchers, { exclude: ['scihub'] }).map(([platformName, searcher]) =>
              limit(async () => {
                try {
                  // 本分支要收集**所有**平台的结果，故不竞速；但单平台需各自封顶，
                  // 否则一个慢渠道就会吃掉整个 30s 预算（arXiv 抖动时实测可达 80s）。
                  const paper = await withTimeout(
                    (searcher as PaperSource).getPaperByDoi(cleanDoi),
                    DOI_PLATFORM_TIMEOUT,
                    `${platformName} DOI lookup timed out`
                  );
                  return paper ? PaperFactory.toDict(paper) : null;
                } catch (error) {
                  logDebug(`Error getting paper by DOI from ${platformName}:`, error);
                  return null;
                }
              })
            )
          ),
          TIMEOUTS.DEFAULT,
          'Cross-platform DOI lookup timed out'
        );
        for (const hit of hits) if (hit) results.push(hit);
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
      const pathResult = sanitizeDownloadPath(savePath, resolveOutputRoot());
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
      const probed = searchers.scihub.hasChecked();
      const mirrorStatus = searchers.scihub.getMirrorStatus();
      const working = mirrorStatus.filter((m) => m.status === 'Working').length;
      const note = probed
        ? `Probed: ${working}/${mirrorStatus.length} working.`
        : `Not probed yet — statuses are "Unverified" (the mirror list defaults to all-up without a network check). ` +
          `Call again with { "forceCheck": true } to run a real health check (~30–60s for 11 mirrors); ` +
          `results are then cached for 5 minutes.`;
      return jsonTextResponse(
        `Sci-Hub Mirror Status (probed: ${probed}):\n\n${note}\n\n${JSON.stringify(mirrorStatus, null, 2)}`
      );
    }

    case 'search_sciencedirect': {
      const { query, maxResults, year, author, journal, openAccess } = args;
      if (!process.env.ELSEVIER_API_KEY) {
        throw new Error('Elsevier API key not configured. Please set ELSEVIER_API_KEY environment variable.');
      }
      let results;
      try {
        results = await searchers.sciencedirect.search(query, {
          maxResults,
          year,
          author,
          journal,
          openAccess
        });
      } catch (e: any) {
        // 401 多半不是"key 没配"（能配 Scopus 的同款 key 本身就有效），而是该 key 未订阅 ScienceDirect 产品。
        // 原样抛出会被误读为 unconfigured，用户会去反复检查已正确的 key。
        if (/\b401\b|invalid or missing api key|unauthor/i.test(e?.message || '')) {
          throw new Error(
            'ScienceDirect rejected the request (HTTP 401). ELSEVIER_API_KEY is set, and the same key works ' +
              'for Scopus — so this is almost certainly a missing ScienceDirect product entitlement, not a bad key. ' +
              'Check your subscription at https://dev.elsevier.com/apikey/manage'
          );
        }
        throw e;
      }

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
        // paperId 路径：先补齐元数据（命名质量），再交 downloadPaperPdf 走平台下载。
        paper = await resolvePaperStub(searchers, platform, paperId);
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
      const cleanDoi = doi && sanitizeDoi(doi).valid ? sanitizeDoi(doi).sanitized : '';
      let paper: Paper | null = null;
      if (cleanDoi) {
        paper = await findPaperByDoiAcrossPlatforms(searchers, cleanDoi);
      } else if (platform && paperId) {
        paper = await resolvePaperStub(searchers, platform, paperId);
      }

      if (!mineru.hasToken) {
        // 降级：有本地 fullText 能力的平台用 readPaper，否则提示配置 token
        const searcher = paper?.source ? (searchers as any)[paper.source] : null;
        if (searcher?.getCapabilities?.()?.fullText) {
          const text = await searcher.readPaper(paper!.paperId || paperId);
          return jsonTextResponse(`degraded_to_text (MINERU_TOKEN not set).\n\n${text}`);
        }
        return jsonTextResponse('MINERU_TOKEN not configured; and no platform full-text available. Set MINERU_TOKEN for PDF→Markdown.');
      }

      let sourcePdf = pdfPath || null;
      if (!sourcePdf) {
        const outcome = await downloadPaperPdf(searchers, paper, cleanDoi || doi || paperId || '', undefined);
        if (outcome.status === 'downloaded' && outcome.path) sourcePdf = outcome.path;
        else if (outcome.hint) {
          return jsonTextResponse(`Need PDF first. Host should call scansci bridge:\n\n${JSON.stringify(outcome.hint, null, 2)}`);
        }
      }
      if (!sourcePdf) return jsonTextResponse('Could not obtain a PDF to convert.');

      const result = await mineru.pdfToMarkdown(sourcePdf);

      // 若 PDF 只是裸名/Unknown（下载时没抓到元数据），用 MinerU 解析出的正文/标题回填重命名，
      // 让 PDF 与 Markdown 都换成「作者_年份_标题_哈希」的可读名。失败不阻塞返回。
      const renamed = tryRenameFromMarkdown(paperNamer, sourcePdf, result.cachePath, result.markdown);

      const imgNote = result.imageCount
        ? `\nImages (${result.imageCount}) → ${result.imagesDir}`
        : '';
      const lines = [`Full-text (${result.modelVersion}) cached at ${renamed.mdPath || result.cachePath}${imgNote}`];
      if (renamed.renamed) {
        lines.push(`PDF renamed → ${renamed.pdfPath}`);
      }
      return jsonTextResponse(`${lines.join('\n')}:\n\n${result.markdown}`);
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

    case 'twopaper_setup': {
      const provided = args.credentials as Record<string, string> | undefined;

      // 无参数：返回引导清单（含申请地址），供宿主 Agent 提示用户
      if (!provided || Object.keys(provided).length === 0) {
        const entries = collectCredentials();
        const missingRequired = entries.filter((e) => e.required && !e.configured);

        const checklist = entries.map((e) => ({
          env: e.env,
          platform: e.platform,
          required: e.required,
          configured: e.configured,
          unlocks: e.unlocks,
          signup: e.signup
        }));

        const guidance = [
          'TwoPaper 凭证配置',
          '',
          `已配置 ${entries.filter((e) => e.configured).length}/${entries.length} 项。` +
            (missingRequired.length
              ? `仍缺 ${missingRequired.length} 项必需凭证：${missingRequired.map((e) => e.env).join(', ')}`
              : '必需凭证已齐备。'),
          '',
          '把值传回本工具的 credentials 参数即可写入插件 .env，例如：',
          '  twopaper_setup({ credentials: { "WOS_API_KEY": "xxx", "OA_EMAIL": "me@x.com" } })',
          '',
          '写入后需重启 Claude Code 会话，宿主才会把新值注入 MCP 进程。',
          '想改用宿主级配置（~/.claude/settings.json 的 env 块）亦可，其优先级高于 .env。',
          '',
          JSON.stringify(checklist, null, 2)
        ].join('\n');

        return jsonTextResponse(guidance);
      }

      // 带参数：写入 .env
      const { written, envPath } = writeCredentials(provided);
      const ignored = Object.keys(provided).filter((k) => !WRITABLE_ENV_KEYS.has(k));

      const lines = [
        written.length
          ? `已写入 ${written.length} 项凭证：${written.join(', ')}`
          : '未写入任何凭证。',
        `位置：${envPath}`
      ];
      if (ignored.length) {
        lines.push(`已忽略（不在白名单内）：${ignored.join(', ')}`);
      }
      if (written.length) {
        lines.push('');
        lines.push('重启 Claude Code 会话后生效（宿主需重新注入 MCP 进程 env）。');
        lines.push('可用 get_platform_status 复查各渠道状态。');
      }

      return jsonTextResponse(lines.join('\n'));
    }

    default:
      throw new Error(`Unknown tool: ${toolNameRaw}`);
  }
}
