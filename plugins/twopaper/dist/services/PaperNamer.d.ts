/**
 * PaperNamer — 统一 PDF 命名与存放路径管理。
 * 命名规则：FirstAuthor_Year_ShortTitle_Hash4.pdf，**扁平**存入输出根（默认 <项目根>/twopaper）。
 * 同 DOI 论文自动去重（已存在则返回既有路径）。
 *
 * 注意：文件名里保留第一作者，便于识别；但不再按作者建子目录 —— 论文直接放输出根，
 * 与同名 Markdown 并列，符合「一个 twopaper 文件夹里直接放命名好的 pdf 和 md」的预期。
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
     * 生成论文 PDF 的目标绝对路径（不含副标题，含 .pdf 后缀）。
     * 扁平落在 baseDir 下；未授权路径/非法输入时回退为安全默认。
     */
    resolveTargetPath(input: NamingInput): {
        sanitized: string;
        error?: string;
    };
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