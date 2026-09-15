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
export interface Searchers {
    arxiv: ArxivSearcher;
    webofscience: WebOfScienceSearcher;
    pubmed: PubMedSearcher;
    wos: WebOfScienceSearcher;
    biorxiv: BioRxivSearcher;
    medrxiv: MedRxivSearcher;
    semantic: SemanticScholarSearcher;
    iacr: IACRSearcher;
    googlescholar: GoogleScholarSearcher;
    scholar: GoogleScholarSearcher;
    scihub: SciHubSearcher;
    sciencedirect: ScienceDirectSearcher;
    springer: SpringerSearcher;
    wiley: WileySearcher;
    scopus: ScopusSearcher;
    crossref: CrossrefSearcher;
}
/**
 * 参与"跨平台检索"的渠道名单（聚合搜索、跨平台 DOI 查找共用）。
 *
 * 按**实例**去重而非按 key 字符串：注册表同时保留真实 key（`googlescholar`）与别名（`scholar`），
 * 早期实现只排除别名，导致 `googlescholar` 实际从未被排除——每次 DOI 查找白等约 28s 反爬。
 *
 * @param opts.includeScholar 显式允许 Google Scholar（反爬风险，默认排除）
 * @param opts.exclude        额外排除的渠道名（如 Sci-Hub：其 search 语义是 DOI/URL 而非关键词）
 */
export declare function selectSearchable(registry: Searchers, opts?: {
    includeScholar?: boolean;
    exclude?: readonly string[];
}): Array<[string, Searchers[keyof Searchers]]>;
export declare function initializeSearchers(): Searchers;
//# sourceMappingURL=searchers.d.ts.map