/**
 * PubMed E-utilities API集成模块
 * 支持无API密钥的免费使用（3 req/s）和有API密钥的增强使用（10 req/s）
 */

import axios from 'axios';
import * as xml2js from 'xml2js';
import { Paper, PaperFactory } from '../models/Paper.js';
import { PaperSource, SearchOptions, DownloadOptions, PlatformCapabilities } from './PaperSource.js';
import { RateLimiter } from '../utils/RateLimiter.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';
import { API_ENDPOINTS, SEARCH_LIMITS, TIMEOUTS, USER_AGENT } from '../config/constants.js';
import { sanitizeDoi, validateQueryComplexity } from '../utils/SecurityUtils.js';
import { logDebug } from '../utils/Logger.js';

interface PubMedSearchOptions extends SearchOptions {
  /** 搜索字段 */
  field?: string;
  /** 出版状态 */
  pubStatus?: string;
  /** 文献类型 */
  publicationType?: string[];
}

interface ESearchResponse {
  eSearchResult: {
    Count: string;
    IdList: {
      Id: string | string[];
    };
    TranslationSet?: any;
    QueryTranslation?: string;
  };
}

interface ESummaryResponse {
  result: {
    uids: string[];
    [pmid: string]: PubMedArticleSummary | string[];
  };
}

interface PubMedArticleSummary {
  uid: string;
  pubdate: string;
  epubdate: string;
  source: string;
  title: string;
  authors: Array<{
    name: string;
    authtype: string;
  }>;
  lastauthor: string;
  volume: string;
  issue: string;
  pages: string;
  articleids: Array<{
    idtype: string;
    value: string;
  }>;
  fulljournalname: string;
  elocationid: string;
  doctype: string;
  pubstatus: string;
  sortpubdate: string;
}

interface EFetchResponse {
  PubmedArticleSet: {
    PubmedArticle: PubMedArticleDetail[];
  };
}

interface PubMedArticleDetail {
  MedlineCitation: {
    PMID: {
      _: string;
    };
    Article: {
      ArticleTitle: string;
      Abstract?: {
        AbstractText: string | string[];
      };
      AuthorList?: {
        Author: Array<{
          LastName?: string;
          ForeName?: string;
          Initials?: string;
          CollectiveName?: string;
        }>;
      };
      Journal: {
        Title: string;
        ISOAbbreviation: string;
        JournalIssue: {
          Volume?: string;
          Issue?: string;
          PubDate: {
            Year?: string;
            Month?: string;
            Day?: string;
          };
        };
      };
      Pagination?: {
        MedlinePgn: string;
      };
      ArticleIdList?: {
        ArticleId: Array<{
          _: string;
          $: {
            IdType: string;
          };
        }>;
      };
    };
  };
  PubmedData: {
    ArticleIdList?: {
      ArticleId: Array<{
        _: string;
        $: {
          IdType: string;
        };
      }>;
    };
  };
}

export class PubMedSearcher extends PaperSource {
  private readonly baseApiUrl: string;
  private readonly rateLimiter: RateLimiter;
  private readonly retMax: number = SEARCH_LIMITS.MAX_RESULTS; // 每次批量获取的最大数量
  private readonly tool: string;
  private readonly email: string;

  constructor(apiKey?: string) {
    super('pubmed', API_ENDPOINTS.PUBMED, apiKey);
    this.baseApiUrl = this.baseUrl;

    // NCBI E-utilities 要求请求附带 tool + email 以标记调用方(反爬封禁规避)
    this.tool = 'paper-search-mcp-nodejs';
    this.email = process.env.NCBI_EMAIL || process.env.CROSSREF_MAILTO || '';

    // 根据是否有API密钥设置不同的速率限制
    const requestsPerSecond = apiKey ? 10 : 3;
    this.rateLimiter = new RateLimiter({
      requestsPerSecond,
      burstCapacity: requestsPerSecond,
      debug: process.env.NODE_ENV === 'development'
    });
  }

