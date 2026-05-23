/**
 * B2bEmbed — v1.1.0 white-label iframe target.
 *
 * Renders inside the customer's iframe (no app chrome — no nav, no
 * "返回首页"). Shows the customer's brand at top, lets the user pick
 * a scenario (or auto-loads `defaultScenarioId`), then renders the
 * fired chat with Executive theme + customer's primary color override.
 *
 * The actual chat experience is delegated to FiredChat — we just set
 * up the firedStore state + theme + handoff. After the round ends, the
 * `consultation` flavor shows a "想跟律师聊聊?" lead-capture card with
 * a mailto: link to the firm's email; `training` flavor shows a "see
 * pitfalls" debrief instead.
 *
 * Office Zoo footer attribution at the bottom — small, non-promotional,
 * just "Powered by Office Zoo".
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  SCENARIOS as SEED_SCENARIOS,
  HR_TRAINING_SCENARIOS,
  type B2bConfig,
  type FiredScenario,
  type HRTrainingScenario,
} from '@furball/shared';
import { useFiredStore } from '../stores/firedStore';
import { executiveColors } from '../constants/design';
import PersonaCard from '../components/character/PersonaCard';
import { ALL_CHARACTER_NAMES, CHARACTERS } from '@furball/shared';

export default function B2bEmbed() {
  const navigate = useNavigate();
  const { configId } = useParams<{ configId: string }>();
  const setScenario    = useFiredStore((s) => s.setScenario);
  const setPersonality = useFiredStore((s) => s.setPersonality);
  const reset          = useFiredStore((s) => s.reset);

  const [cfg, setCfg] = useState<B2bConfig | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!configId) return;
    fetch(`/api/b2b/configs/${configId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setCfg)
      .catch((e) => setErr(typeof e === 'number' ? `embed 不存在 (${e})` : 'embed 加载失败'));
  }, [configId]);

  /** Theme tokens computed from the config (or fallback defaults). */
  const theme = useMemo(() => {
    const primary = cfg?.primaryColor ?? executiveColors.brand.gold;
    return {
      primary,
      // Used for borders + soft tints. RRGGBB → rgba 0.14
      primarySoft: primary + '22',
      primaryBorder: primary + '55',
      bg: 'linear-gradient(180deg, #0c1024 0%, #141a36 100%)',
      cardBg: 'rgba(255,255,255,0.03)',
      textPrimary:   executiveColors.text.primary,
      textSecondary: executiveColors.text.secondary,
      textTertiary:  executiveColors.text.tertiary,
    };
  }, [cfg]);

  if (err) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: '#0c1024', color: executiveColors.text.primary }}>
        <div className="text-center">
          <div className="text-3xl mb-3">⚠️</div>
          <div className="text-sm font-bold mb-1">{err}</div>
          <div className="text-[11px] opacity-60">embed 已被删除,或链接错误</div>
        </div>
      </div>
    );
  }

  if (!cfg) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: '#0c1024', color: executiveColors.text.tertiary }}>
        <div className="text-sm">⏳ 加载 embed 中…</div>
      </div>
    );
  }

  const scenarios: Array<FiredScenario | HRTrainingScenario> =
    cfg.flavor === 'training' ? HR_TRAINING_SCENARIOS : SEED_SCENARIOS.filter((s) => !s.premium);

  const launchScenario = (scenarioId: string) => {
    reset();
    setScenario(scenarioId);
    // Pick a sensible default personality per flavor.
    setPersonality(cfg.flavor === 'training' ? 'union' : 'veteran');
    // Stash the embed context so we return here after the round, not
    // the consumer FiredLanding.
    try {
      sessionStorage.setItem('office-zoo.embed-context', JSON.stringify({
        configId: cfg.id,
        flavor: cfg.flavor,
        brandName: cfg.brandName,
        leadCaptureEmail: cfg.leadCaptureEmail,
      }));
    } catch { /* private mode — accept the consumer fallback */ }
    navigate('/fired/chat');
  };

  return (
    <div className="min-h-screen flex flex-col"
      style={{ background: theme.bg, color: theme.textPrimary }}>
      {/* Brand bar — slim, customer-owned */}
      <div className="px-6 py-4 flex items-center gap-3"
        style={{ borderBottom: `1px solid ${theme.primaryBorder}`, background: 'rgba(0,0,0,0.18)' }}>
        {cfg.logoUrl && (
          <img src={cfg.logoUrl} alt="" className="h-8 max-w-[160px] object-contain" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold truncate">{cfg.brandName}</div>
          <div className="text-[11px]" style={{ color: theme.textTertiary }}>
            {cfg.flavor === 'consultation' ? '裁员谈判沙盘 · 法律咨询入口' : 'HR 培训沙盘 · 程序合规演练'}
          </div>
        </div>
      </div>

      <main className="flex-1 px-6 py-8 max-w-3xl mx-auto w-full">
        <motion.h1
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="text-2xl md:text-3xl font-black mb-2 leading-tight">
          {cfg.flavor === 'consultation'
            ? '先来一场模拟谈判,看看你能争取到什么'
            : '在沙盘里练好程序,再面对真员工'}
        </motion.h1>
        <p className="text-sm mb-8" style={{ color: theme.textSecondary }}>
          {cfg.flavor === 'consultation'
            ? '选一个跟你情况相近的剧本,AI 会扮演 HR 跟你谈判。结束后,可以填表预约本所的真人咨询。'
            : '你扮 HR 主管,AI 扮工会代表 + 律师。每个剧本都有"踩雷点",过关后可下载分析报告。'}
        </p>

        {/* Scenario picker */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {scenarios.map((s) => (
            <button
              key={s.id}
              onClick={() => launchScenario(s.id)}
              className="rounded-xl p-4 text-left transition hover:-translate-y-0.5"
              style={{
                background: theme.cardBg,
                border: `1px solid ${theme.primaryBorder}`,
              }}
            >
              <div className="flex items-start gap-3">
                <div className="text-2xl">{s.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold mb-1 truncate">{s.title}</div>
                  <div className="text-[11px] line-clamp-2 leading-relaxed"
                    style={{ color: theme.textSecondary }}>
                    {s.description}
                  </div>
                  <div className="flex gap-0.5 mt-2">
                    {Array.from({ length: 3 }, (_, i) => (
                      <span key={i} className="text-[10px]"
                        style={{
                          color: i < s.difficulty
                            ? theme.primary
                            : 'rgba(255,255,255,0.18)',
                        }}>★</span>
                    ))}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </main>

      {/* v6.9 P-b2b — enterprise IP preview band. Pitches the character
           IP capability without disrupting the FiredScenario flow above.
           Shows 3 sample rats; click any → full PersonaCard popover with
           epithet + stats + share. Frame as "NPC IP 系统 — 可为贵司定制". */}
      <section className="px-6 py-6"
        style={{
          borderTop: `1px solid ${executiveColors.stroke.subtle}`,
          background: 'rgba(255,255,255,0.015)',
        }}>
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] font-black uppercase tracking-[0.18em]"
              style={{ color: theme.primary }}>
              🎭 我们的 NPC IP 系统 · 可为贵司定制
            </div>
            <div className="text-[9px]" style={{ color: theme.textTertiary, opacity: 0.7 }}>
              SAMPLE / 节选 3 角色
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {/* Pick 3 representative rats — 1 卷王 (Tony) / 1 油条 (Kevin) /
                1 摸鱼 (Amy). Locked to a stable order, not random, so the
                embed page is deterministic for screenshot/marketing. */}
            {(['Tony', 'Kevin', 'Amy']
              .filter((n) => ALL_CHARACTER_NAMES.includes(n))
              .map((n) => CHARACTERS[n])
            ).map((char) => (
              <PersonaCard key={char.name} playerName={char.name} personality={undefined}>
                <div style={{
                  cursor: 'pointer', padding: '10px 12px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)',
                  border: `1px solid ${theme.primaryBorder}`,
                  display: 'flex', flexDirection: 'column', gap: 6,
                  minHeight: 80,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 22 }}>{char.emoji}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 800, color: theme.textPrimary,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{char.epithet}</span>
                      <span style={{
                        fontSize: 8.5, fontWeight: 700, letterSpacing: '0.08em',
                        color: theme.textTertiary, opacity: 0.7,
                      }}>{char.name.toUpperCase()}</span>
                    </div>
                  </div>
                  <span style={{
                    fontSize: 9, color: theme.textSecondary, opacity: 0.85,
                    lineHeight: 1.3,
                  }}>"{char.catchphrases[0]}"</span>
                </div>
              </PersonaCard>
            ))}
          </div>
          <div className="text-[9px] mt-3 text-center"
            style={{ color: theme.textTertiary, opacity: 0.55 }}>
            点击任意角色查看完整档案 · 联系销售可基于贵司行业定制鼠人
          </div>
        </div>
      </section>

      {/* Footer attribution */}
      <footer className="px-6 py-3 text-center text-[10px]"
        style={{
          color: theme.textTertiary,
          borderTop: `1px solid ${executiveColors.stroke.subtle}`,
        }}>
        {cfg.footerTagline || `Powered by Office Zoo · 演练数据不会被存储`}
      </footer>
    </div>
  );
}
