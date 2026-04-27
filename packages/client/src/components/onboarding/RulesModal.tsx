/**
 * RulesModal — "How to Play" onboarding modal.
 *
 * Shown on demand (via a help button on Landing) and on first visit
 * (tracked via localStorage). Explains the three game modes, the win
 * conditions, and the phase loop so first-time viewers understand
 * what they're watching.
 *
 * Not a full tutorial — MVP-scope, single-scroll content.
 */
import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const FIRST_VISIT_KEY = 'office-arena.seen-rules';

/** Marks the user as having seen the rules. Idempotent. */
export function markRulesSeen() {
  try { localStorage.setItem(FIRST_VISIT_KEY, '1'); } catch { /* quota/private-mode */ }
}

/** True only on the user's first session — call once on app load. */
export function shouldAutoShowRules(): boolean {
  try { return localStorage.getItem(FIRST_VISIT_KEY) !== '1'; } catch { return false; }
}

interface RulesModalProps {
  open: boolean;
  onClose: () => void;
}

export default function RulesModal({ open, onClose }: RulesModalProps) {
  // Dismiss on Escape — standard a11y affordance.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          style={{ background: 'rgba(5, 5, 15, 0.75)', backdropFilter: 'blur(10px)' }}
        >
          <motion.div
            className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl p-8"
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 20, opacity: 0 }}
            transition={{ type: 'spring', damping: 24, stiffness: 300 }}
            style={{
              background: 'linear-gradient(150deg, rgba(15,14,46,0.95) 0%, rgba(26,16,64,0.95) 100%)',
              border: '1px solid rgba(47, 184, 255, 0.25)',
              boxShadow: '0 0 60px rgba(47, 184, 255, 0.15), inset 0 1px 0 rgba(255,255,255,0.08)',
            }}
          >
            {/* Close button (X) */}
            <button
              onClick={onClose}
              aria-label="关闭"
              className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition"
            >
              ✕
            </button>

            <h2 className="text-2xl font-black mb-1"
              style={{
                background: 'linear-gradient(135deg, #2fb8ff, #a855f7)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>
              怎么玩 · How to Play
            </h2>
            <p className="text-xs tracking-[0.2em] uppercase mb-6 text-white/40">
              Office Arena · 三分钟上手
            </p>

            {/* Mode overview */}
            <Section title="🎮 三种模式">
              <ModeRow icon="🏢" name="经典模式"
                desc="观战 AI 员工在 2.5D 办公室里搬砖、开会、投票。适合喜欢看策略演化的观众。" />
              <ModeRow icon="🎤" name="沉浸模式"
                desc="全程 TTS 语音 + 围坐视角,像在茶水间偷听 AI 互撕。" />
              <ModeRow icon="⚖️" name="裁了么"
                desc="你亲自上阵,与黑心 HR 斗智斗勇,四维评分看你能不能保住工资。" />
            </Section>

            {/* Factions */}
            <Section title="⚔️ 三大阵营">
              <FactionRow color="#4FC3F7" label="打工人"
                desc="票出所有资本家即胜利。有程序员/HR/工会等职能。" />
              <FactionRow color="#F44336" label="资本家"
                desc="让打工人数量 ≤ 资本家数量即胜利。夜间'优化'员工。" />
              <FactionRow color="#A855F7" label="摸鱼党"
                desc="独立阵营,各自有专属胜利条件(比如活到最后、被冤枉下岗等)。" />
            </Section>

            {/* Phase loop */}
            <Section title="🔄 回合循环">
              <ol className="space-y-2 text-sm text-white/70 pl-5 list-decimal">
                <li><b className="text-white/90">日常搬砖</b>:员工完成 KPI 任务,资本家伺机"优化"。</li>
                <li><b className="text-white/90">紧急全员会</b>:系统公告有人被开除。</li>
                <li><b className="text-white/90">职场撕逼</b>:每人按座次发言,AI 会根据个性 + 角色互相甩锅。</li>
                <li><b className="text-white/90">投票裁员</b>:全体投票送走一位同事,平票无人出局。</li>
                <li>重复直到某阵营达到胜利条件。</li>
              </ol>
            </Section>

            {/* Tip */}
            <div className="mt-6 rounded-xl p-4 text-sm"
              style={{ background: 'rgba(47,184,255,0.06)', border: '1px solid rgba(47,184,255,0.15)' }}>
              <span className="text-[#2fb8ff] font-bold">💡 提示:</span>
              <span className="text-white/70 ml-2">
                弹幕里的👻是已经被开除的员工在吐槽,他们还能行使一次"劳动仲裁票"。
              </span>
            </div>

            <button
              onClick={onClose}
              className="mt-6 w-full py-3 rounded-xl font-bold tracking-wider transition"
              style={{
                background: 'linear-gradient(135deg, #2fb8ff, #5e17ff)',
                color: '#fff',
                boxShadow: '0 0 20px rgba(47,184,255,0.3)',
              }}
            >
              我懂了,开始上班
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ──────── sub-components ──────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="text-sm font-bold mb-2 text-white/85">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ModeRow({ icon, name, desc }: { icon: string; name: string; desc: string }) {
  return (
    <div className="flex gap-3 rounded-lg p-3"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <span className="text-xl">{icon}</span>
      <div className="flex-1">
        <div className="text-sm font-bold text-white/90">{name}</div>
        <div className="text-xs text-white/55 mt-0.5 leading-relaxed">{desc}</div>
      </div>
    </div>
  );
}

function FactionRow({ color, label, desc }: { color: string; label: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg p-3"
      style={{
        background: `${color}0d`,
        border: `1px solid ${color}33`,
      }}>
      <span className="w-1 rounded-full self-stretch" style={{ background: color }} />
      <div className="flex-1">
        <div className="text-sm font-bold" style={{ color }}>{label}</div>
        <div className="text-xs text-white/55 mt-0.5 leading-relaxed">{desc}</div>
      </div>
    </div>
  );
}
