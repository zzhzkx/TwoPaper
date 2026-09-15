# TwoPaper 架构审查报告与改进指南（第二轮）

- 日期：2026-09-15
- 审查对象：commit `3a64c4b`（含 `9616a64` skills 重写）
- 方法：源码逐行核对 + 真实网络实测复现 + 独立对抗性验证（每条结论由独立审查者尝试推翻，推翻失败才采纳）
- 对照基线：[test-round1.md](test-round1.md)

---

## 〇、先纠正上一版报告

上一版 [architecture-review.md](architecture-review.md)（写于 `586aaaa`，2026-09-11）列的 P0 缺陷 **A–H 共 8 条，在 `0e48477` 里已全部修掉**，但报告本身没有更新。逐条核对：

| 旧报告 | 现状（本报告核对代码后） |
|---|---|
| A. `paperId` 分支被 `&& cleanDoi` 门控 | **已修**（`handleToolCall.ts:585-590` 改为独立分支） |
| B. 流下载无 source-stream error 监听 | **部分已修**：`PDFExtractor.ts:161`、`SemanticScholarSearcher.ts:384` 已补；**`BioRxivSearcher.ts:253`、`IACRSearcher.ts:261` 仍缺失**（见 D1） |
| C. MinerU fetch 无 AbortController | **已修**（`MinerUClient.ts:141` `fetchWithTimeout`） |
| D. MCP 模式静默吞错 | **已修**（`server.ts:105` `logFatal` 走 `console.error`） |
| E. `get_paper_by_doi(all)` 含 Sci-Hub | **名义已修，实际未修**：过滤的是别名 `'scholar'`，真实 key `'googlescholar'` 仍被查询（见 D2） |
| F. DOI 跨平台串行轮询 | **已修**（`pLimit(4)` + `withTimeout`，`handleToolCall.ts:31-45`） |
| G. `get_paper_by_doi(all)` 串行 | **已修**（同上模式，`:374`） |
| H. 聚合无并发上限/无整体超时 | **已修**（`AGGREGATE_CONCURRENCY=6` + 单平台 `withTimeout`） |

**结论：旧报告的"缺陷清单"已失效，但其"改进指南"第 5–6 条的思路是对的。** 本报告基于当前真实代码重做审查。

---

## 一、总体结论

分层结构 `platforms/ → services/ → mcp/` 是合理的，**两个架构亮点经实测确认成立**：

1. **聚合搜索是真并行**：`aggregate/all` = 10.93s，各平台之和 115.30s，比值 **0.095x**。
2. **平台级异常隔离有效**：3 个渠道失败（bioRxiv / Semantic / ScienceDirect）仍正常返回 5 篇。

**但存在 3 类真实问题**，按优先级：

| 级别 | 问题 | 后果 |
|---|---|---|
| **P0** | `downloadPaperPdf` 无整体超时，叠加 OA 源 retry 梯子 | `get_pdf(doi=...)` 实测 **>420s 不返回**，宿主 Agent 卡死 |
| **P1** | 别名过滤失效：`'scholar'` ≠ `'googlescholar'` | 每次 DOI 查找白等 **28s** 反爬 |
| **P1** | 平台 `downloadPdf` 与 `PaperNamer` 对 `savePath` 的**契约不一致** | 目录名变成 `*.pdf`、命名去重失效、`savePath` 被重复拼接 |

---

## 二、P0：`get_pdf` 会挂起数分钟

### 现象（实测）

| 调用 | 实测 |
|---|---|
| `arxiv.getPaperByDoi('10.48550/arXiv.1706.03762')` | **1.15s** ✅ |
| `get_pdf(doi='10.48550/arXiv.1706.03762')` | **>420s 未返回** ❌ |
| `OASource.findPdfByDoi(同一 DOI)` | **>180s 未返回** ❌ |
| `get_pdf(paperId='2012.14096', platform='arxiv')` | 24.07s（成功，但文件名退化） |

同一篇论文，直接问 arXiv 1.15s，走 `get_pdf` 却不返回。**这是本项目最严重的缺陷。**

### 根因（已定位到行）

