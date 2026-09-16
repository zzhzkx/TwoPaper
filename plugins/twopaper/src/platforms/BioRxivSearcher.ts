/**
 * bioRxiv API集成模块
 * 支持bioRxiv和medRxiv预印本论文搜索
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { Paper, PaperFactory } from '../models/Paper.js';
import { PaperSource, SearchOptions, DownloadOptions, PlatformCapabilities } from './PaperSource.js';
import { API_ENDPOINTS, RATE_LIMITS, SEARCH_LIMITS, TIMEOUTS, USER_AGENT } from '../config/constants.js';
import { logDebug } from '../utils/Logger.js';
import { RateLimiter } from '../utils/RateLimiter.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';
import { sanitizeDoi, sanitizeFilename, validateQueryComplexity } from '../utils/SecurityUtils.js';
import { PDFExtractor } from '../utils/PDFExtractor.js';

interface BioRxivSearchOptions extends SearchOptions {
  /** 搜索天数范围 */
  days?: number;
  /** 服务器类型 */
  server?: 'biorxiv' | 'medrxiv';
}

interface BioRxivMessage {
  status: string;
  count: number;
  total: number | string;
}

interface BioRxivResponse {
  messages: BioRxivMessage[];
  collection?: BioRxivPaper[];
}

interface BioRxivPaper {
  doi: string;
  title: string;
  authors: string;
  author_corresponding: string;
  author_corresponding_institution: string;
  date: string;
  version: string;
  type: string;
  license: string;
  category: string;
  jatsxml: string;
  abstract: string;
  published?: string;
  server: string;
}

export class BioRxivSearcher extends PaperSource {
  private readonly serverType: 'biorxiv' | 'medrxiv';
  private readonly rateLimiter: RateLimiter;
  /** bioRxiv/medRxiv API 单页返回条数(服务端按日/自然限幅,响应中 count 字段给出) */
  private readonly pageSize = 30;
  /** 早于此日期无数据（bioRxiv 始于 2013，medRxiv 始于 2019），用固定下界避免按"天数"推算 */
  private readonly EARLIEST_DATE = '2013-01-01';
  /** 关键词扫描最多翻的页数（每页 30 条），与墙钟封顶共同约束成本 */
  private readonly MAX_SCAN_PAGES = 5;
  /** 关键词扫描的墙钟预算：超出即返回已攒到的命中，避免把调用方（尤其聚合）拖到超时 */
  private readonly SCAN_DEADLINE_MS = 6000;

  constructor(serverType: 'biorxiv' | 'medrxiv' = 'biorxiv') {
    // 从 API_ENDPOINTS 选取对应主机,消除硬编码与双源漂移
    const host = serverType === 'medrxiv' ? API_ENDPOINTS.MEDRXIV : API_ENDPOINTS.BIORXIV;
    super(serverType, `${host}/details/${serverType}`);
    this.serverType = serverType;
    // bioRxiv/medRxiv rate limit: 1 req/s, burst=2
    this.rateLimiter = new RateLimiter({
      requestsPerSecond: RATE_LIMITS.DEFAULT_RPS,
      burstCapacity: 2
    });
  }

  getCapabilities(): PlatformCapabilities {
    return {
      search: true,
      download: true,
      fullText: true,
      citations: false,
      requiresApiKey: false,
      supportedOptions: ['maxResults', 'days', 'category']
    };
  }

