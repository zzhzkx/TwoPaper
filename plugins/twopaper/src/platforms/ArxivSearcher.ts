/**
 * arXiv API集成模块
 * 基于arXiv API v1.1实现论文搜索和下载功能
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as xml2js from 'xml2js';
import { Paper, PaperFactory } from '../models/Paper.js';
import { PaperSource, SearchOptions, DownloadOptions, PlatformCapabilities } from './PaperSource.js';
import { API_ENDPOINTS, DEFAULT_MAILTO, RATE_LIMITS, SEARCH_LIMITS, TIMEOUTS, USER_AGENT } from '../config/constants.js';
import { logDebug } from '../utils/Logger.js';
import { RateLimiter } from '../utils/RateLimiter.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';
import { RequestCache } from '../utils/RequestCache.js';
import { sanitizeDoi, sanitizeFilename, validateQueryComplexity, escapeQueryValue } from '../utils/SecurityUtils.js';
import { PDFExtractor } from '../utils/PDFExtractor.js';

interface ArxivEntry {
  id: string[];
  title: string[];
  summary: string[];
  author: Array<{ name: string[] }> | { name: string[] };
  published: string[];
  updated: string[];
  'arxiv:primary_category': Array<{ $: { term: string } }>;
  category?: Array<{ $: { term: string } }>;
  link: Array<{
    $: {
      href: string;
      type?: string;
      title?: string;
    };
  }>;
  'arxiv:doi'?: string[];
}

interface ArxivResponse {
  feed: {
    entry?: ArxivEntry | ArxivEntry[];
    'opensearch:totalResults': string[];
  };
}

export class ArxivSearcher extends PaperSource {
  private readonly rateLimiter: RateLimiter;
  private readonly cache: RequestCache<Paper[]>;
  private readonly mailto: string;

  constructor(mailto?: string) {
    super('arxiv', API_ENDPOINTS.ARXIV);
    this.mailto = mailto || process.env.ARXIV_MAILTO || DEFAULT_MAILTO;
    // arXiv rate limit: 1 request per 3 seconds (0.33 req/s)
    this.rateLimiter = new RateLimiter({
      requestsPerSecond: RATE_LIMITS.CONSERVATIVE_RPS,
      burstCapacity: 1
    });
    this.cache = new RequestCache<Paper[]>({
      maxSize: 100,
      ttlMs: 3600000 // 1 hour
    });
  }

  getCapabilities(): PlatformCapabilities {
    return {
      search: true,
      download: true,
      fullText: true,
      citations: false, // arXiv本身不提供被引统计
      requiresApiKey: false,
      supportedOptions: ['maxResults', 'year', 'author', 'category', 'sortBy', 'sortOrder']
    };
  }

  /**
   * 搜索arXiv论文
   */
  async search(query: string, options: SearchOptions = {}): Promise<Paper[]> {
    const customOptions = options as any;
    const forceRefresh = customOptions.forceRefresh === true;

    // Validate query complexity / length to prevent DoS against arXiv
    const validation = validateQueryComplexity(query, {
      maxLength: SEARCH_LIMITS.MAX_QUERY_LENGTH,
      maxBooleanOperators: SEARCH_LIMITS.MAX_BOOLEAN_OPERATORS
    });
    if (!validation.valid) {
      this.errorHandler.handleError(
        Object.assign(new Error(validation.error || 'Invalid query'), { invalidQuery: true }),
        'search'
      );
    }

    // Clamp max results to the shared limit (arXiv single-request cap is 2000)
    const requested = Math.max(1, options.maxResults || SEARCH_LIMITS.DEFAULT_RESULTS);
    const maxResults = Math.min(requested, SEARCH_LIMITS.MAX_RESULTS);

    // Check cache first
    if (!forceRefresh) {
      const cacheKey = this.cache.generateKey('arxiv', query, options);
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const searchQuery = this.buildSearchQuery(query, options);
    const url = `${this.baseUrl}/query`;

    // Map sortOrder: arXiv API requires 'ascending' or 'descending'
    const sortOrderMap: Record<string, string> = {
      'asc': 'ascending',
      'desc': 'descending',
      'ascending': 'ascending',
      'descending': 'descending'
    };

    const sortBy = this.mapSortField(options.sortBy || 'relevance');
    const sortOrder = sortOrderMap[options.sortOrder || 'desc'] || 'descending';

    try {
      // Correct arXiv pagination: fetch in pages of up to maxResults until the
      // requested count is fulfilled or totalResults is exhausted.
      const papers: Paper[] = [];
      let totalResults: number | undefined;

      const pageSize = Math.min(maxResults, SEARCH_LIMITS.MAX_RESULTS);
      for (let start = 0; papers.length < maxResults; start += pageSize) {
        if (totalResults !== undefined && start >= totalResults) {
          break;
        }

        const params = {
          search_query: searchQuery,
          start,
          max_results: Math.max(1, Math.min(pageSize, maxResults - papers.length)),
          sortBy,
          sortOrder
        };

        logDebug(`arXiv API Request: GET ${url}`);
        logDebug('arXiv Request params:', params);

        await this.rateLimiter.waitForPermission();

        const response = await ErrorHandler.retryWithBackoff(
          () => axios.get(url, {
            params,
            timeout: TIMEOUTS.DEFAULT,
            headers: { 'User-Agent': `${USER_AGENT} paper-search-mcp-nodejs (mailto:${this.mailto})` }
          }),
          { context: 'arXiv search' }
        );

        logDebug(`arXiv API Response: ${response.status} ${response.statusText}, Data length: ${response.data?.length || 0}`);

        const parsed = await this.parseSearchResponse(response.data);

        // Total results are only reported on the first page
        if (totalResults === undefined) {
          totalResults = this.extractTotalResults(response.data);
        }

        papers.push(...parsed);

        if (parsed.length === 0) {
          break;
        }
      }

      logDebug(`arXiv Parsed ${papers.length} papers`);

      // Cache results
      const cacheKey = this.cache.generateKey('arxiv', query, options);
      this.cache.set(cacheKey, papers);

      return papers;
    } catch (error: any) {
      logDebug('arXiv Search Error:', error.message);
      this.errorHandler.handleError(error, 'search');
    }
  }

  /**
   * 根据 DOI 获取论文信息。
   * arXiv 不提供 DOI 专用端点,但 DOI 查询必须先校验,且网络错误不能伪装成 null。
   */
  async getPaperByDoi(doi: string): Promise<Paper | null> {
    const validation = sanitizeDoi(doi);
    if (!validation.valid) {
      return null;
    }

    try {
      const arxivDoiMatch = validation.sanitized.match(/^10\.48550\/arxiv\.(.+)$/i);
      const query = arxivDoiMatch?.[1] || validation.sanitized;
      const results = await this.search(query, { maxResults: 1 });
      return results[0] || null;
    } catch (error: any) {
      if (error?.response?.status === 404 || error?.status === 404) {
        return null;
      }
      this.errorHandler.handleError(error, 'getPaperByDoi');
    }
  }

  /**
   * 下载PDF文件
   */
  async downloadPdf(paperId: string, options: DownloadOptions = {}): Promise<string> {
    try {
      const savePath = options.savePath || './downloads';
      const pdfUrl = `${API_ENDPOINTS.ARXIV.replace('/api', '')}/pdf/${encodeURIComponent(paperId)}.pdf`;
      
      // 确保保存目录存在
      if (!fs.existsSync(savePath)) {
        fs.mkdirSync(savePath, { recursive: true });
      }

      const filename = `${sanitizeFilename(paperId)}.pdf`;
      const filePath = path.join(savePath, filename);

      // 检查文件是否已存在
      if (fs.existsSync(filePath) && !options.overwrite) {
        return filePath;
      }

      await this.rateLimiter.waitForPermission();

      const response = await ErrorHandler.retryWithBackoff(
        () => axios.get(pdfUrl, {
          responseType: 'stream',
          timeout: TIMEOUTS.DOWNLOAD,
          headers: { 'User-Agent': `${USER_AGENT} paper-search-mcp-nodejs (mailto:${this.mailto})` }
        }),
        { context: 'arXiv download' }
      );

      // arXiv returns a 404 HTML page (not a streamed 200) for missing papers.
      // Treat non-2xx as a retryable/HTTP failure instead of writing the page.
      if (response.status < 200 || response.status >= 300) {
        response.data?.destroy?.();
        const httpError: any = new Error(`arXiv download returned HTTP ${response.status}`);
        httpError.response = { status: response.status, statusText: response.statusText };
        throw httpError;
      }

      const tempFilePath = `${filePath}.part`;
      try {
        await this.writeStreamToFile(response.data, tempFilePath);
        fs.renameSync(tempFilePath, filePath);
      } catch (error) {
        try {
          fs.unlinkSync(tempFilePath);
        } catch {
          // 临时文件可能尚未创建,忽略
        }
        throw error;
      }

      return filePath;
    } catch (error: any) {
      // Filesystem/stream failures are not HTTP errors — let a generic
      // ApiError carry them rather than misreporting an HTTP status code.
      this.errorHandler.handleError(error, 'download PDF');
    }
  }

  /**
   * 将(可能为 PDF 或压缩的)字节流完整写入文件。
   * 断流/写入失败时清理残留的半截文件,避免留下损坏的 PDF。
   */
  private writeStreamToFile(stream: any, filePath: string): Promise<void> {
    const writer = fs.createWriteStream(filePath);

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        stream.destroy?.();
        writer.destroy();
        try {
          fs.unlinkSync(filePath); // 移除半截文件
        } catch {
          // 文件可能未创建,忽略
        }
      };

      writer.on('finish', () => resolve());
      writer.on('error', (err) => {
        cleanup();
        reject(new Error(`Failed to write PDF to ${filePath}: ${err?.message || 'unknown write error'}`));
      });
      stream.on('error', (err: Error) => {
        cleanup();
        reject(new Error(`PDF stream interrupted: ${err?.message || 'unknown stream error'}`));
      });

      stream.pipe(writer);
    });
  }

  /**
   * 读取论文全文内容（从PDF中提取）
   */
  async readPaper(paperId: string, options: DownloadOptions = {}): Promise<string> {
    try {
      const safeId = sanitizeFilename(paperId);
      const savePath = options.savePath || './downloads';
      const filePath = path.join(savePath, `${safeId}.pdf`);

      // 如果PDF不存在，先下载
      if (!fs.existsSync(filePath)) {
        await this.downloadPdf(paperId, options);
      }

      // 提取PDF全文
      const extractor = new PDFExtractor();
      const result = await extractor.extractFromFile(filePath);
      return result.text || 'No text extracted from the PDF.';
    } catch (error) {
      // Extraction/IO failures are not HTTP errors — use generic error handling
      this.errorHandler.handleError(error, 'read paper');
    }
  }

  /**
   * 构建搜索查询
   */
  private buildSearchQuery(query: string, options: SearchOptions): string {
    // Escape the query so user input cannot inject additional arXiv field
    // filters (e.g. `cat:cs.AI OR all:foo`) or break the search syntax.
    let searchQuery = `all:${escapeQueryValue(query)}`;

    // 添加作者过滤
    if (options.author) {
      searchQuery += ` AND au:"${escapeQueryValue(options.author)}"`;
    }

    // 添加分类过滤
    if (options.category) {
      searchQuery += ` AND cat:${options.category}`;
    }

    // 添加年份过滤（arXiv使用日期范围）
    if (options.year) {
      const year = options.year;
      if (year.includes('-')) {
        // 年份范围
        const [startYear, endYear] = year.split('-');
        if (startYear) {
          searchQuery += ` AND submittedDate:[${startYear}0101 TO `;
          searchQuery += endYear ? `${endYear}1231]` : '*]';
        }
      } else {
        // 单一年份
        searchQuery += ` AND submittedDate:[${year}0101 TO ${year}1231]`;
      }
    }

    return searchQuery;
  }

  /**
   * 映射排序字段
   */
  private mapSortField(sortBy: string): string {
    // arXiv only supports relevance / submittedDate / lastUpdatedDate.
    // There is no citation-based sort; silently substituting submittedDate
    // for 'citations' would mislead callers into thinking results are ranked
    // by citations, so fall back to the relevance default instead.
    const fieldMap: Record<string, string> = {
      'relevance': 'relevance',
      'date': 'submittedDate'
    };
    return fieldMap[sortBy] || 'relevance';
  }

  /**
   * 从响应中提取总结果数
   */
  private extractTotalResults(xmlData: string): number {
    try {
      // 轻量正则提取 <opensearch:totalResults>N</opensearch:totalResults>
      const match = /<opensearch:totalResults[^>]*>\s*(\d+)\s*<\/opensearch:totalResults>/i.exec(xmlData);
      if (match && match[1]) {
        return parseInt(match[1], 10);
      }
    } catch {
      // 忽略提取失败，交由分页循环按返回条数自行判断
    }
    return 0;
  }

  /**
   * 解析搜索响应
   */
  private async parseSearchResponse(xmlData: string): Promise<Paper[]> {
    try {
      const parser = new xml2js.Parser();
      const result: ArxivResponse = await parser.parseStringPromise(xmlData);

      if (!result.feed.entry) {
        return [];
      }

      const entries = Array.isArray(result.feed.entry) 
        ? result.feed.entry 
        : [result.feed.entry];

      return entries.map(entry => this.parseArxivEntry(entry));
    } catch (error) {
      // A response that cannot be parsed as arXiv XML is a real failure, not
      // "no results". Surface it so callers can distinguish an empty result
      // set (feed with no <entry>) from a broken/incomplete response.
      const err: any = error;
      logDebug('Error parsing arXiv response:', err);
      throw new Error(`Failed to parse arXiv response: ${err?.message || 'unknown parse error'}`);
    }
  }

  /**
   * 解析单个arXiv条目
   */
  private parseArxivEntry(entry: ArxivEntry): Paper {
    try {
      // 提取论文ID
      const arxivUrl = entry.id[0];
      const paperId = arxivUrl.split('/').pop()?.replace('abs/', '') || '';

      // 提取标题
      const title = entry.title[0];

      // 提取作者
      const authorData = entry.author;
      const authors = Array.isArray(authorData) 
        ? authorData.map(a => a.name[0])
        : [authorData.name[0]];

      // 提取摘要
      const abstract = entry.summary[0];

      // 提取日期
      const publishedDate = this.parseDate(entry.published[0]);
      const updatedDate = this.parseDate(entry.updated[0]);

      // 提取DOI
      const doi = entry['arxiv:doi']?.[0] || '';

      // 提取分类
      const primaryCategory = entry['arxiv:primary_category']?.[0]?.$?.term || '';
      const categories = entry.category?.map(cat => cat.$.term) || [primaryCategory];

      // 提取链接
      const pdfLink = entry.link.find(link => link.$.type === 'application/pdf');
      const pdfUrl = pdfLink?.$.href || `https://arxiv.org/pdf/${paperId}.pdf`;

      // 提取年份
      const year = publishedDate?.getFullYear();

      return PaperFactory.create({
        paperId: paperId,
        title: this.cleanText(title),
        authors: authors,
        abstract: this.cleanText(abstract),
        doi: doi,
        publishedDate: publishedDate,
        pdfUrl: pdfUrl,
        url: `https://arxiv.org/abs/${paperId}`,
        source: 'arxiv',
        updatedDate: updatedDate || undefined,
        categories: categories,
        keywords: [], // arXiv通常不提供关键词
        citationCount: 0, // arXiv本身不提供被引统计
        year: year,
        extra: {
          primaryCategory: primaryCategory,
          arxivId: paperId
        }
      });
    } catch (error: any) {
      logDebug('Error parsing arXiv entry:', error);
      throw new Error(`Failed to parse arXiv entry: ${error?.message || 'unknown parse error'}`);
    }
  }
}