# 缺陷修复报告（Round 5）

**日期**：2026-09-16
**修复版本**：`twopaper@twopaper-market` @ `8d3f830`
**范围**：round3/round4 实测确认的 6 个缺陷，逐个修复 + 实测验证 + 回归测试
**回归测试**：`tests/regression/round5-fixes.test.ts`；全量 **31 套件 / 294 测试** 全绿

---

## 修复清单与前后对比

### 1. 【高】错误消息被无条件打码，诊断信息被摧毁

**位置**：`src/utils/ErrorHandler.ts`（`createUserMessage` / `handleError`）

| | 修复前 | 修复后 |
|---|---|---|
| `connect ECONNREFUSED 127.0.0.1:443` | `conn****************************:443` | `connect ETIMEDOUT 74.125.195.147:443; …`（原文） |

**修法**：`looksLikeToken(message) ? maskSensitiveData(message) : message`——只遮蔽"本身像密钥"的消息，真实报错原样透出。同文件的 `looksLikeToken()` 早就在（未被引用），正是本意。

### 2. 【高】`check_scihub_mirrors` 默认返回未探测的假状态

**位置**：`src/platforms/SciHubSearcher.ts`（`getMirrorStatus`）+ `src/mcp/handleToolCall.ts`

- 构造函数把 11 个镜像初始化 `isWorking:true`，`getMirrorStatus` 直接映射成 `"Working"`，**从不探测**（实测默认 8ms 报 11/11，物理上不可能）。
- **修法**：未做过健康检查（`lastHealthCheck===null`）时返回 `"Unverified"`；`check_scihub_mirrors` 返回体加 `probed:false` 与引导（`forceCheck:true` 触发真实探测，约 30–60s，结果缓存 5 分钟）。
- **下游**：`get_platform_status` 不再据此谎报 `workingMirrors`。

### 3. 【高】`getPaperByDoi` 不校验返回 DOI，会带出**别的论文**

**位置**：`src/platforms/PaperSource.ts`（基类）

- 旧：`search(doi)[0]` 直接返回。把 DOI 当普通关键词的平台（如 Springer）会返回"最相关"而非"就是这篇"，插件却断言命中 → **污染引用链**。
- **修法**：规范化（小写、去 URL 前缀）后比对返回项 `doi`，不匹配返回 `null`（宁缺毋滥）。
- 实测：查 `10.48550/arXiv.1706.03762` → 现在返回 `No paper found`（原先会带回一篇无关 Springer 论文）。

### 4. 【高】聚合里 WoS 恒 400（`sortField` 非法）

**位置**：`src/platforms/WebOfScienceSearcher.ts`（`mapSortField` / `buildSearchQuery`）

- 根因：`search_papers` 的 schema 给 `sortBy` **注入默认 `relevance`**，聚合把 `sortField:"relevance DESC"` 传给 WoS；而 WoS Starter **v2 只接受 `LD/PY/RS/TC`** → 400。单平台调用不传 sortBy 所以正常。
- 实测：`relevance DESC` → 400（`Allowed tags are LD, PY, RS, TC`）；`RS/TC/LD/PY DESC` → 200。
- **修法**：映射改为 `relevance→RS`、`date→PY`、`citations→TC`；映射不到时**省略该参数**（用服务端默认）。
- 实测：聚合 `sources_hit` 现已包含 **webofscience**。

### 5. 【高】bioRxiv/medRxiv 关键词检索恒为 0

**位置**：`src/platforms/BioRxivSearcher.ts`（`search` / `parseSearchResponse`）

- 两处根因叠加：
  1. **方向反了**：上游无关键词 API，只有时间正序分页；旧代码取 `cursor=0`（**最旧**一页）并在首个空页 `break` → 永远看不到近期论文。
  2. **匹配过严**：客户端过滤用**整句短语子串**（要求 Query 原文连续出现）→ 几乎命中不了任何论文。
- **修法**：
  - 从**最新页**（`cursor ≈ total - pageSize`）往回翻，页数（5）与墙钟（6s）双重封顶，避免拖垮聚合；
  - 匹配改为**按命中词元数打分**，保留 ≥ 半数词元者并按分数降序（1 词必须命中；2 词 AND；3 词 ≥2 …）。
- 实测：`CRISPR gene editing` → 8.4s 返回真实命中（原恒 0）。

### 6. 【中】`search_sciencedirect` 把 401 报成"key 未配置"

**位置**：`src/mcp/handleToolCall.ts`

- `ELSEVIER_API_KEY` 有效（Scopus 用同款 key 成功），但 ScienceDirect 产品未订阅 → 401 被归为 `unconfigured`，**误导用户去反复检查已正确的 key**。
- **修法**：401 时抛出明确文案——"key 已设置且对 Scopus 有效，几乎可以确定是 ScienceDirect 产品未授权，不是 key 失效"，并附申请/核对入口。

---

## 修复后实测基线

| 项 | 结果 |
|---|---|
| 聚合 `search_papers(all)` | 8.5s，命中 5 源（含 WoS），失败仅 `semantic`(限流) / `sciencedirect`(授权) |
| 错误可诊断性 | 原始报错可见（不再星号化） |
| scihub 镜像状态 | `Unverified`（未探测）/ 真实结果（`forceCheck` 后） |
| DOI 查询 | 不匹配即 `null`，不再带出无关论文 |
| bioRxiv 检索 | 8.4s 真实命中 |

## 修复后仍存在的**环境性**限制（非插件缺陷）

| 项 | 原因 | 解法 |
|---|---|---|
| `semantic` 429 | 免费档 20 rpm | 配 `SEMANTIC_SCHOLAR_API_KEY` |
| `googlescholar` 超时 | 网络不可达（本机无代理到 Google） | 配 `SCHOLAR_PROXY` |
| `sciencedirect` 401 | 产品未订阅 | 在 Elsevier 侧开通该产品 |
| `wiley` 下载 403 | TDM token 未在 Wiley 侧注册 | 机构订阅下注册 |
| bioRxiv 召回有限 | 上游无关键词检索，只能翻近期页做客户端过滤 | 属上游能力所限；已尽量提高并封顶成本 |
