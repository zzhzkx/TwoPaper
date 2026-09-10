/**
 * arXiv API集成模块
 * 基于arXiv API v1.1实现论文搜索和下载功能
 */
import { Paper } from '../models/Paper.js';
import { PaperSource, SearchOptions, DownloadOptions, PlatformCapabilities } from './PaperSource.js';
export declare class ArxivSearcher extends PaperSource {
    private readonly rateLimiter;
    private readonly cache;
    private readonly mailto;
    constructor(mailto?: string);
    getCapabilities(): PlatformCapabilities;
    /**
     * 搜索arXiv论文
     */
    search(query: string, options?: SearchOptions): Promise<Paper[]>;
    /**
     * 根据 DOI 获取论文信息。
     * arXiv 不提供 DOI 专用端点,但 DOI 查询必须先校验,且网络错误不能伪装成 null。
     */
    getPaperByDoi(doi: string): Promise<Paper | null>;
    /**
     * 下载PDF文件
     */
    downloadPdf(paperId: string, options?: DownloadOptions): Promise<string>;
    /**
     * 将(可能为 PDF 或压缩的)字节流完整写入文件。
     * 断流/写入失败时清理残留的半截文件,避免留下损坏的 PDF。
     */
    private writeStreamToFile;
    /**
     * 读取论文全文内容（从PDF中提取）
     */
    readPaper(paperId: string, options?: DownloadOptions): Promise<string>;
    /**
     * 构建搜索查询
     */
    private buildSearchQuery;
    /**
     * 映射排序字段
     */
    private mapSortField;
    /**
     * 从响应中提取总结果数
     */
    private extractTotalResults;
    /**
     * 解析搜索响应
     */
    private parseSearchResponse;
    /**
     * 解析单个arXiv条目
     */
    private parseArxivEntry;
}
//# sourceMappingURL=ArxivSearcher.d.ts.map