```
downloadPaperPdf(handleToolCall.ts:57-107)
  └─ L76: await oaSource.findPdfByDoi(cleanDoi)      ← 无超时包裹
        └─ OASource.findPdfByDoi:44-50
             const candidates = [fromUnpaywall(doi), fromOpenAlex(doi)]   ← 构造即发起
             for (const attempt of candidates) { await attempt }          ← 串行 await
               └─ 每个源内 ErrorHandler.retryWithBackoff
                    └─ ErrorHandler.ts:297  maxRetries = 3   → 共 4 次尝试
                    └─ backoff 1s / 2s / 4s
                    └─ axios timeout = TIMEOUTS.DEFAULT = 30s
```

**最坏墙钟** = 4 × 30s + 7s backoff ≈ **127s / 每个源**，且：

- `withTimeout` 只包在 `findPaperByDoiAcrossPlatforms`（元数据查找）上，**不包 `downloadPaperPdf`**。
- `server.ts:70` 的外层 `withTimeout(..., TIMEOUTS.EXTENDED=60s)` 本应兜底——但实测 >420s，说明**该兜底也没有生效**（见 §二-3）。

> **后续复核修正（[test-round2.md](test-round2.md) §4）**：本条应定性为**「有界性缺失」**，
> 而非「确定性挂起」。2026-09-15 实测该 DOI 的三个 OA 源均返回**快速确定性负结果**
> （unpaywall 422 @1.9s / openalex 404 @1.8s / europepmc 200 @8.8s），**不进重试梯子**，
> 故「4×30s」在该 DOI 上复现不出来；先前的 420s 挂起更可能来自瞬时 429/网络半开。
> 修复的必要性不变（上界客观存在，且 404/422 本就不该重试），仅严重性措辞需收窄。

### 三个独立缺陷叠加

**（1）retry 策略与外部服务不匹配**
`ErrorHandler` 的 `maxRetries=3` 是为"本方可恢复的瞬时故障"设计的，却被套用在**第三方 OA 源**上。对 429 等可重试错会跑满 4 次；对 404/422 这类确定性负结果本就不该重试（`isRetryable` 已正确排除，但仍属策略错配）。

**（2）eager promise 造成无效上游负载**
`candidates` 数组在构造时 `fromUnpaywall()` / `fromOpenAlex()` **立即开始执行**。当 Unpaywall 先命中返回时，OpenAlex 的请求仍在飞行、继续占限流预算。
（诚实说明：这**不增加调用方墙钟**，因为 `for` 循环先 await 第 0 个元素。它是**上游负载与限流预算的浪费**，不是延迟缺陷。上一版报告把它算成延迟浪费，是错的。）

**（3）外层超时未兜住——需重点确认**
`server.ts:70` 的 `withTimeout(handleToolCall(...), 60000)` 理论上应在 60s 处切断。实测 420s 不返回，说明 `withTimeout` 的实现有缺陷：`SecurityUtils.ts:442-449` 用 `Promise.race([promise, timeout])`，**race 只让调用方提前收到 reject，并不会取消底层 promise**。底层 axios 请求与 retry 循环继续跑，进程无法释放。这解释了"为什么设了超时还会卡"。

> **这是本轮最有价值的发现**：`withTimeout` 是**伪超时**——它让上层以为超时了，底层却从未被取消。项目里所有 `withTimeout` 调用点都受此影响。

---

## 三、P1：别名过滤失效（`'scholar'` ≠ `'googlescholar'`）

`searchers.ts` 同时注册真实 key 与别名，指向**同一实例**：

```ts
webofscience: WebOfScienceSearcher;   wos:     WebOfScienceSearcher;    // 同实例
googlescholar: GoogleScholarSearcher; scholar: GoogleScholarSearcher;   // 同实例
```

而三处排除列表都写 `['wos', 'scholar', 'scihub']`：

| 位置 | 作用 |
|---|---|
| `handleToolCall.ts:35` | `findPaperByDoiAcrossPlatforms`（`get_pdf`/`get_fulltext` 的前置） |
| `handleToolCall.ts:374` | `get_paper_by_doi(platform='all')` |
| `AggregateSearch.ts:57` | 聚合搜索 |

`'scholar'` 匹配不上 `'googlescholar'`，`'wos'` 匹配不上 `'webofscience'` → **GS 与 WoS 从未被排除**。

实测后果（DOI 查找逐平台拆解）：

| 平台 | 延迟 |
|---|---|
| arxiv / semantic / iacr / medrxiv / crossref / biorxiv | 541ms – 1.06s |
| scopus / pubmed / springer | 1.12s – 1.29s |
| webofscience / sciencedirect | 2.86s / 3.03s |
| **googlescholar** | **28.00s** ❌ |
| | **总墙钟 28.01s** |

