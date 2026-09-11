---
name: twopaper
description: TwoPaper 学术文献一站式总入口。当用户需要检索学术论文、获取 PDF、把 PDF 转 Markdown 全文、查引用数据，或不清楚用哪个命令时，从这里进入。会按需路由到 twopaper-search / twopaper-pdf / twopaper-fulltext / twopaper-citations 子技能。
---

# TwoPaper 学术文献工作流（总入口）

TwoPaper 通过本机 MCP server（`twopaper`，23 个工具）给 Agent 提供学术文献能力。**MCP 只做证据工具，综述/对比/找 gap 等分析由宿主 Agent 完成，并始终溯源。**

先调用 `get_platform_status(validate=false)` 看渠道/凭证/下载限流状态，再决定走哪条路。

## 命令总览（23 个工具，分 4 组）

| 组 | 工具 | 用途 |
|---|---|---|
| **检索** | `search_papers`(`all`) | 聚合搜索，跨平台并发+去重+来源标注（首选） |
| | `search_arxiv` / `search_pubmed` / `search_biorxiv` / `search_medrxiv` / `search_semantic_scholar` / `search_iacr` / `search_crossref` / `search_springer` / `search_scopus` / `search_sciencedirect` / `search_webofscience` / `search_google_scholar` / `search_scihub` | 单平台精确检索（需要该库语法时用） |
| | `get_paper_by_doi` | 按 DOI 取元数据 |
| | `get_platform_status` | 渠道/凭证四态矩阵 |
| **PDF** | `get_pdf` / `get_oa_pdf` / `download_paper` | 统一拿 PDF / OA 定位 / 平台下载 |
| | `search_scihub`(+`downloadPdf`) / `check_scihub_mirrors` / `get_scansci_status` | 灰色源兜底 / 镜像健康 / 桥接状态 |
| **全文** | `get_fulltext` | MinerU PDF→Markdown |
| **引用** | `get_citations` | 引用/参考文献/影响力数据 |

## 怎么选

- **泛查文献** → 进入 [twopaper-search](search)（默认 `search_papers(all)`）
- **拿 PDF** → 进入 [twopaper-pdf](pdf)
- **要全文正文** → 进入 [twopaper-fulltext](fulltext)
- **要引用/被引数** → 进入 [twopaper-citations](citations)

每个子 skill 里都写清了该组所有命令的调用方式、参数和示例。若任务横跨多组（如"搜到文献→拿PDF→读全文→写综述"），依次进入对应子 skill 即可，最后分析时必须给出来源（DOI / altSources）。
