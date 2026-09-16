/**
 * env — 统一 .env 定位与加载。
 *
 * 历史缺陷：server.ts 里裸调 `dotenv.config()`，它按 `process.cwd()` 找 .env。
 * 而 MCP stdio server 的 cwd 是**宿主进程（Claude Code）的工作目录**，不是插件目录，
 * 于是插件目录下的 .env 永远读不到 —— README 承诺的「配置凭证（env）」在 Claude Code 里不成立。
 *
 * 现在按优先级显式定位，并让 setup 工具写往同一个文件，保证「写进去的 = 读得到的」：
 *   1. TWOPAPER_ENV_FILE 显式覆盖（测试/多环境用）
 *   2. CLAUDE_PLUGIN_DATA/.env —— 插件持久数据目录，**跨插件更新存活**（官方推荐的持久落点）
 *   3. CLAUDE_PLUGIN_ROOT/.env —— 插件安装根，随版本变化；仅在无 data 目录时回退
 *   4. <包根>/.env —— 开发态兜底；src/ 与 dist/ 相对插件根同为一级深度
 *
 * 注意：宿主 env（process.env）优先级**高于** .env——dotenv 默认不覆盖已存在的变量，
 * 因此 ~/.claude/settings.json 的 env 块与插件 .env 可共存，前者胜出。
 *
 * 但有个坑：宿主对 .mcp.json 里**未定义**的 ${VAR} 不做展开，会把字面量 "${VAR}"
 * 原样注入 MCP 进程。它非空，会被当成"已配置"，且因 dotenv 不覆盖而**顶掉插件 .env 的真值**。
 * 所以加载 .env 前先清掉这类未展开占位符（见 stripUnresolvedPlaceholders）。
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
/** 解析 .env 的绝对路径。不检查存在性，由调用方决定缺失时如何提示。 */
export function resolveEnvPath() {
    const explicit = process.env.TWOPAPER_ENV_FILE;
    if (explicit && explicit.trim() !== '') {
        return path.resolve(explicit);
    }
    // 持久数据目录：宿主为每个插件注入，跨版本更新存活 —— 配置的主落点
    const dataDir = process.env.CLAUDE_PLUGIN_DATA;
    if (dataDir && dataDir.trim() !== '') {
        return path.join(dataDir, '.env');
    }
    // 安装根：随版本变化，仅在没有 data 目录时回退（开发态 / 旧宿主）
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
    if (pluginRoot && pluginRoot.trim() !== '') {
        return path.join(pluginRoot, '.env');
    }
    // 兜底：按包根定位。刻意不用 import.meta.url —— ts-jest 以 CommonJS 转译，
    // import.meta 在测试环境下不可用（TS1343），而这里只求「找得到插件目录」。
    // 依次尝试 cwd 及其上溯若干层，取第一个含 package.json 的目录作为插件根。
    return path.join(findPackageRoot(), '.env');
}
/** 从 cwd 上溯查找含 package.json 的目录，作为插件根兜底。 */
function findPackageRoot() {
    let dir = process.cwd();
    // 仅用于 .env 定位；到盘符根自然终止，不会越过用户主目录
    for (let i = 0; i < 5; i++) {
        if (fs.existsSync(path.join(dir, 'package.json')))
            return dir;
        const parent = path.dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return process.cwd();
}
/** 未展开占位符：形如 `${NAME}`。宿主对 .mcp.json 里缺失的 ${VAR} 会原样透传。 */
const UNRESOLVED_PLACEHOLDER = /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/;
/**
 * 清除宿主注入的"假值"，让插件 .env 能正常填坑。
 * 只删两类：空串、未展开的 `${VAR}` 字面量。真实值（含宿主设置的真 key）原样保留。
 */
function stripUnresolvedPlaceholders() {
    const stripped = [];
    for (const [key, value] of Object.entries(process.env)) {
        if (value === undefined)
            continue;
        if (value === '' || UNRESOLVED_PLACEHOLDER.test(value)) {
            delete process.env[key];
            stripped.push(key);
        }
    }
    return stripped;
}
/**
 * 加载 .env 到 process.env。
 *
 * `override: false`（默认）是刻意的：宿主 env 已经提供的值不应被文件覆盖，
 * 否则 settings.json 里配的 key 会被磁盘上的旧 .env 悄悄顶掉。
 * 但会先剔除空串/未展开占位符，避免它们把 .env 里的真值挡住。
 *
 * @returns 实际使用的 .env 路径与该文件是否存在
 */
export function loadEnv() {
    stripUnresolvedPlaceholders();
    const envPath = resolveEnvPath();
    const result = dotenv.config({ path: envPath, override: false });
    return { envPath, loaded: !result.error };
}
export default { resolveEnvPath, loadEnv };
//# sourceMappingURL=env.js.map