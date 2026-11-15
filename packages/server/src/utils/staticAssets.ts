/**
 * staticAssets — v6.165 — AI 资产的静态下发(图片 + 人设循环视频)。
 *
 * - 按文件头识别真实类型:MiniMax 出的图名为 .png、实为 JPEG,资产包里的立绘也是 JPEG;
 *   信扩展名会给 Safari 错的 Content-Type,图片静默不显示。
 * - 支持 Range 请求:Safari 播 mp4 必须能 206 分段取,否则 <video> 直接放弃。
 * - 流式读取,不把整个视频读进内存。
 */
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { resolveAssetFile, type AssetFamily } from './assetDirs';

export function sniffContentType(buf: Uint8Array): string {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
      && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
  // ISO BMFF(mp4):第 4–7 字节是 'ftyp'
  if (buf.length >= 8 && buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return 'video/mp4';
  return 'application/octet-stream';
}

function readHead(file: string): Uint8Array {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(16);
    const n = fs.readSync(fd, buf, 0, 16, 0);
    return buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}

/** 解析单段 Range(bytes=a-b / bytes=a- / bytes=-n);不合法或越界返回 null(按整文件处理)。 */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | null {
  const m = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null;
  if (!m || (m[1] === '' && m[2] === '') || size === 0) return null;
  let start: number;
  let end: number;
  if (m[1] === '') {
    const suffix = Number(m[2]);
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;
  return { start, end };
}

function streamBody(file: string, opts?: { start: number; end: number }): ReadableStream<Uint8Array> {
  return Readable.toWeb(fs.createReadStream(file, opts)) as ReadableStream<Uint8Array>;
}

export function serveAssetFile(family: AssetFamily, filename: string, rangeHeader?: string): Response {
  const file = resolveAssetFile(family, filename);
  if (!file) {
    return new Response(JSON.stringify({ error: 'not found' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }
  const size = fs.statSync(file).size;
  const type = sniffContentType(readHead(file));
  const base: Record<string, string> = {
    'Content-Type': type,
    'Cache-Control': 'public, max-age=3600',
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
  };
  const range = parseRange(rangeHeader, size);
  if (range) {
    return new Response(streamBody(file, range), {
      status: 206,
      headers: {
        ...base,
        'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
        'Content-Length': String(range.end - range.start + 1),
      },
    });
  }
  return new Response(streamBody(file), { headers: { ...base, 'Content-Length': String(size) } });
}
