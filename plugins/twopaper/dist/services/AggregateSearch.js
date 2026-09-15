/**
 * AggregateSearch — 真聚合搜索引擎。
 * 并发查询多个可用平台（Promise.allSettled），按 DOI→标题 去重、来源标注、平台级异常隔离。
 * 排除 scihub（search 语义为 DOI/URL 非关键词）与 scholar（代理/封禁风险，可用开关开启）。
 * 每平台配额 = ceil(maxResults / n) + 1，总量受 maxResults 约束。
 */
import { selectSearchable } from '../mcp/searchers.js';
import { withTimeout } from '../utils/SecurityUtils.js';
import { TIMEOUTS } from '../config/constants.js';
import { mapLimit } from '../utils/mapLimit.js';
import { logDebug } from '../utils/Logger.js';
/** 聚合时同时向外部平台发起的最大并发数（物理上限，避免一次打满全部渠道触发限流）。 */
const AGGREGATE_CONCURRENCY = 6;
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
    // 参与聚合的平台：按实例去重（排别名）并排除 scihub；googlescholar 默认关闭（反爬，单次可白等 25–30s）。
    const selected = selectSearchable(searchers, {
        includeScholar: opts.includeScholar,
        exclude: ['scihub']
    });
    const enabled = selected.map(([name]) => name);
    const perPlatform = Math.max(1, Math.ceil(maxResults / Math.max(1, enabled.length)) + 1);
    // 有界并发（防打爆各平台限流）+ 每平台整体超时（防单平台挂起拖死整次聚合）。
    // 每平台任务自捕获为 ok/fail，mapLimit 永不 reject → 聚合必然有界、失败隔离，绝不无限等待。
    const outcomes = await mapLimit(selected, AGGREGATE_CONCURRENCY, async ([name, searcher]) => {
        try {
            if (!searcher || typeof searcher.search !== 'function')
                return { ok: true, papers: [] };
            const caps = searcher.getCapabilities?.();
            if (!caps?.search)
                return { ok: true, papers: [] };
            if (caps.requiresApiKey && !searcher.hasApiKey?.())
                return { ok: true, papers: [] };
            const results = await withTimeout(searcher.search(query, { ...options, maxResults: perPlatform }), TIMEOUTS.DEFAULT, `${String(name)} search timed out`);
            return { ok: true, papers: Array.isArray(results) ? results : [] };
        }
        catch (e) {
            return { ok: false, error: String(e?.message || e) };
        }
    });
    const failures = [];
    const byKey = new Map();
    for (let i = 0; i < enabled.length; i++) {
        const name = String(enabled[i]);
        const outcome = outcomes[i];
        if (!outcome.ok) {
            failures.push({ platform: name, error: outcome.error });
            continue;
        }
        for (const paper of outcome.papers) {
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