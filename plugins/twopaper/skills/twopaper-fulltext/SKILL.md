---
name: twopaper-fulltext
description: 学术论文全文提取与正文阅读。当用户要"读某篇论文全文""提取论文正文内容""把 PDF 转成 Markdown""看论文的公式/表格/版式内容""基于正文做分析"时触发。使用 MinerU 把 PDF 转成干净 Markdown，返回正文与缓存 .md 路径。
---

# 学术论文全文（fulltext）

`get_fulltext` 把 PDF 通过 MinerU 转成**干净 Markdown**（公式/表格/版式还原），供宿主 Agent 基于正文做分析。需要 `MINERU_TOKEN`（mineru.net/apiManage 申请，日 1000 页）。

## 用法

**方式一：给 DOI，自动先下载再转换**

```json
{ "tool": "get_fulltext", "arguments": { "doi": "10.1038/nature12373" } }
```

**方式二：给已有本地 PDF 路径（跳过下载）**

```json
{ "tool": "get_fulltext", "arguments": { "pdfPath": "./downloads/smith_2020_title_abc123.pdf" } }
```

**方式三：给平台 paperId**

```json
{ "tool": "get_fulltext", "arguments": { "paperId": "2012.14096", "platform": "arxiv" } }
```

可选参数：`maxPages`（封顶解析页数，max 200）。

## 返回与降级

- 成功：`Full-text (modelVersion) cached at <路径>` + 完整 Markdown 正文。
- **未配 `MINERU_TOKEN`**：若该平台有本地全文能力则降级返回纯文本（`degraded_to_text`），否则提示配置 token。
- 需要先有 PDF 才能转；若 `get_fulltext` 内部下载失败并返回 scansci 桥接指令，先按 pdf skill 走桥接拿到路径，再用方式二传入。

## 分析准则

1. 拿到 Markdown 后由**你**做分析，引用时带 DOI：`(doi:10.xxxx/yyy)`。
2. 渠道拿不到全文时，如实标注"仅摘要/仅元数据"，**不臆造正文内容**。
3. MinerU 是远程服务（PDF→MD），注意 token 日配额；批量转换较大文档前估算页数。
