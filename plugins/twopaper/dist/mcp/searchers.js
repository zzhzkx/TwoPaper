import { ArxivSearcher } from '../platforms/ArxivSearcher.js';
import { WebOfScienceSearcher } from '../platforms/WebOfScienceSearcher.js';
import { PubMedSearcher } from '../platforms/PubMedSearcher.js';
import { BioRxivSearcher, MedRxivSearcher } from '../platforms/BioRxivSearcher.js';
import { SemanticScholarSearcher } from '../platforms/SemanticScholarSearcher.js';
import { IACRSearcher } from '../platforms/IACRSearcher.js';
import { GoogleScholarSearcher } from '../platforms/GoogleScholarSearcher.js';
import { SciHubSearcher } from '../platforms/SciHubSearcher.js';
import { ScienceDirectSearcher } from '../platforms/ScienceDirectSearcher.js';
import { SpringerSearcher } from '../platforms/SpringerSearcher.js';
import { WileySearcher } from '../platforms/WileySearcher.js';
import { ScopusSearcher } from '../platforms/ScopusSearcher.js';
import { CrossrefSearcher } from '../platforms/CrossrefSearcher.js';
import { logDebug } from '../utils/Logger.js';
let searchers = null;
/** 注册表中的别名 key（与真实 key 指向同一实例），检索/聚合时按实例去重，避免同一渠道被查两次。 */
const ALIAS_KEYS = new Set(['wos', 'scholar']);
/**
 * 参与"跨平台检索"的渠道名单（聚合搜索、跨平台 DOI 查找共用）。
 *
 * 按**实例**去重而非按 key 字符串：注册表同时保留真实 key（`googlescholar`）与别名（`scholar`），
 * 早期实现只排除别名，导致 `googlescholar` 实际从未被排除——每次 DOI 查找白等约 28s 反爬。
 *
 * @param opts.includeScholar 显式允许 Google Scholar（反爬风险，默认排除）
 * @param opts.exclude        额外排除的渠道名（如 Sci-Hub：其 search 语义是 DOI/URL 而非关键词）
 */
export function selectSearchable(registry, opts = {}) {
    const extra = new Set(opts.exclude || []);
    const seenInstances = new Set();
    const picked = [];
    for (const [key, searcher] of Object.entries(registry)) {
        if (ALIAS_KEYS.has(key) || extra.has(key))
            continue;
        // 同一实例只取第一个真实 key（别名已在上一步过滤）
        if (seenInstances.has(searcher))
            continue;
        seenInstances.add(searcher);
        if (key === 'googlescholar' && !opts.includeScholar)
            continue;
        picked.push([key, searcher]);
    }
    return picked;
}
export function initializeSearchers() {
    if (searchers)
        return searchers;
    logDebug('Initializing searchers...');
    const arxivSearcher = new ArxivSearcher();
    const wosSearcher = new WebOfScienceSearcher(process.env.WOS_API_KEY, process.env.WOS_API_VERSION);
    const pubmedSearcher = new PubMedSearcher(process.env.PUBMED_API_KEY);
    const biorxivSearcher = new BioRxivSearcher('biorxiv');
    const medrxivSearcher = new MedRxivSearcher();
    const semanticSearcher = new SemanticScholarSearcher(process.env.SEMANTIC_SCHOLAR_API_KEY);
    const iacrSearcher = new IACRSearcher();
    const googleScholarSearcher = new GoogleScholarSearcher();
    const sciHubSearcher = new SciHubSearcher();
    const scienceDirectSearcher = new ScienceDirectSearcher(process.env.ELSEVIER_API_KEY);
    const springerSearcher = new SpringerSearcher(process.env.SPRINGER_API_KEY, process.env.SPRINGER_OPENACCESS_API_KEY);
    const wileySearcher = new WileySearcher(process.env.WILEY_TDM_TOKEN);
    const scopusSearcher = new ScopusSearcher(process.env.ELSEVIER_API_KEY);
    const crossrefSearcher = new CrossrefSearcher(process.env.CROSSREF_MAILTO);
    searchers = {
        arxiv: arxivSearcher,
        webofscience: wosSearcher,
        pubmed: pubmedSearcher,
        wos: wosSearcher,
        biorxiv: biorxivSearcher,
        medrxiv: medrxivSearcher,
        semantic: semanticSearcher,
        iacr: iacrSearcher,
        googlescholar: googleScholarSearcher,
        scholar: googleScholarSearcher,
        scihub: sciHubSearcher,
        sciencedirect: scienceDirectSearcher,
        springer: springerSearcher,
        wiley: wileySearcher,
        scopus: scopusSearcher,
        crossref: crossrefSearcher
    };
    logDebug('Searchers initialized successfully');
    return searchers;
}
//# sourceMappingURL=searchers.js.map