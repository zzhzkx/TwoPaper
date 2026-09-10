import { describe, it, expect } from '@jest/globals';
import { aggregateSearch } from '../../src/services/AggregateSearch.js';
import type { Searchers } from '../../src/mcp/searchers.js';
import { PaperFactory, type Paper } from '../../src/models/Paper.js';

function makePaper(doi: string, title: string, paperId: string, source: string): Paper {
  return PaperFactory.create({ paperId, title, authors: [], abstract: '', source, doi });
}

function searcher(
  search: (q: string, o?: any) => Promise<Paper[]>,
  caps: any = { search: true, requiresApiKey: false }
) {
  return {
    search,
    getCapabilities: () => caps,
    hasApiKey: () => true
  };
}

// 构造一个只含 crossref/semantic/arxiv 的 registry
function registry(p: Record<string, any>): Searchers {
  return p as unknown as Searchers;
}

describe('aggregateSearch', () => {
  it('merges results across platforms and dedups by DOI', async () => {
    const s = registry({
      crossref: searcher(async () => [makePaper('10.1/a', 'Alpha Paper', 'p-a', 'crossref')]),
      semantic: searcher(async () => [makePaper('10.1/b', 'Beta Paper', 'p-b', 'semantic')]),
      arxiv: searcher(async () => [makePaper('10.1/a', 'Alpha Paper (again)', 'p-a', 'arxiv')])
    });
    const res = await aggregateSearch(s, 'alpha', { maxResults: 10 });
    expect(res.papers.length).toBe(2); // DOI 10.1/a 去重
    const alpha = res.papers.find((p) => p.doi === '10.1/a')!;
    expect(alpha.extra?.altSources).toContain('crossref');
    expect(alpha.extra?.altSources).toContain('arxiv');
    expect(res.sourcesHit).toEqual(expect.arrayContaining(['crossref', 'semantic', 'arxiv']));
    expect(res.failures).toHaveLength(0);
  });

  it('isolates a rejecting platform into failures without failing the result', async () => {
    const s = registry({
      crossref: searcher(async () => [makePaper('10.1/a', 'Alpha', 'p-a', 'crossref')]),
      semantic: searcher(async () => { throw new Error('Semantic API down'); })
    });
    const res = await aggregateSearch(s, 'q', {});
    expect(res.papers.length).toBe(1);
    expect(res.failures).toHaveLength(1);
    expect(res.failures[0].platform).toBe('semantic');
  });

  it('skips scihub/scholar/wos aliases automatically', async () => {
    const s = registry({
      crossref: searcher(async () => [makePaper('10.1/a', 'A', 'p', 'crossref')]),
      scihub: searcher(async () => { throw new Error('should not be called'); }),
      wos: searcher(async () => { throw new Error('should not be called'); }),
      scholar: searcher(async () => { throw new Error('should not be called'); })
    });
    const res = await aggregateSearch(s, 'q', {});
    expect(res.failures).toHaveLength(0);
    expect(res.papers.length).toBe(1);
  });
});
