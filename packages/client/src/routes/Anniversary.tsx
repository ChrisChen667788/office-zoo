/**
 * Anniversary — v6.29 P4 周年纪念 mode.
 *
 * Project spans 28+ iteration rounds (v6.0 → v6.29) with several
 * decisive design pivots. This route is the "time capsule" — a
 * deck of 6 milestone cards walking the user through what shipped
 * when + why each one mattered. Pure marketing / brag surface; no
 * gameplay impact.
 *
 * Style: re-uses the EventPill + brand palette so it feels like
 * a "v6 anniversary" promo card spread, not a CHANGELOG dump.
 * Each milestone has icon, version, headline, body, color accent.
 *
 * Entry: Landing carries a small "周年回顾 ↗" chip near the brand
 * mark; this route is also linkable from outside (Twitter share etc).
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import EventPill from '../components/EventPill';
import { setProgress as setAchievementProgress } from '../utils/achievements';

interface Milestone {
  ver: string;
  date: string;
  icon: string;
  headline: string;
  subline: string;
  body: string;
  accent: string;
}

const MILESTONES: Milestone[] = [
  {
    ver: 'v6.8',
    date: '2026-05-21',
    icon: '🐀',
    headline: '鼠人 IP 反差萌系统上线',
    subline: 'CharacterCard × PersonaCard × IdleBeat',
    body: '12 个英文鼠人花名 (Tony "Excel 永动机" / Helen "茶水间情报站" ...) 配每局随机抽的 8 个人格. 反差萌点燃: "Tony 这局居然是社恐". 配套米哈游式 phase transition 仪式感 + 8 性格 × 8 typing idle 微动作.',
    accent: '#FFD700',
  },
  {
    ver: 'v6.16',
    date: '2026-05-23',
    icon: '🗳️',
    headline: '鼠人选秀 — 你投票决定下周人格分布',
    subline: 'Weekly personality bias loop',
    body: 'GameEngine.assignPersonalities 加 50% weekly-winner override 偏置. 用户每周投票 12 鼠人最该是哪种人格, 下周服务器真按这个分布发牌. 第一个让 spectator 玩法跨周链接起来的反馈环.',
    accent: '#FF4FA3',
  },
  {
    ver: 'v6.21',
    date: '2026-05-24',
    icon: '🥱',
    headline: 'GameMap 摸鱼 micro-moment',
    subline: 'idleMoments emoji bubble engine',
    body: '每只活鼠头顶 ~10s 漂 ~4s 一个气泡 (☕ / 💤 / 📱 / 💢 ...) — 按 activity × 房间 × 邻近 furniture (≤70px) 加权, hash 错峰. 让 watch-mode 不再死板, 每帧都有 micro-moment 抓眼.',
    accent: '#B086FF',
  },
  {
    ver: 'v6.22',
    date: '2026-05-24',
    icon: '👻',
    headline: '前同事吐槽群 (GhostChatPanel)',
    subline: '弹幕 → 持久 IM 风 chat panel',
    body: '把已有的"鬼魂弹幕"(server LLM 已有) 重新组装成右下角的"前同事吐槽群" — 微信群既视感, 出局鼠人加入有 welcome reaction, 真鬼魂 vote 紫色 dot 圈活人. 服务器零改, 客户端语言重述.',
    accent: '#2fb8ff',
  },
  {
    ver: 'v6.25-27',
    date: '2026-05-26',
    icon: '💢',
    headline: 'PSYWAR — 心理战完整闭环',
    subline: '战术 @ → AI 听到 → AI 引用 → ✨ Profile 统计',
    body: '玩家给 AI 发匿名前同事爆料. server 注入下回合 discussion prompt → 👂 "AI 听到了". AI 真在 speech 里引用 → 金色 ✨ 标 (4-char + token Jaccard 双 tier 检测). 一键跳到那条 speech 金光闪. Profile 个人命中率 cumulative. 6 步反馈链每步都给玩家投入回报.',
    accent: '#FFD700',
  },
  {
    ver: 'v6.28',
    date: '2026-05-26',
    icon: '🚀',
    headline: '基础设施收尾',
    subline: 'typecheck 零错 + 58 tests + mobile 系统验证 + git-cliff',
    body: '从 "能跑" 到 "能持续跑": typecheck 零 baseline 错; vitest 58 tests 覆盖 GameEngine state machine + idleMoments + leakStats; mobile 6 路 0 horizontal overflow; git-cliff 自动 CHANGELOG 骨架; FP audit baseline 1.60%; RulesModal 3-step swipe deck.',
    accent: '#4ECDC4',
  },
];

export default function Anniversary() {
  const navigate = useNavigate();
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && idx < MILESTONES.length - 1) setIdx(idx + 1);
      else if (e.key === 'ArrowLeft' && idx > 0) setIdx(idx - 1);
      else if (e.key === 'Escape') navigate('/');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, navigate]);

  // v6.30 P4 — mark anniversary deck as "finished" once user reaches
  // the final slide. setProgress is idempotent (no repeat-bump). Also
  // covers the via-dot-jump case (user clicks last dot without
  // walking the deck).
  useEffect(() => {
    if (idx === MILESTONES.length - 1) setAchievementProgress('anniversary_finished', 1);
  }, [idx]);

  const m = MILESTONES[idx];

  return (
    <div
      className="relative min-h-screen overflow-hidden noise"
      style={{ background: 'linear-gradient(180deg, #0a0a1e 0%, #1a0d35 100%)' }}
    >
      {/* Background aurora — soft accent blob per milestone */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <motion.div
          key={`bg-${idx}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.45 }}
          transition={{ duration: 0.6 }}
          className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full"
          style={{
            background: `radial-gradient(circle, ${m.accent}55 0%, transparent 65%)`,
            filter: 'blur(60px)',
          }}
        />
      </div>

      {/* Top nav */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4">
        <button
          onClick={() => navigate('/')}
          className="text-sm text-white/70 hover:text-white font-bold"
        >← 回 Landing</button>
        <EventPill>v6 周年回顾 · 28 轮</EventPill>
        <div className="text-xs text-white/40 font-mono tracking-wider">
          {idx + 1} / {MILESTONES.length}
        </div>
      </div>

      {/* Stage */}
      <div className="relative z-10 flex items-center justify-center px-6"
        style={{ minHeight: 'calc(100vh - 200px)' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={m.ver}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.97 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-2xl"
          >
            <div style={{
              padding: 'clamp(24px, 4vw, 40px)',
              borderRadius: 20,
              background: 'rgba(15,14,46,0.78)',
              backdropFilter: 'blur(24px) saturate(140%)',
              border: `1px solid ${m.accent}55`,
              boxShadow: `0 0 60px ${m.accent}28, 0 20px 60px rgba(0,0,0,0.4)`,
            }}>
              <div className="flex items-baseline gap-3 mb-1">
                <span style={{ fontSize: 48 }}>{m.icon}</span>
                <div>
                  <div style={{
                    fontSize: 10, fontWeight: 900, letterSpacing: '0.2em',
                    color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase',
                  }}>{m.ver} · {m.date}</div>
                </div>
              </div>
              <h1 style={{
                fontSize: 'clamp(22px, 3vw, 32px)',
                fontWeight: 900, lineHeight: 1.2, marginTop: 8,
                color: m.accent,
              }}>{m.headline}</h1>
              <div style={{
                fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
                color: 'rgba(255,255,255,0.5)', marginTop: 4, marginBottom: 16,
                fontFamily: 'ui-monospace, monospace',
              }}>{m.subline}</div>
              <p style={{
                fontSize: 14, lineHeight: 1.75,
                color: 'rgba(248,244,227,0.85)',
              }}>{m.body}</p>
            </div>

            {/* Nav row */}
            <div className="flex items-center justify-between mt-6 px-2">
              <button
                onClick={() => setIdx(Math.max(0, idx - 1))}
                disabled={idx === 0}
                className="px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-30"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  color: 'rgba(255,255,255,0.8)',
                  border: '1px solid rgba(255,255,255,0.12)',
                }}
              >← 上一站</button>
              <div className="flex items-center gap-1.5">
                {MILESTONES.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setIdx(i)}
                    style={{
                      width: i === idx ? 24 : 6, height: 6, borderRadius: 4,
                      background: i === idx ? m.accent : 'rgba(255,255,255,0.18)',
                      border: 'none', cursor: 'pointer',
                      transition: 'all 0.22s ease',
                    }}
                  />
                ))}
              </div>
              <button
                onClick={() => idx < MILESTONES.length - 1 ? setIdx(idx + 1) : navigate('/')}
                className="px-5 py-2 rounded-lg text-sm font-black tracking-wider"
                style={{
                  background: `linear-gradient(135deg, ${m.accent} 0%, ${m.accent}aa 100%)`,
                  color: '#0a0a1e',
                  boxShadow: `0 4px 16px ${m.accent}45`,
                }}
              >{idx < MILESTONES.length - 1 ? '下一站 →' : '回 Landing 🚀'}</button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer tagline */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] tracking-[0.22em] uppercase text-white/30">
        OFFICE ZOO · 0 点的写字楼 · v6 anniversary capsule
      </div>
    </div>
  );
}
