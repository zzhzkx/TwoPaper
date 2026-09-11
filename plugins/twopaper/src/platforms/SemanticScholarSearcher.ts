/**
 * Semantic Scholar API集成模块
 * 支持免费API和付费API密钥
 *
 * 稳定性要点:
 *  - 通过 ErrorHandler.retryWithBackoff 对 429/5xx 真正退避重试(axios 默认对
 *    >=400 抛错,不再用 validateStatus<500 把限流伪装成成功)。
 *  - search 按 Graph API 的 next 偏移量翻页取满 maxResults。
 *  - getPaperDetails 走 detailsCache 缓存并校验 paperId;404 视为"无结果"返回 null,
 *    其余网络/限流错误向上抛。
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { Paper, PaperFactory } from '../models/Paper.js';
import { PaperSource, SearchOptions, DownloadOptions, PlatformCapabilities } from './PaperSource.js';
import { RateLimiter } from '../utils/RateLimiter.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';
import { RequestCache } from '../utils/RequestCache.js';
import { sanitizeDoi, sanitizeFilename, validateQueryComplexity, escapeQueryValue } from '../utils/SecurityUtils.js';
import { PDFExtractor } from '../utils/PDFExtractor.js';
import { API_ENDPOINTS, SEARCH_LIMITS, TIMEOUTS, USER_AGENT } from '../config/constants.js';
import { logDebug } from '../utils/Logger.js';

interface SemanticSearchOptions extends SearchOptions {
  /** 发表年份范围 */
  year?: string; // 格式: "2019" 或 "2016-2020" 或 "2010-" 或 "-2015"
  /** 研究领域过滤 (S2 已弃用 fieldsOfStudy,改用 s2FieldsOfStudy) */
  fieldsOfStudy?: string[];
}

interface SemanticSearchResponse {
  total: number;
  offset: number;
  next?: number;
  data: SemanticPaper[];
}

interface SemanticPaper {
  paperId: string;
  title: string;
  abstract?: string;
  venue?: string;
  year?: number;
  referenceCount?: number;
  citationCount?: number;
  influentialCitationCount?: number;
  isOpenAccess?: boolean;
  openAccessPdf?: {
    url?: string;
    status?: string;
    disclaimer?: string;
  };
  fieldsOfStudy?: string[];
  s2FieldsOfStudy?: Array<{
    category: string;
    source: string;
  }>;
  publicationTypes?: string[];
  publicationDate?: string;
  journal?: {
    name?: string;
    pages?: string;
    volume?: string;
  };
  authors?: Array<{
    authorId: string;
    name: string;
  }>;
  externalIds?: {
    DOI?: string;
    ArXiv?: string;
    PubMed?: string;
    MAG?: string;
    ACL?: string;
    DBLP?: string;
  };
  url?: string;
}

export class SemanticScholarSearcher extends PaperSource {
  private readonly rateLimiter: RateLimiter;
  private readonly cache: RequestCache<Paper[]>;
  private readonly detailsCache: RequestCache<Paper>;
  private readonly baseApiUrl: string;

  constructor(apiKey?: string) {
    super('semantic', API_ENDPOINTS.SEMANTIC_SCHOLAR, apiKey);
    this.baseApiUrl = this.baseUrl;

    // Semantic Scholar 官方文档：API key 的 introductory limit 为 1 RPS；
    // 未认证流量没有固定公开额度，采用更保守的 0.2 RPS。
    const requestsPerSecond = apiKey ? 1 : 0.2;
    this.rateLimiter = new RateLimiter({
      requestsPerSecond,
      burstCapacity: 1,
      debug: process.env.NODE_ENV === 'development'
    });

    this.cache = new RequestCache<Paper[]>({
      maxSize: 100,
      ttlMs: 3600000 // 1 hour
    });

    this.detailsCache = new RequestCache<Paper>({
      maxSize: 100,
      ttlMs: 3600000 // 1 hour
    });
  }

  /** S2 Graph API 需要的字段集(search 与 details 共用) */
  private static readonly API_FIELDS = [
    'paperId', 'title', 'abstract', 'venue', 'year',
    'referenceCount', 'citationCount', 'influentialCitationCount',
    'isOpenAccess', 'openAccessPdf', 'fieldsOfStudy', 's2FieldsOfStudy',
    'publicationTypes', 'publicationDate', 'journal', 'authors',
    'externalIds', 'url'
  ].join(',');

  /** S2 Graph API 单次翻页最大 limit */
  private static readonly PAGE_LIMIT = 100;

