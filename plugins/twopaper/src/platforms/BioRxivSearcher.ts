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

        // 仅当用户显式传入 options.category 时才作为 API category 过滤;
        // 不再把自由文本 query 强行做下划线替换塞进 category(那会让 API 返回空)。
        if (options.category) {
          params.category = options.category;
        }

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

    // 如果有查询词，进行文本匹配过滤(判空防护:缺字段的记录跳过而非抛 TypeError)
    let filteredCollection = data.collection;
    if (query && query !== '*' && query.trim()) {
      const queryLower = query.toLowerCase();
      filteredCollection = data.collection.filter(item =>
        String(item.title || '').toLowerCase().includes(queryLower) ||
        String(item.abstract || '').toLowerCase().includes(queryLower) ||
        String(item.authors || '').toLowerCase().includes(queryLower) ||
        String(item.category || '').toLowerCase().includes(queryLower)
      );
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
