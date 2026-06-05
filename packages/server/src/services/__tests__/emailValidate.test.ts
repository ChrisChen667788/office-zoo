/**
 * v6.51 P4 — pure email normalization + validation for Wrapped 邮件订阅.
 */
import { describe, it, expect } from 'vitest';
import { normalizeEmail, isValidEmail } from '../emailValidate';

describe('normalizeEmail', () => {
  it('trims + lowercases', () => {
    expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
  });
  it('tolerates null/undefined', () => {
    expect(normalizeEmail(undefined as unknown as string)).toBe('');
  });
});

describe('isValidEmail', () => {
  it('accepts ordinary addresses', () => {
    for (const e of ['a@b.co', 'user.name@example.com', 'x+tag@sub.domain.io', 'WORK@大厂.com']) {
      expect(isValidEmail(e)).toBe(true);
    }
  });

  it('rejects junk', () => {
    for (const e of ['', 'nope', 'a@b', 'a@@b.com', 'a b@c.com', 'a@b .com', '@b.com', 'a@.com', 'a@b.c']) {
      expect(isValidEmail(e)).toBe(false);
    }
  });

  it('rejects consecutive dots + over-length', () => {
    expect(isValidEmail('a..b@c.com')).toBe(false);
    expect(isValidEmail('x'.repeat(250) + '@example.com')).toBe(false);
  });

  it('is case + whitespace insensitive (normalizes first)', () => {
    expect(isValidEmail('  Hi@Example.COM ')).toBe(true);
  });
});
