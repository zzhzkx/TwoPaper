/**
 * PubMed (NCBI E-utilities) 真实连通 smoke 测试
 * 直接调用真实 NCBI E-utilities API,验证搜索/DOI 查询/PMID 查询等核心能力能真实返回论文。
 * 运行: npx tsx scripts/smoke/pubmed.ts
 *
 * 依赖环境变量(可选):
 *   PUBMED_API_KEY — NCBI E-utilities API 密钥(无则走 3 req/s 免费限额)
 *   NCBI_EMAIL     — NCBI 要求的标识邮箱
 */
import { PubMedSearcher } from '../../src/platforms/PubMedSearcher.js';

const apiKey = process.env.PUBMED_API_KEY || undefined;
const searcher = new PubMedSearcher(apiKey);

let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${detail}`);
  if (!ok) failures++;
}

// 1. 基础搜索
try {
  const t0 = Date.now();
  const papers = await searcher.search('transformer', { maxResults: 5 });
  const dt = Date.now() - t0;
  check('search', papers.length > 0, `found ${papers.length} papers in ${dt}ms`);
  const first = papers[0];
  if (first) {
    check('search.paperId', !!first.paperId, `paperId=${first.paperId}`);
    check('search.title', !!first.title, `title="${first.title.slice(0, 50)}"`);
    check('search.source', first.source === 'pubmed', `source=${first.source}`);
  }
} catch (e: any) {
  check('search', false, `threw: ${e.message}`);
}

// 2. 排序 + 结果数限制(search with sortBy date)
try {
  const papers = await searcher.search('transformer', { maxResults: 2, sortBy: 'date' });
  check('search.sortBy.date', papers.length > 0, `found ${papers.length} papers`);
} catch (e: any) {
  check('search.sortBy.date', false, `threw: ${e.message}`);
}

// 3. 已知 DOI 查询(Nature Attention Is All You Need,10.1038/nature14401)
try {
  const byDoi = await searcher.getPaperByDoi('10.1038/nature14401');
  check('getPaperByDoi', !!byDoi, byDoi ? `title="${byDoi.title?.slice(0, 50)}"` : 'returned null');
} catch (e: any) {
  check('getPaperByDoi', false, `threw: ${e.message}`);
}

// 4. 无效 DOI 应返回 null(而非抛错)
try {
  const badDoi = await searcher.getPaperByDoi('10.9999/invalid-doi-test');
  check('getPaperByDoi.invalid', badDoi === null, badDoi === null ? 'null as expected' : 'unexpected non-null');
} catch (e: any) {
  check('getPaperByDoi.invalid', false, `threw: ${e.message}`);
}

// 5. PMID 查询(PMC213 of Nature attention paper)
try {
  const byPmid = await searcher.getPaperByPmid('25643077');
  check('getPaperByPmid', !!byPmid, byPmid ? `paperId=${byPmid.paperId} title="${byPmid.title?.slice(0, 40)}"` : 'returned null');
} catch (e: any) {
  check('getPaperByPmid', false, `threw: ${e.message}`);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
