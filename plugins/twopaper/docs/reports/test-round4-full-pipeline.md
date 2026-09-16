# TwoPaper 插件 —— 全链路真实测试报告（Round 4）

**测试日期**：2026-09-16
**被测版本**：`twopaper@twopaper-market` @ `cb6b1ad`（含本轮两项修复）
**运行环境**：Windows 11 / Node v24.18.0 / Claude Code 2.1.272
**调用路径**：真实 MCP stdio 协议（`scripts/bench/mcp_probe.mjs` / `run_matrix.mjs`），非直接 import
**配置**：密钥已写入持久数据目录 `~/.claude/plugins/data/twopaper-twopaper-market/.env`

> 目标：验证「**聚合多源、互补地拿到论文 → MinerU 转 Markdown**」这条一站式闭环。

---

## 0. 结论速览

| 维度 | 结果 |
|---|---|
| 密钥注入 | ✅ 13/14 渠道 `OK`，仅 semantic `DEGRADED`（缺可选 key） |
| 检索层 | ✅ 11 平台真实返回结果；聚合命中 5 源；DOI 查询 + 引用可用 |
| 获取层 | ✅ `get_oa_pdf` / `get_pdf` / `download_paper` 均拿到文件 |
| **全文层（核心）** | ✅ **MinerU PDF→Markdown 打通**，产出 56KB 干净 MD |
| 端到端 | ✅ 「给 DOI → 自动下载 → 转 MD」11.6s 全程贯通 |
| 本轮新发现缺陷 | **2 个已修复** + 4 个待决策 |

**一句话**：**核心闭环（检索→获取→MinerU 全文）真实可用**；但**关键词检索在 bioRxiv/medRxiv 上语义失效**，且 round3 遗留的 3 个缺陷仍未修。

---

## 1. 配置层（前置，已在上轮打通）

- 密钥写入 `~/.claude/plugins/data/twopaper-twopaper-market/.env`（跨插件更新存活，非系统环境变量）。
- 重启后 `get_platform_status`：WoS/Scopus/ScienceDirect/Springer/Wiley/PubMed **全部 `OK`**；`missing_credentials` 仅 `SEMANTIC_SCHOLAR_API_KEY`。
- 桥接状态：`GET_PDF_BRIDGE=hint`，`cliReachable=false`（scansci CLI 未在 PATH；桥接为宿主编排，符合设计）。

## 2. 检索层实测

### 2.1 渠道矩阵（`--phase search`，每样本独立进程）

| 渠道 | 工具 | 结果 | 延迟 | 命中 |
|---|---|---|---|---|
| webofscience | `search_webofscience` | ✅ | 1639ms | 5 |
| crossref | `search_crossref` | ✅ | 1988ms | 5 |
| scopus | `search_scopus` | ✅ | 2000ms | 5 |
| arxiv | `search_arxiv` | ✅ | 2145ms | 5 |
| iacr | `search_iacr` | ✅ | 2172ms | 5 |
| pubmed | `search_pubmed` | ✅ | 2305ms | 5 |
| springer | `search_springer` | ✅ | 3627ms | 5 |
| medrxiv | `search_medrxiv` | ⚠️ | 4258ms | **0** |
| biorxiv | `search_biorxiv` | ⚠️ | 5133ms | **0** |
| scihub | `search_scihub` | ✅ | 17670ms | 该 DOI 未收录 |
| googlescholar | `search_google_scholar` | ❌ | 46029ms | 网络不可达 |
| semantic | `search_semantic_scholar` | ❌ | — | 429 限流（免费档） |
| sciencedirect | `search_sciencedirect` | ❌ | — | 产品未授权（见 §4.4） |
| doi_arxiv | `get_paper_by_doi` | ✅ | 4669ms | 3 |
| citations | `get_citations` | ✅ | 1347ms | — |
| aggregate_all | `search_papers(all)` | ✅ | 5147ms | 10（命中 5 源） |
| platform_status | `get_platform_status` | ✅ | 637ms(冷启) | — |

冷启动 median **637ms**。

