# TwoPaper 插件 —— 安装/接入体检报告

**日期**：2026-09-16
**范围**：只诊断「安装是否正确、接入是否正确、当前 env 状态」，不改代码、不写入任何密钥。
**方法**：静态核对 + 真实 MCP stdio 协议调用 + 受控 A/B 实验 + 全新会话 env 模拟。
**被测安装态**：`twopaper@twopaper-market` commit `7cc33b0`，installPath `~/.claude/plugins/cache/twopaper-market/twopaper/7cc33b03cb26`

---

## 0. 结论速览

| 维度 | 结果 |
|---|---|
| plugin.json / marketplace.json / .mcp.json 元数据 | ✅ 合法、一致 |
| MCP 初始化握手 | ✅ `serverInfo = twopaper 0.1.0`，协议 `2024-11-05` |
| 技能加载 | ✅ 5 个 SKILL.md frontmatter 合法 |
| 工具清单 | ⚠️ 安装态 **23** 个；仓库开发态 **24** 个（多 `twopaper_setup`） |
| 插件目录 `.env` 生效性 | ❌ **不生效**（安装态快照仍是裸 `dotenv.config()`） |
| 当前付费渠道实际可用性 | ❌ **假象**：实时显示 OK 来自宿主陈旧 env，下次重启即消失 |
| 本地仓库 vs 远程 | ✅ 远程 `origin/main = 7cc33b0` 与本地 HEAD 相同；34 项未提交改动仅存于工作树 |

**一句话**：安装接入本身是通的；但**「配置」这块不成立**——插件目录 `.env` 读不到（修复未发布），且当前"付费渠道 OK"是重启前假象。

---

## 1. 静态核对（通过）

- `.claude-plugin/marketplace.json`：name `twopaper-market`，source `./plugins/twopaper`。
- `plugins/twopaper/.claude-plugin/plugin.json`：name `twopaper`，**无 version 字段** → 跟随 commit 自动更新（设计如此）。
- `plugins/twopaper/.mcp.json`：stdio，`node ${CLAUDE_PLUGIN_ROOT}/dist/server.js`，透传 14 个 env 键。
- marketplace 克隆（`~/.claude/plugins/marketplaces/twopaper-market`）HEAD = `7cc33b0`，与远程一致。

## 2. MCP 启动与接入（通过）

- 安装态 server `initialize` → `{"name":"twopaper","version":"0.1.0"}`，`protocolVersion: 2024-11-05`。（冷启动 577–1170ms）
- Claude Code 实际已连上：本会话实时工具 `get_platform_status` / `get_scansci_status` 调用成功。
- 进程核查：4 个 `node .../twopaper-market/.../dist/server.js` 在跑（PID 18412/26896/27020/11268）。

## 3. 技能加载（通过）

5 个技能 frontmatter（`name` + `description`）均合法：`twopaper`（总入口）、`twopaper-search`、`twopaper-pdf`、`twopaper-fulltext`、`twopaper-citations`。

## 4. 工具清单差异（发现①）

| 来源 | 工具数 | 含 `twopaper_setup`？ |
|---|---|---|
| 安装态缓存 `7cc33b0` | 23 | ❌ 无 |
| 仓库开发态（未提交） | 24 | ✅ 有 |

`twopaper_setup`（配置引导工具）**只存在于未提交的开发树**，未进入你要使用的安装态。`skills/twopaper/SKILL.md` 开发态已写「24 个工具」，与安装态的 23 个不一致。

## 5. 插件目录 `.env` 生效性（发现②，A/B 实验）

安装态 `dist/server.js` 仍是裸 `dotenv.config()`，按**宿主 cwd** 找 `.env`，而 MCP 的 cwd 是宿主工作目录、非插件目录。

受控实验（放一个假 `WOS_API_KEY` 到 `plugins/twopaper/.env`，测完删除）：

| server 启动 cwd | `webofscience.status` |
|---|---|
| 仓库根（=真实宿主 cwd） | `UNCONFIGURED` ❌ 读不到 |
| 插件目录 | `OK` ✅ 读得到 |

