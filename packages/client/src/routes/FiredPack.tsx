/**
 * FiredPack — v0.9.0 UGC pack play view.
 *
 * Loads a `FiredPack` from /api/fired/packs/:id and renders its 5 slots
 * as a sequential chapter cascade. Slot 0 is always playable; slot N+1
 * unlocks once slot N has any non-lose record (matches the chapter mode
 * unlock rule).
 *
 * Tap a playable slot → stash (packId, slotIndex) in sessionStorage,
 * push scenario+personality into firedStore, navigate to /fired/chat.
 * After the round ends, FiredResult reads the stashed pack location and
 * (a) calls recordPackSlot to update progress, (b) navigates back here.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useFiredStore } from '../stores/firedStore';
import { useFiredProgress } from '../stores/firedProgress';
import { SCENARIOS as SHARED_SCENARIOS, type FiredPack, type FiredScenario } from '@furball/shared';
import { getUserId } from '../utils/userId';

interface PackWithMeta extends FiredPack {
  /** Server adds this for symmetry with future variable-length packs. */
  slotCount?: number;
}

export default function FiredPack() {
  const navigate = useNavigate();
  const { packId } = useParams<{ packId: string }>();
  const setScenario     = useFiredStore((s) => s.setScenario);
  const setPersonality  = useFiredStore((s) => s.setPersonality);
  const reset           = useFiredStore((s) => s.reset);
  const packProgress    = useFiredProgress((s) => s.packProgress);
  const myId            = useMemo(() => getUserId(), []);

  const [pack, setPack]       = useState<PackWithMeta | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<Record<string, FiredScenario>>(
    () => Object.fromEntries(SHARED_SCENARIOS.map((s) => [s.id, s])),
  );
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(0);

  // Load pack + cross-reference scenarios on mount.
  useEffect(() => {
    if (!packId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/fired/packs/${packId}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const p = await r.json() as PackWithMeta;
        if (cancelled) return;
        setPack(p);
        setLikes(p.likes ?? 0);

        // Pull merged scenario catalogue so user-generated slot scenarios
        // resolve to titles + emojis, not just bare ids.
        const r2 = await fetch('/api/fired/scenarios');
        if (r2.ok) {
          const d2 = await r2.json() as { scenarios: FiredScenario[] };
          if (!cancelled && Array.isArray(d2.scenarios)) {
            setScenarios(Object.fromEntries(d2.scenarios.map((s) => [s.id, s])));
          }
        }

        // Like-state probe so heart paints correctly on first frame.
        fetch(`/api/fired/packs/like-state?ids=${encodeURIComponent(p.id)}`)
          .then((r3) => r3.json())
          .then((d3: { liked?: string[] }) => {
            if (!cancelled && Array.isArray(d3.liked)) {
              setLiked(d3.liked.includes(p.id));
            }
          })
          .catch(() => { /* soft-fail */ });
      } catch (e) {
        if (!cancelled) setLoadErr((e as Error).message ?? '加载失败');
      }
    })();
    return () => { cancelled = true; };
  }, [packId]);

  const progress = packId ? packProgress[packId]?.cleared ?? {} : {};
  /** Highest already-cleared slot index. -1 when none yet. The next slot
   *  (highest+1) is the unlocked-but-not-cleared one. */
  const lastClearedIndex = useMemo(() => {
    const idxs = Object.keys(progress).map(Number);
    return idxs.length === 0 ? -1 : Math.max(...idxs);
  }, [progress]);

  /** Sequential unlock — slot 0 always unlocked; slot N unlocked iff
   *  slot N-1 cleared. */
  function isUnlocked(idx: number) {
    return idx === 0 || lastClearedIndex >= idx - 1;
  }

  function isCleared(idx: number) {
    return progress[idx] !== undefined;
  }

  const handlePlaySlot = (idx: number) => {
    if (!pack) return;
    if (!isUnlocked(idx)) return;
    const slot = pack.slots[idx];
    if (!slot) return;
    reset();
    setScenario(slot.scenarioId);
    setPersonality(slot.personalityId);
    // Stash so FiredResult knows to (1) record this slot and (2) navigate
    // back to the pack view rather than the landing page.
    try {
      sessionStorage.setItem('office-zoo.active-pack', JSON.stringify({
        packId: pack.id, slotIndex: idx,
      }));
    } catch { /* private mode — pack progress just won't persist this round */ }
    navigate('/fired/chat');
  };

  const toggleLike = async () => {
    if (!pack) return;
    const next = !liked;
    setLiked(next);
    setLikes((n) => Math.max(0, n + (next ? 1 : -1)));
    try {
      const r = await fetch('/api/fired/packs/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId: pack.id, liked: next }),
      });
      if (!r.ok) throw new Error(`like ${r.status}`);
      const d = await r.json() as { likes: number };
      setLikes(d.likes);
    } catch {
      // Rollback
      setLiked(!next);
      setLikes((n) => Math.max(0, n + (next ? -1 : 1)));
    }
  };

  const handleShare = async () => {
    if (!pack) return;
    const url = `${window.location.origin}/fired/pack/${pack.id}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `裁了么闯关包:${pack.title}`,
          text: pack.description,
          url,
        });
        return;
      }
    } catch { /* user cancelled */ }
    try {
      await navigator.clipboard.writeText(url);
      const toast = document.createElement('div');
      toast.textContent = '✓ 链接已复制';
      toast.style.cssText = 'position:fixed;bottom:32px;left:50%;transform:translateX(-50%);background:rgba(15,14,46,0.95);color:#fff;padding:10px 18px;border-radius:9999px;font-size:13px;z-index:9999;border:1px solid rgba(255,255,255,0.15);box-shadow:0 8px 24px rgba(0,0,0,0.5)';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 1800);
    } catch { /* clipboard blocked */ }
  };

  if (loadErr) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center"
        style={{ background: 'linear-gradient(180deg,#1a0820,#0a0a1e)' }}>
        <div className="text-red-400 mb-4">⚠️ 闯关包加载失败:{loadErr}</div>
        <button onClick={() => navigate('/fired')}
          className="px-4 py-2 rounded text-white/80 text-sm"
          style={{ background: 'rgba(255,255,255,0.05)' }}>
          ← 返回剧本库
        </button>
      </div>
    );
  }
  if (!pack) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(180deg,#1a0820,#0a0a1e)' }}>
        <div className="text-white/55 text-sm">⏳ 加载闯关包中…</div>
      </div>
    );
  }

  const totalSlots = pack.slots.length;
  const clearedCount = Object.keys(progress).length;
  const isMine = pack.createdBy === myId;
  const completion = totalSlots > 0 ? clearedCount / totalSlots : 0;

  return (
    <div className="relative min-h-screen overflow-hidden"
      style={{ background: 'linear-gradient(180deg,#1a0820 0%,#1d0a30 50%,#0a0a1e 100%)' }}>
      <header className="relative z-10 flex items-center justify-between px-6 md:px-10 py-5">
        <button onClick={() => navigate('/fired')}
          className="text-xs tracking-wider text-white/55 hover:text-white/90 transition px-3 py-1.5 rounded"
          style={{ background: 'rgba(255,255,255,0.05)' }}>
          ← 返回剧本库
        </button>
        <span className="text-[11px] uppercase tracking-[0.28em] text-white/55">🎯 闯关包</span>
        <div className="flex items-center gap-1.5">
          <button onClick={toggleLike}
            className="text-xs transition px-3 py-1.5 rounded inline-flex items-center gap-1.5"
            style={{
              color: liked ? '#ff5588' : 'rgba(255,255,255,0.55)',
              background: liked ? 'rgba(255,85,136,0.12)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${liked ? 'rgba(255,85,136,0.45)' : 'transparent'}`,
            }}>
            <span>{liked ? '❤' : '♡'}</span>
            <span className="tabular-nums">{likes}</span>
          </button>
          <button onClick={handleShare}
            className="text-xs text-white/55 hover:text-white/90 transition px-3 py-1.5 rounded"
            style={{ background: 'rgba(255,255,255,0.05)' }}>
            🔗 分享
          </button>
        </div>
      </header>

      <main className="relative z-10 px-4 md:px-10 max-w-3xl mx-auto pb-12">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="text-center mb-6 mt-2">
          <div className="text-6xl mb-3">{pack.emoji}</div>
          <h1 className="text-2xl md:text-3xl font-black text-white mb-2 leading-tight">
            {pack.title}
          </h1>
          <p className="text-white/60 text-sm md:text-base max-w-xl mx-auto leading-relaxed">
            {pack.description}
          </p>
          {isMine && (
            <div className="mt-3 inline-block text-[11px] px-2.5 py-1 rounded-full font-bold"
              style={{ color: '#ffb84c', background: 'rgba(255,184,76,0.15)', border: '1px solid rgba(255,184,76,0.4)' }}>
              ✨ 你创造的
            </div>
          )}

          {/* Progress bar */}
          <div className="mt-5 max-w-md mx-auto">
            <div className="flex items-baseline justify-between text-[10px] tracking-[0.2em] uppercase mb-1.5">
              <span className="text-white/45">进度</span>
              <span className="text-white/65 tabular-nums">{clearedCount} / {totalSlots}</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'linear-gradient(90deg,#ff5588,#7c3aed)' }}
                initial={{ width: 0 }}
                animate={{ width: `${completion * 100}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
          </div>
        </motion.div>

        {/* Slots */}
        <div className="space-y-3">
          {pack.slots.map((slot, idx) => {
            const sc = scenarios[slot.scenarioId];
            const cleared = isCleared(idx);
            const unlocked = isUnlocked(idx);
            const cur = progress[idx];

            return (
              <motion.button
                key={idx}
                onClick={() => handlePlaySlot(idx)}
                disabled={!unlocked}
                whileHover={unlocked ? { y: -2 } : {}}
                whileTap={unlocked ? { scale: 0.985 } : {}}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * idx, duration: 0.3 }}
                className="w-full text-left rounded-2xl p-4 transition flex items-center gap-4 relative overflow-hidden"
                style={{
                  background: cleared
                    ? 'linear-gradient(135deg, rgba(110,231,183,0.10), rgba(255,255,255,0.02))'
                    : unlocked
                      ? 'linear-gradient(135deg, rgba(255,85,136,0.08), rgba(255,255,255,0.02))'
                      : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${cleared
                    ? 'rgba(110,231,183,0.35)'
                    : unlocked ? 'rgba(255,85,136,0.35)' : 'rgba(255,255,255,0.05)'}`,
                  cursor: unlocked ? 'pointer' : 'not-allowed',
                  opacity: unlocked ? 1 : 0.5,
                }}>
                <div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-xl"
                  style={{
                    background: cleared
                      ? 'linear-gradient(135deg, rgba(110,231,183,0.25), rgba(255,255,255,0.05))'
                      : unlocked
                        ? 'linear-gradient(135deg, rgba(255,85,136,0.20), rgba(124,58,237,0.10))'
                        : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${cleared
                      ? 'rgba(110,231,183,0.45)'
                      : unlocked ? 'rgba(255,85,136,0.4)' : 'rgba(255,255,255,0.06)'}`,
                  }}>
                  {cleared ? '✓' : unlocked ? (sc?.emoji ?? '⚖️') : '🔒'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] tracking-[0.2em] uppercase text-white/40">
                      关卡 {idx + 1}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide"
                      style={{
                        color: slot.personalityId === 'demon' ? '#ff4757'
                             : slot.personalityId === 'veteran' ? '#ffb84c'
                             : '#6ee7b7',
                        background: 'rgba(0,0,0,0.25)',
                        border: '1px solid rgba(255,255,255,0.08)',
                      }}>
                      {slot.personalityId === 'demon' ? '👿 魔鬼'
                     : slot.personalityId === 'veteran' ? '😏 老油条'
                     : '😊 菜鸟'}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-white/90 truncate">
                    {sc?.title ?? `(找不到剧本 ${slot.scenarioId})`}
                  </div>
                  <div className="text-[11px] text-white/45 mt-0.5 line-clamp-1">
                    {sc?.description ?? '剧本可能已被删除'}
                  </div>
                </div>
                <div className="flex-shrink-0 text-[11px] text-white/55 tabular-nums text-right">
                  {cleared && cur ? (
                    <>
                      <div className="text-emerald-300/85 font-bold">
                        {cur.outcome === 'win' ? 'S 级' : '过关'}
                      </div>
                      <div className="text-white/35">{(cur.ratio * 100).toFixed(0)}%</div>
                    </>
                  ) : unlocked ? (
                    <span style={{ color: '#ff5588' }}>▶ 挑战</span>
                  ) : (
                    <span className="text-white/30">需先通过上一关</span>
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>

        {clearedCount === totalSlots && totalSlots > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="mt-6 rounded-2xl p-5 text-center"
            style={{
              background: 'linear-gradient(135deg, rgba(255,184,76,0.15), rgba(255,85,136,0.08))',
              border: '1px solid rgba(255,184,76,0.4)',
            }}>
            <div className="text-3xl mb-2">🏆</div>
            <div className="text-white font-black text-lg mb-1">通关!</div>
            <div className="text-white/65 text-[12px]">
              你已经打穿这个闯关包,要不要分享给朋友看看他们能不能也通关?
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
