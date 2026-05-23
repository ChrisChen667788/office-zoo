/**
 * PersonaCard — v6.8 character popover.
 *
 * Wraps a child element (typically a `<span>` of a player's name in a
 * chat list or scoreboard) and shows a popover on hover/focus with the
 * character's epithet + catchphrases + 本局 personality 反差.
 *
 * Design:
 *   - **Epithet line** (固定 IP) — "Excel 永动机 Tony" makes the rat a
 *     recurring character the user can follow across games.
 *   - **本局性格 chip** (本局变量) — surfaces the personality the engine
 *     assigned this game. The mismatch between fixed epithet and
 *     volatile personality IS the joke: when Tony ("Excel 永动机") gets
 *     dealt `introvert` (🐢 社恐), the card highlights that reversal
 *     with a 反差 chip.
 *   - **3 catchphrases** — chip strip below the header, future LLM prompt
 *     hook (planned v6.9) will let these flavour speech generation too.
 *   - **战绩 placeholder** — characterStatsStore is a v6.8.1 follow-up;
 *     until then we show "战绩同步中…" so the slot exists in the layout.
 *
 * Render strategy: portal-less, position: absolute relative to the
 * trigger's parent. The card is 280px wide max, pinned to the bottom
 * of the trigger. Clipping is fine in chat scroll containers — the user
 * can scroll the page to bring it into view. We deliberately keep it
 * mount-on-hover only (no Radix dependency) to stay cheap in a 5-speech
 * scrollable list.
 */

import { useState, useRef, useEffect, ReactNode } from 'react';
import { findCharacter, localizeCharacter, type CharacterCard } from '@furball/shared';
import { useT } from '../../utils/i18n';
import {
  downloadCharacterShareCard,
  copyCharacterShareCard,
  type CharacterShareCardData,
} from '../../utils/characterShareCard';

// v6.8 P5 — lifetime stats returned by GET /api/characters/:name.
// Optional; shows "首次出战" when null. Cache per character name across
// the session (in-memory, 5-min TTL) so re-opening the same popover
// doesn't re-hit the server.
interface LifetimeStats {
  totalGames: number;
  wins: number;
  votedOut: number;
  suspicionsReceived: number;
  personalityCounts: Record<string, number>;
  lastGameId: string;
  lastAt: number;
}

const STATS_CACHE: Map<string, { stats: LifetimeStats | null; fetchedAt: number }> = new Map();
const STATS_TTL_MS = 5 * 60 * 1000;

// v6.10 — minimal local string dict for UI chrome (epithet/catchphrase
// translations live in CHARACTERS.i18n). Keep tiny + colocated; if this
// grows past ~10 keys, promote to packages/client/src/utils/i18n.ts.
const UI_LABELS: Record<string, { 'zh-CN': string; en: string }> = {
  thisGame:       { 'zh-CN': '本局',           en: 'THIS GAME' },
  reversal:       { 'zh-CN': '🔄 反差',         en: '🔄 PLOT TWIST' },
  statsLoading:   { 'zh-CN': '战绩加载中…',     en: 'Loading stats…' },
  rookie:         { 'zh-CN': '🆕 首次出战',    en: '🆕 ROOKIE' },
  notInRoster:    { 'zh-CN': '本鼠人暂未入档', en: 'No dossier on this rat yet' },
  plays:          { 'zh-CN': '上桌',           en: 'PLAYED' },
  winRate:        { 'zh-CN': '胜率',           en: 'WIN' },
  survRate:       { 'zh-CN': '存活',           en: 'SURVIVE' },
  suspicions:     { 'zh-CN': '疑票',           en: 'Suspicions' },
  oftenPlays:     { 'zh-CN': '常演',           en: 'Often' },
  unit:           { 'zh-CN': '局',             en: 'games' },
  votedOut:       { 'zh-CN': '被裁',           en: 'cut' },
  copyImg:        { 'zh-CN': '📤 复制图片',    en: '📤 Copy image' },
  copiedFlash:    { 'zh-CN': '✓ 已复制图片',   en: '✓ Image copied' },
  download:       { 'zh-CN': '📥 下载',        en: '📥 Download' },
  ugcSubmit:      { 'zh-CN': '✍️ 编段子',     en: '✍️ Tag in UGC' },
  ugcSubmitted:   { 'zh-CN': '✓ 已投稿',       en: '✓ Submitted' },
  ugcRateLimit:   { 'zh-CN': '投稿太快 (3/h)',  en: 'Too fast (3/h)' },
  ugcFail:        { 'zh-CN': '✗ 投稿失败',     en: '✗ Submit failed' },
};

