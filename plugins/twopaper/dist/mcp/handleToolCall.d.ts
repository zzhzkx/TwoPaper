import type { Searchers } from './searchers.js';
/** 裸名判定：arXiv 纯 id（1706.03762）或元数据缺失时的 Unknown_* 回退名，均视为"未命名好"。 */
export declare function isBareName(pdfPath: string): boolean;
/**
 * 从 MinerU 产出的 Markdown 里启发式解析论文元数据（不引入新依赖）。
 * 结构通常是：可选的期刊抬头 → `# 标题` → 作者行（一人一行或逗号列表）→ 机构行 → …
 *
 * 注意作者行没有统一格式：
 *   - 多作者一人一行、带 <sup>†</sup> 上标与邮箱（如 arXiv 版式）
 *   - 单行逗号分隔（如 PLOS 版式）
 * 故按 "截断到首个 HTML 标签 / 邮箱 → 取逗号前第一人 → 去掉尾部标记" 抽取。
 */
export declare function parseMetadataFromMarkdown(md: string): {
    title?: string;
    author?: string;
    year?: string;
};
export declare function handleToolCall(toolNameRaw: string, rawArgs: unknown, searchers: Searchers): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
//# sourceMappingURL=handleToolCall.d.ts.map