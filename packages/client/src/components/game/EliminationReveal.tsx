/**
 * EliminationReveal — full-viewport dramatic beat when a player is removed.
 *
 * Why this exists: in v1.0, `game:kill` and `game:vote_result` were only
 * rendered as a single line in the right-panel event log. For a spectator
 * format, that's the *climax* of every round — and we were giving it the
 * same visual weight as "phase transitioned to discussion". Among Us'
 * "body reported" animation is the reason its TikTok clips go viral; we
 * need the same peak.
 *
 * ## Audio-visual stack
 *
 * On mount we trigger three layers simultaneously for a single coherent beat:
 *
 *  1. **SFX** (`sfx.playKill` / `sfx.playVote`) — synthesized via Web Audio,
 *     no external assets. See `utils/sfx.ts`.
 *  2. **Screen shake** — motion.div wrapper with a short `x/y` keyframe
 *     shake. Only runs once per mount, keyed on `latest?.id`.
 *  3. **Particle burst** — 14 emojis radiating outward with randomized angle,
 *     distance, and spin. Reuses Framer's `animate` prop, no canvas cost.
 *
 * Format mirrors Among Us' report modal: 3 seconds, dim backdrop, center
 * crest, role reveal. Auto-dismisses because we don't want to block the
 * next round's discussion.
 *
 * Trigger contract: caller passes a `latest` object with a monotonic `id`.
 * The component keys its mount effect on `latest?.id`, so the same object
 * identity doesn't re-fire (matters under React StrictMode) but a new object
 * with a bumped id does.
 */
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { sfx } from '../../utils/sfx';

export interface EliminationEvent {
  /** Monotonic — used as the mount-effect key. Caller bumps per event. */
  id: number;
  type: 'kill' | 'vote';
  playerName: string;
  roleLabel?: string;
  team?: 'cat' | 'dog' | 'neutral';
  /** Only present for `kill` events (crime scene). */
  location?: string;
}

interface Props {
  latest: EliminationEvent | null;
  /** Auto-dismiss after ms (default 3000). */
  dismissAfter?: number;
}

const TYPE_CONFIG: Record<
  EliminationEvent['type'],
  {
    headline: string;
    sub: string;
    color: string;
    icon: string;
    particles: string[];
  }
> = {
  kill: {
    headline: '被资本家"优化"了',
    sub: '夜班突发,无声下岗',
    color: '#ef4444',
    icon: '🔪',
    particles: ['💥', '🔪', '💢', '💀', '❌'],
  },
  vote: {
    headline: '被全员投票开除',
    sub: '民意所向,劳动合同终止',
    color: '#fbbf24',
    icon: '🗳️',
    particles: ['📝', '🗳️', '✂️', '📉', '⚖️'],
  },
};

const TEAM_COLOR: Record<NonNullable<EliminationEvent['team']>, string> = {
  cat: '#2fb8ff',
  dog: '#ff4757',
  neutral: '#a855f7',
};

interface Particle {
  char: string;
  angle: number; // radians
  distance: number; // px
  rotate: number; // deg
  delay: number; // s
  size: number; // px font-size
}

/** Seeded-ish random particle layout — `id` makes each event unique. */
function buildParticles(cfg: (typeof TYPE_CONFIG)[keyof typeof TYPE_CONFIG], id: number): Particle[] {
  const particles: Particle[] = [];
  const COUNT = 14;
  for (let i = 0; i < COUNT; i++) {
    // Deterministic pseudo-random per (id, i) — avoids jitter on re-render.
    const r = (Math.sin(id * 937 + i * 131) + 1) / 2;
    const r2 = (Math.sin(id * 523 + i * 37) + 1) / 2;
    const r3 = (Math.sin(id * 241 + i * 71) + 1) / 2;
    const angle = (2 * Math.PI * i) / COUNT + (r - 0.5) * 0.6;
    particles.push({
      char: cfg.particles[i % cfg.particles.length],
      angle,
      distance: 180 + r * 140,
      rotate: (r2 - 0.5) * 720,
      delay: r3 * 0.08,
      size: 22 + Math.round(r2 * 18),
    });
  }
  return particles;
}

