/**
 * v6.50 P2 — evidenceParser fuzzy epithet / paraphrase bridge.
 *
 * Covers the new Pass 3 (kind: 'fuzzy'): when a speaker refers to a prior
 * speaker indirectly ("某位说颗粒度的同学") instead of naming them, we mine
 * the descriptor keyword and cite whoever actually said it. The pure
 * keyword miner `extractEpithetKeywords` is tested directly; the bridge is
 * tested through `extractEvidenceRefs`. Pass 1/2 (at_tag/mention) get
 * regression coverage so the new pass doesn't shadow them.
 */
import { describe, it, expect } from 'vitest';
import { extractEpithetKeywords, extractEvidenceRefs } from '../evidenceParser';

describe('extractEpithetKeywords — paraphrase keyword miner', () => {
  it('mines the canonical "某位说颗粒度的同学" → 颗粒度', () => {
    expect(extractEpithetKeywords('我同意某位说颗粒度的同学')).toEqual(['颗粒度']);
  });

  it('handles a 的-ending clause with no role-noun ("刚才那个提对齐的")', () => {
    expect(extractEpithetKeywords('刚才那个提对齐的说得对')).toEqual(['对齐']);
  });

  it('handles a person-opener with no role-noun ("前面有人讲到向下兼容")', () => {
    expect(extractEpithetKeywords('前面有人讲到向下兼容')).toEqual(['向下兼容']);
  });

  it('does not mangle keywords containing risky chars (对齐 survives)', () => {
    // 对/和 are intentionally NOT function words — they live inside real
    // keywords. 对齐 must come out whole.
    expect(extractEpithetKeywords('某个说对齐的同学')).toEqual(['对齐']);
  });

  it('returns [] when there is no indirect reference', () => {
    expect(extractEpithetKeywords('我觉得这个方案挺好的')).toEqual([]);
  });

  it('returns [] for a direct @-mention (no paraphrase)', () => {
    expect(extractEpithetKeywords('@Tony 同学你怎么看')).toEqual([]);
  });

  it('drops over-generic descriptors via stopwords (方案 → [])', () => {
    expect(extractEpithetKeywords('某位说方案的同学')).toEqual([]);
  });

  it('dedupes when the same descriptor appears in two clauses', () => {
    expect(extractEpithetKeywords('某位说颗粒度的同学,刚才提颗粒度的也对')).toEqual([
      '颗粒度',
    ]);
  });

  it('returns [] on empty input', () => {
    expect(extractEpithetKeywords('')).toEqual([]);
  });
});

describe('extractEvidenceRefs — fuzzy bridge (Pass 3)', () => {
  const prior = [
    { playerId: 'p1', playerName: 'Tony', text: '我觉得对齐颗粒度很重要' },
    { playerId: 'p2', playerName: 'Lisa', text: '周末就该好好休息' },
  ];

  it('bridges a paraphrase to the prior speaker who said the keyword', () => {
    const refs = extractEvidenceRefs('我同意某位说颗粒度的同学', 'p3', prior);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ refToPlayerId: 'p1', kind: 'fuzzy' });
  });

  it('does not fuzzy-cite a speaker whose speech lacks the keyword', () => {
    const refs = extractEvidenceRefs('某位说颗粒度的同学', 'p3', [
      { playerId: 'p2', playerName: 'Lisa', text: '周末就该好好休息' },
    ]);
    expect(refs).toEqual([]);
  });

  it('never cites the speaker themselves, even on a keyword match', () => {
    const refs = extractEvidenceRefs('某位说颗粒度的同学', 'p1', prior);
    expect(refs).toEqual([]);
  });

  it('mention (Pass 2) wins over fuzzy for the same player — no double cite', () => {
    const refs = extractEvidenceRefs('Tony 和某位说颗粒度的同学都对', 'p3', prior);
    const p1Refs = refs.filter((r) => r.refToPlayerId === 'p1');
    expect(p1Refs).toHaveLength(1);
    expect(p1Refs[0].kind).toBe('mention'); // not 'fuzzy'
  });

  it('regression: explicit @Name still resolves as at_tag', () => {
    const refs = extractEvidenceRefs('@Tony 我反对', 'p3', prior);
    expect(refs[0]).toMatchObject({ refToPlayerId: 'p1', kind: 'at_tag' });
  });

  it('regression: no indirect reference + no name → no refs', () => {
    expect(extractEvidenceRefs('我先说说我的想法', 'p3', prior)).toEqual([]);
  });
});
