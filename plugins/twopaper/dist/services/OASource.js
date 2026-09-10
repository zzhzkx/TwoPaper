/**
 * OASource — 合法开放获取(OA)PDF 定位源。
 * 从 scansci-pdf 公开层（Apache-2.0）的思路重实现的合法公开 API 层：
 * Unpaywall / OpenAlex / Europe PMC 逐个尝试，返回可下载的 PDF 直链与许可信息。
 * 每个源按其官方限流配置设置 RateLimiter；搜索阶段不额外做硬限制，仅尊重渠道限流。
 */
import axios from 'axios';
import { RateLimiter } from '../utils/RateLimiter.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';
import { API_ENDPOINTS, TIMEOUTS, USER_AGENT } from '../config/constants.js';
import { logDebug } from '../utils/Logger.js';
export class OASource {
    client;
    unpaywallLimiter;
    openalexLimiter;
    europepmcLimiter;
    email;
    constructor() {
        this.client = axios.create({
            timeout: TIMEOUTS.DEFAULT,
            headers: { 'Accept': 'application/json', 'User-Agent': USER_AGENT }
        });
        // Unpaywall 礼貌池依赖 email；OpenAlex key+credits 模式（硬限 100rps）；Europe PMC ~10rps。
        this.unpaywallLimiter = new RateLimiter({ requestsPerSecond: 1, burstCapacity: 2 });
        this.openalexLimiter = new RateLimiter({ requestsPerSecond: 5, burstCapacity: 10 });
        this.europepmcLimiter = new RateLimiter({ requestsPerSecond: 5, burstCapacity: 10 });
        this.email = process.env.OA_EMAIL || '';
    }
    /** 按 DOI 定位合法 OA PDF。按顺序尝试 Unpaywall → OpenAlex → Europe PMC，首个命中即返回。 */
    async findPdfByDoi(doi) {
        const candidates = [this.fromUnpaywall(doi), this.fromOpenAlex(doi)];
        if (this.email)
            candidates.push(this.fromEuropePmcByDoi(doi));
        for (const attempt of candidates) {
            try {
                const loc = await attempt;
                if (loc)
                    return loc;
            }
            catch (err) {
                logDebug(`OASource findPdfByDoi (${doi}) partial error: ${err.message}`);
            }
        }
        return null;
    }
    /** 按标题+年份（可选）定位合法 OA PDF。仅走 Europe PMC 全文检索与 Unpaywall(需 DOI，故跳过)。 */
    async findPdfByTitle(title, year) {
        if (!this.email)
            return null;
        try {
            return await this.fromEuropePmcByTitle(title, year);
        }
        catch (err) {
            logDebug(`OASource findPdfByTitle partial error: ${err.message}`);
            return null;
        }
    }
    async fromUnpaywall(doi) {
        if (!this.email)
            return null; // Unpaywall 需要 email
        await this.unpaywallLimiter.waitForPermission();
        const res = await ErrorHandler.retryWithBackoff(() => this.client.get(`https://api.unpaywall.org/v2/${encodeURIComponent(doi)}`, {
            params: { email: this.email }
        }), { context: 'Unpaywall OA lookup' });
        const url = res?.data?.best_oa_location?.url_for_pdf;
        if (!url)
            return null;
        return { url, source: 'unpaywall', license: res.data.best_oa_location?.license, version: res.data.best_oa_location?.version };
    }
    async fromOpenAlex(doi) {
        await this.openalexLimiter.waitForPermission();
        const res = await ErrorHandler.retryWithBackoff(() => this.client.get(`${API_ENDPOINTS.OPENALEX}/works/https://doi.org/${encodeURIComponent(doi)}`, {
            headers: this.openalexKeyHeaders()
        }), { context: 'OpenAlex OA lookup' });
        const best = res?.data?.best_oa_location;
        const url = best?.pdf_url || best?.landing_page_url;
        if (!url)
            return null;
        return { url, source: 'openalex', license: best?.license };
    }
    async fromEuropePmcByDoi(doi) {
        await this.europepmcLimiter.waitForPermission();
        const res = await ErrorHandler.retryWithBackoff(() => this.client.get(`${API_ENDPOINTS.EUROPEPMC}/search`, {
            params: { query: `DOI:${doi}`, format: 'json', resultType: 'core' }
        }), { context: 'Europe PMC DOI lookup' });
        const hit = res?.data?.resultList?.result?.[0];
        const fullText = hit?.fullTextUrlList?.fullTextUrl?.find((u) => u.documentStyle?.toLowerCase?.().includes('pdf'));
        const url = fullText?.url || hit?.fullTextUrlList?.fullTextUrl?.[0]?.url;
        if (!url)
            return null;
        return { url, source: 'europepmc', license: hit?.license };
    }
    async fromEuropePmcByTitle(title, year) {
        await this.europepmcLimiter.waitForPermission();
        const query = year && /^\d{4}$/.test(year) ? `TITLE:"${title}" AND PUB_YEAR:${year}` : `TITLE:"${title}"`;
        const res = await ErrorHandler.retryWithBackoff(() => this.client.get(`${API_ENDPOINTS.EUROPEPMC}/search`, {
            params: { query, format: 'json', resultType: 'core' }
        }), { context: 'Europe PMC title lookup' });
        const hit = res?.data?.resultList?.result?.[0];
        if (!hit)
            return null;
        const url = hit?.fullTextUrlList?.fullTextUrl?.find((u) => u.documentStyle?.toLowerCase?.().includes('pdf'))?.url
            || hit?.fullTextUrlList?.fullTextUrl?.[0]?.url;
        if (!url)
            return null;
        return { url, source: 'europepmc', license: hit?.license };
    }
    openalexKeyHeaders() {
        const key = process.env.OPENALEX_API_KEY;
        return key ? { 'x-api-key': key } : {};
    }
}
export default OASource;
//# sourceMappingURL=OASource.js.map