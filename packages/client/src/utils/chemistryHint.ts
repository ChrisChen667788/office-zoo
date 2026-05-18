/**
 * chemistryHint — v3.4.0 client-side i18n renderer for SquadRoom
 * chemistry hints.
 *
 * The v3.0.0 squad director analyzer used to emit zh-CN markdown
 * bullets directly. v3.4.0 split that into structured ChemistryHint
 * tags + a server-side renderHintZh() for the LLM prompt + the zh-CN
 * client path. This file is the symmetric en/ja/ko renderer: it
 * switches on hint.type and assembles a locale-appropriate string
 * from i18n DICT entries.
 *
 * Falls back to the server-supplied zh-CN string if the locale is
 * zh-CN OR no structured tag is present (legacy client compatible
 * with pre-v3.4 server).
 */
import type { Locale } from './i18n';
import { t as tFn } from './i18n';

/** Mirror of the server-side ChemistryHint discriminated union. Kept
 *  here rather than imported from @furball/shared because the client
 *  doesn't import server-only modules and we want this file to be a
 *  pure render helper. If the server shape drifts, the
 *  ChemistryHint type lives in shared/data/squad.ts — sync there. */
export type ChemistryHint =
  | { type: 'culture-clash-industry'; industries: [string, string] }
  | { type: 'culture-clash-region';   regions:    [string, string] }
  | { type: 'shared-tribe-region';    region:   string; count: number; total: number }
  | { type: 'shared-tribe-industry';  industry: string; count: number; total: number }
  | { type: 'rival-pair'; archetypeA: string; archetypeB: string; emojiA: string; emojiB: string; nameA: string; nameB: string }
  | { type: 'trait-extreme'; trait: string; traitLabel: string }
  | { type: 'solo-outlier'; archetypeId: string; archetypeName: string; emoji: string; tribeKind: 'region' | 'industry'; tribeValue: string };

/** Render a single ChemistryHint into a localized string.
 *
 *  - locale === 'zh-CN' AND fallbackZh present → return fallbackZh
 *    verbatim (server already did the work, exact same output as
 *    pre-v3.4 clients).
 *  - else → switch on hint.type, assemble from i18n DICT.
 *
 *  Non-zh translations are intentionally compact (chip-friendly)
 *  rather than full sentences — the squad screen has multiple chips
 *  and longer English text doesn't wrap well.
 */
export function renderChemistryHint(
  hint: ChemistryHint,
  locale: Locale,
  fallbackZh?: string,
): string {
  if (locale === 'zh-CN' && fallbackZh) return fallbackZh;

  // tFn is a one-shot lookup — for compose-style assembly we use it
  // multiple times per hint render. Per-key lookup avoids the React
  // re-render plumbing of useT() since this is called in render-pass
  // closures.
  const head = (key: string) => tFn(`chemistry.${key}` as never);
  const regionLabel   = (id: string) => tFn(`chemistry.region.${id}` as never)   || id;
  const industryLabel = (id: string) => tFn(`chemistry.industry.${id}` as never) || id;
  const traitLabel    = (id: string) => tFn(`chemistry.trait.${id}` as never)    || id;

  switch (hint.type) {
    case 'culture-clash-industry': {
      const a = industryLabel(hint.industries[0]);
      const b = industryLabel(hint.industries[1]);
      return `${head('cultureClashIndustry')} — ${a} × ${b}`;
    }
    case 'culture-clash-region': {
      const a = regionLabel(hint.regions[0]);
      const b = regionLabel(hint.regions[1]);
      return `${head('cultureClashRegion')} — ${a} × ${b}`;
    }
    case 'shared-tribe-region':
      return `${head('sharedTribeRegion')} — ${hint.count}/${hint.total} · ${regionLabel(hint.region)}`;
    case 'shared-tribe-industry':
      return `${head('sharedTribeIndustry')} — ${hint.count}/${hint.total} · ${industryLabel(hint.industry)}`;
    case 'rival-pair':
      return `${head('rivalPair')} — ${hint.emojiA}${hint.nameA} × ${hint.emojiB}${hint.nameB}`;
    case 'trait-extreme':
      return `${head('traitExtreme')} — ${traitLabel(hint.trait)}`;
    case 'solo-outlier': {
      const tribe = hint.tribeKind === 'region'
        ? regionLabel(hint.tribeValue)
        : industryLabel(hint.tribeValue);
      return `${head('soloOutlier')} — ${hint.emoji}${hint.archetypeName} (${tribe})`;
    }
  }
}
