#!/usr/bin/env node
/**
 * MCP 客户端计时探针 —— 通过真实 MCP 协议（stdio JSON-RPC）调用 twopaper server。
 *
 * 为什么是 MCP 而不是直接 import dist/*.js：
 *   直接 import 测的是"函数有多快"；走 MCP 测的是"Claude Code 调这个插件到底有多快"，
 *   包含 server 启动、工具分发、超时包装（server.ts 对每次 tools/call 套 60s EXTENDED 超时）的真实开销。
 *
 * 用法：
 *   node scripts/bench/mcp_probe.mjs <target>
 *   target: server | status | <toolName>:<jsonArgs> | list
 *
 * 输出：单行 JSON 到 stdout，字段 { ok, ms, text, parsed, error, tool }
 * 日志走 stderr，避免污染 stdout 的 JSON。
 */

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 解析插件根目录：脚本在 scripts/bench/ 下，往上两级。 */
const PLUGIN_ROOT = resolve(__dirname, '..', '..');

/**
 * 加载密钥。
 * 优先级：进程 env（由 run_matrix.mjs 注入）> ~/.claude/settings.json 的 env 块。
 * 这样探针既能独立跑，也能验证"从 settings.json 读到的值是否真的能打通渠道"。
 */
function loadEnv() {
  const fromProcess = { ...process.env };
  try {
    const settings = JSON.parse(
      readFileSync(resolve(process.env.USERPROFILE || process.env.HOME, '.claude', 'settings.json'), 'utf8')
    );
    return { ...settings.env, ...fromProcess };
  } catch {
    return fromProcess;
  }
}

const ENV = loadEnv();

/** 只透传 twopaper 认识的键，避免把 ANTHROPIC_* 灌进子进程。 */
const PASSTHROUGH = [
  'WOS_API_KEY', 'WOS_API_VERSION', 'PUBMED_API_KEY', 'ELSEVIER_API_KEY',
  'SPRINGER_API_KEY', 'SPRINGER_OPENACCESS_API_KEY', 'WILEY_TDM_TOKEN',
  'SEMANTIC_SCHOLAR_API_KEY', 'OPENALEX_API_KEY', 'MINERU_TOKEN',
  'OA_EMAIL', 'CROSSREF_MAILTO',
  'DOWNLOAD_PER_MINUTE', 'DOWNLOAD_PER_HOUR', 'DOWNLOAD_PER_DAY',
  'GET_PDF_BRIDGE', 'SCHOLAR_PROXY', 'SCIHUB_PROXY',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy',
];

const childEnv = { ...process.env };
for (const k of PASSTHROUGH) {
  if (ENV[k] !== undefined) childEnv[k] = ENV[k];
}

const EXIT_TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS || 90_000);

class McpProbe {
  constructor() {
    this.seq = 0;
    this.pending = new Map();
    this.stderr = [];
  }

  start() {
    const serverPath = resolve(PLUGIN_ROOT, 'dist', 'server.js');
    this.child = spawn(process.execPath, [serverPath], {
      cwd: PLUGIN_ROOT,
      env: childEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let buf = '';
    this.child.stdout.on('data', chunk => {
      buf += chunk.toString('utf8');
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        try {
          this.#onMessage(JSON.parse(line));
        } catch {
          /* 非 JSON 行忽略 */
        }
      }
    });
    this.child.stderr.on('data', c => this.stderr.push(c.toString('utf8')));
    this.child.on('error', e => this.stderr.push(`spawn error: ${e.message}`));
    return this;
  }

  #onMessage(msg) {
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const { resolve: res, timer } = this.pending.get(msg.id);
      clearTimeout(timer);
      this.pending.delete(msg.id);
      res(msg);
    }
  }

  request(method, params) {
    const id = ++this.seq;
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
    return new Promise((res, rej) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rej(new Error(`MCP request '${method}' exceeded ${EXIT_TIMEOUT_MS}ms in probe`));
      }, EXIT_TIMEOUT_MS);
      this.pending.set(id, { resolve: res, timer });
      this.child.stdin.write(payload);
    });
  }

  async initialize() {
    return this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'twopaper-bench-probe', version: '1.0.0' },
    });
  }

  async callTool(name, args) {
    const t0 = performance.now();
    const resp = await this.request('tools/call', { name, arguments: args });
    const ms = performance.now() - t0;

    const c = resp?.result?.content?.[0];
    const text = typeof c?.text === 'string' ? c.text : JSON.stringify(resp?.result ?? resp?.error ?? null);
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* 非 JSON 结果保持 null */ }

    return {
      tool: name,
      ok: !resp?.result?.isError && !resp?.error,
      isError: Boolean(resp?.result?.isError || resp?.error),
      ms: Math.round(ms),
      text,
      parsed,
      stderrTail: this.stderr.join('').slice(-800) || undefined,
    };
  }

  stop() {
    try { this.child?.stdin.end(); } catch { /* 已关闭 */ }
    try { this.child?.kill(); } catch { /* 已退出 */ }
  }
}

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

const target = process.argv[2] || 'status';
const probe = new McpProbe().start();

try {
  const tInit = performance.now();
  await probe.initialize();
  const initMs = Math.round(performance.now() - tInit);

  if (target === 'server') {
    emit({ ok: true, tool: '__initialize__', ms: initMs, text: 'server started + initialized' });
  } else if (target === 'list') {
    const t0 = performance.now();
    const resp = await probe.request('tools/list', {});
    emit({
      ok: true,
      tool: '__tools_list__',
      ms: Math.round(performance.now() - t0),
      text: (resp?.result?.tools || []).map(t => t.name).join(','),
    });
  } else if (target === 'status') {
    emit(await probe.callTool('get_platform_status', { validate: false }));
  } else {
    const sep = target.indexOf(':');
    const name = sep < 0 ? target : target.slice(0, sep);
    const args = sep < 0 ? {} : JSON.parse(target.slice(sep + 1));
    emit(await probe.callTool(name, args));
  }
} catch (err) {
  emit({ ok: false, tool: target, ms: null, error: String(err?.message || err) });
} finally {
  probe.stop();
  // 给子进程一点时间优雅退出；不等待，避免拖慢矩阵跑批
  setTimeout(() => process.exit(0), 50).unref();
}
