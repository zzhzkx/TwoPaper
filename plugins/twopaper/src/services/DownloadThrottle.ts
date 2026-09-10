/**
 * DownloadThrottle — 下载 PDF 的多窗口滑动限流器。
 * 三档默认：每分钟 2 篇 / 每小时 100 篇 / 每天 500 篇，阈值全部 env 可调，数值 0 = 关闭该档。
 * 超任一审抛带 retryAfter（下一可用时刻 ms）的错误，供上游/SKILL 等待后重试。
 */

import { logDebug } from '../utils/Logger.js';

export interface ThrottleWindowConfig {
  /** 窗口内允许的最大下载数；0=关闭 */
  max: number;
  /** 窗口时长（毫秒） */
  windowMs: number;
}

export class DownloadLimitError extends Error {
  constructor(
    public readonly windowName: string,
    public readonly retryAfterMs: number
  ) {
    super(`Download limit exceeded (${windowName}); retry after ${Math.ceil(retryAfterMs / 1000)}s`);
    this.name = 'DownloadLimitError';
  }
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = Number(raw);
  // 显式 0 → 关闭该档；非正或非法 → 关闭（避免误用）；正数 → 用该值
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export class DownloadThrottle {
  private readonly timestamps: Record<string, number[]> = {};
  private readonly windows: Record<string, ThrottleWindowConfig>;
  private readonly nowFn: () => number;

  constructor(
    nowFn: () => number = () => Date.now(),
    limits?: { minute?: number; hour?: number; day?: number }
  ) {
    this.nowFn = nowFn;
    this.windows = {
      minute: { max: limits?.minute ?? envInt('DOWNLOAD_PER_MINUTE', 2), windowMs: 60_000 },
      hour: { max: limits?.hour ?? envInt('DOWNLOAD_PER_HOUR', 100), windowMs: 3_600_000 },
      day: { max: limits?.day ?? envInt('DOWNLOAD_PER_DAY', 500), windowMs: 86_400_000 }
    };
  }

  /**
   * 检查并记录一次下载。若超限抛 DownloadLimitError；否则推进计数返回 true。
   */
  acquire(): void {
    const now = this.nowFn();
    let retryAfter = 0;

    // 先检查各窗口是否已满（在记录前判断，避免把自身计入用满的窗口）
    for (const [name, cfg] of Object.entries(this.windows)) {
      if (cfg.max <= 0) continue; // 关闭该档
      const recent = this.recentWithin(name, now, cfg.windowMs);
      if (recent.length >= cfg.max) {
        // 最旧一次计数的重置时刻即恢复点
        const oldestPlanned = recent[0] + cfg.windowMs;
        if (oldestPlanned > now) {
          retryAfter = Math.max(retryAfter, oldestPlanned - now);
        }
      }
    }

    if (retryAfter > 0) {
      const over = Object.keys(this.windows).find(
        (n) => this.windows[n].max > 0 && this.recentWithin(n, now, this.windows[n].windowMs).length >= this.windows[n].max
      );
      throw new DownloadLimitError(over || 'window', retryAfter);
    }

    // 通过：记录本次
    for (const name of Object.keys(this.windows)) {
      if (this.windows[name].max <= 0) continue;
      this.timestamps[name] = this.timestamps[name] || [];
      this.timestamps[name].push(now);
    }
    logDebug(`DownloadThrottle: acquired (${this.usageSummary(now)})`);
  }

  /**
   * 只读检查，不消耗配额。超限返回 retryAfterMs(>0)，否则 0。
   */
  check(): number {
    const now = this.nowFn();
    let retryAfter = 0;
    for (const [name, cfg] of Object.entries(this.windows)) {
      if (cfg.max <= 0) continue;
      const recent = this.recentWithin(name, now, cfg.windowMs);
      if (recent.length >= cfg.max) {
        const restore = recent[0] + cfg.windowMs;
        if (restore > now) retryAfter = Math.max(retryAfter, restore - now);
      }
    }
    return retryAfter;
  }

  /** 各档剩余可用配额与下一可用时刻（供 get_platform_status 展示）。 */
  status(): Record<string, { used: number; max: number; nextAvailableInMs: number }> {
    const now = this.nowFn();
    const out: Record<string, { used: number; max: number; nextAvailableInMs: number }> = {};
    for (const [name, cfg] of Object.entries(this.windows)) {
      const used = cfg.max <= 0 ? 0 : this.recentWithin(name, now, cfg.windowMs).length;
      let next = 0;
      if (cfg.max > 0 && used >= cfg.max) {
        const recent = this.recentWithin(name, now, cfg.windowMs);
        next = recent.length ? Math.max(0, recent[0] + cfg.windowMs - now) : 0;
      }
      out[name] = { used, max: cfg.max, nextAvailableInMs: next };
    }
    return out;
  }

  private recentWithin(name: string, now: number, windowMs: number): number[] {
    const list = this.timestamps[name] || [];
    const cutoff = now - windowMs;
    return list.filter((t) => t > cutoff);
  }

  private usageSummary(now: number): string {
    return Object.entries(this.windows)
      .map(([n, c]) => {
        const used = c.max <= 0 ? 0 : this.recentWithin(n, now, c.windowMs).length;
        return `${n}:${used}/${c.max}`;
      })
      .join(' ');
  }
}

export default DownloadThrottle;
