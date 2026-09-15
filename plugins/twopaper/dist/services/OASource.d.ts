/**
 * OASource — 合法开放获取(OA)PDF 定位源。
 * 从 scansci-pdf 公开层（Apache-2.0）的思路重实现的合法公开 API 层：
 * Unpaywall / OpenAlex / Europe PMC 逐个尝试，返回可下载的 PDF 直链与许可信息。
 * 每个源按其官方限流配置设置 RateLimiter；搜索阶段不额外做硬限制，仅尊重渠道限流。
 */
export interface OaLocation {
    url: string;
    source: 'unpaywall' | 'openalex' | 'europepmc';
    license?: string;
    version?: string;
}
export declare class OASource {
    private client;
    private readonly unpaywallLimiter;
    private readonly openalexLimiter;
    private readonly europepmcLimiter;
    private readonly email;
    /**
     * OA 源的重试策略：只对 429 重试 1 次。
     * 默认 retryWithBackoff(maxRetries=3) 是为"本方可恢复故障"设计的，套在第三方 OA 源上会把
     * 单源最坏墙钟放大到 4×超时+退避（实测可致 get_pdf 数分钟不返回）。
     * OA 源对确定性负结果（404/422）本就不该重试，仅 429 值得等一次。
     */
    private static readonly OA_RETRY;
    constructor();
    /** 按 DOI 定位合法 OA PDF。按顺序尝试 Unpaywall → OpenAlex → Europe PMC，首个命中即返回。 */
    findPdfByDoi(doi: string): Promise<OaLocation | null>;
    /** 按标题+年份（可选）定位合法 OA PDF。仅走 Europe PMC 全文检索与 Unpaywall(需 DOI，故跳过)。 */
    findPdfByTitle(title: string, year?: string): Promise<OaLocation | null>;
    private fromUnpaywall;
    private fromOpenAlex;
    private fromEuropePmcByDoi;
    private fromEuropePmcByTitle;
    private openalexKeyHeaders;
}
export default OASource;
//# sourceMappingURL=OASource.d.ts.map