/**
 * mapLimit — 有界并发映射，收集全部结果（顺序与输入一致）。
 * 项目内自实现，避免对 p-limit(纯 ESM) 的 jest 动态 import 依赖。
 * 任一任务 reject 会让整批 reject（配合各调用方自己的 try/catch/Promise.allSettled 做隔离）。
 */
export async function mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
        while (next < items.length) {
            const i = next++;
            results[i] = await fn(items[i], i);
        }
    });
    await Promise.all(workers);
    return results;
}
//# sourceMappingURL=mapLimit.js.map