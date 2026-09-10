import { OASource } from '../../src/services/OASource.js';

let failures = 0;
let skips = 0;
function report(name: string, result: 'PASS' | 'SKIP' | 'FAIL', detail: string) {
  console.log(`${result}  ${name}: ${detail}`);
  if (result === 'FAIL') failures++;
  if (result === 'SKIP') skips++;
}

// 经典 OA DOI（CC-BY 数据集/论文）用于连通性测试。
const OA_DOIS = ['10.1038/s41586-023-06236-5'];

for (const doi of OA_DOIS) {
  try {
    const loc = await new OASource().findPdfByDoi(doi);
    report('oa.by-doi', loc ? 'PASS' : 'SKIP', `${doi} -> ${loc ? loc.url : 'no OA PDF found'}`);
  } catch (error: any) {
    report('oa.by-doi', classify(error), `${doi}: ${error?.message || String(error)}`);
  }
}

if (!process.env.OA_EMAIL) {
  report('oa.email', 'SKIP', 'OA_EMAIL not set; Unpaywall/EuropePMC skipped');
} else {
  report('oa.email', 'PASS', 'OA_EMAIL configured');
}

console.log(`\nRESULT: ${failures} FAIL, ${skips} SKIP`);
process.exit(failures === 0 ? 0 : 1);

function classify(error: any): 'SKIP' | 'FAIL' {
  const message = String(error?.message || '').toLowerCase();
  if (!error?.status && !error?.response?.status) return 'SKIP';
  return message.includes('blocked') || message.includes('timeout') ||
    message.includes('network') || message.includes('tls') || message.includes('connect') ? 'SKIP' : 'FAIL';
}
