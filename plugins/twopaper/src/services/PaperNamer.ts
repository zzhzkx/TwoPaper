/**
 * PaperNamer — 统一 PDF 命名与存放路径管理。
 * 命名规则：FirstAuthor_Year_ShortTitle_Hash4.pdf，存入 DEFAULT_DOWNLOAD_PATH 下按首作者建立的子目录。
 * 同 DOI 论文自动去重（已存在则返回既有路径）。
 */

import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { sanitizeDownloadPath, sanitizeFilename } from '../utils/SecurityUtils.js';

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

export class PaperNamer {
  private readonly baseDir: string;

  constructor(baseDir: string = process.env.DEFAULT_DOWNLOAD_PATH || './downloads') {
    this.baseDir = baseDir;
  }

  /**
   * 生成论文 PDF 的目标绝对路径（不含副标题，含 .pdf 后缀）。
   * 未授权路径/非法输入时回退为安全默认。
   */
  resolveTargetPath(input: NamingInput): { sanitized: string; error?: string } {
    const base = path.resolve(this.baseDir);

    // 计算第一作者子目录
    const author = this.firstAuthorLastName(input.author);
    const subDir = author ? author : 'Unknown';
    const dirResult = sanitizeDownloadPath(subDir, base);
    if (!dirResult.valid) {
      return { sanitized: '', error: dirResult.error };
    }

    const year = this.cleanYear(input.year);
    const title = this.shortTitle(input.title || input.fileName || 'paper');
    const hash = this.doiHash(input.doi);

    const fileName = sanitizeFilename([author || 'Unknown', year, title, hash].filter(Boolean).join('_')) + '.pdf';
    const target = path.join(dirResult.sanitized, fileName);

    return { sanitized: target };
  }

  /**
   * 若目标已存在（同 DOI 或同名），返回既有路径与 existed=true，用于去重跳过重复下载。
   */
  findExisting(input: NamingInput): string | null {
    const { sanitized } = this.resolveTargetPath(input);
    if (!sanitized) return null;
    return fs.existsSync(sanitized) ? sanitized : null;
  }

  private firstAuthorLastName(author?: string): string {
    if (!author) return '';
    const trimmed = author.trim().replace(/\s+/g, ' ');
    if (!trimmed) return '';
    // 取第一个作者 token
    const first = trimmed.split(/[,;]/)[0]?.trim() || trimmed;
    // 取姓（最后一个词），保留连字符
    const parts = first.split(/\s+/);
    const last = parts[parts.length - 1] || '';
    return last.replace(/[^A-Za-zÀ-ɏ'-]/g, '').slice(0, 24);
  }

  private cleanYear(year?: number | string): string {
    if (year === undefined || year === null || year === '') return '';
    const y = String(year).match(/\d{4}/);
    return y ? y[0] : '';
  }

  private shortTitle(title?: string): string {
    if (!title) return '';
    const cleaned = title
      .replace(/\s+/g, '_')
      .replace(/[^\wÀ-ɏ\-.]/g, '')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 40);
    return cleaned;
  }

  private doiHash(doi?: string): string {
    if (!doi) return '';
    return crypto.createHash('sha1').update(doi).digest('hex').slice(0, 4);
  }
}

export default PaperNamer;