**除 GS 外全部 ≤3.1s。整条链路 28s 几乎全来自 GS 一家。** 修掉可让 `get_pdf(doi=...)` 的前置查找从 28s 降到 ~3s。

---

## 四、P1：`savePath` 契约不一致（三个连带 bug）

### 契约分歧

| 调用方 | 认为 `savePath` 是 |
|---|---|
| `PaperNamer.resolveTargetPath`（`PaperNamer.ts:52`） | **文件全路径** `.../Author/Author_Year_Title_hash.pdf` |
| `PDFExtractor.downloadPdf`（OA 分支） | **文件全路径** ✅ |
| **全部平台 `downloadPdf`** | **目录**，自己再 `path.join(savePath, name)` |

`downloadPaperPdf:71` 把 `target`（文件全路径）传给平台下载：

```ts
const filePath = await searcher.downloadPdf(paper.paperId || cleanDoi, { savePath: target });
```

平台侧 `ArxivSearcher.ts:222` / `SpringerSearcher.ts:344` / `SemanticScholarSearcher.ts:348` / `IACRSearcher.ts:225` / `WileySearcher.ts:112` / `SciHubSearcher.ts:399` / `BioRxivSearcher.ts:231` 都是 `path.join(savePath, filename)`，且前面有 `fs.mkdirSync(savePath, {recursive:true})`。

→ 产出 `downloads/Author/Author_Year_Title_hash.pdf/2301.12345.pdf`：**一个名字以 `.pdf` 结尾的目录，里面躺着真 PDF**。`PaperNamer.findExisting` 的 `fs.existsSync(文件路径)` 永远为 false → **去重与命名契约完全失效**。

### 连带 bug 1：`savePath` 被重复拼接（实测复现）

```
get_pdf(paperId='2012.14096', platform='arxiv', savePath='./downloads/__probe')
  实际落盘 → downloads/downloads/__probe/2012.14096.pdf
```

`sanitizeDownloadPath('./downloads/__probe', './downloads')` 把用户路径**相对基准目录再 resolve 一次**（`SecurityUtils.ts:51` `path.resolve(resolvedBase, trimmed)`），于是 `./downloads/__probe` → `<cwd>/downloads/downloads/__probe`。

### 连带 bug 2：`paperId` 路径不解析元数据

`handleToolCall.ts:585-590` 构造 `{paperId, source}` 桩对象，无 `authors`/`year`/`title` → `PaperNamer` 退化为 `downloads/Unknown/Unknown_paper_<hash>.pdf`。

实测 `get_pdf(paperId='2012.14096', platform='arxiv')` 耗时 **24.07s**，落盘 `2012.14096.pdf`。
而 `arxiv.getPaperByDoi('10.48550/arXiv.2012.14096')` 只需 **1.0s** 就返回正确 title 与 `pdfUrl`。

→ **同一个平台，解析元数据比裸下载还快 24 倍**，且拿到正确文件名。

---

## 五、P2：稳定性与资源问题

| # | 问题 | 定位 | 说明 |
|---|---|---|---|
| D1 | **bioRxiv / IACR 下载源流出错时 Promise 永不 settle** | `BioRxivSearcher.ts:253`、`IACRSearcher.ts:261` | 只挂 `writer.on('finish'/'error')`，缺 `response.data.on('error')`。源流中断时 writer 既不 finish 也不 error → 永久挂起，socket 与 WriteStream 泄漏。arXiv/PDFExtractor/Semantic/Wiley 都已正确实现 |
| D2 | **失败下载永久吃掉限流配额** | `handleToolCall.ts:81,95` | `acquire()` 在任何网络 I/O 之前乐观记账，下载抛错后无 rollback（全库 grep `release\|rollback\|refund` 无匹配）。默认 `DOWNLOAD_PER_MINUTE=2`，两次失败即锁死 60s。滑动窗口会自愈，但语义上配额应只记成功下载 |
| D3 | **`PlatformRegistry.getStatus(validate=true)` 串行校验** | `PlatformRegistry.ts:59-92` | `for` 循环逐个 `await validateApiKey()`，每个内部都发真实 search。`0e48477` 并行化了另外两处同类循环，漏了这处 |
| D4 | **`withTimeout` 是伪超时** | `SecurityUtils.ts:437-450` | `Promise.race` 只让调用方提前 reject，**不取消底层操作**。所有调用点都受此影响（见 §二-3） |
| D5 | **`OASource` eager promise 浪费上游配额** | `OASource.ts:44-46` | 见 §二-(2) |
| D6 | **慢渠道无负缓存** | `AggregateSearch.ts` | GS 每次失败都要重跑 28s；无"近期失败则短期跳过"机制 |

