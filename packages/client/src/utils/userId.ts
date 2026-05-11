/**
 * userId — pseudonymous per-browser identity for UGC attribution.
 *
 * v0.8.1. Used for one purpose only: powering the "我的创作" filter so a
 * user can find scripts/scenarios they created earlier in the session.
 *
 * NOT a security identity:
 *   - No auth, no signing, no cookie. The id sits in localStorage and is
 *     trivially spoofable. We deliberately avoid using it for anything
 *     that would make spoofing valuable (no privileges, no rate limiting,
 *     no like-attribution).
 *   - Cleared when the user clears site data; that's the whole privacy
 *     escape hatch.
 *   - Not synced across browsers/devices — by design. A real account
 *     system arrives in v0.7.1+ from the original VERSION_PLAN.md.
 *
 * Wire format: 22-char URL-safe random string. Sent as the `X-User-Id`
 * request header on every UGC create call. Server treats it as opaque.
 */

const STORAGE_KEY = 'office-zoo.user-id';

/** Lazily mint + cache the per-browser id. Returns the cached id on every
 *  subsequent call. SSR-safe (no-op + empty string when window is absent). */
let cached: string | null = null;
export function getUserId(): string {
  if (typeof window === 'undefined') return '';
  if (cached) return cached;
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing && existing.length >= 8 && existing.length <= 64) {
      cached = existing;
      return existing;
    }
  } catch {
    // Private mode / disabled storage — synthesize an in-memory id.
    // Won't survive reload but the user just won't see "my creations"
    // for previous sessions; everything else still works.
  }
  const fresh = mint();
  try { window.localStorage.setItem(STORAGE_KEY, fresh); } catch { /* ignore */ }
  cached = fresh;
  return fresh;
}

/** Generate a 22-char URL-safe random string. crypto.randomUUID isn't
 *  available everywhere so we fall back to crypto.getRandomValues. Both
 *  give 128 bits of entropy — way more than we need for collision
 *  avoidance at 1k-user scale. */
function mint(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    // Strip dashes → 32 chars, then take 22 to keep header bytes minimal.
    return crypto.randomUUID().replace(/-/g, '').slice(0, 22);
  }
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return [...bytes].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 22);
  }
  // Last-resort: Math.random — bad entropy, fine for "remember which
  // bits I made in this tab" use case.
  return Math.random().toString(36).slice(2, 24).padEnd(22, '0');
}
