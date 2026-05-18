import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useFiredStore, type FiredScores } from '../stores/firedStore';
import { useFiredProgress, getLevel } from '../stores/firedProgress';
import { getUserId } from '../utils/userId';
import DailyShareCardModal from '../components/DailyShareCardModal';
import type { DailyShareCardData } from '../utils/dailyShareCard';

/** v1.5.0 — shape returned by /api/daily/me. Duplicated from Landing
 *  (kept small + local) so we don't add a shared types module. */
interface DailyDramaShape {
  date: string;
  kind: 'fired' | 'talkshow' | 'pack' | 'pvp';
  targetId: string | null;
  targetTitle: string;
  targetEmoji: string;
  teaser: string;
  archetypeEmoji?: string;
  archetypeName?: string;
}

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
  /** v1.5.1 — archetype evolution payload from the same /memory/record
   *  response. When present, surfaces "🌀 卷度 +0.4" chip and (if the
   *  top archetype just flipped) a big "你已演化为 X" celebration. */
  const [evolution, setEvolution] = useState<{
    summary: string;
    transitioned: boolean;
    fromArchetype: string;
    toArchetype: string;
  } | null>(null);
  /** v1.5.1 — populated by the same fetch so we can render the to-archetype
   *  emoji + name on the transition banner without a second round-trip. */
  const [archetypeCatalogue, setArchetypeCatalogue] = useState<
    Record<string, { name: string; emoji: string }>
  >({});

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
  const packProgressMap = useFiredProgress((s) => s.packProgress);
  useEffect(() => {
    if (packRecordedRef.current) return;
    if (!packContext || !outcome) return;
    packRecordedRef.current = true;
    recordPackSlot(packContext.packId, packContext.slotIndex, outcome);
    // One-shot — clear so a subsequent non-pack play doesn't think it's
    // still inside the pack.
    try { sessionStorage.removeItem('office-zoo.active-pack'); } catch { /* noop */ }

    // v2.0.2 — pack-complete evolution hook. After recordPackSlot lands
    // the cleared map for this packId, check whether the user has now
    // covered all 5 slots. If yes AND this is the first time we fire
    // for that pack (guarded via sessionStorage), POST to the server's
    // /api/fired/pack/complete which records a pack-complete evolution
    // event and returns drift info we can stash with FiredResult's
    // existing evolution chip.
    queueMicrotask(() => {
      // Re-read the zustand state AFTER recordPackSlot has set it —
      // useFiredProgress.getState() avoids stale-closure issues vs
      // packProgressMap from this effect's render.
      const fresh = useFiredProgress.getState().packProgress[packContext.packId];
      if (!fresh) return;
      const clearedCount = Object.keys(fresh.cleared).length;
      // v1 packs are fixed at 5 slots. If future versions support
      // variable lengths, this check should query the pack's slot count
      // from /api/fired/packs/:id — for v2.0.2 the static 5 is fine.
      const PACK_SIZE = 5;
      if (clearedCount < PACK_SIZE) return;
      const guardKey = `pack-complete-fired:${packContext.packId}`;
      try {
        if (sessionStorage.getItem(guardKey)) return;
        sessionStorage.setItem(guardKey, '1');
      } catch { /* private mode etc — re-fires acceptable */ }

      fetch('/api/fired/pack/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': getUserId() },
        body: JSON.stringify({ packId: packContext.packId, slotCount: PACK_SIZE }),
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((d: {
          evolution?: {
            summary: string;
            transitioned: boolean;
            fromArchetype: string;
            toArchetype: string;
          } | null;
        }) => {
          // Stash into the same evolution state used for fired-completion
          // → the existing chip / transition banner renders for free.
          if (d.evolution) setEvolution(d.evolution);
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.warn('[fired/pack/complete] failed', err);
        });
    });
  }, [packContext, outcome, recordPackSlot, packProgressMap]);

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
      .then((d: {
        tactic?: string;
        evolution?: {
          summary: string;
          transitioned: boolean;
          fromArchetype: string;
          toArchetype: string;
        } | null;
      }) => {
        if (d.tactic) setRecordedTactic(d.tactic);
        if (d.evolution) setEvolution(d.evolution);
      })
      .catch((err) => {
        // Non-fatal — memory layer is a UX bonus, not a blocker. Log
        // for the dev console but don't surface to the user.
        // eslint-disable-next-line no-console
        console.warn('[fired/memory] record failed', err);
      });
  }, [outcome, scenarioId, messages]);

  // v1.5.1 — fetch archetype catalogue once so the transition banner
  // can render the name + emoji of the new top archetype. Cheap (12
  // entries, GETs once + cached by browser).
  useEffect(() => {
    if (!evolution?.transitioned) return;
    if (archetypeCatalogue[evolution.toArchetype]) return;
    fetch('/api/quiz/archetypes')
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: { archetypes: Array<{ id: string; name: string; emoji: string }> }) => {
        const next: typeof archetypeCatalogue = {};
        for (const a of d.archetypes) next[a.id] = { name: a.name, emoji: a.emoji };
        setArchetypeCatalogue(next);
      })
      .catch(() => { /* fallback — banner uses id strings */ });
  }, [evolution, archetypeCatalogue]);

  const handleReplay = () => {
    reset();
    navigate('/fired');
  };

  // v1.5.0 — daily-drama share card. If the just-played scenario is
  // today's daily fired pick, we surface a "✦ 分享今日战绩" button that
  // generates a result-mode PNG (grade letter + comp ratio baked in).
  // Anonymous users / non-matching plays simply never see the button.
  const [daily, setDaily] = useState<DailyDramaShape | null>(null);
  useEffect(() => {
    fetch('/api/daily/me', { headers: { 'X-User-Id': getUserId() } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { drama: DailyDramaShape | null } | null) => {
        if (d?.drama) setDaily(d.drama);
      })
      .catch(() => { /* anonymous or offline — no share button */ });
  }, []);

  const isTodaysDaily = useMemo(
    () => !!(daily && daily.kind === 'fired' && daily.targetId === scenarioId),
    [daily, scenarioId],
  );

  const [shareOpen, setShareOpen] = useState(false);
  // v3.3.1 — milestone fetch lives alongside shareData. Fired one-shot
  // when the FiredResult mounts AND the user has a tribe-matched daily
  // drama, so the share card's bottom strip can surface the next
  // milestone hook.
  const [milestone, setMilestone] = useState<DailyShareCardData['milestone']>();
  useEffect(() => {
    if (!isTodaysDaily) return;
    fetch('/api/quiz/evolution/me', { headers: { 'X-User-Id': getUserId() } })
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((json: { evolution: {
        nextMilestone?: {
          archetypeEmoji: string;
          archetypeName: string;
          estimatedPlays: number;
          suggestedActivity: string;
        };
      } | null }) => {
        const m = json.evolution?.nextMilestone;
        if (m) {
          setMilestone({
            archetypeLabel: `${m.archetypeEmoji} ${m.archetypeName}`,
            estimatedPlays: m.estimatedPlays,
            suggestedActivity: m.suggestedActivity,
          });
        }
      })
      .catch(() => { /* silent — milestone optional */ });
  }, [isTodaysDaily]);

  const shareData: DailyShareCardData | null = useMemo(() => {
    if (!daily || !isTodaysDaily) return null;
    const months    = outcome?.compensationMonths ?? 0;
    const maxMonths = outcome?.maxPossible ?? 0;
    const ratio     = maxMonths > 0 ? months / maxMonths : 0;
    // Avg-of-4 score — same calc rationale as the radar but flattened.
    const avgScore = Math.round(
      (currentScores.legalKnowledge
       + currentScores.negotiationSkill
       + currentScores.emotionalControl
       + currentScores.evidenceAwareness) / 4,
    );
    const headline =
      ratio >= 0.95 ? `谈下 ${months} 个月赔偿,几乎打满了`
    : ratio >= 0.6  ? `争取到 ${months} 个月赔偿`
    : ratio >= 0.3  ? `只拿到 ${months} 个月,有点亏`
    :                 `被压到 ${months} 个月,这局难顶`;
    const sub = `法定应得 ${maxMonths} 个月 · 综合能力 ${avgScore} 分`;
    return {
      date: daily.date,
      kind: 'fired',
      targetTitle: daily.targetTitle,
      targetEmoji: daily.targetEmoji,
      teaser: daily.teaser,
      archetype: daily.archetypeName && daily.archetypeEmoji
        ? { emoji: daily.archetypeEmoji, name: daily.archetypeName }
        : undefined,
      result: {
        // grade.letter is "S"|"A"|"B"|"C"|"D" by construction in getGrade().
        grade: grade.letter as 'S' | 'A' | 'B' | 'C' | 'D',
        headline, sub,
      },
      milestone,
    };
  }, [daily, isTodaysDaily, outcome, currentScores, grade, milestone]);

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

        {/* v1.5.1 — archetype evolution feedback. Two states:
            (a) just-a-delta: small "🌀 卷度 +0.4" chip
            (b) transition:   big banner "你已演化为 X" with from→to arc.
            Sits ABOVE the HR-memory callout because the transition
            moment is the most viral artefact in this loop — it deserves
            top placement. */}
        {evolution?.transitioned && (
          <motion.div
            className="w-full rounded-2xl p-5 mb-6 relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(255,184,76,0.18), rgba(255,85,136,0.10))',
              border: '1px solid rgba(255,184,76,0.55)',
              boxShadow: '0 12px 32px rgba(255,184,76,0.22), inset 0 1px 0 rgba(255,255,255,0.10)',
            }}
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.95, duration: 0.5, type: 'spring', bounce: 0.35 }}
          >
            <div className="text-[10px] uppercase tracking-[0.28em] mb-2"
              style={{ color: 'rgba(255,213,138,0.85)' }}>
              🌀 你已演化为新人格
            </div>
            <div className="flex items-center gap-3 mb-2">
              {/* From → To with strikethrough on the previous archetype. */}
              <span className="text-[13px] line-through opacity-65" style={{ color: 'rgba(255,255,255,0.55)' }}>
                {archetypeCatalogue[evolution.fromArchetype]?.emoji ?? '🐀'}{' '}
                {archetypeCatalogue[evolution.fromArchetype]?.name ?? evolution.fromArchetype}
              </span>
              <span className="text-xl" style={{ color: '#ffb84c' }}>→</span>
              <span className="text-base font-black"
                style={{ color: '#ffd58a', textShadow: '0 0 18px rgba(255,184,76,0.45)' }}>
                {archetypeCatalogue[evolution.toArchetype]?.emoji ?? '✨'}{' '}
                {archetypeCatalogue[evolution.toArchetype]?.name ?? evolution.toArchetype}
              </span>
            </div>
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {evolution.summary} · 多玩几局会再演化
            </p>
          </motion.div>
        )}
        {evolution && !evolution.transitioned && (
          <motion.div
            className="w-full mb-4 flex items-center justify-center gap-2 text-[12px] font-bold"
            style={{ color: 'rgba(176,134,255,0.95)' }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.95, duration: 0.5 }}
            title="多玩几局会改变你的班味卡 archetype"
          >
            <span className="px-3 py-1 rounded-full"
              style={{
                background: 'rgba(176,134,255,0.10)',
                border: '1px solid rgba(176,134,255,0.40)',
              }}>
              🌀 班味演化: {evolution.summary}
            </span>
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

        {/* v1.5.0 — daily share card. Only shown when the played
            scenario matches today's /api/daily/me pick. Sits above
            the replay/home buttons so it catches the eye before the
            user navigates away. */}
        {isTodaysDaily && shareData && (
          <motion.button
            onClick={() => setShareOpen(true)}
            className="w-full py-3.5 rounded-2xl text-sm font-bold tracking-wide mb-3 relative overflow-hidden hover-sheen"
            style={{
              background: 'linear-gradient(135deg, rgba(255,184,76,0.18), rgba(255,85,136,0.14))',
              border: '1px solid rgba(255,184,76,0.55)',
              color: '#ffd58a',
              boxShadow: '0 8px 24px rgba(255,184,76,0.20), inset 0 1px 0 rgba(255,255,255,0.08)',
            }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.15, duration: 0.5 }}
            whileHover={{ scale: 1.01, y: -1 }}
            whileTap={{ scale: 0.985 }}
            title="生成 1080×1350 PNG · 适合朋友圈 / 小红书 / Twitter"
          >
            ✦ 分享今日战绩 → 生成 PNG
          </motion.button>
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

      {/* v1.5.0 — share-card preview modal. Mounts only when shareData
          is non-null (i.e. today's daily matched this scenario AND the
          user tapped the button). */}
      <DailyShareCardModal
        open={shareOpen}
        data={shareData}
        onClose={() => setShareOpen(false)}
      />
    </div>
  );
}