  /**
   * 带退避的请求封装。
   * 对 429 严格按服务端 Retry-After 头退避重试(免费层共享 IP 常被限流,
   * 仅用指数退避会连续 429);其余可重试错误用指数退避。耗尽后抛错。
   */
  private async requestWithRetryBackoff<T>(fn: () => Promise<T>, context: string): Promise<T> {
    const maxRetries = 3;
    let lastError: any;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        if (attempt >= maxRetries || !ErrorHandler.isRetryable(error)) {
          throw error;
        }

        // 429 优先尊重服务端 Retry-After(秒或 HTTP-date),避免盲目重复请求。
        const retryAfter = error?.response?.headers?.['retry-after'];
        let delay: number;
        if (retryAfter) {
          const seconds = Number(retryAfter);
          delay = Number.isFinite(seconds)
            ? Math.max(0, seconds * 1000)
            : Math.max(0, Date.parse(retryAfter) - Date.now());
        } else {
          delay = Math.min(30000, 1000 * Math.pow(2, attempt));
        }
        logDebug(`[Retry] ${context} attempt ${attempt + 1}/${maxRetries} retrying in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  /** 构造统一请求头(含可选的 x-api-key) */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9'
    };
    if (this.apiKey) {
      headers['x-api-key'] = this.apiKey;
    }
    return headers;
  }

  getCapabilities(): PlatformCapabilities {
    return {
      search: true,
      download: true, // 部分论文有开放获取PDF
      fullText: false, // 只有部分PDF
      citations: true, // 提供引用统计
      requiresApiKey: false, // 免费API可用，但有限制
      supportedOptions: ['maxResults', 'year', 'fieldsOfStudy', 'sortBy']
    };
  }

  /**
   * 搜索Semantic Scholar论文
   * 按 Graph API 的 offset/next 翻页取满 maxResults。
   */
  async search(query: string, options: SemanticSearchOptions = {}): Promise<Paper[]> {
    // 查询复杂度校验(防 DoS)+ 通用转义
    const qValid = validateQueryComplexity(query, {
      maxLength: SEARCH_LIMITS.MAX_QUERY_LENGTH,
      maxBooleanOperators: SEARCH_LIMITS.MAX_BOOLEAN_OPERATORS
    });
    if (!qValid.valid) {
      this.errorHandler.handleError(new Error(qValid.error || 'Invalid query'), 'search');
    }
    const escapedQuery = escapeQueryValue(query, 'general');

    const customOptions = options as any;
    const forceRefresh = customOptions.forceRefresh === true;

    // Check cache first
    if (!forceRefresh) {
      const cacheKey = this.cache.generateKey('semantic', escapedQuery, options);
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // maxResults 统一钳制,避免无限
    const maxResults = Math.min(options.maxResults || SEARCH_LIMITS.DEFAULT_RESULTS, SEARCH_LIMITS.MAX_RESULTS);

    const params: Record<string, any> = {
      query: escapedQuery,
      limit: Math.min(maxResults, SemanticScholarSearcher.PAGE_LIMIT),
      offset: 0,
      fields: SemanticScholarSearcher.API_FIELDS
    };

    // 添加年份过滤
    if (options.year) {
      params.year = options.year;
    }

    // 添加研究领域过滤(官方已弃用 fieldsOfStudy,改用 s2FieldsOfStudy)
    if (options.fieldsOfStudy && options.fieldsOfStudy.length > 0) {
      params.s2FieldsOfStudy = options.fieldsOfStudy.join(',');
    }

    const url = `${this.baseApiUrl}/paper/search`;
    const headers = this.buildHeaders();

    const collected: Paper[] = [];
    let offset = 0;

    try {
      while (collected.length < maxResults) {
        await this.rateLimiter.waitForPermission();

        params.limit = Math.min(maxResults - collected.length, SemanticScholarSearcher.PAGE_LIMIT);
        params.offset = offset;

        logDebug(`Semantic Scholar API Request: GET ${url} offset=${offset}`);

        // axios 默认 validateStatus 会对 >=400 抛错,因此 429/5xx 会进入
        // retryWithBackoff 真正退避重试,不会再把限流当作成功返回。
        const response = await this.requestWithRetryBackoff(
          () => axios.get(url, { params, headers, timeout: TIMEOUTS.DEFAULT, maxRedirects: 5 }),
          'Semantic Scholar search'
        );

        const papers = this.parseSearchResponse(response.data);
        collected.push(...papers);

        const next = response.data?.next as number | undefined;
        // 翻页终止条件:取满 / 无下一页 / 该页无数据(防死循环)
        if (collected.length >= maxResults || typeof next !== 'number' || next <= offset || papers.length === 0) {
          break;
        }
        offset = next;
      }
      logDebug(`Semantic Scholar Parsed ${collected.length} papers`);
    } catch (error: any) {
      logDebug('Semantic Scholar Search Error:', error.message);
      // 网络/限流/服务端错误统一抛 ApiError,不再伪装成成功空结果
      this.handleHttpError(error, 'search');
    }

    const result = collected.slice(0, maxResults);

    // Cache results
    const cacheKey = this.cache.generateKey('semantic', escapedQuery, options);
    this.cache.set(cacheKey, result);

    return result;
  }

  /**
   * 获取论文详细信息
   * 走 detailsCache 缓存;404 视为"无结果"返回 null,其余错误上抛。
   */
  async getPaperDetails(paperId: string): Promise<Paper | null> {
    // 校验 paperId:非空、长度受限、仅允许安全字符,避免拼接污染 URL/路径
    const id = sanitizePaperId(paperId);
    if (id === null) {
      return null;
    }

    const cacheKey = this.detailsCache.generateKey('semantic', id);
    const cached = this.detailsCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    await this.rateLimiter.waitForPermission();

    try {
      const params = { fields: SemanticScholarSearcher.API_FIELDS };
      // 保留 DOI: 前缀(S2 文档要求字面量),仅对 DOI 值做 URL 编码,防止注入额外路径
      const pathId = id.startsWith('DOI:')
        ? `DOI:${encodeURIComponent(id.slice(4))}`
        : encodeURIComponent(id);
      const url = `${this.baseApiUrl}/paper/${pathId}`;
      const headers = this.buildHeaders();

      logDebug(`Semantic Scholar API Request: GET ${url}`);

      const response = await this.requestWithRetryBackoff(
        () => axios.get(url, { params, headers, timeout: TIMEOUTS.DEFAULT, maxRedirects: 5 }),
        'Semantic Scholar paper details'
      );

      const paper = this.parseSemanticPaper(response.data);
      if (paper) {
        this.detailsCache.set(cacheKey, paper);
      }
      return paper;
    } catch (error: any) {
      logDebug('Error getting paper details from Semantic Scholar:', error.message);
      // 404 = 确实无此论文 → 返回 null;其余(429/5xx/网络)上抛
      if (error?.response?.status === 404) {
        return null;
      }
      this.handleHttpError(error, 'paper details');
    }
  }

  /**
   * 下载PDF文件
   * 下载前通过 rateLimiter 节流,与其它请求共用限流器。
   */
  async downloadPdf(paperId: string, options: DownloadOptions = {}): Promise<string> {
    try {
      // 首先获取论文详细信息以获取PDF URL
      const paper = await this.getPaperDetails(paperId);
      if (!paper?.pdfUrl) {
        throw new Error(`No PDF URL available for paper ${paperId}`);
      }

      const savePath = options.savePath || './downloads';

      // 确保保存目录存在
      if (!fs.existsSync(savePath)) {
        fs.mkdirSync(savePath, { recursive: true });
      }

      const filename = `semantic_${sanitizeFilename(paperId)}.pdf`;
      const filePath = path.join(savePath, filename);

      // 检查文件是否已存在
      if (fs.existsSync(filePath) && !options.overwrite) {
        return filePath;
      }

      await this.rateLimiter.waitForPermission();

      const response = await this.requestWithRetryBackoff(
        () => axios.get(paper.pdfUrl, {
          responseType: 'stream',
          timeout: TIMEOUTS.DOWNLOAD,
          headers: { 'User-Agent': USER_AGENT }
        }),
        'Semantic Scholar download'
      );

      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          response.data?.destroy?.();
          if (error) {
            try { fs.unlinkSync(filePath); } catch { /* 半截文件清理失败可忽略 */ }
            reject(error);
          } else {
            resolve(filePath);
          }
        };
        writer.on('finish', () => finish());
        writer.on('error', (e) => finish(e));
        response.data.on('error', (e: Error) => { writer.destroy(); finish(e); });
      });
    } catch (error) {
      this.handleHttpError(error, 'download PDF');
    }
  }

  /**
   * 读取论文全文内容
   */
  async readPaper(paperId: string, options: DownloadOptions = {}): Promise<string> {
    try {
      const savePath = options.savePath || './downloads';
      const filename = `semantic_${sanitizeFilename(paperId)}.pdf`;
      const filePath = path.join(savePath, filename);

      // 如果PDF不存在，先下载
      if (!fs.existsSync(filePath)) {
        await this.downloadPdf(paperId, options);
      }

      // 提取PDF全文
      const extractor = new PDFExtractor();
      const result = await extractor.extractFromFile(filePath);
      return result.text || 'No text extracted from the PDF.';
    } catch (error) {
      this.handleHttpError(error, 'read paper');
    }
  }

  /**
   * 根据DOI获取论文信息
   * 无效 DOI 返回 null;查无此论文(404)由 getPaperDetails 返回 null;
   * 网络/限流错误上抛。
   */
  async getPaperByDoi(doi: string): Promise<Paper | null> {
    // Clean and validate DOI
    const doiResult = sanitizeDoi(doi);
    if (!doiResult.valid) {
      logDebug('Invalid DOI format:', doiResult.error);
      return null;
    }

    return this.getPaperDetails(`DOI:${doiResult.sanitized}`);
  }

  /**
   * 解析搜索响应
   */
  private parseSearchResponse(data: SemanticSearchResponse): Paper[] {
    if (!data.data || !Array.isArray(data.data)) {
      return [];
    }

    return data.data.map(item => this.parseSemanticPaper(item))
      .filter(paper => paper !== null) as Paper[];
  }

  /**
   * 解析单个Semantic Scholar论文
   */
  private parseSemanticPaper(item: SemanticPaper): Paper | null {
    try {
      // 提取作者
      const authors = item.authors?.map(author => author.name) || [];

      // 提取发表日期
      const publishedDate = item.publicationDate ?
        this.parseDate(item.publicationDate) :
        (item.year ? new Date(item.year, 0, 1) : null);

      // 提取PDF URL
      let pdfUrl = '';
      if (item.openAccessPdf?.url) {
        pdfUrl = item.openAccessPdf.url;
      } else if (item.openAccessPdf?.disclaimer) {
        // 尝试从disclaimer中提取URL
        const urlMatch = item.openAccessPdf.disclaimer.match(/https?:\/\/[^\s,)]+/);
        if (urlMatch) {
          pdfUrl = urlMatch[0];
        }
      }

      // 提取DOI
      const doi = item.externalIds?.DOI || '';

      // 提取分类
      const fieldsOfStudy = item.fieldsOfStudy || [];
      const s2Fields = item.s2FieldsOfStudy?.map(field => field.category) || [];
      const categories = [...fieldsOfStudy, ...s2Fields];

      // 构建URL
      const url = item.url || `https://www.semanticscholar.org/paper/${item.paperId}`;

      return PaperFactory.create({
        paperId: item.paperId,
        title: this.cleanText(item.title),
        authors: authors,
        abstract: this.cleanText(item.abstract || ''),
        doi: doi,
        publishedDate: publishedDate,
        pdfUrl: pdfUrl,
        url: url,
        source: 'semantic',
        categories: [...new Set(categories)], // 去重
        keywords: [],
        citationCount: item.citationCount || 0,
        journal: item.venue || item.journal?.name || '',
        volume: item.journal?.volume || undefined,
        pages: item.journal?.pages || undefined,
        year: item.year,
        extra: {
          semanticScholarId: item.paperId,
          referenceCount: item.referenceCount || 0,
          influentialCitationCount: item.influentialCitationCount || 0,
          isOpenAccess: item.isOpenAccess || false,
          publicationTypes: item.publicationTypes || [],
          externalIds: item.externalIds || {}
        }
      });
    } catch (error) {
      logDebug('Error parsing Semantic Scholar paper:', error);
      return null;
    }
  }

  /**
   * 获取速率限制器状态
   */
  getRateLimiterStatus() {
    return this.rateLimiter.getStatus();
  }

  /**
   * 验证API密钥（如果提供）
   */
  async validateApiKey(): Promise<boolean> {
    if (!this.apiKey) {
      return true; // 无API密钥时使用免费限制
    }

    try {
      await this.search('test', { maxResults: 1 });
      return true;
    } catch (error: any) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        return false;
      }
      return true; // 其他错误可能是网络问题
    }
  }
}

/**
 * 校验并裁剪 paperId 白名单字符,防止拼接进 URL/路径造成注入或路径穿越。
 * 返回清洗后的 ID;非法时返回 null。
 */
function sanitizePaperId(input?: string): string | null {
  if (!input || typeof input !== 'string') return null;
  const id = input.trim();
  if (id.length === 0 || id.length > 128) return null;
  // 允许 S2 ID(字母数字)、DOI: 前缀、DOI 中的 . / - _ ( ) 等安全字符
  if (!/^[A-Za-z0-9:._\-/()]+$/.test(id)) return null;
  if (id.includes('..')) return null;
  return id;
}