**结论**：安装态**不能**通过插件目录 `.env` 配置。修复存在于工作树（`src/utils/env.ts` + `server.ts` 改调 `loadEnv()`），但**未 build、未提交、未发布**。

## 6. 当前 env 状态与"假象"（发现③，重点）

### 6.1 现象
实时 `get_platform_status`（Claude Code 实际调用）显示 **13/15 渠道 `OK`、`missing_credentials: []`**，付费渠道（WoS/Scopus/Springer/Wiley）全部 `configured: true`。

### 6.2 但磁盘配置里没有 key
- `~/.claude/settings.json`（mtime **09:13**）：env 块**无任何 twopaper key**。
- `~/.claude.json`：**无顶层 env**；那批 key 只挂在另一个独立 MCP server `paper-search`（指向 `~/.cc-switch/MCP/...`）的 `env` 块下。
- Windows 用户/系统级 env：**只有 `OPENALEX_API_KEY`**，其余全无。
- 插件目录 `.env`：不存在。

### 6.3 全新会话模拟
用**当前** settings.json env + 系统 env，从真实 cwd 起安装态 server，得到：

```
webofscience:UNCONFIGURED   sciencedirect:UNCONFIGURED   springer:UNCONFIGURED
wiley:UNCONFIGURED          scopus:UNCONFIGURED
pubmed:DEGRADED             semantic:DEGRADED
```

### 6.4 时间线解释
- `09:04:01` 主 `claude.exe` 宿主启动 —— 当时 settings.json **仍含 key**
- `09:10–09:17` twopaper MCP 子进程陆续起，**继承宿主启动时的 env** → 看得到 key
- `09:13:11` settings.json 被改写，**key 移除**
- 结果：跑着的 MCP 仍持有旧 env，**实时"全 OK"是陈旧快照**；宿主若在 settings.json 改写之后重启才读新值——但本次会话的宿主早于改写，故仍持有旧值。

**危害**：现在看到"付费渠道全绿"是**误导**。下次重启 Claude Code 后，付费渠道会转为 `UNCONFIGURED`（除非重新注入）。

## 7. git 状态

- `origin/main` = local HEAD = `7cc33b0`。
- 工作树有 **34 项未提交**（env 修复、`twopaper_setup`、新测试、round3 报告、bench 脚本等），**远程没有**；本地 `F:/claude_project/TwoPaper` 是远程的同 commit 检出 + 未提交工作树。

---

## 8. 修复清单（待批准后再执行；本轮不动作）

按「先让配置真正成立」排序：

1. **发布 env 修复**（发现②）：build `dist/` → 提交 → 推 `origin/main` → `plugin marketplace upgrade` + `plugin update`。让插件目录 `.env` 生效。
2. **让密钥落到生效位置**（发现③）：将 `ENV/ENV_API.txt` 的值写入**插件目录 `.env`**（需先完成 1）。**当前安装态下此路不通**，除非先把宿主 env 补回 settings.json 作为过渡。
3. **对齐工具数**（发现①）：发布后安装态即为 24 工具，`twopaper_setup` 可用。
4. **可选**：核对 `~/.claude.json` 里 `paper-search`（指向旧 `paper-search-mcp-nodejs`）是否仍需保留，避免与 twopaper 并存造成混淆。

> 注：`SCHOLAR_PROXY` / `SCIHUB_PROXY` / `HTTP(S)_PROXY` 等未列入 `.mcp.json` 透传白名单（当前环境本机代理走 `127.0.0.1:1733`，仅用于 ANTHROPIC 流量）。若日后要用 GS/Sci-Hub，需确认代理键能被透传。

---

## 附：证据文件
- 实时调用：本会话 `get_platform_status` / `get_scansci_status`
- A/B 与模拟脚本：`tmp/probe_server.mjs`、`tmp/sim_fresh_session.mjs`（临时，已清理）
