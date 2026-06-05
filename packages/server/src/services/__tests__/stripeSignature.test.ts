/**
 * v6.51 P3 — Stripe webhook signature verification (pure).
 *
 * We generate signatures with the same HMAC the real Stripe does (so a
 * round-trip proves interop), then assert tamper / replay / malformed
 * cases all reject. No live Stripe needed.
 */
import { describe, it, expect } from 'vitest';
import {
  parseStripeSigHeader,
  computeStripeSignature,
  verifyStripeSignature,
} from '../stripeSignature';

const SECRET = 'whsec_test_abc123';
const PAYLOAD = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });
const T = 1_700_000_000;

function header(t: number, payload: string, secret = SECRET): string {
  return `t=${t},v1=${computeStripeSignature(payload, t, secret)}`;
}

describe('parseStripeSigHeader', () => {
  it('parses t + v1', () => {
    expect(parseStripeSigHeader('t=123,v1=abc')).toEqual({ t: 123, v1: ['abc'] });
  });
  it('collects multiple v1 (rotation) and ignores v0', () => {
    const p = parseStripeSigHeader('t=1,v1=aa,v1=bb,v0=cc');
    expect(p).toEqual({ t: 1, v1: ['aa', 'bb'] });
  });
  it('returns null when malformed / missing fields', () => {
    expect(parseStripeSigHeader('')).toBeNull();
    expect(parseStripeSigHeader('v1=abc')).toBeNull(); // no t
    expect(parseStripeSigHeader('t=1')).toBeNull(); // no v1
  });
});

describe('verifyStripeSignature', () => {
  it('accepts a correctly-signed payload within tolerance', () => {
    const res = verifyStripeSignature({
      payload: PAYLOAD, header: header(T, PAYLOAD), secret: SECRET, nowSec: T + 10,
    });
    expect(res.ok).toBe(true);
  });

  it('rejects a tampered payload', () => {
    const res = verifyStripeSignature({
      payload: PAYLOAD + 'x', header: header(T, PAYLOAD), secret: SECRET, nowSec: T + 10,
    });
    expect(res).toEqual({ ok: false, reason: 'signature_mismatch' });
  });

  it('rejects a wrong secret', () => {
    const res = verifyStripeSignature({
      payload: PAYLOAD, header: header(T, PAYLOAD, 'whsec_other'), secret: SECRET, nowSec: T + 10,
    });
    expect(res).toEqual({ ok: false, reason: 'signature_mismatch' });
  });

  it('rejects a replayed (out-of-tolerance) timestamp', () => {
    const res = verifyStripeSignature({
      payload: PAYLOAD, header: header(T, PAYLOAD), secret: SECRET,
      nowSec: T + 10_000, toleranceSec: 300,
    });
    expect(res).toEqual({ ok: false, reason: 'timestamp_out_of_tolerance' });
  });

  it('accepts when one of several v1 candidates matches (rotation)', () => {
    const good = computeStripeSignature(PAYLOAD, T, SECRET);
    const res = verifyStripeSignature({
      payload: PAYLOAD, header: `t=${T},v1=deadbeef,v1=${good}`, secret: SECRET, nowSec: T,
    });
    expect(res.ok).toBe(true);
  });

  it('rejects malformed header + missing secret', () => {
    expect(verifyStripeSignature({ payload: PAYLOAD, header: 'garbage', secret: SECRET, nowSec: T }))
      .toEqual({ ok: false, reason: 'malformed_header' });
    expect(verifyStripeSignature({ payload: PAYLOAD, header: header(T, PAYLOAD), secret: '', nowSec: T }))
      .toEqual({ ok: false, reason: 'no_secret' });
  });
});
