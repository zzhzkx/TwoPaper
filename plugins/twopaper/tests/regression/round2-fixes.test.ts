/**
 * 第二轮修复的回归测试。
 * 每个用例锁定一个已实测确认的缺陷，防止回归：
 *  1. selectSearchable 按实例去重（别名 'scholar' 曾导致 googlescholar 未被排除）
 *  2. sanitizeDownloadPath 不得重复嵌套（'./downloads/x' 曾变成 downloads/downloads/x）
 *  3. DownloadThrottle.release() 归还失败下载的配额
 *  4. BioRxiv / IACR 的 downloadPdf 必须监听源流错误（否则 Promise 永不 settle）
 */
import { describe, it, expect } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs';
import { selectSearchable } from '../../src/mcp/searchers.js';
import { sanitizeDownloadPath } from '../../src/utils/SecurityUtils.js';
import { DownloadThrottle, DownloadLimitError } from '../../src/services/DownloadThrottle.js';

describe('selectSearchable — 按实例去重排除别名', () => {
  // 构造与真实注册表同构的最小替身：别名与真实 key 指向同一实例
  const gs = { id: 'gs' };
  const wos = { id: 'wos' };
  const arxiv = { id: 'arxiv' };
  const scihub = { id: 'scihub' };
  const registry: any = {
    arxiv,
    webofscience: wos,
    wos, // 别名 → 同一实例
    googlescholar: gs,
    scholar: gs, // 别名 → 同一实例
    scihub
  };

  it('默认排除 googlescholar（反爬），且不留下别名重复项', () => {
    const picked = selectSearchable(registry, { exclude: ['scihub'] }).map(([n]) => n);
    expect(picked).toContain('arxiv');
    expect(picked).not.toContain('googlescholar');
    expect(picked).not.toContain('scholar');
    expect(picked).not.toContain('scihub');
  });

  it('webofscience 只出现一次（别名 wos 不重复计入）', () => {
    const picked = selectSearchable(registry).map(([n]) => n);
    expect(picked.filter((n) => n === 'webofscience')).toHaveLength(1);
    expect(picked).not.toContain('wos');
  });

  it('includeScholar=true 时才纳入 googlescholar', () => {
    const on = selectSearchable(registry, { includeScholar: true }).map(([n]) => n);
    expect(on).toContain('googlescholar');
    // 仍是按实例唯一，不会同时出现 scholar 与 googlescholar
    expect(on.filter((n) => n === 'googlescholar' || n === 'scholar')).toHaveLength(1);
  });
});

describe('sanitizeDownloadPath — 不得重复嵌套基准目录', () => {
  it('用户自带 baseDir 前缀时不产生 downloads/downloads', () => {
    const r = sanitizeDownloadPath('./downloads/__probe', './downloads');
    expect(r.valid).toBe(true);
    expect(r.sanitized).not.toMatch(/downloads[\\/]downloads/);
    expect(r.sanitized.endsWith(path.join('downloads', '__probe'))).toBe(true);
  });

  it('普通覆盖目录仍解析到 baseDir 之下', () => {
    const r = sanitizeDownloadPath('./myout', './downloads');
    expect(r.valid).toBe(true);
    expect(r.sanitized.endsWith(path.join('downloads', 'myout'))).toBe(true);
  });

  it('路径穿越仍被拒绝', () => {
    const r = sanitizeDownloadPath('../../evil', './downloads');
    expect(r.valid).toBe(false);
  });

  it('空输入回落到 baseDir', () => {
    const r = sanitizeDownloadPath(undefined, './downloads');
    expect(r.valid).toBe(true);
    expect(r.sanitized).toBe(path.resolve('./downloads'));
  });
});

describe('DownloadThrottle.release — 失败下载归还配额', () => {
  it('acquire 后 release 可让配额回到可用状态', () => {
    const t = new DownloadThrottle(() => 1000, { minute: 1, hour: 0, day: 0 });
    t.acquire(); // 用掉唯一的分钟配额
    expect(() => t.acquire()).toThrow(DownloadLimitError);
    t.release(); // 失败归还
    expect(() => t.acquire()).not.toThrow();
  });

  it('未 acquire 时 release 不报错', () => {
    const t = new DownloadThrottle(() => 1000, { minute: 1, hour: 0, day: 0 });
    expect(() => t.release()).not.toThrow();
  });
});

describe('平台 downloadPdf — 源流错误必须 settle（静态断言）', () => {
  const cases: Array<[string, string]> = [
    ['BioRxivSearcher', path.resolve(__dirname, '../../src/platforms/BioRxivSearcher.ts')],
    ['IACRSearcher', path.resolve(__dirname, '../../src/platforms/IACRSearcher.ts')]
  ];

  it.each(cases)('%s 的下载实现监听 response.data 的 error 事件', (_name, file) => {
    const src = fs.readFileSync(file, 'utf-8');
    // 只检查 downloadPdf 方法体，避免误匹配 readPaper 等其它实现
    const dl = src.slice(src.indexOf('async downloadPdf'), src.indexOf('async downloadPdf') + 3000);
    expect(dl).toMatch(/response\.data\.on\(['"]error['"]/);
  });
});
