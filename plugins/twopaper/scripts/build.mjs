#!/usr/bin/env node
/**
 * build —— 产出**单文件自包含** MCP server（dist/server.js）。
 *
 * 为什么必须打包：宿主（Claude Code）安装插件时**不会**执行 `npm install`。
 * 而 dist/server.js 依赖 @modelcontextprotocol/sdk 等 11 个运行时包；
 * 不打包的话，全新机器上 `node dist/server.js` 会以
 *   ERR_MODULE_NOT_FOUND: Cannot find package '@modelcontextprotocol/sdk'
 * 直接崩溃 —— MCP 连接根本建立不起来（plugin:<name>:<server> 显示 Failed to connect），
 * 于是"装完再配置凭证"这条路径对用户彻底不可用。
 *
 * esbuild 把全部依赖内联进单个 dist/server.js，产物自包含；
 * 任何装有 Node ≥ 18 的机器都能直接运行，无需 npm、无需联网装包。
 *
 * 输出：dist/server.js（ESM 单文件）。被内联的 CJS 依赖用 createRequire 桥接。
 */
import { build } from 'esbuild';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist', 'server.js');

// ESM 产物里，被内联的 CJS 包会用到 require / __dirname / __filename —— 用 banner 补齐。
const BANNER = [
  "import { createRequire as __cr } from 'module';",
  "import { fileURLToPath as __f } from 'url';",
  "import { dirname as __d } from 'path';",
  'const require = __cr(import.meta.url);',
  'const __filename = __f(import.meta.url);',
  'const __dirname = __d(__filename);'
].join('\n');

rmSync(path.join(ROOT, 'dist'), { recursive: true, force: true });

await build({
  absWorkingDir: ROOT,
  entryPoints: ['src/server.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  minify: true,
  banner: { js: BANNER },
  outfile: OUT,
  legalComments: 'none',
  logLevel: 'info'
});

console.log(`\n✔ Built self-contained ${path.relative(ROOT, OUT)}`);
