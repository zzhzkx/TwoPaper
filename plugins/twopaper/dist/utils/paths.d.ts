/**
 * paths — 论文产物（PDF / 全文 Markdown / 配图）的输出根目录解析。
 *
 * 设计目标：产物跟着**用户当前的工作目录**走，而不是落在插件安装目录里。
 *  - 换一个干净的 Claude 工作目录时，下载的 PDF、转换的 Markdown、配图都应出现在该目录下。
 *  - 根 = CLAUDE_PROJECT_DIR（Claude Code 注入的项目根），回退 process.cwd()。
 *  - 统一收在 <项目根>/twopaper/ 下：
 *      <root>/<name>.pdf      命名好的 PDF
 *      <root>/<name>.md       命名好的全文 Markdown
 *      <root>/images/<sha>.jpg  Markdown 引用的配图（MinerU 以 images/ 相对路径引用）
 *
 * 可用 env 覆盖：DEFAULT_DOWNLOAD_PATH（PDF 根）、MINERU_OUTPUT_DIR（Markdown 根）。
 */
/** Claude 当前工作目录（项目根）。CLAUDE_PROJECT_DIR 由宿主注入；缺失时退回 cwd。 */
export declare function resolveProjectDir(): string;
/** 论文产物的统一输出根：<项目根>/twopaper。 */
export declare function resolveOutputRoot(): string;
declare const _default: {
    resolveProjectDir: typeof resolveProjectDir;
    resolveOutputRoot: typeof resolveOutputRoot;
};
export default _default;
//# sourceMappingURL=paths.d.ts.map