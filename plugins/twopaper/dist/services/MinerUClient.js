/**
 * MinerUClient — 内集成 MinerU Precise API，把本地 PDF 转成干净 Markdown（供宿主 Agent 分析）。
 * 流程（依据 mineru.net/apiManage/docs）：
 *   POST /api/v4/file-urls/batch  → 签名上传 URL
 *   PUT <url> 上传本地 PDF（无 Content-Type）
 *   轮询 GET /api/v4/extract-results/batch/{batch_id} 直到 done
 *   下载 full_zip_url → 用 adm-zip 解出 full.md
 * 依赖 MINERU_TOKEN（Precise API，≤200MB/200页，日 1000 页限定）。
 */
import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
import { API_ENDPOINTS, TIMEOUTS } from '../config/constants.js';
const DEFAULT_MODEL = 'vlm';
export class MinerUClient {
    token;
    outputDir;
    fetchImpl;
    baseUrl;
    constructor(opts = {}) {
        this.token = opts.token || process.env.MINERU_TOKEN || '';
        this.outputDir = opts.outputDir || process.env.MINERU_OUTPUT_DIR || './fulltext';
        this.fetchImpl = opts.fetchImpl || fetch;
        this.baseUrl = opts.baseUrl || API_ENDPOINTS.MINERU;
    }
    get hasToken() {
        return !!this.token;
    }
    /**
     * 把本地 PDF 转成 Markdown。未配 token 时抛错（调用方决定是否降级到 readPaper）。
     */
    async pdfToMarkdown(pdfPath) {
        if (!this.token) {
            throw new Error('MINERU_TOKEN not configured; cannot use MinerU full-text parsing');
        }
        const stat = fs.statSync(pdfPath);
        if (stat.size > 200 * 1024 * 1024) {
            throw new Error(`PDF ${pdfPath} exceeds MinerU 200MB limit`);
        }
        const name = path.basename(pdfPath);
        // 1. 申请签名上传 URL
        const batch = await this.requestBatch(name);
        const uploadUrl = batch.uploadUrl;
        if (!uploadUrl)
            throw new Error('MinerU: no signed upload URL returned');
        // 2. 上传文件
        const fileBuffer = fs.readFileSync(pdfPath);
        const putRes = await this.fetchWithTimeout(uploadUrl, {
            method: 'PUT',
            body: new Uint8Array(fileBuffer)
        }, TIMEOUTS.DOWNLOAD);
        if (!putRes.ok)
            throw new Error(`MinerU upload failed: HTTP ${putRes.status}`);
        // 3. 轮询任务结果
        const zipUrl = await this.pollBatch(batch.batchId, name);
        // 4. 下载 zip 并解出 full.md
        const md = await this.downloadMarkdown(zipUrl);
        const cachePath = await this.cacheMarkdown(name, md);
        return {
            markdown: md,
            sourcePdf: pdfPath,
            cachePath,
            modelVersion: DEFAULT_MODEL,
            degradedToText: false
        };
    }
    async requestBatch(name) {
        const res = await this.fetchWithTimeout(`${this.baseUrl}/file-urls/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
            body: JSON.stringify({ files: [{ name, data_id: 'twopaper_pdf' }], model_version: DEFAULT_MODEL })
        }, TIMEOUTS.EXTENDED);
        this.raiseHttp(res, 'file-urls/batch');
        const data = await res.json();
        // file_urls 曾为 [{url}]，现为 ["<url>"]（2026-09 实测）；两种都兼容。
        const first = data?.data?.file_urls?.[0];
        const fileUrl = typeof first === 'string' ? first : first?.url;
        return { batchId: data?.data?.batch_id, uploadUrl: fileUrl };
    }
    async pollBatch(batchId, name) {
        const deadline = Date.now() + TIMEOUTS.BATCH + 60_000;
        while (Date.now() < deadline) {
            const res = await this.fetchWithTimeout(`${this.baseUrl}/extract-results/batch/${batchId}`, {
                headers: { Authorization: `Bearer ${this.token}` }
            }, TIMEOUTS.HEALTH_CHECK);
            if (res.ok) {
                const data = await res.json();
                const item = (data?.data?.extract_result || []).find((r) => r.file_name === name);
                if (item) {
                    if (item.state === 'done')
                        return item.full_zip_url;
                    if (item.state === 'failed')
                        throw new Error(`MinerU parse failed: ${item.err_msg || 'unknown'}`);
                }
            }
            await this.sleep(3000);
        }
        throw new Error('MinerU parse timed out');
    }
    async downloadMarkdown(zipUrl) {
        const res = await this.fetchWithTimeout(zipUrl, {}, TIMEOUTS.DOWNLOAD);
        if (!res.ok)
            throw new Error(`MinerU zip download failed: HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const zip = new AdmZip(buf);
        const entries = zip.getEntries();
        const mdEntry = entries.find((e) => !e.isDirectory && /full\.md$/i.test(e.entryName))
            || entries.find((e) => !e.isDirectory && e.entryName.endsWith('.md'));
        if (!mdEntry)
            throw new Error('MinerU zip did not contain a markdown file');
        return mdEntry.getData().toString('utf-8');
    }
    async cacheMarkdown(name, markdown) {
        fs.mkdirSync(this.outputDir, { recursive: true });
        const base = name.replace(/\.pdf$/i, '');
        const target = path.join(this.outputDir, `${base}.full.md`);
        fs.writeFileSync(target, markdown, 'utf-8');
        return target;
    }
    raiseHttp(res, op) {
        if (!res.ok) {
            throw new Error(`MinerU ${op} failed: HTTP ${res.status}`);
        }
    }
    /** 带 AbortController 超时的 fetch，避免网络半开时 Promise 永久挂起。 */
    async fetchWithTimeout(url, init, timeoutMs) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await this.fetchImpl(url, { ...init, signal: controller.signal });
        }
        finally {
            clearTimeout(timer);
        }
    }
    async sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }
}
export default MinerUClient;
//# sourceMappingURL=MinerUClient.js.map