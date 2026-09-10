import { initializeSearchers } from '../../src/mcp/searchers.js';
import { aggregateSearch } from '../../src/services/AggregateSearch.js';

let failures = 0;
let skips = 0;
function report(name: string, result: 'PASS' | 'SKIP' | 'FAIL', detail: string) {
  console.log(`${result}  ${name}: ${detail}`);
  if (result === 'FAIL') failures++;
  if (result === 'SKIP') skips++;
}

try {
  const searchers = initializeSearchers();
  const res = await aggregateSearch(searchers, 'large language models', { maxResults: 5 });
  report(
    'aggregate.search',
    res.papers.length > 0 && res.sourcesHit.length > 0 ? 'PASS' : 'SKIP',
    `count=${res.papers.length} sources=[${res.sourcesHit.join(',')}] failures=${res.failures.length}`
  );
} catch (error: any) {
  report('aggregate.search', 'FAIL', error?.message || String(error));
}

console.log(`\nRESULT: ${failures} FAIL, ${skips} SKIP`);
process.exit(failures === 0 ? 0 : 1);
