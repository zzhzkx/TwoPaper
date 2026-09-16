import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PaperNamer } from '../../src/services/PaperNamer.js';
import * as fs from 'fs';
import * as os from 'os';

describe('PaperNamer', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twopaper-'));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('names PDF as Author_Year_ShortTitle_Hash.pdf flat in the output dir', () => {
    const n = new PaperNamer(tmp);
    const { sanitized } = n.resolveTargetPath({
      author: 'Geoffrey Hinton',
      year: 2017,
      title: 'Attention Is All You Need',
      doi: '10.48550/arxiv.1706.03762'
    });
    const base = path.basename(sanitized);
    expect(base).toMatch(/^Hinton_2017_Attention_Is_All_You_Need_[0-9a-f]{4}\.pdf$/);
    // 扁平：直接落在输出根，不建作者子目录
    expect(path.dirname(sanitized)).toBe(path.resolve(tmp));
  });

  it('cleans illegal filename chars and truncates title', () => {
    const n = new PaperNamer(tmp);
    const { sanitized } = n.resolveTargetPath({
      author: 'Smith',
      year: 2020,
      title: 'A very long title ' + 'x'.repeat(80) + ' with : illegal \\ / chars',
      doi: '10.1/a:b'
    });
    const base = path.basename(sanitized);
    expect(base).not.toMatch(/[:\\/]/);
    // 短标题截断到 ~40 字符
    const titlePart = base.replace(/^Smith_2020_/, '').replace(/_[0-9a-f]{4}\.pdf$/, '');
    expect(titlePart.length).toBeLessThanOrEqual(40);
  });

  it('findExisting returns null when file absent and path once present', () => {
    const n = new PaperNamer(tmp);
    const input = { author: 'Lee', year: 2019, title: 'Short', doi: '10.1/x' };
    expect(n.findExisting(input)).toBeNull();
    const { sanitized } = n.resolveTargetPath(input);
    fs.mkdirSync(path.dirname(sanitized), { recursive: true });
    fs.writeFileSync(sanitized, 'x');
    expect(n.findExisting(input)).toBe(sanitized);
  });

  it('exposes the flat output root for co-locating the markdown', () => {
    const n = new PaperNamer(tmp);
    expect(n.basePath).toBe(path.resolve(tmp));
  });
});
