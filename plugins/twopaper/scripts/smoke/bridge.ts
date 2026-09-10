import { BridgesClient } from '../../src/services/BridgesClient.js';

let failures = 0;
let skips = 0;
function report(name: string, result: 'PASS' | 'SKIP' | 'FAIL', detail: string) {
  console.log(`${result}  ${name}: ${detail}`);
  if (result === 'FAIL') failures++;
  if (result === 'SKIP') skips++;
}

const probe = new BridgesClient().probe();
report('bridge.mode', 'PASS', `mode=${probe.mode} configured=${probe.configured} note=${probe.note}`);
if (probe.mode === 'auto') {
  report('bridge.cli', probe.cliReachable ? 'PASS' : 'SKIP', `scansci CLI ${probe.cliReachable ? 'reachable' : 'NOT reachable'}`);
}

console.log(`\nRESULT: ${failures} FAIL, ${skips} SKIP`);
process.exit(failures === 0 ? 0 : 1);
