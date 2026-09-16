import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { beforeEach, afterEach, describe, expect, it } from '@jest/globals';
import AdmZip from 'adm-zip';
import { MinerUClient } from '../../src/services/MinerUClient.js';

function fakeResponse(body: any, ok = true, status = 200, zip?: Buffer): any {
  return {
    ok,
    status,
    json: async () => body,
    arrayBuffer: async () => (zip ? zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) : new ArrayBuffer(0))
  };
}

function makeZip(fullMd: string): Buffer {
  const zip = new AdmZip();
  zip.addFile('full.md', Buffer.from(fullMd, 'utf-8'));
  return zip.toBuffer();
}

describe('MinerUClient', () => {
  let tmp: string;
  let pdfPath: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mineru-'));
    pdfPath = path.join(tmp, 'paper.pdf');
    fs.writeFileSync(pdfPath, '%PDF-1.4 fake');
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('throws when no token configured', async () => {
    const c = new MinerUClient({ token: '', outputDir: tmp, fetchImpl: (async () => fakeResponse({})) as any });
    await expect(c.pdfToMarkdown(pdfPath)).rejects.toThrow(/MINERU_TOKEN/);
  });

  it('runs signed-upload → poll → unzip full.md', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string, init?: any) => {
      calls.push(`${init?.method || 'GET'} ${url}`);
      if (url.includes('/file-urls/batch')) {
        return fakeResponse({ data: { batch_id: 'b1', file_urls: [{ url: 'https://s3.example/upload' }] } });
      }
      if (init?.method === 'PUT') {
        return fakeResponse({}, true);
      }
      if (url.includes('/extract-results/batch/b1')) {
        return fakeResponse({ data: { extract_result: [{ file_name: 'paper.pdf', state: 'done', full_zip_url: 'https://cdn/full.zip' }] } });
      }
      if (url.includes('full.zip')) {
        return fakeResponse({}, true, 200, makeZip('# Full-text\n\nHello world from MinerU.'));
      }
      return fakeResponse({}, false, 404);
    }) as any;

    const c = new MinerUClient({ token: 'tok', outputDir: tmp, fetchImpl });
    const res = await c.pdfToMarkdown(pdfPath);
    expect(res.markdown).toContain('Hello world');
    expect(res.degradedToText).toBe(false);
    expect(calls.some((c2) => c2.includes('PUT'))).toBe(true);
    expect(fs.existsSync(res.cachePath)).toBe(true);
  });

  it('accepts the current file_urls shape (array of URL strings)', async () => {
    // 2026-09 实测 MinerU 返回 data.file_urls = ["<signed url>"]，而非早期的 [{url}]
    const fetchImpl = (async (url: string, init?: any) => {
      if (url.includes('/file-urls/batch')) {
        return fakeResponse({ data: { batch_id: 'b2', file_urls: ['https://s3.example/upload-string'] } });
      }
      if (init?.method === 'PUT') {
        expect(url).toBe('https://s3.example/upload-string'); // 取到真正的上传地址
        return fakeResponse({}, true);
      }
      if (url.includes('/extract-results/batch/b2')) {
        return fakeResponse({ data: { extract_result: [{ file_name: 'paper.pdf', state: 'done', full_zip_url: 'https://cdn/full2.zip' }] } });
      }
      if (url.includes('full2.zip')) {
        return fakeResponse({}, true, 200, makeZip('# String-shape\n\nok'));
      }
      return fakeResponse({}, false, 404);
    }) as any;

    const res = await new MinerUClient({ token: 'tok', outputDir: tmp, fetchImpl }).pdfToMarkdown(pdfPath);
    expect(res.markdown).toContain('String-shape');
  });

  it('writes the markdown next to its pdf and extracts images into that paper folder', async () => {
    const outDir = path.join(tmp, 'twopaper');
    const paperDir = path.join(outDir, 'Vaswani_2017_Attention_Is_All_You_Need_db6d');
    fs.mkdirSync(paperDir, { recursive: true });
    const journalPdf = path.join(paperDir, 'Vaswani_2017_Attention_Is_All_You_Need_db6d.pdf');
    fs.writeFileSync(journalPdf, '%PDF-1.4 fake');

    const zip = new AdmZip();
    zip.addFile('full.md', Buffer.from('# Title\n\n![](images/abc123.jpg)\n', 'utf-8'));
    zip.addFile('images/abc123.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0]));

    const fetchImpl = (async (url: string, init?: any) => {
      if (url.includes('/file-urls/batch')) return fakeResponse({ data: { batch_id: 'b3', file_urls: ['https://s3/u'] } });
      if (init?.method === 'PUT') return fakeResponse({}, true);
      if (url.includes('/extract-results/batch/b3')) return fakeResponse({ data: { extract_result: [{ file_name: path.basename(journalPdf), state: 'done', full_zip_url: 'https://cdn/f3.zip' }] } });
      if (url.includes('f3.zip')) return fakeResponse({}, true, 200, zip.toBuffer());
      return fakeResponse({}, false, 404);
    }) as any;

    const res = await new MinerUClient({ token: 'tok', outputDir: outDir, fetchImpl }).pdfToMarkdown(journalPdf);

    // Markdown 与该论文的 PDF 同目录同名
    expect(res.cachePath).toBe(path.join(paperDir, 'Vaswani_2017_Attention_Is_All_You_Need_db6d.md'));
    expect(fs.existsSync(res.cachePath)).toBe(true);
    // 配图落在该论文文件夹内，与 Markdown 里的 images/abc123.jpg 相对引用对齐
    expect(res.imageCount).toBe(1);
    expect(res.imagesDir).toBe(path.join(paperDir, 'images'));
    expect(fs.existsSync(path.join(paperDir, 'images', 'abc123.jpg'))).toBe(true);
  });
});
