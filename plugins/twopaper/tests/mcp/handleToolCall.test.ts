/**
 * handleToolCall Security Tests
 * Verifies savePath path-traversal guard prevents writing outside the downloads dir
 */

import { describe, it, expect, jest } from '@jest/globals';
import { handleToolCall, isBareName, parseMetadataFromMarkdown } from '../../src/mcp/handleToolCall.js';

interface SearcherLike {
  getCapabilities: () => { download: boolean; search: boolean; fullText: boolean; citations: boolean; requiresApiKey: boolean; supportedOptions: string[] };
  downloadPdf: (paperId: string, options?: any) => Promise<string>;
  search: (query: string, options?: any) => Promise<any[]>;
  getPaperByDoi: (doi: string) => Promise<any | null>;
}

function makeSearcher(download: boolean = true): SearcherLike {
  return {
    getCapabilities: () => ({
      download,
      search: true,
      fullText: false,
      citations: false,
      requiresApiKey: false,
      supportedOptions: []
    }),
    downloadPdf: jest.fn(async (_paperId: string, _options?: any) => '/safe/downloads/paper.pdf'),
    search: jest.fn(async () => []),
    getPaperByDoi: jest.fn(async () => null)
  };
}

function makeSearchers(overrides: Record<string, any> = {}) {
  return {
    arxiv: makeSearcher(),
    ...overrides
  } as Record<string, SearcherLike>;
}

describe('handleToolCall lazily constructs env-reading clients', () => {
  it('sees a MINERU_TOKEN set after import (not frozen at module load)', async () => {
    // 客户端若在模块加载期构造，会早于 loadEnv() 读 env → 永久 hasToken=false。
    // 这里在 import 之后才设 token，惰性构造应当看得到它。
    const saved = process.env.MINERU_TOKEN;
    process.env.MINERU_TOKEN = 'tok-set-after-import';
    try {
      let err: any = null;
      try {
        await handleToolCall('get_fulltext', { pdfPath: '/nonexistent/x.pdf' }, makeSearchers() as any);
      } catch (e) {
        err = e;
      }
      // 走到了读文件这步（ENOENT）——说明已越过 hasToken 检查，token 确实被读到
      expect(String(err?.message)).toMatch(/ENOENT|no such file|stat/i);
      expect(String(err?.message)).not.toMatch(/MINERU_TOKEN not configured/i);
    } finally {
      if (saved === undefined) delete process.env.MINERU_TOKEN;
      else process.env.MINERU_TOKEN = saved;
    }
  });
});

describe('isBareName', () => {
  it('flags arXiv ids and Unknown_* fallback names as bare', () => {
    expect(isBareName('/x/downloads/1706.03762.pdf')).toBe(true);
    expect(isBareName('/x/2301.00123v2.pdf')).toBe(true);
    expect(isBareName('/x/Unknown_paper_2d5a.pdf')).toBe(true);
  });
  it('treats a properly named pdf as named', () => {
    expect(isBareName('/x/Vaswani_2017_Attention_Is_All_You_Need_db6d.pdf')).toBe(false);
  });
});

describe('parseMetadataFromMarkdown', () => {
  it('extracts title from H1 and the author line right after it', () => {
    const md = [
      'RESEARCH ARTICLE',
      '# Exposure to digital marketing enhances young adults interest',
      'Limin Buchanan*, Bridget Kelly, Heather Yeatman',
      'Early Start Research Institute, University of Wollongong, Australia',
      '',
      'Citation: Buchanan L, Kelly B (2017) ... doi:10.1371/journal.pone.0171226'
    ].join('\n');
    const meta = parseMetadataFromMarkdown(md);
    expect(meta.title).toContain('Exposure to digital marketing');
    expect(meta.author).toContain('Buchanan');
    expect(meta.year).toBe('2017');
  });

  it('does not mistake an institution line for authors', () => {
    const md = ['# Some Paper Title Here', 'Department of Physics, MIT', 'A. Author, B. Writer'].join('\n');
    expect(parseMetadataFromMarkdown(md).author).toContain('A. Author');
  });
});

describe('handleToolCall savePath guard', () => {
  it('should reject a path traversal savePath in download_paper', async () => {
    const searchers = makeSearchers() as any;

    await expect(
      handleToolCall('download_paper', { paperId: '2301.00123', platform: 'arxiv', savePath: '../../etc' }, searchers)
    ).rejects.toThrow(/traversal/i);
  });

  it('should reject an absolute path outside the downloads dir', async () => {
    const searchers = makeSearchers() as any;
    await expect(
      handleToolCall('download_paper', { paperId: '2301.00123', platform: 'arxiv', savePath: '/etc/passwd' }, searchers)
    ).rejects.toThrow(/traversal/i);
  });

  it('should allow a safe relative savePath', async () => {
    const searchers = makeSearchers() as any;
    const response = await handleToolCall(
      'download_paper',
      { paperId: '2301.00123', platform: 'arxiv', savePath: 'sub' },
      searchers
    );
    expect(response.content[0].text).toContain('downloaded');
  });

  it('should reject an unsupported platform in download_paper', async () => {
    const searchers: any = {};
    // Schema validation rejects unknown enum values before reaching tool dispatch.
    await expect(
      handleToolCall('download_paper', { paperId: 'x', platform: 'nope' }, searchers)
    ).rejects.toThrow();
  });

  it('should reject an invalid DOI in get_paper_by_doi', async () => {
    const searchers = makeSearchers() as any;
    await expect(
      handleToolCall('get_paper_by_doi', { doi: 'not-a-doi' }, searchers)
    ).rejects.toThrow(/DOI/i);
  });
});