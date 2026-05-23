/**
 * TopRatsPanel — v6.9 P-profile. Renders 3 "leaderboard" rats on the
 * /profile page using the GLOBAL characterStatsStore.
 *
 * v6.9 scope is intentionally global (not per-user "你看过的") because
 * spectator → game attendance tracking doesn't exist yet. The honest
 * label here is "全员鼠人榜单", swap to "你看过的 Top 3" in v6.10 once
 * userCharacterViewsStore lands.
 *
 * 3 categories — different metrics expose different angles of the IP:
 *   1. 上桌王     (totalGames desc) — 最常出场, 最眼熟
 *   2. 胜率王     (wins/totalGames, ≥ 3 局 floor 防新人偶发) — 最 carry
 *   3. 背锅侠     (suspicionsReceived desc) — 大家最爱怀疑
 *
 * Each card: emoji + epithet + name + dominant metric chip, wrapped in
 * PersonaCard so click pops the full popover (with share buttons).
 */

import { useEffect, useState } from 'react';
import PersonaCard from './PersonaCard';

interface RatStats {
  name: string;
  epithet: string;
  emoji: string;
  catchphrases: [string, string, string];
  backstory: string;
  stats: {
    totalGames: number;
    wins: number;
    votedOut: number;
    suspicionsReceived: number;
    personalityCounts: Record<string, number>;
    lastGameId: string;
    lastAt: number;
  } | null;
}

interface CategoryWinner {
  category: 'mostPlayed' | 'highestWinRate' | 'mostSuspected';
  label: string;
  metric: string; // pre-formatted display string
  tint: string;
  emoji: string;  // category emoji (not rat emoji)
  rat: RatStats;
}

const MIN_GAMES_FOR_WIN_RATE = 3;

function pickWinners(rats: RatStats[]): CategoryWinner[] {
  const withStats = rats.filter((r) => r.stats && r.stats.totalGames > 0);
  if (withStats.length === 0) return [];

  // 1. 上桌王 — most played
  const mostPlayed = [...withStats].sort(
    (a, b) => (b.stats!.totalGames) - (a.stats!.totalGames),
  )[0];

  // 2. 胜率王 — highest win rate among those with ≥ MIN_GAMES_FOR_WIN_RATE
  const winRateEligible = withStats.filter(
    (r) => r.stats!.totalGames >= MIN_GAMES_FOR_WIN_RATE,
  );
  const highestWinRate = winRateEligible.length > 0
    ? [...winRateEligible].sort(
        (a, b) => (b.stats!.wins / b.stats!.totalGames) - (a.stats!.wins / a.stats!.totalGames),
      )[0]
    : mostPlayed; // fallback to whoever has most games

  // 3. 背锅侠 — most suspicions received
  const mostSuspected = [...withStats].sort(
    (a, b) => (b.stats!.suspicionsReceived) - (a.stats!.suspicionsReceived),
  )[0];

  return [
    {
      category: 'mostPlayed',
      label: '上桌王',
      metric: `已上桌 ${mostPlayed.stats!.totalGames} 局`,
      tint: '#FFD700',
      emoji: '🪑',
      rat: mostPlayed,
    },
    {
      category: 'highestWinRate',
      label: '胜率王',
      metric: `${Math.round((highestWinRate.stats!.wins / highestWinRate.stats!.totalGames) * 100)}% (${highestWinRate.stats!.wins}/${highestWinRate.stats!.totalGames})`,
      tint: '#5be24a',
      emoji: '👑',
      rat: highestWinRate,
    },
    {
      category: 'mostSuspected',
      label: '背锅侠',
      metric: `累计疑票 ${mostSuspected.stats!.suspicionsReceived}`,
      tint: '#FF4FA3',
      emoji: '🎯',
      rat: mostSuspected,
    },
  ];
}

