---
name: twopaper-citations
description: 学术论文引用数据。当用户要"查某篇论文的被引数/引用量""看参考文献列表""看影响力/高被引""做文献综述时收集引用信息"时触发。提供引用数、参考文献、影响力引用的集中获取。
---

# 学术论文引用（citations）

`get_citations` 用 Semantic Scholar 按 DOI 取一篇论文的引用数据：被引数、参考文献数、影响力引用数、年份、期刊、作者、链接。

## 用法

```json
{ "tool": "get_citations", "arguments": { "doi": "10.1038/nature12373" } }
```

- `doi`：必填，论文的 Digital Object Identifier。
- `forceRefresh`：默认 `false`（走缓存）；要强制拉最新传 `true`。

## 返回字段

`citation_count`（被引数）、`reference_count`（参考文献数）、`influential_citation_count`（影响力引用）、`year`、`venue`（期刊/会议）、`authors`、`url`。

## 场景

- 查某论文在学界的被引规模 → 综述里评估影响力。
- 做相关工作时，用引用数排序已有检索结果（可配合 `search_papers` 的 `sortBy:"citations"`）。
- 拿到标题/年份后，可回到 twopaper-search / twopaper-pdf 继续深挖。

## 工作准则

1. 引用数据来自 Semantic Scholar（可能缺失或滞后，如实标注来源）。
2. 引用数与摘要各标来源，不要跨源混成无出处的一条。
