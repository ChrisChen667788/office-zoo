/**
 * i18n — v1.2.0 minimal Chinese ↔ English lookup.
 *
 * Why a hand-rolled `t()` instead of i18next:
 *   - Bundle size matters; i18next + plurals + interpolation is ~20 KB.
 *     A flat `Record<key, Record<locale, string>>` is ~0.5 KB of code.
 *   - We have one app surface (consumer + Premium + B2B chrome) — no
 *     plurals, no date formatting, no RTL. Heavyweight library is
 *     overkill.
 *   - User-generated content (talkshow bits, fired scenarios written
 *     by users) STAYS IN ORIGINAL LANGUAGE. Translation only applies
 *     to product chrome (CTAs, headings, footer copy, etc.) so a
 *     lookup-table is sufficient.
 *
 * Lookup falls back to the key itself (visible in the UI) so unknown
 * keys never show "undefined" — they show the raw key, making missing
 * translations obvious during dev. Production builds should `tsc` clean
 * against the Dict type so this never happens at runtime.
 *
 * Persisted: localStorage `office-zoo.locale`. Defaults to `zh-CN`
 * since that's our home audience; auto-switches to `en-US` only when
 * the user explicitly toggles in the header.
 */

import { useSyncExternalStore } from 'react';

export type Locale = 'zh-CN' | 'en-US';

const STORAGE_KEY = 'office-zoo.locale';

// ─────────────────────────────────────────────────────────────────────
// Dictionary. Add new keys here only — every key MUST have both locales
// or TS will error. UGC content (script bodies, scenario titles written
// by users) is NEVER routed through this — those stay in the language
// they were written in.
// ─────────────────────────────────────────────────────────────────────
const DICT = {
  // Brand + header
  'brand.wordmark':      { 'zh-CN': 'OFFICE ZOO',         'en-US': 'OFFICE ZOO' },
  'brand.tagline':       { 'zh-CN': 'AI 鼠人 24h 营业',   'en-US': 'AI rats clocking in 24/7' },
  'header.howToPlay':    { 'zh-CN': '怎么玩',             'en-US': 'How to play' },
  'header.b2b':          { 'zh-CN': '🏢 B 端',             'en-US': '🏢 Enterprise' },
  'header.premium':      { 'zh-CN': '👑 Premium',          'en-US': '👑 Premium' },
  'header.backHome':     { 'zh-CN': '← 返回首页',         'en-US': '← Back home' },

  // Landing hero
  'landing.hero.title':  { 'zh-CN': 'AI 鼠人陪你演',      'en-US': 'AI rats play you' },
  'landing.hero.sub':    {
    'zh-CN': '4-12 个 AI 在办公室里搞事 · 你是其中之一 · 找到资本家',
    'en-US': '4-12 AI agents conspire in the office · you\'re one of them · find the boss',
  },
  'landing.startGame':   { 'zh-CN': '开局',                'en-US': 'Start game' },

  // Mode cards
  'mode.classic.title':  { 'zh-CN': '经典局',              'en-US': 'Classic' },
  'mode.classic.body':   {
    'zh-CN': '4-12 人开会推理,投票决定谁是资本家',
    'en-US': '4-12 agents meet, deduce, vote out the capitalists',
  },
  'mode.immersive.title':{ 'zh-CN': '沉浸局',              'en-US': 'Immersive' },
  'mode.immersive.body': {
    'zh-CN': 'AI 真人配音 + 写字楼 3D 地图 + 实时碰面',
    'en-US': 'Real-voice TTS + 3D office floor + live encounters',
  },
  'mode.fired.title':    { 'zh-CN': '裁了么',              'en-US': 'You\'re Fired' },
  'mode.fired.body':     {
    'zh-CN': '单挑 HR · 用法律 + 话术争最大赔偿',
    'en-US': 'Solo vs HR · use law + tactics for max severance',
  },
  'mode.talkshow.title': { 'zh-CN': '班味单口',            'en-US': 'Workplace Standup' },
  'mode.talkshow.body':  {
    'zh-CN': 'AI 鼠人替你讲段子 · 30+ 段职场暴论',
    'en-US': 'AI rats deliver standup · 30+ workplace rants',
  },

  // Premium page
  'premium.title':       { 'zh-CN': 'Premium · 班味 Pro',  'en-US': 'Premium · Office Zoo Pro' },
  'premium.subtitle':    {
    'zh-CN': '把"被 HR 优化"这件事玩到极致。海外大厂剧本,真人律师,定制声音,所有局永久回放。',
    'en-US': 'Take "getting layoff-optimized" to the next level. FAANG scenarios, real lawyers, voice clone, unlimited replays.',
  },
  'premium.cta':         { 'zh-CN': '✨ 立即升级 Premium', 'en-US': '✨ Upgrade to Premium' },
  'premium.priceMonth':  { 'zh-CN': '/月',                 'en-US': '/mo' },
  'premium.priceYear':   { 'zh-CN': '/年',                 'en-US': '/yr' },
  'premium.monthLabel':  { 'zh-CN': '月度',                'en-US': 'Monthly' },
  'premium.yearLabel':   { 'zh-CN': '年度',                'en-US': 'Annual' },
  'premium.yearSaving':  { 'zh-CN': '省 35%',              'en-US': 'Save 35%' },
  'premium.activated':   { 'zh-CN': 'Premium 已激活',      'en-US': 'Premium active' },
  'premium.demoTag':     { 'zh-CN': '(Demo)',              'en-US': '(Demo)' },
  'premium.cancelBtn':   { 'zh-CN': '重置为免费用户(debug)','en-US': 'Reset to free tier (debug)' },

  // Common
  'common.loading':      { 'zh-CN': '⏳ 加载中…',          'en-US': '⏳ Loading…' },
  'common.retry':        { 'zh-CN': '↻ 重试',              'en-US': '↻ Retry' },
  'common.cancel':       { 'zh-CN': '取消',                'en-US': 'Cancel' },
  'common.confirm':      { 'zh-CN': '确认',                'en-US': 'Confirm' },
  'common.share':        { 'zh-CN': '🔗 分享',             'en-US': '🔗 Share' },
  'common.copy':         { 'zh-CN': '复制',                'en-US': 'Copy' },
  'common.copied':       { 'zh-CN': '✓ 已复制',            'en-US': '✓ Copied' },

  // Locale picker
  'locale.zh':           { 'zh-CN': '中文',                'en-US': '中文' },
  'locale.en':           { 'zh-CN': 'English',             'en-US': 'English' },
  'locale.switchHint':   { 'zh-CN': '语言',                'en-US': 'Language' },
} as const;

