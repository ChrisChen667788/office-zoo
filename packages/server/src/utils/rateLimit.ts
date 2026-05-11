/**
 * rateLimit — tiny in-memory sliding-window limiter, no deps.
 *
 * v0.7.6. Prevents UGC generation spam (LLM cost + content quality risk):
 * by IP, max N requests per windowMs. Uses a Map<key, number[]> of
 * timestamps and a single-pass eviction on each check. Memory cost
 * proportional to active-IPs × N.
 *
 * Limitations (acceptable at our scale):
 *   - Resets on process restart. A malicious actor could exploit this by
 *     timing requests around restarts, but the worst-case is a 2x burst,
 *     not a sustained DoS — fine for v0.7.x.
 *   - In-memory only; doesn't share state across instances. Move to redis
 *     when we run > 1 server replica.
 *   - No leaky-bucket smoothing — pure fixed-window-style. Good enough
 *     for once-an-hour-class limits where bursts are rare anyway.
 *
 * Usage:
 *   const limiter = createRateLimiter({ windowMs: 3600_000, max: 5 });
 *   const r = limiter.check(ip);
 *   if (!r.ok) return c.json({ error: 'rate limited', retryAfterSec: r.retryAfterSec }, 429);
 */

export interface RateLimiterOptions {
  /** Window length in milliseconds. Hits older than this get evicted. */
  windowMs: number;
  /** Max hits per window per key. */
  max: number;
}

export interface RateLimiterCheck {
  ok: boolean;
  /** How many hits the key has in the current window AFTER counting this
   *  request (so 0 means "never seen this key", 1 means "just allowed"). */
  count: number;
  /** When ok=false, seconds until the oldest hit ages out (which is when
   *  the next request would succeed). Caller surfaces in the 429. */
  retryAfterSec: number;
}

export interface RateLimiter {
  check(key: string): RateLimiterCheck;
  /** For tests + admin endpoints — wipe all state. */
  reset(): void;
}

export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const { windowMs, max } = opts;
  const hits = new Map<string, number[]>();

  function check(key: string): RateLimiterCheck {
    const now = Date.now();
    const cutoff = now - windowMs;
    const arr = hits.get(key) ?? [];
    // Evict aged-out hits in place. Most IPs only have a few entries so
    // a forward filter is cheaper than a binary-search splice.
    let i = 0;
    while (i < arr.length && arr[i] <= cutoff) i++;
    const live = i > 0 ? arr.slice(i) : arr;

    if (live.length >= max) {
      const oldest = live[0];
      const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      hits.set(key, live);
      return { ok: false, count: live.length, retryAfterSec };
    }
    live.push(now);
    hits.set(key, live);
    return { ok: true, count: live.length, retryAfterSec: 0 };
  }

  function reset() {
    hits.clear();
  }

  return { check, reset };
}
