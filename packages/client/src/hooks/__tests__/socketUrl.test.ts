/**
 * v6.166 — 生产构建连同源;旧逻辑在生产里写死 http://localhost:3101,托管后必然连不上。
 */
import { describe, it, expect } from 'vitest';
import { resolveSocketUrl } from '../useSocket';

describe('resolveSocketUrl', () => {
  it('生产构建:同源(托管单端口)', () => {
    expect(resolveSocketUrl({ origin: 'https://zoo.example.com', port: '' }, false)).toBe('https://zoo.example.com');
    expect(resolveSocketUrl({ origin: 'http://localhost:8080', port: '8080' }, false)).toBe('http://localhost:8080');
  });
  it('开发:5173 走 vite 代理同源;直开 3100 页面调试回退 3101', () => {
    expect(resolveSocketUrl({ origin: 'http://localhost:5173', port: '5173' }, true)).toBe('http://localhost:5173');
    expect(resolveSocketUrl({ origin: 'http://localhost:3100', port: '3100' }, true)).toBe('http://localhost:3101');
  });
  it('VITE_SOCKET_URL 显式覆盖', () => {
    expect(resolveSocketUrl({ origin: 'https://a.example', port: '' }, false, 'https://ws.example')).toBe('https://ws.example');
  });
});
