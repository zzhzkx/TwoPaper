/**
 * Crossref 真实连通 smoke 测试
 * 直接 requests 真实 Crossref API,验证搜索/DOI 查询/引用拉取能真实返回论文。
 * 运行: npx tsx scripts/smoke/crossref.ts
 */
import { CrossrefSearcher } from '../../src/platforms/CrossrefSearcher.js';

const mailto = process.env.CROSSREF_MAILTO || 'smoke@example.com';
const searcher = new CrossrefSearcher(mailto);

let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${detail}`);
  if (!ok) failures++;
}

// 1. 搜索
const t0 = Date.now();
const papers = await searcher.search('transformer neural networks', { maxResults: 5 });
const dt = Date.now() - t0;
check('search', papers.length > 0, `found ${papers.length} papers in ${dt}ms`);
const first = papers[0];
if (first) {
  check('search.paperId', !!first.paperId, `paperId=${first.paperId}`);
  check('search.title', !!first.title, `title="${first.title.slice(0, 50)}"`);
  check('search.source', first.source === 'crossref', `source=${first.source}`);
}

// 2. DOI 查询
const byDoi = await searcher.getPaperByDoi('10.1016/j.neunet.2023.12.001');
check('getPaperByDoi', !!byDoi, byDoi ? `title="${byDoi.title?.slice(0, 50)}"` : 'returned null');

// 3. 引用拉取(有界并发路径)
const refs = await searcher.getReferences('10.1016/j.neunet.2023.12.001');
check('getReferences', Array.isArray(refs), `got ${refs.length} reference papers`);

// 4. 无效 DOI 应返回 null(而非抛错)
const badDoi = await searcher.getPaperByDoi('10.9999/invalid-doi-test');
check('getPaperByDoi.invalid', badDoi === null, badDoi === null ? 'null as expected' : 'unexpected non-null');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
