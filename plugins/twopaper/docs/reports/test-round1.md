# TwoPaper 第一轮测试报告（改造前基线）

- 日期：2026-09-11（第二轮实测，取代同日早先的初版基线）
- 环境：Windows 11 / Node 24.18 / 本机代理 `127.0.0.1:7897`
- 凭证：`ENV/ENV_API.txt`（WOS / PubMed / Elsevier / Springer / Wiley 真实 key；`OPENALEX_API_KEY` 已配；`OA_EMAIL` **未配**）
- 方法：真实网络实测，未 mock。查询词 `large language models`，每渠道 `maxResults=3`
- 代码版本：`9616a64`（skills 重写后，源码未改）

> **本轮测试的目的**：在动手改代码之前，先拿到可信的基线数字，并定位真实瓶颈。
> 结果**推翻了上一版报告的多项结论**（见 §5）。

---

## 1. 单平台搜索延迟（冷启动）

| 平台 | 延迟 | 结果 |
|---|---|---|
| medRxiv | 19.41s | 3 hits |
| **arXiv** | **30.44s** | **FAIL**（HTTP 200 但响应超时/异常） |
| Google Scholar | 28.00s | FAIL（反爬，DOI 查询路径） |
| PubMed | 3.15s / 2.90s | 3 hits |
| Web of Science | 1.99s / 869ms | 3 hits |
| bioRxiv | 925ms | FAIL（API `non-ok state: empty messages`） |
| Semantic Scholar | — | FAIL（HTTP 429 免费层限流） |
| ScienceDirect | — | FAIL（`Invalid or missing API key`） |

**要点**：同一个平台在两次运行间波动极大（arXiv 1.15s → 30.44s，medRxiv 993ms → 19.41s）。这说明**单次测量不可靠**，也说明这些渠道的延迟长尾很长——聚合设计必须容忍长尾，不能假设某个平台"通常很快"。

## 2. 聚合搜索：真并行确认 ✅

| 指标 | 数值 |
|---|---|
| `aggregate(all)` 总耗时 | **10.93s** |
| 最慢单平台 | 38.25s |
| 所有单平台耗时之和 | 115.30s |
| **agg / 最慢** | **0.29x** |
| **agg / 之和** | **0.095x** |

→ **聚合确实并发执行**（远低于 0.5x 阈值）。这是当前架构最正确的部分，**必须保留**。

`failures=3`：bioRxiv（API 状态异常）、Semantic Scholar（429）、ScienceDirect（key 无产品权限）。**三个失败都未影响整体返回**（命中 5 篇，sources=[arxiv, webofscience, pubmed]）→ 平台级异常隔离有效。

## 3. DOI 跨平台元数据轮询

当前实现已是**有界并行**（`pLimit(4)` + `withTimeout`）：

- 实测 **17.68s**，命中 `[arxiv, scholar, sciencedirect]`
- 逐平台拆解（并行发起，各自计时）：

| 平台 | 延迟 | 结果 |
|---|---|---|
| arxiv | 541ms | HIT |
| semantic | 654ms | miss |
| iacr | 982ms | miss |
| medrxiv | 993ms | miss |
| crossref | 1.00s | miss |
| biorxiv | 1.06s | miss |
| scopus | 1.12s | HIT |
| pubmed | 1.24s | miss |
| springer | 1.29s | HIT |
| webofscience | 2.86s | miss |
| sciencedirect | 3.03s | miss |
| **googlescholar** | **28.00s** | **miss** |
| wiley | 0ms | miss |
| | **TOTAL(wall) 28.01s** | |

→ **除 googlescholar 外，其余平台全部在 3.1s 内完成。整条链路 28.01s 的墙钟时间几乎全部来自 Google Scholar 一家。**

## 4. `get_pdf` 端到端：**存在不可接受的挂起**

| 路径 | 实测 | 说明 |
|---|---|---|
| `get_pdf(paperId='2012.14096', platform='arxiv')` | **24.07s** | 成功下载，但文件名退化为 `2012.14096.pdf`（未解析出作者/年份/标题） |
| `get_pdf(paperId, platform)` 复测 | **>120s 未返回** | 第二次运行直接挂起，被超时终止 |
| `get_pdf(doi='10.48550/arXiv.1706.03762')` | **>420s 未返回** | 挂起，被超时终止 |
| `arxiv.getPaperByDoi(同一 DOI)` | **1.15s** | 正确返回 title + `pdfUrl=https://arxiv.org/pdf/1706.03762v7` |
| `OASource.findPdfByDoi(同一 DOI)` | **>180s 未返回** | 挂起 |

