/**
 * Premium — v1.0.0 paywall page.
 *
 * Two-section layout:
 *   1. Hero — pricing card with monthly + annual toggle, big CTA
 *   2. Features — what you unlock (海外大厂场景 / 律师入口 / 高级 voice / 无限回放)
 *
 * v1.0.0 ships with **demo checkout** — clicking the CTA flips the
 * localStorage entitlement flag without contacting any payment provider.
 * The "Demo mode" banner makes this explicit so users know they're not
 * actually being charged. When real Stripe lands later, the demo modal
 * gets swapped for a Stripe Checkout redirect; the rest of the page
 * (pricing, copy, gates) doesn't change.
 *
 * Comes with a tiny "重置为免费用户" debug button at the bottom so
 * developers / curious users can flip back without clearing all
 * localStorage manually.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  isPremium,
  setPremium,
  clearPremium,
  getEntitlement,
  subscribeEntitlement,
  type Entitlement,
  type PremiumPlan,
} from '../utils/entitlement';
import { useT } from '../utils/i18n';

const FEATURES: Array<{ emoji: string; title: string; body: string; status: 'live' | 'soon' }> = [
  {
    emoji: '🌍',
    title: '海外大厂场景包',
    body: 'Twitter Purge / Meta 效率裁员 / Amazon RTO / Apple PM / Google reorg / startup cliff dump — 6 个真实事件改编,英美劳动法规则切换',
    status: 'live',
  },
  {
    emoji: '🎙️',
    title: '高级 voice clone',
    body: '上传你老板 30 秒录音,AI 用他的声音念出"咱们一起拼一下"。回家放给爸妈听,他们终于知道你为啥天天加班',
    status: 'soon',
  },
  {
    emoji: '⚖️',
    title: '律师真人咨询入口',
    body: '已签约 2 家劳动法律所。Premium 用户每月 1 次 30 分钟免费咨询,过审后可继续 ¥299/小时(对比市价 ¥800-1500)',
    status: 'soon',
  },
  {
    emoji: '🎬',
    title: '历史回放无限存储',
    body: '免费版只保留最近 10 局短视频; Premium 永久保留 + 4K 导出 + 去水印 + 自定义封面文字',
    status: 'soon',
  },
];

const PRICING: Record<PremiumPlan, { label: string; price: string; per: string; saving?: string }> = {
  monthly: { label: '月度', price: '¥39',  per: '/月', },
  annual:  { label: '年度', price: '¥299', per: '/年', saving: '省 35%' },
};

export default function Premium() {
  const navigate = useNavigate();
  const { t } = useT();
  const [plan, setPlan] = useState<PremiumPlan>('annual');
  const [entitlement, setEntitlement] = useState<Entitlement>(() => getEntitlement());
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  // Re-render on entitlement changes (e.g. user downgraded in another tab).
  useEffect(() => subscribeEntitlement(setEntitlement), []);

  const subscribed = isPremium();

  return (
    <div
      className="relative min-h-screen overflow-hidden noise"
      style={{
        background:
          'radial-gradient(ellipse at 20% -10%, rgba(255,184,76,0.18) 0%, transparent 50%), radial-gradient(ellipse at 85% 0%, rgba(124,58,237,0.18) 0%, transparent 50%), linear-gradient(180deg, #0a0a1e 0%, #0f0c25 100%)',
      }}
    >
      <header className="relative z-10 flex items-center justify-between px-6 md:px-10 py-5">
        <button
          onClick={() => navigate('/')}
          className="text-xs tracking-wider text-white/55 hover:text-white/90 transition px-3 py-1.5 rounded"
          style={{ background: 'rgba(255,255,255,0.05)' }}
        >
          {t('header.backHome')}
        </button>
        <span className="text-[11px] uppercase tracking-[0.28em] text-white/55">
          👑 Premium
        </span>
        <div className="w-20" />
      </header>

      <main className="relative z-10 px-4 md:px-10 pb-20 max-w-4xl mx-auto">
        {/* Hero */}
        <div className="text-center mt-4 mb-8">
          <h1
            className="font-black mb-3 leading-tight"
            style={{
              fontSize: 'clamp(2.5rem, 5vw, 4rem)',
              background: 'linear-gradient(135deg,#ffb84c,#ff5588 50%,#7c3aed)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '0.02em',
            }}
          >
            {t('premium.title')}
          </h1>
          <p className="text-white/65 text-sm md:text-base max-w-2xl mx-auto leading-relaxed">
            {t('premium.subtitle')}
          </p>
        </div>

        {/* Subscribed banner OR pricing card */}
        {subscribed ? (
          <SubscribedPanel
            entitlement={entitlement}
            onCancel={() => clearPremium()}
          />
        ) : (
          <PricingCard
            plan={plan}
            onPlanChange={setPlan}
            onCheckout={() => setCheckoutOpen(true)}
          />
        )}

        {/* Feature matrix */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="frost-card rounded-2xl p-5 flex gap-4"
              style={{
                background: 'linear-gradient(135deg, rgba(255,184,76,0.06), rgba(124,58,237,0.04))',
                border: '1px solid rgba(255,184,76,0.20)',
              }}
            >
              <div className="text-3xl flex-shrink-0">{f.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <div className="text-sm font-bold text-white/95">{f.title}</div>
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded-full font-bold tracking-wide"
                    style={{
                      color: f.status === 'live' ? '#6ee7b7' : '#ffb84c',
                      background: f.status === 'live'
                        ? 'rgba(110,231,183,0.10)'
                        : 'rgba(255,184,76,0.12)',
                      border: `1px solid ${f.status === 'live'
                        ? 'rgba(110,231,183,0.32)'
                        : 'rgba(255,184,76,0.32)'}`,
                    }}
                  >
                    {f.status === 'live' ? '已上线' : '即将上线'}
                  </span>
                </div>
                <div className="text-[12px] text-white/60 leading-relaxed">{f.body}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Demo mode honest disclosure */}
        <div
          className="mt-8 rounded-2xl p-4 text-center text-[11px] leading-relaxed"
          style={{
            background: 'rgba(255,184,76,0.06)',
            border: '1px dashed rgba(255,184,76,0.32)',
            color: 'rgba(255,255,255,0.65)',
          }}
        >
          <strong className="text-white/80">⚠️ Demo 模式说明</strong><br/>
          v1.0.0 当前还没接 Stripe / 支付宝 / 微信支付。点"立即升级"会本地激活
          Premium(只在你这台浏览器有效),不会真的扣款。这是给体验设计 + 反馈用的预览版本。<br/>
          后端真实支付集成进入 v1.0.1 / v1.0.2 路线图。
        </div>
      </main>

      {/* Demo checkout modal */}
      <AnimatePresence>
        {checkoutOpen && (
          <CheckoutModal
            plan={plan}
            onCancel={() => setCheckoutOpen(false)}
            onConfirm={() => {
              setPremium({ plan, demoMode: true });
              setCheckoutOpen(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PricingCard({
  plan,
  onPlanChange,
  onCheckout,
}: {
  plan: PremiumPlan;
  onPlanChange: (p: PremiumPlan) => void;
  onCheckout: () => void;
}) {
  const cfg = PRICING[plan];
  return (
    <div className="max-w-md mx-auto">
      {/* Plan toggle */}
      <div
        className="inline-flex p-1 rounded-2xl mb-4 mx-auto block w-fit"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {(['monthly', 'annual'] as PremiumPlan[]).map((p) => {
          const active = plan === p;
          return (
            <button
              key={p}
              onClick={() => onPlanChange(p)}
              className="relative px-5 py-1.5 rounded-xl text-xs font-bold tracking-wide transition"
              style={{
                color: active ? '#fff' : 'rgba(255,255,255,0.55)',
                background: active
                  ? 'linear-gradient(135deg, #ffb84c 0%, #ff5588 100%)'
                  : 'transparent',
                boxShadow: active ? '0 4px 14px rgba(255,184,76,0.35)' : 'none',
              }}
            >
              {PRICING[p].label}
              {p === 'annual' && (
                <span className="ml-1.5 text-[9px] opacity-75">{PRICING.annual.saving}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Price card */}
      <motion.div
        layout
        className="frost-card rounded-3xl p-7 text-center"
        style={{
          background:
            'linear-gradient(150deg, rgba(255,184,76,0.14) 0%, rgba(255,85,136,0.08) 50%, rgba(124,58,237,0.10) 100%)',
          border: '1px solid rgba(255,184,76,0.45)',
          boxShadow: '0 24px 64px rgba(255,184,76,0.22), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
      >
        <div className="flex items-baseline justify-center gap-1 mb-3">
          <span
            className="text-5xl md:text-6xl font-black"
            style={{
              background: 'linear-gradient(135deg,#ffb84c,#ff5588)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {cfg.price}
          </span>
          <span className="text-base text-white/55">{cfg.per}</span>
        </div>
        <ul className="text-[12px] text-white/70 space-y-1.5 mb-6 text-left max-w-xs mx-auto">
          <li>✅ 6 个海外大厂剧本(立即可玩)</li>
          <li>✅ 律师真人咨询入口(签约中)</li>
          <li>✅ 高级 voice clone(开发中)</li>
          <li>✅ 历史回放无限存储 + 4K 导出</li>
          <li>✅ 所有未来 Premium 功能持续解锁</li>
        </ul>
        <button
          onClick={onCheckout}
          className="hover-sheen w-full py-3 rounded-2xl text-sm font-black tracking-wide text-white relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg,#ffb84c 0%,#ff5588 50%,#7c3aed 100%)',
            boxShadow: '0 10px 32px rgba(255,85,136,0.45), inset 0 1px 0 rgba(255,255,255,0.18)',
          }}
        >
          <span className="relative z-10">✨ 立即升级 Premium</span>
        </button>
        <div className="mt-3 text-[10px] text-white/45">7 天内不满意全额退款 · 任意时间取消</div>
      </motion.div>
    </div>
  );
}

function SubscribedPanel({
  entitlement,
  onCancel,
}: {
  entitlement: Entitlement;
  onCancel: () => void;
}) {
  const since = new Date(entitlement.since);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-md mx-auto frost-card rounded-3xl p-7 text-center"
      style={{
        background: 'linear-gradient(135deg, rgba(110,231,183,0.10), rgba(124,58,237,0.06))',
        border: '1px solid rgba(110,231,183,0.45)',
        boxShadow: '0 18px 48px rgba(110,231,183,0.18)',
      }}
    >
      <div className="text-5xl mb-2">👑</div>
      <div className="text-lg font-black text-white mb-1">
        Premium 已激活 {entitlement.demoMode && '(Demo)'}
      </div>
      <div className="text-[12px] text-white/60 mb-4">
        计划:{entitlement.plan === 'annual' ? '年度' : '月度'} ·
        激活时间:{since.toLocaleDateString('zh-CN')}
      </div>
      <div className="text-[11px] text-white/45 mb-5 leading-relaxed">
        所有 Premium 功能已解锁。海外大厂剧本会在剧本库里以"👑"标识显示。
      </div>
      <button
        onClick={onCancel}
        className="text-[11px] text-white/45 hover:text-white/75 transition px-3 py-1.5 rounded"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        重置为免费用户(debug)
      </button>
    </motion.div>
  );
}

function CheckoutModal({
  plan,
  onCancel,
  onConfirm,
}: {
  plan: PremiumPlan;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cfg = PRICING[plan];
  const [submitting, setSubmitting] = useState(false);

  // Auto-focus + Esc to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, submitting]);

  const confirmDemo = async () => {
    setSubmitting(true);
    // Tiny artificial delay so the "processing" affordance feels real.
    await new Promise((r) => setTimeout(r, 600));
    onConfirm();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(8,6,24,0.78)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onCancel(); }}
    >
      <motion.div
        initial={{ y: 20, scale: 0.96, opacity: 0 }}
        animate={{ y: 0,  scale: 1,    opacity: 1 }}
        exit={{    y: 20, scale: 0.96, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-md rounded-2xl p-6"
        style={{
          background: 'linear-gradient(180deg,#1a1530,#0d0a25)',
          border: '1px solid rgba(255,184,76,0.28)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-black text-white">确认订阅 Premium</h3>
          <button
            onClick={onCancel}
            disabled={submitting}
            className="text-white/45 hover:text-white/85 transition text-xl leading-none disabled:opacity-30"
          >
            ×
          </button>
        </div>

        {/* Order summary */}
        <div className="rounded-xl p-4 mb-4"
          style={{
            background: 'rgba(255,184,76,0.06)',
            border: '1px solid rgba(255,184,76,0.20)',
          }}
        >
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/85">班味 Pro · {cfg.label}订阅</span>
            <span className="text-white font-bold tabular-nums">{cfg.price}{cfg.per}</span>
          </div>
        </div>

        {/* Demo notice — front and center */}
        <div
          className="rounded-xl p-3 mb-4 text-[11px] leading-relaxed"
          style={{
            background: 'rgba(255,85,136,0.06)',
            border: '1px dashed rgba(255,85,136,0.35)',
            color: 'rgba(255,255,255,0.78)',
          }}
        >
          <strong className="text-rose-300">🧪 Demo 模式</strong><br/>
          这一次"升级"<strong>不会真的扣款</strong>,只在你这台浏览器
          本地把 Premium flag 打开。点击下面按钮等于体验"如果真付款会怎样"。
          后续可以在 Premium 页面随时重置。
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 rounded-xl text-xs font-semibold tracking-wide text-white/65 transition disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}
          >
            取消
          </button>
          <button
            onClick={confirmDemo}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 rounded-xl text-xs font-bold tracking-wide text-white transition"
            style={{
              background: 'linear-gradient(135deg,#ffb84c,#ff5588 50%,#7c3aed)',
              boxShadow: '0 6px 18px rgba(255,184,76,0.45)',
            }}
          >
            {submitting ? '⏳ 处理中…' : '✨ 确认升级 (Demo)'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
