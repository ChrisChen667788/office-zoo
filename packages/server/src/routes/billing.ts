/**
 * /api/billing — v6.51 P3 — real Stripe Checkout, test-mode + graceful
 * degrade.
 *
 * Replaces the v1.0 client-only "demo checkout" (which just flipped a
 * localStorage flag) with a real server-driven Stripe Checkout Session +
 * signed webhook. Implemented over Stripe's REST API with fetch (no SDK
 * dep) — matches how the rest of the app talks to upstreams.
 *
 * Safety / config:
 *   - Everything is env-driven. With STRIPE_SECRET_KEY unset (the default
 *     for a fresh clone), /checkout returns 501 and the client keeps using
 *     its demo flow — nothing breaks for users who haven't wired Stripe.
 *   - Use Stripe TEST keys (sk_test_… / whsec_…) until you've gone live.
 *     This code never hardcodes a key and never handles a card number;
 *     the card is entered on Stripe's own hosted Checkout page.
 *
 * Routes:
 *   GET  /api/billing/config            → { configured }
 *   POST /api/billing/checkout          → { url } | 501  (body: {plan,userId})
 *   GET  /api/billing/status?userId=    → BillingRecord  (client mirror)
 *   POST /api/billing/webhook           → 200  (Stripe-signed; updates store)
 */
import { Hono } from 'hono';
import { verifyStripeSignature } from '../services/stripeSignature';
import { getBilling, setBilling, type BillingPlan } from '../services/billingStore';

export const billingRoutes = new Hono();

const SUCCESS_URL = () =>
  process.env.STRIPE_SUCCESS_URL ?? 'http://localhost:5173/premium?checkout=success';
const CANCEL_URL = () =>
  process.env.STRIPE_CANCEL_URL ?? 'http://localhost:5173/premium?checkout=cancel';

function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/** Resolve the Stripe Price id for a plan from env. */
function priceIdForPlan(plan: BillingPlan): string | undefined {
  return plan === 'annual'
    ? process.env.STRIPE_PRICE_ANNUAL
    : process.env.STRIPE_PRICE_MONTHLY;
}

billingRoutes.get('/config', (c) => c.json({ configured: stripeConfigured() }));

billingRoutes.get('/status', async (c) => {
  const userId = c.req.query('userId');
  if (!userId) return c.json({ error: 'missing userId' }, 400);
  const rec = await getBilling(userId);
  return c.json(rec);
});

billingRoutes.post('/checkout', async (c) => {
  if (!stripeConfigured()) {
    // No Stripe wired — tell the client to fall back to its demo flow.
    return c.json({ error: 'stripe_not_configured' }, 501);
  }
  const body = await c.req.json().catch(() => ({}));
  const plan: BillingPlan = body?.plan === 'annual' ? 'annual' : 'monthly';
  const userId: string = typeof body?.userId === 'string' ? body.userId : '';
  if (!userId) return c.json({ error: 'missing userId' }, 400);

  const price = priceIdForPlan(plan);
  if (!price) return c.json({ error: `missing price id for ${plan}` }, 500);

  // Stripe REST: create a subscription Checkout Session (form-encoded).
  const form = new URLSearchParams();
  form.set('mode', 'subscription');
  form.set('line_items[0][price]', price);
  form.set('line_items[0][quantity]', '1');
  form.set('success_url', SUCCESS_URL());
  form.set('cancel_url', CANCEL_URL());
  form.set('client_reference_id', userId);
  form.set('metadata[plan]', plan);
  form.set('metadata[userId]', userId);

  try {
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    const data = (await res.json()) as { url?: string; error?: { message?: string } };
    if (!res.ok || !data.url) {
      return c.json({ error: data.error?.message ?? 'stripe_error' }, 502);
    }
    return c.json({ url: data.url });
  } catch (err) {
    console.error('[billing] checkout session create failed:', err);
    return c.json({ error: 'stripe_unreachable' }, 502);
  }
});

billingRoutes.post('/webhook', async (c) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? '';
  // Raw body is REQUIRED for signature verification — read text, not json.
  const payload = await c.req.text();
  const sig = c.req.header('stripe-signature') ?? '';

  const verdict = verifyStripeSignature({ payload, header: sig, secret });
  if (!verdict.ok) {
    console.warn('[billing] webhook signature rejected:', verdict.reason);
    return c.json({ error: verdict.reason }, 400);
  }

  let event: any;
  try {
    event = JSON.parse(payload);
  } catch {
    return c.json({ error: 'bad_json' }, 400);
  }

  if (event?.type === 'checkout.session.completed') {
    const session = event.data?.object ?? {};
    const userId: string = session.client_reference_id ?? session.metadata?.userId ?? '';
    const plan: BillingPlan = session.metadata?.plan === 'annual' ? 'annual' : 'monthly';
    if (userId) {
      await setBilling(userId, {
        status: 'active',
        plan,
        since: Date.now(),
        stripeCustomerId: session.customer ?? undefined,
        stripeSubscriptionId: session.subscription ?? undefined,
      });
    }
  } else if (event?.type === 'customer.subscription.deleted') {
    const sub = event.data?.object ?? {};
    const userId: string = sub.metadata?.userId ?? '';
    if (userId) {
      const cur = await getBilling(userId);
      await setBilling(userId, { ...cur, status: 'cancelled', since: Date.now() });
    }
  }

  return c.json({ received: true });
});