// v6.10 P3 — character → talkshow UGC tag mapping. Each rat's epithet
// is dominated by 1 of 9 tag categories; the mapping makes the auto-
// generated UGC submission land in a coherent topic bucket without
// asking the user to pick.
const CHARACTER_TO_UGC_TAG: Record<string, 'overtime' | 'kpi' | 'pua' | 'age' | 'slacking' | 'jargon' | 'hr' | 'boss' | 'meta'> = {
  Tony:  'kpi',       // 数据卷王
  Frank: 'overtime',  // 996 营长
  Grace: 'meta',      // 颗粒度细节控
  Kevin: 'meta',      // 复制粘贴流程
  Helen: 'jargon',    // 灰度术语
  Mike:  'kpi',       // OKR 拆解
  Jack:  'jargon',    // 汇报话术
  Oscar: 'boss',      // 向上管理
  David: 'slacking',  // 摄像头不开
  Amy:   'meta',      // 八卦情报
  Lisa:  'meta',      // 邮件留痕
  Ruby:  'slacking',  // 永远 +1 不出力
};
function tr(key: keyof typeof UI_LABELS, locale: string): string {
  const sub = locale.split('-')[0];
  const entry = UI_LABELS[key];
  if (!entry) return key;
  if (sub === 'en') return entry.en;
  return entry['zh-CN'];
}

// Personality presentation map duplicated here from the bottom-up
// Classic/Immersive copies. A future refactor will lift this into a
// shared client constants module; not the scope of v6.8.
const PERSONALITY_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  social_butterfly:   { label: '社牛',   emoji: '🦋', color: '#FF6B9D' },
  introvert:          { label: '社恐',   emoji: '🐢', color: '#7EC8E3' },
  contrarian:         { label: '杠精',   emoji: '🔨', color: '#FF4444' },
  sycophant:          { label: '舔狗',   emoji: '🐶', color: '#FFB347' },
  passive_aggressive: { label: '阴阳人', emoji: '🌗', color: '#B19CD9' },
  hot_tempered:       { label: '暴躁哥', emoji: '🌋', color: '#FF6347' },
  smooth_operator:    { label: '老狐狸', emoji: '🦊', color: '#DAA520' },
  workaholic:         { label: '卷王',   emoji: '📈', color: '#00CED1' },
};

/**
 * 反差判定: which personality assignments are obviously OFF-brand for
 * each archetype the epithet implies. When the engine deals one of these,
 * we show a "🔄 反差" chip — the punchline of the IP system.
 *
 * Heuristic only; the joke writes itself even without this, but the chip
 * lets users notice it in 2s of hover instead of inferring from context.
 */
const REVERSAL: Record<string, string[]> = {
  // 卷王角色 → 社恐 / 摸鱼气质就是反差
  Tony:  ['introvert', 'passive_aggressive'],
  Frank: ['introvert', 'sycophant'],
  Grace: ['hot_tempered', 'contrarian'],
  // 油条角色 → 暴躁 / 杠精就是反差
  Kevin: ['hot_tempered', 'social_butterfly'],
  Helen: ['hot_tempered', 'contrarian'],
  Mike:  ['social_butterfly', 'introvert'],
  // 表演角色 → 社恐 / 暴躁就是反差
  Jack:  ['introvert', 'hot_tempered'],
  Oscar: ['hot_tempered', 'contrarian'],
  David: ['social_butterfly', 'hot_tempered'],
  // 摸鱼组 → 卷王就是反差
  Amy:   ['workaholic', 'introvert'],
  Lisa:  ['workaholic', 'social_butterfly'],
  Ruby:  ['social_butterfly', 'hot_tempered'],
};

interface Props {
  /** Player's first-name display name. Used to look up the character. */
  playerName: string;
  /** Personality id the engine assigned this game (workaholic / introvert
   *  / etc). Optional — older replays may lack it. */
  personality?: string;
  /** v6.10 P3 — hide the "编段子" UGC submit button. B2bEmbed (enterprise
   *  context) passes true; the C-end community surface shouldn't accept
   *  submissions from inside the customer's white-label iframe. */
  disableUgc?: boolean;
  /** Element the popover hangs off. Typically the speaker's name span. */
  children: ReactNode;
}

