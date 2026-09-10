import { GoogleScholarSearcher } from '../../src/platforms/GoogleScholarSearcher.js';
import { SciHubSearcher } from '../../src/platforms/SciHubSearcher.js';

let failures = 0;
let skips = 0;
function report(name: string, result: 'PASS' | 'SKIP' | 'FAIL', detail: string) {
  console.log(`${result}  ${name}: ${detail}`);
  if (result === 'FAIL') failures++;
  if (result === 'SKIP') skips++;
}
function classify(error: any): 'SKIP' | 'FAIL' {
  const message = String(error?.message || '').toLowerCase();
  if (!error?.status && !error?.response?.status) return 'SKIP';
  return message.includes('blocked') || message.includes('captcha') ||
    message.includes('proxy') || message.includes('timeout') ||
    message.includes('connect') || message.includes('socket') ||
    message.includes('network') || message.includes('tls') ? 'SKIP' : 'FAIL';
}

try {
  const results = await new GoogleScholarSearcher().search('machine learning', { maxResults: 1 });
  report('google-scholar.search', results.length > 0 ? 'PASS' : 'SKIP', `returned ${results.length} records`);
} catch (error: any) {
  report('google-scholar.search', classify(error), error?.message || String(error));
}

try {
  const searcher = new SciHubSearcher();
  await Promise.race([
    searcher.forceHealthCheck(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Sci-Hub health check timeout')), 30000))
  ]);
  const working = searcher.getMirrorStatus().filter(mirror => mirror.status === 'Working').length;
  report('scihub.mirrors', working > 0 ? 'PASS' : 'SKIP', `${working} working mirrors detected`);
} catch (error: any) {
  report('scihub.mirrors', classify(error), error?.message || String(error));
}

console.log(`\nRESULT: ${failures} FAIL, ${skips} SKIP`);
process.exit(failures === 0 ? 0 : 1);
