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
/** 解析 .env 的绝对路径。不检查存在性，由调用方决定缺失时如何提示。 */
export declare function resolveEnvPath(): string;
/**
 * 加载 .env 到 process.env。
 *
 * `override: false`（默认）是刻意的：宿主 env 已经提供的值不应被文件覆盖，
 * 否则 settings.json 里配的 key 会被磁盘上的旧 .env 悄悄顶掉。
 * 但会先剔除空串/未展开占位符，避免它们把 .env 里的真值挡住。
 *
 * @returns 实际使用的 .env 路径与该文件是否存在
 */
export declare function loadEnv(): {
    envPath: string;
    loaded: boolean;
};
declare const _default: {
    resolveEnvPath: typeof resolveEnvPath;
    loadEnv: typeof loadEnv;
};
export default _default;
//# sourceMappingURL=env.d.ts.map