export type DictKey = keyof typeof DICT;

// ─────────────────────────────────────────────────────────────────────
// Singleton state + subscribers (for useSyncExternalStore)
// ─────────────────────────────────────────────────────────────────────
let _locale: Locale = (() => {
  if (typeof window === 'undefined') return 'zh-CN';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'en-US' || raw === 'zh-CN') return raw;
  } catch { /* fall through */ }
  return 'zh-CN';
})();
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getLocale(): Locale {
  return _locale;
}

export function setLocale(next: Locale): void {
  if (_locale === next) return;
  _locale = next;
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
      // Also update <html lang> so screen readers / Chrome translate / SEO
      // see the right language.
      document.documentElement.lang = next;
    }
  } catch { /* private mode is fine */ }
  for (const cb of listeners) cb();
}

/** The lookup. Returns the translated string for `key` in the current
 *  locale; on missing locale it falls back to zh-CN; on missing key it
 *  returns the key itself so the bug is visible in-app. */
export function t(key: DictKey): string {
  const entry = DICT[key];
  if (!entry) return key;
  return entry[_locale] ?? entry['zh-CN'] ?? key;
}

/** React hook — re-renders when the active locale changes. Returns the
 *  same `t` function + the current locale. Use it as:
 *    const { t, locale } = useT();
 *    return <h1>{t('landing.hero.title')}</h1>;
 */
export function useT() {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale);
  return { t, locale };
}
