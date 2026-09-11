---
name: twopaper-fulltext
description: 学术论文全文提取与正文阅读。用户要"读某篇论文全文""提取论文正文内容""把 PDF 转成 Markdown""看论文的公式/表格/版式""基于正文做分析"时触发。用 MinerU 把 PDF 转成干净 Markdown，返回正文与缓存路径。
---

# 学术论文全文（PDF → Markdown）

`get_fulltext` 把 PDF 通过 **MinerU Precise API** 转成**干净 Markdown**（公式 / 表格 / 版式还原），供你基于正文做分析。需要 `MINERU_TOKEN`（[mineru.net/apiManage](https://mineru.net/apiManage) 申请，免费额度日 1000 页）。

---

## 三种调用方式

**方式一：给 DOI，内部先下载再转换**

```json
{ "tool": "get_fulltext", "arguments": { "doi": "10.1038/nature12373" } }
```

**方式二：给已有本地 PDF 路径（跳过下载，最快）**

```json
{ "tool": "get_fulltext", "arguments": { "pdfPath": "./downloads/smith_2020_title_abc123.pdf" } }
```

**方式三：给平台 ID**

```json
{ "tool": "get_fulltext", "arguments": { "paperId": "2012.14096", "platform": "arxiv" } }
```

**参数**：

| 参数 | 说明 |
|---|---|
| `doi` | DOI（内部走 `get_pdf` 先拿 PDF） |
| `paperId` + `platform` | 平台内 ID |
| `pdfPath` | 已有本地 PDF（**推荐**：若已用 `get_pdf` 拿到路径，直接传它可跳过重复下载） |
| `maxPages` | 封顶解析页数（最大 200） |

---

## 返回与降级

- **成功**：`Full-text (modelVersion) cached at <路径>` + 完整 Markdown 正文。Markdown 缓存到 `MINERU_OUTPUT_DIR`（默认 `./fulltext`）下的 `<pdf名>.full.md`。
- **未配 `MINERU_TOKEN`**：
  - 若该平台有本地全文能力 → 降级返回纯文本（标记 `degraded_to_text`）。
  - 否则提示配置 token。
- **内部下载失败** → 返回 scansci 桥接指令块。此时先按 twopaper-pdf 的桥接流程拿到 PDF 路径，再用**方式二**传入。

---

## 分析准则

1. 拿到 Markdown 后由**你**做分析，引用处带 DOI：`(doi:10.xxxx/yyy)`。
2. 渠道拿不到全文时如实标注"仅摘要 / 仅元数据"，**不臆造正文内容**。
3. MinerU 是远程服务且按页计费额度；批量转换大文档前先估算页数，必要时用 `maxPages` 封顶。
4. **优先传 `pdfPath`**：若上一步 `get_pdf` 已下载，直接复用可省一次下载（也少占一次下载配额）。
