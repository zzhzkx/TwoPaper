/**
 * Schemas Unit Tests
 * Tests for MCP tool argument parsing and validation
 */

import { describe, it, expect } from '@jest/globals';
import { parseToolArgs } from '../../src/mcp/schemas.js';

describe('parseToolArgs', () => {
  describe('search_papers', () => {
    it('should require a query', () => {
      expect(() => parseToolArgs('search_papers', {})).toThrow();
    });

    it('should apply defaults', () => {
      const args = parseToolArgs('search_papers', { query: 'machine learning' });
      expect(args.platform).toBe('crossref');
      expect(args.maxResults).toBe(10);
      expect(args.sortBy).toBe('relevance');
      expect(args.sortOrder).toBe('desc');
    });

    it('should strip unknown fields', () => {
      const args = parseToolArgs('search_papers', {
        query: 'test',
        unexpected: 'should-be-stripped'
      });
      expect(args.unexpected).toBeUndefined();
    });

    it('should cap maxResults at 100', () => {
      expect(() =>
        parseToolArgs('search_papers', { query: 'test', maxResults: 101 })
      ).toThrow();
    });
  });

  describe('download_paper', () => {
    it('should require paperId and platform', () => {
      expect(() => parseToolArgs('download_paper', { platform: 'arxiv' })).toThrow();
      expect(() => parseToolArgs('download_paper', { paperId: '123' })).toThrow();
    });

    it('should accept a valid savePath', () => {
      const args = parseToolArgs('download_paper', {
        paperId: '2301.00123',
        platform: 'arxiv',
        savePath: './my-downloads'
      });
      expect(args.savePath).toBe('./my-downloads');
    });

    it('should reject invalid platform values', () => {
      expect(() =>
        parseToolArgs('download_paper', { paperId: 'x', platform: 'not-a-platform' })
      ).toThrow();
    });
  });

  describe('get_citations', () => {
    it('should require a DOI', () => {
      expect(() => parseToolArgs('get_citations', {})).toThrow();
    });

    it('should apply forceRefresh default', () => {
      const args = parseToolArgs('get_citations', { doi: '10.1038/nature12373' });
      expect(args.forceRefresh).toBe(false);
    });
  });

  describe('get_paper_by_doi', () => {
    it('should apply platform default', () => {
      const args = parseToolArgs('get_paper_by_doi', { doi: '10.1038/nature12373' });
      expect(args.platform).toBe('all');
    });
  });

  describe('search_scihub', () => {
    it('should accept a DOI or URL', () => {
      const args = parseToolArgs('search_scihub', { doiOrUrl: '10.1038/nature12373' });
      expect(args.downloadPdf).toBe(false);
    });
  });
});