### 2.2 聚合搜索（真·多源互补）

`search_papers(platform="all", query="transformer attention mechanism")` →

```
count: 10   sources_hit: [arxiv, pubmed, semantic, iacr, springer]
failures: [webofscience(400), sciencedirect(401)]
```

**这是"一站式拿到论文"的主入口**：一次调用跨 5 个源拿到 10 篇。注意聚合里 WoS 报 400、而单独 `search_webofscience` 成功——**聚合路径与单平台路径行为不一致**（见 §5.1）。

### 2.3 DOI / 引用

- `get_paper_by_doi(10.1038/nature12373)` → 6 篇（WoS 优先命中），DOI 校验生效（round2 的 DOI 修复在起作用）。
- `get_citations(10.1371/journal.pone.0171226)` → 被引 **85**、参考文献 64、影响力引用 6、venue PLoS ONE。
- `get_citations(10.1038/nature12373)` → 被引 **1819**、Nature。

## 3. 获取层 + 全文层（核心闭环）

| 步骤 | 工具 | 结果 |
|---|---|---|
| 合法 OA 定位 | `get_oa_pdf(10.1371/journal.pone.0171226)` | ✅ OpenAlex 命中，`cc-by` |
| 统一下载 | `get_pdf(10.1371/journal.pone.0171226)` | ✅ 2556→6000ms，落 `downloads/Buchanan/Buchanan_2017_..._9f8a.pdf` |
| 平台直下 | `download_paper(1706.03762, arxiv)` | ✅ 4678ms |
| 多源互补 | `get_pdf(10.48550/arXiv.1706.03762)` | ✅ 3447ms，命名 `Vaswani_2017_Attention_Is_All_You_Need_db6d.pdf` |
| **全文转换** | `get_fulltext(pdfPath=...)` | ✅ **5730ms**，`Full-text (vlm)`，56,657 字符 MD |
| **全自动管线** | `get_fulltext(doi=10.1371/...)` | ✅ **11633ms**，DOI→下载→MD 一步到位 |

MinerU 产出质量：标题/作者/机构/摘要/章节/参考文献/图片引用齐全，公式与表格标记保留。

---

## 4. 本轮新发现缺陷

### 4.1 【已修复】env 读取客户端在模块加载期构造，早于 loadEnv()

**位置**：`src/mcp/handleToolCall.ts:23-30`（原 `const mineru = new MinerUClient()` 等 5 个单例）

ES import 提升使 `handleToolCall` 模块先于 `server.ts` 的 `loadEnv()` 执行，单例在构造函数里读 `process.env.MINERU_TOKEN` 时 `.env` 尚未加载 → `hasToken` **永久为 false**，`get_fulltext` 恒报 "MINERU_TOKEN not configured"。

**对照实验**：`.env` 与实时状态都显示 token 已配，唯独 `get_fulltext` 不认；把 token 直塞进程 env（构造前可见）后立即越过该检查。

**修法**：改惰性构造（首次 `handleToolCall` 时 `initClients()`）。同一模式还潜在影响 `DownloadThrottle`(限流不生效)、`BridgesClient`、`PaperNamer`、`PlatformRegistry`。

### 4.2 【已修复】MinerU `file_urls` 结构变更导致 upload URL 取空

**位置**：`src/services/MinerUClient.ts:94`

旧解析 `data.data.file_urls[0].url`；实测 2026-09 MinerU 返回 **`file_urls: ["<url>"]`**（字符串数组），`[0].url` 为 `undefined` → 每次 `no signed upload URL returned`。

**修法**：兼容两种结构（`typeof first === 'string' ? first : first?.url`）。

### 4.3 【未修·需决策】bioRxiv / medRxiv 关键词检索语义失效

**位置**：`src/platforms/BioRxivSearcher.ts:102-171`

- 上游 API **无关键词检索**，只有 `details/{server}/{start}/{end}/{cursor}` 按时间窗返回**按时间正序**的页。
- 代码取 `days` 窗口（默认 30，矩阵用 3650）的 **cursor 0**，即**最旧的一页**；对每页做客户端关键词过滤，**首个空页即 `break`**。
- 实测：`CRISPR gene editing` + 10 年窗口 → 返回 2016-09 起的 30 条，命中 0 → 返回 0。

