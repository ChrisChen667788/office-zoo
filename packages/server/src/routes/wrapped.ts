/**
 * /api/wrapped — v6.51 P4 — 班味 Wrapped 年终回顾邮件订阅.
 *
 * Captures opt-in emails so the year-end Wrapped recap can be delivered by
 * email (in addition to the in-app card). Scaffold-level: subscribe/store
 * + a pluggable sender that's console-only until RESEND_API_KEY is set.
 * No real email is sent without a provider key.
 *
 * Routes:
 *   POST /api/wrapped/subscribe        {email}        → {ok}            (X-User-Id optional)
 *   POST /api/wrapped/unsubscribe      {email}        → {ok}
 *   GET  /api/wrapped/subscription?email=             → {subscribed}
 *   POST /api/wrapped/send-test        {email,score,tierLabel,year?}     (admin: X-Maker-Token)
 */
import { Hono } from 'hono';
import { isValidEmail, normalizeEmail } from '../services/emailValidate';
import {
  addSubscriber, removeSubscriber, getSubscriber,
} from '../services/subscriberStore';
import { sendEmail, emailConfigured } from '../services/emailSender';
import { buildWrappedEmail } from '../services/wrappedEmail';

export const wrappedRoutes = new Hono();

wrappedRoutes.post('/subscribe', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const raw = typeof body?.email === 'string' ? body.email : '';
  if (!isValidEmail(raw)) return c.json({ error: 'invalid_email' }, 400);
  const userId = c.req.header('x-user-id') || undefined;
  await addSubscriber(normalizeEmail(raw), userId);
  // emailConfigured surfaces to the client whether a real digest will ever
  // actually arrive, so the UI can be honest ("已订阅(发信未配置)").
  return c.json({ ok: true, deliverable: emailConfigured() });
});

wrappedRoutes.post('/unsubscribe', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const raw = typeof body?.email === 'string' ? body.email : '';
  if (!raw) return c.json({ error: 'missing_email' }, 400);
  await removeSubscriber(normalizeEmail(raw));
  return c.json({ ok: true });
});

wrappedRoutes.get('/subscription', async (c) => {
  const email = c.req.query('email');
  if (!email) return c.json({ subscribed: false });
  const sub = await getSubscriber(normalizeEmail(email));
  return c.json({ subscribed: !!sub?.active });
});

/** Admin-only smoke test of the full build→send path. Gated by the same
 *  MAKER_TOKEN the talkshow maker routes use, so it can't be used to spam
 *  via someone's Resend key. */
wrappedRoutes.post('/send-test', async (c) => {
  const adminToken = process.env.MAKER_TOKEN;
  if (!adminToken || c.req.header('x-maker-token') !== adminToken) {
    return c.json({ error: 'forbidden' }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const raw = typeof body?.email === 'string' ? body.email : '';
  if (!isValidEmail(raw)) return c.json({ error: 'invalid_email' }, 400);
  const msg = buildWrappedEmail({
    score: Number(body?.score) || 0,
    tierLabel: typeof body?.tierLabel === 'string' ? body.tierLabel : '打工人',
    year: body?.year ? Number(body.year) : undefined,
    highlight: typeof body?.highlight === 'string' ? body.highlight : undefined,
  });
  const result = await sendEmail({ to: normalizeEmail(raw), subject: msg.subject, html: msg.html });
  return c.json({ ...result, subject: msg.subject });
});
