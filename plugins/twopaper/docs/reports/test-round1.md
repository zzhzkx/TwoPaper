# TwoPaper 第一轮测试报告（优化前基线）

- 日期：2026-09-11
- 环境：Windows 11 / node 24 / 本机代理 127.0.0.1:7897（规则模式）
- 凭证：ENV/ENV_API.txt（真实 key：WOS / PubMed / Elsevier / Springer / Wiley）
- 测量脚本：`scripts/bench/measure.ts` + `run.ts`（真实网络，未 mock）
- 查询词：`large language models`，每渠道 maxResults=3

## 1) 单平台搜索延迟（含各自内部限流等待，冷启动）

| 平台 | 延迟 | 结果 |
|---|---|---|
| Google Scholar | 24.8s | FAIL（反爬 blocked，重试 3 次后放弃） |
| medRxiv | 11.3s | 3 hits |
| Semantic Scholar | 10.0s | FAIL（免费层 429 限流） |
| Springer | 6.5s | 3 hits |
| PubMed | 3.6s | 3 hits |
| Crossref | 1.5s | 3 hits |
| Scopus | 1.3s | 3 hits |
| IACR | 1.1s | 3 hits |
| ScienceDirect | 1.1s | FAIL（401 key 无该产品权限） |
| arXiv | 0.96s | 3 hits |
| bioRxiv | 0.91s | FAIL（API 返回非 200 状态） |
| Web of Science | 0.83s | 3 hits |
| WoS（v2 别名同实例） | 0.67s | 3 hits |
| Sci-Hub（搜索语义） | 0s | 0 hits（DOI 检索 + 代理反爬） |

> 注：Springer/Scopus/WoS 首次正式经代理实测通过（此前记忆记录待真实确认）。

## 2) 聚合 search_papers(all)：真并行确认

- 聚合总耗时 `≈12.7s`；最慢单平台 24.8s；所有单平台耗时之和 `≈65s`。
- **聚合/各平台之和 ≈ 0.12–0.21x** → **确认是真并行**（Promise.allSettled 同时发起，总耗时≈最慢有效平台）。
- 聚合命中 5 篇，sources=[arxiv, pubmed, medrxiv]；在 GS/Semantic/bioRxiv 失败下仍正常返回 → **平台级异常隔离有效**（设计正确点）。

## 3) DOI 元数据跨平台轮询：**串行是明确瓶颈**

| 方式 | 延迟 | 说明 |
|---|---|---|
| 串行（现实现 `for` 循环） | `25.4s` | get_paper_by_doi(all) / get_pdf 内部 findPaperByDoi 的真实行为 |
| 并行（Promise.all 候选） | `11.5s` | 相同命中[arxiv,springer,scopus] |

→ **串行/并行 = 2.21x**。`get_pdf` 一次调用仅找元数据就要 20–25s（每个平台 getPaperByDoi 内部又各做一次 search），这是用户体验最大的卡点。

## 4) PDF 定位延迟

- OA 定位（Unpaywall/OpenAlex/EuropePMC）`get_oa_pdf`：`680ms–2.7s`；对纯 arXiv 预印本 DOI 未命中（Unpaywall 通常不收录 arXiv，可接受）。
- 统一 `get_pdf` 端到端：因元数据查找串行，实测主导开销来自第 3 节（20–25s）。

## 关键结论（供改进）

1. **聚合搜索已是真并行**（保留），但缺并发上限与整体超时，需加固。
2. **DOI 元数据跨平台轮询串行 → 2.2x 浪费**，应改有界并行（复用 p-limit 模式）。
3. GS/Semantic/bioRxiv 失败是**渠道自身反爬/限流/状态**，聚合隔离已兜住，但应对渠道做**健康标记**避免每次重复白等（GS 每次 25s）。
4. ScienceDirect 401 / Wiley 权限是**凭证权限问题**（非代码 bug），须在状态报告里清楚标注，避免每次真请求白等。
