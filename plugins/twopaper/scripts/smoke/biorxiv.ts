/**
 * bioRxiv/medRxiv 真实连通 smoke 测试。
 * 运行: npx tsx scripts/smoke/biorxiv.ts
 */
import { BioRxivSearcher, MedRxivSearcher } from '../../src/platforms/BioRxivSearcher.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${detail}`);
  if (!ok) failures++;
}

async function main() {
  const biorxiv = new BioRxivSearcher();
  const medrxiv = new MedRxivSearcher();
  const query = 'cell';
  let firstBio = undefined as Awaited<ReturnType<typeof biorxiv.search>>[number] | undefined;

  try {
    const started = Date.now();
    const papers = await biorxiv.search(query, { maxResults: 2, days: 30 });
    check('biorxiv.search', papers.length > 0, `found ${papers.length} papers in ${Date.now() - started}ms`);
    firstBio = papers[0];
    if (firstBio) {
      check('biorxiv.search.paperId', !!firstBio.paperId, `paperId=${firstBio.paperId}`);
      check('biorxiv.search.doi', !!firstBio.doi, `doi=${firstBio.doi}`);
    }
  } catch (error) {
    check('biorxiv.search', false, String(error));
  }

  try {
    const papers = await medrxiv.search(query, { maxResults: 2, days: 30 });
    check('medrxiv.search', papers.length > 0, `found ${papers.length} papers`);
  } catch (error) {
    check('medrxiv.search', false, String(error));
  }

  if (firstBio?.doi) {
    try {
      const byDoi = await biorxiv.getPaperByDoi(firstBio.doi);
      check('biorxiv.getPaperByDoi', !!byDoi, byDoi ? `title="${byDoi.title.slice(0, 60)}"` : 'returned null');
    } catch (error) {
      check('biorxiv.getPaperByDoi', false, String(error));
    }

    const smokeDir = path.join('tmp', 'biorxiv-smoke');
    try {
      const filePath = await biorxiv.downloadPdf(firstBio.doi, {
        savePath: smokeDir,
        overwrite: true
      });
      const size = fs.statSync(filePath).size;
      check('biorxiv.downloadPdf', size > 0, `downloaded ${size} bytes`);
    } catch (error) {
      check('biorxiv.downloadPdf', false, String(error));
    } finally {
      fs.rmSync(smokeDir, { recursive: true, force: true });
    }
  } else {
    check('biorxiv.getPaperByDoi', false, 'skipped: search returned no paper');
    check('biorxiv.downloadPdf', false, 'skipped: search returned no paper');
  }

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
