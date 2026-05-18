/**
 * Profile — v1.3.0 "你的班味卡" shareable identity card.
 *
 * - Web-rendered card (interactive, sticker shadows + sparkle decoration)
 * - Y2K aesthetic: hot pink + cyan + acid yellow + chunky black borders
 * - Card content: archetype hero band, hybrid breakdown, 6-axis radar,
 *   3 LLM-personalized catchphrase stickers, rival/bestie callout, footer
 * - Action row: 🔗 share link, 📸 screenshot hint, 🎯 jump-to-命中-剧本
 *
 * The card MUST look great as a static screenshot — that's what gets
 * posted on social. v1.3.1 will add an html2canvas-driven 1080×1350
 * PNG export; for v1.3.0 the card is screenshot-friendly as-is.
 */

import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ARCHETYPE_PAIRS,
  findArchetype,
  type Archetype,
  type TraitVector,
} from '@furball/shared';
import { getUserId } from '../utils/userId';
import { archetypeLabel, useT, type DictKey } from '../utils/i18n';
import type { PersonalizedProfile, UserProfile } from '../utils/profileTypes';

const TRAIT_LABELS: Array<{ key: keyof TraitVector; label: string }> = [
  { key: 'grind',      label: '内卷' },
  { key: 'snark',      label: '阴阳' },
  { key: 'ambition',   label: '上进' },
  { key: 'empathy',    label: '人情' },
  { key: 'cynicism',   label: '摆烂' },
  { key: 'visibility', label: '显眼' },
];

/** v2.0.0 — display labels for the region/industry chips on the
 *  archetype card. Kept here client-side rather than imported from
 *  shared so we can tweak label copy without bumping the shared
 *  package version. */
const REGION_LABEL: Record<string, string> = {
  beijing:   '🌆 北漂',
  shanghai:  '☕ 沪漂',
  shenzhen:  '💰 深漂',
  hangzhou:  '🌊 杭漂',
  chengdu:   '🐼 成都',
  overseas:  '✈️ 海外',
  generic:   '',
};
const INDUSTRY_LABEL: Record<string, string> = {
  soe:      '🏛️ 国企',
  faang:    '⚙️ 大厂',
  startup:  '🤠 创业',
  finance:  '💼 金融',
  edu:      '📚 教培',
  mcn:      '📱 MCN',
  generic:  '',
};

export default function Profile() {
  const navigate = useNavigate();
  const myId = useMemo(() => getUserId(), []);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch('/api/quiz/me', { headers: { 'X-User-Id': myId } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { profile: UserProfile | null }) => {
        if (!d.profile) {
          // No profile yet → bounce to quiz.
          navigate('/quiz');
        } else {
          setProfile(d.profile);
        }
      })
      .catch((e) => setLoadErr(typeof e === 'number' ? `加载失败 (${e})` : '加载失败'));
  }, [myId, navigate]);

  if (loadErr) {
    return (
      <div className="y2k-bg flex items-center justify-center px-4">
        <div className="y2k-sticker text-center">
          <div className="text-3xl mb-2">😵</div>
          <div className="y2k-display text-base mb-3">{loadErr}</div>
          <button onClick={() => navigate('/')} className="y2k-cta">← 返回首页</button>
        </div>
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="y2k-bg flex items-center justify-center">
        <div className="y2k-sticker text-center" style={{ padding: '2rem' }}>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
            className="text-3xl"
          >⏳</motion.div>
        </div>
      </div>
    );
  }

  const winner = findArchetype(profile.topArchetypes[0]);
  if (!winner) {
    return (
      <div className="y2k-bg flex items-center justify-center px-4">
        <div className="y2k-sticker text-center">数据异常,请重新测试</div>
      </div>
    );
  }
  const second = findArchetype(profile.topArchetypes[1]);
  const third  = findArchetype(profile.topArchetypes[2]);
  const pair = ARCHETYPE_PAIRS[winner.id];
  const rival  = pair ? findArchetype(pair.rival)  : undefined;
  const bestie = pair ? findArchetype(pair.bestie) : undefined;

  return (
    <div className="y2k-bg flex flex-col items-center px-4 py-8">
      {/* Top bar */}
      <div className="w-full max-w-lg flex items-center justify-between mb-4">
        <button
          onClick={() => navigate('/')}
          className="text-xs px-3 py-1.5 rounded-full font-bold"
          style={{ background: 'rgba(255,255,255,0.85)', color: '#0a0a0a', border: '2px solid #0a0a0a' }}
        >← 首页</button>
        <button
          onClick={() => navigate('/quiz')}
          className="text-xs px-3 py-1.5 rounded-full font-bold"
          style={{ background: 'rgba(0,0,0,0.85)', color: '#fff', border: '2px solid #fff' }}
        >↻ 重新测试</button>
      </div>

      {/* The card */}
      <ProfileCard
        ref={cardRef}
        archetype={winner}
        second={second} third={third}
        rival={rival} bestie={bestie}
        traits={profile.traits}
        personalized={profile.personalized}
      />

      <ActionRow winner={winner} cardRef={cardRef} />

      {/* v1.5.1 — archetype evolution. Loaded lazily; renders only when
          there's at least one drift event so brand-new users aren't
          shown an empty band that says "你还没演化". */}
      <EvolutionPanel myId={myId} />
    </div>
  );
}

