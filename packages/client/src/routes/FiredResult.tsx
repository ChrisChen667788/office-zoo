import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useFiredStore, type FiredScores } from '../stores/firedStore';
import { useFiredProgress, getLevel } from '../stores/firedProgress';
import { getUserId } from '../utils/userId';

/* ------------------------------------------------------------------ */
/*  Grade helpers                                                      */
/* ------------------------------------------------------------------ */

interface GradeInfo {
  letter: string;
  label: string;
  color: string;
  glow: string;
}

function getGrade(compensationMonths: number, maxPossible: number): GradeInfo {
  if (maxPossible <= 0) return { letter: 'C', label: '一般', color: '#ffb84c', glow: 'rgba(255,184,76,0.32)' };
  const ratio = compensationMonths / maxPossible;
  if (ratio >= 0.95) return { letter: 'S', label: '完美谈判', color: '#ffb84c', glow: 'rgba(255,184,76,0.5)' };
  if (ratio >= 0.8) return { letter: 'A', label: '出色发挥', color: '#4c9eff', glow: 'rgba(76,158,255,0.45)' };
  if (ratio >= 0.6) return { letter: 'B', label: '表现良好', color: '#9cff57', glow: 'rgba(156,255,87,0.3)' };
  if (ratio >= 0.4) return { letter: 'C', label: '勉强及格', color: '#ffb84c', glow: 'rgba(255,184,76,0.3)' };
  return { letter: 'D', label: '惨遭碾压', color: '#ff3355', glow: 'rgba(255,51,85,0.32)' };
}

/* ------------------------------------------------------------------ */
/*  Radar chart (SVG)                                                  */
/* ------------------------------------------------------------------ */

const DIMENSIONS: Array<{ key: keyof FiredScores; label: string }> = [
  { key: 'legalKnowledge', label: '法律知识' },
  { key: 'negotiationSkill', label: '谈判技巧' },
  { key: 'emotionalControl', label: '情绪控制' },
  { key: 'evidenceAwareness', label: '证据意识' },
];

