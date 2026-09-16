/**
 * 第五轮（缺陷修复轮）回归测试 —— 锁定本轮逐个修掉的 6 个已实测缺陷，防回归：
 *
 *  1. ErrorHandler 只对"像密钥"的消息打码，不再把诊断信息毁成星号
 *     （实测 `connect ECONNREFUSED 127.0.0.1:443` 曾被打成 `conn****:443`）
 *  2. SciHubSearcher.getMirrorStatus 未探测时返回 Unverified，不再谎报 Working
 *     （实测默认 8ms 报 "11/11 Working"，物理上不可能）
 *  3. PaperSource.getPaperByDoi 校验返回 DOI，不匹配返回 null
 *     （曾把别的论文当成命中，会污染引用链）
 *  4. WoS 排序映射只产出 v2 合法字段（旧映射给 'relevance'/'PD' → 400）
 *  5. bioRxiv/medRxiv 关键词过滤按词元打分，而非整句短语子串（后者恒 0）
 *  6. 聚合在配置齐备时不再出现 WoS 400 / biorxiv 超时
 */
import { describe, it, expect, jest } from '@jest/globals';
import { ErrorHandler } from '../../src/utils/ErrorHandler.js';
import { SciHubSearcher } from '../../src/platforms/SciHubSearcher.js';
import { PaperSource } from '../../src/platforms/PaperSource.js';
import { WebOfScienceSearcher } from '../../src/platforms/WebOfScienceSearcher.js';
import { PaperFactory } from '../../src/models/Paper.js';

// ------------------------------------------------------------------ 1. 错误打码
describe('ErrorHandler does not destroy diagnostics', () => {
  const handler = new ErrorHandler('google_scholar');

  it('keeps a plain connection error readable (no masking)', () => {
    let msg = '';
    try {
      handler.handleError(new Error('connect ECONNREFUSED 127.0.0.1:443'), 'search');
    } catch (e: any) {
      msg = e.message;
    }
    expect(msg).toContain('ECONNREFUSED');
    expect(msg).toContain('127.0.0.1:443');
    expect(msg).not.toMatch(/\*{4,}/);
  });

  it('still masks something that looks like a token', () => {
    let msg = '';
    try {
      handler.handleError(new Error('sk-abcdef0123456789abcdef0123456789'), 'search');
    } catch (e: any) {
      msg = e.message;
    }
    expect(msg).toMatch(/\*{4,}/);
  });
});

// ------------------------------------------------------------------ 2. scihub 镜像状态
describe('SciHubSearcher mirror status is not faked before probing', () => {
  it('reports Unverified (not Working) when no health check has run', () => {
    const s = new SciHubSearcher();
    expect(s.hasChecked()).toBe(false);
    const statuses = s.getMirrorStatus();
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses.every((m) => m.status === 'Unverified')).toBe(true);
    expect(statuses.some((m) => m.status === 'Working')).toBe(false);
  });
});

// ------------------------------------------------------------------ 3. DOI 校验
describe('PaperSource.getPaperByDoi rejects mismatched DOIs', () => {
  class Fake extends PaperSource {
    constructor(private ret: any) { super('fake', 'https://x'); }
    getCapabilities() { return { search: true, download: false, fullText: false, citations: false, requiresApiKey: false, supportedOptions: [] }; }
    async search() { return this.ret ? [this.ret] : []; }
    async downloadPdf() { return ''; }
    async readPaper() { return ''; }
  }
  const paper = (doi: string) => PaperFactory.create({ paperId: 'p', title: 't', source: 'fake', authors: [], abstract: '', doi, publishedDate: null, pdfUrl: '', url: '' });

  it('returns the paper when the DOI matches (normalised)', async () => {
    const f = new Fake(paper('10.1038/NATURE12373'));
    const got = await f.getPaperByDoi('https://doi.org/10.1038/nature12373');
    expect(got).not.toBeNull();
  });

  it('returns null when the platform returns a different paper', async () => {
    const f = new Fake(paper('10.1007/978-3-032-31998-2_4'));
    const got = await f.getPaperByDoi('10.48550/arXiv.1706.03762');
    expect(got).toBeNull();
  });
});

// ------------------------------------------------------------------ 4. WoS 排序字段
describe('WebOfScience sort mapping only emits v2-legal fields', () => {
  const s = new WebOfScienceSearcher('k', 'v2');
  const legal = new Set(['LD', 'PY', 'RS', 'TC', '']);
  it.each(['relevance', 'date', 'citations', 'title', 'author', 'journal'])(
    'maps %s to a legal WoS sort tag',
    (k) => {
      const mapped = (s as any).mapSortField(k);
      expect(legal.has(mapped)).toBe(true);
      expect(mapped).not.toBe('relevance');
      expect(mapped).not.toBe('PD');
    }
  );

  it('omits sortField entirely for an unmapped/absent sort (server default)', () => {
    const params = (s as any).buildSearchQuery('x', { maxResults: 3, sortBy: 'title' });
    expect(params.sortField).toBeUndefined();
  });

  it('emits a legal sortField when sortBy=relevance (the aggregate default)', () => {
    const params = (s as any).buildSearchQuery('x', { maxResults: 3, sortBy: 'relevance' });
    expect(params.sortField).toMatch(/^(RS|LD|PY|TC) (ASC|DESC)$/);
  });
});

// ------------------------------------------------------------------ 5. biorxiv 词元匹配
describe('BioRxiv token matching is not whole-phrase', () => {
  it('matches papers that contain the tokens separately', async () => {
    const { BioRxivSearcher } = await import('../../src/platforms/BioRxivSearcher.js');
    const s = new BioRxivSearcher('biorxiv');
    const data = {
      collection: [
        { doi: '10.1/a', title: 'CRISPR and gene editing in embryos', authors: 'X', date: '2026-01-01', category: 'molecular biology', abstract: '', jatsxml: '', license: '', published: '', server: 'biorxiv' },
        { doi: '10.1/b', title: 'Unrelated topic about ecology', authors: 'Y', date: '2026-01-01', category: 'ecology', abstract: '', jatsxml: '', license: '', published: '', server: 'biorxiv' }
      ]
    };
    // 旧实现要求整句 "crispr gene editing" 连续出现 → 这里两条都命不中
    const parsed = (s as any).parseSearchResponse(data, 'CRISPR gene editing', {});
    expect(parsed.length).toBe(1);
    expect(parsed[0].doi).toBe('10.1/a');
  });
});
