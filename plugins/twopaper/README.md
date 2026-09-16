# Paper Search MCP (Node.js)

## English|[中文](../../README.md)

A Node.js Model Context Protocol (MCP) server for searching and downloading academic papers from multiple sources, including arXiv, Web of Science, PubMed, Google Scholar, Sci-Hub, ScienceDirect, Springer, Wiley, Scopus, Crossref, and **14 academic platforms** in total.

![Node.js](https://img.shields.io/badge/node.js->=18.0.0-green.svg)
![TypeScript](https://img.shields.io/badge/typescript-^5.5.3-blue.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platforms](https://img.shields.io/badge/platforms-14-brightgreen.svg)
![Version](https://img.shields.io/badge/version-0.2.7-blue.svg)

## ✨ TwoPaper Fusion (One-Stop Literature Workflow)

> **TwoPaper** 是本项目的融合演进：单一入口覆盖「搜索 → 拿全文 → PDF→Markdown → 有出处的分析」，供 Claude Code / Codex 使用。既有 19 个工具保持兼容；新增的高价值入口把日常工作流收敛到 4 个工具。

**核心收敛入口**：`search_papers(platform="all")`（真聚合检索）→ `get_pdf`（统一拿 PDF）→ `get_fulltext`（MinerU PDF→Markdown）→ `get_platform_status`（统一凭证/限流状态）。

- **`get_oa_pdf`**：合法 OA 定位（Unpaywall / OpenAlex / Europe PMC），返回 PDF 直链与许可。
- **`get_pdf`**：OA → 合法平台 → **scansci 桥接** 兜底。受机构下载硬限额约束（`DOWNLOAD_PER_MINUTE/HOUR/DAY`，默认 2/100/500，env 可调），PDF 按 `作者_年份_短标题_哈希.pdf` 命名，同 DOI 自动去重。
- **`get_fulltext`**：内集成 **MinerU Precise API** 把本地 PDF 转成干净 Markdown（需 `MINERU_TOKEN`），并把论文配图解出到 `images/`；未配 token 时降级为平台 `readPaper` 纯文本。
- **`get_scansci_status`**：只读探测 scansci 桥接目标可达性。

### 产物布局（跟随当前工作目录）

论文产物落在**你当前 Claude 工作目录**下的 `twopaper/`，而不是插件安装目录——换一个干净的工作目录时，下载与转换结果就出现在该目录里。**每篇论文一个独立文件夹**（以论文命名），PDF / Markdown / 配图都收在里面：

```
<cwd>/twopaper/
└── <作者>_<年份>_<标题>_<哈希>/
    ├── <作者>_<年份>_<标题>_<哈希>.pdf    命名好的 PDF
    ├── <作者>_<年份>_<标题>_<哈希>.md     与 PDF 同名的全文 Markdown
    └── images/<sha>.jpg                   Markdown 引用的论文配图（按论文隔离）
```

根目录取 `CLAUDE_PROJECT_DIR`（宿主注入的项目根，回退 `process.cwd()`）；可用 `TWOPAPER_OUTPUT_DIR` 覆盖，`DEFAULT_DOWNLOAD_PATH` / `MINERU_OUTPUT_DIR` 分别覆盖 PDF 与 Markdown 根。

**裸名回填**：若某篇 PDF 下载时没取到元数据（退化为 `1706.03762.pdf` 或 `Unknown_*.pdf`），`get_fulltext` 转成 Markdown 后会**从正文解析标题/作者/年份**，把 PDF + Markdown + `images/` **一起迁进以论文命名的文件夹**。

**桥接 scansci（paywalled 兜底）**：当无合法途径时，`get_pdf` 返回指令块，宿主引导调用已注册的 `scansci_pdf_download`；TwoPaper 不重新分发 scansci 闭源层，凭证留其本机。详见 [docs/BRIDGING.md](docs/BRIDGING.md)。

**演进路线（两阶段）**：阶段一（当前）新增/升级工具并与旧工具兼容共存；阶段二（稳定后）删除旧的具体平台搜索工具，仅保留收敛入口。

**Licensing**：本仓库主代码 MIT。OA 源（Unpaywall/OpenAlex/Europe PMC）与竞速思路参考自 [scansci-pdf](https://github.com/Rimagination/scansci-pdf)（Apache-2.0 公开层）重实现；scansci 闭源编译层 `_core/*.pyd` 与 `_publisher_strategies_core.py` 为专有、不重新分发，仅在本机由用户经桥接调用。

新增 env（`.env.example`）：`MINERU_TOKEN`、`MINERU_OUTPUT_DIR`、`OA_EMAIL`、`OPENALEX_API_KEY`、`DOWNLOAD_PER_MINUTE/HOUR/DAY`、`GET_PDF_BRIDGE`、`SCANSCI_CMD`。

## 🔑 配置凭证

**推荐做法：安装/启用时填一次弹窗。** TwoPaper 在 `plugin.json` 里声明了 `userConfig`，Claude Code 会在**启用插件时弹出配置对话框**，逐项引导填写（每项都带"解锁什么能力 + 去哪申请"）。**敏感值由宿主存入操作系统钥匙串 / 凭据库，不写入任何环境变量，也不以明文留在配置文件里。**

| 配置项 | 解锁能力 | 必需 | 申请地址 |
|---|---|---|---|
| `oa_email` | 合法 OA 定位（Unpaywall 礼貌池） | ✔ | 填自己的邮箱即可 |
| `mineru_token` | `get_fulltext` 的 PDF→Markdown | ✔ | https://mineru.net/apiManage |
| `wos_api_key` | Web of Science 检索 | 付费 | https://developer.clarivate.com/apis |
| `elsevier_api_key` | Scopus / ScienceDirect | 付费 | https://dev.elsevier.com/apikey/manage |
| `springer_api_key` | Springer 检索与下载 | 付费 | https://dev.springernature.com/signup |
| `wiley_tdm_token` | Wiley 全文下载 | 付费 | https://onlinelibrary.wiley.com/library-info/resources/text-and-datamining |
| `pubmed_api_key` | PubMed 限流 3→10 rps | 可选 | https://www.ncbi.nlm.nih.gov/books/NBK25497/ |
| `semantic_scholar_api_key` | Semantic Scholar 20→180 rpm | 可选 | https://www.semanticscholar.org/product/api |
| `openalex_api_key` | OpenAlex key+credits | 可选 | https://openalex.org/ |

只填免费/基础项也能用：arXiv、bioRxiv、medRxiv、Crossref、PubMed、OA 定位开箱即得，未配的付费渠道在 `get_platform_status` 里显示 `UNCONFIGURED`，跳过即可。

**错过弹窗、或想改？** 两条后补路径：

1. 在 Claude Code 里执行 `/plugin` 重开插件配置；或命令行指定
   `claude plugin install --config oa_email=you@x.com --config mineru_token=... twopaper@twopaper-market`；
2. 或让 Agent 调 `twopaper_setup` 工具（**可选微调**，不再是唯一入口）——它列出缺口清单与申请地址，把值传回即写入插件持久数据目录下的 `.env`：

```json
{ "tool": "twopaper_setup", "arguments": { "credentials": { "OA_EMAIL": "me@example.com", "MINERU_TOKEN": "..." } } }
```

> **取值优先级**：宿主注入（`userConfig` 弹窗 / `~/.claude/settings.json` 的 `env` 块）**高于** `${CLAUDE_PLUGIN_DATA}/.env`，再高于 `${CLAUDE_PLUGIN_ROOT}/.env`。`.env` 按插件自身定位、**不是**当前工作目录——所以换项目也持续生效。**全程不写入操作系统级环境变量。**
>
> `.mcp.json` 只透传上述 9 个凭证；下载限流（`DOWNLOAD_PER_MINUTE/HOUR/DAY`）与 `GET_PDF_BRIDGE` 等**调优项**用代码默认值（2/100/500、`hint`），需要改时写进插件 `.env` 即可，无需重启宿主。

## ✨ Key Features

- **🌍 14 Academic Platforms**: arXiv, Web of Science, PubMed, Google Scholar, bioRxiv, medRxiv, Semantic Scholar, IACR ePrint, Sci-Hub, ScienceDirect, Springer Nature, Wiley, Scopus, Crossref
- **🔗 MCP Protocol Integration**: Seamless integration with Claude Desktop and other AI assistants
- **📊 Unified Data Model**: Standardized paper format across all platforms
- **⚡ High-Performance Search**: Concurrent search with intelligent rate limiting
- **🛡️ Security First**: DOI validation, query sanitization, injection prevention, sensitive data masking
- **📝 Type Safety**: Complete TypeScript support with extended interfaces
- **🎯 Academic Papers First**: Smart filtering prioritizing academic papers over books
- **🔄 Smart Error Handling**: Unified ErrorHandler with retry logic and platform fallback

## 📚 Supported Platforms

| Platform | Search | Download | Full Text | Citations | API Key | Special Features |
|----------|--------|----------|-----------|-----------|---------|------------------|
| **Crossref** | ✅ | ❌ | ❌ | ✅ | ❌ | Default search, extensive metadata coverage |
| **arXiv** | ✅ | ✅ | ✅ | ❌ | ❌ | Physics/CS preprints |
| **Web of Science** | ✅ | ❌ | ❌ | ✅ | ✅ Required | Multi-topic search, date sorting, year ranges |
| **PubMed** | ✅ | ❌ | ❌ | ❌ | 🟡 Optional | Biomedical literature |
| **Google Scholar** | ✅ | ❌ | ❌ | ✅ | ❌ | Comprehensive academic search |
| **bioRxiv** | ✅ | ✅ | ✅ | ❌ | ❌ | Biology preprints |
| **medRxiv** | ✅ | ✅ | ✅ | ❌ | ❌ | Medical preprints |
| **Semantic Scholar** | ✅ | ✅ | ❌ | ✅ | 🟡 Optional | AI semantic search |
| **IACR ePrint** | ✅ | ✅ | ✅ | ❌ | ❌ | Cryptography papers |
| **Sci-Hub** | ✅ | ✅ | ❌ | ❌ | ❌ | Universal paper access via DOI |
| **ScienceDirect** | ✅ | ❌ | ❌ | ✅ | ✅ Required | Elsevier's full-text database |
| **Springer Nature** | ✅ | ✅* | ❌ | ❌ | ✅ Required | Dual API: Meta v2 & OpenAccess |
| **Wiley** | ❌ | ✅ | ✅ | ❌ | ✅ Required | TDM API: DOI-based PDF download only |
| **Scopus** | ✅ | ❌ | ❌ | ✅ | ✅ Required | Largest citation database |

✅ Supported | ❌ Not supported | 🟡 Optional | ✅* Open Access only

> **Note**: Wiley TDM API does not support keyword search. Use `search_crossref` to find Wiley articles, then use `download_paper` with `platform="wiley"` to download PDFs by DOI.

## ⚖️ Compliance & Ethical Use (Sci-Hub / Google Scholar)

This project includes integrations that may have **legal, contractual (ToS), and ethical** constraints. You are responsible for ensuring your usage complies with applicable laws, institutional policies, and third‑party terms.

- **Sci-Hub**: May provide access to copyrighted works without authorization in many jurisdictions. Use only when you have the legal right to access the content (e.g., open access, author‑provided copies, or licensed institutional access).
- **Google Scholar**: This integration relies on automated fetching/parsing and may violate Google's Terms of Service or trigger blocking/rate limits. Prefer official APIs or metadata sources (e.g., Crossref, Semantic Scholar) when ToS compliance is required.

## 🚀 Quick Start

### 作为 Claude Code 插件安装（推荐）

```bash
# 1) 添加并安装
claude plugin marketplace add zzhzkx/TwoPaper
claude plugin install twopaper@twopaper-market

# 2) 启用时会弹出配置对话框 —— 逐项填写凭证（敏感值进系统钥匙串，非环境变量）
#    错过弹窗可随时：/plugin → 重开配置，或 claude plugin install --config oa_email=you@x.com ...
```

装完**直接就能用**：MCP server 由插件自带注册（`plugin:twopaper:twopaper`），产物是**单文件自包含** `dist/server.js`，**无需 `npm install`、无需联网装包**——只要机器有 Node.js ≥ 18。

**依赖说明**：宿主安装插件时不会替插件装依赖，因此发布产物用 esbuild 把全部依赖内联成单个 `dist/server.js`（`npm run build` 产出）。源码改动后务必重新 build 再提交，否则 `dist/` 陈旧。

### System Requirements

- Node.js >= 18.0.0
- npm or yarn（**仅本地开发/构建需要**；作为插件使用不需要）

### Installation

```bash
# Clone repository
git clone https://github.com/your-username/paper-search-mcp-nodejs.git
cd paper-search-mcp-nodejs

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

### Configuration

1. **Get Web of Science API Key**
   - Visit [Clarivate Developer Portal](https://developer.clarivate.com/apis)
   - Register and apply for Web of Science API access
   - Add API key to `.env` file

2. **Get PubMed API Key (Optional)**
   - Without API key: Free usage, 3 requests/second limit
   - With API key: 10 requests/second, more stable service
   - Get key: See [NCBI API Keys](https://ncbiinsights.ncbi.nlm.nih.gov/2017/11/02/new-api-keys-for-the-e-utilities/)

3. **Configure Environment Variables**
   ```bash
   # Edit .env file
   WOS_API_KEY=your_actual_api_key_here
   WOS_API_VERSION=v1
   
   # PubMed API key (optional, recommended for better performance)
   PUBMED_API_KEY=your_ncbi_api_key_here
   
   # Semantic Scholar API key (optional, increases rate limits)
   SEMANTIC_SCHOLAR_API_KEY=your_semantic_scholar_api_key
   
   # Elsevier API key (required for ScienceDirect and Scopus)
   ELSEVIER_API_KEY=your_elsevier_api_key
   
   # Springer Nature API keys (required for Springer)
   SPRINGER_API_KEY=your_springer_api_key  # For Metadata API v2
   # Optional: Separate key for OpenAccess API (if different from main key)
   SPRINGER_OPENACCESS_API_KEY=your_openaccess_api_key
   
   # Wiley TDM token (required for Wiley)
   WILEY_TDM_TOKEN=your_wiley_tdm_token
   ```

### Build and Run

#### Method 1: NPX (Recommended for MCP)
```bash
# Direct run with npx (most common MCP deployment)
npx -y paper-search-mcp-nodejs

# Or install globally
npm install -g paper-search-mcp-nodejs
paper-search-mcp
```

#### Method 2: Local Development
```bash
# Build TypeScript code
npm run build

# Start server
npm start

# Or run in development mode
npm run dev
```

### MCP Server Configuration

Add the following configuration to your Claude Desktop config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

#### NPX Configuration (Recommended)
```json
{
  "mcpServers": {
    "paper-search-nodejs": {
      "command": "npx",
      "args": ["-y", "paper-search-mcp-nodejs"],
      "env": {
        "WOS_API_KEY": "your_web_of_science_api_key"
      }
    }
  }
}
```

#### Local Installation Configuration
```json
{
  "mcpServers": {
    "paper_search_nodejs": {
      "command": "node",
      "args": ["/path/to/paper-search-mcp-nodejs/dist/server.js"],
      "env": {
        "WOS_API_KEY": "your_web_of_science_api_key"
      }
    }
  }
}
```

## 🛠️ MCP Tools

### `search_papers`
Search academic papers across multiple platforms

```typescript
// Random platform selection (default behavior)
search_papers({
  query: "machine learning",
  platform: "all",      // Randomly selects one platform for efficiency
  maxResults: 10,
  year: "2023",
  sortBy: "date"
})

// Search specific platform
search_papers({
  query: "quantum computing",
  platform: "webofscience",  // Target specific platform
  maxResults: 5
})
```

**Platform Selection Behavior:**
- `platform: "crossref"` (default) - Free API with extensive scholarly metadata coverage
- `platform: "all"` - Randomly selects one platform for efficient, focused results
- Specific platform - Searches only that platform
- Available platforms: `crossref`, `arxiv`, `webofscience`/`wos`, `pubmed`, `biorxiv`, `medrxiv`, `semantic`, `iacr`, `googlescholar`/`scholar`, `scihub`, `sciencedirect`, `springer`, `scopus`
- Note: `wiley` only supports PDF download by DOI, not keyword search

### `search_crossref`
Search academic papers from Crossref database (default search platform)

```typescript
search_crossref({
  query: "machine learning",
  maxResults: 10,
  year: "2023",
  author: "Smith",
  sortBy: "relevance",  // or "date", "citations"
  sortOrder: "desc"
})
```

### `search_arxiv`
Search arXiv preprints specifically

```typescript
search_arxiv({
  query: "transformer neural networks",
  maxResults: 10,
  category: "cs.AI",
  author: "Vaswani",
  year: "2023",
  sortBy: "date",      // relevance, date, citations
  sortOrder: "desc"    // asc, desc
})
```

### `search_webofscience`
Search Web of Science database specifically

```typescript
search_webofscience({
  query: "CRISPR gene editing",
  maxResults: 15,
  year: "2022",
  journal: "Nature"
})
```

### `search_pubmed`
Search PubMed/MEDLINE biomedical literature database

```typescript
search_pubmed({
  query: "COVID-19 vaccine efficacy",
  maxResults: 20,
  year: "2023",
  author: "Smith",
  journal: "New England Journal of Medicine",
  publicationType: ["Journal Article", "Clinical Trial"],
  sortBy: "date"       // relevance, date
})
```

### `search_google_scholar`
Search Google Scholar academic database

```typescript
search_google_scholar({
  query: "machine learning",
  maxResults: 10,
  yearLow: 2020,
  yearHigh: 2023,
  author: "Bengio"
})
```

### `search_biorxiv` / `search_medrxiv`
Search biology and medical preprints

```typescript
search_biorxiv({
  query: "CRISPR",
  maxResults: 15,
  days: 30,
  category: "genomics"  // neuroscience, genomics, etc.
})

search_medrxiv({
  query: "COVID-19",
  maxResults: 10,
  days: 30,
  category: "infectious_diseases"
})
```

### `search_semantic_scholar`
Search Semantic Scholar AI semantic database

```typescript
search_semantic_scholar({
  query: "deep learning",
  maxResults: 10,
  fieldsOfStudy: ["Computer Science"],
  year: "2023"
})
```

### `search_iacr`
Search IACR ePrint cryptography archive

```typescript
search_iacr({
  query: "zero knowledge proof",
  maxResults: 5,
  fetchDetails: true
})
```

### `search_scihub`
Search and download papers from Sci-Hub using DOI or paper URL

```typescript
search_scihub({
  doiOrUrl: "10.1038/nature12373",
  downloadPdf: true,
  savePath: "./downloads"
})
```

### `search_sciencedirect`
Search Elsevier ScienceDirect database

```typescript
search_sciencedirect({
  query: "artificial intelligence",
  maxResults: 10,
  year: "2023",
  author: "Smith",
  openAccess: true  // Filter for open access articles
})
```

### `search_springer`
Search Springer Nature database (Metadata API v2 or OpenAccess API)

```typescript
search_springer({
  query: "machine learning",
  maxResults: 10,
  year: "2023",
  openAccess: true,  // Use OpenAccess API for downloadable PDFs
  type: "Journal"    // Filter: Journal, Book, or Chapter
})
```

### `search_scopus`
Search Scopus citation database

```typescript
search_scopus({
  query: "renewable energy",
  maxResults: 10,
  year: "2023",
  affiliation: "MIT",
  documentType: "ar"  // ar=article, cp=conference, re=review
})
```

### `check_scihub_mirrors`
Check health status of Sci-Hub mirror sites

```typescript
check_scihub_mirrors({
  forceCheck: true  // Force fresh health check
})
```

### `download_paper`
Download paper PDF files

```typescript
download_paper({
  paperId: "2106.12345",  // or DOI for Sci-Hub
  platform: "arxiv",      // or "scihub" for Sci-Hub downloads
  savePath: "./downloads"
})
```

### `get_paper_by_doi`
Get paper information by DOI

```typescript
get_paper_by_doi({
  doi: "10.1038/s41586-023-12345-6",
  platform: "all"
})
```

### `get_platform_status`
Check platform status and API keys

```typescript
get_platform_status({})
```

## 📊 Data Model

All platform paper data is converted to a unified format:

```typescript
interface Paper {
  paperId: string;           // Unique identifier
  title: string;            // Paper title
  authors: string[];        // Author list
  abstract: string;         // Abstract
  doi: string;             // DOI
  publishedDate: Date;     // Publication date
  pdfUrl: string;          // PDF link
  url: string;             // Paper page URL
  source: string;          // Source platform
  citationCount?: number;   // Citation count
  journal?: string;         // Journal name
  year?: number;           // Publication year
  categories?: string[];    // Subject categories
  keywords?: string[];      // Keywords
  // ... more fields
}
```

## 🔧 Development

### Project Structure

```
src/
├── models/
│   └── Paper.ts              # Paper data model
├── platforms/
│   ├── PaperSource.ts        # Abstract base class
│   ├── ArxivSearcher.ts      # arXiv searcher
│   ├── WebOfScienceSearcher.ts # Web of Science searcher
│   ├── PubMedSearcher.ts     # PubMed searcher
│   ├── GoogleScholarSearcher.ts # Google Scholar searcher
│   ├── BioRxivSearcher.ts    # bioRxiv/medRxiv searcher
│   ├── SemanticScholarSearcher.ts # Semantic Scholar searcher
│   ├── IACRSearcher.ts       # IACR ePrint searcher
│   ├── SciHubSearcher.ts     # Sci-Hub searcher with mirror management
│   ├── ScienceDirectSearcher.ts # ScienceDirect (Elsevier) searcher
│   ├── SpringerSearcher.ts   # Springer Nature searcher (Meta v2 & OpenAccess APIs)
│   ├── WileySearcher.ts      # Wiley TDM API (DOI-based PDF download only)
│   ├── ScopusSearcher.ts     # Scopus citation database searcher
│   └── CrossrefSearcher.ts   # Crossref API searcher (default platform)
├── mcp/
│   ├── tools.ts              # MCP tool definitions
│   ├── schemas.ts            # Zod schemas for tool arguments
│   ├── handleToolCall.ts     # Tool call dispatcher
│   └── searchers.ts          # Searcher initialization
├── utils/
│   ├── SecurityUtils.ts      # DOI validation, query sanitization, injection prevention
│   ├── ErrorHandler.ts       # Unified error handling with retry logic
│   ├── RateLimiter.ts        # Token bucket rate limiting
│   ├── QuotaManager.ts       # Daily quota tracking
│   ├── RequestCache.ts       # LRU caching for requests
│   ├── PDFExtractor.ts       # PDF text extraction
│   └── Logger.ts             # Debug logging
├── config/
│   └── constants.ts          # Timeouts, endpoints, limits
├── services/
│   └── CitationService.ts    # Citation fetching service
└── server.ts                 # MCP server main file
```

### Adding New Platforms

1. Create new searcher class extending `PaperSource`
2. Implement required abstract methods
3. Register new searcher in `searchers.ts`
4. Add corresponding MCP tool in `tools.ts`

### Security Best Practices

- All DOIs are validated before use in URLs
- Query parameters are escaped to prevent injection
- API keys are masked in all log output
- Request timeouts prevent hanging connections
- Query complexity limits prevent DoS attacks
- Rate limiting and quota management prevent API abuse
- Caching reduces external API calls

### Testing

```bash
# Run tests
npm test

# Run linting
npm run lint

# Code formatting
npm run format
```

**Test Coverage:**
- 19 test suites, 158 test cases
- All 13 platform searchers tested
- Security utilities (DOI validation, query sanitization)
- ErrorHandler (error classification, retry logic)
- Rate limiting integration, QuotaManager, RequestCache

| Test Suite | Coverage |
|------------|----------|
| Platform Searchers | 13/13 ✅ |
| SecurityUtils | ✅ |
| ErrorHandler | ✅ |
| RateLimiter & Integration | ✅ |
| QuotaManager | ✅ |
| RequestCache | ✅ |

## 🌟 Platform-Specific Features

### Springer Nature Dual API System

Springer Nature provides two APIs:

1. **Metadata API v2** (Main API)
   - Endpoint: `https://api.springernature.com/meta/v2/json`
   - Searches all Springer content (subscription + open access)
   - Requires API key from https://dev.springernature.com/

2. **OpenAccess API** (Optional)
   - Endpoint: `https://api.springernature.com/openaccess/json`
   - Only searches open access content
   - May require separate API key or special permissions
   - Better for finding downloadable PDFs

```typescript
// Search all Springer content
search_springer({
  query: "machine learning",
  maxResults: 10
})

// Search only open access papers
search_springer({
  query: "COVID-19",
  openAccess: true,  // Uses OpenAccess API if available
  maxResults: 5
})
```

### Web of Science Advanced Search

🎯 **WoS Starter API v1/v2 Support**: Uses Clarivate's WoS Starter API with full field tag support.

**API Version Configuration:**
```bash
# In .env file (default: v1)
WOS_API_VERSION=v1   # Stable, recommended
# WOS_API_VERSION=v2  # Newer version, same endpoints
```

```typescript
// Multi-topic search
search_webofscience({
  query: 'oriented structure',
  year: '2023-2025',
  sortBy: 'date',
  sortOrder: 'desc',
  maxResults: 10
})

// Year range filtering
search_webofscience({
  query: 'machine learning',
  year: '2020-2024',  // Supports range format
  sortBy: 'citations',
  sortOrder: 'desc'
})

// Advanced query with filters
search_webofscience({
  query: 'blockchain',
  author: 'zhang',
  journal: 'Nature',
  year: '2023',
  sortBy: 'date',
  sortOrder: 'desc'
})

// Traditional WOS query syntax with field tags
search_webofscience({
  query: 'TS="machine learning" AND PY=2023 AND DT="Article"',
  maxResults: 20
})
```

**🔧 v0.2.7 Improvements:**

- ✅ **Google Scholar**: Major anti-detection overhaul — session management, cookie persistence, 429/captcha detection with auto-retry, adaptive delay, and proxy support (`SCHOLAR_PROXY`/`HTTPS_PROXY`/`HTTP_PROXY`)
- ✅ **arXiv**: Fixed search query prefix (`all:`) to comply with arXiv API spec
- ✅ **Google Scholar**: Updated User-Agents to latest browser versions (Chrome 131, Firefox 133, Edge 131)
- ✅ **Performance**: Implemented `RequestCache` for caching search results and API responses
- ✅ **Reliability**: Added `RateLimiter` and `QuotaManager` to prevent API abuse and 429 errors
- ✅ **New Features**: Added `CitationService` and `PDFExtractor` for future enhancements
- ✅ **Testing**: Restructured test suite into `tests/platforms`, `tests/utils`, and `tests/integration`
- ✅ **18 Field Tags**: Full support for all WoS Starter API field tags
- ✅ **API Version Selection**: Support for both v1 and v2 endpoints
- ✅ **Enhanced Filtering**: ISSN, Volume, Page, Issue, DocType, PMID filters
- ✅ **Query Validation**: Security checks for query complexity and injection prevention

**Supported Search Options:**
- `query`: Search terms (supports multi-topic)
- `year`: Single year "2023" or range "2020-2023"
- `author`: Author name filtering
- `journal`: Journal/source filtering
- `sortBy`: Sort field (`date`, `citations`, `relevance`, `title`, `author`, `journal`)
- `sortOrder`: Sort direction (`asc`, `desc`)
- `maxResults`: Maximum results (1-50 per page)

**Supported WOS Field Tags (18 total):**
| Tag | Description | Tag | Description |
|-----|-------------|-----|-------------|
| `TS` | Topic (title, abstract, keywords) | `TI` | Title |
| `AU` | Author | `AI` | Author Identifier |
| `SO` | Source/Journal | `IS` | ISSN/ISBN |
| `PY` | Publication Year | `FPY` | Final Publication Year |
| `DO` | DOI | `DOP` | Date of Publication |
| `VL` | Volume | `PG` | Page |
| `CS` | Issue | `DT` | Document Type |
| `PMID` | PubMed ID | `UT` | Accession Number |
| `OG` | Organization | `SUR` | Source URL |

**Example with Field Tags:**
```typescript
// Search by PMID
search_webofscience({ query: 'PMID=12345678' })

// Search by DOI
search_webofscience({ query: 'DO="10.1038/nature12373"' })

// Filter by document type
search_webofscience({ query: 'TS="CRISPR" AND DT="Review"' })

// Search specific volume/issue
search_webofscience({ query: 'SO="Nature" AND VL=580 AND CS=7805' })
```

**🔧 Debugging WOS Issues:**
```bash
# Enable debug logging
export NODE_ENV=development

# In CI, logDebug is enabled automatically when CI=true
```

### Google Scholar Features

- **Academic Paper Priority**: Automatically filters out books, prioritizes peer-reviewed papers
- **Citation Data**: Provides citation counts and academic metrics
- **Anti-Detection**: Smart request patterns to avoid blocking
- **Session Management**: Cookie persistence across requests to mimic real browser behavior
- **Adaptive Delay**: Dynamic backoff that increases on consecutive failures
- **429/Captcha Detection**: Detects rate-limit and captcha responses, resets session and retries
- **Proxy Support**: Optional HTTP/HTTPS/SOCKS proxy to bypass IP-based blocking
- **Comprehensive Coverage**: Searches across all academic publishers

> **Google Scholar Blocking**: Google aggressively blocks direct programmatic access by IP. If searches fail with rate-limit/captcha errors, configure a proxy via the `SCHOLAR_PROXY` environment variable (also falls back to `HTTPS_PROXY`/`HTTP_PROXY`):
> ```bash
> # HTTP/HTTPS proxy
> SCHOLAR_PROXY=http://user:pass@host:port
> # SOCKS proxy
> SCHOLAR_PROXY=socks://host:port
> ```
> Required packages are loaded lazily (`http-proxy-agent`, `https-proxy-agent`, `socks-proxy-agent`) — install the one matching your proxy type.

### Semantic Scholar Features

- **AI-Powered Search**: Semantic understanding of queries
- **Citation Networks**: Paper relationships and influence metrics
- **Open Access PDFs**: Direct links to freely available papers
- **Research Fields**: Filter by specific academic disciplines

### Sci-Hub Features

- **Universal Access**: Access papers using DOI or direct URLs
- **Mirror Network**: Automatic detection and use of fastest available mirror (11+ mirrors)
- **Health Monitoring**: Continuous monitoring of mirror site availability
- **Automatic Failover**: Seamless switching between mirrors when one fails
- **Smart Retry**: Automatic retry with different mirrors on failure
- **Response Time Optimization**: Mirrors sorted by response time for best performance

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork the project
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 🐛 Issue Reporting

If you encounter issues, please report them at [GitHub Issues](https://github.com/your-username/paper-search-mcp-nodejs/issues).

## 🙏 Acknowledgments

- Original [paper-search-mcp](https://github.com/openags/paper-search-mcp) for the foundation
- MCP community for the protocol standards

---

⭐ If this project helps you, please give it a star!