/**
 * PaperNamer — 统一 PDF 命名与存放路径管理。
 * 每篇论文一个**独立文件夹**（以论文命名），PDF / Markdown / 配图都收在里面：
 *   <root>/<FirstAuthor_Year_ShortTitle_Hash>/
 *       ├── <同名的>.pdf
 *       ├── <同名的>.md
 *       └── images/<sha>.jpg
 * 这样同一篇论文的产物集中、互不混淆，且 images/ 按论文隔离（不再共用一个大 images 目录）。
 * 同 DOI 论文自动去重（已存在则返回既有路径）。
 */
export interface NamingInput {
    /** 第一作者姓名（任意形式） */
    author?: string;
    /** 出版年份 */
    year?: number | string;
    /** 论文标题 */
    title?: string;
    /** DOI（用于哈希防冲突 + 去重主键） */
    doi?: string;
    /** 可选覆盖文件名 */
    fileName?: string;
}
export declare class PaperNamer {
    private readonly baseDir;
    constructor(baseDir?: string);
    /**
     * 生成论文 PDF 的目标绝对路径：<root>/<stem>/<stem>.pdf（每篇一个文件夹）。
     * 未授权路径/非法输入时回退为安全默认。
     */
    resolveTargetPath(input: NamingInput): {
        sanitized: string;
        error?: string;
    };
    /** 某篇论文的产物目录（绝对路径）：PDF / Markdown / images 都放这里。 */
    resolvePaperDir(input: NamingInput): string;
    /** 输出根目录（绝对路径），供同名的 Markdown 落盘时对齐。 */
    get basePath(): string;
    /**
     * 若目标已存在（同 DOI 或同名），返回既有路径与 existed=true，用于去重跳过重复下载。
     */
    findExisting(input: NamingInput): string | null;
    private firstAuthorLastName;
    private cleanYear;
    private shortTitle;
    private doiHash;
}
export default PaperNamer;
//# sourceMappingURL=PaperNamer.d.ts.map