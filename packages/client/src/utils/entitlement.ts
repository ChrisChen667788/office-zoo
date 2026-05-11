/**
 * entitlement — Premium subscription state, v1.0.0.
 *
 * Single source of truth for "is this user paying". Currently localStorage-
 * only (per-browser, no cross-device sync) since v1.0.0 ships without
 * real auth or real payment processing — the /premium page does a
 * "demo checkout" that flips this flag locally, clearly labeled as a
 * preview of the post-launch payment flow.
 *
 * The architecture is designed so that swapping in real Stripe later is
 * a one-spot change: replace `setPremium(...)` with a call that POSTs
 * the Stripe webhook payload back to a /api/billing/sync endpoint, then
 * mirror the resulting state into localStorage as a cache. The rest of
 * the app code that calls `isPremium()` doesn't need to change.
 *
 * Storage shape:
 *   {
 *     status: 'active' | 'trialing' | 'cancelled' | null,
 *     plan:   'monthly' | 'annual' | null,
 *     since:  unix-ms,
 *     // when not null, the active subscription is a demo (clearly labeled
 *     // in the UI so the user knows it's not a real payment).
 *     demoMode: boolean,
 *   }
 */

const STORAGE_KEY = 'office-zoo.entitlement';

export type PremiumPlan = 'monthly' | 'annual';
export type PremiumStatus = 'active' | 'trialing' | 'cancelled' | null;

export interface Entitlement {
  status: PremiumStatus;
  plan: PremiumPlan | null;
  since: number;
  demoMode: boolean;
}

const EMPTY: Entitlement = {
  status: null, plan: null, since: 0, demoMode: false,
};

let cache: Entitlement | null = null;

function read(): Entitlement {
  if (cache) return cache;
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cache = EMPTY;
      return EMPTY;
    }
    const parsed = JSON.parse(raw) as Partial<Entitlement>;
    cache = {
      status:   parsed.status   ?? null,
      plan:     parsed.plan     ?? null,
      since:    typeof parsed.since === 'number' ? parsed.since : 0,
      demoMode: !!parsed.demoMode,
    };
    return cache;
  } catch {
    cache = EMPTY;
    return EMPTY;
  }
}

function write(next: Entitlement): void {
  cache = next;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    // Notify other tabs + the in-app subscribers via storage event.
    window.dispatchEvent(new CustomEvent('entitlement-change', { detail: next }));
  } catch { /* private mode — accept the silent in-mem-only behavior */ }
}

/** Quick boolean check — true while the subscription is active or
 *  trialing. Used by every gated UI surface. */
export function isPremium(): boolean {
  const e = read();
  return e.status === 'active' || e.status === 'trialing';
}

/** Read the full entitlement record — for the /premium page's
 *  "Currently subscribed (demo)" status panel. */
export function getEntitlement(): Entitlement {
  return read();
}

/** Activate Premium for this browser. Used by the /premium demo
 *  checkout flow. When real Stripe lands, this becomes the cache-update
 *  call after the server confirms the webhook. */
export function setPremium(opts: {
  plan: PremiumPlan;
  /** When true (default), label the subscription as a demo throughout
   *  the UI so users know it's a preview not a real charge. */
  demoMode?: boolean;
}): void {
  write({
    status: 'active',
    plan:   opts.plan,
    since:  Date.now(),
    demoMode: opts.demoMode ?? true,
  });
}

/** Cancel the demo subscription. Real-world this would just mark
 *  cancelled (still active until period end); demo mode flips to null
 *  immediately so users can re-test the upsell flow easily. */
export function clearPremium(): void {
  write(EMPTY);
}

/** React hook for components that need to re-render on entitlement
 *  changes. Subscribes to the custom 'entitlement-change' event +
 *  the cross-tab 'storage' event. */
export function subscribeEntitlement(
  cb: (e: Entitlement) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const onChange = () => cb(read());
  const onStorage = (ev: StorageEvent) => {
    if (ev.key === STORAGE_KEY) {
      cache = null;        // force re-read since another tab wrote
      cb(read());
    }
  };
  window.addEventListener('entitlement-change', onChange as EventListener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener('entitlement-change', onChange as EventListener);
    window.removeEventListener('storage', onStorage);
  };
}
