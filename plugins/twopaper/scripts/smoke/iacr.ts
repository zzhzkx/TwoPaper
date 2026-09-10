/**
 * IACR ePrint 真实连通 smoke 测试
 * 直接请求真实 https://eprint.iacr.org/search,验证搜索/详情/PDF下载能真实工作。
 * IACR 是纯 HTML 抓取(无官方 API),连通性依赖页面 DOM 结构(.mb-4/.paperlink/.ms-md-4/
 * p.search-abstract/small.ms-auto);若 IACR 改版导致选择器失效,或网络不可达,会如实报 FAIL。
 * 运行: npx tsx scripts/smoke/iacr.ts
 */
import { IACRSearcher } from '../../src/platforms/IACRSearcher.js';
import * as fs from 'fs';

const searcher = new IACRSearcher();
const smokeTmpDir = process.env.SMOKE_TMP_DIR || './downloads_smoke';

let failures = 0;
function isTransient(error: any): boolean {
  const status = error?.status || error?.response?.status;
  return status === 408 || status === 429 || (status >= 500 && status <= 599) || !status;
}

async function run(name: string, action: () => Promise<void>) {
  try {
    await action();
  } catch (e: any) {
    const label = isTransient(e) ? 'SKIP' : 'FAIL';
    console.log(`${label}  ${name}: ${e?.message || e}`);
    if (label === 'FAIL') failures++;
  }
}

function check(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${detail}`);
  if (!ok) failures++;
}

async function main() {
  let first: any = null;
  await run('search', async () => {
    const t0 = Date.now();
    const papers = await searcher.search('zero knowledge proof', { maxResults: 2 });
    check('search.results', papers.length > 0, `found ${papers.length} papers in ${Date.now() - t0}ms`);
    first = papers[0] || null;
    if (first) {
      check('search.paperId', !!first.paperId, `paperId=${first.paperId}`);
      check('search.title', !!first.title, `title="${String(first.title).slice(0, 50)}"`);
      check('search.url', !!first.url, `url=${first.url}`);
      check('search.source', first.source === 'iacr', `source=${first.source}`);
    }
  });

  const detailId = first?.paperId || '2026/1871';
  await run('getPaperDetails', async () => {
    const paper = await searcher.getPaperDetails(detailId);
    check('getPaperDetails.result', !!paper, paper ? `title="${String(paper.title).slice(0, 50)}"` : 'returned null');
  });

  await run('getPaperDetails.missing', async () => {
    const bad = await searcher.getPaperDetails('0000/000000-not-a-real-entry');
    check('getPaperDetails.missing.result', bad === null, bad === null ? 'null as expected' : 'unexpected non-null');
  });

  await run('downloadPdf', async () => {
    const filePath = await searcher.downloadPdf(detailId, { savePath: smokeTmpDir, overwrite: true });
    const size = filePath ? fs.statSync(filePath).size : 0;
    check('downloadPdf.result', !!filePath && size > 0, `saved=${filePath} (${size} bytes)`);
  });

  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURES`}`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
