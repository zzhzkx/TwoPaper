---
name: twopaper-citations
description: 学术论文引用数据。用户要"查某篇论文的被引数/引用量""看参考文献数""看影响力/高被引""综述里收集引用信息""按引用量排序"时触发。提供单篇论文的引用数、参考文献数、影响力引用数等集中获取。
---

# 学术论文引用数据

`get_citations` 用 **Semantic Scholar** 按 DOI 取一篇论文的引用数据。

---

## 用法

```json
{ "tool": "get_citations", "arguments": { "doi": "10.1038/nature12373" } }
```

| 参数 | 说明 |
|---|---|
| `doi` | **必填**，论文 DOI |
| `forceRefresh` | 默认 `false`（走缓存）；要拉最新数据传 `true`（会绕过缓存重新请求） |

---

## 返回字段

| 字段 | 含义 |
|---|---|
| `citation_count` | 被引数 |
| `reference_count` | 该文引用的参考文献数 |
| `influential_citation_count` | 高影响力引用数（Semantic Scholar 特有指标） |
| `year` | 发表年份 |
| `venue` | 期刊/会议 |
| `authors` | 作者列表（带 Semantic Scholar authorId） |
| `url` | 语义学者页面链接 |
| `paper_id` / `title` / `doi` | 标识信息 |

---

## 典型场景

1. **评估影响力** → 查被引规模，写进综述衡量该工作在学界的地位。
2. **排序检索结果** → 配合 `search_papers` 的 `sortBy:"citations"`，或对候选论文逐个查引用数后排序。
3. **顺藤摸瓜** → 拿到标题/年份/作者后，回到 twopaper-search 搜相关工作，或 twopaper-pdf 拿全文。

---

## 工作准则

1. 引用数据来自 **Semantic Scholar**，可能缺失或滞后（尤其新论文、非英文文献）。**如实标注来源与可能的滞后**。
2. 引用数与摘要来自不同源时，各自标明出处，**不要跨源混成一条无出处的结论**。
3. 查不到时（`No citation data found for DOI`）明确告知用户，不要用其他来源的数字冒充。
