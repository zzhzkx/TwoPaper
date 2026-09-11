---
name: twopaper-search
description: 学术文献检索。当用户要"搜索/检索/查找/综述文献""找某主题的论文""查某篇论文""检索某数据库(PubMed/arXiv/Scopus/Web of Science/Springer/Crossref/Google Scholar)"时触发。提供聚合搜索与 13 个单平台检索命令，按 DOI 查元数据，查渠道状态。
---

# 学术文献检索（search）

检索是 TwoPaper 的第一环。提供两条路：**聚合搜索**（默认，跨 13+ 平台并发）与**单平台精确检索**（需要特定库语法/高被引/医学/预印本时）。

## A. 聚合搜索（首选）

```json
{
  "tool": "search_papers",
  "arguments": {
    "query": "attention mechanism transformer",
    "platform": "all",
    "maxResults": 10,
    "year": "2020-2024",
    "sortBy": "relevance"
  }
}
```

- `platform:"all"` → 并发查询多个可用平台（**排除 scihub；googlescholar 需代理且默认关闭**），按 DOI→标题跨源去重，每篇合并 `altSources`（命中哪些库）。
- 响应含 `count` / `sources_hit` / `failures`。`failures` 里的单平台错误是**隔离**的，别当成整体失败。
- 支持过滤：`year`、`author`、`journal`、`category`(如 cs.AI)、`sortBy`(relevance/date/citations)、`sortOrder`。
- 通用排序对聚合只是提示，最终由各库返回 + 服务端合并。

## B. 单平台精确检索（需要特定库语法时才用）

每个命令只搜一个库，参数与返回结构统一（`paper_id/doi/title/authors/abstract` + `source`）。

| 库 | 命令 | 特有参数 |
|---|---|---|
| arXiv 预印本(计算机/物理/数学) | `search_arxiv` | `category`(cs.AI)、`author`、`year` |
| PubMed 医学/MEDLINE | `search_pubmed` | `author`、`journal`、`publicationType`(数组) |
| bioRxiv 生物预印本 | `search_biorxiv` | `days`、`category` |
| medRxiv 医学预印本 | `search_medrxiv` | `days`、`category` |
| Semantic Scholar(带引用数) | `search_semantic_scholar` | `fieldsOfStudy`(数组) |
| IACR 密码学 ePrint | `search_iacr` | `fetchDetails`(慢) |
| Crossref(全出版商元数据) | `search_crossref` | `author`、`sortBy` |
| Springer Nature | `search_springer` | `subject`、`openAccess`、`type`(Journal/Book/Chapter) |
| Scopus 摘要引文库 | `search_scopus` | `affiliation`、`subject`、`documentType`、`openAccess` |
| ScienceDirect | `search_sciencedirect` | `author`、`journal`、`openAccess` |
| Web of Science 高被引 | `search_webofscience` | `author`、`journal` |
| Google Scholar(需代理+反爬) | `search_google_scholar` | `yearLow`、`yearHigh`、`author` |
| Sci-Hub(DOI/URL 检索，**灰色源**) | `search_scihub` | `doiOrUrl`、`downloadPdf`、`savePath` |

示例（PubMed 医学库，按日期排序）：

```json
{ "tool": "search_pubmed", "arguments": { "query": "diabetic retinopathy deep learning", "maxResults": 20, "sortBy": "date" } }
```

## C. 按 DOI 查元数据 / 查渠道状态

- `get_paper_by_doi`：`{ "doi": "10.1038/nature12373", "platform": "all" }` → 跨库取元数据（`all` 串行轮询各库）。
- `get_platform_status(validate=false)`：输出四态矩阵 `UNCONFIGURED / OK / NEED_LOGIN / DEGRADED` + `missing_credentials`（缺哪个 env）+ 各渠道能力。刚安装或怀疑渠道失败时先看它。

## 工作准则

1. **默认聚合**，具体库语法需求才退回单平台（医学用 PubMed/medRxiv、高被引用 WoS、预印本用 arXiv/bio/medRxiv、密码学用 IACR）。
2. 聚合返回的 `/` `failures` 是平台隔离错误——提示用户哪些渠道失败，但正常返回可用结果。
3. 所有结论必须可溯源：引用 DAO 时带上来源库（`altSources`）。
