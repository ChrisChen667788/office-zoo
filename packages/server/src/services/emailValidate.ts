/**
 * emailValidate — v6.51 P4 — pure email normalization + validation for the
 * 班味 Wrapped 邮件订阅 flow. No fs / no network, so it's unit-tested
 * directly. Deliberately conservative: we'd rather bounce a weird-but-valid
 * address than store garbage that poisons a future digest send.
 */

/** Trim + lowercase. (We lowercase the whole thing — gmail-style local-part
 *  case sensitivity is technically allowed but practically never used, and
 *  case-folding makes dedupe reliable.) */
export function normalizeEmail(raw: string): string {
  return (raw ?? '').trim().toLowerCase();
}

// Pragmatic single-@ check: non-empty local part, a domain with at least one
// dot, no whitespace, TLD ≥ 2 chars. Not RFC-5322-complete (that regex is a
// monster) — just enough to reject typos and junk before storage.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[^\s@.]{2,}$/;

/** True when `raw` looks like a deliverable address after normalization. */
export function isValidEmail(raw: string): boolean {
  const e = normalizeEmail(raw);
  if (e.length < 6 || e.length > 254) return false; // RFC max 254
  if (e.includes('..')) return false; // no consecutive dots
  return EMAIL_RE.test(e);
}
