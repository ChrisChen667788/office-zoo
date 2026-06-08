/**
 * reactionLine — v6.69 — 拉一句"群众吐槽"(LLM 实时,结合当局上下文)。
 * 失败 / 超时返回 null,调用方退回静态池弹幕(已即时显示),不打扰。
 */
export interface ReactionFetchCtx {
  kind: 'kill' | 'vote';
  victimName: string;
  victimRole?: string;
  victimPersonality?: string;
  byName?: string;
}

export async function fetchReactionLine(ctx: ReactionFetchCtx): Promise<string | null> {
  try {
    const r = await fetch('/api/reaction/line', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ctx),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return typeof d?.line === 'string' && d.line.trim() ? d.line.trim() : null;
  } catch {
    return null;
  }
}
