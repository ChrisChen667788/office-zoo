/**
 * clientStatic — v6.166 — 生产 / 托管时由服务器直接托管前端构建产物(packages/client/dist)。
 *
 * 托管后前端与 API、Socket.IO 同源同端口:不需要单独的静态站点,也不会再有跨域与
 * 「前端生产构建把 Socket 地址写死成 localhost:3101」的问题。
 *   SERVE_CLIENT_DIR 显式指定目录;未指定时 hosted 默认用 packages/client/dist(存在才启用)。
 * 规则:真实文件直接下发(带哈希的 /assets/* 长缓存);没有扩展名的路径回退 index.html(前端路由);
 * /api、/socket.io、/share 下的未知路径不回退,保持 404。
 */
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { isHosted } from './deployProfile';

const DEFAULT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'client', 'dist');

export function clientDistDir(): string | null {
  const configured = process.env.SERVE_CLIENT_DIR?.trim();
  const dir = configured ? path.resolve(configured) : isHosted() ? DEFAULT_DIST : null;
  return dir && fs.existsSync(path.join(dir, 'index.html')) ? dir : null;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.wasm': 'application/wasm',
};

const NO_SPA_FALLBACK = /^\/(api|socket\.io|share)(\/|$)/;

function fileResponse(file: string, cacheControl: string): Response {
  const type = TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  const size = fs.statSync(file).size;
  return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream<Uint8Array>, {
    headers: {
      'Content-Type': type,
      'Content-Length': String(size),
      'Cache-Control': cacheControl,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** 把请求路径映射到 dist 里的文件;越界(..)或不存在返回 null。 */
export function resolveClientFile(dist: string, urlPath: string): string | null {
  let decoded: string;
  try { decoded = decodeURIComponent(urlPath); } catch { return null; }
  if (decoded.includes('\0')) return null;
  const target = path.resolve(dist, '.' + path.posix.normalize('/' + decoded));
  if (target !== dist && !target.startsWith(dist + path.sep)) return null;
  try {
    return fs.statSync(target).isFile() ? target : null;
  } catch {
    return null;
  }
}

/** 返回 null 表示「不归前端管」(交给后面的 404)。 */
export function serveClient(dist: string, urlPath: string): Response | null {
  const file = resolveClientFile(dist, urlPath);
  if (file) {
    const immutable = urlPath.startsWith('/assets/');
    return fileResponse(file, immutable ? 'public, max-age=31536000, immutable' : file.endsWith('.html') ? 'no-cache' : 'public, max-age=300');
  }
  if (NO_SPA_FALLBACK.test(urlPath) || path.extname(urlPath) !== '') return null;
  return fileResponse(path.join(dist, 'index.html'), 'no-cache');
}
