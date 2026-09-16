/**
 * MinerUClient — 内集成 MinerU Precise API，把本地 PDF 转成干净 Markdown（供宿主 Agent 分析）。
 * 流程（依据 mineru.net/apiManage/docs）：
 *   POST /api/v4/file-urls/batch  → 签名上传 URL
 *   PUT <url> 上传本地 PDF（无 Content-Type）
 *   轮询 GET /api/v4/extract-results/batch/{batch_id} 直到 done
 *   下载 full_zip_url → 用 adm-zip 解出 full.md 与配图
 * 依赖 MINERU_TOKEN（Precise API，≤200MB/200页，日 1000 页限定）。
 *
 * 产物布局（与 PDF 同处输出根，图片收进 images/）：
 *   <outputDir>/<name>.md           全文 Markdown
 *   <outputDir>/images/<sha>.jpg    Markdown 以 images/<sha>.jpg 相对引用，故放这里即可命中
 */
import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
import { API_ENDPOINTS, TIMEOUTS } from '../config/constants.js';
import { resolveOutputRoot } from '../utils/paths.js';
const DEFAULT_MODEL = 'vlm';
export class MinerUClient {
    token;
    outputDir;
    fetchImpl;
    baseUrl;
    constructor(opts = {}) {
        this.token = opts.token || process.env.MINERU_TOKEN || '';
        // 解析为绝对路径：返回给宿主的 cachePath 与写入位置完全一致、无歧义（与 PaperNamer 对齐）
        this.outputDir = path.resolve(opts.outputDir || process.env.MINERU_OUTPUT_DIR || resolveOutputRoot());
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
        // 4. 下载 zip 并解出 full.md + 配图
        const zip = await this.downloadZip(zipUrl);
        const { markdown: rawMd, images } = this.extractFromZip(zip, name);
        const cachePath = await this.writeOutputs(name, rawMd, images, pdfPath);
        return {
            markdown: rawMd,
            sourcePdf: pdfPath,
            cachePath,
            imagesDir: path.join(path.dirname(cachePath), 'images'),
            imageCount: images.length,
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
    async downloadZip(zipUrl) {
        const res = await this.fetchWithTimeout(zipUrl, {}, TIMEOUTS.DOWNLOAD);
        if (!res.ok)
            throw new Error(`MinerU zip download failed: HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        return new AdmZip(buf);
    }
    /**
     * 从结果 zip 中解出 Markdown 与配图。
     * - `full.md` → markdown（优先），否则任一 .md
     * - `images/**` → 配图缓冲（保持原相对路径，MD 里就是按 images/<sha>.jpg 引用）
     */
    extractFromZip(zip, _name) {
        const entries = zip.getEntries();
        const mdEntry = entries.find((e) => !e.isDirectory && /full\.md$/i.test(e.entryName))
            || entries.find((e) => !e.isDirectory && e.entryName.endsWith('.md'));
        if (!mdEntry)
            throw new Error('MinerU zip did not contain a markdown file');
        const images = entries
            .filter((e) => !e.isDirectory && /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(e.entryName))
            .map((e) => {
            // 归一化到 images/<basename>，与 Markdown 里的 images/<file> 引用对齐
            const base = e.entryName.split(/[\\/]/).pop();
            return { rel: `images/${base}`, data: e.getData() };
        });
        return { markdown: mdEntry.getData().toString('utf-8'), images };
    }
    /**
     * 落盘 Markdown 与配图。**与源 PDF 同目录同名**（论文各自一个文件夹时即为该文件夹内）：
     *   <pdf 同目录>/<pdf 基名>.md
     *   <pdf 同目录>/images/<sha>.jpg
     * PDF 不在输出根下（外部 PDF）时回退到 outputDir。
     */
    async writeOutputs(name, markdown, images, pdfPath) {
        const base = name.replace(/\.pdf$/i, '');
        const outRoot = path.resolve(this.outputDir);
        const absPdf = pdfPath ? path.resolve(pdfPath) : null;
        // PDF 在输出根内 → 产物与它同目录（<root>/<paper>/…）；否则回退输出根
        const dir = absPdf && absPdf.startsWith(outRoot + path.sep) ? path.dirname(absPdf) : outRoot;
        const target = path.join(dir, `${base}.md`);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(target, markdown, 'utf-8');
        if (images.length) {
            const imgDir = path.join(dir, 'images');
            fs.mkdirSync(imgDir, { recursive: true });
            for (const img of images) {
                const dest = path.join(dir, img.rel);
                fs.mkdirSync(path.dirname(dest), { recursive: true });
                fs.writeFileSync(dest, img.data);
            }
        }
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