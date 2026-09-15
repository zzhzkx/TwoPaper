/**
 * mapLimit — 有界并发映射，收集全部结果（顺序与输入一致）。
 * 项目内自实现，避免对 p-limit(纯 ESM) 的 jest 动态 import 依赖。
 * 任一任务 reject 会让整批 reject（配合各调用方自己的 try/catch/Promise.allSettled 做隔离）。
 */
export declare function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]>;
//# sourceMappingURL=mapLimit.d.ts.map