/**
 * AggregateSearch — 真聚合搜索引擎。
 * 并发查询多个可用平台（Promise.allSettled），按 DOI→标题 去重、来源标注、平台级异常隔离。
 * 排除 scihub（search 语义为 DOI/URL 非关键词）与 scholar（代理/封禁风险，可用开关开启）。
 * 每平台配额 = ceil(maxResults / n) + 1，总量受 maxResults 约束。
 */
import { logDebug } from '../utils/Logger.js';
function normalizeTitle(title) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '').trim();
}
function dedupKey(paper) {
    if (paper.doi)
        return `doi:${paper.doi.toLowerCase()}`;
    if (paper.title)
        return `title:${normalizeTitle(paper.title)}`;
    return `id:${paper.paperId}`;
}
/**
 * 聚合搜索。searchers 为完整注册表；默认聚合用到的平台子集在函数内筛选。
 */
export async function aggregateSearch(searchers, query, options, opts = {}) {
    const maxResults = opts.maxResults || options.maxResults || 10;
    // 参与聚合的平台：有 search 能力且（无需 key 或已配 key）；排除 scihub / scholar（除非显式开启）。
    const enabled = Object.keys(searchers).filter((name) => !['wos', 'scholar', 'scihub'].includes(String(name)) &&
        (String(name) !== 'googlescholar' || !!opts.includeScholar));
    const perPlatform = Math.max(1, Math.ceil(maxResults / Math.max(1, enabled.length)) + 1);
    const settled = await Promise.allSettled(enabled.map(async (name) => {
        const searcher = searchers[name];
        if (!searcher || typeof searcher.search !== 'function')
            return [];
        const caps = searcher.getCapabilities?.();
        if (!caps?.search)
            return [];
        if (caps.requiresApiKey && !searcher.hasApiKey?.())
            return [];
        const results = await searcher.search(query, {
            ...options,
            maxResults: perPlatform
        });
        return Array.isArray(results) ? results : [];
    }));
    const failures = [];
    const byKey = new Map();
    for (let i = 0; i < enabled.length; i++) {
        const name = String(enabled[i]);
        const result = settled[i];
        if (result.status === 'rejected') {
            failures.push({ platform: name, error: String(result.reason?.message || result.reason) });
            continue;
        }
        for (const paper of result.value) {
            const key = dedupKey(paper);
            const existing = byKey.get(key);
            if (!existing) {
                byKey.set(key, { ...paper, extra: { ...(paper.extra || {}), altSources: [name] } });
            }
            else {
                const alt = new Set(existing.extra?.altSources || [name]);
                alt.add(name);
                byKey.set(key, { ...existing, extra: { ...(existing.extra || {}), altSources: [...alt] } });
            }
        }
    }
    const papers = [...byKey.values()].slice(0, maxResults);
    const sourcesHit = [...new Set(papers.flatMap((p) => p.extra?.altSources || []))];
    logDebug(`AggregateSearch: ${papers.length} papers from [${sourcesHit.join(',')}]`);
    return { papers, failures, sourcesHit };
}
export default aggregateSearch;
//# sourceMappingURL=AggregateSearch.js.map