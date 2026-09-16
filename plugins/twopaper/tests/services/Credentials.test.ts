/**
 * credentials / setup 测试。
 *
 * 重点覆盖「写进去的 = 读得到的」这条契约：writeCredentials 的落盘路径
 * 必须与 resolveEnvPath 一致，否则用户配完凭证插件仍然读不到。
 * 用 TWOPAPER_ENV_FILE 指到临时文件，避免碰真实插件 .env。
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  collectCredentials,
  missingCredentials,
  writeCredentials,
  WRITABLE_ENV_KEYS
} from '../../src/services/config/credentials.js';
import { resolveEnvPath, loadEnv } from '../../src/utils/env.js';

let tmpDir: string;
let envFile: string;
const touched = ['TWOPAPER_ENV_FILE', 'WOS_API_KEY', 'OA_EMAIL', 'MINERU_TOKEN'];

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twopaper-cred-'));
  envFile = path.join(tmpDir, '.env');
  process.env.TWOPAPER_ENV_FILE = envFile;
});

afterEach(() => {
  for (const k of touched) delete process.env[k];
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('credentials catalog', () => {
  it('reports every catalog entry with the documented fields', () => {
    const entries = collectCredentials();
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(typeof e.env).toBe('string');
      expect(typeof e.required).toBe('boolean');
      expect(e.unlocks.length).toBeGreaterThan(0);
      expect(e.signup.length).toBeGreaterThan(0);
    }
  });

  it('marks a credential configured only when the env value is non-blank', () => {
    process.env.WOS_API_KEY = 'a-real-key';
    expect(collectCredentials().find((e) => e.env === 'WOS_API_KEY')!.configured).toBe(true);

    process.env.WOS_API_KEY = '   ';
    expect(collectCredentials().find((e) => e.env === 'WOS_API_KEY')!.configured).toBe(false);
  });

  it('lists only unconfigured keys in missingCredentials', () => {
    process.env.WOS_API_KEY = 'k';
    const missing = missingCredentials().map((e) => e.env);
    expect(missing).not.toContain('WOS_API_KEY');
    expect(missing).toContain('MINERU_TOKEN');
  });
});

describe('resolveEnvPath', () => {
  it('honours TWOPAPER_ENV_FILE as an absolute path', () => {
    expect(resolveEnvPath()).toBe(path.resolve(envFile));
  });

  it('prefers CLAUDE_PLUGIN_ROOT when no explicit override is set', () => {
    delete process.env.TWOPAPER_ENV_FILE;
    const saved = process.env.CLAUDE_PLUGIN_ROOT;
    process.env.CLAUDE_PLUGIN_ROOT = path.join(tmpDir, 'plugin');
    try {
      expect(resolveEnvPath()).toBe(path.join(tmpDir, 'plugin', '.env'));
    } finally {
      if (saved === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
      else process.env.CLAUDE_PLUGIN_ROOT = saved;
    }
  });
});

describe('loadEnv — 宿主未展开占位符不得挡住插件 .env', () => {
  it('replaces a literal ${VAR} host value with the real value from plugin .env', () => {
    fs.writeFileSync(envFile, 'WOS_API_KEY=real-from-plugin-env\n');
    process.env.WOS_API_KEY = '${WOS_API_KEY}'; // 宿主对缺失 ${VAR} 的透传形态
    loadEnv();
    expect(process.env.WOS_API_KEY).toBe('real-from-plugin-env');
  });

  it('replaces an empty-string host value with the plugin .env value', () => {
    fs.writeFileSync(envFile, 'OA_EMAIL=me@example.com\n');
    process.env.OA_EMAIL = '';
    loadEnv();
    expect(process.env.OA_EMAIL).toBe('me@example.com');
  });

  it('keeps a genuine host-provided value (host wins over .env)', () => {
    fs.writeFileSync(envFile, 'WOS_API_KEY=from-file\n');
    process.env.WOS_API_KEY = 'genuine-host-key';
    loadEnv();
    expect(process.env.WOS_API_KEY).toBe('genuine-host-key');
  });

  it('does not misjudge a real value that merely resembles a placeholder name', () => {
    // 真实 key 通常不带 ${ }，确保只清理"整串就是 ${NAME}"的形态
    process.env.WOS_API_KEY = 'prefix${WOS_API_KEY}suffix';
    loadEnv();
    expect(process.env.WOS_API_KEY).toBe('prefix${WOS_API_KEY}suffix');
    delete process.env.WOS_API_KEY;
  });
});

describe('writeCredentials', () => {
  it('writes to the same path resolveEnvPath reports', () => {
    const { envPath } = writeCredentials({ WOS_API_KEY: 'abc123' });
    expect(envPath).toBe(resolveEnvPath());
    expect(fs.readFileSync(envFile, 'utf8')).toContain('WOS_API_KEY=abc123');
  });

  it('updates an existing key in place instead of appending a duplicate', () => {
    writeCredentials({ WOS_API_KEY: 'first' });
    writeCredentials({ WOS_API_KEY: 'second' });
    const body = fs.readFileSync(envFile, 'utf8');
    expect(body).toContain('WOS_API_KEY=second');
    expect(body).not.toContain('first');
    expect(body.match(/^WOS_API_KEY=/gm)!.length).toBe(1);
  });

  it('preserves unrelated pre-existing lines', () => {
    fs.writeFileSync(envFile, 'SCHOLAR_PROXY=http://127.0.0.1:7890\n');
    writeCredentials({ WOS_API_KEY: 'k' });
    const body = fs.readFileSync(envFile, 'utf8');
    expect(body).toContain('SCHOLAR_PROXY=http://127.0.0.1:7890');
    expect(body).toContain('WOS_API_KEY=k');
  });

  it('ignores keys outside the writable whitelist', () => {
    const { written } = writeCredentials({ EVIL_KEY: 'x', WOS_API_KEY: 'ok' });
    expect(written).toEqual(['WOS_API_KEY']);
    expect(fs.readFileSync(envFile, 'utf8')).not.toContain('EVIL_KEY');
  });

  it('skips blank values rather than writing empty assignments', () => {
    const { written } = writeCredentials({ WOS_API_KEY: '   ' });
    expect(written).toEqual([]);
    expect(fs.existsSync(envFile)).toBe(false);
  });

  it('makes newly written values immediately visible in process.env', () => {
    writeCredentials({ OA_EMAIL: 'me@example.com' });
    expect(process.env.OA_EMAIL).toBe('me@example.com');
    expect(collectCredentials().find((e) => e.env === 'OA_EMAIL')!.configured).toBe(true);
  });

  it('exposes exactly the catalog keys as writable', () => {
    expect(WRITABLE_ENV_KEYS.has('MINERU_TOKEN')).toBe(true);
    expect(WRITABLE_ENV_KEYS.has('NOT_A_KEY')).toBe(false);
  });
});
