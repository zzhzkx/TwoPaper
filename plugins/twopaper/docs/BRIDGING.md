# TwoPaper — scansci 桥接机制

TwoPaper 负责**搜索 + 合法 OA/平台下载 + MinerU 全文转 Markdown**。当一篇论文被付费墙挡住、且无合法 OA 途径时，TwoPaper 把下载交给用户的 **scansci-pdf**（独立 MCP server，闭源层 `_publisher_strategies_core.py` + `_core/*.pyd` 是出版商 SSO/反爬核心）。

**为什么桥接而不是并入**：MCP 没有 server→server 工具调用协议（TwoPaper 无法直接调用另一个 MCP server 的工具）；且 scansci 闭源层为专有，Apache-2.0 只覆盖其可见源码，**不可合法重新分发/并入 TwoPaper**。故保留在用户本机，由 TwoPaper "做一个连接去调用它"。

## 三种模式（`GET_PDF_BRIDGE`）

| 模式 | 行为 | 取舍 |
|---|---|---|
| `hint`（默认） | `get_pdf` 返回指令块 `{action:"bridged_download", tool:"scansci_pdf_download", identifier:<doi>, savePath}`，宿主 Agent 读取后调用已注册的 `scansci_pdf_download` 完成下载，再把路径交回 `get_fulltext`。 | 零依赖、可落地、复用用户已配好的 scansci 环境（如中科大 WebVPN）。需要宿主两步编排。 |
| `auto` | `BridgesClient` 用 `child_process.spawn` 调 `SCANSCI_CMD`（如 `python -m scansci_pdf download --identifier <doi>`），复用其已登录 WebVPN 会话。 | 无需宿主干预、自动化。但跨 Node↔Python 进程协议 + CLI 参数需实测确认，凭证路径需授权。 |
| `none` | 完全关闭桥接；paywalled 时 `get_pdf` 仅报告无法获取。 | 最保守；仅用合法渠道。 |

> 已知不做：HTTP 调 scansci streamable-http（需 OAuth token 中继，复杂度高、不值得）。

## 能力边界

- TwoPaper **自身不持有 scansci 凭证**；凭证（WebVPN cookie / CARSI 会话）留在 scansci MCP/CLI 侧，由用户通过 `scansci_pdf_login` 等维护。
- 桥接只用于获取 PDF；TwoPaper 拿到 PDF 后再用 `get_fulltext` 转 Markdown，分析仍由宿主 Agent 完成。
- 桥接下载同样计入 TwoPaper 的下载限流（`get_fulltext` 上传计为一次下载），避免绕过机构硬限额。

## 获取桥接状态

调用 `get_scansci_status`（只读探测，不实际下载）：

```json
{ "mode": "hint", "configured": true, "cliReachable": false, "note": "Host will orchestrate scansci_pdf MCP" }
```