  /**
   * 搜索bioRxiv/medRxiv论文
   */
  async search(query: string, options: BioRxivSearchOptions = {}): Promise<Paper[]> {
    // 若用户没有显式给出 category，则自行扫描；给出时沿用旧的单窗口逻辑。
    if (!options.category) {
      return this.searchByKeywordScan(query, options);
    }

    // 校验 query 长度/复杂度,防止对 API 的 DoS
    const validation = validateQueryComplexity(query, {
      maxLength: SEARCH_LIMITS.MAX_QUERY_LENGTH,
      maxBooleanOperators: SEARCH_LIMITS.MAX_BOOLEAN_OPERATORS
    });
    if (!validation.valid) {
      this.handleHttpError(
        Object.assign(new Error(validation.error || 'Invalid query'), { invalidQuery: true }),
        'search'
      );
    }

    // 钳到统一上限,避免无限拉取
    const requested = Math.max(1, options.maxResults || SEARCH_LIMITS.DEFAULT_RESULTS);
    const maxResults = Math.min(requested, SEARCH_LIMITS.MAX_RESULTS);

    // 计算日期范围
    const days = options.days || 30;
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const searchUrl = `${this.baseUrl}/${startDate}/${endDate}`;

    try {
      const papers: Paper[] = [];
      let total: number | undefined;
      // cursor 按服务端单页条数递增偏移,直到取满 maxResults 或耗尽 total
      for (let cursor = 0; papers.length < maxResults && (total === undefined || cursor < total); cursor += this.pageSize) {
        const params: Record<string, any> = {
          cursor
        };

        logDebug(`${this.serverType} API Request: GET ${searchUrl}`);
        logDebug(`${this.serverType} Request params:`, params);

        const response = await ErrorHandler.retryWithBackoff(
          async () => {
            // 每次尝试都重新经过限流器,避免429重试绕过节流。
            await this.rateLimiter.waitForPermission();
            return axios.get(searchUrl, {
              params,
              timeout: TIMEOUTS.DEFAULT,
              headers: { 'User-Agent': USER_AGENT }
            });
          },
          { context: `${this.serverType} search` }
        );

        logDebug(`${this.serverType} API Response: ${response.status} ${response.statusText}`);

        const data = response.data as BioRxivResponse;
        const message = data.messages?.[0];

        // API 错误态(HTTP 200 但 status 非 ok)不得伪装成成功空结果
        if (!message || message.status !== 'ok') {
          const msg = message?.status ? `status=${message.status}` : 'empty messages';
          this.handleHttpError(
            Object.assign(new Error(`${this.serverType} API returned non-ok state: ${msg}`), {
              status: 200,
              apiStatus: message?.status
            }),
            'search'
          );
        }

        // 记录服务端实际 total,依此终止分页
        if (total === undefined) {
          const parsedTotal = Number(message.total);
          if (Number.isFinite(parsedTotal)) {
            total = parsedTotal;
          }
        }

        const parsed = this.parseSearchResponse(data, query, options);
        papers.push(...parsed.slice(0, maxResults - papers.length));

        if (parsed.length === 0) {
          break;
        }
      }

      logDebug(`${this.serverType} Parsed ${papers.length} papers`);
      return papers;
    } catch (error: any) {
      logDebug(`${this.serverType} Search Error:`, error.message);
      this.handleHttpError(error, 'search');
    }
  }

