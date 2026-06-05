/**
 * emailSender — v6.51 P4 — pluggable email delivery for Wrapped digests.
 *
 * Provider-agnostic by design. The default sender just logs (so the whole
 * subscribe/digest pipeline works end-to-end in dev with zero credentials),
 * and a fetch-based Resend implementation kicks in automatically once
 * RESEND_API_KEY is set. Swapping providers = one function here; nothing
 * else in the app changes.
 *
 * This module never hardcodes a credential. With no key configured it
 * stays in console mode — no real email is sent.
 */

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
}

export interface SendResult {
  ok: boolean;
  provider: 'console' | 'resend';
  error?: string;
}

const FROM = () => process.env.WRAPPED_FROM_EMAIL ?? 'OFFICE ZOO <wrapped@example.com>';

/** Console sender — the no-credential default. Logs enough to prove the
 *  pipeline ran without leaking the full body into logs. */
async function consoleSend(msg: OutboundEmail): Promise<SendResult> {
  console.log(`[emailSender:console] → ${msg.to} · "${msg.subject}" (${msg.html.length} chars; set RESEND_API_KEY to send for real)`);
  return { ok: true, provider: 'console' };
}

/** Resend REST sender — used automatically when RESEND_API_KEY is set. */
async function resendSend(msg: OutboundEmail): Promise<SendResult> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM(), to: msg.to, subject: msg.subject, html: msg.html }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, provider: 'resend', error: `HTTP ${res.status} ${text.slice(0, 120)}` };
    }
    return { ok: true, provider: 'resend' };
  } catch (err) {
    return { ok: false, provider: 'resend', error: String(err) };
  }
}

/** Whether a real provider is configured (vs console fallback). */
export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

/** Send one email via the configured provider (Resend if keyed, else
 *  console). Never throws — returns a SendResult. */
export async function sendEmail(msg: OutboundEmail): Promise<SendResult> {
  return emailConfigured() ? resendSend(msg) : consoleSend(msg);
}
