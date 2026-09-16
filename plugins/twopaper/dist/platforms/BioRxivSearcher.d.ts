/**
 * bioRxiv API集成模块
 * 支持bioRxiv和medRxiv预印本论文搜索
 */
import { Paper } from '../models/Paper.js';
import { PaperSource, SearchOptions, DownloadOptions, PlatformCapabilities } from './PaperSource.js';
interface BioRxivSearchOptions extends SearchOptions {
    /** 搜索天数范围 */
    days?: number;
    /** 服务器类型 */
    server?: 'biorxiv' | 'medrxiv';
}
export declare class BioRxivSearcher extends PaperSource {
    private readonly serverType;
    private readonly rateLimiter;
    /** bioRxiv/medRxiv API 单页返回条数(服务端按日/自然限幅,响应中 count 字段给出) */
    private readonly pageSize;
    /** 早于此日期无数据（bioRxiv 始于 2013，medRxiv 始于 2019），用固定下界避免按"天数"推算 */
    private readonly EARLIEST_DATE;
    /** 关键词扫描最多翻的页数（每页 30 条），与墙钟封顶共同约束成本 */
    private readonly MAX_SCAN_PAGES;
    /** 关键词扫描的墙钟预算：超出即返回已攒到的命中，避免把调用方（尤其聚合）拖到超时 */
    private readonly SCAN_DEADLINE_MS;
    constructor(serverType?: 'biorxiv' | 'medrxiv');
    getCapabilities(): PlatformCapabilities;
    /**
     * 搜索bioRxiv/medRxiv论文
     */
    search(query: string, options?: BioRxivSearchOptions): Promise<Paper[]>;
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
    private searchByKeywordScan;
    /**
     * 根据DOI获取论文信息
     */
    getPaperByDoi(doi: string): Promise<Paper | null>;
    /**
     * 下载PDF文件(使用无版本号的全文链接,自动落到最新版本,避免 v1 硬编码下载到旧版)
     */
    downloadPdf(paperId: string, options?: DownloadOptions): Promise<string>;
    /**
     * 读取论文全文内容
     */
    readPaper(paperId: string, options?: DownloadOptions): Promise<string>;
    /**
     * 解析搜索响应
     */
    private parseSearchResponse;
    /**
     * 解析单个bioRxiv论文
     */
    private parseBioRxivPaper;
}
/**
 * medRxiv搜索器 - 继承自BioRxivSearcher
 */
export declare class MedRxivSearcher extends BioRxivSearcher {
    constructor();
}
export {};
//# sourceMappingURL=BioRxivSearcher.d.ts.map