export default function EliminationReveal({
  latest,
  dismissAfter = 3000,
}: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!latest) return;
    setVisible(true);
    // Fire SFX once per event — key is `latest?.id`, matching this effect's
    // dependency, so StrictMode's double-invoke is the only risk. Harmless:
    // a double-played kill SFX is two short tones on top of each other.
    if (latest.type === 'kill') sfx.playKill();
    else sfx.playVote();
    const t = setTimeout(() => setVisible(false), dismissAfter);
    return () => clearTimeout(t);
  }, [latest?.id, latest?.type, dismissAfter]);

  const cfg = latest ? TYPE_CONFIG[latest.type] : null;
  const teamColor = latest?.team ? TEAM_COLOR[latest.team] : undefined;

  // Re-derive particles whenever the event id changes (NOT on every render).
  const particles = useMemo(
    () => (latest && cfg ? buildParticles(cfg, latest.id) : []),
    [latest?.id, cfg],
  );

  return (
    <AnimatePresence>
      {visible && latest && cfg && (
        <motion.div
          key={latest.id}
          className="fixed inset-0 z-[80] flex items-center justify-center pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
        >
          {/* Red vignette flash — pulses once on entry */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.9, 0.35, 0.5] }}
            transition={{ duration: 1.1, times: [0, 0.08, 0.3, 1] }}
            style={{
              background: `radial-gradient(ellipse at center, transparent 40%, ${cfg.color}22 75%, ${cfg.color}55 100%)`,
              mixBlendMode: 'screen',
            }}
          />

          {/* Radial burst behind the card */}
          <motion.div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            initial={{ width: 0, height: 0, opacity: 0 }}
            animate={{ width: 680, height: 680, opacity: [0, 0.55, 0] }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            style={{
              background: `radial-gradient(circle, ${cfg.color}55 0%, transparent 60%)`,
              filter: 'blur(22px)',
            }}
          />

          {/* Particle emojis radiating out */}
          <div className="absolute top-1/2 left-1/2 w-0 h-0 pointer-events-none">
            {particles.map((p, i) => {
              const x = Math.cos(p.angle) * p.distance;
              const y = Math.sin(p.angle) * p.distance;
              return (
                <motion.div
                  key={i}
                  className="absolute"
                  initial={{ x: 0, y: 0, opacity: 0, scale: 0.3, rotate: 0 }}
                  animate={{
                    x,
                    y,
                    opacity: [0, 1, 1, 0],
                    scale: [0.3, 1.2, 1, 0.8],
                    rotate: p.rotate,
                  }}
                  transition={{
                    duration: 1.4,
                    delay: p.delay,
                    times: [0, 0.15, 0.6, 1],
                    ease: 'easeOut',
                  }}
                  style={{
                    fontSize: p.size,
                    filter: `drop-shadow(0 0 8px ${cfg.color}aa)`,
                  }}
                >
                  {p.char}
                </motion.div>
              );
            })}
          </div>

          {/* Screen-shake wrapper — a short x/y tremor on entry.
              Small amplitude (6-10px) so it's punchy without nauseating. */}
          <motion.div
            className="relative"
            initial={{ x: 0, y: 0 }}
            animate={{
              x: [0, -10, 8, -6, 4, -2, 0],
              y: [0, 6, -8, 4, -2, 1, 0],
            }}
            transition={{ duration: 0.55, times: [0, 0.15, 0.3, 0.45, 0.6, 0.8, 1] }}
          >
            {/* Centerpiece card */}
            <motion.div
              initial={{ scale: 0.7, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 18, stiffness: 220 }}
              className="relative px-10 py-7 rounded-3xl text-center"
              style={{
                background: 'rgba(15, 14, 46, 0.94)',
                backdropFilter: 'blur(30px)',
                border: `2px solid ${cfg.color}`,
                boxShadow: `0 0 80px ${cfg.color}55, 0 20px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)`,
                minWidth: 340,
              }}
            >
              {/* Icon with shake */}
              <motion.div
                className="text-6xl mb-2"
                animate={{
                  scale: [1, 1.25, 1],
                  rotate: [0, -10, 8, -5, 0],
                }}
                transition={{ duration: 0.7, times: [0, 0.25, 0.5, 0.75, 1] }}
                style={{ filter: `drop-shadow(0 0 20px ${cfg.color}aa)` }}
              >
                {cfg.icon}
              </motion.div>

              {/* Name — big, punchy */}
              <div
                className="text-3xl font-black mb-1"
                style={{
                  color: '#fff',
                  textShadow: `0 0 16px ${cfg.color}66`,
                  letterSpacing: '0.02em',
                }}
              >
                {latest.playerName}
              </div>

              {/* Headline */}
              <div
                className="text-base font-bold mb-2.5"
                style={{
                  color: cfg.color,
                  textShadow: `0 0 8px ${cfg.color}44`,
                }}
              >
                {cfg.headline}
              </div>

              {/* Role tag */}
              {latest.roleLabel && (
                <div className="flex items-center justify-center gap-2 mb-1">
                  <span className="text-[10px] text-white/40 tracking-[0.15em] uppercase">
                    Role
                  </span>
                  <span
                    className="text-sm font-bold px-3 py-0.5 rounded-full"
                    style={{
                      color: teamColor ?? '#fff',
                      background: teamColor
                        ? `${teamColor}18`
                        : 'rgba(255,255,255,0.06)',
                      border: `1px solid ${teamColor ?? 'rgba(255,255,255,0.2)'}55`,
                    }}
                  >
                    {latest.roleLabel}
                  </span>
                </div>
              )}

              {/* Location (kill only) */}
              {latest.type === 'kill' && latest.location && (
                <div className="text-[11px] text-white/45 mt-1">
                  📍 {latest.location}
                </div>
              )}

              {/* Sub footer */}
              <div className="text-[10px] text-white/35 mt-2.5 tracking-wide">
                {cfg.sub}
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
