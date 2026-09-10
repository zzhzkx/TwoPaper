/**
 * AggregateSearch — 真聚合搜索引擎。
 * 并发查询多个可用平台（Promise.allSettled），按 DOI→标题 去重、来源标注、平台级异常隔离。
 * 排除 scihub（search 语义为 DOI/URL 非关键词）与 scholar（代理/封禁风险，可用开关开启）。
 * 每平台配额 = ceil(maxResults / n) + 1，总量受 maxResults 约束。
 */
import type { Searchers } from '../mcp/searchers.js';
import type { Paper } from '../models/Paper.js';
import type { SearchOptions } from '../platforms/PaperSource.js';
export interface AggregateFailure {
    platform: string;
    error: string;
}
export interface AggregatedResult {
    papers: Paper[];
    failures: AggregateFailure[];
    sourcesHit: string[];
}
/**
 * 聚合搜索。searchers 为完整注册表；默认聚合用到的平台子集在函数内筛选。
 */
export declare function aggregateSearch(searchers: Searchers, query: string, options: SearchOptions, opts?: {
    includeScholar?: boolean;
    maxResults?: number;
}): Promise<AggregatedResult>;
export default aggregateSearch;
//# sourceMappingURL=AggregateSearch.d.ts.map