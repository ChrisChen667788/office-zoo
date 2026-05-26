/**
 * RulesModal — "How to Play" onboarding deck (v6.28 P5 refactor).
 *
 * Was a single ~250-LOC scroll modal (v6.7 era); felt like reading a
 * manual. Now 3-step swipe deck:
 *
 *   Step 1 · 三种模式      — 经典 / 沉浸 / 截了么 的一句话定位
 *   Step 2 · 三大阵营 + 回合 — 打工人 / 资本家 / 摸鱼党 + 简化 phase loop
 *   Step 3 · 新功能           — 鬼魂吐槽 / 战术 @ / ✨ AI 引用反馈环
 *
 * Bottom row: progress dots + Back / Next / Skip / Start CTAs. Auto
 * shows on first visit (preserves localStorage 'office-zoo.seen-rules'
 * sentinel from v6.25 P8 migration).
 *
 * Accessibility: ← → keyboard nav + Esc dismiss. Click outside dim
 * still works (calls onClose without setting seen — so re-opening
 * starts back at step 1).
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const FIRST_VISIT_KEY = 'office-zoo.seen-rules';

export function markRulesSeen() {
  try { localStorage.setItem(FIRST_VISIT_KEY, '1'); } catch { /* quota/private-mode */ }
}

export function shouldAutoShowRules(): boolean {
  try { return localStorage.getItem(FIRST_VISIT_KEY) !== '1'; } catch { return false; }
}

interface RulesModalProps {
  open: boolean;
  onClose: () => void;
}

const TOTAL_STEPS = 3;

