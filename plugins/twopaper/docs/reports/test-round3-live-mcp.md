# TwoPaper 插件 —— Claude Code 真实调用测试报告

**测试日期**：2026-09-15
**被测版本**：`twopaper@twopaper-market` commit `7cc33b0`（installPath: `~/.claude/plugins/cache/twopaper-market/twopaper/7cc33b03cb26`）
**调用路径**：真实 MCP 协议（stdio JSON-RPC），非直接 import 模块
**运行环境**：Windows 11 / Node v24.18.0
**采样**：每目标 3 次，间隔 1s；延迟统计仅取成功样本

---

## 0. 结论速览

| 指标 | 结果 |
|---|---|
| MCP server 冷启动 | **823ms**（中位） |
| 可用渠道（真实返回结果） | **13 / 21** 个测试目标 |
| 免费渠道最快 | WoS 1951ms / IACR 2491ms / PubMed 2934ms |
| 最慢成功调用 | `search_papers(all)` 聚合 30.7s |
| 发现的插件缺陷 | **3 个已确认 + 1 个潜在** |

**一句话**：核心通路（搜索、PDF、状态）真实可用、延迟可接受；但**错误诊断层被系统性破坏**，且有**两个工具会输出未经核实的假信息**。

---

## 1. 可用性与延迟实测

### 1.1 成功渠道（按中位延迟排序）

| 渠道 | 工具 | 成功 | 中位延迟 | 命中 | 备注 |
|---|---|---|---|---|---|
| platform_status | `get_platform_status` | 3/3 | **702ms** | — | |
| scansci_status | `get_scansci_status` | 3/3 | **716ms** | — | |
| scihub_mirrors | `check_scihub_mirrors` | 3/3 | 747ms | — | ⚠️ 结果假（见 §2.2） |
| citations | `get_citations` | 3/3 | **1368ms** | — | |
| webofscience | `search_webofscience` | 3/3 | **1951ms** | 5,5,5 | 付费 key 生效 |
| iacr | `search_iacr` | 3/3 | 2491ms | 5,5,5 | |
| pubmed | `search_pubmed` | 3/3 | 2934ms | 5,5,5 | |
| scopus | `search_scopus` | 3/3 | 2957ms | 5,5,5 | 付费 key 生效 |
| springer | `search_springer` | 3/3 | 3296ms | 5,5,5 | ⚠️ DOI 路径有缺陷（见 §2.3） |
| crossref | `search_crossref` | 3/3 | 3774ms | 5,5,5 | |
| oa_pdf | `get_oa_pdf` | 3/3 | 4754ms | — | Unpaywall 命中 PLOS OA |
| doi_arxiv | `get_paper_by_doi` | 3/3 | 11103ms | 2,2,2 | 跨平台竞速 |
| pdf_arxiv | `get_pdf` | 3/3 | 13451ms | — | 正确转入 scansci 桥接 |
| medrxiv | `search_medrxiv` | 3/3 | 13923ms | 0,0,0 | 慢+空，见 §3.1 |
| scihub | `search_scihub` | 3/3 | 18812ms | — | 真实命中（单次复测 13.7s） |
| aggregate_all | `search_papers(all)` | 3/3 | **30709ms** | 10,10,10 | 命中 5 源 |

### 1.2 失败渠道

| 渠道 | 成功 | 分类 | 根因归属 |
|---|---|---|---|
| arxiv | 0/3 | rate_limited / timeout | **上游限流**（已用 curl+axios 双重复核） |
| biorxiv | 0/3 | other_error | **上游故障**（API 返回 `content-length: 0`） |
| semantic | 0/3 | rate_limited | **上游间歇 429 + 未配 key**（免费档 20 rpm） |
| sciencedirect | 0/3 | unconfigured | **产品未授权**（Elsevier key 有效但该产品未订阅） |
| googlescholar | 0/3 | other_error | **网络不可达**（curl 亦 21s 超时） |

