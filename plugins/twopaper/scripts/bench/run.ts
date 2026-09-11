/**
 * 加载真实凭证 + 代理，然后运行测量（measure.ts）。
 * 凭证来源：仓库根 ENV/ENV_API.txt（JSON { env: {...} }，gitignored）。
 * 代理：HTTPS_PROXY/HTTP_PROXY（本机 7897），供 GS/SciHub/被墙渠道。
 * 用法：node --experimental-strip-types scripts/bench/run.ts  （或 npx tsx scripts/bench/run.ts）
 */
import * as fs from 'fs';
import * as path from 'path';

// 1) 加载凭证（仅在内存进程 env，不落盘、不打印）
const envPath = path.resolve(process.cwd(), '../../ENV/ENV_API.txt');
if (fs.existsSync(envPath)) {
  try {
    const obj = JSON.parse(fs.readFileSync(envPath, 'utf8'));
    for (const [k, v] of Object.entries(obj.env || {})) {
      if (typeof v === 'string' && !(k in process.env)) process.env[k] = v;
    }
  } catch (e) {
    console.error('WARN: 未能解析 ENV/ENV_API.txt:', (e as Error).message);
  }
} else {
  console.error('WARN: 未找到 ENV/ENV_API.txt（凭证缺失，部分付费渠道会失败）');
}

// 2) 代理（可被 HOST 上已存在变量覆盖：HTTP(S)_PROXY 可自定义）
if (!process.env.HTTPS_PROXY) process.env.HTTPS_PROXY = 'http://127.0.0.1:7897';
if (!process.env.HTTP_PROXY) process.env.HTTP_PROXY = 'http://127.0.0.1:7897';
if (!process.env.SCHOLAR_PROXY) process.env.SCHOLAR_PROXY = 'http://127.0.0.1:7897';
if (!process.env.SCIHUB_PROXY) process.env.SCIHUB_PROXY = 'http://127.0.0.1:7897';

// 3) 再 import 测量主体（env 已就位，searcher constructor 会读到）
await import('./measure.js');
