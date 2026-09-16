#!/usr/bin/env node
/**
 * 渠道可用性 + 延迟矩阵跑批。
 *
 * 每个目标跑 N 次（默认 3），记录 ms / ok / 结果条数 / 错误类别，输出结构化 JSON。
 *
 * 关键设计：
 *   - 每个样本起一个全新的 server 进程。测的是"冷调用"延迟（Claude Code 每个会话
 *     只起一次 server，但每次 tools/call 都是独立的；冷启动单独由 bootstrap 目标测）。
 *   - 样本之间串行 + 间隔，避免自我限流把延迟数据污染成 429。
 *   - 解析工具返回文本，抽出命中条数，用于判断"这是真结果还是空结果"。
 *
 * 用法：
 *   node scripts/bench/run_matrix.mjs [--runs 3] [--gap 800] [--only arxiv,pubmed]
 *   node scripts/bench/run_matrix.mjs --phase search|pdf|fulltext|all
 */

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..', '..');

function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

const RUNS = Number(argOf('--runs', '3'));
const GAP_MS = Number(argOf('--gap', '800'));
const PHASE = argOf('--phase', 'all');
const ONLY = argOf('--only', '');
const OUT = argOf('--out', resolve(PLUGIN_ROOT, 'docs', 'reports', 'raw', `matrix_${PHASE}.json`));

/** 统一检索词：跨学科、各库都有稳定命中，避免"空结果"被误读成"渠道故障"。 */
const Q = 'transformer attention mechanism';
const Q_BIO = 'CRISPR gene editing';
const Q_CRYPTO = 'lattice based cryptography';
const DOI_ARXIV = '10.48550/arXiv.1706.03762';   // Attention Is All You Need
const DOI_OA = '10.1371/journal.pone.0171226';     // PLOS ONE，确定有合法 OA

const TARGETS = [
  // ---------- 免费 / 无 key 渠道 ----------
  { id: 'crossref',       group: 'search', tool: 'search_crossref',          args: { query: Q, maxResults: 5 } },
  { id: 'arxiv',          group: 'search', tool: 'search_arxiv',             args: { query: Q, maxResults: 5 } },
  { id: 'pubmed',         group: 'search', tool: 'search_pubmed',            args: { query: Q_BIO, maxResults: 5 } },
  { id: 'biorxiv',        group: 'search', tool: 'search_biorxiv',           args: { query: Q_BIO, maxResults: 5, days: 3650 } },
  { id: 'medrxiv',        group: 'search', tool: 'search_medrxiv',           args: { query: Q_BIO, maxResults: 5, days: 3650 } },
  { id: 'semantic',       group: 'search', tool: 'search_semantic_scholar',  args: { query: Q, maxResults: 5 } },
  { id: 'iacr',           group: 'search', tool: 'search_iacr',              args: { query: Q_CRYPTO, maxResults: 5 } },
  { id: 'oa_pdf',         group: 'pdf',    tool: 'get_oa_pdf',               args: { doi: DOI_OA } },

  // ---------- 付费 / 需 key 渠道 ----------
  { id: 'webofscience',   group: 'search', tool: 'search_webofscience',      args: { query: Q, maxResults: 5 } },
  { id: 'scopus',         group: 'search', tool: 'search_scopus',            args: { query: Q, maxResults: 5 } },
  { id: 'sciencedirect',  group: 'search', tool: 'search_sciencedirect',     args: { query: Q, maxResults: 5 } },
  { id: 'springer',       group: 'search', tool: 'search_springer',          args: { query: Q, maxResults: 5 } },

  // ---------- 反爬 / 灰色源（慢是预期，但要量化） ----------
  { id: 'googlescholar',  group: 'search', tool: 'search_google_scholar',    args: { query: Q, maxResults: 5 } },
  { id: 'scihub_mirrors', group: 'search', tool: 'check_scihub_mirrors',     args: {} },
  { id: 'scihub',         group: 'search', tool: 'search_scihub',            args: { doiOrUrl: DOI_ARXIV } },

  // ---------- DOI 元数据 / 引文 ----------
  { id: 'doi_arxiv',      group: 'search', tool: 'get_paper_by_doi',         args: { doi: DOI_ARXIV } },
  { id: 'citations',      group: 'search', tool: 'get_citations',            args: { doi: DOI_ARXIV } },

  // ---------- 聚合 ----------
  { id: 'aggregate_all',  group: 'search', tool: 'search_papers',            args: { query: Q, platform: 'all', maxResults: 10 } },

  // ---------- PDF 落盘（受限流约束，谨慎跑） ----------
  { id: 'pdf_arxiv',      group: 'pdf',    tool: 'get_pdf',                  args: { doi: DOI_ARXIV } },

  // ---------- 状态 / 桥接 ----------
  { id: 'platform_status',group: 'status', tool: 'get_platform_status',      args: { validate: false } },
  { id: 'scansci_status', group: 'status', tool: 'get_scansci_status',       args: {} },
];

/** 从工具返回文本里尽量抽出命中条数，用于区分"真结果"与"空结果"。 */
function extractCount(parsed, text) {
  if (parsed && typeof parsed === 'object') {
    for (const k of ['count', 'total', 'totalCount', 'total_count']) {
      if (typeof parsed[k] === 'number') return parsed[k];
    }
    for (const k of ['results', 'papers', 'items', 'channels', 'mirrors', 'data']) {
      if (Array.isArray(parsed[k])) return parsed[k].length;
    }
  }
  const m = /\bFound\s+(\d+)\b/i.exec(text) || /\b(\d+)\s+(?:results|papers|channels|mirrors)\b/i.exec(text);
  return m ? Number(m[1]) : null;
}

