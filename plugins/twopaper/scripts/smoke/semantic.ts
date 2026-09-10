/**
 * Semantic Scholar 真实连通 smoke 测试
 * 直接 request 真实 Semantic Scholar Graph API,验证搜索/DOI查询/详情能真实返回论文。
 * 运行: npx tsx scripts/smoke/semantic.ts
 *
 * 免费层共享 IP 池,极易 429,因此本脚本对 429 做重试并容忍限流:
 *  - 每次调用前 sleep 间隔
 *  - 429/403 时重试若干次,仍失败则标记 SKIP(而非 FAIL)
 * API key 从环境变量读取: SEMANTIC_SCHOLAR_API_KEY(可选,付费层限流更高)
 */
import { SemanticScholarSearcher } from '../../src/platforms/SemanticScholarSearcher.js';

const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY;
const searcher = new SemanticScholarSearcher(apiKey);

const SLEEP_MS = 2000; // 免费层间隔,避免 429
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

let pass = 0;
let fail = 0;
let skip = 0;

function httpStatus(error: any): number | undefined {
  return error?.response?.status ?? error?.status;
}

async function check(name: string, fn: () => Promise<boolean>, detailFn?: () => string) {
  try {
    const ok = await fn();
    if (ok) {
      pass++;
      console.log(`PASS  ${name}: ${detailFn ? detailFn() : 'ok'}`);
    } else {
      fail++;
      console.log(`FAIL  ${name}: ${detailFn ? detailFn() : 'returned unexpected value'}`);
    }
  } catch (e: any) {
    const status = httpStatus(e);
    if (status === 429 || status === 403) {
      skip++;
      console.log(`SKIP  ${name}: rate limited (${status}), tolerated`);
    } else {
      fail++;
      console.log(`FAIL  ${name}: ${e?.message}`);
    }
  }
}

async function attempt<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await withRetry(fn);
  } catch (e: any) {
    const status = httpStatus(e);
    if (status === 429 || status === 403) {
      skip++;
      console.log(`SKIP  ${name}: rate limited (${status}), tolerated`);
      return undefined;
    }
    fail++;
    console.log(`FAIL  ${name}: ${e?.message}`);
    return undefined;
  }
}

async function checkRequest<T>(name: string, fn: () => Promise<T>, checkValue: (value: T) => boolean, detail: (value: T) => string) {
  const value = await attempt(name, fn);
  if (value !== undefined) {
    check(name.replace('.request', ''), async () => checkValue(value), () => detail(value));
  }
}

/** 429 时等待并重试一次的总入口 */
async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastErr: any;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      if (e?.response?.status === 429 || e?.status === 429 || e?.response?.status === 403 || e?.status === 403) {
        await sleep(SLEEP_MS * (i + 1));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

async function main() {
  const apiInfo = apiKey ? 'with API key' : 'NO API key (free tier)';
  console.log(`Semantic Scholar smoke test (${apiInfo})`);

  // 1. 搜索
  const t0 = Date.now();
  const searchResult = await attempt('search.request', () => searcher.search('transformer', { maxResults: 2 }));
  const dt = Date.now() - t0;
  if (searchResult !== undefined) {
    await check('search', async () => searchResult.length > 0, () => `found ${searchResult.length} papers in ${dt}ms`);
  }
  const first = searchResult?.[0];
  if (first) {
    await check('search.paperId', async () => !!first.paperId, () => `paperId=${first.paperId}`);
    await check('search.title', async () => !!first.title, () => `title="${first.title.slice(0, 50)}"`);
    await check('search.source', async () => first.source === 'semantic', () => `source=${first.source}`);
  }

  // 2. 详情查询(用搜索结果里真实存在的 S2 paperId)
  if (first?.paperId) {
    await sleep(SLEEP_MS);
    await checkRequest(
      'getPaperDetails.request',
      () => searcher.getPaperDetails(first.paperId),
      detail => !!detail,
      detail => detail ? `id=${detail.paperId}` : 'returned null'
    );
  }

  // 3. DOI 查询(优先使用搜索结果中的真实 DOI,避免测试 DOI 无 S2 记录)
  const doiToCheck = first?.doi;
  if (doiToCheck) {
    await sleep(SLEEP_MS);
    await checkRequest(
      'getPaperByDoi.request',
      () => searcher.getPaperByDoi(doiToCheck),
      paper => !!paper,
      paper => paper ? `title="${paper.title?.slice(0, 50)}"` : 'returned null'
    );
  } else {
    skip++;
    console.log('SKIP  getPaperByDoi: search result has no DOI');
  }

  // 4. 无效 DOI 应返回 null(而非抛错)
  await sleep(SLEEP_MS);
  const badDoi = await attempt('getPaperByDoi.invalid.request', () => searcher.getPaperByDoi('not-a-doi'));
  if (badDoi !== undefined) {
    await check('getPaperByDoi.invalid', async () => badDoi === null, () => badDoi === null ? 'null as expected' : 'unexpected non-null');
  }

  console.log(`\nRESULT: ${pass} PASS, ${fail} FAIL, ${skip} SKIP`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