---

## 六、代码质量问题（不阻塞，供后续精简）

| # | 问题 | 量级 |
|---|---|---|
| Q1 | 工具契约在 4 处重复声明且已漂移：`tools.ts`（549 行手写 JSON Schema）+ `schemas.ts`（zod）+ `handleToolCall.ts`（分发）+ `PlatformRegistry.CATALOG` | wiley 只在下载侧出现；`paperId` 未在 `tools.ts` schema 里声明但代码支持 |
| Q2 | 11 个单平台 search 分支是刻板重复模板（解构 → search → `JSON.stringify`） | `handleToolCall.ts:176-520`，约 340 行 |
| Q3 | `p-limit` 与自研 `mapLimit` 并存 | 两套有界并发实现，何必 |
| Q4 | `downloads/`、`downloads_smoke/`、`tmp/` 遗留产物 | 已在 `.gitignore`，但工作区有残留 |

---

## 七、改进指南（优先级：稳定 > 速度 > 轻量）

### 第一优先：消除挂起（P0 + D1 + D4）

1. **给 `downloadPaperPdf` 整体加硬超时**，并让超时真正生效——用 `AbortController` 贯通 axios，而非 `Promise.race`。
2. **OA 源不重试确定性负结果**：404/400 直接放弃；429 才重试且最多 1 次。把 `ErrorHandler.retryWithBackoff` 的 `maxRetries` 在 OA 调用点显式降到 1。
3. **修 `withTimeout`**：改为接受 `AbortSignal`，或明确降级为"仅提前返回、不承诺取消"并在文档里写明；对 HTTP 路径优先用 axios 自身 `timeout`。
4. **补 `response.data.on('error')`** 到 BioRxiv / IACR，对齐 arXiv 的正确实现。
5. `OASource.findPdfByDoi` 改为**惰性**候选（`() => this.fromUnpaywall(doi)`），命中即不再发起后续源。

### 第二优先：延迟与正确性（P1）

6. **修别名过滤**：三处排除列表改用真实 key `['googlescholar','webofscience','scihub']`；更稳的做法是在 `searchers.ts` 里给别名打标记，过滤时按**实例**去重，而非按 key 字符串。
7. **统一 `savePath` 契约**：`downloadPaperPdf` 只在 `savePathOverride` 给定时才当目录用；默认路径下把 `target` 拆成 `dir + filename`，让平台下载与 `PaperNamer` 语义一致。
8. **修 `sanitizeDownloadPath` 的重复拼接**：用户给的相对路径不应相对 `baseDir` 再 resolve。
9. **`paperId` 路径先解析元数据**：复用 `getPaperByDoi`（实测 1.0s）。

### 第三优先：资源与轻量（P2）

10. 失败下载**不记账**（先下载成功再 `acquire`，或失败时 rollback 对应时间戳）。
11. `PlatformRegistry.getStatus` 改有界并发。
12. 慢渠道加**负缓存**（失败后 N 分钟内跳过），直接消掉 GS 的 28s。

### 明确不做

- 不改工具暴露面（保持 23 个，向后兼容）。
- 不做 Q1/Q2 的大规模 DRY 重构——**稳定性优先**，契约收敛留待后续；重复但正确的代码优于抽象但引入回归的代码。
- 不动渠道授权问题（ScienceDirect 401、Wiley 403）——那是凭证/权限，不是代码 bug，只如实标注。

---

## 八、验收方式

每项修改后：`npx tsc --noEmit` + `npx jest`（当前 27 suites / 240 tests 全绿）+ 真实网络复测（复用 `scripts/bench/measure.ts`），重点复测：

- `get_pdf(doi=...)` 必须 **< 30s 返回**（当前 >420s 不返回）
- DOI 前置查找 **< 5s**（当前 28s）
- `get_pdf(paperId, platform)` 命名必须带作者/年份（当前退化为裸 ID）
- `savePath='./x'` 必须落到 `./x`（当前落到 `./downloads/x`）
