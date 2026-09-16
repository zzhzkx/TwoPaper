/**
 * PaperNamer — 统一 PDF 命名与存放路径管理。
 * 命名规则：FirstAuthor_Year_ShortTitle_Hash4.pdf，**扁平**存入输出根（默认 <项目根>/twopaper）。
 * 同 DOI 论文自动去重（已存在则返回既有路径）。
 *
 * 注意：文件名里保留第一作者，便于识别；但不再按作者建子目录 —— 论文直接放输出根，
 * 与同名 Markdown 并列，符合「一个 twopaper 文件夹里直接放命名好的 pdf 和 md」的预期。
 */
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { sanitizeFilename } from '../utils/SecurityUtils.js';
import { resolveOutputRoot } from '../utils/paths.js';
export class PaperNamer {
    baseDir;
    constructor(baseDir = process.env.DEFAULT_DOWNLOAD_PATH || resolveOutputRoot()) {
        this.baseDir = baseDir;
    }
    /**
     * 生成论文 PDF 的目标绝对路径（不含副标题，含 .pdf 后缀）。
     * 扁平落在 baseDir 下；未授权路径/非法输入时回退为安全默认。
     */
    resolveTargetPath(input) {
        const base = path.resolve(this.baseDir);
        const author = this.firstAuthorLastName(input.author);
        const year = this.cleanYear(input.year);
        const title = this.shortTitle(input.title || input.fileName || 'paper');
        const hash = this.doiHash(input.doi);
        const fileName = sanitizeFilename([author || 'Unknown', year, title, hash].filter(Boolean).join('_')) + '.pdf';
        const target = path.join(base, fileName);
        return { sanitized: target };
    }
    /** 输出根目录（绝对路径），供同名的 Markdown 落盘时对齐。 */
    get basePath() {
        return path.resolve(this.baseDir);
    }
    /**
     * 若目标已存在（同 DOI 或同名），返回既有路径与 existed=true，用于去重跳过重复下载。
     */
    findExisting(input) {
        const { sanitized } = this.resolveTargetPath(input);
        if (!sanitized)
            return null;
        return fs.existsSync(sanitized) ? sanitized : null;
    }
    firstAuthorLastName(author) {
        if (!author)
            return '';
        const trimmed = author.trim().replace(/\s+/g, ' ');
        if (!trimmed)
            return '';
        // 取第一个作者 token
        const first = trimmed.split(/[,;]/)[0]?.trim() || trimmed;
        // 取姓（最后一个词），保留连字符
        const parts = first.split(/\s+/);
        const last = parts[parts.length - 1] || '';
        return last.replace(/[^A-Za-zÀ-ɏ'-]/g, '').slice(0, 24);
    }
    cleanYear(year) {
        if (year === undefined || year === null || year === '')
            return '';
        const y = String(year).match(/\d{4}/);
        return y ? y[0] : '';
    }
    shortTitle(title) {
        if (!title)
            return '';
        const cleaned = title
            .replace(/\s+/g, '_')
            .replace(/[^\wÀ-ɏ\-.]/g, '')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '')
            .slice(0, 40);
        return cleaned;
    }
    doiHash(doi) {
        if (!doi)
            return '';
        return crypto.createHash('sha1').update(doi).digest('hex').slice(0, 4);
    }
}
export default PaperNamer;
//# sourceMappingURL=PaperNamer.js.map