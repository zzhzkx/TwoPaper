/**
 * BridgesClient — scansci 桥接客户端。
 * MCP 无 server→server 工具调用协议，TwoPaper 无法直接调 scansci MCP；桥接交由宿主/CLI。
 * 模式 GET_PDF_BRIDGE：
 *   none — 完全关闭桥接（paywalled 时仅报无法获取）
 *   hint —(默认)返回结构化指令块，宿主 Agent 读取后调用已注册的 scansci_pdf MCP 完成下载
 *   auto — child_process 调 scansci CLI（SCANSCI_CMD），复用其已登录 WebVPN 会话
 * TwoPaper 自身不持有 scansci 凭证；凭证留在 scansci MCP/CLI 侧。
 */
export type BridgeMode = 'none' | 'hint' | 'auto';
export interface BridgeHint {
    action: 'bridged_download';
    target: 'scansci';
    tool: string;
    identifier: string;
    reason: string;
    savePath?: string;
}
export interface BridgeProbe {
    mode: BridgeMode;
    configured: boolean;
    cliReachable: boolean;
    note: string;
}
export declare function currentBridgeMode(): BridgeMode;
export declare class BridgesClient {
    /** MCP 工具名（宿主侧已注册的 scansci-pdf server 工具）。 */
    readonly mcpTool = "scansci_pdf_download";
    /** 构造供宿主 Agent 调用的桥接指令块（hint 模式）。 */
    hint(identifier: string, savePath?: string): BridgeHint;
    /**
     * 只读探测：模式 + 是否配置了 CLI + CLI 是否在 PATH 中（不实际下载）。
     */
    probe(): BridgeProbe;
    /**
     * auto 模式：spawn scansci CLI 下载，返回 stdout（解析任务结果）。CLI 参数格式需按 SCANSCI_CMD 约定。
     */
    runAutoDownload(identifier: string, outputDir?: string): Promise<string>;
    private cmdAvailable;
}
export default BridgesClient;
//# sourceMappingURL=BridgesClient.d.ts.map