### 1.3 延迟分层结论

- **亚秒级**：状态类查询（~700ms）
- **1–4s**：单平台检索主力区间（WoS / IACR / PubMed / Scopus / Springer / Crossref）
- **5–20s**：跨源操作（OA 定位、DOI 竞速、PDF、medRxiv、Sci-Hub）
- **30s 级**：聚合搜索 —— 被最慢参与渠道拖尾

聚合搜索 30.7s 是**结构性的**：它等最慢渠道。arXiv 限流时尤其明显。

---

## 2. 已确认的插件缺陷

> 全部经对抗性验证（独立 skeptic agent 逐条尝试推翻），3 项无一被推翻，置信度均为 high。

### 2.1 【高】错误消息被无条件脱敏，诊断信息被摧毁

**位置**：`src/utils/ErrorHandler.ts:196`

```ts
return `${prefix}${statusInfo}: ${maskSensitiveData(message)}`;
```

401/403/404/429/5xx 走硬编码文案，**其余一切错误都落到这一行**，被无条件打码。

`maskSensitiveData`（`src/utils/SecurityUtils.ts:474`）对任何 ≥8 字符的字符串只保留首尾各 `min(4, len/4)` 个字符，其余全部替换成星号。

**实测证据**（`docs/reports/raw/matrix_all.json`）：

| 原文 | 用户实际看到 |
|---|---|
| `biorxiv search failed: empty messages` | `bior****************************************************************ages` |
| `webofscience search failed (400: Bad Request - ...): Bad Request...syntax` | `Ba*******st` |
| `google_scholar search failed: connect ECONNREFUSED 127.0.0.1:443` | `conn****************************:443` |

**危害**：这三个恰好都是最需要原始信息的场景（上游异常、HTTP 400、网络拒绝连接）。用户拿到的是星号，无法定位问题。

**旁证意图**：同文件 `SecurityUtils.ts:486` 就有一个导出的 `looksLikeToken()`，显然本意是「只遮蔽像密钥的字符串」，但**从未被 ErrorHandler 引用**。

**修法**：`looksLikeToken(message) ? maskSensitiveData(message) : message`。

---

### 2.2 【高】`check_scihub_mirrors` 默认返回未经探测的硬编码假状态

**位置**：`src/mcp/handleToolCall.ts:542` + `src/platforms/SciHubSearcher.ts:41`

```ts
case 'check_scihub_mirrors': {
  const { forceCheck } = args;
  if (forceCheck) { await searchers.scihub.forceHealthCheck(); }  // ← 只有 truthy 才探测
  const mirrorStatus = searchers.scihub.getMirrorStatus();        // ← 无条件直接返回
```

构造函数把 11 个镜像全部初始化为 `isWorking: true`，**从不做任何网络探测**。`getMirrorStatus()` 只是把这个字面量映射成 `"Working"`。

**决定性对照实验**：

| 调用 | 耗时 | 报告 |
|---|---|---|
| `check_scihub_mirrors`（默认） | **8ms** | 11 个镜像**全部 Working** |
| `check_scihub_mirrors {forceCheck:true}` | **49227ms** | 仅 **2 个** Working（yt / mksa.top），**9 个 Failed** |

默认结果**完全错误**，且 8ms 的耗时本身就是不可能完成 11 次探测的破绽。

**扩散面**（验证者补充）：`get_platform_status`（`handleToolCall.ts:766`）复用同一个未探测的 `getMirrorStatus` 来报告 `workingMirrors` —— 假状态污染了两个工具。

**危害**：用户会以为 Sci-Hub 兜底通路健康。实际只有 2/11 可用。

---

### 2.3 【高】DOI 查询会返回**别的论文**，却断言「找到了你要的 DOI」

**位置**：`src/mcp/handleToolCall.ts:508`

```ts
return jsonTextResponse(`Found ${results.length} paper(s) with DOI ${cleanDoi}: ...`);
```

