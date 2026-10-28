/**
 * v6.169 — 分享出去的 /talkshow?id=… 要能直接打开那一段(此前首屏就把 id 清掉了)。
 */
import { describe, it, expect } from 'vitest';
import { talkshowUrlAction } from '../talkshowDeeplink';

describe('talkshowUrlAction', () => {
  it('首屏打开深链:播放器还没打开 → 不清地址栏的 id(否则加载请求作废)', () => {
    expect(talkshowUrlAction(null, 'bit-004', false)).toBeNull();
  });
  it('播放器打开 / 切到下一段 → 地址栏同步成当前段;已一致则不动', () => {
    expect(talkshowUrlAction('bit-004', null, false)).toEqual({ kind: 'set', id: 'bit-004' });
    expect(talkshowUrlAction('bit-005', 'bit-004', true)).toEqual({ kind: 'set', id: 'bit-005' });
    expect(talkshowUrlAction('bit-004', 'bit-004', true)).toBeNull();
  });
  it('播放器开过又关上 → 清掉 id;本来就没有 id 不动', () => {
    expect(talkshowUrlAction(null, 'bit-004', true)).toEqual({ kind: 'clear' });
    expect(talkshowUrlAction(null, null, true)).toBeNull();
  });
});
