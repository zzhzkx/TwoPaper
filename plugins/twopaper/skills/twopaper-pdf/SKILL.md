---
name: twopaper-pdf
description: 学术论文 PDF 获取。用户要"下载/获取某篇论文的 PDF""拿到 PDF 文件路径""找开放获取版本""用 Sci-Hub 兜底下载"时触发。覆盖统一下载(get_pdf)、合法 OA 定位(get_oa_pdf)、平台直下(download_paper)、Sci-Hub 兜底、scansci 桥接。
---

# 学术论文 PDF 获取

拿到元数据后用 `get_pdf` 取 **PDF 文件路径**（不是正文）。下载受**机构硬限流**管束：默认 **2/分钟、100/小时、500/天**（`DOWNLOAD_PER_MINUTE/HOUR/DAY` 可调，设 0 关闭该档）。

---

## A. 统一拿 PDF `get_pdf`（首选）

按 DOI 拿 PDF，内部按 **合法 OA 直链 → 可下载平台 → scansci 桥接** 顺序尝试。

```json
{ "tool": "get_pdf", "arguments": { "doi": "10.1038/nature12373", "savePath": "./downloads" } }
```

**两种调用方式**：

| 方式 | 参数 | 行为 |
|---|---|---|
| 按 DOI | `doi` | 先跨平台定位元数据，再按 OA → 平台顺序下载 |
| 按平台 ID | `paperId` + `platform` | 已知论文属于可下载平台时直接下载，跳过 DOI 查找 |

```json
{ "tool": "get_pdf", "arguments": { "paperId": "2012.14096", "platform": "arxiv" } }
```

**参数**：

| 参数 | 说明 |
|---|---|
| `doi` | DOI |
| `paperId` | 平台内 ID（配合 `platform`） |
| `platform` | `arxiv` / `biorxiv` / `medrxiv` / `semantic` / `iacr` / `scihub` / `springer` / `wiley` |
| `savePath` | 覆盖保存**目录**（默认 `./downloads`）。传目录，不要传文件名 |

**返回与命名**：

- 成功 → 本地路径，形如 `downloads/<作者>/作者_年份_短标题_哈希.pdf`，同 DOI 自动去重。
- 用 `paperId` + `platform` 时，TwoPaper 会**先解析该平台元数据**，因此文件名同样带作者/年份/标题，而不是光秃秃的 ID。
- **`Download throttled: retry after Ns`** → 按提示等待再试，**不要暴力重试**。
- **`bridged_download` 指令块** → 合法途径都拿不到，见下方 D 节。

---

## B. 合法 OA 定位 `get_oa_pdf`（不下载）

先判断有没有合法开放获取版本（Unpaywall / OpenAlex / Europe PMC），拿到直链与许可：

```json
{ "tool": "get_oa_pdf", "arguments": { "doi": "10.1038/nature12373" } }
```

或按标题：

```json
{ "tool": "get_oa_pdf", "arguments": { "title": "Attention Is All You Need", "year": "2017" } }
```

需 `OA_EMAIL`（Unpaywall / Europe PMC 礼貌池）；`OPENALEX_API_KEY` 可选。

> 注意：Unpaywall 通常**不收录 arXiv 预印本**，纯 arXiv 论文在此未命中属正常，应改用 `get_pdf` 的 `paperId`+`platform:"arxiv"` 路径。

---

## C. 平台直下 `download_paper`（已知来源）

已确定论文属于某平台且该平台支持下载时直接下：

```json
{ "tool": "download_paper", "arguments": { "paperId": "2012.14096", "platform": "arxiv", "savePath": "./downloads" } }
```

- `platform` 支持：`arxiv` / `biorxiv` / `medrxiv` / `semantic` / `iacr` / `scihub` / `springer` / `wiley`。
- **Wiley 只支持按 DOI 下载**，不支持关键词检索——用 `search_crossref` 找到 Wiley 文章后，再用本工具按 DOI 下。

---

## D. 灰色源兜底与桥接

### Sci-Hub（用户知情并接受风险）

```json
{ "tool": "search_scihub", "arguments": { "doiOrUrl": "10.1038/nature12373", "downloadPdf": true, "savePath": "./downloads" } }
```

- `search_scihub` 只接受 **DOI 或 URL**，不接受关键词。
- `check_scihub_mirrors`：查看镜像健康状态；`forceCheck:true` 强制刷新（会逐个真实探测，较慢）。

### scansci 桥接（paywalled 兜底）

- `get_scansci_status`：只读探测桥接模式（`none` / `hint` / `auto`）与 CLI 可达性。
- 当 `get_pdf` 返回 `{action:"bridged_download", target:"scansci", tool:"scansci_pdf_download", identifier:<doi>}` 时，**你去调用已注册的 `scansci_pdf_download`**（复用其本机 WebVPN 会话）完成下载，拿回路径后交 `get_fulltext(pdfPath=...)`。
- TwoPaper 自身**不持有** scansci 凭证。

---

## 工作准则

1. 默认先 `get_oa_pdf` 判断合法性，再 `get_pdf` 统一拿。
2. 尊重 `throttled` 与限流提示，**不并发轰下载**。
3. 区分证据等级：PDF 直链 / 已下载文件 ≠ 只是元数据/摘要。下载成功返回路径后，正文解析走 twopaper-fulltext。
4. 合规优先：合法 OA 拿不到才考虑灰色源。
