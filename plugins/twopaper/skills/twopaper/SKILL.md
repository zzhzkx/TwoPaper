---
name: twopaper
description: One-stop academic literature workflow — aggregate search, full-text PDF acquisition, OCR/PDF→Markdown via MinerU, and source-attributed analysis. Use when the user needs to search literature, fetch papers, get full text, or build a citation-sourced review/comparison/gap analysis.
---

# TwoPaper 学术文献一站式工作流

TwoPaper 是给 Agent（Claude Code / Codex）用的学术文献工具包：**搜索 → 拿全文 → 提取内容 → 做有出处的分析**。MCP 只提供证据工具；**分析（综述/对比/找 gap）由你自己（宿主 Agent）完成**，并始终给出来源。

## 核心工作流（收敛到 4 个工具）

```
1. search_papers(platform="all", query=...)       # 聚合检索，跨平台去重+来源标注
2. get_pdf(doi=...)                               # 统一拿 PDF（受下载限流管束）
3. get_fulltext(doi=...)                          # MinerU PDF→Markdown（需 MINERU_TOKEN）
4. get_platform_status()                          # 查渠道/凭证/下载限流状态
```

## 搜索阶段

- 默认用 `search_papers(platform="all")` 做聚合检索：返回 `sources_hit` 与每篇 `paper_id/doi/title/authors/abstract`，跨源去重会合并 `altSources`。
- 需要精确库语法时（如仅 PubMed 医学库、WoS 高被引）才退回 `search_pubmed` / `search_webofscience` 等具体工具。
- 引用/参考文献数据用 `get_citations(doi=...)`（Semantic Scholar）。
- 单个平台失败不会让聚合失败：`failures` 数组记录隔离的错误，别当成整体失败。

## 全文获取阶段

- **先 `get_oa_pdf(doi=...)` 定位合法开放获取 PDF**（Unpaywall/OpenAlex/Europe PMC，需 `OA_EMAIL`）。
- 拿全文统一走 `get_pdf(doi=...)`：OA → 合法平台 → 必要时桥接。返回本地路径。
- **下载限流**：`get_pdf` 受机构硬限额约束（默认 2/分钟、100/小时、500/天，env 可调）。若返回 `throttled`，按提示的 `retry after Ns` 等待后再试，**不要暴力重试**。
- **paywalled 桥接**：`get_pdf` 若无合法途径，返回一个 `{action:"bridged_download", target:"scansci", tool:"scansci_pdf_download", identifier:<doi>, savePath}` 指令块。此时：
  1. 调用已注册的 `scansci_pdf_download(identifier=<doi>, output_dir=<目标目录>)` 完成下载（利用其本机 WebVPN 会话）。
  2. 拿到 PDF 路径后，交回 `get_fulltext(pdfPath=...)` 转 Markdown。
  3. TwoPaper 自身不持有 scansci 凭证；凭证留在 scansci MCP/CLI 侧。
- 下载的 PDF 统一命名为 `第一作者_年份_短标题_哈希.pdf`，存放于 `downloads/<作者>/`，同 DOI 自动去重。

## 全文转 Markdown（MinerU）

- `get_fulltext(doi=...)` 或 `get_fulltext(pdfPath=...)`：把 PDF 通过 MinerU 转成干净 Markdown（公式/表格/版式还原），返回正文 + 缓存 `.md` 路径。
- 需要 `MINERU_TOKEN`（在 mineru.net/apiManage 申请，日 1000 页限定）。
- 未配 token 时：有平台全文能力的论文降级为纯文本（`degraded_to_text`），否则提示配置。
- 拿到 Markdown 后，由你基于正文做分析，**引用时带上 DOI**：`(doi:10.xxxx/yyy)`。

## 凭证/渠道管理

- 定期用 `get_platform_status(validate=false)` 看四态矩阵：`UNCONFIGURED`（缺 key，看 `setup_hint` 去申请）/ `OK` / `NEED_LOGIN`（如 Scholar 需会话）/ `DEGRADED`（可选 key 未配，免费档）。
- 报告里会列出 `missing_credentials` 与各 `download_limits` 用量。提示用户一次性配好 env 即可全渠道畅用。

## 学术诚信边界（严格遵守）

- **区分证据类型**：PDF 直链/全文 ≠ 仅是摘要；引用数/摘要各自标注来源，不要跨源混成无出处的一条。
- **有给付的结论必须溯源**：涉及具体数字、发现、引流时，给出 DOI 或 PDF/`altSources` 途径。
- 渠道拿不到全文时，如实标注"仅摘要/仅元数据"，**不臆造全文内容**。
- Sci-Hub 为灰色源：仅用户在明确知情并接受风险时用于兜底，默认走合法 OA。