`cleanDoi` 是**用户传入的 DOI**，不是返回论文的 DOI。**无论实际返回什么，输出都断言匹配成功**。

**触发点**：`SpringerSearcher` 未重写 `getPaperByDoi`（grep 计数 0），因此走基类 `PaperSource.getPaperByDoi`：

```ts
const results = await this.search(doi, { maxResults: 1 });
return results.length > 0 ? results[0] : null;   // ← 不校验返回项 DOI 是否等于请求 DOI
```

Springer 的 `search()` 把 DOI 当**普通关键词**塞进 `params.q`，返回最相关的一条，不保证是那篇。

**实测**：

```
查 10.48550/arXiv.1706.03762（Attention Is All You Need）
返回 "Found 1 paper(s) with DOI 10.48550/arXiv.1706.03762"
实际 DOI: 10.1007/978-3-032-31998-2_4
实际标题: "Generative AI Driven Protein-Ligand Docking with a Quantum Enhanced Framework..."
```

**各平台行为还互不一致**（同一 DOI）：crossref / pubmed / semantic → 未找到；scopus → 命中但 `paper_id` 为空；springer → **命中一篇无关论文**；arxiv → 超时。

**危害**：这是**学术引用场景**。一个不校验 DOI 却断言匹配的检索工具，会把错误文献带进引用链。

**修法**：基类里比对返回项 `doi` 与请求 `doi`（规范化后），不匹配则返回 `null`。

---

### 2.4 【中·潜在】`search_arxiv` 重试阶梯无内层时间约束

> 此项原为「外层 60s 超时抢先中断内层报错」，**经对抗性验证被推翻**。以下是修正后的准确表述。

**静态事实（已确认）**：
- 单次 HTTP 超时 `TIMEOUTS.DEFAULT = 30000ms`
- `retryWithBackoff` 默认 `maxRetries = 3` → **4 次尝试**，且超时（无 status）被判为可重试
- 宿主对每次 `tools/call` 封顶 `TIMEOUTS.EXTENDED = 60000ms`
- 理论最坏墙钟 ≈ 30s×4 + 退避 ≈ **123.5s**，可超上限

**原命题为何错**：实测 50368ms **低于** 60s，外层定时器从未触发；且报文是内层 `arxiv search failed: timeout of 30000ms exceeded`，而非外层会产生的 `Tool 'search_arxiv' timed out`。50368ms = 一次完整 30s 超时 + 第二次尝试跑到 20.4s，是**重试链正常终止**。

**真实缺口**：`search_arxiv`（`handleToolCall.ts:283`）直接调 `searchers.arxiv.search()`，**绕过了** `AggregateSearch` 的内层 30s/平台约束。而 `src/services/OASource.ts:28` 有明确注释记录了这个「4 倍超时放大」风险并用 `maxRetries:1` 缓解 —— **ArxivSearcher 没做同样处理**。

**若真触发**：用户会收到不可诊断的 `Tool 'search_arxiv' timed out`。

**修法**：给 `ArxivSearcher` 对齐 `OASource` 的处理，或在该调用路径加内层 `withTimeout`。

---

## 3. 需澄清的「疑似问题」（非插件缺陷）

### 3.1 bioRxiv —— 上游 API 故障

插件报 `non-ok state: empty messages`。直连验证：

```
HTTP/1.1 200 OK
content-length: 0        ← 上游返回空 body
```

**上游此刻在返回空 200**。插件**如实报错而非伪装成「0 结果」，这个处理是正确的**，不应改。注意这与 medRxiv 形成对照 —— 同一套代码、同一上游家族，medRxiv 返回 `ok` 但 `n=0`。

### 3.2 Semantic Scholar —— 上游间歇 429 + 缺 key

直连三次：`429 / 429 / 200` —— **间歇性限流**。插件输出明确写了：

```
API Status: not configured (using free tier) (20 requests/minute)
```

