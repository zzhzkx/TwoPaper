# TwoPaper — 一站式学术文献工具（MCP + Plugin for Claude Code & Codex）

TwoPaper 是一个发布于 GitHub 的 **MCP / Plugin / Marketplace** 项目，为 Claude Code 与 OpenAI Codex 提供一站式学术文献能力：**聚合搜索 → 统一拿 PDF → MinerU 全文转 Markdown → 宿主 Agent 做有出处的分析**，覆盖 13+ 学术平台（arXiv、PubMed、Crossref、Semantic Scholar、Scopus、Springer、Web of Science、bioRxiv、medRxiv、IACR、ScienceDirect、Wiley、Google Scholar、Sci-Hub 兜底）。

**核心工作流（4 个工具收敛）**：`search_papers(all)` → `get_pdf` → `get_fulltext` → `get_platform_status`。

## 一行命令安装

### Claude Code

```bash
claude plugin marketplace add zzhzkx/TwoPaper
claude plugin install twopaper@twopaper-market
```

### OpenAI Codex

```bash
codex plugin marketplace add zzhzkx/TwoPaper
codex plugin add twopaper@twopaper-market
```

### 自动更新

- **Claude**：插件清单未写死 `version`，更新跟随仓库 commit。用 `claude plugin update` 或 `/plugin marketplace update` 拉取最新。
- **Codex**：用 `codex plugin marketplace upgrade` 拉取最新。

安装后即可让 Agent 使用 `/twopaper` 技能或直接调用 `search_papers(all)` 等工具做文献检索与分析。

## 配置凭证（`env`，安装后可选）

| 变量 | 用途 |
|---|---|
| `MINERU_TOKEN` | `get_fulltext` PDF→Markdown（mineru.net/apiManage 申请） |
| `OA_EMAIL` | `get_oa_pdf` 合法 OA 定位（Unpaywall/Europe PMC 礼貌池） |
| `OPENALEX_API_KEY` | OpenAlex（key+credits 模式，可选） |
| `WOS_API_KEY` / `ELSEVIER_API_KEY` / `SPRINGER_API_KEY` / `WILEY_TDM_TOKEN` / `SEMANTIC_SCHOLAR_API_KEY` / `PUBMED_API_KEY` | 各付费/可选渠道 |
| `DOWNLOAD_PER_MINUTE` / `DOWNLOAD_PER_HOUR` / `DOWNLOAD_PER_DAY` | 下载限流，默认 `2` / `100` / `500`（0=关闭） |
| `GET_PDF_BRIDGE` | scansci 桥接模式：`hint`(默认) / `auto` / `none` |

完整清单见 [`plugins/twopaper/.env.example`](plugins/twopaper/.env.example)。

## 目录结构

```
TwoPaper/
├── .claude-plugin/marketplace.json    # Claude marketplace 目录
├── .agents/plugins/marketplace.json   # Codex marketplace 目录
└── plugins/twopaper/                  # 插件本体（一个目录服务双生态）
    ├── .claude-plugin/plugin.json     # Claude 插件清单（免 version → 自动更新）
    ├── .codex-plugin/plugin.json      # Codex 插件清单
    ├── .mcp.json                      # MCP stdio 声明
    ├── skills/twopaper/SKILL.md       # 宿主 Agent 工作流技能
    ├── src/                           # TS 源码
    ├── dist/                          # 编译产物（提交，安装即用免构建）
    └── package.json                   # MCP server（twopaper）
```

## 功能一览

- **聚合搜索**：`search_papers(platform="all")` 并发多平台、DOI/标题去重、来源标注、平台级异常隔离（单平台失败不阻断整体）。
- **统一拿 PDF**：`get_pdf` 合法 OA（Unpaywall/OpenAlex/Europe PMC）→ 平台 → scansci 桥接兜底；受机构硬限额（下载限流）管束；按 `作者_年份_短标题_哈希.pdf` 命名并归一目录。
- **全文转 Markdown**：`get_fulltext` 内集成 MinerU Precise API，把 PDF 转成干净 Markdown 供分析。
- **凭证/渠道管理**：`get_platform_status` 输出四态矩阵（UNCONFIGURED / OK / NEED_LOGIN / DEGRADED）+ 下载限流用量 + 缺失凭证清单。

## 合规与许可

- **主代码**：本仓库 MIT（作者署名见下）。
- **OA 源与思路**：Unpaywall / OpenAlex / Europe PMC 等公开 API 与竞速编排参考自 [scansci-pdf](https://github.com/Rimagination/scansci-pdf)（Apache-2.0 公开层）重实现。
- **scansci 闭源层**：`_core/*.pyd` 与 `_publisher_strategies_core.py` 为专有，不重新分发；付费墙下载经桥接调用用户本机已装好的 scansci MCP/CLI，凭证留在其侧。
- **Sci-Hub**：灰色源，仅在用户明确知情并接受风险时用于兜底。
- 原始搜索能力 fork 自 [paper-search-mcp-nodejs](https://github.com/Dianel555/paper-search-mcp-nodejs)（MIT，© Dianel555）。

## 开发

```bash
cd plugins/twopaper
npm install
npm run build     # tsc → dist/
npx jest          # 240 项测试
```