  /**
   * 关键词检索：bioRxiv/medRxiv 上游**没有关键词检索 API**，只有按日期区间返回的
   * `details/{server}/{start}/{end}/{cursor}`（时间正序分页）。只能在客户端过滤，
   * 且要"从最新往回翻"才有意义 —— 最新论文在末尾页（cursor ≈ total - pageSize）。
   *
   * 旧实现取 `cursor=0`（最旧一页）并在首个空页 break，等于永远看不到近期论文，
   * 对绝大多数关键词恒返回 0。这里改为：
   *   1. 先取一页拿到 total；
   *   2. 从最新页起、按 pageSize 往回翻；
   *   3. 页数（MAX_SCAN_PAGES）与墙钟（SCAN_DEADLINE_MS）双重封顶，避免拖垮调用/聚合。
   */
  private async searchByKeywordScan(query: string, options: BioRxivSearchOptions): Promise<Paper[]> {
    const validation = validateQueryComplexity(query, {
      maxLength: SEARCH_LIMITS.MAX_QUERY_LENGTH,
      maxBooleanOperators: SEARCH_LIMITS.MAX_BOOLEAN_OPERATORS
    });
    if (!validation.valid) {
      this.handleHttpError(
        Object.assign(new Error(validation.error || 'Invalid query'), { invalidQuery: true }),
        'search'
      );
    }

    const requested = Math.max(1, options.maxResults || SEARCH_LIMITS.DEFAULT_RESULTS);
    const maxResults = Math.min(requested, SEARCH_LIMITS.MAX_RESULTS);
    const PAGE = this.pageSize;
    const end = new Date().toISOString().split('T')[0];
    const start = this.EARLIEST_DATE;
    const deadline = Date.now() + this.SCAN_DEADLINE_MS;

    const fetchPage = async (cursor: number) => {
      const response = await ErrorHandler.retryWithBackoff(
        async () => {
          await this.rateLimiter.waitForPermission();
          return axios.get(`${this.baseUrl}/${start}/${end}/${cursor}`, {
            timeout: TIMEOUTS.DEFAULT,
            headers: { 'User-Agent': USER_AGENT }
          });
        },
        { context: `${this.serverType} keyword scan` }
      );
      const data = response.data as BioRxivResponse;
      const message = data.messages?.[0];
      if (!message || message.status !== 'ok') {
        const msg = message?.status ? `status=${message.status}` : 'empty messages';
        throw new Error(`${this.serverType} API returned non-ok state: ${msg}`);
      }
      return { total: Number(message.total) || 0, collection: data.collection || [] };
    };

    try {
      const first = await fetchPage(0); // 只为拿 total（该页是最旧的，不用于结果）
      let cursor = Math.max(0, first.total - PAGE);
      const papers: Paper[] = [];
      const seen = new Set<string>();

      for (let page = 0; page < this.MAX_SCAN_PAGES; page++, cursor -= PAGE) {
        if (papers.length >= maxResults || cursor < 0 || Date.now() > deadline) break;
        const { collection } = await fetchPage(cursor);
        if (collection.length === 0) break;

        for (const item of collection) {
          const key = item.doi || `${item.date}|${item.title}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const paper = this.parseSearchResponse({ collection: [item] } as any, query, options)[0];
          if (paper) papers.push(paper);
          if (papers.length >= maxResults) break;
        }
      }

      logDebug(`${this.serverType} keyword scan matched ${papers.length} (pages ≤${this.MAX_SCAN_PAGES})`);
      return papers.slice(0, maxResults);
    } catch (error: any) {
      logDebug(`${this.serverType} keyword scan error:`, error.message);
      this.handleHttpError(error, 'search');
    }
  }

  /**
   * 根据DOI获取论文信息
   */
  async getPaperByDoi(doi: string): Promise<Paper | null> {
    const result = sanitizeDoi(doi);
    if (!result.valid || !result.sanitized) {
      return null;
    }

    try {
      const response = await ErrorHandler.retryWithBackoff(
        async () => {
          await this.rateLimiter.waitForPermission();
          return axios.get(`${this.baseUrl}/${result.sanitized}`, {
            timeout: TIMEOUTS.DEFAULT,
            headers: { 'User-Agent': USER_AGENT }
          });
        },
        { context: `${this.serverType} getPaperByDoi` }
      );
      const data = response.data as BioRxivResponse;
      const item = data.collection?.find(paper => paper.doi === result.sanitized);
      return item ? this.parseBioRxivPaper(item) : null;
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return null;
      }
      this.handleHttpError(error, 'getPaperByDoi');
    }
  }

  /**
   * 下载PDF文件(使用无版本号的全文链接,自动落到最新版本,避免 v1 硬编码下载到旧版)
   */
  async downloadPdf(paperId: string, options: DownloadOptions = {}): Promise<string> {
    try {
      const savePath = options.savePath || './downloads';

      // 无版本号 .full.pdf 会 302 到最新版本的全文 PDF,适配多版本论文
      const contentHost = this.serverType === 'medrxiv'
        ? API_ENDPOINTS.MEDRXIV_CONTENT
        : API_ENDPOINTS.BIORXIV_CONTENT;
      const pdfUrl = `${contentHost}/content/${paperId}.full.pdf`;

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

      const response = await ErrorHandler.retryWithBackoff(
        async () => {
          // 每次尝试都重新经过限流器,避免429重试绕过节流。
          await this.rateLimiter.waitForPermission();
          return axios.get(pdfUrl, {
            responseType: 'stream',
            timeout: TIMEOUTS.DOWNLOAD,
            headers: { 'User-Agent': USER_AGENT }
          });
        },
        { context: `${this.serverType} download` }
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
            writer.destroy();
            try { fs.unlinkSync(filePath); } catch { /* 半截文件清理失败可忽略 */ }
            reject(error);
          } else {
            resolve(filePath);
          }
        };
        writer.on('finish', () => finish());
        writer.on('error', (e: Error) => finish(e));
        // 源流出错时若只监听 writer，Promise 会永久挂起（writer 永不 finish）
        response.data.on('error', (e: Error) => finish(e));
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
      const filePath = path.join(savePath, `${sanitizeFilename(paperId)}.pdf`);

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
   * 解析搜索响应
   */
  private parseSearchResponse(data: BioRxivResponse, query: string, options: BioRxivSearchOptions): Paper[] {
    if (!data.collection || !Array.isArray(data.collection)) {
      return [];
    }

    // 上游无关键词检索，只能客户端过滤。既不能整句短语子串匹配（Query 原文几乎不可能连续出现 → 恒 0），
    // 也不能"任一词元命中"（等于不过滤）。折中：按**命中词元数打分**，保留命中数 ≥ 半数者，并按分数降序。
    //   1 词 → 必须命中；2 词 → 两词都中(AND)；3 词 → 至少 2；4 词 → 至少 2；5 词 → 至少 3 …
    let filteredCollection = data.collection;
    if (query && query !== '*' && query.trim()) {
      const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
      if (tokens.length) {
        const minMatch = tokens.length <= 2 ? tokens.length : Math.ceil(tokens.length / 2);
        const scored = data.collection
          .map(item => {
            const hay = `${item.title || ''} ${item.abstract || ''} ${item.authors || ''} ${item.category || ''}`.toLowerCase();
            const score = tokens.filter(t => hay.includes(t)).length;
            return { item, score };
          })
          .filter(x => x.score >= minMatch)
          .sort((a, b) => b.score - a.score);
        filteredCollection = scored.map(x => x.item);
      }
    }

    return filteredCollection.map(item => this.parseBioRxivPaper(item))
      .filter(paper => paper !== null) as Paper[];
  }

  /**
   * 解析单个bioRxiv论文
   */
  private parseBioRxivPaper(item: BioRxivPaper): Paper | null {
    try {
      // 解析作者(判空:缺字段的作者串按空处理)
      const authors = String(item.authors || '').split(';').map(author => author.trim()).filter(Boolean);

      // 解析日期
      const publishedDate = this.parseDate(item.date);
      const year = publishedDate?.getFullYear();

      // 构建URL(带精确版本号,与下载端的最新版本策略互补)
      const paperUrl = `https://www.${this.serverType}.org/content/${item.doi}v${item.version}`;
      const pdfUrl = `https://www.${this.serverType}.org/content/${item.doi}v${item.version}.full.pdf`;

      return PaperFactory.create({
        paperId: item.doi,
        title: this.cleanText(item.title),
        authors: authors,
        abstract: this.cleanText(item.abstract),
        doi: item.doi,
        publishedDate: publishedDate,
        pdfUrl: pdfUrl,
        url: paperUrl,
        source: this.serverType,
        categories: item.category ? [item.category] : [],
        keywords: [],
        citationCount: 0,
        year: year,
        extra: {
          version: item.version,
          type: item.type,
          license: item.license,
          server: item.server,
          corresponding_author: item.author_corresponding,
          corresponding_institution: item.author_corresponding_institution
        }
      });
    } catch (error) {
      logDebug(`Error parsing ${this.serverType} paper:`, error);
      return null;
    }
  }
}

/**
 * medRxiv搜索器 - 继承自BioRxivSearcher
 */
export class MedRxivSearcher extends BioRxivSearcher {
  constructor() {
    super('medrxiv');
  }
}
