/**
 * v6.169 — Socket.IO 是否与 HTTP 共用端口。
 * 生产构建的前端连「页面所在的地址」,所以页面由本服务器托管时默认必须单端口;
 * 此前本机 SERVE_CLIENT_DIR=… 不带 SINGLE_PORT 时页面在 3100、Socket.IO 在 3101,对局连不上。
 */
import { describe, it, expect } from 'vitest';
import { resolveSinglePort } from '../deployProfile';
import { resolveSocketUrl } from '../../../../client/src/hooks/useSocket';

describe('resolveSinglePort', () => {
  it('没显式指定:托管形态 → 单端口;本机开发(vite 代理、不托管前端)→ 双端口', () => {
    expect(resolveSinglePort(undefined, true, true)).toBe(true);
    expect(resolveSinglePort(undefined, false, false)).toBe(false);
    expect(resolveSinglePort('', false, false)).toBe(false);
  });

  it('本机由服务器托管前端构建产物 → 默认单端口(否则生产构建的前端连不上 Socket.IO)', () => {
    expect(resolveSinglePort(undefined, false, true)).toBe(true);
  });

  it('SINGLE_PORT 显式指定时照办', () => {
    expect(resolveSinglePort('0', true, true)).toBe(false);
    expect(resolveSinglePort('false', false, true)).toBe(false);
    expect(resolveSinglePort('1', false, false)).toBe(true);
    expect(resolveSinglePort(' true ', false, false)).toBe(true);
  });

  it('与前端的取址规则对得上:服务器在 3100 托管生产构建时,前端连的就是 3100', () => {
    const servedBy3100 = { origin: 'http://localhost:3100', port: '3100' };
    expect(resolveSocketUrl(servedBy3100, false)).toBe('http://localhost:3100');
    expect(resolveSinglePort(undefined, false, true)).toBe(true); // 所以 Socket.IO 必须也在 3100
  });
});