// ===========================================================================
// v1.5.1 — EVOLUTION PANEL
// ===========================================================================

interface EvolutionPayload {
  originTraits: TraitVector;
  drift: TraitVector;
  effectiveTraits: TraitVector;
  originArchetypeId: string;
  currentArchetypeId: string;
  evolved: boolean;
  events: Array<{
    ts: number;
    kind: 'fired-completion' | 'squad-end' | 'talkshow-create' | 'pack-complete';
    delta: Partial<TraitVector>;
    summary: string;
  }>;
  ranked: Array<{ archetypeId: string; score: number; archetypeName: string; archetypeEmoji: string }>;
  /** v3.3.0 — "next milestone" projection. Undefined when no
   *  realistic milestone is in reach. See server-side
   *  archetypeEvolution.ts for the projection math. */
  nextMilestone?: {
    archetypeId: string;
    archetypeName: string;
    archetypeEmoji: string;
    scoreGap: number;
    leverTrait: string;
    leverTraitLabel: string;
    suggestedActivity: '裁员谈判' | '攒局' | '写段子' | '通关闯关包';
    estimatedPlays: number;
  };
}

/** v3.3.0 — deep-link target for each suggested activity, so the
 *  milestone card can be tappable. Keyed by the server-returned
 *  zh-CN activity name (the v3.3.0 enum). i18n labels for display
 *  go through ACTIVITY_LABEL_KEY → t() below. */
const ACTIVITY_ROUTE: Record<NonNullable<EvolutionPayload['nextMilestone']>['suggestedActivity'], string> = {
  '裁员谈判':    '/fired',
  '攒局':        '/squad/new',
  '写段子':      '/talkshow',
  '通关闯关包':  '/fired',
};

/** v3.6.0 — i18n label keys for the milestone CTA. Maps the zh-CN
 *  enum the server emits to the dict key the client uses. */
const ACTIVITY_LABEL_KEY: Record<NonNullable<EvolutionPayload['nextMilestone']>['suggestedActivity'], DictKey> = {
  '裁员谈判':    'evolution.activity.fired',
  '攒局':        'evolution.activity.squad',
  '写段子':      'evolution.activity.talkshow',
  '通关闯关包':  'evolution.activity.pack',
};

/** v3.6.0 — i18n key map for the event-kind chip in the recent-events
 *  feed. Server emits the kind enum verbatim. */
const EVENT_KIND_KEY: Record<EvolutionPayload['events'][number]['kind'], DictKey> = {
  'fired-completion': 'evolution.kind.fired-completion',
  'squad-end':         'evolution.kind.squad-end',
  'talkshow-create':   'evolution.kind.talkshow-create',
  'pack-complete':     'evolution.kind.pack-complete',
};

