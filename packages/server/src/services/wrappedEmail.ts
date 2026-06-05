/**
 * wrappedEmail — v6.51 P4 — pure builder for the 班味 Wrapped digest email
 * (subject + inline-styled HTML). No fs / no network, so it's unit-tested.
 * emailSender delivers whatever this returns.
 */

export interface WrappedEmailInput {
  /** 班味 index 0-100. */
  score: number;
  /** Tier label, e.g. "资深打工人". */
  tierLabel: string;
  /** Recap year (defaults to none in the copy if omitted). */
  year?: number;
  /** Optional one-line headline from the Wrapped recap. */
  highlight?: string;
  /** Link back into the app's Wrapped page. */
  ctaUrl?: string;
}

/** Minimal HTML-escape for values interpolated into the email body. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildWrappedEmail(input: WrappedEmailInput): { subject: string; html: string } {
  const score = Math.max(0, Math.min(100, Math.round(input.score)));
  const tier = esc(input.tierLabel || '打工人');
  const yearBit = input.year ? `${input.year} ` : '';
  const subject = `你的 ${yearBit}班味 Wrapped 出炉:${score}/100 · ${tier}`;
  const cta = input.ctaUrl ? esc(input.ctaUrl) : 'https://github.com/ChrisChen667788/office-zoo';
  const highlight = input.highlight ? `<p style="margin:12px 0 0;color:#c9c4e8;font-size:14px;">${esc(input.highlight)}</p>` : '';

  const html = `<!doctype html><html><body style="margin:0;background:#0a0a1e;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:linear-gradient(135deg,#2D1B69,#0f0c25);border:1px solid rgba(255,184,76,.25);border-radius:20px;padding:28px;color:#fff;">
    <div style="font-size:12px;letter-spacing:.2em;color:#FFD58A;text-transform:uppercase;">📈 OFFICE ZOO · 班味 Wrapped</div>
    <div style="font-size:64px;font-weight:800;margin:12px 0 0;color:#FFD700;">${score}<span style="font-size:20px;color:#9b95c9;"> / 100</span></div>
    <div style="font-size:18px;font-weight:700;margin:4px 0 0;color:#FF4FA3;">${tier}</div>
    ${highlight}
    <a href="${cta}" style="display:inline-block;margin-top:20px;padding:10px 18px;background:#FFD700;color:#0a0a1e;border-radius:999px;font-weight:700;font-size:13px;text-decoration:none;">看完整 Wrapped →</a>
    <p style="margin:20px 0 0;font-size:11px;color:#6b6890;">你订阅了 OFFICE ZOO 班味年终回顾。不想再收?在 Wrapped 页点"取消订阅"。</p>
  </div>
</body></html>`;

  return { subject, html };
}
