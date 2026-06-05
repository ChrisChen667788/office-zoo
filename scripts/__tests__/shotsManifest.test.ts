/**
 * v6.49 P2 — coverage for the static-route screenshot manifest's
 * file↔URL invariants. A duplicate filename or URL would silently corrupt
 * a `npm run gen:screenshots` run (second shot overwrites the first).
 */
import { describe, it, expect } from 'vitest';
import { SHOTS, validateShots } from '../lib/shotsManifest.mjs';

describe('SHOTS manifest', () => {
  it('the real manifest is valid (no dup files/urls, good format)', () => {
    expect(validateShots(SHOTS)).toEqual([]);
  });

  it('every file is a unique NN-name.png', () => {
    const files = SHOTS.map((s) => s.file);
    expect(new Set(files).size).toBe(files.length);
    for (const f of files) expect(f).toMatch(/^\d{2}-[a-z0-9-]+\.png$/);
  });

  it('every url is a unique absolute path', () => {
    const urls = SHOTS.map((s) => s.url);
    expect(new Set(urls).size).toBe(urls.length);
    for (const u of urls) expect(u.startsWith('/')).toBe(true);
  });
});

describe('validateShots — failure detection', () => {
  it('flags a duplicate filename', () => {
    const bad = [
      { file: '01-a.png', url: '/a', wait: 100 },
      { file: '01-a.png', url: '/b', wait: 100 },
    ];
    expect(validateShots(bad)).toContain('duplicate filename: "01-a.png"');
  });

  it('flags a duplicate url', () => {
    const bad = [
      { file: '01-a.png', url: '/x', wait: 100 },
      { file: '02-b.png', url: '/x', wait: 100 },
    ];
    expect(validateShots(bad)).toContain('duplicate url: "/x"');
  });

  it('flags a bad filename format', () => {
    expect(validateShots([{ file: 'landing.png', url: '/', wait: 100 }]))
      .toContain('bad filename: "landing.png"');
  });

  it('flags a non-absolute url', () => {
    const out = validateShots([{ file: '01-a.png', url: 'a', wait: 100 }]);
    expect(out.some((p) => p.includes('url must start with'))).toBe(true);
  });

  it('flags a non-positive wait', () => {
    const out = validateShots([{ file: '01-a.png', url: '/a', wait: 0 }]);
    expect(out.some((p) => p.includes('wait must be > 0'))).toBe(true);
  });

  it('clean manifest → no problems', () => {
    expect(validateShots([{ file: '01-a.png', url: '/a', wait: 100 }])).toEqual([]);
  });
});