function RadarChart({ scores }: { scores: FiredScores }) {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 70;
  const levels = 4;

  // Calculate polygon points for each level
  const getPoint = (index: number, radius: number) => {
    const angle = (Math.PI * 2 * index) / 4 - Math.PI / 2;
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  };

  const gridPolygons = Array.from({ length: levels }, (_, level) => {
    const r = (maxR * (level + 1)) / levels;
    const points = Array.from({ length: 4 }, (_, i) => {
      const p = getPoint(i, r);
      return `${p.x},${p.y}`;
    }).join(' ');
    return points;
  });

  const values = DIMENSIONS.map((dim) => scores[dim.key]);
  const dataPoints = values
    .map((val, i) => {
      const r = (val / 100) * maxR;
      const p = getPoint(i, r);
      return `${p.x},${p.y}`;
    })
    .join(' ');

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Grid lines */}
      {gridPolygons.map((points, i) => (
        <polygon
          key={i}
          points={points}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="1"
        />
      ))}

      {/* Axes */}
      {Array.from({ length: 4 }, (_, i) => {
        const p = getPoint(i, maxR);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="1"
          />
        );
      })}

      {/* Data polygon */}
      <motion.polygon
        points={dataPoints}
        fill="rgba(255,138,76,0.18)"
        stroke="#ff8a4c"
        strokeWidth="2"
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, delay: 0.5, ease: 'easeOut' }}
        style={{ transformOrigin: `${cx}px ${cy}px` }}
      />

      {/* Data points */}
      {values.map((val, i) => {
        const r = (val / 100) * maxR;
        const p = getPoint(i, r);
        return (
          <motion.circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={4}
            fill="#ff8a4c"
            stroke="#fff"
            strokeWidth="1.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 + i * 0.1 }}
          />
        );
      })}

      {/* Labels */}
      {DIMENSIONS.map((dim, i) => {
        const p = getPoint(i, maxR + 22);
        return (
          <text
            key={dim.key}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="rgba(255,255,255,0.55)"
            fontSize="11"
            fontWeight="500"
          >
            {dim.label}
          </text>
        );
      })}

      {/* Score values */}
      {DIMENSIONS.map((dim, i) => {
        const p = getPoint(i, maxR + 36);
        return (
          <text
            key={`score-${dim.key}`}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#ff8a4c"
            fontSize="10"
            fontWeight="700"
          >
            {scores[dim.key]}
          </text>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function FiredResult() {
  const navigate = useNavigate();
  const { scenarioId, outcome, currentScores, messages, reset } = useFiredStore();
  const awardLevel = useFiredProgress((s) => s.awardLevel);
  /** v0.8.2 — server-recorded tactic summary (echoed back from the
   *  /memory/record response). When present, surface it on the result
   *  screen so the user sees what HR will remember next time. */
  const [recordedTactic, setRecordedTactic] = useState<string | null>(null);

  const grade = useMemo(
    () => getGrade(outcome?.compensationMonths ?? 0, outcome?.maxPossible ?? 1),
    [outcome],
  );

  const keyMoments = useMemo(
    () => messages.filter((m) => m.keyMoment),
    [messages],
  );

  // Award stars + unlock next level if this play came from the chapter mode.
  // The active level number is stashed in sessionStorage on FiredLanding entry.
  // Use a ref-guard so a re-render of this component doesn't double-award.
  const awardedRef = useRef(false);
  const activeLevelInfo = useMemo(() => {
    try {
      const raw = sessionStorage.getItem('office-zoo.active-level');
      const n = raw ? parseInt(raw, 10) : NaN;
      return Number.isFinite(n) ? { level: n, def: getLevel(n) } : null;
    } catch { return null; }
  }, []);
  useEffect(() => {
    if (awardedRef.current) return;
    if (!activeLevelInfo || !outcome) return;
    awardedRef.current = true;
    awardLevel(activeLevelInfo.level, outcome);
    // One-shot — clear the marker so re-replays start fresh.
    try { sessionStorage.removeItem('office-zoo.active-level'); } catch { /* noop */ }
  }, [activeLevelInfo, outcome, awardLevel]);

  // v0.9.0 — if this round was launched from a pack, read the stashed
  // (packId, slotIndex) from sessionStorage and record completion into
  // the per-pack progress map. Then offer a "back to pack" button so the
  // user keeps their flow.
  const recordPackSlot = useFiredProgress((s) => s.recordPackSlot);
  const packContext = useMemo(() => {
    try {
      const raw = sessionStorage.getItem('office-zoo.active-pack');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { packId?: string; slotIndex?: number };
      if (typeof parsed?.packId !== 'string' || typeof parsed?.slotIndex !== 'number') return null;
      return { packId: parsed.packId, slotIndex: parsed.slotIndex };
    } catch { return null; }
  }, []);
  const packRecordedRef = useRef(false);
  useEffect(() => {
    if (packRecordedRef.current) return;
    if (!packContext || !outcome) return;
    packRecordedRef.current = true;
    recordPackSlot(packContext.packId, packContext.slotIndex, outcome);
    // One-shot — clear so a subsequent non-pack play doesn't think it's
    // still inside the pack.
    try { sessionStorage.removeItem('office-zoo.active-pack'); } catch { /* noop */ }
  }, [packContext, outcome, recordPackSlot]);

  // v0.8.2 — record this round into the user's memory store so HR
  // pre-empts these tactics next time the same scenario is played.
  // One-shot via ref-guard, fires only when we have an outcome AND a
  // scenarioId AND chat history. Soft-fails silently (memory is a "nice
  // to have", not a critical path).
  const memorizedRef = useRef(false);
  useEffect(() => {
    if (memorizedRef.current) return;
    if (!outcome || !scenarioId || messages.length === 0) return;
    memorizedRef.current = true;

    // Map game outcome to memory-store enum.
    const ratio = outcome.maxPossible > 0
      ? outcome.compensationMonths / outcome.maxPossible
      : 0;
    const memOutcome: 'win' | 'partial' | 'lose' =
      ratio >= 0.8 ? 'win'
    : ratio >= 0.4 ? 'partial'
    :                'lose';

    // Strip messages to the wire shape the server expects (role + content).
    const wireMessages = messages
      .filter((m) => m.role === 'user' || m.role === 'hr')
      .map((m) => ({ role: m.role as 'user' | 'hr', content: m.content }));
    const tookRounds = wireMessages.filter((m) => m.role === 'user').length;
    if (tookRounds < 1) return;

    fetch('/api/fired/memory/record', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': getUserId(),
      },
      body: JSON.stringify({
        scenarioId,
        outcome: memOutcome,
        compensationMonths: outcome.compensationMonths,
        maxPossible: outcome.maxPossible,
        tookRounds,
        messages: wireMessages,
      }),
    })
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: { tactic?: string }) => {
        if (d.tactic) setRecordedTactic(d.tactic);
      })
      .catch((err) => {
        // Non-fatal — memory layer is a UX bonus, not a blocker. Log
        // for the dev console but don't surface to the user.
        // eslint-disable-next-line no-console
        console.warn('[fired/memory] record failed', err);
      });
  }, [outcome, scenarioId, messages]);

  const handleReplay = () => {
    reset();
    navigate('/fired');
  };

  return (
    <div
      className="relative min-h-screen flex items-center justify-center overflow-hidden py-12 noise"
      style={{ background: '#050510' }}
    >
      {/* Aurora background — heat tones tied to grade color */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="aurora"
          style={{
            top: '-25%',
            left: '-10%',
            width: '60vmax',
            height: '60vmax',
            ['--c' as never]: `${grade.color}55`,
            opacity: 0.45,
          }}
        />
        <div
          className="aurora"
          style={{
            bottom: '-20%',
            right: '-10%',
            width: '55vmax',
            height: '55vmax',
            ['--c' as never]: 'rgba(255, 138, 76, 0.28)',
            opacity: 0.4,
          }}
        />
        <div
          className="absolute inset-0 grid-dots"
          style={{ opacity: 0.55, maskImage: 'linear-gradient(180deg, black 20%, transparent 100%)' }}
        />
      </div>

      {/* Main content */}
      <motion.div
        className="relative z-10 flex flex-col items-center px-6 w-full max-w-xl"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: 'easeOut' }}
      >
        {/* Grade badge */}
        <motion.div
          className="relative mb-6"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.6, type: 'spring', bounce: 0.4, delay: 0.2 }}
        >
          <motion.div
            className="w-28 h-28 rounded-full flex items-center justify-center text-5xl font-black"
            style={{
              background: `radial-gradient(circle, ${grade.color}20, transparent 70%)`,
              border: `2px solid ${grade.color}60`,
              color: grade.color,
              boxShadow: `0 0 60px ${grade.glow}, 0 0 120px ${grade.glow}`,
            }}
            animate={{
              boxShadow: [
                `0 0 40px ${grade.glow}, 0 0 80px ${grade.glow}`,
                `0 0 60px ${grade.glow}, 0 0 140px ${grade.glow}`,
                `0 0 40px ${grade.glow}, 0 0 80px ${grade.glow}`,
              ],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            {grade.letter}
          </motion.div>
          <motion.p
            className="text-center mt-2 text-sm font-bold"
            style={{ color: grade.color }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            {grade.label}
          </motion.p>
        </motion.div>

        {/* Compensation result */}
        <motion.div
          className="w-full rounded-2xl p-6 mb-6 text-center glass"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
        >
          <p className="text-[10px] uppercase tracking-[0.25em] mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
            谈判成果
          </p>
          <div className="flex items-baseline justify-center gap-1.5 mb-1.5">
            <span className="text-xs tracking-wide" style={{ color: 'rgba(255,255,255,0.55)' }}>你争取到了</span>
            <motion.span
              className="text-5xl font-black tabular-nums"
              style={{ color: '#ff8a4c' }}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.7, type: 'spring', bounce: 0.3 }}
            >
              {outcome?.compensationMonths ?? 0}
            </motion.span>
            <span className="text-xs tracking-wide" style={{ color: 'rgba(255,255,255,0.55)' }}>个月工资</span>
          </div>
          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
            法定应得 <span className="font-semibold tabular-nums" style={{ color: '#ff3355' }}>{outcome?.maxPossible ?? 0}</span> 个月
          </p>

          {/* Progress bar */}
          <div className="mt-5 mx-auto max-w-xs">
            <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{
                  background: `linear-gradient(90deg, #ff3355, ${grade.color})`,
                }}
                initial={{ width: 0 }}
                animate={{
                  width: `${outcome && outcome.maxPossible > 0
                    ? Math.min(100, (outcome.compensationMonths / outcome.maxPossible) * 100)
                    : 0
                  }%`,
                }}
                transition={{ delay: 0.8, duration: 1.2, ease: 'easeOut' }}
              />
            </div>
            <div className="flex justify-between mt-1.5 text-[10px] tracking-wider tabular-nums" style={{ color: 'rgba(255,255,255,0.3)' }}>
              <span>0</span>
              <span>{outcome?.maxPossible ?? 0} 个月</span>
            </div>
          </div>
        </motion.div>

        {/* Radar chart */}
        <motion.div
          className="w-full rounded-2xl p-6 mb-6 flex flex-col items-center glass"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
        >
          <p className="text-[10px] uppercase tracking-[0.25em] mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>
            能力评估
          </p>
          <RadarChart scores={currentScores} />
        </motion.div>

        {/* Knowledge gained — only shown when this play came from a chapter
            level. Surfaces the legal article tied to that scenario so the
            user walks away knowing one more concrete labor-law clause. */}
        {activeLevelInfo?.def && (
          <motion.div
            className="w-full rounded-2xl p-5 mb-6"
            style={{
              background: `linear-gradient(135deg, ${activeLevelInfo.def.accent}1a 0%, rgba(255,255,255,0.02) 75%)`,
              border: `1px solid ${activeLevelInfo.def.accent}55`,
              backdropFilter: 'blur(20px)',
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 28px ${activeLevelInfo.def.accent}22`,
            }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.6 }}
          >
            <div className="flex items-center gap-3 mb-3">
              <span
                className="text-2xl"
                style={{ filter: `drop-shadow(0 0 10px ${activeLevelInfo.def.accent}88)` }}
              >
                {activeLevelInfo.def.badge}
              </span>
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em]" style={{ color: activeLevelInfo.def.accent }}>
                  LV {activeLevelInfo.level.toString().padStart(2, '0')} · 知识卡片解锁
                </p>
                <p className="text-sm font-bold text-white/85">{activeLevelInfo.def.title}</p>
              </div>
            </div>
            <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.78)' }}>
              📚 {activeLevelInfo.def.legalLesson}
            </p>
          </motion.div>
        )}

        {/* Summary */}
        {outcome?.summary && (
          <motion.div
            className="w-full rounded-2xl p-5 mb-6 glass"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.6 }}
          >
            <p className="text-[10px] uppercase tracking-[0.25em] mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
              律师点评
            </p>
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.72)' }}>
              {outcome.summary}
            </p>
          </motion.div>
        )}

        {/* v0.8.2 — HR memory callout. Shows the tactic the server
            extracted from this round and tells the user it'll be used
            against them next time. Sets up the replay value. */}
        {recordedTactic && (
          <motion.div
            className="w-full rounded-2xl p-5 mb-6"
            style={{
              background: 'linear-gradient(180deg, rgba(124,58,237,0.10) 0%, rgba(255,255,255,0.02) 100%)',
              border: '1px solid rgba(124,58,237,0.32)',
              backdropFilter: 'blur(20px)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.0, duration: 0.6 }}
          >
            <p
              className="text-[10px] uppercase tracking-[0.25em] mb-3 flex items-center gap-2"
              style={{ color: 'rgba(176,134,255,0.85)' }}
            >
              <span>🧠 HR 记住了你这次的套路</span>
            </p>
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.78)' }}>
              "{recordedTactic}"
            </p>
            <p className="text-[11px] mt-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
              下次再玩同一关,HR 会主动预判这条招数。难度自动升级。
            </p>
          </motion.div>
        )}

        {/* Key moments */}
        {keyMoments.length > 0 && (
          <motion.div
            className="w-full rounded-2xl p-5 mb-6"
            style={{
              background: 'linear-gradient(180deg, rgba(255,184,76,0.06) 0%, rgba(255,255,255,0.02) 100%)',
              border: '1px solid rgba(255,184,76,0.18)',
              backdropFilter: 'blur(20px)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1, duration: 0.6 }}
          >
            <p className="text-[10px] uppercase tracking-[0.25em] mb-4" style={{ color: 'rgba(255,184,76,0.75)' }}>
              关键时刻回顾
            </p>
            <div className="space-y-3">
              {keyMoments.map((msg, idx) => (
                <motion.div
                  key={idx}
                  className="flex gap-3"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1.2 + idx * 0.15 }}
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 tabular-nums"
                    style={{
                      background: 'rgba(255,184,76,0.12)',
                      border: '1px solid rgba(255,184,76,0.35)',
                      color: '#ffb84c',
                    }}
                  >
                    {idx + 1}
                  </div>
                  <div>
                    <p className="text-[11px] font-bold mb-0.5" style={{ color: '#ffb84c' }}>
                      {msg.keyMoment}
                    </p>
                    <p
                      className="text-[11px] leading-relaxed line-clamp-2"
                      style={{ color: 'rgba(255,255,255,0.5)' }}
                    >
                      {msg.role === 'hr' ? 'HR · ' : ''}
                      {msg.content.slice(0, 80)}
                      {msg.content.length > 80 ? '…' : ''}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Action buttons */}
        <motion.div
          className="flex gap-3 w-full"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.5 }}
        >
          {/* v0.9.0 — when this round was launched from a pack, the
              primary CTA is "下一关" (jump back to the pack view); the
              "再来一局" replay button is demoted to a secondary action. */}
          <motion.button
            onClick={() => {
              reset();
              if (packContext) {
                navigate(`/fired/pack/${packContext.packId}`);
              } else {
                handleReplay();
              }
            }}
            className="relative flex-1 overflow-hidden py-4 rounded-2xl text-sm font-semibold tracking-wide"
            style={{
              background: 'linear-gradient(135deg, #ff3355 0%, #ff8a4c 100%)',
              boxShadow: '0 10px 40px rgba(255,51,85,0.32), inset 0 1px 0 rgba(255,255,255,0.16)',
              color: '#fff',
            }}
            whileHover={{ scale: 1.015, y: -1 }}
            whileTap={{ scale: 0.985 }}
          >
            <motion.span
              aria-hidden
              className="absolute inset-0 opacity-35"
              style={{ background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.55) 50%, transparent 65%)' }}
              animate={{ x: ['-110%', '210%'] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut', repeatDelay: 2.5 }}
            />
            <span className="relative z-10">
              {packContext ? '回到闯关包 →' : '再来一局 →'}
            </span>
          </motion.button>
          <motion.button
            onClick={() => { reset(); navigate('/'); }}
            className="flex-1 py-4 rounded-2xl text-sm font-semibold tracking-wide"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.7)',
            }}
            whileHover={{
              scale: 1.01,
              borderColor: 'rgba(255,255,255,0.22)',
              color: 'rgba(255,255,255,0.92)',
            }}
            whileTap={{ scale: 0.985 }}
          >
            回到首页
          </motion.button>
        </motion.div>
      </motion.div>
    </div>
  );
}
