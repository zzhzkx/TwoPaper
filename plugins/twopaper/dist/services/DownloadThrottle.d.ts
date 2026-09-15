/**
 * DownloadThrottle — 下载 PDF 的多窗口滑动限流器。
 * 三档默认：每分钟 2 篇 / 每小时 100 篇 / 每天 500 篇，阈值全部 env 可调，数值 0 = 关闭该档。
 * 超任一审抛带 retryAfter（下一可用时刻 ms）的错误，供上游/SKILL 等待后重试。
 */
export interface ThrottleWindowConfig {
    /** 窗口内允许的最大下载数；0=关闭 */
    max: number;
    /** 窗口时长（毫秒） */
    windowMs: number;
}
export declare class DownloadLimitError extends Error {
    readonly windowName: string;
    readonly retryAfterMs: number;
    constructor(windowName: string, retryAfterMs: number);
}
export declare class DownloadThrottle {
    private readonly timestamps;
    private readonly windows;
    private readonly nowFn;
    constructor(nowFn?: () => number, limits?: {
        minute?: number;
        hour?: number;
        day?: number;
    });
    /**
     * 检查并记录一次下载。若超限抛 DownloadLimitError；否则推进计数返回 true。
     */
    acquire(): void;
    /**
     * 归还一次配额（下载失败时调用）。
     * acquire() 在任何网络 I/O 之前乐观记账；若随后下载抛错（网络中断、403、路径写入失败），
     * 不归还就会让失败的尝试白吃掉配额——默认 DOWNLOAD_PER_MINUTE=2 时两次失败即锁死一分钟。
     */
    release(): void;
    /**
     * 只读检查，不消耗配额。超限返回 retryAfterMs(>0)，否则 0。
     */
    check(): number;
    /** 各档剩余可用配额与下一可用时刻（供 get_platform_status 展示）。 */
    status(): Record<string, {
        used: number;
        max: number;
        nextAvailableInMs: number;
    }>;
    private recentWithin;
    private usageSummary;
}
export default DownloadThrottle;
//# sourceMappingURL=DownloadThrottle.d.ts.map