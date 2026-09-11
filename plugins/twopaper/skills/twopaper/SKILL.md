---
name: twopaper
description: TwoPaper 学术文献一站式总入口。用户要检索论文、拿 PDF、把 PDF 转 Markdown 全文、查引用/被引数据，或不确定该用哪个命令时，从这里进入并路由到 twopaper-search / twopaper-pdf / twopaper-fulltext / twopaper-citations。
---

# TwoPaper 学术文献工作流（总入口）

TwoPaper 通过本机 MCP server `twopaper` 提供 23 个工具，覆盖 **检索 → 拿 PDF → 读全文 → 查引用** 全链路。

## 分工边界（重要）

- **MCP 只提供证据工具**：搜索、下载、解析、引用数据。它不写综述。
- **综述 / 对比 / 找 gap 由你（宿主 Agent）完成**，且**每一条结论必须可溯源**（带 DOI 或来源库）。
- 拿不到的内容就如实标注"仅元数据 / 仅摘要"，**绝不臆造正文**。

## 先看渠道状态

首次使用、或怀疑某渠道失败时，先调 `get_platform_status`（`validate=false`，不触发真实请求）：

```json
{ "tool": "get_platform_status", "arguments": { "validate": false } }
```

它返回每个渠道的四态（`UNCONFIGURED` / `OK` / `NEED_LOGIN` / `DEGRADED`）、缺失的 env（`missing_credentials`）、下载限流余量、scansci 桥接状态。**先看它再决定走哪条路**，能避免在没配 key 的渠道上白等。

## 四个入口

| 用户意图 | 进入 | 核心工具 |
|---|---|---|
| 搜文献 / 找某主题论文 / 检索某数据库 | [twopaper-search](twopaper-search) | `search_papers`（聚合）、13 个单平台检索、`get_paper_by_doi` |
| 要论文 PDF 文件 | [twopaper-pdf](twopaper-pdf) | `get_pdf`、`get_oa_pdf`、`download_paper`、`search_scihub` |
| 要读论文正文 / PDF 转 Markdown | [twopaper-fulltext](twopaper-fulltext) | `get_fulltext`（MinerU） |
| 要引用数 / 参考文献 / 影响力 | [twopaper-citations](twopaper-citations) | `get_citations` |

## 典型端到端链路

**"帮我调研某个主题并写综述"**：

1. `search_papers(platform="all")` 聚合检索（跨平台并发去重，首选）
2. 从结果挑出高价值论文 → `get_pdf` 拿 PDF（合法 OA → 平台 → 桥接兜底）
3. `get_fulltext(pdfPath=...)` 转 Markdown 读正文
4. `get_citations` 补引用规模
5. **你**基于正文写分析，引用处带 `(doi:10.xxxx/yyy)`

**横跨多组时依次进入对应子技能即可。** 最后交付的分析里必须给出处（DOI / 来源库）。

## 工具全集（23 个，按功能分组）

| 组 | 工具 |
|---|---|
| **聚合与元数据** | `search_papers`、`get_paper_by_doi`、`get_platform_status` |
| **单平台检索（13）** | `search_arxiv`、`search_webofscience`、`search_pubmed`、`search_biorxiv`、`search_medrxiv`、`search_semantic_scholar`、`search_iacr`、`search_google_scholar`、`search_sciencedirect`、`search_springer`、`search_scopus`、`search_crossref`、`search_scihub` |
| **PDF 获取** | `get_pdf`、`get_oa_pdf`、`download_paper`、`check_scihub_mirrors`、`get_scansci_status` |
| **全文解析** | `get_fulltext` |
| **引用数据** | `get_citations` |

各工具的参数与示例见对应子技能。