export default function TopRatsPanel() {
  const [rats, setRats] = useState<RatStats[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/characters');
        if (!r.ok) { setError(`HTTP ${r.status}`); return; }
        const data = await r.json();
        if (!cancelled) setRats(data.characters ?? []);
      } catch (err) {
        if (!cancelled) setError((err as Error).message ?? 'network error');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // While loading — render a slim skeleton so the panel reserves space.
  if (rats === null && !error) {
    return (
      <div style={{ width: '100%', maxWidth: 512, marginTop: 24 }}>
        <div style={{
          height: 180, borderRadius: 16,
          background: 'linear-gradient(135deg, rgba(255,215,0,0.04), rgba(124,58,237,0.04))',
          border: '1px dashed rgba(255,215,0,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(248,244,227,0.4)', fontSize: 12, fontWeight: 700,
        }}>鼠人榜单加载中…</div>
      </div>
    );
  }

  if (error) {
    // Silent fail — panel just doesn't show. Don't pollute the profile
    // page with a generic "load error" box; that distracts from the
    // actual identity card above.
    return null;
  }

  const winners = pickWinners(rats!);
  if (winners.length === 0) {
    // No games played yet ANYWHERE — show a soft empty state so users
    // know the panel will populate later.
    return (
      <div style={{
        width: '100%', maxWidth: 512, marginTop: 24, padding: '16px 20px',
        borderRadius: 16,
        background: 'rgba(255,215,0,0.04)',
        border: '1px dashed rgba(255,215,0,0.25)',
        textAlign: 'center', color: 'rgba(248,244,227,0.55)',
        fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
      }}>
        🐀 全员鼠人 0 局 — 开一局 Classic 模式让榜单跑起来
      </div>
    );
  }

  return (
    <div style={{ width: '100%', maxWidth: 512, marginTop: 24 }}>
      {/* Section title */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10, padding: '0 4px',
      }}>
        <div style={{
          fontSize: 12, fontWeight: 900, letterSpacing: '0.18em',
          color: '#FFD700', textTransform: 'uppercase',
        }}>🏆 全员鼠人榜单 · TOP 3</div>
        <div style={{ fontSize: 9, color: 'rgba(248,244,227,0.4)', fontWeight: 600 }}>
          v6.10 → 「你看过的」
        </div>
      </div>

      {/* 3 cards in a row (stacked on narrow screens via flex-wrap) */}
      <div style={{
        display: 'flex', gap: 10, flexWrap: 'wrap',
      }}>
        {winners.map((w) => (
          <div key={w.category} style={{ flex: '1 1 150px', minWidth: 150 }}>
            <PersonaCard playerName={w.rat.name} personality={undefined}>
              <div style={{
                position: 'relative', cursor: 'pointer',
                padding: '12px 12px 14px', borderRadius: 14,
                background: `linear-gradient(165deg, rgba(20,15,40,0.85) 0%, ${w.tint}14 100%)`,
                border: `1px solid ${w.tint}55`,
                boxShadow: `0 0 16px ${w.tint}22, inset 0 0 0 1px rgba(255,255,255,0.04)`,
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                {/* Category chip top-left */}
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 9, padding: '2px 7px', borderRadius: 999,
                  background: `${w.tint}28`, color: w.tint,
                  fontWeight: 800, letterSpacing: '0.06em',
                  alignSelf: 'flex-start',
                }}>{w.emoji} {w.label}</div>
                {/* Rat emoji + epithet */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 28 }}>{w.rat.emoji}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{
                      fontSize: 13, fontWeight: 900,
                      color: '#F8F4E3', letterSpacing: '-0.01em',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{w.rat.epithet}</span>
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                      color: 'rgba(248,244,227,0.5)',
                    }}>{w.rat.name.toUpperCase()}</span>
                  </div>
                </div>
                {/* Metric value */}
                <div style={{
                  fontSize: 11, color: w.tint, fontWeight: 800,
                  letterSpacing: '0.02em',
                }}>{w.metric}</div>
              </div>
            </PersonaCard>
          </div>
        ))}
      </div>
    </div>
  );
}
