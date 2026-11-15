/**
 * v6.166 — 服务器托管前端构建产物:
 *   - 真实文件直接下发,带哈希的 /assets/* 长缓存,index.html 不缓存
 *   - 前端路由(无扩展名)回退 index.html;/api、/socket.io、/share 与缺失的带扩展名文件不回退
 *   - 路径穿越 / 编码穿越 / 空字节一律拒绝
 * 全部在临时目录里做,不碰仓库里的 dist。
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { clientDistDir, resolveClientFile, serveClient } from '../clientStatic';

let dist = '';
beforeAll(() => {
  dist = fs.mkdtempSync(path.join(os.tmpdir(), 'client-dist-'));
  fs.mkdirSync(path.join(dist, 'assets'));
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>zoo</title>');
  fs.writeFileSync(path.join(dist, 'assets', 'index-abc123.js'), 'console.log(1)');
  fs.writeFileSync(path.join(dist, 'icon-512.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  fs.writeFileSync(path.join(os.tmpdir(), 'outside-secret.txt'), 'secret');
});
afterAll(() => {
  fs.rmSync(dist, { recursive: true, force: true });
  fs.rmSync(path.join(os.tmpdir(), 'outside-secret.txt'), { force: true });
});
afterEach(() => { delete process.env.SERVE_CLIENT_DIR; delete process.env.DEPLOY_PROFILE; });

describe('serveClient', () => {
  it('带哈希的产物长缓存;index.html no-cache', async () => {
    const js = serveClient(dist, '/assets/index-abc123.js')!;
    expect(js.status).toBe(200);
    expect(js.headers.get('content-type')).toContain('text/javascript');
    expect(js.headers.get('cache-control')).toContain('immutable');
    expect(await js.text()).toBe('console.log(1)');
    const html = serveClient(dist, '/index.html')!;
    expect(html.headers.get('cache-control')).toBe('no-cache');
  });

  it('前端路由回退 index.html', async () => {
    for (const p of ['/', '/classic/abc', '/fired/chat', '/result/sample-1']) {
      const r = serveClient(dist, p)!;
      expect(r, p).not.toBeNull();
      expect(await r.text()).toContain('<title>zoo</title>');
    }
  });

  it('API / Socket / 分享页与缺失的带扩展名文件不回退(保持 404)', () => {
    for (const p of ['/api/nope', '/socket.io/x', '/share/character/x', '/assets/missing.js', '/missing.png']) {
      expect(serveClient(dist, p), p).toBeNull();
    }
  });

  it('拒绝路径穿越', () => {
    for (const p of ['/../outside-secret.txt', '/%2e%2e/outside-secret.txt', '/assets/..%2f..%2foutside-secret.txt', '/a%00.js', '/%E0%A4%A']) {
      expect(resolveClientFile(dist, p), p).toBeNull();
    }
  });
});

describe('clientDistDir', () => {
  it('local 默认不托管;SERVE_CLIENT_DIR 指向含 index.html 的目录才启用', () => {
    expect(clientDistDir()).toBeNull();
    process.env.SERVE_CLIENT_DIR = dist;
    expect(clientDistDir()).toBe(dist);
    process.env.SERVE_CLIENT_DIR = path.join(dist, 'assets'); // 没有 index.html
    expect(clientDistDir()).toBeNull();
  });
});