export default function RulesModal({ open, onClose }: RulesModalProps) {
  const [step, setStep] = useState(0);

  // Reset to step 1 each time the modal opens. (If we kept the last
  // step, returning users would land mid-deck — awkward.)
  useEffect(() => { if (open) setStep(0); }, [open]);

  // Keyboard nav: Esc dismiss, ← / → step.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' && step < TOTAL_STEPS - 1) setStep(step + 1);
      else if (e.key === 'ArrowLeft' && step > 0) setStep(step - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, step]);

  function next() {
    if (step < TOTAL_STEPS - 1) setStep(step + 1);
    else { markRulesSeen(); onClose(); }
  }

  function skip() { markRulesSeen(); onClose(); }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          style={{ background: 'rgba(5, 5, 15, 0.78)', backdropFilter: 'blur(10px)' }}
        >
          <motion.div
            className="relative w-full max-w-md rounded-2xl"
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 20, opacity: 0 }}
            transition={{ type: 'spring', damping: 24, stiffness: 280 }}
            style={{
              background: 'linear-gradient(150deg, rgba(15,14,46,0.96) 0%, rgba(26,16,64,0.96) 100%)',
              border: '1px solid rgba(255,215,0,0.30)',
              boxShadow: '0 0 60px rgba(255,79,163,0.18), 0 20px 60px rgba(0,0,0,0.5)',
              minHeight: 420,
            }}
          >
            {/* Header */}
            <div style={{
              padding: '20px 24px 12px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div className="flex items-baseline justify-between">
                <h2 className="text-xl font-black"
                  style={{
                    background: 'linear-gradient(135deg, #FFD700, #FFA947)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  }}>
                  怎么玩 · How to Play
                </h2>
                <button
                  onClick={skip}
                  className="text-xs text-white/40 hover:text-white/70 transition"
                >跳过</button>
              </div>
              <p className="text-[10px] tracking-[0.22em] uppercase mt-1 text-white/35">
                OFFICE ZOO · 三步入门
              </p>
            </div>

            {/* Step content — AnimatePresence with mode="wait" so old
                step animates out fully before new mounts. */}
            <div style={{ padding: '20px 24px', minHeight: 280 }}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={{ duration: 0.22 }}
                >
                  {step === 0 && <Step1Modes />}
                  {step === 1 && <Step2Factions />}
                  {step === 2 && <Step3NewFeatures />}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer — progress dots + nav buttons */}
            <div style={{
              padding: '12px 24px 20px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12,
            }}>
              <div className="flex items-center gap-1.5">
                {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setStep(i)}
                    aria-label={`Go to step ${i + 1}`}
                    style={{
                      width: i === step ? 22 : 6, height: 6, borderRadius: 4,
                      background: i === step ? '#FFD700' : 'rgba(255,255,255,0.18)',
                      border: 'none', cursor: 'pointer',
                      transition: 'all 0.22s ease',
                    }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                {step > 0 && (
                  <button
                    onClick={() => setStep(step - 1)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-white/60 hover:text-white hover:bg-white/5"
                  >← 上一页</button>
                )}
                <button
                  onClick={next}
                  className="px-5 py-2 rounded-lg text-sm font-black tracking-wider"
                  style={{
                    background: 'linear-gradient(135deg, #FFD700, #FFA947)',
                    color: '#0a0a1e',
                    boxShadow: '0 4px 16px rgba(255,215,0,0.32)',
                  }}
                >{step < TOTAL_STEPS - 1 ? '下一页 →' : '开始 🚀'}</button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── Step 1 — 三种模式 ─────────────────────────────────────────────── */

function Step1Modes() {
  return (
    <div>
      <div className="text-xs tracking-[0.2em] uppercase mb-3 text-white/45">
        Step 1 · 选个模式
      </div>
      <div className="space-y-3">
        <ModeRow icon="🏢" name="经典模式" accent="#2fb8ff"
          desc="2.5D 办公室, 9 只 AI 鼠人搬砖 / 撕逼 / 投票. 像看综艺。" />
        <ModeRow icon="🎤" name="沉浸模式" accent="#a855f7"
          desc="全程 TTS 语音 + 围坐视角, 像茶水间偷听互撕。" />
        <ModeRow icon="⚖️" name="截了么" accent="#ef4444"
          desc="你 vs 黑心 HR, 四维评分, 看能不能保住工资。" />
      </div>
    </div>
  );
}

/* ── Step 2 — 三大阵营 + 回合循环 ────────────────────────────────── */

function Step2Factions() {
  return (
    <div>
      <div className="text-xs tracking-[0.2em] uppercase mb-3 text-white/45">
        Step 2 · 谁打谁
      </div>
      <div className="space-y-2 mb-4">
        <FactionRow color="#4FC3F7" label="打工人" emoji="🐱"
          desc="票出所有资本家就赢" />
        <FactionRow color="#F44336" label="资本家" emoji="🐶"
          desc='夜里"优化"员工, 数量翻盘就赢' />
        <FactionRow color="#A855F7" label="摸鱼党" emoji="🪐"
          desc="独立胜利条件, 看你怎么浑水摸鱼" />
      </div>
      <div className="text-[10px] tracking-[0.18em] uppercase mt-4 mb-2 text-white/35">
        回合循环 · 5 phase
      </div>
      <div className="text-[11px] text-white/55 leading-relaxed">
        日常搬砖 → 紧急全员会 → 职场撕逼 → 投票裁员 → 重复
      </div>
    </div>
  );
}

/* ── Step 3 — 新功能 (v6.x) ─────────────────────────────────────── */

function Step3NewFeatures() {
  return (
    <div>
      <div className="text-xs tracking-[0.2em] uppercase mb-3 text-white/45">
        Step 3 · 进阶玩法
      </div>
      <div className="space-y-3">
        <FeatureRow icon="👻" title="前同事吐槽群"
          desc="被裁的鼠人在右下角群里实时吐槽场上活人, 自带 react 互动。" />
        <FeatureRow icon="💢" title="战术 @ (心理战)"
          desc="你给 AI 发匿名前同事爆料 — 它真听到, 真引用, 你能在 Profile 看命中率。" />
        <FeatureRow icon="✨" title="AI 引用了"
          desc="AI 在 speech 里真用了你的爆料? 金色 ✨ 标 + 一键跳到那句话。" />
      </div>
    </div>
  );
}

/* ── Subcomponents ─────────────────────────────────────────────────── */

function ModeRow({ icon, name, accent, desc }: { icon: string; name: string; accent: string; desc: string }) {
  return (
    <div style={{
      display: 'flex', gap: 12, padding: '10px 12px',
      borderRadius: 10,
      background: `${accent}10`, border: `1px solid ${accent}38`,
    }}>
      <span style={{ fontSize: 22 }}>{icon}</span>
      <div className="flex-1">
        <div className="text-sm font-black" style={{ color: accent }}>{name}</div>
        <div className="text-[11px] text-white/60 mt-0.5 leading-relaxed">{desc}</div>
      </div>
    </div>
  );
}

function FactionRow({ color, label, emoji, desc }: { color: string; label: string; emoji: string; desc: string }) {
  return (
    <div className="flex items-center gap-3" style={{
      padding: '6px 10px', borderRadius: 8,
      background: `${color}10`, border: `1px solid ${color}30`,
    }}>
      <span style={{ fontSize: 16 }}>{emoji}</span>
      <span className="text-sm font-bold" style={{ color, minWidth: 50 }}>{label}</span>
      <span className="text-[11px] text-white/55">{desc}</span>
    </div>
  );
}

function FeatureRow({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div style={{
      display: 'flex', gap: 12, padding: '10px 12px',
      borderRadius: 10,
      background: 'rgba(255,215,0,0.06)', border: '1px solid rgba(255,215,0,0.25)',
    }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <div className="flex-1">
        <div className="text-sm font-black" style={{ color: '#FFD58A' }}>{title}</div>
        <div className="text-[11px] text-white/60 mt-0.5 leading-relaxed">{desc}</div>
      </div>
    </div>
  );
}
