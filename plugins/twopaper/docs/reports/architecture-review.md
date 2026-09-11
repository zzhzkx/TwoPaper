# TwoPaper 架构审查报告 + 改进指南

- 日期：2026-09-11
- 方法：4 维度并行代码审查（稳定性 / 性能并发 / 代码质量 / API 暴露）+ 对抗性验证（每发现由独立 agent 打开源码核实）+ 第一轮真实网络实测对照
- 代码版本：commit `586aaaa`（初始发布）基线 + `ff78c9a`（skills 拆分）

## 一、总体结论

TwoPaper 的**分层是合理的**：`platforms/`（各渠道 searcher）→ `services/`（聚合/OA/限流/命名）→ `mcp/`（工具暴露）。聚合搜索已是**真并行**（实测 0.12x 之和），平台级异常隔离有效（GS/Semantic/bioRxiv 失败不影响整体返回）。

**但存在 3 类必须优先解决的问题**，否则影响稳定性与体验：
1. **多处"永久挂起"风险**（稳定性第一优先级）：流式下载、MinerU fetch、CallTool 外层均无超时兜底。
2. **DOI 元数据跨平台串行轮询**（性能最大瓶颈）：实测 2.21x 浪费，`get_pdf` 一次光找元数据就 20–25s。
3. **`get_pdf`/`get_fulltext` 的 paperId 路径存在功能 bug**（传 paperId 被静默忽略）。

## 二、CONFIRMED 缺陷清单（经对抗性验证，按优先级排序）

### P0 — 稳定性 / 正确性（必须先修）

| # | 缺陷 | 定位 | 影响 |
|---|---|---|---|
| A | **`get_pdf`/`get_fulltext` 的 paperId+platform 分支被 `&& cleanDoi` 门控**，纯 paperId 调用永不执行平台查找，`paper` 恒为 null | `handleToolCall.ts:573-578`、`601-603` | 工具 schema 声明支持 paperId，实际功能失效；`get_fulltext` 传 paperId 也被忽略（`getPaperByDoi('')`→null） |
| B | **PDF 流下载无 source-stream error 监听**：`response.data.pipe(writer)` 只挂 writer 的 finish/error，不挂 `response.data` 的 error；下载中途源流出错 → Promise 永久挂起（writer 永不 finish） | `utils/PDFExtractor.ts:142-150`、`SemanticScholarSearcher.ts:366-372` | 下载中断卡死宿住 Agent，MCP 请求无响应；相邻 `ArxivSearcher.writeStreamToFile` 已正确处理，证明是局部缺陷 |
| C | **MinerUClient 的 fetch 调用无 AbortController/超时**（requestBatch POST、上传 PUT、zip 下载），仅轮询有 deadline | `services/MinerUClient.ts:87/64/118` | 网络半开会话可无限挂起 |
| D | **server.ts MCP 模式完全静默吞错**：`uncaughtException`/`unhandledRejection` 在 MCP 模式只记 logDebug（而 logDebug 本身 MCP 模式早退）→ 零输出 | `server.ts:107-120`、`utils/Logger.ts` | 出问题完全无迹可循，且请求已挂起时进程存活但无日志 |
| E | **`get_paper_by_doi(platform="all")` 把 Sci-Hub 也算进去**（与 `findPaperByDoiAcrossPlatforms` 不一致），会触发 11 个镜像的串行健康检查（各可达 10s） | `handleToolCall.ts:363-374` vs `:31` | `get_paper_by_doi(all)` 最坏被 Sci-Hub 拖 100s+ |

### P1 — 性能 / 并发（实测支撑）