**这是本轮最重要的发现**：同一篇论文，直接问 arXiv 只要 1.15s，但走 `get_pdf` 要 400s+ 甚至永不返回。

### 根因（已定位到行）

1. **`OASource.findPdfByDoi` 的候选是"构造即发起"的 Promise 数组**（`src/services/OASource.ts:47-50`），三个源全部立即发出，再在 `for` 循环里逐个 `await`。
2. 每个源都包在 `ErrorHandler.retryWithBackoff` 里，**默认 `maxRetries=3` → 共 4 次尝试**，backoff 1s/2s/4s（`src/utils/ErrorHandler.ts:296-330`）。
3. 而 axios client 的 `timeout` 是 `TIMEOUTS.DEFAULT = 30s`。
4. 实测 OpenAlex 对该 DOI 返回 **429**，unpaywall 返回 **404** → 429 命中 `isRetryable` → 完整跑完 4 次尝试。
5. 叠加：`OA_EMAIL` 未配置时 Unpaywall 直接跳过，但 OpenAlex 仍会跑满重试梯子。

→ **单次 `get_pdf` 在 OA 阶段的墙钟上界可达 4 × 30s + backoff ≈ 2 分钟以上**，且这条路径**没有任何外层 withTimeout 兜底**（`withTimeout` 只包在 `findPaperByDoiAcrossPlatforms` 上，不包 `downloadPaperPdf`，更不包 `handleToolCall` 内 `get_pdf` 分支）。

## 5. `googlescholar` 过滤失效（导致 §3 的 28s）

`src/mcp/searchers.ts` 里注册表**同时**有 `googlescholar` 和 `scholar` 两个 key（指向同一实例），以及 `webofscience` / `wos`：

```
googlescholar: GoogleScholarSearcher;   // ← 真实 key
scholar:       GoogleScholarSearcher;   // ← 别名
```

而三处排除列表写的都是 `['wos', 'scholar', 'scihub']`：

- `src/mcp/handleToolCall.ts:35`（`findPaperByDoiAcrossPlatforms`）
- `src/mcp/handleToolCall.ts:374`（`get_paper_by_doi(all)`）
- `src/services/AggregateSearch.ts:57`（聚合）

**`'scholar'` 匹配不上 `'googlescholar'`** → Google Scholar 从未被真正排除。后果：

- 每次 `get_pdf(doi=...)` / `get_fulltext(doi=...)` 都白等 **28s** 反爬。
- 聚合搜索里也在白等（多一个并发槽位被占，且它的 28s 抬高了整体长尾）。

## 6. 结论（供改造）

| # | 结论 | 证据 |
|---|---|---|
| 1 | 聚合搜索是**真并行**，架构正确 | §2：agg/之和 = 0.095x |
| 2 | 平台级异常隔离**有效** | §2：3 个渠道失败仍正常返回 5 篇 |
| 3 | **`get_pdf` 的 OA 阶段会挂起数十秒到数分钟** | §4：420s+ 未返回；根因 retry×timeout |
| 4 | **`googlescholar` 排除失效** | §5：别名与实际 key 不匹配，28s 白等 |
| 5 | **`paperId+platform` 路径不解析元数据** | §4：文件名退化为 `2012.14096.pdf` |
| 6 | 单平台延迟**长尾极长且波动大** | §1：arXiv 1.15s↔30.44s |
| 7 | 上一版报告的 P0 缺陷**多数已修**，但漏了 retry 放大 | §4 根因 |

**改造优先级**（稳定 > 速度 > 轻量）：
1. 给 OA 阶段和整个 `get_pdf` 加硬超时；把 retry 策略改为"对外部 OA 源不重试或最多 1 次"。
2. 修 `googlescholar` 排除。
3. `paperId+platform` 路径改为先解析元数据（复用 1.15s 的 `getPaperByDoi`），保证命名质量。
4. 给慢渠道加**负缓存**（如 GS 失败后短期不再重试），避免每次调用重复白等。
