/**
 * v6.81 — GET /api/talkshow/tts 路由回归(小程序 InnerAudioContext 直链端点)。
 *
 * InnerAudioContext.src 只吃 URL(发不了 POST body / 自定义 header),所以 v6.81 给
 * /tts 挂了 GET 变体,querystring 传参,与 POST 走同一 respondWithTts。这里 mock 掉
 * generateTTSAudio(不打真 Minimax),锁:query 校验 / audio-mpeg 响应 / 缓存策略
 * (seed 86400 / inline no-store)/ POST-GET 行为一致。
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../services/tts', () => ({
  generateTTSAudio: vi.fn(async () => Buffer.from([0x49, 0x44, 0x33, 0x04])), // 假 mp3 头
}));

import { talkshowRoutes } from '../talkshow';

describe('GET /api/talkshow/tts(小程序直链变体)', () => {
  it('?text=&persona= → 200 audio/mpeg + no-store(inline 文本路径)', async () => {
    const res = await talkshowRoutes.request('/tts?text=' + encodeURIComponent('颗粒度对齐到秃头') + '&persona=yujie');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('audio/mpeg');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf.length).toBeGreaterThan(0);
  });

  it('?scriptId=seed → 200 + 长缓存(public, max-age=86400)', async () => {
    const res = await talkshowRoutes.request('/tts?scriptId=bit-001');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('audio/mpeg');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400');
  });

  it('无参数 → 400(scriptId/text 至少一个)', async () => {
    const res = await talkshowRoutes.request('/tts');
    expect(res.status).toBe(400);
  });

  it('未知 scriptId → 404', async () => {
    const res = await talkshowRoutes.request('/tts?scriptId=bit-does-not-exist');
    expect(res.status).toBe(404);
  });

  it('非法 persona → 400(zod 枚举校验)', async () => {
    const res = await talkshowRoutes.request('/tts?text=hello&persona=alien');
    expect(res.status).toBe(400);
  });

  it('POST 同参行为一致(同一 respondWithTts)', async () => {
    const res = await talkshowRoutes.request('/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scriptId: 'bit-001' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400');
  });
});
