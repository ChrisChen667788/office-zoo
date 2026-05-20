/**
 * ChallengeShareCardModal — v4.1.0 preview + copy/download surface for
 * the "you vs friend" comparison card.
 *
 * Sibling of v1.5.0's DailyShareCardModal. Same modal anatomy
 * (preview + 复制 + 下载 + close) but feeds the renderer in
 * challengeShareCard.ts instead of dailyShareCard.ts.
 *
 * Two entry points:
 *   1. FiredChallenge — when both sides have completed, the page
 *      surfaces a 📤 button next to ComparisonStrip.
 *   2. FiredResult — when the user is the challengee + has just
 *      finished a fired round under an active challenge,
 *      "🥊 应战完成 → 看对比战绩" route also exposes this modal.
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  copyChallengeShareCardToClipboard,
  downloadChallengeShareCard,
  generateChallengeShareCardPreviewUrl,
  type ChallengeShareCardData,
} from '../utils/challengeShareCard';

export interface ChallengeShareCardModalProps {
  open: boolean;
  data: ChallengeShareCardData | null;
  onClose: () => void;
}

export default function ChallengeShareCardModal({ open, data, onClose }: ChallengeShareCardModalProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [genErr, setGenErr] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !data) {
      setPreviewUrl(null);
      setGenErr(null);
      return;
    }
    let cancelled = false;
    let revoke: string | null = null;
    setGenErr(null);
    setActionMsg(null);
    generateChallengeShareCardPreviewUrl(data)
      .then((url) => {
        if (cancelled) { URL.revokeObjectURL(url); return; }
        revoke = url;
        setPreviewUrl(url);
      })
      .catch((e) => {
        if (cancelled) return;
        setGenErr(e instanceof Error ? e.message : '渲染失败');
      });
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [open, data]);

  const handleCopy = async () => {
    if (!data) return;
    const ok = await copyChallengeShareCardToClipboard(data);
    setActionMsg(ok ? '✓ 已复制到剪贴板,贴到聊天里' : '复制失败 — 试试下载吧');
  };

  const handleDownload = async () => {
    if (!data) return;
    try {
      const stamp = data.date.replace(/-/g, '');
      await downloadChallengeShareCard(data, `office-zoo-vs-${stamp}.png`);
      setActionMsg('✓ 已下载');
    } catch {
      setActionMsg('下载失败,请重试');
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[100] flex items-center justify-center px-4"
          style={{ background: 'rgba(2,2,12,0.78)', backdropFilter: 'blur(8px)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-md rounded-3xl p-5 md:p-6 max-h-[92vh] overflow-y-auto"
            style={{
              background: 'linear-gradient(180deg, #15122e, #0d0b25)',
              border: '1px solid rgba(255,184,76,0.32)',
              boxShadow: '0 24px 72px rgba(0,0,0,0.6)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="text-base font-black tracking-tight text-white/95">
                🥊 对比战绩卡
              </h3>
              <button
                onClick={onClose}
                className="text-xs text-white/55 hover:text-white/95 transition px-2 py-1 rounded"
                aria-label="关闭"
              >
                ✕
              </button>
            </div>

            <div className="relative w-full aspect-[4/5] rounded-2xl overflow-hidden mb-4"
              style={{ background: 'rgba(255,255,255,0.025)' }}>
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="对比战绩卡预览"
                  className="absolute inset-0 w-full h-full object-contain"
                />
              ) : genErr ? (
                <div className="absolute inset-0 flex items-center justify-center text-rose-300/85 text-xs">
                  ⚠️ {genErr}
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-white/45 text-xs">
                  ⏳ 渲染中…
                </div>
              )}
            </div>

            <div className="flex gap-2 mb-2">
              <button
                onClick={handleCopy}
                disabled={!previewUrl}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold tracking-wide text-white disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg,#ff5588,#7c3aed)',
                  boxShadow: '0 6px 18px rgba(124,58,237,0.32)',
                }}
              >
                📋 复制图片
              </button>
              <button
                onClick={handleDownload}
                disabled={!previewUrl}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold tracking-wide disabled:opacity-50"
                style={{
                  background: 'rgba(255,184,76,0.14)',
                  border: '1px solid rgba(255,184,76,0.45)',
                  color: '#ffb84c',
                }}
              >
                📥 下载 PNG
              </button>
            </div>

            {actionMsg && (
              <div className="text-center text-[11px] text-white/65 mt-1">{actionMsg}</div>
            )}
            <p className="text-center text-[10px] text-white/35 mt-2">
              1080 × 1350 · IG-portrait · 朋友圈 / 小红书 / Twitter 一发就传
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