  getCapabilities(): PlatformCapabilities {
    return {
      search: true,
      download: false, // PubMed不提供直接PDF下载
      fullText: false, // 只有摘要，不是全文
      citations: false, // 基础版本不提供被引统计
      requiresApiKey: false, // 无API密钥也可以使用，但有限制
      supportedOptions: ['maxResults', 'year', 'author', 'journal', 'sortBy']
    };
  }

  /**
   * 搜索PubMed文献
   */
  async search(query: string, options: PubMedSearchOptions = {}): Promise<Paper[]> {
    try {
      const validation = validateQueryComplexity(query, {
        maxLength: SEARCH_LIMITS.MAX_QUERY_LENGTH,
        maxBooleanOperators: SEARCH_LIMITS.MAX_BOOLEAN_OPERATORS
      });
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid query');
      }

      logDebug(`PubMed Search Starting: query="${query}"`, options);
      
      // 第一步：使用ESearch获取PMID列表
      const pmids = await this.searchPMIDs(query, options);
      
      if (pmids.length === 0) {
        return [];
      }

      // 第二步：批量获取详细信息
      const papers: Paper[] = [];
      for (let i = 0; i < pmids.length; i += this.retMax) {
        const batch = pmids.slice(i, i + this.retMax);
        const batchPapers = await this.fetchPaperDetails(batch);
        papers.push(...batchPapers);
      }

      return papers;
    } catch (error: any) {
      logDebug('PubMed Search Error:', error.message);
      this.handleHttpError(error, 'search');
    }
  }

  /**
   * 搜索获取PMID列表
   */
  private async searchPMIDs(query: string, options: PubMedSearchOptions): Promise<string[]> {
    await this.rateLimiter.waitForPermission();

    const searchQuery = this.buildSearchQuery(query, options);
    const requestedResults = Number.isFinite(options.maxResults)
      ? Math.floor(options.maxResults as number)
      : SEARCH_LIMITS.DEFAULT_RESULTS;
    const maxResults = Math.max(
      1,
      Math.min(requestedResults, SEARCH_LIMITS.MAX_RESULTS)
    );
    const params: Record<string, string> = {
      db: 'pubmed',
      term: searchQuery,
      retmax: maxResults.toString(),
      retmode: 'xml',
      sort: this.mapSortField(options.sortBy || 'relevance'),
      tool: this.tool
    };

    // NCBI 要求标识 email(可选,提供则附带)
    if (this.email) {
      params.email = this.email;
    }

    // 添加API密钥（如果有）
    if (this.apiKey) {
      params.api_key = this.apiKey;
    }

    const url = `${this.baseApiUrl}/esearch.fcgi`;

    logDebug(`PubMed ESearch Request: GET ${url}`);
    logDebug('PubMed ESearch params:', params);

    const response = await ErrorHandler.retryWithBackoff(
      () => axios.get(url, {
        params,
        timeout: TIMEOUTS.DEFAULT,
        headers: { 'User-Agent': USER_AGENT }
      }),
      { context: 'PubMed ESearch' }
    );

    logDebug(`PubMed ESearch Response: ${response.status} ${response.statusText}`);
    // response.data 可能是 string(XML) 或其他类型,先转字符串再截断,避免非 string 时 .substring 抛错
    logDebug('PubMed ESearch Response data:', String(response.data).substring(0, 500));
    
    const result: ESearchResponse = await this.parseXmlResponse(response.data);
    let pmids = result.eSearchResult.IdList?.Id || [];
    
    // 处理单个ID vs ID数组
    if (typeof pmids === 'string') {
      pmids = [pmids];
    }
    
    logDebug(`PubMed Found ${pmids.length} PMIDs:`, pmids.slice(0, 5));
    
    return pmids;
  }

  /**
   * 获取论文详细信息
   */
  private async fetchPaperDetails(pmids: string[]): Promise<Paper[]> {
    await this.rateLimiter.waitForPermission();

    const params: Record<string, string> = {
      db: 'pubmed',
      id: pmids.join(','),
      retmode: 'xml',
      tool: this.tool
    };

    // NCBI 要求标识 email(可选,提供则附带)
    if (this.email) {
      params.email = this.email;
    }

    // 添加API密钥（如果有）
    if (this.apiKey) {
      params.api_key = this.apiKey;
    }

    const url = `${this.baseApiUrl}/efetch.fcgi`;
    const response = await ErrorHandler.retryWithBackoff(
      () => axios.get(url, {
        params,
        timeout: TIMEOUTS.DEFAULT,
        headers: { 'User-Agent': USER_AGENT }
      }),
      { context: 'PubMed EFetch' }
    );
    
    const result: EFetchResponse = await this.parseXmlResponse(response.data);
    
    // 处理xml2js的单个元素vs数组问题
    let articles = result.PubmedArticleSet?.PubmedArticle || [];
    if (!Array.isArray(articles)) {
      articles = [articles]; // 将单个对象转换为数组
    }
    
    return this.parsePubMedArticles(articles);
  }

  /**
   * 构建搜索查询
   */
  private buildSearchQuery(query: string, options: PubMedSearchOptions): string {
    let searchQuery = query;

    // 添加作者过滤
    if (options.author) {
      searchQuery += ` AND ${options.author}[Author]`;
    }

    // 添加期刊过滤
    if (options.journal) {
      searchQuery += ` AND "${options.journal}"[Journal]`;
    }

    // 添加年份过滤
    if (options.year) {
      if (options.year.includes('-')) {
        const [startYear, endYear] = options.year.split('-');
        if (startYear && endYear) {
          searchQuery += ` AND ${startYear}:${endYear}[Publication Date]`;
        } else if (startYear) {
          searchQuery += ` AND ${startYear}:${new Date().getFullYear()}[Publication Date]`;
        } else if (endYear) {
          searchQuery += ` AND *:${endYear}[Publication Date]`;
        }
      } else {
        searchQuery += ` AND ${options.year}[Publication Date]`;
      }
    }

    // 添加文献类型过滤
    if (options.publicationType && options.publicationType.length > 0) {
      const typeQuery = options.publicationType
        .map(type => `"${type}"[Publication Type]`)
        .join(' OR ');
      searchQuery += ` AND (${typeQuery})`;
    }

    return searchQuery;
  }

  /**
   * 映射排序字段
   */
  private mapSortField(sortBy: string): string {
    const fieldMap: Record<string, string> = {
      'relevance': 'relevance',
      // PubMed 的 esearch sort 用空格分隔的 'pub date';若写成 'pub+date',
      // axios 会把 + 编码为 %2B 导致排序参数失效
      'date': 'pub date',
      'citations': 'relevance' // PubMed不直接支持按被引排序
    };
    return fieldMap[sortBy] || 'relevance';
  }

  /**
   * 解析XML响应
   */
  private async parseXmlResponse<T>(xmlData: string): Promise<T> {
    const parser = new xml2js.Parser({
      explicitArray: false,  // 简化数组处理
      mergeAttrs: false,
      normalize: true,
      normalizeTags: false,
      trim: true
    });
    
    const xml = typeof xmlData === 'string' ? xmlData : String(xmlData ?? '');
    logDebug('PubMed XML Parsing - Data preview:', xml.substring(0, 200));
    const result = await parser.parseStringPromise(xml);
    logDebug('PubMed XML Parsed result structure:', JSON.stringify(result, null, 2).substring(0, 1000));
    
    return result;
  }

  /**
   * 归一化 xml2js(explicitArray:false) 返回的单元素为数组。
   * 单个元素时 xml2js 返回对象而非数组,统一为数组避免下游数组方法失效导致丢字段。
   */
  private asArray<T>(value: T | T[] | undefined): T[] {
    if (value === undefined || value === null) {
      return [];
    }
    return Array.isArray(value) ? value : [value];
  }

  /**
   * 解析PubMed文章列表
   */
  private parsePubMedArticles(articles: PubMedArticleDetail[]): Paper[] {
    return articles.map(article => this.parsePubMedArticle(article))
      .filter(paper => paper !== null) as Paper[];
  }

  /**
   * 解析单个PubMed文章
   */
  private parsePubMedArticle(article: PubMedArticleDetail): Paper | null {
    try {
      const medlineCitation = article.MedlineCitation;
      const articleData = medlineCitation.Article;
      const pubmedData = article.PubmedData;

      // 提取PMID
      const pmid = medlineCitation.PMID._;

      // 提取标题
      const rawTitle: any = articleData.ArticleTitle;
      const title = typeof rawTitle === 'string'
        ? rawTitle
        : String(rawTitle?._ || rawTitle || 'No title available');

      // 提取作者
      // 注意:xml2js explicitArray:false 下单个 Author 是对象而非数组,统一归一化为数组再解析
      const authors = this.extractAuthors(this.asArray(articleData.AuthorList?.Author));

      // 提取摘要
      const abstract = this.extractAbstract(articleData.Abstract);

      // 提取期刊信息
      const journal = String(articleData.Journal?.Title || articleData.Journal?.ISOAbbreviation || '');

      // 提取发布日期
      const publishedDate = this.extractPublishedDate(articleData.Journal?.JournalIssue?.PubDate);

      // 提取DOI和其他ID(单个 ArticleId 也是对象,先归一化再展开合并)
      const { doi, pmc } = this.extractArticleIds([
        ...this.asArray(articleData.ArticleIdList?.ArticleId),
        ...(pubmedData?.ArticleIdList ? this.asArray(pubmedData.ArticleIdList.ArticleId) : [])
      ]);

      // 提取页码
      const pages = articleData.Pagination?.MedlinePgn || '';

      // 构建URL
      const url = `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
      const pdfUrl = pmc ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmc}/pdf/` : '';

      return PaperFactory.create({
        paperId: pmid,
        title: this.cleanText(title),
        authors: authors,
        abstract: this.cleanText(abstract),
        doi: doi,
        publishedDate: publishedDate,
        pdfUrl: pdfUrl,
        url: url,
        source: 'pubmed',
        journal: journal,
        volume: articleData.Journal?.JournalIssue?.Volume || undefined,
        issue: articleData.Journal?.JournalIssue?.Issue || undefined,
        pages: pages || undefined,
        year: publishedDate?.getFullYear(),
        extra: {
          pmid: pmid,
          pmc: pmc || undefined
        }
      });
    } catch (error) {
      logDebug('Error parsing PubMed article:', error);
      return null;
    }
  }

  /**
   * 提取作者信息
   */
  private extractAuthors(authorList: any[]): string[] {
    if (!Array.isArray(authorList)) {
      return [];
    }

    return authorList.map(author => {
      if (author.CollectiveName) {
        return author.CollectiveName;
      }
      
      const lastName = author.LastName || '';
      const foreName = author.ForeName || author.Initials || '';
      
      if (lastName && foreName) {
        return `${lastName}, ${foreName}`;
      } else if (lastName) {
        return lastName;
      } else if (foreName) {
        return foreName;
      }
      
      return 'Unknown Author';
    }).filter(name => name && name !== 'Unknown Author');
  }

  /**
   * 提取摘要
   */
  private extractAbstract(abstractData: any): string {
    if (!abstractData) {
      return '';
    }

    if (typeof abstractData.AbstractText === 'string') {
      return abstractData.AbstractText;
    }

    if (Array.isArray(abstractData.AbstractText)) {
      return abstractData.AbstractText.join(' ');
    }

    return '';
  }

  /**
   * 提取发布日期
   */
  private extractPublishedDate(pubDate: any): Date | null {
    if (!pubDate) {
      return null;
    }

    const year = pubDate.Year;
    const month = pubDate.Month;
    const day = pubDate.Day;

    if (year) {
      const monthNum = month ? this.parseMonth(month) : 1;
      const dayNum = day ? parseInt(day, 10) : 1;
      
      return new Date(parseInt(year, 10), monthNum - 1, dayNum);
    }

    return null;
  }

  /**
   * 解析月份（支持英文和数字）
   */
  private parseMonth(month: string): number {
    const monthMap: Record<string, number> = {
      'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
      'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12,
      'January': 1, 'February': 2, 'March': 3, 'April': 4, 'June': 6,
      'July': 7, 'August': 8, 'September': 9, 'October': 10, 'November': 11, 'December': 12
    };

    const mapped = monthMap[month];
    if (mapped) {
      return mapped;
    }

    const num = parseInt(month, 10);
    return (num >= 1 && num <= 12) ? num : 1;
  }

  /**
   * 提取文章ID（DOI、PMC等）
   */
  private extractArticleIds(articleIds: any[]): { doi: string; pmc: string } {
    let doi = '';
    let pmc = '';

    if (Array.isArray(articleIds)) {
      for (const id of articleIds) {
        const idType = id.$?.IdType?.toLowerCase();
        const value = id._;

        if (idType === 'doi' && !doi) {
          doi = value;
        } else if (idType === 'pmc' && !pmc) {
          pmc = value;
        }
      }
    }

    return { doi, pmc };
  }

  /**
   * PubMed通常不支持直接PDF下载
   */
  async downloadPdf(paperId: string, options?: DownloadOptions): Promise<string> {
    // 尝试获取PMC链接
    const paper = await this.getPaperByPmid(paperId);
    if (paper?.extra?.pmc) {
      const pmcUrl = `https://www.ncbi.nlm.nih.gov/pmc/articles/${paper.extra.pmc}/pdf/`;
      throw new Error(`PubMed paper may be available as PDF at PMC: ${pmcUrl}. Direct download not supported through this API.`);
    }
    
    throw new Error('PubMed does not support direct PDF download. Please access the paper through the publisher or PMC.');
  }

  /**
   * PubMed不提供全文内容
   */
  async readPaper(paperId: string, options?: DownloadOptions): Promise<string> {
    throw new Error('PubMed does not provide full-text content. Only abstracts and metadata are available.');
  }

  /**
   * 根据PMID获取论文信息
   * PMID不存在时 efetch 返回空结果集,自然落到 null;网络/限流/服务端错误则向上抛出(由 ErrorHandler 统一处理),
   * 不再吞错伪装成"无结果"。
   */
  async getPaperByPmid(pmid: string): Promise<Paper | null> {
    const papers = await this.fetchPaperDetails([pmid]);
    return papers.length > 0 ? papers[0] : null;
  }

  /**
   * 根据DOI获取论文信息
   * 先校验 DOI 格式,不合法直接返回 null;搜索结果为空返回 null;网络/限流错误向上抛出。
   */
  async getPaperByDoi(doi: string): Promise<Paper | null> {
    const clean = sanitizeDoi(doi);
    if (!clean.valid) {
      return null;
    }
    const results = await this.search(`"${clean.sanitized}"[DOI]`, { maxResults: 1 });
    return results.length > 0 ? results[0] : null;
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
      return true; // 无API密钥时总是有效（使用免费限制）
    }

    try {
      await this.search('test', { maxResults: 1 });
      return true;
    } catch (error: any) {
      // API密钥无效通常返回400或403错误
      if (error.response?.status === 400 || error.response?.status === 403) {
        return false;
      }
      // 其他错误可能是网络问题，认为密钥可能有效
      return true;
    }
  }
}