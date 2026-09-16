/**
 * paths —— 输出根解析。产物应跟随用户当前工作目录，落在 <cwd>/twopaper 下，
 * 而非插件安装目录。这里固化该契约。
 */
import * as path from 'path';
import { describe, it, expect, afterEach } from '@jest/globals';
import { resolveProjectDir, resolveOutputRoot } from '../../src/utils/paths.js';

const touched = ['CLAUDE_PROJECT_DIR', 'TWOPAPER_OUTPUT_DIR'];

afterEach(() => {
  for (const k of touched) delete process.env[k];
});

describe('resolveProjectDir', () => {
  it('prefers CLAUDE_PROJECT_DIR (the user\'s current working dir)', () => {
    process.env.CLAUDE_PROJECT_DIR = path.join('F:', 'some', 'clean', 'project');
    expect(resolveProjectDir()).toBe(path.resolve('F:/some/clean/project'));
  });

  it('falls back to process.cwd() when the host injects nothing', () => {
    expect(resolveProjectDir()).toBe(process.cwd());
  });
});

describe('resolveOutputRoot', () => {
  it('is <projectDir>/twopaper so artifacts follow the working directory', () => {
    process.env.CLAUDE_PROJECT_DIR = path.join('F:', 'clean', 'proj');
    expect(resolveOutputRoot()).toBe(path.join(path.resolve('F:/clean/proj'), 'twopaper'));
  });

  it('honours an explicit TWOPAPER_OUTPUT_DIR override', () => {
    process.env.CLAUDE_PROJECT_DIR = path.join('F:', 'clean', 'proj');
    process.env.TWOPAPER_OUTPUT_DIR = path.join('F:', 'custom', 'out');
    expect(resolveOutputRoot()).toBe(path.resolve('F:/custom/out'));
  });
});
