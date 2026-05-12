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
import type { PersonalizedProfile, UserProfile } from '../utils/profileTypes';

const TRAIT_LABELS: Array<{ key: keyof TraitVector; label: string }> = [
  { key: 'grind',      label: '内卷' },
  { key: 'snark',      label: '阴阳' },
  { key: 'ambition',   label: '上进' },
  { key: 'empathy',    label: '人情' },
  { key: 'cynicism',   label: '摆烂' },
  { key: 'visibility', label: '显眼' },
];

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

      <ActionRow winner={winner} />
    </div>
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
          {archetype.name}
        </div>
        <div
          className="text-sm font-bold inline-block px-3 py-1 rounded-full"
          style={{ background: '#fff', color: '#0a0a0a', border: '2px solid #0a0a0a' }}
        >
          {archetype.tagline}
        </div>
      </div>

      {/* Radar + hybrid */}
      <div className="px-5 pt-5 pb-3 flex gap-4 items-start">
        <RadarChart traits={traits} accent={archetype.colors.start} />
        <div className="flex-1 text-left">
          <div className="text-[10px] tracking-[0.2em] uppercase" style={{ color: '#666' }}>
            Hybrid 类型
          </div>
          <div className="text-sm font-black mt-1 mb-3" style={{ color: '#0a0a0a' }}>
            <span style={{ color: archetype.colors.start }}>主调:</span> {archetype.name}
            {second && (
              <><br/><span style={{ color: '#666' }}>+ 一点:</span> {second.emoji} {second.name}</>
            )}
            {third && (
              <><br/><span style={{ color: '#999' }}>+ 一丢丢:</span> {third.emoji} {third.name}</>
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
              <div className="text-xs font-bold">{rival.name}</div>
            </div>
          )}
          {bestie && (
            <div className="text-center py-3 px-2"
              style={{ background: '#fff', color: '#0a0a0a', border: '2px solid #0a0a0a', borderRadius: 10 }}>
              <div className="text-[10px] tracking-[0.2em] uppercase mb-1" style={{ color: '#00ddff' }}>你的搭子</div>
              <div className="text-2xl mb-0.5">{bestie.emoji}</div>
              <div className="text-xs font-bold">{bestie.name}</div>
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

function ActionRow({ winner }: { winner: Archetype }) {
  const navigate = useNavigate();
  const [shareToast, setShareToast] = useState<string | null>(null);

  const flashToast = (msg: string) => {
    setShareToast(msg);
    setTimeout(() => setShareToast(null), 2200);
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

  // v1.3.0: screenshot hint instead of html2canvas (saves ~50KB bundle).
  // v1.3.1 ships PNG export when needed.
  const captureHint = () => flashToast('💡 长按卡片(手机)/ 右键截图(电脑)即可保存');

  // Quick-jump into the user's "命中场景" — the seed scenario this
  // archetype is designed to shine in.
  const playShine = () => {
    // v1.3.1 will deeplink with shineScenarioId pre-selected.
    navigate(`/fired?focus=${winner.shineScenarioId}`);
  };

  return (
    <>
      <div className="max-w-lg w-full grid grid-cols-3 gap-2 mb-3">
        <button onClick={shareLink} className="y2k-cta" style={{ fontSize: 13, padding: '0.625rem 0.5rem' }}>
          🔗 分享
        </button>
        <button onClick={captureHint} className="y2k-cta" style={{
          fontSize: 13, padding: '0.625rem 0.5rem',
          background: 'linear-gradient(135deg, #00ddff 0%, #6e00ff 100%)',
          color: '#fff',
        }}>
          📸 截图
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
