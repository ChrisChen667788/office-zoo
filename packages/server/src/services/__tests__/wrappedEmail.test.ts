/**
 * v6.51 P4 — pure Wrapped digest email builder.
 */
import { describe, it, expect } from 'vitest';
import { buildWrappedEmail } from '../wrappedEmail';

describe('buildWrappedEmail', () => {
  it('puts score + tier in the subject', () => {
    const { subject } = buildWrappedEmail({ score: 73, tierLabel: '资深打工人', year: 2026 });
    expect(subject).toContain('73/100');
    expect(subject).toContain('资深打工人');
    expect(subject).toContain('2026');
  });

  it('clamps + rounds the score', () => {
    expect(buildWrappedEmail({ score: 130, tierLabel: 'x' }).subject).toContain('100/100');
    expect(buildWrappedEmail({ score: -5, tierLabel: 'x' }).subject).toContain('0/100');
    expect(buildWrappedEmail({ score: 72.6, tierLabel: 'x' }).subject).toContain('73/100');
  });

  it('renders score + tier + cta into the html', () => {
    const { html } = buildWrappedEmail({ score: 60, tierLabel: '稳定输出中', ctaUrl: 'https://x.test/wrapped' });
    expect(html).toContain('60');
    expect(html).toContain('稳定输出中');
    expect(html).toContain('https://x.test/wrapped');
  });

  it('escapes HTML in interpolated values (no injection)', () => {
    const { html } = buildWrappedEmail({ score: 50, tierLabel: '<script>x</script>' });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('omits the year prefix when not provided', () => {
    expect(buildWrappedEmail({ score: 40, tierLabel: 'x' }).subject).toContain('你的 班味 Wrapped');
  });
});
