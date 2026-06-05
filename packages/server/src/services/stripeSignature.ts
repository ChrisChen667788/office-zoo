/**
 * stripeSignature — v6.51 P3 — pure Stripe webhook signature verification.
 *
 * Stripe signs each webhook with the `Stripe-Signature` header:
 *   t=<unix-ts>,v1=<hex hmac>[,v1=<hmac>…][,v0=…]
 * where the HMAC-SHA256 is over `${t}.${rawBody}` keyed by the endpoint's
 * webhook secret (whsec_…). We re-implement the check (rather than pull in
 * the `stripe` SDK) so it's a tiny pure function with no network/dep — the
 * rest of the app already talks to upstreams via fetch.
 *
 * Kept dependency-light (only node:crypto) + side-effect-free so it gets
 * real vitest coverage without a live Stripe account.
 */
import crypto from 'node:crypto';

export interface StripeSigParts {
  /** Unix seconds from the `t=` field. */
  t: number;
  /** All `v1=` HMAC candidates (Stripe may send more than one during a
   *  secret rotation). */
  v1: string[];
}

/** Parse a `Stripe-Signature` header into its timestamp + v1 HMACs, or
 *  null if it's malformed / missing the fields we need. */
export function parseStripeSigHeader(header: string): StripeSigParts | null {
  if (!header || typeof header !== 'string') return null;
  let t = NaN;
  const v1: string[] = [];
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (k === 't') t = parseInt(val, 10);
    else if (k === 'v1' && val) v1.push(val);
  }
  if (!Number.isFinite(t) || v1.length === 0) return null;
  return { t, v1 };
}

/** Compute the expected hex HMAC for a given raw body + timestamp + secret. */
export function computeStripeSignature(payload: string, t: number, secret: string): string {
  return crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

/**
 * Verify a Stripe webhook signature. Pure: callers pass `nowSec` in tests
 * for determinism (defaults to wall clock). Mirrors Stripe's own
 * constructEvent checks: timestamp tolerance (replay defense) +
 * constant-time HMAC compare against every v1 candidate.
 */
export function verifyStripeSignature(opts: {
  payload: string;
  header: string;
  secret: string;
  nowSec?: number;
  toleranceSec?: number;
}): VerifyResult {
  const { payload, header, secret } = opts;
  const nowSec = opts.nowSec ?? Math.floor(Date.now() / 1000);
  const toleranceSec = opts.toleranceSec ?? 300;

  if (!secret) return { ok: false, reason: 'no_secret' };
  const parsed = parseStripeSigHeader(header);
  if (!parsed) return { ok: false, reason: 'malformed_header' };
  if (Math.abs(nowSec - parsed.t) > toleranceSec) {
    return { ok: false, reason: 'timestamp_out_of_tolerance' };
  }

  const expected = computeStripeSignature(payload, parsed.t, secret);
  const expBuf = Buffer.from(expected, 'utf8');
  const match = parsed.v1.some((sig) => {
    const sigBuf = Buffer.from(sig, 'utf8');
    return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
  });
  return match ? { ok: true } : { ok: false, reason: 'signature_mismatch' };
}
