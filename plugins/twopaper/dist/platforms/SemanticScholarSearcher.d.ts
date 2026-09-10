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
import { Paper } from '../models/Paper.js';
import { PaperSource, SearchOptions, DownloadOptions, PlatformCapabilities } from './PaperSource.js';
interface SemanticSearchOptions extends SearchOptions {
    /** 发表年份范围 */
    year?: string;
    /** 研究领域过滤 (S2 已弃用 fieldsOfStudy,改用 s2FieldsOfStudy) */
    fieldsOfStudy?: string[];
}
export declare class SemanticScholarSearcher extends PaperSource {
    private readonly rateLimiter;
    private readonly cache;
    private readonly detailsCache;
    private readonly baseApiUrl;
    constructor(apiKey?: string);
    /** S2 Graph API 需要的字段集(search 与 details 共用) */
    private static readonly API_FIELDS;
    /** S2 Graph API 单次翻页最大 limit */
    private static readonly PAGE_LIMIT;
    /**
     * 带退避的请求封装。
     * 对 429 严格按服务端 Retry-After 头退避重试(免费层共享 IP 常被限流,
     * 仅用指数退避会连续 429);其余可重试错误用指数退避。耗尽后抛错。
     */
    private requestWithRetryBackoff;
    /** 构造统一请求头(含可选的 x-api-key) */
    private buildHeaders;
    getCapabilities(): PlatformCapabilities;
    /**
     * 搜索Semantic Scholar论文
     * 按 Graph API 的 offset/next 翻页取满 maxResults。
     */
    search(query: string, options?: SemanticSearchOptions): Promise<Paper[]>;
    /**
     * 获取论文详细信息
     * 走 detailsCache 缓存;404 视为"无结果"返回 null,其余错误上抛。
     */
    getPaperDetails(paperId: string): Promise<Paper | null>;
    /**
     * 下载PDF文件
     * 下载前通过 rateLimiter 节流,与其它请求共用限流器。
     */
    downloadPdf(paperId: string, options?: DownloadOptions): Promise<string>;
    /**
     * 读取论文全文内容
     */
    readPaper(paperId: string, options?: DownloadOptions): Promise<string>;
    /**
     * 根据DOI获取论文信息
     * 无效 DOI 返回 null;查无此论文(404)由 getPaperDetails 返回 null;
     * 网络/限流错误上抛。
     */
    getPaperByDoi(doi: string): Promise<Paper | null>;
    /**
     * 解析搜索响应
     */
    private parseSearchResponse;
    /**
     * 解析单个Semantic Scholar论文
     */
    private parseSemanticPaper;
    /**
     * 获取速率限制器状态
     */
    getRateLimiterStatus(): {
        availableTokens: number;
        maxTokens: number;
        requestsPerSecond: number;
        pendingRequests: number;
    };
    /**
     * 验证API密钥（如果提供）
     */
    validateApiKey(): Promise<boolean>;
}
export {};
//# sourceMappingURL=SemanticScholarSearcher.d.ts.map