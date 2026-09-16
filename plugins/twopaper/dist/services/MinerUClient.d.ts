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
export interface MinerUResult {
    markdown: string;
    sourcePdf: string;
    cachePath: string;
    imagesDir: string;
    imageCount: number;
    modelVersion: string;
    degradedToText: boolean;
}
export declare class MinerUClient {
    private token;
    private outputDir;
    private fetchImpl;
    private readonly baseUrl;
    constructor(opts?: {
        token?: string;
        outputDir?: string;
        fetchImpl?: typeof fetch;
        baseUrl?: string;
    });
    get hasToken(): boolean;
    /**
     * 把本地 PDF 转成 Markdown。未配 token 时抛错（调用方决定是否降级到 readPaper）。
     */
    pdfToMarkdown(pdfPath: string): Promise<MinerUResult>;
    private requestBatch;
    private pollBatch;
    private downloadZip;
    /**
     * 从结果 zip 中解出 Markdown 与配图。
     * - `full.md` → markdown（优先），否则任一 .md
     * - `images/**` → 配图缓冲（保持原相对路径，MD 里就是按 images/<sha>.jpg 引用）
     */
    private extractFromZip;
    /**
     * 落盘 Markdown 与配图。**与源 PDF 同目录同名**（论文各自一个文件夹时即为该文件夹内）：
     *   <pdf 同目录>/<pdf 基名>.md
     *   <pdf 同目录>/images/<sha>.jpg
     * PDF 不在输出根下（外部 PDF）时回退到 outputDir。
     */
    private writeOutputs;
    private raiseHttp;
    /** 带 AbortController 超时的 fetch，避免网络半开时 Promise 永久挂起。 */
    private fetchWithTimeout;
    private sleep;
}
export default MinerUClient;
//# sourceMappingURL=MinerUClient.d.ts.map