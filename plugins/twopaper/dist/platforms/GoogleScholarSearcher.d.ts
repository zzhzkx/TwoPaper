/**
 * Google Scholar搜索器 - 网页抓取实现
 * 基于HTML解析，包含反检测机制、会话管理和代理支持
 */
import { Paper } from '../models/Paper.js';
import { PaperSource, SearchOptions, DownloadOptions, PlatformCapabilities } from './PaperSource.js';
interface GoogleScholarOptions extends SearchOptions {
    /** 语言设置 */
    language?: string;
    /** 时间范围（年份） */
    yearLow?: number;
    yearHigh?: number;
}
export declare class GoogleScholarSearcher extends PaperSource {
    private readonly scholarUrl;
    private readonly userAgents;
    private sessionCookies;
    private lastRequestTime;
    private consecutiveFailures;
    private readonly maxRetries;
    private readonly baseDelay;
    private readonly proxy;
    private readonly proxyConfig;
    constructor();
    getCapabilities(): PlatformCapabilities;
    /**
     * 搜索Google Scholar论文
     */
    search(query: string, options?: GoogleScholarOptions): Promise<Paper[]>;
    /**
     * 初始化会话 - 先访问主页获取cookie
     */
    private initializeSession;
    /**
     * 重置会话
     */
    private resetSession;
    /**
     * Google Scholar不支持直接PDF下载
     */
    downloadPdf(paperId: string, options?: DownloadOptions): Promise<string>;
    /**
     * Google Scholar不提供全文内容
     */
    readPaper(paperId: string, options?: DownloadOptions): Promise<string>;
    /**
     * 构建搜索参数
     */
    private buildSearchParams;
    /**
     * 发起Scholar请求（不自动重试，由search方法控制重试逻辑）
     */
    private makeScholarRequest;
    /**
     * 将 HTTP/HTTPS 代理环境变量转换为 Axios 原生配置。
     */
    private parseProxy;
    /**
     * 解析单个Scholar搜索结果
     */
    private parseScholarResult;
    /**
     * 提取作者信息
     */
    private extractAuthors;
    /**
     * 提取年份
     */
    private extractYear;
    /**
     * 提取期刊信息
     */
    private extractJournal;
    /**
     * 提取引用次数
     */
    private extractCitationCount;
    /**
     * 生成论文ID
     */
    private generatePaperId;
    /**
     * 简单哈希函数
     */
    private simpleHash;
    /**
     * 获取随机User-Agent
     */
    private getRandomUserAgent;
    /**
     * 自适应延迟 - 根据请求间隔动态调整
     */
    private adaptiveDelay;
    /**
     * 随机延迟
     */
    private randomDelay;
}
export {};
//# sourceMappingURL=GoogleScholarSearcher.d.ts.map