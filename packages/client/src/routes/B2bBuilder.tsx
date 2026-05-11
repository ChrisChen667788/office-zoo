/**
 * B2bBuilder — v1.1.0 /b2b page.
 *
 * Form for a law firm / HR training vendor to mint a white-label embed
 * config. On submit, server returns a B2bConfig with an id; we render a
 * preview iframe + a "copy embed code" textarea so the customer can drop
 * the iframe straight into their site.
 *
 * Page uses the Executive design palette (corporate navy + muted gold)
 * not the consumer neon-pink-violet — this is enterprise audience and
 * the visual register has to match. See docs/DESIGN.md.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { SCENARIOS as SEED_SCENARIOS, type B2bConfig } from '@furball/shared';
import { getUserId } from '../utils/userId';
import { executiveColors, executiveGradients } from '../constants/design';

type Flavor = 'consultation' | 'training';

const PRESET_COLORS = [
  '#1a4d8c', '#0f7a6e', '#7a1e4a', '#8a5a1a',
  '#3a3f5e', '#5b2d6f', '#0f5a4e', '#704c1f',
];

export default function B2bBuilder() {
  const navigate = useNavigate();
  const myId = useMemo(() => getUserId(), []);

  const [brandName, setBrandName]         = useState('');
  const [primaryColor, setPrimaryColor]   = useState('#c89a4e');
  const [logoUrl, setLogoUrl]             = useState('');
  const [leadEmail, setLeadEmail]         = useState('');
  const [flavor, setFlavor]               = useState<Flavor>('consultation');
  const [defaultScenarioId, setDefaultScenarioId] = useState('');
  const [footerTagline, setFooterTagline] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg]         = useState<string | null>(null);
  const [created, setCreated]       = useState<B2bConfig | null>(null);

  // My existing embeds (for "已建过的 embed" panel)
  const [mine, setMine] = useState<B2bConfig[]>([]);
  useEffect(() => {
    fetch(`/api/b2b/configs?createdBy=${encodeURIComponent(myId)}`)
      .then((r) => r.ok ? r.json() : { configs: [] })
      .then((d: { configs?: B2bConfig[] }) => setMine(d.configs ?? []))
      .catch(() => { /* soft-fail */ });
  }, [myId]);

  const canSubmit = brandName.trim().length >= 2
    && /^#[0-9A-Fa-f]{6}$/.test(primaryColor)
    && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setErrMsg(null);
    try {
      const r = await fetch('/api/b2b/configs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': myId,
        },
        body: JSON.stringify({
          brandName: brandName.trim(),
          primaryColor,
          logoUrl:          logoUrl.trim()       || undefined,
          leadCaptureEmail: leadEmail.trim()     || undefined,
          flavor,
          defaultScenarioId: defaultScenarioId   || undefined,
          footerTagline:    footerTagline.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.message ?? body.error ?? `创建失败 (${r.status})`);
      }
      const cfg = await r.json() as B2bConfig;
      setCreated(cfg);
      setMine((prev) => [cfg, ...prev]);
    } catch (e) {
      setErrMsg((e as Error).message ?? '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden"
      style={{ background: executiveGradients.consultation }}
    >
      <header className="px-6 md:px-10 py-5 flex items-center justify-between"
        style={{ borderBottom: `1px solid ${executiveColors.stroke.subtle}` }}>
        <button
          onClick={() => navigate('/')}
          className="text-xs tracking-wider hover:opacity-80 transition px-3 py-1.5 rounded"
          style={{
            color: executiveColors.text.secondary,
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${executiveColors.stroke.subtle}`,
          }}
        >
          ← 返回首页
        </button>
        <span className="text-[11px] uppercase tracking-[0.28em]"
          style={{ color: executiveColors.text.tertiary }}>
          🏢 B2B · 律所 + HR 培训
        </span>
        <div className="w-24" />
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-10 py-8">
        <div className="text-center mb-10">
          <h1 className="font-black mb-2"
            style={{
              fontSize: 'clamp(2rem, 4vw, 3rem)',
              color: executiveColors.text.primary,
              letterSpacing: '0.02em',
            }}>
            白标 embed 生成器
          </h1>
          <p className="text-sm" style={{ color: executiveColors.text.secondary }}>
            为你的网站生成一个嵌入式裁员谈判演练 — 律所引流 / HR 培训沙盘 / 法学院案例库。
            embed 用你的品牌色 + logo,Office Zoo 只在底部小字署名。
          </p>
        </div>

        {/* If just created — show success card; otherwise show form */}
        {created ? (
          <CreatedPanel cfg={created} onCreateAnother={() => setCreated(null)} />
        ) : (
          <BuilderForm
            brandName={brandName} setBrandName={setBrandName}
            primaryColor={primaryColor} setPrimaryColor={setPrimaryColor}
            logoUrl={logoUrl} setLogoUrl={setLogoUrl}
            leadEmail={leadEmail} setLeadEmail={setLeadEmail}
            flavor={flavor} setFlavor={setFlavor}
            defaultScenarioId={defaultScenarioId} setDefaultScenarioId={setDefaultScenarioId}
            footerTagline={footerTagline} setFooterTagline={setFooterTagline}
            canSubmit={canSubmit}
            submitting={submitting}
            errMsg={errMsg}
            onSubmit={submit}
          />
        )}

        {/* "已创建的 embed" panel */}
        {mine.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xs tracking-[0.25em] uppercase mb-3"
              style={{ color: executiveColors.text.tertiary }}>
              你已创建的 embed
            </h2>
            <div className="space-y-2">
              {mine.map((cfg) => (
                <div key={cfg.id}
                  className="rounded-xl p-4 flex items-center gap-4"
                  style={{
                    background: 'rgba(255,255,255,0.025)',
                    border: `1px solid ${executiveColors.stroke.subtle}`,
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold" style={{ color: executiveColors.text.primary }}>
                      {cfg.brandName} <span className="text-[10px] opacity-60">
                        · {cfg.flavor === 'consultation' ? '法律咨询' : 'HR 培训'}
                      </span>
                    </div>
                    <div className="text-[11px] tabular-nums"
                      style={{ color: executiveColors.text.tertiary }}>
                      {cfg.id} · {new Date(cfg.createdAt ?? 0).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/embed/${cfg.id}`)}
                    className="text-xs px-3 py-1.5 rounded transition"
                    style={{
                      color: executiveColors.brand.gold,
                      background: 'rgba(200,154,78,0.10)',
                      border: `1px solid ${executiveColors.stroke.normal}`,
                    }}
                  >
                    打开预览
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

// ===========================================================================

function BuilderForm({
  brandName, setBrandName, primaryColor, setPrimaryColor,
  logoUrl, setLogoUrl, leadEmail, setLeadEmail,
  flavor, setFlavor, defaultScenarioId, setDefaultScenarioId,
  footerTagline, setFooterTagline,
  canSubmit, submitting, errMsg, onSubmit,
}: {
  brandName: string; setBrandName: (v: string) => void;
  primaryColor: string; setPrimaryColor: (v: string) => void;
  logoUrl: string; setLogoUrl: (v: string) => void;
  leadEmail: string; setLeadEmail: (v: string) => void;
  flavor: Flavor; setFlavor: (v: Flavor) => void;
  defaultScenarioId: string; setDefaultScenarioId: (v: string) => void;
  footerTagline: string; setFooterTagline: (v: string) => void;
  canSubmit: boolean; submitting: boolean; errMsg: string | null;
  onSubmit: () => void;
}) {
  const inputClass = "w-full rounded-lg px-3 py-2 text-sm outline-none transition";
  const inputStyle = {
    color: executiveColors.text.primary,
    background: 'rgba(0,0,0,0.30)',
    border: `1px solid ${executiveColors.stroke.normal}`,
  } as const;
  const labelStyle = {
    color: executiveColors.text.tertiary,
    fontSize: 11,
    letterSpacing: '0.04em',
  } as const;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Flavor toggle */}
      <div>
        <div style={labelStyle} className="mb-1.5">Embed 类型</div>
        <div className="grid grid-cols-2 gap-2">
          {(['consultation', 'training'] as Flavor[]).map((f) => (
            <button
              key={f}
              onClick={() => setFlavor(f)}
              className="rounded-lg p-4 text-left transition"
              style={{
                background: flavor === f
                  ? `${executiveColors.brand.gold}18`
                  : 'rgba(255,255,255,0.025)',
                border: `1px solid ${flavor === f
                  ? executiveColors.brand.gold + '88'
                  : executiveColors.stroke.subtle}`,
              }}
            >
              <div className="text-2xl mb-1">{f === 'consultation' ? '⚖️' : '🎓'}</div>
              <div className="text-sm font-bold mb-0.5"
                style={{ color: executiveColors.text.primary }}>
                {f === 'consultation' ? '法律咨询入口' : 'HR 培训沙盘'}
              </div>
              <div className="text-[11px] leading-relaxed"
                style={{ color: executiveColors.text.secondary }}>
                {f === 'consultation'
                  ? '员工视角玩谈判,结束后引导填表咨询贵所'
                  : 'HR 学员视角,跟工会代表练程序合规'}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Brand name */}
      <div>
        <div style={labelStyle} className="mb-1.5">品牌名称 (显示在 embed 标题栏)</div>
        <input
          value={brandName}
          onChange={(e) => setBrandName(e.target.value.slice(0, 48))}
          placeholder="如:中伦律师事务所"
          className={inputClass}
          style={inputStyle}
        />
      </div>

      {/* Primary color */}
      <div>
        <div style={labelStyle} className="mb-1.5">主色 (CTA + 高亮)</div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setPrimaryColor(c)}
              className="w-9 h-9 rounded transition"
              style={{
                background: c,
                outline: primaryColor === c ? '2px solid white' : 'none',
                outlineOffset: 2,
              }}
              title={c}
            />
          ))}
        </div>
        <input
          value={primaryColor}
          onChange={(e) => setPrimaryColor(e.target.value)}
          placeholder="#RRGGBB"
          className={inputClass}
          style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace' }}
        />
      </div>

      {/* Logo URL */}
      <div>
        <div style={labelStyle} className="mb-1.5">Logo URL (可选)</div>
        <input
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value.slice(0, 500))}
          placeholder="https://your-firm.com/logo.png"
          className={inputClass}
          style={inputStyle}
        />
      </div>

      {/* Lead capture email (consultation only) */}
      {flavor === 'consultation' && (
        <div>
          <div style={labelStyle} className="mb-1.5">线索接收邮箱 (用户结束谈判后会被引导填表)</div>
          <input
            type="email"
            value={leadEmail}
            onChange={(e) => setLeadEmail(e.target.value.slice(0, 120))}
            placeholder="leads@your-firm.com"
            className={inputClass}
            style={inputStyle}
          />
        </div>
      )}

      {/* Default scenario */}
      <div>
        <div style={labelStyle} className="mb-1.5">默认场景 (可选 — 不选则用户自己挑)</div>
        <select
          value={defaultScenarioId}
          onChange={(e) => setDefaultScenarioId(e.target.value)}
          className={inputClass}
          style={inputStyle}
        >
          <option value="" style={{ background: '#0c1024' }}>(用户进入时自己选)</option>
          {SEED_SCENARIOS.filter((s) => !s.premium).map((s) => (
            <option key={s.id} value={s.id} style={{ background: '#0c1024' }}>
              {s.emoji} {s.title}
            </option>
          ))}
        </select>
      </div>

      {/* Footer tagline */}
      <div>
        <div style={labelStyle} className="mb-1.5">
          底部小字 (默认 "Powered by Office Zoo")
        </div>
        <input
          value={footerTagline}
          onChange={(e) => setFooterTagline(e.target.value.slice(0, 80))}
          placeholder='例如 "本演练由 XX 律师事务所提供"'
          className={inputClass}
          style={inputStyle}
        />
      </div>

      {errMsg && (
        <div className="text-[12px] py-2 px-3 rounded"
          style={{
            color: executiveColors.semantic.danger,
            background: `${executiveColors.semantic.danger}14`,
            border: `1px solid ${executiveColors.semantic.danger}40`,
          }}>
          ⚠️ {errMsg}
        </div>
      )}

      <button
        onClick={onSubmit}
        disabled={!canSubmit}
        className="w-full py-3 rounded-xl text-sm font-bold tracking-wide transition disabled:opacity-40"
        style={{
          color: '#fff',
          background: canSubmit
            ? `linear-gradient(135deg, ${executiveColors.brand.gold} 0%, ${executiveColors.brand.glow} 100%)`
            : 'rgba(255,255,255,0.06)',
          boxShadow: canSubmit ? `0 8px 24px ${executiveColors.brand.gold}40` : 'none',
        }}
      >
        {submitting ? '⏳ 创建中…' : '生成 embed →'}
      </button>
    </motion.div>
  );
}

