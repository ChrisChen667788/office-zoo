/**
 * v6.169 — 裁了么对话失败:访客的 key 没配 / 被拒 / 欠费 / 限流时显示真正原因,而不是「检查后端是否运行」。
 */
import { describe, it, expect } from 'vitest';
import { FiredChatHttpError, firedChatErrorFrom, firedChatErrorText } from '../firedChatError';

const resp = (status: number, body: unknown) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

describe('firedChatError', () => {
  it('访客可处理的原因 → 显示服务端说明', async () => {
    const err = await firedChatErrorFrom(resp(503, { error: '你的模型 key 被模型商拒绝了', reason: 'key_rejected' }));
    expect(err).toBeInstanceOf(FiredChatHttpError);
    expect(firedChatErrorText(err, '发送失败,请点击重试。')).toBe('你的模型 key 被模型商拒绝了。');
  });

  it('运营方故障 / 非 JSON / 其它异常 → 保持原兜底文案', async () => {
    const fb = '发送失败,请点击重试。';
    expect(firedChatErrorText(await firedChatErrorFrom(resp(503, { error: 'HR 服务暂时不可用', reason: 'error' })), fb)).toBe(fb);
    expect(firedChatErrorText(await firedChatErrorFrom(resp(502, '<html>bad gateway</html>')), fb)).toBe(fb);
    expect(firedChatErrorText(new TypeError('Failed to fetch'), fb)).toBe(fb);
  });

  it('服务端说明过长时截断,不把整段内容塞进对话框', async () => {
    const err = await firedChatErrorFrom(resp(503, { error: 'x'.repeat(500), reason: 'quota' }));
    expect(err.detail).toHaveLength(120);
  });
});