export default function PersonaCard({ playerName, personality, disableUgc = false, children }: Props) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false); // click pins so popover stays for inspection
  const [stats, setStats] = useState<LifetimeStats | null | undefined>(undefined); // undefined = loading
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  // v6.8 P5 — fetch lifetime stats on first open. Cached for 5 min per
  // character name so re-opens are instant. Fully fail-safe — a 404 /
  // network error just leaves stats=null which renders "首次出战".
  useEffect(() => {
    if (!open || stats !== undefined) return;
    const cached = STATS_CACHE.get(playerName);
    if (cached && Date.now() - cached.fetchedAt < STATS_TTL_MS) {
      setStats(cached.stats);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/characters/${encodeURIComponent(playerName)}`);
        if (!r.ok) {
          if (!cancelled) {
            setStats(null);
            STATS_CACHE.set(playerName, { stats: null, fetchedAt: Date.now() });
          }
          return;
        }
        const data = await r.json();
        const next = (data?.stats as LifetimeStats | null) ?? null;
        if (!cancelled) {
          setStats(next);
          STATS_CACHE.set(playerName, { stats: next, fetchedAt: Date.now() });
        }
      } catch {
        if (!cancelled) setStats(null);
      }
    })();
    return () => { cancelled = true; };
  }, [open, playerName, stats]);

  // Close pinned popover when clicking outside.
  useEffect(() => {
    if (!pinned) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setPinned(false);
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [pinned]);

  const { locale } = useT();
  const rawCharacter = findCharacter(playerName);
  const character: CharacterCard | null = rawCharacter
    ? localizeCharacter(rawCharacter, locale)
    : null;
  const persona = personality ? PERSONALITY_LABELS[personality] : null;
  const isReversal = character && personality && (REVERSAL[playerName] ?? []).includes(personality);

  return (
    <span
      ref={wrapRef}
      style={{ position: 'relative', display: 'inline-flex', cursor: 'help' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => { if (!pinned) setOpen(false); }}
      onClick={(e) => {
        e.stopPropagation();
        setPinned((p) => !p);
        setOpen(true);
      }}
    >
      {children}
      {open && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 50,
            width: 280,
            padding: '10px 12px',
            borderRadius: 10,
            background: 'linear-gradient(165deg, rgba(20,15,40,0.97) 0%, rgba(45,27,105,0.95) 100%)',
            border: '1px solid rgba(255,215,0,0.32)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,215,0,0.08), 0 0 24px rgba(124,58,237,0.25)',
            color: '#F8F4E3',
            fontSize: 12,
            lineHeight: 1.4,
            pointerEvents: 'auto',
            // Subtle entrance — relies on default browser paint, no
            // framer-motion here to keep the chat list cheap.
            animation: 'pcardIn 140ms ease-out',
          }}
        >
          {character ? (
            <>
              {/* Header — epithet + name + emoji */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 18 }}>{character.emoji}</span>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{
                    fontWeight: 900, fontSize: 13,
                    background: 'linear-gradient(90deg, #FFD700 0%, #FFA947 100%)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    letterSpacing: '-0.01em',
                  }}>{character.epithet}</span>
                  <span style={{ fontSize: 10, color: 'rgba(248,244,227,0.55)', fontWeight: 700, letterSpacing: '0.08em' }}>
                    {character.name.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* 本局性格 chip + 反差 indicator (the joke layer) */}
              {persona && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                    fontSize: 10, padding: '2px 6px', borderRadius: 4,
                    background: `${persona.color}22`, color: persona.color,
                    border: `1px solid ${persona.color}55`, fontWeight: 700,
                  }}>
                    {tr('thisGame', locale)} · {persona.emoji} {persona.label}
                  </span>
                  {isReversal && (
                    <span style={{
                      fontSize: 9, padding: '2px 5px', borderRadius: 4,
                      background: 'rgba(255,79,163,0.18)', color: '#FF4FA3',
                      border: '1px solid rgba(255,79,163,0.45)', fontWeight: 800,
                      letterSpacing: '0.06em',
                    }}>
                      {tr('reversal', locale)}
                    </span>
                  )}
                </div>
              )}

              {/* Catchphrases — chip strip */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                {character.catchphrases.map((q, i) => (
                  <span key={i} style={{
                    fontSize: 10, padding: '2px 6px', borderRadius: 999,
                    background: 'rgba(255,255,255,0.06)',
                    color: 'rgba(248,244,227,0.78)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}>"{q}"</span>
                ))}
              </div>

              {/* Backstory */}
              <div style={{ fontSize: 10.5, color: 'rgba(248,244,227,0.55)', marginBottom: 8, fontStyle: 'italic' }}>
                {character.backstory}
              </div>

              {/* v6.8 P-share — share button row, visible only when card is
                   pinned (click to pin first). Two actions: copy to clipboard
                   (silent, fast) + download PNG fallback. */}
              {pinned && character && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const data: CharacterShareCardData = {
                        name: character.name,
                        epithet: character.epithet,
                        emoji: character.emoji,
                        catchphrases: character.catchphrases,
                        backstory: character.backstory,
                        stats: stats ? {
                          totalGames: stats.totalGames,
                          wins: stats.wins,
                          votedOut: stats.votedOut,
                          suspicionsReceived: stats.suspicionsReceived,
                          favoritePersonality: (() => {
                            const fav = Object.entries(stats.personalityCounts ?? {})
                              .sort((a, b) => b[1] - a[1])[0]?.[0];
                            return fav ? PERSONALITY_LABELS[fav] : undefined;
                          })(),
                        } : null,
                        thisGame: persona ? {
                          personality: persona,
                          isReversal: !!isReversal,
                        } : undefined,
                      };
                      try {
                        await copyCharacterShareCard(data);
                        // Tiny inline feedback — flash the button briefly.
                        const btn = e.currentTarget as HTMLButtonElement;
                        const orig = btn.textContent;
                        btn.textContent = tr('copiedFlash', locale);
                        setTimeout(() => { btn.textContent = orig; }, 1200);
                      } catch {
                        await downloadCharacterShareCard(data);
                      }
                    }}
                    style={{
                      flex: 1, fontSize: 10, padding: '4px 8px', borderRadius: 6,
                      background: 'linear-gradient(135deg, #FFD700 0%, #FFA947 100%)',
                      color: '#1a0d35', fontWeight: 800, cursor: 'pointer',
                      border: 'none', letterSpacing: '0.04em',
                    }}
                  >{tr('copyImg', locale)}</button>
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const data: CharacterShareCardData = {
                        name: character.name,
                        epithet: character.epithet,
                        emoji: character.emoji,
                        catchphrases: character.catchphrases,
                        backstory: character.backstory,
                        stats: stats ? {
                          totalGames: stats.totalGames,
                          wins: stats.wins,
                          votedOut: stats.votedOut,
                          suspicionsReceived: stats.suspicionsReceived,
                          favoritePersonality: (() => {
                            const fav = Object.entries(stats.personalityCounts ?? {})
                              .sort((a, b) => b[1] - a[1])[0]?.[0];
                            return fav ? PERSONALITY_LABELS[fav] : undefined;
                          })(),
                        } : null,
                        thisGame: persona ? {
                          personality: persona,
                          isReversal: !!isReversal,
                        } : undefined,
                      };
                      await downloadCharacterShareCard(data);
                    }}
                    style={{
                      fontSize: 10, padding: '4px 8px', borderRadius: 6,
                      background: 'rgba(255,255,255,0.06)', color: 'rgba(248,244,227,0.78)',
                      fontWeight: 700, cursor: 'pointer',
                      border: '1px solid rgba(255,215,0,0.32)',
                    }}
                  >{tr('download', locale)}</button>
                  {/* v6.10 P3 — UGC submit. Generates a workplace-tagged
                       segment from the character's epithet + catchphrase +
                       backstory (+ stats when present) and POSTs to
                       /api/talkshow/ugc/submit. Hidden when disableUgc=true
                       (B2bEmbed). */}
                  {!disableUgc && (
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const btn = e.currentTarget as HTMLButtonElement;
                        const orig = btn.textContent;
                        // Build the auto-segment. Uses raw character data
                        // (NOT i18n'd) — UGC store is zh-only for now.
                        // Falls back to undefined stats line gracefully.
                        const rawChar = rawCharacter!;
                        const tag = CHARACTER_TO_UGC_TAG[rawChar.name] ?? 'meta';
                        const statsLine = stats && stats.totalGames > 0
                          ? ` 上桌 ${stats.totalGames} 局, ${Math.round((stats.wins / stats.totalGames) * 100)}% 胜率`
                          : '';
                        const text =
                          `我们公司有个 ${rawChar.epithet} 名叫 ${rawChar.name}, ` +
                          `见面口头禅: "${rawChar.catchphrases[0]}". ${rawChar.backstory}.${statsLine} ` +
                          `— 这就是 2026 班味本色.`;
                        try {
                          const r = await fetch('/api/talkshow/ugc/submit', {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              'X-User-Id': (await import('../../utils/userId')).getUserId(),
                            },
                            body: JSON.stringify({
                              title: rawChar.epithet,
                              text,
                              tag,
                              region: 'beijing',
                            }),
                          });
                          if (r.ok) {
                            btn.textContent = tr('ugcSubmitted', locale);
                          } else if (r.status === 429) {
                            btn.textContent = tr('ugcRateLimit', locale);
                          } else {
                            btn.textContent = tr('ugcFail', locale);
                          }
                        } catch {
                          btn.textContent = tr('ugcFail', locale);
                        }
                        setTimeout(() => { btn.textContent = orig; }, 1800);
                      }}
                      style={{
                        fontSize: 10, padding: '4px 8px', borderRadius: 6,
                        background: 'rgba(176,134,255,0.12)', color: '#B086FF',
                        fontWeight: 700, cursor: 'pointer',
                        border: '1px solid rgba(176,134,255,0.45)',
                      }}
                    >{tr('ugcSubmit', locale)}</button>
                  )}
                </div>
              )}

              {/* v6.8 P5 — lifetime stats (totalGames / wins / votedOut /
                   suspicions). characterStatsStore JSON-file persists,
                   updated at every GAME_OVER + vote-cast. */}
              <div style={{
                paddingTop: 6, borderTop: '1px dashed rgba(255,215,0,0.18)',
              }}>
                {stats === undefined ? (
                  <div style={{ fontSize: 9.5, color: 'rgba(248,244,227,0.4)', letterSpacing: '0.05em', fontWeight: 600 }}>
                    {tr('statsLoading', locale)}
                  </div>
                ) : stats === null || stats.totalGames === 0 ? (
                  <div style={{ fontSize: 9.5, color: 'rgba(248,244,227,0.45)', fontWeight: 600 }}>
                    {tr('rookie', locale)}
                  </div>
                ) : (() => {
                  const winRate = stats.totalGames > 0
                    ? Math.round((stats.wins / stats.totalGames) * 100)
                    : 0;
                  const survRate = stats.totalGames > 0
                    ? Math.round(((stats.totalGames - stats.votedOut) / stats.totalGames) * 100)
                    : 0;
                  const favPersonality = Object.entries(stats.personalityCounts ?? {})
                    .sort((a, b) => b[1] - a[1])[0]?.[0];
                  const favPersonaLabel = favPersonality
                    ? PERSONALITY_LABELS[favPersonality]
                    : null;
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{
                        display: 'flex', gap: 8,
                        fontSize: 10, color: 'rgba(248,244,227,0.78)', fontWeight: 700,
                      }}>
                        <span><span style={{ opacity: 0.55 }}>{tr('plays', locale)}</span> {stats.totalGames}</span>
                        <span style={{ color: winRate >= 50 ? '#5be24a' : '#FFD700' }}>
                          <span style={{ opacity: 0.55, color: 'rgba(248,244,227,0.78)' }}>{tr('winRate', locale)}</span> {winRate}%
                        </span>
                        <span style={{ color: survRate >= 50 ? '#B086FF' : '#ff6347' }}>
                          <span style={{ opacity: 0.55, color: 'rgba(248,244,227,0.78)' }}>{tr('survRate', locale)}</span> {survRate}%
                        </span>
                      </div>
                      <div style={{
                        display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
                        fontSize: 9.5, color: 'rgba(248,244,227,0.55)', fontWeight: 600,
                      }}>
                        <span>{tr('suspicions', locale)} {stats.suspicionsReceived}</span>
                        {favPersonaLabel && (
                          <span style={{ color: favPersonaLabel.color }}>
                            {tr('oftenPlays', locale)} {favPersonaLabel.emoji} {favPersonaLabel.label}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: 'rgba(248,244,227,0.65)' }}>
              <strong style={{ color: '#FFD700' }}>{playerName}</strong> · {tr('notInRoster', locale)}
            </div>
          )}
        </div>
      )}
      {/* Tiny keyframes — scoped via a <style> tag once on the root. */}
      <style>{`
        @keyframes pcardIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </span>
  );
}