function CreatedPanel({
  cfg, onCreateAnother,
}: {
  cfg: B2bConfig;
  onCreateAnother: () => void;
}) {
  const embedUrl = `${window.location.origin}/embed/${cfg.id}`;
  const iframeCode = `<iframe src="${embedUrl}" width="100%" height="640" frameborder="0" style="border-radius:12px;" loading="lazy"></iframe>`;
  const [copied, setCopied] = useState<'url' | 'code' | null>(null);

  const copy = async (text: string, which: 'url' | 'code') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1600);
    } catch { /* clipboard blocked */ }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-6"
      style={{
        background: `linear-gradient(135deg, ${executiveColors.brand.gold}14, rgba(255,255,255,0.02))`,
        border: `1px solid ${executiveColors.stroke.normal}`,
      }}
    >
      <div className="text-center mb-5">
        <div className="text-3xl mb-2">✅</div>
        <div className="text-base font-black mb-1"
          style={{ color: executiveColors.text.primary }}>
          Embed 已生成
        </div>
        <div className="text-[11px]" style={{ color: executiveColors.text.tertiary }}>
          id <span className="font-mono">{cfg.id}</span>
        </div>
      </div>

      <div className="mb-3">
        <div className="text-[11px] mb-1.5 tracking-wide"
          style={{ color: executiveColors.text.tertiary }}>
          预览链接
        </div>
        <div className="flex gap-2">
          <input readOnly value={embedUrl}
            className="flex-1 rounded-lg px-3 py-2 text-xs font-mono"
            style={{
              color: executiveColors.text.primary,
              background: 'rgba(0,0,0,0.30)',
              border: `1px solid ${executiveColors.stroke.normal}`,
            }}
          />
          <button onClick={() => copy(embedUrl, 'url')}
            className="rounded-lg px-3 text-xs font-bold transition"
            style={{
              color: executiveColors.brand.gold,
              background: 'rgba(200,154,78,0.14)',
              border: `1px solid ${executiveColors.stroke.normal}`,
              minWidth: 80,
            }}>
            {copied === 'url' ? '✓ 已复制' : '复制'}
          </button>
        </div>
      </div>

      <div className="mb-5">
        <div className="text-[11px] mb-1.5 tracking-wide"
          style={{ color: executiveColors.text.tertiary }}>
          嵌入代码 (粘贴到你的网站 HTML 即可)
        </div>
        <div className="flex gap-2">
          <textarea readOnly value={iframeCode} rows={3}
            className="flex-1 rounded-lg px-3 py-2 text-xs font-mono resize-none"
            style={{
              color: executiveColors.text.primary,
              background: 'rgba(0,0,0,0.30)',
              border: `1px solid ${executiveColors.stroke.normal}`,
            }}
          />
          <button onClick={() => copy(iframeCode, 'code')}
            className="rounded-lg px-3 text-xs font-bold transition self-stretch"
            style={{
              color: executiveColors.brand.gold,
              background: 'rgba(200,154,78,0.14)',
              border: `1px solid ${executiveColors.stroke.normal}`,
              minWidth: 80,
            }}>
            {copied === 'code' ? '✓ 已复制' : '复制'}
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <a href={`/embed/${cfg.id}`} target="_blank" rel="noopener"
          className="flex-1 text-center py-2.5 rounded-xl text-xs font-bold tracking-wide transition"
          style={{
            color: '#fff',
            background: `linear-gradient(135deg, ${executiveColors.brand.gold}, ${executiveColors.brand.glow})`,
            boxShadow: `0 6px 18px ${executiveColors.brand.gold}40`,
          }}>
          打开预览 ↗
        </a>
        <button onClick={onCreateAnother}
          className="px-4 py-2.5 rounded-xl text-xs font-bold transition"
          style={{
            color: executiveColors.text.secondary,
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${executiveColors.stroke.normal}`,
          }}>
          再做一个
        </button>
      </div>
    </motion.div>
  );
}