**后果**：对绝大多数关键词，bioRxiv/medRxiv 永远返回 0——**"渠道可用"名不副实**。

**可选修法**（需你定）：① 拉最近 N 天并按关键词过滤，命中不足再回溯更早窗口；② 明确标注"仅支持近期热词"，并在 0 结果时提示"该库不支持关键词检索"；③ 从聚合中降权/移除。

### 4.4 【未修·需决策】`search_sciencedirect` 报 "unconfigured" 实为产品未授权

**位置**：`src/mcp/handleToolCall.ts:555`（文案）/ `ScienceDirectSearcher`

`ELSEVIER_API_KEY` 有效（Scopus 用它成功），但 ScienceDirect 产品未订阅 → 上游 401 → 插件归类为 `unconfigured`，**误导用户以为 key 没配**。

**修法**：区分"key 缺失"与"产品未授权"两种文案。

---

## 5. Round3 遗留缺陷（未修，仍未修）

| # | 缺陷 | 位置 | 现状 |
|---|---|---|---|
| 5.1 | 错误消息被无条件打码，诊断被毁 | `ErrorHandler.ts:196` | 仍 `maskSensitiveData(message)` 无条件；GS 的 `connect ECONNREFUSED` 被打成星号 |
| 5.2 | `check_scihub_mirrors` 默认返回未探测的假状态 | `handleToolCall.ts:542` | 默认仍直接 `getMirrorStatus()`，11/11 "Working"（8ms，物理上不可能） |
| 5.3 | 基类 `getPaperByDoi` 不校验返回 DOI | `PaperSource.ts:118` | 仍 `search(doi)` 取首条、不比对 DOI |
| 5.4 | 聚合中 WoS 400 / Sci-Hub 实际可用性 | `AggregateSearch` | 本轮新观测：聚合里 WoS 报 400，单调用成功 |

**重要**：§2.1 的 GS 失败样本 `conn****...:443` 正是 5.1 的现场复现——**一个真实的 `ECONNREFUSED` 被摧毁成星号**，用户无法定位。

---

## 6. 渠道可用性总结（面向"一站式"目标）

| 层级 | 渠道 | 状态 |
|---|---|---|
| **检索** | WoS, Scopus, Crossref, arXiv, PubMed, IACR, Springer | ✅ 稳定可用 |
| | Semantic Scholar | 🟡 免费档限流（补 key 可解） |
| | bioRxiv, medRxiv | ⚠️ 关键词检索失效（§4.3） |
| | Google Scholar | ❌ 需代理（错误被 §5.1 打码，不可诊断） |
| | ScienceDirect | ❌ 产品未授权（§4.4） |
| **获取** | OA(Unpaywall/OpenAlex), arXiv, Springer, Wiley, Sci-Hub | ✅ 可用 |
| **全文** | MinerU | ✅ 已验证（56KB MD） |

---

## 7. 复现

```bash
cd plugins/twopaper
export TWOPAPER_ENV_FILE='C:\Users\zhaoz\.claude\plugins\data\twopaper-twopaper-market\.env'
node scripts/bench/run_matrix.mjs --phase search --runs 1 --gap 500
node scripts/bench/mcp_probe.mjs 'get_fulltext:{"doi":"10.1371/journal.pone.0171226"}'
```

原始数据：`docs/reports/raw/matrix_r4_search.json`

## 8. 未覆盖

| 项 | 原因 |
|---|---|
| Semantic 补 key 后复测 | 未提供 `SEMANTIC_SCHOLAR_API_KEY` |
| Google Scholar 代理环境 | 无 `SCHOLAR_PROXY` |
| Wiley TDM 下载 | token 未在 Wiley 侧注册（403） |
| Sci-Hub 镜像真实可用性 | 需 `forceCheck=true`（约 50s）；默认假状态未修 |
| 聚合 WoS 400 根因 | 待复现定位 |
