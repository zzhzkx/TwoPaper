/**
 * BridgesClient — scansci 桥接客户端。
 * MCP 无 server→server 工具调用协议，TwoPaper 无法直接调 scansci MCP；桥接交由宿主/CLI。
 * 模式 GET_PDF_BRIDGE：
 *   none — 完全关闭桥接（paywalled 时仅报无法获取）
 *   hint —(默认)返回结构化指令块，宿主 Agent 读取后调用已注册的 scansci_pdf MCP 完成下载
 *   auto — child_process 调 scansci CLI（SCANSCI_CMD），复用其已登录 WebVPN 会话
 * TwoPaper 自身不持有 scansci 凭证；凭证留在 scansci MCP/CLI 侧。
 */
import { spawn } from 'child_process';
import * as fs from 'fs';
import { logDebug } from '../utils/Logger.js';
export function currentBridgeMode() {
    const raw = (process.env.GET_PDF_BRIDGE || 'hint').toLowerCase();
    return raw === 'none' || raw === 'auto' ? raw : 'hint';
}
export class BridgesClient {
    /** MCP 工具名（宿主侧已注册的 scansci-pdf server 工具）。 */
    mcpTool = 'scansci_pdf_download';
    /** 构造供宿主 Agent 调用的桥接指令块（hint 模式）。 */
    hint(identifier, savePath) {
        return {
            action: 'bridged_download',
            target: 'scansci',
            tool: this.mcpTool,
            identifier,
            reason: 'paywalled (no legal OA / platform PDF available)',
            savePath
        };
    }
    /**
     * 只读探测：模式 + 是否配置了 CLI + CLI 是否在 PATH 中（不实际下载）。
     */
    probe() {
        const mode = currentBridgeMode();
        const cmd = process.env.SCANSCI_CMD || 'python -m scansci_pdf';
        const configured = mode !== 'none';
        const cliReachable = mode === 'auto' && this.cmdAvailable(cmd);
        const note = mode === 'none'
            ? 'Bridging disabled'
            : mode === 'auto'
                ? `CLI: ${cmd} ${cliReachable ? 'reachable' : 'NOT reachable'}`
                : 'Host will orchestrate scansci_pdf MCP';
        return { mode, configured, cliReachable, note };
    }
    /**
     * auto 模式：spawn scansci CLI 下载，返回 stdout（解析任务结果）。CLI 参数格式需按 SCANSCI_CMD 约定。
     */
    runAutoDownload(identifier, outputDir) {
        return new Promise((resolve, reject) => {
            const raw = process.env.SCANSCI_CMD || 'python -m scansci_pdf';
            const [exe, ...baseArgs] = raw.split(/\s+/);
            const args = [...baseArgs, 'download', '--identifier', identifier];
            if (outputDir)
                args.push('--output_dir', outputDir);
            logDebug(`BridgesClient auto: spawning ${exe} ${args.join(' ')}`);
            const child = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'] });
            let out = '';
            child.stdout.on('data', (d) => (out += d));
            child.on('error', (err) => reject(new Error(`scansci CLI spawn failed: ${err.message}`)));
            child.on('close', (code) => {
                if (code === 0)
                    resolve(out);
                else
                    reject(new Error(`scansci CLI exited ${code}: ${out || 'no output'}`));
            });
        });
    }
    cmdAvailable(cmd) {
        const exe = cmd.split(/\s+/)[0];
        const avail = process.env.PATH?.split(/[;:]/).some((dir) => {
            try {
                const candidates = process.platform === 'win32' ? [`${exe}.exe`, `${exe}.cmd`] : [exe];
                return dir && candidates.some((c) => fs.statSync(`${dir}/${c}`).isFile());
            }
            catch {
                return false;
            }
        });
        return !!avail;
    }
}
export default BridgesClient;
//# sourceMappingURL=BridgesClient.js.map