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
import { startRealCheckout, syncEntitlementFromServer } from '../utils/billing';
import { useT, type DictKey } from '../utils/i18n';

// v1.2.1 — feature card data carries dict keys, not raw zh-CN strings.
// Resolved at render time inside the component (after useT() runs).
const FEATURES: Array<{
  emoji: string;
  titleKey: DictKey;
  bodyKey:  DictKey;
  status:   'live' | 'soon';
}> = [
  { emoji: '🌍', titleKey: 'premium.feature.faang.title',  bodyKey: 'premium.feature.faang.body',  status: 'live' },
  { emoji: '🎙️', titleKey: 'premium.feature.voice.title',  bodyKey: 'premium.feature.voice.body',  status: 'soon' },
  { emoji: '⚖️', titleKey: 'premium.feature.lawyer.title', bodyKey: 'premium.feature.lawyer.body', status: 'soon' },
  { emoji: '🎬', titleKey: 'premium.feature.replay.title', bodyKey: 'premium.feature.replay.body', status: 'live' },
];

// v1.2.1 — pricing data via dict lookup. Per-locale prices live in i18n
// dict (premium.priceMonthly etc). The component pulls them through t().
interface PricingMeta {
  labelKey: DictKey;
  priceKey: DictKey;
  perKey:   DictKey;
  savingKey?: DictKey;
}
const PRICING: Record<PremiumPlan, PricingMeta> = {
  monthly: {
    labelKey: 'premium.monthLabel',
    priceKey: 'premium.priceMonthly',
    perKey:   'premium.perMonth',
  },
  annual: {
    labelKey:  'premium.yearLabel',
    priceKey:  'premium.priceAnnual',
    perKey:    'premium.perYear',
    savingKey: 'premium.yearSaving',
  },
};

export default function Premium() {
  const navigate = useNavigate();
  const { t } = useT();
  const [plan, setPlan] = useState<PremiumPlan>('annual');
  const [entitlement, setEntitlement] = useState<Entitlement>(() => getEntitlement());
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  // Re-render on entitlement changes (e.g. user downgraded in another tab).
  useEffect(() => subscribeEntitlement(setEntitlement), []);

  // v6.51 P3 — mirror the server's authoritative billing record (real
  // Stripe) into the local cache on mount + after a success redirect.
  // No-ops when Stripe isn't configured, so the demo flow is untouched.
  useEffect(() => {
    void syncEntitlementFromServer();
  }, []);

  // v6.51 P3 — checkout: try real Stripe first; fall back to the demo
  // modal when Stripe isn't configured (or the call fails).
  const handleCheckout = async () => {
    const redirected = await startRealCheckout(plan);
    if (!redirected) setCheckoutOpen(true);
  };

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
            onCheckout={handleCheckout}
          />
        )}

        {/* Feature matrix — v1.2.1 reads through t() so cards adapt
            language without a reload. */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-3">
          {FEATURES.map((f) => (
            <div
              key={f.titleKey}
              className="frost-card rounded-2xl p-5 flex gap-4"
              style={{
                background: 'linear-gradient(135deg, rgba(255,184,76,0.06), rgba(124,58,237,0.04))',
                border: '1px solid rgba(255,184,76,0.20)',
              }}
            >
              <div className="text-3xl flex-shrink-0">{f.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <div className="text-sm font-bold text-white/95">{t(f.titleKey)}</div>
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
                    {t(f.status === 'live' ? 'premium.featureStatus.live' : 'premium.featureStatus.soon')}
                  </span>
                </div>
                <div className="text-[12px] text-white/60 leading-relaxed">{t(f.bodyKey)}</div>
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
          <strong className="text-white/80">{t('premium.demoNotice.title')}</strong><br/>
          {t('premium.demoNotice.body')}
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
  const { t } = useT();
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
          const meta = PRICING[p];
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
              {t(meta.labelKey)}
              {p === 'annual' && meta.savingKey && (
                <span className="ml-1.5 text-[9px] opacity-75">{t(meta.savingKey)}</span>
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
            {t(cfg.priceKey)}
          </span>
          <span className="text-base text-white/55">{t(cfg.perKey)}</span>
        </div>
        <ul className="text-[12px] text-white/70 space-y-1.5 mb-6 text-left max-w-xs mx-auto">
          <li>{t('premium.feat.faang')}</li>
          <li>{t('premium.feat.lawyer')}</li>
          <li>{t('premium.feat.voice')}</li>
          <li>{t('premium.feat.replay')}</li>
          <li>{t('premium.feat.future')}</li>
        </ul>
        <button
          onClick={onCheckout}
          className="hover-sheen w-full py-3 rounded-2xl text-sm font-black tracking-wide text-white relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg,#ffb84c 0%,#ff5588 50%,#7c3aed 100%)',
            boxShadow: '0 10px 32px rgba(255,85,136,0.45), inset 0 1px 0 rgba(255,255,255,0.18)',
          }}
        >
          <span className="relative z-10">{t('premium.cta')}</span>
        </button>
        <div className="mt-3 text-[10px] text-white/45">{t('premium.refund')}</div>
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
  const { t, locale } = useT();
  const since = new Date(entitlement.since);
  // Locale-aware date formatting via the matching Intl tag.
  const localeTag =
    locale === 'zh-CN' ? 'zh-CN'
  : locale === 'en-US' ? 'en-US'
  : locale === 'ja-JP' ? 'ja-JP'
  :                      'ko-KR';
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
        {t('premium.activated')} {entitlement.demoMode && t('premium.demoTag')}
      </div>
      <div className="text-[12px] text-white/60 mb-4">
        {t('premium.subscribed.planLabel')}: {t(entitlement.plan === 'annual' ? 'premium.yearLabel' : 'premium.monthLabel')}
        {' · '}
        {t('premium.subscribed.activatedLabel')}: {since.toLocaleDateString(localeTag)}
      </div>
      <div className="text-[11px] text-white/45 mb-5 leading-relaxed">
        {t('premium.subscribed.body')}
      </div>
      <button
        onClick={onCancel}
        className="text-[11px] text-white/45 hover:text-white/75 transition px-3 py-1.5 rounded"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {t('premium.cancelBtn')}
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
  const { t } = useT();
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
          <h3 className="text-base font-black text-white">{t('premium.checkout.title')}</h3>
          <button
            onClick={onCancel}
            disabled={submitting}
            className="text-white/45 hover:text-white/85 transition text-xl leading-none disabled:opacity-30"
          >
            ×
          </button>
        </div>

        {/* Order summary — t('premium.checkout.lineItem') uses {plan} placeholder. */}
        <div className="rounded-xl p-4 mb-4"
          style={{
            background: 'rgba(255,184,76,0.06)',
            border: '1px solid rgba(255,184,76,0.20)',
          }}
        >
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/85">
              {t('premium.checkout.lineItem').replace('{plan}', t(cfg.labelKey))}
            </span>
            <span className="text-white font-bold tabular-nums">{t(cfg.priceKey)}{t(cfg.perKey)}</span>
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
          <strong className="text-rose-300">{t('premium.checkout.demoTitle')}</strong><br/>
          {t('premium.checkout.demoBody')}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 rounded-xl text-xs font-semibold tracking-wide text-white/65 transition disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}
          >
            {t('common.cancel')}
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
            {submitting ? t('premium.checkout.processing') : t('premium.checkout.confirmDemo')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
