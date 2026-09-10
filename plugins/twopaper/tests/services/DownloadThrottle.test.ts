import { describe, it, expect } from '@jest/globals';
import { DownloadThrottle, DownloadLimitError } from '../../src/services/DownloadThrottle.js';

describe('DownloadThrottle', () => {
  it('allows downloads below the configured per-minute limit', () => {
    let now = 1_000_000;
    const t = new DownloadThrottle(() => now, { minute: 2, hour: 100, day: 500 });
    t.acquire(); // 第 1 次
    expect(t.check()).toBe(0); // 未超限
    t.acquire(); // 第 2 次（恰好到限）
    expect(t.check()).toBeGreaterThan(0); // 已满，给出 retryAfter
  });

  it('rejects once the minute window limit is hit and reports retryAfter', () => {
    let now = 1_000_000;
    const t = new DownloadThrottle(() => now, { minute: 2, hour: 100, day: 500 });
    t.acquire();
    t.acquire();
    let err: DownloadLimitError | undefined;
    try {
      t.acquire();
    } catch (e) {
      if (e instanceof DownloadLimitError) err = e;
    }
    expect(err).toBeDefined();
    expect(err!.retryAfterMs).toBeGreaterThan(0);
    expect(err!.windowName).toBe('minute');
  });

  it('frees capacity after the window elapses (minute rollover)', () => {
    let now = 1_000_000;
    const t = new DownloadThrottle(() => now, { minute: 1, hour: 100, day: 500 });
    t.acquire();
    expect(() => t.acquire()).toThrow(DownloadLimitError);
    now += 60_001;
    expect(() => t.acquire()).not.toThrow();
  });

  it('exposes status with used/max for each window', () => {
    let now = 1_000_000;
    const t = new DownloadThrottle(() => now, { minute: 2, hour: 10, day: 50 });
    t.acquire();
    const s = t.status();
    expect(s.minute.used).toBe(1);
    expect(s.minute.max).toBe(2);
    expect(s.hour.max).toBe(10);
    expect(s.day.max).toBe(50);
  });

  it('disables a window when its limit is 0', () => {
    let now = 1_000_000;
    const t = new DownloadThrottle(() => now, { minute: 0, hour: 0, day: 0 });
    for (let i = 0; i < 1000; i++) t.acquire();
    expect(t.check()).toBe(0);
  });
});
