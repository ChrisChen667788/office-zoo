/**
 * billing — v6.51 P3 — client glue for the real Stripe Checkout flow,
 * with a graceful fall-back to the v1.0 demo entitlement.
 *
 * Flow:
 *   1. /premium asks the server `GET /api/billing/config`.
 *   2. If Stripe is configured → POST /checkout, redirect to the hosted
 *      Stripe Checkout page; on return, ?checkout=success triggers a
 *      server status sync that flips the local entitlement (demoMode:false).
 *   3. If NOT configured → startRealCheckout returns false and /premium
 *      opens the existing demo modal (flips a local flag, clearly labeled).
 *
 * The card number is only ever entered on Stripe's hosted page — never here.
 */
import { getUserId } from './userId';
import { setPremium, type PremiumPlan } from './entitlement';

let configuredCache: boolean | null = null;

/** Whether the server has real Stripe wired. Cached after first check. */
export async function isBillingConfigured(): Promise<boolean> {
  if (configuredCache !== null) return configuredCache;
  try {
    const r = await fetch('/api/billing/config');
    const d = (await r.json()) as { configured?: boolean };
    configuredCache = !!d.configured;
  } catch {
    configuredCache = false;
  }
  return configuredCache;
}

/**
 * Kick off a real Stripe Checkout. Returns true if the browser was
 * redirected (caller should stop), false if Stripe isn't configured or the
 * call failed (caller should fall back to the demo flow).
 */
export async function startRealCheckout(plan: PremiumPlan): Promise<boolean> {
  if (!(await isBillingConfigured())) return false;
  try {
    const r = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': getUserId() },
      body: JSON.stringify({ plan, userId: getUserId() }),
    });
    if (!r.ok) return false;
    const d = (await r.json()) as { url?: string };
    if (d.url) {
      window.location.href = d.url; // → Stripe hosted Checkout
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Mirror the server's authoritative billing record into the local
 * entitlement cache. Safe to call anytime — no-ops when offline / not
 * configured. Call on /premium mount and after a success redirect.
 */
export async function syncEntitlementFromServer(): Promise<void> {
  try {
    const r = await fetch(`/api/billing/status?userId=${encodeURIComponent(getUserId())}`, {
      headers: { 'X-User-Id': getUserId() },
    });
    if (!r.ok) return;
    const d = (await r.json()) as { status?: string; plan?: PremiumPlan };
    if (d.status === 'active' && d.plan) {
      setPremium({ plan: d.plan, demoMode: false });
    }
  } catch {
    /* offline / not configured — keep whatever the local cache has */
  }
}
