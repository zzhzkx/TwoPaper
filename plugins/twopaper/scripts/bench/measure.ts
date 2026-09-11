/**
 * 实测 harness — 测量 TwoPaper 各渠道搜索延迟、聚合串行/并行行为、元数据轮询延迟。
 * 运行方式(需真实凭证+代理)：
 *   node --no-warnings --experimental-vm-modules --loader ts-node/esm ...（见 README）
 * 推荐直接用 tsx：SETX HTTPS_PROXY=http://127.0.0.1:7897 && npx tsx scripts/bench/measure.ts
 * 凭证从环境变量注入，脚本只读 process.env，不写任何敏感值到 stdout。
 */
import { initializeSearchers } from '../../src/mcp/searchers.js';
import { aggregateSearch } from '../../src/services/AggregateSearch.js';
import { OASource } from '../../src/services/OASource.js';
import type { Searchers } from '../../src/mcp/searchers.js';

const QUERY = 'large language models';
const N = 3; // 每渠道结果数（小，避免限流与超时干扰）

function ts(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<{ label: string; ms: number; ok: boolean; detail: string; value?: T }> {
  const t0 = performance.now();
  try {
    const v = await fn();
    return { label, ms: performance.now() - t0, ok: true, detail: 'ok', value: v };
  } catch (e: any) {
    return { label, ms: performance.now() - t0, ok: false, detail: String(e?.message || e).slice(0, 120) };
  }
}

const searchers: Searchers = initializeSearchers();

// 1) 每个单平台 search 冷启动耗时（含各自内部限流等待）
const platformRows: { label: string; ms: number; ok: boolean; detail: string; count: number }[] = [];
for (const [name, s] of Object.entries(searchers)) {
  const cap = (s as any).getCapabilities?.();
  if (!cap?.search) continue;
  const r = await timed(`${name}`, () => (s as any).search(QUERY, { maxResults: N }));
  const count = r.ok && Array.isArray(r.value) ? (r.value as any[]).length : 0;
  platformRows.push({ label: r.label, ms: r.ms, ok: r.ok, detail: r.ok ? '' : r.detail, count });
}

// 2) 聚合 search_papers(all)：测总耗时（并发），并对比最慢单平台 → 判断串行/并行
const agg = await timed('aggregate(all)', () => aggregateSearch(searchers, QUERY, { maxResults: 5 }));

const maxSingle = Math.max(...platformRows.map((r) => r.ms));
const sumSingle = platformRows.reduce((a, r) => a + r.ms, 0);

console.log('========== 1) 单平台搜索延迟（含内部限流，冷启动） ==========');
for (const r of [...platformRows].sort((a, b) => b.ms - a.ms)) {
  console.log(`  ${r.label.padEnd(18)} ${ts(r.ms).padStart(8)}  ${r.ok ? `${r.count} hits` : `FAIL: ${r.detail}`}`);
}

console.log('\n========== 2) 聚合 vs 单平台（串行/并行判断） ==========');
if (agg.ok) {
  const v = agg.value as any;
  console.log(`  aggregate(all) 总耗时    : ${ts(agg.ms)}  papers=${v.papers.length} sources=[${(v.sourcesHit || []).join(',')}] failures=${(v.failures || []).length}`);
}
console.log(`  最慢单平台耗时     : ${ts(maxSingle)}`);
console.log(`  所有单平台耗时之和 : ${ts(sumSingle)}`);
console.log(`  → 若 聚合 ≈ 最慢单平台 → 真并行；若 聚合 ≈ 各单平台之和 → 串行`);
console.log(`  实测比值 聚合/最慢 = ${(agg.ms / Math.max(1, maxSingle)).toFixed(2)}x，聚合/之和 = ${(agg.ms / Math.max(1, sumSingle)).toFixed(3)}x`);

// 3) get_paper_by_doi 串行轮询各平台取元数据（复现 handleToolCall 的 for 循环串行）
const DOI_SAMPLE = '10.48550/arXiv.1706.03762'; // Attention Is All You Need
console.log('\n========== 3) DOI 元数据跨平台串行 vs 并行 ==========');
const byDoiSerial = await timed('by_doi serial(for 循环，模拟现状)', async () => {
  const list: string[] = [];
  for (const [name, s] of Object.entries(searchers)) {
    if (['wos', 'scholar', 'scihub'].includes(name)) continue;
    try {
      const p = await (s as any).getPaperByDoi?.(DOI_SAMPLE);
      if (p) list.push(name);
    } catch { /* 平台级隔离 */ }
  }
  return list;
});
const byDoiParallel = await timed('by_doi parallel(Promise.all，潜在改进)', async () => {
  const nameList = Object.entries(searchers)
    .filter(([name]) => !['wos', 'scholar', 'scihub'].includes(name))
    .map(([name, s]) => ({ name, s }));
  const settled = await Promise.allSettled(
    nameList.map(async ({ name, s }) => {
      try { const p = await (s as any).getPaperByDoi?.(DOI_SAMPLE); return p ? name : null; } catch { return null; }
    })
  );
  return settled.map((r, i) => (r.status === 'fulfilled' && r.value ? r.value : null)).filter(Boolean);
});
console.log(`  serial   ${ts(byDoiSerial.ms)}    命中[${(byDoiSerial.value || []).join(',')}]  (现有实现是串行 for 循环)`);
console.log(`  parallel ${ts(byDoiParallel.ms)}    命中[${(byDoiParallel.value || []).join(',')}]  (改进候选: Promise.all)`);
console.log(`  → 串行/并行 差距 = ${(byDoiParallel.ok && byDoiSerial.ok ? byDoiSerial.ms / Math.max(1, byDoiParallel.ms) : 0).toFixed(2)}x`);

// 4) get_pdf 内部元数据定位耗时（downloadPaperPdf 前 findPaperByDoiAcrossPlatforms 串行）
const oa = new OASource();
const oaLoc = await timed('get_pdf→OA 定位(Unpaywall/OpenAlex/EuropePMC)', () => oa.findPdfByDoi(DOI_SAMPLE));
console.log('\n========== 4) PDF 获取定位延迟 ==========');
console.log(`  OA 定位(${DOI_SAMPLE}): ${ts(oaLoc.ms)}  ${oaLoc.ok ? (oaLoc.value ? `url=${(oaLoc.value as any).source || (oaLoc.value as any).url}` : '未命中') : `FAIL ${oaLoc.detail}`}`);

console.log('\n完成。');