| # | 缺陷 | 定位 | 实测影响 |
|---|---|---|---|
| F | **`findPaperByDoiAcrossPlatforms` 串行 for-await + 吞错 + 无超时**（`get_pdf`/`get_fulltext` 共享） | `handleToolCall.ts:29-40` | 实测：串行 25.4s vs 并行 11.5s = **2.21x**；慢平台（如 GS 每次 ~25s）串行拖死整条链路 |
| G | **`get_paper_by_doi(platform="all")` 串行 + 无超时 + 无早退**：延迟 = 各平台之和（非 max） | `handleToolCall.ts:363-374` | 与 F 同源；verify 确认"总和延迟 + 无整体截止" |
| H | **`AggregateSearch` 无并发上限 + 无整体超时**：`Promise.allSettled` 一次把全部 enabled 平台并发发出；无总 deadline（`server.ts` 也不包） | `services/AggregateSearch.ts:57-70`、`handleToolCall.ts:155` | 并发数=启用平台数（可达 12+）无上界；最坏延迟=最慢平台整段搜索序列，无"先返回已到"机制 |

### P2 — 代码质量 / 暴露一致性（保守版先不动，留给激进分支）

| # | 缺陷 | 定位 |
|---|---|---|
| I | 工具定义在 tools.ts（549 行手写 schema）+ schemas.ts（zod）+ handleToolCall（分发）+ searchers.ts + PlatformRegistry.CATALOG 多处重复声明，**enums 已漂移**（如 wiley 只在下载侧） | `mcp/tools.ts`、`mcp/schemas.ts` |
| J | 11 个单平台 search 处理函数是**刻板重复模板**（解构→search→JSON.stringify） | `handleToolCall.ts:176-520` |

## 三、实测数据对照（印证审查）

详见 [test-round1.md](test-round1.md)。要点：
- 聚合 `search_papers(all)` 12.7s vs 各平台之和 ~65s → **真并行成立**，审查 H 的"无超时"是主要问题而非并行本身。
- DOI 元数据串行 2.21x → 直接印证 F/G。
- `get_pdf` 端到端瓶颈 = 元数据串行查找（20–25s），印证 F。

## 四、改进指南（优先级 = 稳定 > 速度全面性 > 代码轻量）

**第一优先 — 消除挂起（P0 A/B/C/D/E）**
1. A/E：修复 paperId 分支门控；`get_paper_by_doi(all)` 排除 Sci-Hub（与 findPaper 对齐），并给 Sci-Hub 镜像检查加整体超时。
2. B：给两个流式下载补 `response.data.on('error')` → reject（对齐 Arxiv 的正确实现）。
3. C：MinerU 三个 fetch 调用加 AbortController 超时（TIMEOUTS.EXTENDED）。
4. D：MCP 模式也把错误写入 stderr（`console.error`，不走 logger 早退）；`CallToolRequest` 外层包 `withTimeout` 兜底，超时返回错误而非挂起。

**第二优先 — 并发与延迟（P1 F/G/H）**
5. F/G：`findPaperByDoiAcrossPlatforms` 与 `get_paper_by_doi(all)` 改**有界并行**（沿用 `p-limit` 模式，如 4 并发）+ 整体超时（如 `TIMEOUTS.DEFAULT`）。
6. H：`AggregateSearch` 加**整体超时**（整个聚合一个 deadline，超时返回已收集结果）；加**p-limit 并发上限**（防打爆对方限流、控制瞬时负载）。**保留**真并行（不要改回串行）。

**第三优先 — 代码轻量（P2，保守版不做，激进分支做）**
7. I/J：激进精简分支里，把单平台工具收敛进 `search_papers(platform=xxx)` 内部路由、抽公共 helper、去三处重复。

**明确不做**（保守收敛版）：不改工具暴露面（保留 23 个）、不做大规模 DRY 重构、不动平台不可用（Sci-Hub/GS 反爬、ScienceDirect 401、Wiley 403 是外部凭证/权限问题，如实标注即可）。

## 五、验证方式

每项修改后：`npx tsc --noEmit` + `npx jest` 全量回归 + 第二轮回真实实测（复用 bench/measure.ts）对比延迟。