function EvolutionPanel({ myId }: { myId: string }) {
  const [ev, setEv] = useState<EvolutionPayload | null>(null);
  useEffect(() => {
    fetch('/api/quiz/evolution/me', { headers: { 'X-User-Id': myId } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { evolution: EvolutionPayload | null }) => setEv(d.evolution))
      .catch(() => { /* anonymous or offline — silently hide */ });
  }, [myId]);

  // v3.6.0 — i18n: subscribe to locale so the panel re-renders when
  // the user switches language mid-session.
  const { t } = useT();

  if (!ev || ev.events.length === 0) return null;

  const fromArc = findArchetype(ev.originArchetypeId);
  const toArc   = findArchetype(ev.currentArchetypeId);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="max-w-lg w-full mb-6"
      style={{
        background: '#fff',
        border: '4px solid #0a0a0a',
        borderRadius: 20,
        boxShadow: '6px 6px 0 0 #0a0a0a',
        overflow: 'hidden',
      }}
    >
      <div className="px-5 py-3 flex items-center justify-between"
        style={{ background: 'linear-gradient(135deg,#ffe300 0%,#ff2d92 50%,#6e00ff 100%)', color: '#0a0a0a' }}>
        <span className="text-sm font-black tracking-tight" style={{ textShadow: '1px 1px 0 #fff' }}>
          {t('evolution.title')}
        </span>
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase opacity-80">
          {ev.events.length} {t('evolution.recordSuffix')}
        </span>
      </div>

      {ev.evolved && fromArc && toArc && (
        <div className="px-5 py-4 flex items-center gap-3 border-b-2 border-black/10">
          <span className="text-2xl line-through opacity-60">{fromArc.emoji}</span>
          <div className="flex-1">
            <div className="text-[10px] tracking-[0.18em] uppercase text-rose-600 font-bold mb-0.5">
              {t('evolution.evolvedHeader')}
            </div>
            <div className="text-sm font-black text-black/90">
              {archetypeLabel(fromArc, 'name')} → <span style={{ color: toArc.colors.start }}>{toArc.emoji} {archetypeLabel(toArc, 'name')}</span>
            </div>
          </div>
        </div>
      )}

      {/* Drift bars — one row per trait that actually drifted. */}
      <div className="px-5 py-4">
        <div className="text-[10px] tracking-[0.18em] uppercase mb-3 text-black/55 font-bold">
          {t('evolution.driftHeader')}
        </div>
        <div className="space-y-2">
          {TRAIT_LABELS.map((tr) => {
            const v = ev.drift[tr.key];
            if (!v || Math.abs(v) < 0.05) return null;
            const sign = v > 0 ? '+' : '';
            const pct  = Math.min(100, (Math.abs(v) / 1.5) * 100);
            const color = v > 0 ? '#ff2d92' : '#4c9eff';
            // v3.6.0 — pull trait label from i18n DICT so en/ja/ko
            // users see localized rows instead of "内卷" etc.
            const traitName = t(`chemistry.trait.${tr.key}` as DictKey) || tr.label;
            return (
              <div key={tr.key} className="flex items-center gap-3 text-xs">
                <span className="w-12 font-bold text-black/85">{traitName}</span>
                <div className="flex-1 h-2 rounded-full"
                  style={{ background: 'rgba(0,0,0,0.08)' }}>
                  <div className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: color }} />
                </div>
                <span className="w-12 text-right font-mono tabular-nums font-bold"
                  style={{ color }}>{sign}{v.toFixed(2)}</span>
              </div>
            );
          })}
          {Object.values(ev.drift).every((v) => Math.abs(v ?? 0) < 0.05) && (
            <div className="text-[11px] text-black/45 py-2">
              {t('evolution.driftEmpty')}
            </div>
          )}
        </div>
      </div>

      {/* v3.3.0 — next milestone CTA. Tappable: deep-links to the
          suggested activity's route. Only renders when the server
          computed a realistic milestone (close runner-up + drift
          head-room remains). */}
      {ev.nextMilestone && (
        <a href={ACTIVITY_ROUTE[ev.nextMilestone.suggestedActivity]}
          className="block px-5 py-4 border-t-2 border-black/10 transition hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, rgba(255,184,76,0.18) 0%, rgba(255,45,146,0.10) 100%)' }}>
          <div className="text-[10px] tracking-[0.18em] uppercase mb-2 font-bold"
            style={{ color: '#d62876' }}>
            {t('evolution.milestoneHeader')}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-3xl flex-shrink-0">{ev.nextMilestone.archetypeEmoji}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-black text-black/95 mb-0.5">
                {/* v3.6.0 — i18n archetype name via shared helper.
                    findArchetype + archetypeLabel guarantee fallback
                    to zh-CN for v1.x archetypes. */}
                {(() => {
                  const arc = findArchetype(ev.nextMilestone.archetypeId);
                  return arc ? archetypeLabel(arc, 'name') : ev.nextMilestone.archetypeName;
                })()}
              </div>
              <div className="text-[11px] text-black/65 leading-snug">
                {t('evolution.milestoneGap')} <span className="font-bold tabular-nums">{ev.nextMilestone.scoreGap.toFixed(2)}</span> ·
                {' '}{t('evolution.milestoneLever')} <span className="font-bold">{t(`chemistry.trait.${ev.nextMilestone.leverTrait}` as DictKey) || ev.nextMilestone.leverTraitLabel}</span>
              </div>
              <div className="text-[11px] mt-1 font-bold" style={{ color: '#d62876' }}>
                {t('evolution.milestonePlay')} {ev.nextMilestone.estimatedPlays} {t('evolution.milestonePlayTimes')} 《{t(ACTIVITY_LABEL_KEY[ev.nextMilestone.suggestedActivity])}》 {t('evolution.milestonePlayWith')}
              </div>
            </div>
          </div>
        </a>
      )}

      {/* Recent events feed */}
      <div className="px-5 py-4 border-t-2 border-black/10">
        <div className="text-[10px] tracking-[0.18em] uppercase mb-2 text-black/55 font-bold">
          {t('evolution.recentEventsHeader')} ({Math.min(5, ev.events.length)})
        </div>
        <div className="space-y-1.5">
          {ev.events.slice(0, 5).map((e, i) => (
            <div key={i} className="text-[11px] flex gap-2 items-baseline">
              <span className="text-[9px] tracking-wider uppercase px-1.5 py-0.5 rounded font-bold tabular-nums"
                style={{ background: '#0a0a0a', color: '#ffe300' }}>
                {t(EVENT_KIND_KEY[e.kind])}
              </span>
              <span className="text-black/80 flex-1">{e.summary}</span>
              <span className="text-black/40 tabular-nums shrink-0">
                {new Date(e.ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ===========================================================================
// THE CARD
// ===========================================================================

interface ProfileCardProps {
  archetype:    Archetype;
  second?:      Archetype;
  third?:       Archetype;
  rival?:       Archetype;
  bestie?:      Archetype;
  traits:       TraitVector;
  personalized: PersonalizedProfile;
}

const ProfileCard = forwardRef<HTMLDivElement, ProfileCardProps>(function ProfileCard(
  { archetype, second, third, rival, bestie, traits, personalized },
  ref,
) {
  const grad = `linear-gradient(135deg, ${archetype.colors.start} 0%, ${archetype.colors.mid} 50%, ${archetype.colors.end} 100%)`;
  return (
    <div
      ref={ref}
      className="relative max-w-lg w-full y2k-sparkle mb-6"
      style={{
        background: '#fff',
        border: '4px solid #0a0a0a',
        borderRadius: 24,
        boxShadow: '8px 8px 0 0 #0a0a0a',
        overflow: 'hidden',
      }}
    >
      {/* Hero band */}
      <div className="px-6 py-8 text-center" style={{ background: grad }}>
        <div className="text-7xl mb-3" style={{ filter: 'drop-shadow(0 4px 0 rgba(0,0,0,0.3))' }}>
          {archetype.emoji}
        </div>
        <div
          className="y2k-display text-4xl mb-2"
          style={{ color: '#fff', textShadow: '3px 3px 0 #0a0a0a', letterSpacing: '-0.03em' }}
        >
          {/* v2.2.0 — i18n lookup. Falls back to raw zh-CN for v1.x
              archetypes that don't have dict entries. */}
          {archetypeLabel(archetype, 'name')}
        </div>
        <div
          className="text-sm font-bold inline-block px-3 py-1 rounded-full"
          style={{ background: '#fff', color: '#0a0a0a', border: '2px solid #0a0a0a' }}
        >
          {archetypeLabel(archetype, 'tagline')}
        </div>

        {/* v2.0.0 — region/industry tribe chips. Only render when the
            archetype actually has a tribe (the original 12 don't, so
            old profiles show nothing extra). */}
        {(archetype.region && archetype.region !== 'generic') ||
         (archetype.industry && archetype.industry !== 'generic') ? (
          <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
            {archetype.region && archetype.region !== 'generic' && REGION_LABEL[archetype.region] && (
              <span className="text-[11px] font-black px-2.5 py-1 rounded-full"
                style={{ background: '#0a0a0a', color: '#ffe300', border: '2px solid #ffe300' }}>
                {REGION_LABEL[archetype.region]}
              </span>
            )}
            {archetype.industry && archetype.industry !== 'generic' && INDUSTRY_LABEL[archetype.industry] && (
              <span className="text-[11px] font-black px-2.5 py-1 rounded-full"
                style={{ background: '#0a0a0a', color: '#00ddff', border: '2px solid #00ddff' }}>
                {INDUSTRY_LABEL[archetype.industry]}
              </span>
            )}
          </div>
        ) : null}
      </div>

      {/* Radar + hybrid */}
      <div className="px-5 pt-5 pb-3 flex gap-4 items-start">
        <RadarChart traits={traits} accent={archetype.colors.start} />
        <div className="flex-1 text-left">
          <div className="text-[10px] tracking-[0.2em] uppercase" style={{ color: '#666' }}>
            Hybrid 类型
          </div>
          <div className="text-sm font-black mt-1 mb-3" style={{ color: '#0a0a0a' }}>
            <span style={{ color: archetype.colors.start }}>主调:</span> {archetypeLabel(archetype, 'name')}
            {second && (
              <><br/><span style={{ color: '#666' }}>+ 一点:</span> {second.emoji} {archetypeLabel(second, 'name')}</>
            )}
            {third && (
              <><br/><span style={{ color: '#999' }}>+ 一丢丢:</span> {third.emoji} {archetypeLabel(third, 'name')}</>
            )}
          </div>
        </div>
      </div>

      {/* Catchphrases */}
      <div className="px-5 py-4">
        <div className="text-[10px] tracking-[0.2em] uppercase mb-2" style={{ color: '#666' }}>
          ✦ 你的招牌话术 ✦
        </div>
        <div className="space-y-2">
          {personalized.catchphrases.map((p, i) => (
            <div
              key={i}
              className="px-3 py-2 text-sm font-bold"
              style={{
                background: i === 0 ? '#ffe300' : i === 1 ? '#00ddff' : '#ff2d92',
                color: i === 2 ? '#fff' : '#0a0a0a',
                border: '2px solid #0a0a0a',
                borderRadius: 10,
                boxShadow: '3px 3px 0 0 #0a0a0a',
                transform: i === 1 ? 'rotate(-0.5deg)' : i === 2 ? 'rotate(0.7deg)' : 'none',
              }}
            >
              "{p}"
            </div>
          ))}
        </div>
      </div>

      {/* Rival / bestie */}
      {(rival || bestie) && (
        <div className="px-5 py-4 grid grid-cols-2 gap-3">
          {rival && (
            <div className="text-center py-3 px-2"
              style={{ background: '#0a0a0a', color: '#fff', border: '2px solid #0a0a0a', borderRadius: 10 }}>
              <div className="text-[10px] tracking-[0.2em] uppercase mb-1" style={{ color: '#ff2d92' }}>你的天敌</div>
              <div className="text-2xl mb-0.5">{rival.emoji}</div>
              <div className="text-xs font-bold">{archetypeLabel(rival, 'shortName')}</div>
            </div>
          )}
          {bestie && (
            <div className="text-center py-3 px-2"
              style={{ background: '#fff', color: '#0a0a0a', border: '2px solid #0a0a0a', borderRadius: 10 }}>
              <div className="text-[10px] tracking-[0.2em] uppercase mb-1" style={{ color: '#00ddff' }}>你的搭子</div>
              <div className="text-2xl mb-0.5">{bestie.emoji}</div>
              <div className="text-xs font-bold">{archetypeLabel(bestie, 'shortName')}</div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="px-5 py-3 flex items-center justify-between text-[10px]"
        style={{ background: '#0a0a0a', color: '#fff' }}>
        <span style={{ letterSpacing: '0.1em', fontWeight: 800 }}>🐀 OFFICE ZOO</span>
        <span style={{ color: 'rgba(255,255,255,0.55)' }}>
          找到你的班味 · {typeof window !== 'undefined' ? window.location.host : ''}
        </span>
      </div>
    </div>
  );
});

// ===========================================================================

function RadarChart({ traits, accent }: { traits: TraitVector; accent: string }) {
  const SIZE = 120;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const R  = SIZE / 2 - 14;
  const points = TRAIT_LABELS.map((t, i) => {
    const angle = (Math.PI * 2 * i) / TRAIT_LABELS.length - Math.PI / 2;
    const v = Math.max(0, Math.min(1, traits[t.key] / 12));
    return {
      x: CX + Math.cos(angle) * R * v,
      y: CY + Math.sin(angle) * R * v,
      label: t.label,
      lx: CX + Math.cos(angle) * (R + 8),
      ly: CY + Math.sin(angle) * (R + 8),
    };
  });
  const polyD = points.map((p) => `${p.x},${p.y}`).join(' ');
  const axes = TRAIT_LABELS.map((_, i) => {
    const angle = (Math.PI * 2 * i) / TRAIT_LABELS.length - Math.PI / 2;
    return { x2: CX + Math.cos(angle) * R, y2: CY + Math.sin(angle) * R };
  });

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
      {axes.map((a, i) => (
        <line key={i} x1={CX} y1={CY} x2={a.x2} y2={a.y2}
          stroke="rgba(0,0,0,0.15)" strokeWidth="1" />
      ))}
      {[0.33, 0.66, 1].map((r, i) => (
        <circle key={i} cx={CX} cy={CY} r={R * r}
          fill="none" stroke="rgba(0,0,0,0.10)" strokeWidth="1" />
      ))}
      <polygon points={polyD} fill={accent + '88'} stroke={accent} strokeWidth="2" />
      {points.map((p, i) => (
        <text key={i} x={p.lx} y={p.ly}
          fontSize="8" fontWeight="800" fill="#0a0a0a"
          textAnchor="middle" alignmentBaseline="middle">
          {p.label}
        </text>
      ))}
    </svg>
  );
}

// ===========================================================================

function ActionRow({
  winner,
  cardRef,
}: {
  winner: Archetype;
  cardRef: React.RefObject<HTMLDivElement | null>;
}) {
  const navigate = useNavigate();
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const flashToast = (msg: string) => {
    setShareToast(msg);
    setTimeout(() => setShareToast(null), 2400);
  };

  const shareLink = async () => {
    const url = `${window.location.origin}/quiz`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `班味卡 · ${winner.name}`,
          text: `我是 ${winner.emoji} ${winner.name}: ${winner.tagline}`,
          url,
        });
        return;
      }
    } catch { /* user cancelled */ }
    try {
      await navigator.clipboard.writeText(url);
      flashToast('✓ 链接已复制 — 发给朋友测一下');
    } catch { /* clipboard blocked */ }
  };

  /** v1.3.1 — real PNG export.
   *  Strategy: clone the card into a fixed 1080-px-wide off-screen
   *  container so html2canvas captures consistently regardless of the
   *  viewport, then render to canvas at 1.5× scale (1620 px wide,
   *  good for retina). Try Web Share API with the blob first for
   *  mobile single-tap share-as-image; fall back to download trigger. */
  const exportPng = async () => {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      // Lazy-load html2canvas to keep the initial bundle slim — only
      // visitors who actually export pay the ~50KB cost.
      const { default: html2canvas } = await import('html2canvas');

      // Clone into a fixed-width off-screen wrapper for stable layout.
      const original = cardRef.current;
      const clone = original.cloneNode(true) as HTMLElement;
      const wrap = document.createElement('div');
      wrap.style.cssText = [
        'position: fixed', 'top: -10000px', 'left: 0',
        'width: 1080px',                       // hardcode to match social aspect
        'padding: 32px',
        'background: linear-gradient(135deg, #ff2d92 0%, #6e00ff 50%, #00ddff 100%)',
      ].join(';');
      // Force the cloned card to honor the export width.
      clone.style.maxWidth = 'none';
      clone.style.width = '100%';
      wrap.appendChild(clone);
      document.body.appendChild(wrap);

      try {
        const canvas = await html2canvas(wrap, {
          // 1.5× = 1620 px wide PNG — sharp on retina without exploding file size.
          scale: 1.5,
          backgroundColor: null,
          logging: false,
          useCORS: true,
        });

        const blob: Blob | null = await new Promise((resolve) =>
          canvas.toBlob((b) => resolve(b), 'image/png', 0.95),
        );
        if (!blob) throw new Error('canvas.toBlob returned null');

        const fileName = `班味卡-${winner.name}-${Date.now()}.png`;
        const file = new File([blob], fileName, { type: 'image/png' });

        // Mobile: try native share-as-file. Web Share Level 2 requires
        // navigator.canShare check.
        if (navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: `班味卡 · ${winner.name}`,
              text: `我是 ${winner.emoji} ${winner.name}`,
            });
            flashToast('✓ 已分享');
            return;
          } catch { /* user cancelled — fall through to download */ }
        }

        // Desktop / fallback: trigger download.
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        flashToast('✓ 班味卡 PNG 已下载');
      } finally {
        document.body.removeChild(wrap);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[profile] export failed', err);
      flashToast('💡 导出失败 — 长按卡片(手机)/ 右键截图(电脑)也行');
    } finally {
      setExporting(false);
    }
  };

  /** Quick-jump into the user's "命中场景" — the seed scenario this
   *  archetype is designed to shine in. Deeplink param is consumed by
   *  FiredLanding. */
  const playShine = () => {
    navigate(`/fired?focus=${winner.shineScenarioId}`);
  };

  return (
    <>
      <div className="max-w-lg w-full grid grid-cols-3 gap-2 mb-3">
        <button onClick={shareLink} className="y2k-cta" style={{ fontSize: 13, padding: '0.625rem 0.5rem' }}>
          🔗 分享
        </button>
        <button
          onClick={exportPng}
          disabled={exporting}
          className="y2k-cta"
          style={{
            fontSize: 13, padding: '0.625rem 0.5rem',
            background: 'linear-gradient(135deg, #00ddff 0%, #6e00ff 100%)',
            color: '#fff',
            opacity: exporting ? 0.7 : 1,
          }}
          title="生成 1080×1620 PNG,可发朋友圈 / 小红书 / IG"
        >
          {exporting ? '⏳ 导出中…' : '📸 保存 PNG'}
        </button>
        <button onClick={playShine} className="y2k-cta" style={{
          fontSize: 13, padding: '0.625rem 0.5rem',
          background: '#0a0a0a',
          color: '#ffe300',
        }}>
          🎯 命中剧本
        </button>
      </div>
      {shareToast && (
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-sm font-bold"
          style={{
            background: '#0a0a0a', color: '#fff', border: '2px solid #ffe300',
            boxShadow: '4px 4px 0 0 #ff2d92',
          }}
        >
          {shareToast}
        </motion.div>
      )}
    </>
  );
}
