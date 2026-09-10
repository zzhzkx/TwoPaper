import { describe, it, expect } from '@jest/globals';
import { RateLimiter } from '../../src/utils/RateLimiter.js';

describe('RateLimiter provider feedback', () => {
  it('pauses new requests until Retry-After expires', async () => {
    const limiter = new RateLimiter({ requestsPerSecond: 100, burstCapacity: 1 });
    limiter.applyResponseHeaders({ 'retry-after': '0.02' });

    const started = Date.now();
    await limiter.waitForPermission();

    expect(Date.now() - started).toBeGreaterThanOrEqual(15);
    limiter.dispose();
  });

  it('uses X-RateLimit-Reset when no requests remain', async () => {
    const limiter = new RateLimiter({ requestsPerSecond: 100, burstCapacity: 1 });
    const resetAt = Date.now() + 20;
    limiter.applyResponseHeaders({
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': String(resetAt)
    });

    const started = Date.now();
    await limiter.waitForPermission();

    expect(Date.now() - started).toBeGreaterThanOrEqual(10);
    limiter.dispose();
  });
});
