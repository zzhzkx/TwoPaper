---
name: twopaper
description: TwoPaper 学术文献一站式总入口。用户要检索论文、拿 PDF、把 PDF 转 Markdown 全文、查引用/被引数据，或不确定该用哪个命令时，从这里进入并路由到 twopaper-search / twopaper-pdf / twopaper-fulltext / twopaper-citations。
---

# TwoPaper 学术文献工作流（总入口）

TwoPaper 通过本机 MCP server `twopaper` 提供 24 个工具，覆盖 **配置 → 检索 → 拿 PDF → 读全文 → 查引用** 全链路。

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

## 首次使用：配置凭证

若 `get_platform_status` 显示多個渠道 `UNCONFIGURED`，或 `missing_credentials` 非空，**先引导用户配置**，再谈检索：

1. 调 `twopaper_setup`（**不带参数**）→ 返回凭证清单：每项缺什么、解锁什么能力、去哪申请（含申请地址）。
2. 把清单摘要给用户，**问他们要哪些 key**。不要替用户编造或猜测 key。
3. 用户给值后，调 `twopaper_setup({ credentials: { "WOS_API_KEY": "...", "OA_EMAIL": "..." } })` 写入。
4. 告知用户：**需重启 Claude Code 会话**，宿主才会把新值注入 MCP 进程。
5. 重启后调 `get_platform_status` 复查。

```json
{ "tool": "twopaper_setup", "arguments": {} }
```

写入位置是**插件目录下的 `.env`**（`twopaper_setup` 会回报绝对路径）。也可改用宿主级配置（`~/.claude/settings.json` 的 `env` 块），其**优先级高于 `.env`**。

**凭证取值原则**：只按用户提供的值写入，绝不从其他来源推断或填充；`twopaper_setup` 从不回显具体值，只回报键名。

## 已知渠道限制（避免白等）

这些是**渠道本身的限制**，不是调用姿势问题。遇到时如实告知用户，不要反复重试。

| 渠道 | 状况 | 应对 |
|---|---|---|
| `sciencedirect` | API key 可能无该产品授权（返回 401 / `Invalid or missing API key`） | 改用 `search_crossref` 或 `search_scopus` |
| `semantic` | 免费层限流频繁（HTTP 429） | 配 `SEMANTIC_SCHOLAR_API_KEY`，或依赖聚合里的其他渠道 |
| `googlescholar` | 反爬，单次可耗时 25–30s 后失败 | 已从聚合中默认排除；确需时单独调用并容忍失败 |
| `biorxiv` | API 偶发返回非 200 / `empty messages` | 失败即跳过，用 `medrxiv` 或 `crossref` 补 |
| `wiley` | 仅支持按 DOI 下载，不支持关键词检索；TDM 权限可能 403 | 用 `search_crossref` 找到文章后 `download_paper(platform="wiley")` |
| `arxiv` | 响应延迟波动大（实测 1s ↔ 30s），偶发超时 | 单平台超时已隔离，聚合不受影响；必要时重试一次 |

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

## 工具全集（24 个，按功能分组）

| 组 | 工具 |
|---|---|
| **配置** | `twopaper_setup` |
| **聚合与元数据** | `search_papers`、`get_paper_by_doi`、`get_platform_status` |
| **单平台检索（13）** | `search_arxiv`、`search_webofscience`、`search_pubmed`、`search_biorxiv`、`search_medrxiv`、`search_semantic_scholar`、`search_iacr`、`search_google_scholar`、`search_sciencedirect`、`search_springer`、`search_scopus`、`search_crossref`、`search_scihub` |
| **PDF 获取** | `get_pdf`、`get_oa_pdf`、`download_paper`、`check_scihub_mirrors`、`get_scansci_status` |
| **全文解析** | `get_fulltext` |
| **引用数据** | `get_citations` |

各工具的参数与示例见对应子技能。
