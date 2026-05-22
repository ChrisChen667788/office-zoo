/**
 * Fortune — 班味占卜 / 今日运势 page.
 *
 * v5.4.0 — initial tarot-style daily card surface.
 * v5.4.1 — visual polish: 5-tier VIBE_COLOR aligned with VIBE_LABEL,
 *          textShadow on small labels for warm-gradient legibility,
 *          footer split into pre-CTA share hint + post-CTA return hook.
 * v5.5.0 — one-tap PNG share via FortuneShareCardModal (1080×1350,
 *          mirrors the v1.5.0 dailyShareCard pattern). The plain
 *          "复制链接" CTA stays but is demoted to secondary; the
 *          primary CTA becomes "📤 生成分享卡" because a finished
 *          image beats a copied URL on every social platform.
 *
 * Server picks one card from FORTUNE_DECK deterministic per
 * (userId, UTC date). User sees:
 *  - Big draw animation on first mount (the "翻牌" reveal)
 *  - Card hero (emoji + title + subtitle + vibe gauge)
 *  - 今日忠告 + 微行动 blocks
 *  - Share-card export (1080×1350 PNG)
 *  - "明天的牌" tease at the bottom that points to come-back behavior
 *
 * Design intent: Z-gen 玄学 / 塔罗 aesthetic, fully shareable,
 * daily-habit forming. The 'draw' animation is the moment that
 * converts curiosity into screenshot intent.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getUserId } from '../utils/userId';
import FortuneShareCardModal from '../components/FortuneShareCardModal';

interface FortuneCard {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
  vibeScore: number;
  gradient: [string, string];
  advice: string;
  microAction: string;
  tag: string;
}

interface Payload {
  date: string;
  card: FortuneCard;
}

/** Vibe accent color — 5 tiers, aligned 1:1 with VIBE_LABEL's bands so a
 *  "小吉 65" card no longer shows a "warning yellow" bar (the previous
 *  3-tier mapping was off-by-one: yellow under a label that read 小吉
 *  felt contradictory). 大吉 green → 小吉 lime → 中平 amber → 小凶 orange → 大凶 red. */
const VIBE_COLOR = (score: number): string =>
  score >= 80 ? '#22c55e'
  : score >= 60 ? '#a3e635'
  : score >= 40 ? '#fbbf24'
  : score >= 20 ? '#fb923c'
  : '#ef4444';

const VIBE_LABEL = (score: number): string =>
  score >= 80 ? '大吉' : score >= 60 ? '小吉' : score >= 40 ? '中平' : score >= 20 ? '小凶' : '大凶';