你的环境**没有** `SEMANTIC_SCHOLAR_API_KEY`，只能吃 20 rpm 免费档。补 key 可解。

### 3.3 ScienceDirect —— 凭证有效但产品未授权

报 `Invalid or missing API key`。同一把 `ELSEVIER_API_KEY` 在 **Scopus 上工作正常**（3/3 成功）。说明是**该 key 未订阅 ScienceDirect 产品**，不是 key 本身失效。这与既定认知一致。

### 3.4 Google Scholar —— 网络不可达

直连 curl 21s 超时 `http=000`。需代理（`SCHOLAR_PROXY`）。**注意**：真实的 `connect ECONNREFUSED` 诊断被 §2.1 的打码 bug 摧毁了，正是那个 bug 危害的典型例证。

### 3.5 Wiley —— TDM token 未注册

```
Wiley TDM Error (403): TDM Client Token is invalid or not registered
```

凭证侧问题，需在 Wiley 侧注册 TDM token（通常要求机构订阅）。非代码缺陷。

### 3.6 MinerU —— 未配置，降级正确

```
MINERU_TOKEN not configured; and no platform full-text available.
```

降级提示清晰。**但全文转 Markdown 这条核心链路因此未获真实验证**。

---

## 4. 环境配置问题（重要）

### 4.1 `.env` 在 Claude Code 里永远不生效

`src/server.ts:22` 调用 `dotenv.config()` **不传路径**，默认从 `process.cwd()` 找 `.env`。而 MCP stdio server 的 cwd 是**宿主进程（Claude Code）的工作目录**，不是插件目录。

**后果**：README 写的「配置凭证（env）」在 Claude Code 里不成立。插件目录下的 `.env` 是死文件。

**当前唯一可行路径**：`~/.claude/settings.json` 的 `env` 块。

**建议修法**：`dotenv.config({ path: path.join(__dirname, '..', '.env') })`，或在 README 明确改为「通过宿主 env 注入」。

### 4.2 密钥注入验证

本次测试通过 `~/.claude/settings.json` 的 `env` 块注入后，`get_platform_status` 确认 **WoS / PubMed / Elsevier / Springer / Wiley 全部转为 `OK`**，且 WoS、Scopus、Springer 真实返回了结果 —— 证明该路径可行。

> ⚠️ **注意**：测试期间（15:31）`~/.claude/settings.json` 被外部覆盖，注入的密钥已不在文件中。备份存于 `~/.claude/settings.json.bak-twopaper-test`。当前需重新注入才能复现付费渠道结果。

---

## 5. 复现方式

```bash
cd plugins/twopaper
node scripts/bench/run_matrix.mjs --phase all --runs 3 --gap 1000
```

原始数据：`docs/reports/raw/matrix_all.json`
本次运行日志：`docs/reports/raw/matrix_run.log`

**新增脚本**：
- `scripts/bench/mcp_probe.mjs` —— 单次 MCP 协议调用探针，输出 `{ok, ms, text}` JSON
- `scripts/bench/run_matrix.mjs` —— 矩阵跑批，输出可用性/延迟统计

两者均走**真实 MCP stdio 协议**，测的是「Claude Code 调这个插件有多快」，而非「函数有多快」。

---

## 6. 未覆盖范围

| 项 | 原因 |
|---|---|
| `get_fulltext` 真实转换 | 无 `MINERU_TOKEN` |
| Wiley PDF 下载 | TDM token 未注册（403） |
| 付费渠道串行批量 | 会触发 §2.4 的超时放大风险，未做压力测试 |
| 代理环境下的 GS / Sci-Hub | 无代理配置 |
| 并发场景稳定性 | 矩阵为串行采样；WoS 单测成功但聚合中出现过 400 |

**不做的**：未做违反官方限流的压力测试。arXiv / Semantic 的限流数据来自自然重试过程，非主动压测。
