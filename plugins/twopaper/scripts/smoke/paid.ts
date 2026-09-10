import { SpringerSearcher } from '../../src/platforms/SpringerSearcher.js';
import { ScopusSearcher } from '../../src/platforms/ScopusSearcher.js';
import { WebOfScienceSearcher } from '../../src/platforms/WebOfScienceSearcher.js';
import { ScienceDirectSearcher } from '../../src/platforms/ScienceDirectSearcher.js';
import { WileySearcher } from '../../src/platforms/WileySearcher.js';

let failures = 0;
let skips = 0;
function report(name: string, result: 'PASS' | 'SKIP' | 'FAIL', detail: string) {
  console.log(`${result}  ${name}: ${detail}`);
  if (result === 'FAIL') failures++;
  if (result === 'SKIP') skips++;
}
function status(error: any): number | undefined {
  const direct = error?.response?.status ?? error?.status;
  if (direct) return direct;
  const match = String(error?.message || '').match(/Error \((\d{3})\)/);
  return match ? Number(match[1]) : undefined;
}
async function probe(name: string, fn: () => Promise<unknown>) {
  try {
    const value = await fn();
    report(name, 'PASS', Array.isArray(value) ? `returned ${value.length} records` : 'request succeeded');
  } catch (error: any) {
    const code = status(error);
    if ([401, 403, 404].includes(code || 0)) {
      report(name, 'SKIP', `HTTP ${code}; credential, product, or content access must be checked`);
    } else {
      report(name, 'FAIL', error?.message || String(error));
    }
  }
}

await probe('springer.search', () => new SpringerSearcher(process.env.SPRINGER_API_KEY).search('machine learning', { maxResults: 1 }));
await probe('scopus.search', () => new ScopusSearcher(process.env.ELSEVIER_API_KEY).search('transformer', { maxResults: 1 }));
await probe('wos.search', () => new WebOfScienceSearcher(process.env.WOS_API_KEY).search('TS=(transformer)', { maxResults: 1 }));
await probe('sciencedirect.search', () => new ScienceDirectSearcher(process.env.ELSEVIER_API_KEY).search('deep learning', { maxResults: 1 }));
await probe('wiley.download', () => new WileySearcher(process.env.WILEY_TDM_TOKEN).downloadPdf('10.1002/adma.202300001', { savePath: './downloads_smoke_paid' }));

console.log(`\nRESULT: ${failures} FAIL, ${skips} SKIP`);
process.exit(failures === 0 ? 0 : 1);
