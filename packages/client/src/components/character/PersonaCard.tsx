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
import { findCharacter, type CharacterCard } from '@furball/shared';

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
  /** Element the popover hangs off. Typically the speaker's name span. */
  children: ReactNode;
}

export default function PersonaCard({ playerName, personality, children }: Props) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false); // click pins so popover stays for inspection
  const wrapRef = useRef<HTMLSpanElement | null>(null);

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

  const character: CharacterCard | null = findCharacter(playerName);
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
                    本局 · {persona.emoji} {persona.label}
                  </span>
                  {isReversal && (
                    <span style={{
                      fontSize: 9, padding: '2px 5px', borderRadius: 4,
                      background: 'rgba(255,79,163,0.18)', color: '#FF4FA3',
                      border: '1px solid rgba(255,79,163,0.45)', fontWeight: 800,
                      letterSpacing: '0.06em',
                    }}>
                      🔄 反差
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

              {/* Stats placeholder — characterStatsStore wire-up is v6.8.1 */}
              <div style={{
                paddingTop: 6, borderTop: '1px dashed rgba(255,215,0,0.18)',
                fontSize: 9.5, color: 'rgba(248,244,227,0.4)',
                letterSpacing: '0.05em', fontWeight: 600,
              }}>
                战绩同步中… (v6.8.1)
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: 'rgba(248,244,227,0.65)' }}>
              <strong style={{ color: '#FFD700' }}>{playerName}</strong> · 本鼠人暂未入档
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
