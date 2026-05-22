/**
 * FortuneGallery — v5.7.0 "翻看牌库" read-only deck explorer.
 *
 * Why a separate page (vs an inline modal on /fortune):
 *  - Users hitting the daily card often wonder "what other cards exist
 *    in the deck?" — clicking a separate page lets them browse without
 *    losing their daily-card state (the back face / advice / share
 *    state).
 *  - 24 cards is too many for a drawer; needs a scrollable surface.
 *  - The gallery is shareable as its own URL (someone screenshots it,
 *    others ask "where do I see the whole deck?" → /fortune/gallery).
 *
 * Layout: 2-column responsive grid (3-col on md+). Each thumbnail
 * shows the emoji + title + vibe chip on the card's signature
 * gradient — a tight little tarot.
 *
 * Tap a thumbnail → an inline expanded preview slides in with the
 * full front-face layout (gauge, advice, microAction). The same
 * FortuneShareCardModal from v5.5.0/v5.5.1 is mounted at the page
 * level so users can generate a share PNG for ANY deck card, not just
 * today's roll. (Useful for content creators who want a screenshot of
 * a specific card to embed in a video.)
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
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

interface DeckPayload {
  deck: FortuneCard[];
}

// Local copies of the helpers so this file doesn't import from
// Fortune.tsx (route → route imports are an anti-pattern in this repo).
function vibeColor(score: number): string {
  return score >= 80 ? '#22c55e'
       : score >= 60 ? '#a3e635'
       : score >= 40 ? '#fbbf24'
       : score >= 20 ? '#fb923c'
       : '#ef4444';
}
function vibeLabel(score: number): string {
  return score >= 80 ? '大吉'
       : score >= 60 ? '小吉'
       : score >= 40 ? '中平'
       : score >= 20 ? '小凶'
       : '大凶';
}

export default function FortuneGallery() {
  const navigate = useNavigate();
  const [deck, setDeck] = useState<FortuneCard[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** When true, the share modal is open with `selectedCard` as data. */
  const [shareOpen, setShareOpen] = useState(false);
  /** UTC date stamp — same convention as /api/fortune/me.
   *  Used as a stable "you're previewing this card on this date"
   *  marker on the share image. */
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    fetch('/api/fortune/deck')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: DeckPayload) => setDeck(d.deck))
      .catch(() => setErr('加载牌库失败 — 神明今天 maintenance'));
  }, []);

  const selectedCard = useMemo(
    () => deck?.find((c) => c.id === selectedId) ?? null,
    [deck, selectedId],
  );

  /** Group cards by vibe tier for the section headers — turns the
   *  flat grid into a clearer "大吉 6 / 中平 12 / 凶险 6" overview
   *  that mirrors the FORTUNE_DECK design comment. */
  const grouped = useMemo(() => {
    if (!deck) return null;
    const great = deck.filter((c) => c.vibeScore >= 80);
    const ok    = deck.filter((c) => c.vibeScore >= 40 && c.vibeScore < 80);
    const rough = deck.filter((c) => c.vibeScore < 40);
    return [
      { tier: '大吉', cards: great, color: '#22c55e' },
      { tier: '中平', cards: ok,    color: '#fbbf24' },
      { tier: '凶险', cards: rough, color: '#ef4444' },
    ];
  }, [deck]);

  return (
    <div className="relative min-h-screen overflow-x-hidden"
      style={{ background: 'radial-gradient(circle at 30% 20%, #1a0d35 0%, #050510 70%)' }}>
      <header className="px-6 md:px-10 py-5 flex items-center justify-between">
        <button onClick={() => navigate('/fortune')}
          className="text-xs text-white/55 hover:text-white/90 transition px-3 py-1.5 rounded"
          style={{ background: 'rgba(255,255,255,0.05)' }}>
          ← 今日的牌
        </button>
        <span className="text-[11px] uppercase tracking-[0.28em] text-white/55">
          🔮 牌库 · 24 张
        </span>
        <span className="text-[10px] text-white/30 tabular-nums">{today}</span>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-6 pb-16">
        {err && (
          <div className="text-center py-16 text-rose-300/85">⚠️ {err}</div>
        )}
        {!deck && !err && (
          <div className="text-center py-16 text-white/55 text-sm">⏳ 牌库加载中…</div>
        )}
        {grouped && (
          <>
            <div className="text-center text-[12px] text-white/65 mb-6 mt-2 leading-relaxed">
              所有 24 张牌都在这里 — 你今天抽到的只是其中之一<br/>
              <span className="text-white/40">点任意一张, 看完整卡面 + 可分享 PNG</span>
            </div>

            {grouped.map((group) => (
              <section key={group.tier} className="mb-7">
                <div className="flex items-baseline gap-3 mb-3 px-1">
                  <span className="text-xs font-black tracking-[0.22em] uppercase"
                    style={{ color: group.color }}>
                    {group.tier}
                  </span>
                  <span className="text-[10px] text-white/40 tabular-nums">
                    {group.cards.length} 张
                  </span>
                  <div className="flex-1 h-px"
                    style={{ background: `linear-gradient(90deg, ${group.color}55, transparent)` }} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {group.cards.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      className="relative aspect-[4/5] rounded-2xl overflow-hidden p-3 flex flex-col text-left transition active:scale-[0.97]"
                      style={{
                        background: `linear-gradient(160deg, ${c.gradient[0]} 0%, ${c.gradient[1]} 100%)`,
                        border: `1.5px solid ${vibeColor(c.vibeScore)}66`,
                        boxShadow: `0 8px 22px ${c.gradient[1]}40`,
                      }}>
                      <div className="flex items-center justify-between text-[8px] tracking-[0.2em] uppercase font-bold text-white"
                        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                        <span>{vibeLabel(c.vibeScore)}</span>
                        <span className="tabular-nums">{c.vibeScore}</span>
                      </div>
                      <div className="flex-1 flex items-center justify-center text-5xl"
                        style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.35))' }}>
                        {c.emoji}
                      </div>
                      <div className="text-[13px] font-black text-white leading-tight"
                        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
                        {c.title}
                      </div>
                      <div className="text-[10px] text-white/80 leading-tight mt-0.5 line-clamp-2">
                        {c.subtitle}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </main>

      {/* Selected-card preview drawer. Fixed bottom sheet on mobile —
          slides up over the grid; tapping outside or the ✕ dismisses.
          Pulls in 今日忠告 + 微行动 + 📤 share to make this a viable
          "I want to share THIS card (not my daily one)" entry point. */}
      <AnimatePresence>
        {selectedCard && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[90] flex items-end md:items-center justify-center"
            style={{ background: 'rgba(2,2,12,0.78)', backdropFilter: 'blur(8px)' }}
            onClick={() => setSelectedId(null)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="relative w-full max-w-md rounded-t-3xl md:rounded-3xl p-5 md:p-6 max-h-[92vh] overflow-y-auto"
              style={{
                background: 'linear-gradient(180deg, #15122e, #0d0b25)',
                border: '1px solid rgba(176,134,255,0.30)',
                boxShadow: '0 -24px 60px rgba(0,0,0,0.6)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-sm font-black tracking-tight text-white/95">
                  {selectedCard.emoji} {selectedCard.title}
                </h3>
                <button
                  onClick={() => setSelectedId(null)}
                  className="text-xs text-white/55 hover:text-white/95 transition px-2 py-1 rounded"
                  aria-label="关闭"
                >
                  ✕
                </button>
              </div>

              {/* Full-size card render — mirrors /fortune front face */}
              <div className="relative w-full aspect-[4/5] rounded-2xl overflow-hidden p-5 flex flex-col mb-3"
                style={{
                  background: `linear-gradient(160deg, ${selectedCard.gradient[0]} 0%, ${selectedCard.gradient[1]} 100%)`,
                  border: `2px solid ${vibeColor(selectedCard.vibeScore)}88`,
                  boxShadow: `0 12px 36px ${selectedCard.gradient[1]}55`,
                }}>
                <div className="flex items-center justify-between text-[10px] tracking-[0.22em] uppercase text-white font-bold"
                  style={{ textShadow: '0 1px 2px rgba(0,0,0,0.55)' }}>
                  <span>{vibeLabel(selectedCard.vibeScore)}</span>
                  <span className="tabular-nums">运势 · {selectedCard.vibeScore}</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full overflow-hidden"
                  style={{ background: 'rgba(0,0,0,0.25)' }}>
                  <div className="h-full rounded-full"
                    style={{ width: `${selectedCard.vibeScore}%`, background: vibeColor(selectedCard.vibeScore) }} />
                </div>
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                  <div className="text-[5.5rem] leading-none mb-2"
                    style={{ filter: 'drop-shadow(0 3px 10px rgba(0,0,0,0.35))' }}>
                    {selectedCard.emoji}
                  </div>
                  <h2 className="text-2xl font-black text-white"
                    style={{ textShadow: '0 2px 4px rgba(0,0,0,0.4)' }}>
                    {selectedCard.title}
                  </h2>
                  <p className="text-xs text-white/85 mt-1 leading-snug">
                    {selectedCard.subtitle}
                  </p>
                </div>
                <div className="text-center text-[8px] tracking-[0.3em] uppercase text-white/75"
                  style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                  OFFICE ZOO · 牌库 · {selectedCard.id}
                </div>
              </div>

              {/* Advice + microAction (compact) */}
              <div className="rounded-xl p-3 mb-2"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}>
                <div className="text-[9px] tracking-[0.22em] uppercase mb-1" style={{ color: '#ffd58a' }}>
                  ✦ 忠告
                </div>
                <p className="text-[12px] text-white/90 leading-relaxed">
                  {selectedCard.advice}
                </p>
              </div>
              <div className="rounded-xl p-3 mb-3"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,184,76,0.10), rgba(255,85,136,0.06))',
                  border: '1px solid rgba(255,184,76,0.30)',
                }}>
                <div className="text-[9px] tracking-[0.22em] uppercase mb-1" style={{ color: '#9be6ff' }}>
                  ✦ 微行动
                </div>
                <p className="text-[12px] text-white/95 font-bold leading-relaxed">
                  {selectedCard.microAction}
                </p>
              </div>

              <button
                onClick={() => setShareOpen(true)}
                className="w-full py-2.5 rounded-xl text-xs font-bold tracking-wide text-white"
                style={{
                  background: 'linear-gradient(135deg,#ff5588,#7c3aed)',
                  boxShadow: '0 6px 18px rgba(124,58,237,0.32)',
                }}>
                📤 把这张牌做成分享卡
              </button>
              <p className="text-center text-[10px] text-white/40 mt-2">
                tag: <span className="text-white/60">{selectedCard.tag}</span> · 来自牌库, 非今日抽签
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Share modal — shared between the gallery preview and the
          main /fortune page (different mounts, same component).
          Uses TODAY as the date stamp so the user's share is dated
          "now" rather than the gallery's neutral context. */}
      <FortuneShareCardModal
        open={shareOpen}
        data={selectedCard ? {
          date: today,
          emoji: selectedCard.emoji,
          title: selectedCard.title,
          subtitle: selectedCard.subtitle,
          vibeScore: selectedCard.vibeScore,
          gradient: selectedCard.gradient,
          advice: selectedCard.advice,
          microAction: selectedCard.microAction,
        } : null}
        onClose={() => setShareOpen(false)}
      />
    </div>
  );
}
