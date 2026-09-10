/**
 * PlatformRegistry — 统一渠道状态目录与四态判定。
 * 静态声明式能力表 + 运行时结合 searchers 的 hasApiKey/validateApiKey 产出
 * UNCONFIGURED / OK / NEED_LOGIN / DEGRADED 状态矩阵，供 get_platform_status 使用。
 */
// 静态能力目录（对应本地 13 平台 + OA 源）。
const CATALOG = [
    { platform: 'arxiv', ability: { search: true, download: true, fulltext: true }, setupHint: 'Free, no key needed' },
    { platform: 'webofscience', ability: { search: true, download: false, fulltext: false }, requiresApiKey: true, keyEnv: 'WOS_API_KEY', setupHint: 'https://developer.clarivate.com/apis' },
    { platform: 'pubmed', ability: { search: true, download: false, fulltext: false }, optionalKey: true, keyEnv: 'PUBMED_API_KEY', setupHint: 'https://www.ncbi.nlm.nih.gov/books/NBK25497/ (optional key raises 3→10 rps)' },
    { platform: 'biorxiv', ability: { search: true, download: true, fulltext: true }, setupHint: 'Free, no key needed' },
    { platform: 'medrxiv', ability: { search: true, download: true, fulltext: true }, setupHint: 'Free, no key needed' },
    { platform: 'semantic', ability: { search: true, download: true, fulltext: false }, optionalKey: true, keyEnv: 'SEMANTIC_SCHOLAR_API_KEY', setupHint: 'https://www.semanticscholar.org/product/api (optional key)' },
    { platform: 'iacr', ability: { search: true, download: true, fulltext: true }, setupHint: 'Free, no key needed' },
    { platform: 'googlescholar', ability: { search: true, download: false, fulltext: false }, loginType: 'sso', setupHint: 'Scraping; needs proxy, may need captcha/login' },
    { platform: 'scihub', ability: { search: false, download: true, fulltext: false }, setupHint: 'Grey source; DOI-only. Use with caution.' },
    { platform: 'sciencedirect', ability: { search: true, download: false, fulltext: false }, requiresApiKey: true, keyEnv: 'ELSEVIER_API_KEY', setupHint: 'https://dev.elsevier.com/apikey/manage' },
    { platform: 'springer', ability: { search: true, download: true, fulltext: false }, requiresApiKey: true, keyEnv: 'SPRINGER_API_KEY', setupHint: 'https://dev.springernature.com/signup' },
    { platform: 'wiley', ability: { search: false, download: true, fulltext: true }, requiresApiKey: true, keyEnv: 'WILEY_TDM_TOKEN', setupHint: 'https://onlinelibrary.wiley.com/library-info/resources/text-and-datamining (DOI download only)' },
    { platform: 'scopus', ability: { search: true, download: false, fulltext: false }, requiresApiKey: true, keyEnv: 'ELSEVIER_API_KEY', setupHint: 'https://dev.elsevier.com/apikey/manage' },
    { platform: 'crossref', ability: { search: true, download: false, fulltext: false }, setupHint: 'Free; mailto polite pool recommended' },
    { platform: 'oa', ability: { search: false, download: true, fulltext: false }, setupHint: 'Unpaywall needs OA_EMAIL; OpenAlex optional OPENALEX_API_KEY' }
];
export class PlatformRegistry {
    catalog;
    constructor(extra = []) {
        this.catalog = [...CATALOG, ...extra];
    }
    /** 汇总所有平台状态。validate=true 时对需要 key 的平台做真实校验（may hit upstream）。 */
    async getStatus(searchers, validate = false) {
        const rows = [];
        for (const entry of this.catalog) {
            const searcher = this.lookupSearcher(searchers, entry.platform);
            let status;
            let configured = false;
            if (entry.requiresApiKey) {
                const has = searcher?.hasApiKey?.() ?? false;
                configured = has;
                if (!has) {
                    status = 'UNCONFIGURED';
                }
                else if (validate) {
                    const valid = await searcher?.validateApiKey?.().catch(() => false);
                    status = valid ? 'OK' : 'UNCONFIGURED';
                }
                else {
                    status = 'OK';
                }
            }
            else if (entry.optionalKey) {
                const has = searcher?.hasApiKey?.() ?? false;
                configured = has;
                status = has ? 'OK' : 'DEGRADED';
            }
            else if (entry.loginType && entry.loginType !== 'none') {
                configured = false;
                status = 'NEED_LOGIN';
            }
            else {
                configured = true;
                status = 'OK';
            }
            rows.push({ ...entry, status, configured });
        }
        return rows;
    }
    lookupSearcher(searchers, platform) {
        if (platform === 'oa')
            return undefined; // OA 源是服务，不是 searcher
        const key = platform;
        return searchers[key];
    }
}
export default PlatformRegistry;
//# sourceMappingURL=PlatformRegistry.js.map