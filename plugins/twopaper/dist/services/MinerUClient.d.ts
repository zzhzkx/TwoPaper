/**
 * MinerUClient — 内集成 MinerU Precise API，把本地 PDF 转成干净 Markdown（供宿主 Agent 分析）。
 * 流程（依据 mineru.net/apiManage/docs）：
 *   POST /api/v4/file-urls/batch  → 签名上传 URL
 *   PUT <url> 上传本地 PDF（无 Content-Type）
 *   轮询 GET /api/v4/extract-results/batch/{batch_id} 直到 done
 *   下载 full_zip_url → 用 adm-zip 解出 full.md
 * 依赖 MINERU_TOKEN（Precise API，≤200MB/200页，日 1000 页限定）。
 */
export interface MinerUResult {
    markdown: string;
    sourcePdf: string;
    cachePath: string;
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
    private downloadMarkdown;
    private cacheMarkdown;
    private raiseHttp;
    private sleep;
}
export default MinerUClient;
//# sourceMappingURL=MinerUClient.d.ts.map