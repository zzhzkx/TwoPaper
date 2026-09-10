import { describe, it, expect } from '@jest/globals';
import { PlatformRegistry } from '../../src/services/PlatformRegistry.js';
import type { Searchers } from '../../src/mcp/searchers.js';

function searcher(caps: any, hasKey = false) {
  return {
    getCapabilities: () => caps,
    hasApiKey: () => hasKey,
    validateApiKey: async () => true,
    getBaseUrl: () => 'https://x'
  };
}

function minimalRegistry() {
  return {
    arxiv: searcher({ search: true, requiresApiKey: false }),
    pubmed: searcher({ search: true, requiresApiKey: false }, false),
    webofscience: undefined,
    crossref: searcher({ search: true, requiresApiKey: false }),
    else: undefined
  } as unknown as Searchers;
}

describe('PlatformRegistry.getStatus', () => {
  it('marks required-key platforms with no searcher as UNCONFIGURED', async () => {
    const reg = new PlatformRegistry();
    const rows = await reg.getStatus(minimalRegistry());
    const wos = rows.find((r) => r.platform === 'webofscience')!;
    expect(wos.status).toBe('UNCONFIGURED');
    expect(wos.configured).toBe(false);
  });

  it('marks no-key platforms as OK', async () => {
    const reg = new PlatformRegistry();
    const rows = await reg.getStatus(minimalRegistry());
    const crossref = rows.find((r) => r.platform === 'crossref')!;
    expect(crossref.status).toBe('OK');
    expect(crossref.configured).toBe(true);
  });

  it('marks optional-key platforms without a key as DEGRADED', async () => {
    const reg = new PlatformRegistry();
    const rows = await reg.getStatus(minimalRegistry());
    const pubmed = rows.find((r) => r.platform === 'pubmed')!;
    expect(pubmed.status).toBe('DEGRADED');
  });

  it('marks login-required platforms as NEED_LOGIN', async () => {
    const reg = new PlatformRegistry();
    const rows = await reg.getStatus(minimalRegistry());
    const gs = rows.find((r) => r.platform === 'googlescholar')!;
    expect(gs.status).toBe('NEED_LOGIN');
  });
});
