/**
 * handleToolCall Security Tests
 * Verifies savePath path-traversal guard prevents writing outside the downloads dir
 */

import { describe, it, expect, jest } from '@jest/globals';
import { handleToolCall } from '../../src/mcp/handleToolCall.js';

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