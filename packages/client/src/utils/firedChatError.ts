/**
 * firedChatError — v6.169 — 裁了么对话请求失败时给访客看的说明。
 *
 * 服务端对「访客自己能处理」的失败(没配 key / key 被拒 / 欠费 / 限流)回 `{ error, reason }`。
 * 此前前端一律显示「连接服务器失败,请检查后端是否运行」/「发送失败」—— 托管版访客的 key 被拒时
 * 这句话完全误导。现在这几类直接显示服务端给的原因;其它失败保持原文案。
 */
const FIXABLE: ReadonlySet<string> = new Set(['need_key', 'key_rejected', 'quota', 'rate_limited']);

export class FiredChatHttpError extends Error {
  constructor(readonly status: number, readonly detail?: string) {
    super(`HTTP ${status}`);
    this.name = 'FiredChatHttpError';
  }
}

/** 从失败响应里取出可以给访客看的原因;不是访客可处理的类别就返回 undefined。 */
export async function firedChatErrorFrom(res: Response): Promise<FiredChatHttpError> {
  const j = (await res.json().catch(() => null)) as { error?: unknown; reason?: unknown } | null;
  const reason = typeof j?.reason === 'string' ? j.reason : '';
  const detail = FIXABLE.has(reason) && typeof j?.error === 'string' ? j.error.slice(0, 120) : undefined;
  return new FiredChatHttpError(res.status, detail);
}

export function firedChatErrorText(err: unknown, fallback: string): string {
  return err instanceof FiredChatHttpError && err.detail ? `${err.detail}。` : fallback;
}
