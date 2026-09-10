/**
 * IACR ePrint Archive集成模块
 * 密码学和相关领域的学术论文搜索
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { Paper, PaperFactory } from '../models/Paper.js';
import { PaperSource, SearchOptions, DownloadOptions, PlatformCapabilities } from './PaperSource.js';
import { API_ENDPOINTS, RATE_LIMITS, SEARCH_LIMITS, TIMEOUTS } from '../config/constants.js';
import { logDebug } from '../utils/Logger.js';
import { RateLimiter } from '../utils/RateLimiter.js';
import { ErrorHandler, ApiError } from '../utils/ErrorHandler.js';
import { sanitizeFilename, validateQueryComplexity, escapeQueryValue } from '../utils/SecurityUtils.js';
import { PDFExtractor } from '../utils/PDFExtractor.js';

interface IACRSearchOptions extends SearchOptions {
  /** 是否获取详细信息 */
  fetchDetails?: boolean;
}

/** IACR ePrint 搜索页固定每页条数(通过 ?offset= 翻页) */
const IACR_PAGE_SIZE = 100;

export class IACRSearcher extends PaperSource {
  private readonly searchUrl: string;
  private readonly userAgents: string[];
  private readonly rateLimiter: RateLimiter;

  constructor() {
    super('iacr', API_ENDPOINTS.IACR);
    this.searchUrl = `${API_ENDPOINTS.IACR}/search`;
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
    ];
    // IACR rate limit: 1 req/s(复用 RATE_LIMITS.DEFAULT_RPS)
    this.rateLimiter = new RateLimiter({
      requestsPerSecond: RATE_LIMITS.DEFAULT_RPS,
      burstCapacity: RATE_LIMITS.DEFAULT_BURST
    });
  }

  getCapabilities(): PlatformCapabilities {
    return {
      search: true,
      download: true,
      fullText: true,
      citations: false,
      requiresApiKey: false,
      supportedOptions: ['maxResults', 'fetchDetails']
    };
  }

  /**
   * 搜索IACR ePrint Archive论文
   */
  async search(query: string, options: IACRSearchOptions = {}): Promise<Paper[]> {
    // 查询复杂度校验,防止超长/注入式查询
    const validation = validateQueryComplexity(query, {
      maxLength: SEARCH_LIMITS.MAX_QUERY_LENGTH,
      maxBooleanOperators: SEARCH_LIMITS.MAX_BOOLEAN_OPERATORS
    });
    if (!validation.valid) {
      throw new ApiError({
        message: `Invalid IACR query: ${validation.error}`,
        platform: 'iacr',
        operation: 'search'
      });
    }

    // maxResults 统一钳到 SEARCH_LIMITS.MAX_RESULTS,避免无限拉取
    const requestedMaxResults = Number.isFinite(options.maxResults)
      ? Math.floor(options.maxResults as number)
      : SEARCH_LIMITS.DEFAULT_RESULTS;
    const maxResults = Math.max(
      0,
      Math.min(requestedMaxResults, SEARCH_LIMITS.MAX_RESULTS)
    );
    const escapedQuery = escapeQueryValue(query);

    const results: Paper[] = [];

    try {
      // IACR 搜索页通过 ?offset= 翻页,固定每页 IACR_PAGE_SIZE 条
      let offset = 0;
      while (results.length < maxResults) {
        logDebug(`IACR API Request: GET ${this.searchUrl}?q=${encodeURIComponent(escapedQuery)}&offset=${offset}`);

        const papers = await this.fetchSearchPage(escapedQuery, offset, options);
        if (papers.length === 0) {
          break; // 无更多结果
        }

        results.push(...papers);

        // 不足一页说明已是最后一页,停止翻页
        if (papers.length < IACR_PAGE_SIZE) {
          break;
        }
        offset += IACR_PAGE_SIZE;
      }

      logDebug(`IACR Parsed ${results.length} papers`);
      return results.slice(0, maxResults);
    } catch (error: any) {
      // 网络/限流错误走统一的 ErrorHandler(会抛 ApiError),不让空结果伪装成功
      logDebug('IACR Search Error:', error.message);
      return this.handleHttpError(error, 'search');
    }
  }

  /**
   * 抓取并解析单页搜索结果
   */
  private async fetchSearchPage(
    query: string,
    offset: number,
    options: IACRSearchOptions
  ): Promise<Paper[]> {
    await this.rateLimiter.waitForPermission();

    const response = await ErrorHandler.retryWithBackoff(
      () => axios.get(this.searchUrl, {
        params: { q: query, offset },
        timeout: TIMEOUTS.DEFAULT,
        headers: {
          'User-Agent': this.getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      }),
      { context: 'IACR search', maxRetries: 3 }
    );

    const contentType = String(response.headers['content-type'] || '').toLowerCase();
    if (!contentType.includes('text/html')) {
      throw new ApiError({
        message: `Unexpected IACR search content type: ${contentType || 'unknown'}`,
        status: response.status,
        platform: 'iacr',
        operation: 'search'
      });
    }

    logDebug(`IACR API Response: ${response.status} ${response.statusText}`);

    if (response.status !== 200) {
      return this.handleHttpError(
        new ApiError({
          message: `Unexpected IACR search status ${response.status}`,
          status: response.status,
          platform: 'iacr',
          operation: 'search'
        }),
        'search'
      );
    }

    return this.parseSearchResponse(response.data, options);
  }

  /**
   * 获取论文详细信息
   */
  async getPaperDetails(paperId: string): Promise<Paper | null> {
    try {
      const paperUrl = paperId.startsWith('http') ? paperId : `${this.baseUrl}/${paperId}`;

      await this.rateLimiter.waitForPermission();

      const response = await ErrorHandler.retryWithBackoff(
        () => axios.get(paperUrl, {
          timeout: TIMEOUTS.DEFAULT,
          headers: {
            'User-Agent': this.getRandomUserAgent(),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9'
          }
        }),
        { context: 'IACR paper details', maxRetries: 3 }
      );

      if (response.status !== 200) {
        return this.handleHttpError(
          new ApiError({
            message: `Unexpected IACR details status ${response.status}`,
            status: response.status,
            platform: 'iacr',
            operation: 'getPaperDetails'
          }),
          'getPaperDetails'
        );
      }

      return this.parseIACRPaperDetails(response.data, paperId);
    } catch (error: any) {
      // 404 = 论文确实不存在,属合法空结果;其余网络/限流错误抛出,不吞错伪装成功
      if (error?.response?.status === 404) {
        logDebug(`IACR paper not found (404): ${paperId}`);
        return null;
      }
      logDebug(`Error fetching paper details for ${paperId}:`, error.message);
      return this.handleHttpError(error, 'getPaperDetails');
    }
  }

  /**
   * 下载PDF文件
   */
  async downloadPdf(paperId: string, options: DownloadOptions = {}): Promise<string> {
    try {
      const pdfUrl = `${this.baseUrl}/${paperId}.pdf`;
      const savePath = options.savePath || './downloads';
      
      // 确保保存目录存在
      if (!fs.existsSync(savePath)) {
        fs.mkdirSync(savePath, { recursive: true });
      }

      const filename = `iacr_${sanitizeFilename(paperId)}.pdf`;
      const filePath = path.join(savePath, filename);

      // 检查文件是否已存在
      if (fs.existsSync(filePath) && !options.overwrite) {
        return filePath;
      }

      await this.rateLimiter.waitForPermission();

      const response = await ErrorHandler.retryWithBackoff(
        () => axios.get(pdfUrl, {
          responseType: 'stream',
          timeout: TIMEOUTS.EXTENDED,
          headers: { 'User-Agent': this.getRandomUserAgent() }
        }),
        { context: 'IACR download', maxRetries: 3 }
      );

      // 仅接受 200 响应,避免把错误页/跳转页当作 PDF 落盘
      if (response.status !== 200) {
        return this.handleHttpError(
          new ApiError({
            message: `Unexpected IACR download status ${response.status}`,
            status: response.status,
            platform: 'iacr',
            operation: 'download PDF'
          }),
          'download PDF'
        );
      }

      // 原子写入:先流式写临时文件,成功后 rename 到位,避免并发/半截下载在
      // filePath 留下损坏文件(fs.existsSync 缓存非原子的修复)
      const tmpPath = `${filePath}.tmp`;
      const writer = fs.createWriteStream(tmpPath);
      response.data.pipe(writer);

      await new Promise<void>((resolve, reject) => {
        writer.on('finish', () => resolve());
        writer.on('error', reject);
      });

      fs.renameSync(tmpPath, filePath);
      return filePath;
    } catch (error) {
      return this.handleHttpError(error, 'download PDF');
    }
  }

  /**
   * 读取论文全文内容
   */
  async readPaper(paperId: string, options: DownloadOptions = {}): Promise<string> {
    try {
      const savePath = options.savePath || './downloads';
      const filename = `iacr_${sanitizeFilename(paperId)}.pdf`;
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
      return this.handleHttpError(error, 'read paper');
    }
  }

  /**
   * 解析搜索响应
   */
  private async parseSearchResponse(html: string, options: IACRSearchOptions): Promise<Paper[]> {
    const $ = cheerio.load(html);
    const papers: Paper[] = [];
    let parseFailures = 0;

    // 查找所有搜索结果条目；保留旧选择器并兼容带 paperlink 类的改版节点
    const resultEntries = $('.mb-4').length > 0 ? $('.mb-4') : $('[class*="paperlink"]').closest('div');
    resultEntries.each((index, element) => {
      try {
        const $element = $(element);
        
        // 提取论文ID和链接
        const paperLink = $element.find('.d-flex .paperlink').first();
        if (!paperLink.length) return;
        
        const paperId = paperLink.text().trim();
        const paperUrl = this.baseUrl + paperLink.attr('href');
        
        // 提取PDF链接
        const pdfLink = $element.find('a[href$=".pdf"]').first();
        const pdfUrl = pdfLink.length ? this.baseUrl + pdfLink.attr('href') : '';
        
        // 提取更新日期
        const lastUpdatedElem = $element.find('small.ms-auto');
        let updatedDate: Date | null = null;
        if (lastUpdatedElem.length) {
          const dateText = lastUpdatedElem.text().replace('Last updated:', '').trim();
          updatedDate = this.parseDate(dateText);
        }
        
        // 从内容区域提取信息
        const contentDiv = $element.find('.ms-md-4');
        if (!contentDiv.length) return;
        
        // 提取标题
        const titleElem = contentDiv.find('strong').first();
        const title = titleElem.text().trim();
        
        // 提取作者
        const authorsElem = contentDiv.find('span.fst-italic').first();
        const authors = authorsElem.length ? 
          authorsElem.text().split(',').map(author => author.trim()) : [];
        
        // 提取分类
        const categoryElem = contentDiv.find('small.badge').first();
        const categories = categoryElem.length ? [categoryElem.text().trim()] : [];
        
        // 提取摘要
        const abstractElem = contentDiv.find('p.search-abstract').first();
        const abstract = abstractElem.text().trim();
        
        const paper = PaperFactory.create({
          paperId: paperId,
          title: this.cleanText(title),
          authors: authors,
          abstract: this.cleanText(abstract),
          doi: '',
          publishedDate: updatedDate || new Date(),
          pdfUrl: pdfUrl,
          url: paperUrl,
          source: 'iacr',
          updatedDate: updatedDate || undefined,
          categories: categories,
          keywords: [],
          citationCount: 0,
          year: updatedDate?.getFullYear(),
          extra: {
            iacrId: paperId
          }
        });
        
        papers.push(paper);
      } catch (error) {
        parseFailures++;
        logDebug('Error parsing IACR search result:', error);
      }
    });

    if (resultEntries.length > 0 && parseFailures === resultEntries.length) {
      throw new ApiError({
        message: 'Unable to parse any IACR search results',
        platform: 'iacr',
        operation: 'search'
      });
    }

    // 如果需要详细信息，获取每篇论文的详细信息
    if (options.fetchDetails && papers.length > 0) {
      logDebug('Fetching detailed information for IACR papers...');

      // Use p-limit to control concurrency (max 3 concurrent requests)
      const { default: pLimit } = await import('p-limit');
      const limit = pLimit(3);

      const detailPromises = papers.map(paper =>
        limit(async () => {
          try {
            const detailedPaper = await this.getPaperDetails(paper.paperId);
            return detailedPaper || paper; // 退回到搜索结果数据
          } catch (error) {
            logDebug(`Error fetching details for ${paper.paperId}:`, error);
            return paper;
          }
        })
      );

      const detailedPapers = await Promise.all(detailPromises);
      return detailedPapers;
    }

    return papers;
  }

  /**
   * 解析IACR论文详细页面
   */
  private parseIACRPaperDetails(html: string, paperId: string): Paper | null {
    try {
      const $ = cheerio.load(html);
      
      // 提取标题
      const title = $('h3.mb-3').text().trim();
      
      // 提取作者
      const authorText = $('p.fst-italic').text().trim();
      const authors = authorText ? 
        authorText.replace(/ and /g, ',').split(',').map(author => author.trim()) : [];
      
      // 提取摘要
      const abstract = $('p[style*="white-space: pre-wrap"]').text().trim();
      
      // 提取关键词
      const keywords: string[] = [];
      $('a.badge.bg-secondary.keyword').each((index, element) => {
        keywords.push($(element).text().trim());
      });
      
      // 提取发表信息和历史记录
      const pageText = $.text();
      const lines = pageText.split('\n').map(line => line.trim()).filter(line => line);
      
      let publicationInfo = '';
      let historyEntries: string[] = [];
      let lastUpdated: Date | null = null;
      
      // 查找发表信息
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('Publication info') && i + 1 < lines.length) {
          publicationInfo = lines[i + 1];
          break;
        }
      }
      
      // 查找历史记录
      let historyFound = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === 'History' && !line.includes(':')) {
          historyFound = true;
          continue;
        } else if (historyFound && line.includes(':') && !line.startsWith('Short URL')) {
          historyEntries.push(line);
          // 尝试从第一个历史记录中提取最后更新日期
          if (!lastUpdated) {
            const dateStr = line.split(':')[0].trim();
            lastUpdated = this.parseDate(dateStr);
          }
        } else if (historyFound && (line.startsWith('Short URL') || line.startsWith('License'))) {
          break;
        }
      }
      
      // 构建PDF URL
      const pdfUrl = `${this.baseUrl}/${paperId}.pdf`;
      const paperUrl = `${this.baseUrl}/${paperId}`;
      
      // 使用最后更新日期或当前日期作为发表日期
      const publishedDate = lastUpdated || new Date();
      
      return PaperFactory.create({
        paperId: paperId,
        title: this.cleanText(title),
        authors: authors,
        abstract: this.cleanText(abstract),
        doi: '',
        publishedDate: publishedDate,
        pdfUrl: pdfUrl,
        url: paperUrl,
        source: 'iacr',
        updatedDate: lastUpdated || undefined,
        categories: [],
        keywords: keywords,
        citationCount: 0,
        year: publishedDate.getFullYear(),
        extra: {
          iacrId: paperId,
          publicationInfo: publicationInfo,
          history: historyEntries.join('; ')
        }
      });
    } catch (error) {
      logDebug('Error parsing IACR paper details:', error);
      return null;
    }
  }

  /**
   * 获取随机User-Agent
   */
  private getRandomUserAgent(): string {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }
}