export default function Fortune() {
  const navigate = useNavigate();
  const myId = useMemo(() => getUserId(), []);
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** false = back of card (purple sigil), true = front (revealed).
   *  Auto-flips ~600ms after data arrives so the "draw" reveal feels
   *  intentional, not laggy. */
  const [revealed, setRevealed] = useState(false);
  /** v5.5.0 — share-card modal open state. Mirrors the v1.5.0
   *  DailyShareCardModal usage pattern: open via primary CTA,
   *  closes on backdrop click / ✕ / Esc-handled-by-modal. */
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    fetch('/api/fortune/me', { headers: { 'X-User-Id': myId } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: Payload) => setData(d))
      .catch(() => setErr('占卜失败 — 神明今天 maintenance'));
  }, [myId]);

  useEffect(() => {
    if (!data) return;
    const t = window.setTimeout(() => setRevealed(true), 600);
    return () => window.clearTimeout(t);
  }, [data]);

  return (
    <div className="relative min-h-screen overflow-hidden"
      style={{ background: 'radial-gradient(circle at 30% 20%, #1a0d35 0%, #050510 70%)' }}>
      <header className="px-6 md:px-10 py-5 flex items-center justify-between">
        <button onClick={() => navigate('/')}
          className="text-xs text-white/55 hover:text-white/90 transition px-3 py-1.5 rounded"
          style={{ background: 'rgba(255,255,255,0.05)' }}>
          ← 首页
        </button>
        <span className="text-[11px] uppercase tracking-[0.28em] text-white/55">
          🔮 班味占卜
        </span>
        {/* v5.7.0 — gallery shortcut. Sits where the date stamp used to,
            because the date is duplicated on the card itself; freeing
            this header slot for navigation has higher utility than
            showing the date twice. */}
        <button onClick={() => navigate('/fortune/gallery')}
          className="text-[11px] text-white/55 hover:text-white/95 transition px-2 py-1 rounded"
          style={{ background: 'rgba(176,134,255,0.10)', border: '1px solid rgba(176,134,255,0.25)' }}>
          牌库 →
        </button>
      </header>

      <main className="max-w-md mx-auto px-4 md:px-6 pb-16">
        {err && (
          <div className="text-center py-16 text-rose-300/85">⚠️ {err}</div>
        )}
        {!data && !err && (
          <div className="text-center py-16 text-white/55 text-sm">⏳ 卡牌正在洗中…</div>
        )}
        {data && (
          <>
            <div className="text-center text-[11px] text-white/60 mb-4 mt-4">
              {revealed ? '今日的牌是 —' : '请闭上眼, 心里想一个数字, 然后看 —'}
            </div>

            {/* Card flip animation */}
            <div className="relative w-full aspect-[4/5] mx-auto"
              style={{ perspective: 1200 }}>
              <motion.div
                animate={{ rotateY: revealed ? 0 : 180 }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0"
                style={{ transformStyle: 'preserve-3d' }}>
                {/* Back face (rotated, shown when !revealed) */}
                <div
                  className="absolute inset-0 rounded-3xl flex items-center justify-center"
                  style={{
                    background: 'radial-gradient(circle at 50% 35%, #7c3aed 0%, #1a0d35 65%, #050510 100%)',
                    border: '2px solid rgba(255,255,255,0.18)',
                    boxShadow: '0 30px 80px rgba(124,58,237,0.45)',
                    backfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                  }}>
                  <div className="text-7xl opacity-80">🔮</div>
                  <div className="absolute inset-x-0 bottom-6 text-center text-[11px] tracking-[0.4em] uppercase text-white/40">
                    OFFICE ZOO TAROT
                  </div>
                </div>
                {/* Front face (default) */}
                <div
                  className="absolute inset-0 rounded-3xl overflow-hidden p-6 flex flex-col"
                  style={{
                    background: `linear-gradient(160deg, ${data.card.gradient[0]} 0%, ${data.card.gradient[1]} 100%)`,
                    border: `2px solid ${VIBE_COLOR(data.card.vibeScore)}88`,
                    boxShadow: `0 30px 80px ${data.card.gradient[1]}55`,
                    backfaceVisibility: 'hidden',
                  }}>
                  {/* Top — vibe gauge + label. textShadow keeps the small
                      uppercase tracking legible on bright warm gradients
                      (orange-pink "KPI 神助攻" / magenta "PUA 雷暴日"). */}
                  <div className="flex items-center justify-between text-[10px] tracking-[0.22em] uppercase text-white font-bold"
                    style={{ textShadow: '0 1px 2px rgba(0,0,0,0.55)' }}>
                    <span>{VIBE_LABEL(data.card.vibeScore)}</span>
                    <span className="tabular-nums">运势 · {data.card.vibeScore}</span>
                  </div>
                  {/* Vibe bar */}
                  <div className="mt-2 h-1.5 rounded-full overflow-hidden"
                    style={{ background: 'rgba(0,0,0,0.25)' }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${data.card.vibeScore}%` }}
                      transition={{ delay: 1.0, duration: 0.8, ease: 'easeOut' }}
                      className="h-full rounded-full"
                      style={{ background: VIBE_COLOR(data.card.vibeScore) }} />
                  </div>

                  {/* Hero emoji + title */}
                  <div className="flex-1 flex flex-col items-center justify-center text-center">
                    <motion.div
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 1.2, duration: 0.5, type: 'spring', bounce: 0.4 }}
                      className="text-[7rem] leading-none mb-3"
                      style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.35))' }}>
                      {data.card.emoji}
                    </motion.div>
                    <motion.h2
                      initial={{ y: 10, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 1.4, duration: 0.4 }}
                      className="text-3xl font-black text-white"
                      style={{ textShadow: '0 2px 4px rgba(0,0,0,0.4)' }}>
                      {data.card.title}
                    </motion.h2>
                    <motion.p
                      initial={{ y: 10, opacity: 0 }}
                      animate={{ y: 0, opacity: 0.9 }}
                      transition={{ delay: 1.55, duration: 0.4 }}
                      className="text-sm text-white/85 mt-1.5 leading-snug">
                      {data.card.subtitle}
                    </motion.p>
                  </div>

                  {/* Footer — date stamp. Bumped opacity + textShadow so
                      the stamp survives both dark (千万别开群会) and bright
                      (KPI 神助攻) backgrounds without re-tinting per card. */}
                  <div className="text-center text-[9px] tracking-[0.3em] uppercase text-white/75"
                    style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                    OFFICE ZOO · {data.date}
                  </div>
                </div>
              </motion.div>
            </div>

            <AnimatePresence>
              {revealed && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.5 }}
                  className="mt-5 space-y-3">
                  <div className="rounded-2xl p-4"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.10)',
                    }}>
                    <div className="text-[10px] tracking-[0.22em] uppercase mb-1.5"
                      style={{ color: '#ffd58a' }}>
                      ✦ 今日忠告
                    </div>
                    <p className="text-[13px] text-white/90 leading-relaxed">
                      {data.card.advice}
                    </p>
                  </div>
                  <div className="rounded-2xl p-4"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255,184,76,0.10), rgba(255,85,136,0.06))',
                      border: '1px solid rgba(255,184,76,0.30)',
                    }}>
                    <div className="text-[10px] tracking-[0.22em] uppercase mb-1.5"
                      style={{ color: '#9be6ff' }}>
                      ✦ 5 分钟微行动
                    </div>
                    <p className="text-[13px] text-white/95 font-bold leading-relaxed">
                      {data.card.microAction}
                    </p>
                  </div>

                  {/* Pre-CTA share hint — sits just above the share button
                      so the WHERE-to-share guidance primes the action.
                      Highlighted #班味占卜 hashtag gives users a concrete
                      hook they remember after the link is in clipboard. */}
                  <div className="text-center text-[10px] text-white/65 mt-4 mb-2 leading-relaxed">
                    截图发朋友圈 / 小红书 → 标签{' '}
                    <span className="font-bold" style={{ color: '#ffd58a' }}>#班味占卜</span>
                  </div>
                  {/* v5.5.0 — primary CTA = generate share card (finished
                      image beats a copied URL on every social platform).
                      Secondary CTA = original copy-link path, kept for
                      users who specifically want to send the LINK rather
                      than the IMAGE (eg group chats where image previews
                      lose context). Two-thirds / one-third split keeps
                      the visual weight on the primary action. */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShareOpen(true)}
                      className="py-3 rounded-xl text-xs font-bold tracking-wide text-white"
                      style={{
                        flex: 2,
                        background: 'linear-gradient(135deg,#ff5588,#7c3aed)',
                        boxShadow: '0 6px 18px rgba(124,58,237,0.32)',
                      }}>
                      📤 生成分享卡 PNG
                    </button>
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/fortune`;
                        navigator.clipboard.writeText(url).catch(() => {});
                      }}
                      className="py-3 rounded-xl text-xs font-bold tracking-wide"
                      style={{
                        flex: 1,
                        background: 'rgba(176,134,255,0.14)',
                        border: '1px solid rgba(176,134,255,0.40)',
                        color: '#b086ff',
                      }}
                      title="复制 /fortune 链接, 让朋友自己抽">
                      🔗 复制链接
                    </button>
                  </div>
                  {/* Post-CTA return hook — distinct intent from the share
                      hint above (this drives next-day reopen, not share).
                      v5.6.0 — paired with the 📜 history button so users
                      with >1 day of records can see their pattern
                      forming. Anonymous-friendly: empty history page
                      handles first-time users gracefully. */}
                  <div className="flex items-center justify-center gap-3 mt-3 text-[10px] text-white/55">
                    <span>✦ 明天的牌 · 子时(UTC 00:00) 重洗</span>
                    <span className="text-white/25">·</span>
                    <button onClick={() => navigate('/fortune/history')}
                      className="hover:text-white/95 transition underline decoration-dotted underline-offset-4">
                      📜 看本周
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </main>

      {/* v5.5.0 — share-card modal. Stays mounted in the tree so the
          enter/exit animation runs; data comes from the same card the
          page is currently showing. Renders nothing visible when
          shareOpen=false (AnimatePresence inside the modal handles it). */}
      <FortuneShareCardModal
        open={shareOpen}
        data={data ? {
          date: data.date,
          emoji: data.card.emoji,
          title: data.card.title,
          subtitle: data.card.subtitle,
          vibeScore: data.card.vibeScore,
          gradient: data.card.gradient,
          advice: data.card.advice,
          microAction: data.card.microAction,
        } : null}
        onClose={() => setShareOpen(false)}
      />
    </div>
  );
}
