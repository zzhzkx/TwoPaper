---
name: twopaper-search
description: 学术文献检索。用户要"搜索/检索/查找/综述文献""找某主题的论文""查某篇论文的元数据""检索某数据库(PubMed/arXiv/Scopus/Web of Science/Springer/Crossref/Semantic Scholar)"时触发。提供聚合搜索、13 个单平台检索、按 DOI 查元数据、渠道状态查询。
---

# 学术文献检索

两条路：**聚合搜索**（默认，跨多平台并发）与**单平台精确检索**（需要特定库语法时）。

---

## A. 聚合搜索 `search_papers`（首选）

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

`platform:"all"` 的行为：

- **真并发**查询多个可用平台，按 **DOI → 标题** 跨源去重，每篇合并 `altSources`（命中哪些库）。
- 自动**排除** `scihub`（其 search 语义是 DOI/URL，不是关键词）与 `wos`（`webofscience` 的别名，避免同一实例被查两次）。
- `googlescholar` **默认不参与聚合**（反爬风险，且单次可白等 25–30s），需要时用 `search_google_scholar` 单独触发。
- 只查询**已配置凭证**的平台；未配 key 的渠道自动跳过，不会白等。
- 有并发上限（6）与单平台超时保护，**单个平台挂起或失败不影响整体**。

**返回结构**：

```json
{
  "count": 10,
  "sources_hit": ["arxiv", "pubmed", "crossref"],
  "failures": [{ "platform": "semantic", "error": "429 ..." }]
}
```

`failures` 是**平台级隔离**的错误。请在回答里告知用户哪些渠道失败，但结果本身可用，不要当成整体失败。

**参数**（`query` 必填）：

| 参数 | 类型 | 说明 |
|---|---|---|
| `query` | string | **必填**，检索词 |
| `platform` | enum | 默认 `crossref`；`all` 为聚合；也可指定单个平台名 |
| `maxResults` | 1–100 | 默认 10 |
| `year` | string | `"2023"` / `"2020-2023"` / `"2020-"` |
| `author` | string | 作者名 |
| `journal` | string | 期刊名 |
| `category` | string | 分类，如 arXiv 的 `cs.AI` |
| `days` | number | 回溯天数（仅 bioRxiv/medRxiv） |
| `fetchDetails` | bool | 抓详情（仅 IACR，较慢） |
| `fieldsOfStudy` | string[] | 学科过滤（仅 Semantic Scholar） |
| `sortBy` | enum | `relevance` / `date` / `citations` |
| `sortOrder` | enum | `asc` / `desc` |

> 注：通用参数在各库支持度不同（如 `sortBy` 对聚合只是提示，最终由各库返回 + 服务端合并）。不支持的参数会被该渠道忽略。

---

## B. 单平台精确检索（需要特定库语法/定向覆盖时才用）

每个命令只搜一个库，返回结构统一（`paper_id` / `doi` / `title` / `authors` / `abstract` + `source`）。

| 库 | 命令 | 特有参数 | 何时用 |
|---|---|---|---|
| arXiv 预印本 | `search_arxiv` | `category`(cs.AI)、`author`、`year` | 计算机/物理/数学预印本 |
| Web of Science | `search_webofscience` | `author`、`journal` | 高被引、引文分析（需 key） |
| PubMed / MEDLINE | `search_pubmed` | `author`、`journal`、`publicationType`(数组) | 医学/生物医学 |
| bioRxiv | `search_biorxiv` | `days`、`category` | 生物学预印本 |
| medRxiv | `search_medrxiv` | `days`、`category` | 医学预印本 |
| Semantic Scholar | `search_semantic_scholar` | `fieldsOfStudy`(数组) | 带引用数的 AI 检索 |
| IACR ePrint | `search_iacr` | `fetchDetails`(慢) | 密码学 |
| Crossref | `search_crossref` | `author`、`sortBy` | 全出版商元数据（免费） |
| Springer Nature | `search_springer` | `subject`、`openAccess`、`type` | Springer 期刊/图书（需 key） |
| Scopus | `search_scopus` | `affiliation`、`subject`、`documentType`、`openAccess` | 最大摘要引文库（需 key） |
| ScienceDirect | `search_sciencedirect` | `author`、`journal`、`openAccess` | Elsevier 全文库（需 key） |
| Google Scholar | `search_google_scholar` | `yearLow`、`yearHigh`、`author` | 需代理，反爬会失败 |
| Sci-Hub | `search_scihub` | `doiOrUrl`、`downloadPdf`、`savePath` | **灰色源**，仅 DOI/URL |

**示例**（PubMed 医学库，按日期排序）：

```json
{ "tool": "search_pubmed", "arguments": { "query": "diabetic retinopathy deep learning", "maxResults": 20, "sortBy": "date" } }
```

**领域选库建议**：医学 → `pubmed` / `medrxiv`；高被引 → `webofscience`；预印本 → `arxiv` / `biorxiv` / `medrxiv`；密码学 → `iacr`；综合兜底 → `crossref`。

> `search_pubmed` 与 `search_semantic_scholar` 的响应会附带该库的限流状态（剩余 token / 每秒配额），便于判断是否被限流。

---

## C. 按 DOI 查元数据 `get_paper_by_doi`

```json
{ "tool": "get_paper_by_doi", "arguments": { "doi": "10.1038/nature12373", "platform": "all" } }
```

- `platform:"all"`：跨库**有界并发**查找（排除 sci-hub、wos 别名、googlescholar），返回各库命中的元数据。
- 指定平台：只查该库（支持全部平台名：`arxiv`/`crossref`/`pubmed`/`springer`…）。
- 找不到时返回 `No paper found with DOI: ...`。

> 这一步是 `get_pdf` / `get_fulltext` 走 `doi` 参数时的内部前置步骤。若已知 arXiv ID，**别用 DOI 绕路**——直接 `get_pdf(paperId=..., platform="arxiv")` 更快。

---

## D. 渠道状态 `get_platform_status`

```json
{ "tool": "get_platform_status", "arguments": { "validate": false } }
```

| 参数 | 说明 |
|---|---|
| `validate` | `false`（默认）只看配置；`true` 会用真实请求验证 key 有效性（可能触发上游限流，慎用） |

返回：四态矩阵（`UNCONFIGURED`/`OK`/`NEED_LOGIN`/`DEGRADED`）、每渠道能力（search/download/fulltext）、`setup_hint`、`key_env`、`missing_credentials`、下载限流余量、scansci 桥接状态。

**何时用**：刚安装、怀疑渠道失败、或要判断"这个渠道为什么没结果"。

---

## 工作准则

1. **默认聚合**（`search_papers(platform="all")`），只在需要特定库语法时退回单平台。
2. 报告结果时带上**来源库**（`altSources` / `source`），保证可溯源。
3. `failures` 里的渠道失败要如实告知用户，但不要因此判定整体失败。
4. 需要**正文**时不要停在这里——检索只给元数据与摘要，正文走 twopaper-fulltext。
