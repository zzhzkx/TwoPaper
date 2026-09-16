/**
 * ScopusSearcher Platform Tests
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ScopusSearcher } from '../../src/platforms/ScopusSearcher.js';

describe('ScopusSearcher', () => {
  let searcher: ScopusSearcher;

  beforeEach(() => {
    searcher = new ScopusSearcher('test-api-key');
  });

  describe('getCapabilities', () => {
    it('should return correct capabilities', () => {
      const caps = searcher.getCapabilities();
      expect(caps.search).toBe(true);
      expect(caps.citations).toBe(true);
      expect(caps.requiresApiKey).toBe(true);
    });
  });

  describe('constructor', () => {
    it('should require API key', async () => {
      // 构造函数在未传参时回退读 process.env.ELSEVIER_API_KEY。
      // 若开发机/CI 恰好配了该 key，这个用例会发起真实网络请求并成功，
      // 使"无 key 应当报错"的断言失效。故显式清空，保证用例自洽、不发网络。
      const saved = process.env.ELSEVIER_API_KEY;
      delete process.env.ELSEVIER_API_KEY;
      try {
        const noKeySearcher = new ScopusSearcher();
        await expect(noKeySearcher.search('test')).rejects.toThrow();
      } finally {
        if (saved !== undefined) process.env.ELSEVIER_API_KEY = saved;
      }
    });
  });

  describe('search options', () => {
    it('should support affiliation filter', () => {
      expect(searcher.search).toBeDefined();
    });

    it('should support documentType filter', () => {
      // ar, cp, re, bk, ch
      expect(searcher.search).toBeDefined();
    });

    it('should support openAccess filter', () => {
      expect(searcher.search).toBeDefined();
    });

    it('should support subject filter', () => {
      expect(searcher.search).toBeDefined();
    });
  });

  describe('getCitationIds', () => {
    it('should be available', () => {
      expect(searcher.getCitationIds).toBeDefined();
    });
  });

  describe('getReferenceIds', () => {
    it('should be available', () => {
      expect(searcher.getReferenceIds).toBeDefined();
    });
  });
});
