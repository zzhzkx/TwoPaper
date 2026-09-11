---
name: twopaper-pdf
description: 学术论文 PDF 获取。当用户要"下载/获取某篇论文的 PDF 全文文件""拿到 PDF 文件路径""找开放获取版本""用 Sci-Hub 兜底下载"时触发。覆盖统一下载(get_pdf)、合法 OA 定位(get_oa_pdf)、平台直下(download_paper)、Sci-Hub 兜底、scansci 桥接。
---

# 学术论文 PDF 获取（pdf）

拿到元数据后，用统一入口 `get_pdf` 拿 PDF **文件路径**（不是正文）。下载受**机构硬限流**管束（默认 2/分钟、100/小时、500/天）。

## A. 统一拿 PDF（首选 `get_pdf`）

按 DOI 拿 PDF，内部按 **合法 OA → 合法平台 → scansci 桥接** 顺序找：

```json
{ "tool": "get_pdf", "arguments": { "doi": "10.1038/nature12373", "savePath": "./downloads" } }
```

- 返回本地路径 `downloads/<作者>/作者_年份_短标题_哈希.pdf`，同 DOI 自动去重。
- 可选 `savePath` 覆盖目录。
- **`throttled` 响应**：按提示的 `retry after Ns` 等待再试，**不要暴力重试**。
- **`bridged_download` 指令块**：合法途径都拿不到 → 返回一个 `{action, target:"scansci", tool:"scansci_pdf_download", identifier:<doi>, savePath}`。此时 Agent 去调用用户在 Claude Code 里已装好的 `scansci_pdf_download`（利用其本机 WebVPN 会话）完成下载，拿回路径后交 `get_fulltext(pdfPath=...)`。TwoPaper 自身不持有 scansci 凭证。

## B. 合法 OA 定位（`get_oa_pdf`，不下载）

先看有没有合法开放获取版本（Unpaywall/OpenAlex/Europe PMC），拿到直链与许可：

```json
{ "tool": "get_oa_pdf", "arguments": { "doi": "10.1038/nature12373" } }
```
或按标题 `{ "tool": "get_oa_pdf", "arguments": { "title": "Attention Is All You Need", "year": "2017" } }`。需 `OA_EMAIL`（Unpaywall/Europe PMC 礼貌池）。

## C. 平台直下（`download_paper`，已知来源）

已确定论文属于某平台且该平台支持下载时，直接下：

```json
{ "tool": "download_paper", "arguments": { "paperId": "2012.14096", "platform": "arxiv", "savePath": "./downloads" } }
```
`platform` 支持：arxiv / biorxiv / medrxiv / semantic / iacr / scihub / springer / wiley。

## D. 灰色源兜底（Sci-Hub，用户知情并接受风险）

- `search_scihub`：`{ "doiOrUrl": "10.1038/nature12373", "downloadPdf": true, "savePath": "./downloads" }`。
- `check_scihub_mirrors`：看镜像健康状态；`forceCheck:true` 强制刷新。
- **前置**：`get_scansci_status` 看桥接模式（none/hint/auto）与 scansci CLI 是否可达。
- **合规**：合法 OA 拿不到才走此项；课题里默认走合法 OA。

## 工作准则

1. 默认先 `get_oa_pdf` 判断合法性，再 `get_pdf` 统一拿。
2. 尊重 `throttled` 与限流，不并发轰下载。
3. 区分证据：PDF 直链/文件 ≠ 仅是摘要；下载成功返回路径，全文解析再走 `get_fulltext`。