/** 把错误归类，便于统计"失败模式"而不是只记一句原文。 */
function classify(text, ok) {
  if (ok) return 'ok';
  const t = text.toLowerCase();
  if (/unconfigured|not configured|missing.*key|requires_api_key/.test(t)) return 'unconfigured';
  if (/\b429\b|rate limit|too many requests/.test(t)) return 'rate_limited';
  if (/\b401\b|unauthor|invalid.*key|forbidden|\b403\b/.test(t)) return 'auth_failed';
  if (/captcha|blocked|unusual traffic|challenge/.test(t)) return 'anti_bot';
  if (/timed out|timeout|exceeded/.test(t)) return 'timeout';
  if (/not entitled|no access|subscription/.test(t)) return 'not_entitled';
  if (/\b404\b|not found/.test(t)) return 'not_found';
  if (/econnrefused|enotfound|socket hang up|fetch failed|network/.test(t)) return 'network';
  return 'other_error';
}

/** 跑一个样本：起独立进程 → initialize → callTool → 收结果。 */
function sample(target) {
  return new Promise(resolvePromise => {
    const t0 = performance.now();
    const child = spawn(
      process.execPath,
      [resolve(__dirname, 'mcp_probe.mjs'), `${target.tool}:${JSON.stringify(target.args)}`],
      { cwd: PLUGIN_ROOT, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let out = '', err = '';
    child.stdout.on('data', c => (out += c));
    child.stderr.on('data', c => (err += c));
    child.on('close', () => {
      const wallMs = Math.round(performance.now() - t0);
      const lastLine = out.trim().split('\n').filter(Boolean).pop();
      let r = null;
      try { r = JSON.parse(lastLine); } catch { /* 探针自身崩了 */ }
      if (!r) {
        return resolvePromise({
          ok: false, ms: wallMs, toolMs: null, count: null,
          category: 'probe_failed', text: (err || out).slice(-500),
        });
      }
      const count = extractCount(r.parsed, r.text || '');
      resolvePromise({
        ok: Boolean(r.ok),
        ms: wallMs,
        toolMs: r.ms ?? null,
        count,
        category: classify(r.text || r.error || '', r.ok),
        text: (r.text || r.error || '').slice(0, 1200),
      });
    });
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

// ---------------------------------------------------------------- 主流程

const selected = TARGETS.filter(t => {
  if (PHASE !== 'all' && t.group !== PHASE) return false;
  if (ONLY && !ONLY.split(',').map(s => s.trim()).includes(t.id)) return false;
  return true;
});

if (!selected.length) {
  console.error(`没有匹配的目标 (phase=${PHASE}, only=${ONLY})`);
  process.exit(1);
}

console.error(`\n跑批开始：${selected.length} 个目标 × ${RUNS} 次，间隔 ${GAP_MS}ms\n`);

// 冷启动单独测：这是 Claude Code 会话里第一次调用要付的固定成本
console.error('▸ 冷启动基线…');
const bootstrapSamples = [];
for (let i = 0; i < RUNS; i++) {
  const t0 = performance.now();
  await new Promise(res => {
    const c = spawn(process.execPath, [resolve(__dirname, 'mcp_probe.mjs'), 'server'], {
      cwd: PLUGIN_ROOT, stdio: 'ignore',
    });
    c.on('close', res);
  });
  bootstrapSamples.push(Math.round(performance.now() - t0));
  await sleep(200);
}

const results = [];

for (const target of selected) {
  const samples = [];
  for (let i = 0; i < RUNS; i++) {
    process.stderr.write(`  ${target.id} [${i + 1}/${RUNS}] … `);
    const s = await sample(target);
    samples.push(s);
    process.stderr.write(`${s.ms}ms ${s.ok ? 'ok' : s.category}${s.count !== null ? ` n=${s.count}` : ''}\n`);
    if (i < RUNS - 1) await sleep(GAP_MS);
  }

  const oks = samples.filter(s => s.ok);
  const passed = oks.map(s => s.ms);
  results.push({
    id: target.id,
    tool: target.tool,
    group: target.group,
    args: target.args,
    runs: RUNS,
    success: oks.length,
    // 延迟只统计成功样本——把失败的超时混进均值会掩盖真实的成功路径速度
    ms: {
      min: passed.length ? Math.min(...passed) : null,
      median: median(passed),
      max: passed.length ? Math.max(...passed) : null,
      mean: passed.length ? Math.round(passed.reduce((a, b) => a + b, 0) / passed.length) : null,
      all: passed,
    },
    counts: samples.map(s => s.count),
    categories: samples.map(s => s.category),
    sampleText: samples[0]?.text?.slice(0, 600) || '',
  });
  await sleep(GAP_MS);
}

const report = {
  meta: {
    generatedAt: new Date().toISOString(),
    pluginRoot: PLUGIN_ROOT,
    runs: RUNS,
    gapMs: GAP_MS,
    phase: PHASE,
    node: process.version,
    platform: process.platform,
    bootstrap: {
      samples: bootstrapSamples,
      min: Math.min(...bootstrapSamples),
      median: median(bootstrapSamples),
      max: Math.max(...bootstrapSamples),
    },
  },
  results,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');

console.error(`\n✓ 写入 ${OUT}`);
console.error(`冷启动 median=${report.meta.bootstrap.median}ms  min=${report.meta.bootstrap.min}ms`);

// 控制台速览
console.error('\nid                  成功  中位延迟   命中');
for (const r of results) {
  console.error(
    `${r.id.padEnd(20)}${String(r.success + '/' + r.runs).padEnd(6)}` +
    `${String(r.ms.median ?? '-').padStart(7)}ms  ${r.counts.join(',')}`
  );
}
