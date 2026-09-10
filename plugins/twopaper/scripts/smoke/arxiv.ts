/**
 * arXiv 真实连通 smoke 测试
 * 直接请求真实 arXiv API,验证搜索 / DOI 查询 / PDF 下载能真实连通。
 * 运行: npx tsx scripts/smoke/arxiv.ts
 *
 * 说明:
 *  - arXiv 无 API key;可选用 ARXIV_MAILTO 提供联系邮箱加入礼貌池。
 *  - 若沙盒无外网,第 1 段断言会 FAIL/抛错 —— 那是环境限制,不代表代码问题。
 */
import * as fs from 'fs';
import { ArxivSearcher } from '../../src/platforms/ArxivSearcher.js';

const mailto = process.env.ARXIV_MAILTO || process.env.CROSSREF_MAILTO || 'smoke@example.com';
function createSearcher(): ArxivSearcher {
  return new ArxivSearcher(mailto);
}

let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${detail}`);
  if (!ok) failures++;
}
function isRateLimited(error: any): boolean {
  return error?.status === 429 || error?.response?.status === 429 || /rate limit|too many requests/i.test(error?.message || '');
}
function checkError(name: string, error: any) {
  if (isRateLimited(error)) {
    console.log(`SKIP  ${name}: arXiv rate limited (429)`);
    return;
  }
  check(name, false, `threw ${error?.message || error}`);
}

// 1. 基础搜索:transformer,2 条
try {
  const t0 = Date.now();
  const papers = await createSearcher().search('transformer', { maxResults: 2 });
  const dt = Date.now() - t0;
  check('search', papers.length > 0, `found ${papers.length} papers in ${dt}ms`);
  const first = papers[0];
  if (first) {
    check('search.paperId', !!first.paperId, `paperId=${first.paperId}`);
    check('search.title', !!first.title, `title="${first.title.slice(0, 60)}"`);
    check('search.source', first.source === 'arxiv', `source=${first.source}`);
    check('search.pdfUrl', !!first.pdfUrl, `pdfUrl=${first.pdfUrl}`);
  }
} catch (e: any) {
  checkError('search', e);
}

// 2. sortBy:'date' 应能正常返回(even older papers not sorted by date)
try {
  const t0 = Date.now();
  const dated = await createSearcher().search('transformer', { maxResults: 2, sortBy: 'date' });
  check('search.sortBy.date', dated.length > 0, `found ${dated.length} papers in ${Date.now() - t0}ms`);
} catch (e: any) {
  checkError('search.sortBy.date', e);
}

// 3. sortBy:'citations'(arXiv 不支持,应回退默认而非抛错)
try {
  const cited = await createSearcher().search('transformer', { maxResults: 2, sortBy: 'citations' });
  check('search.sortBy.citations', cited.length > 0, `fallback ok, found ${cited.length} papers`);
} catch (e: any) {
  checkError('search.sortBy.citations', e);
}

// 4. getPaperByDoi:Attention Is All You Need (arXiv DOI 形式)
try {
  const paper = await createSearcher().getPaperByDoi('10.48550/arXiv.1706.03762');
  check('getPaperByDoi', !!paper, paper ? `title="${paper.title?.slice(0, 60)}"` : 'returned null');
} catch (e: any) {
  checkError('getPaperByDoi', e);
}

// 5. 无效/不存在 ID 应正常返回空或 null(而非崩溃)
try {
  const none = await createSearcher().search('zzzz_nonexistent_qlwzj', { maxResults: 1 });
  check('search.noResult', Array.isArray(none), `no-result reached, items=${none.length}`);
} catch (e: any) {
  checkError('search.noResult', e);
}

// 6. PDF 下载(真实落盘,验证流式写入 + 状态码处理)
try {
  const out = './downloads/.smoke_arxiv';
  const file = await createSearcher().downloadPdf('1706.03762', { savePath: out });
  const exists = fs.existsSync(file);
  const size = exists ? fs.statSync(file).size : 0;
  check('downloadPdf', exists && size > 0, exists ? `${size} bytes -> ${file}` : 'file not written');
  // 清理 smoke 残留
  if (exists) {
    fs.rmSync(file, { force: true });
    fs.rmSync(out, { recursive: true, force: true });
  }
} catch (e: any) {
  checkError('downloadPdf', e);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
