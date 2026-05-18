/**
 * DailyShareCardModal — v1.5.0 preview + copy/download surface for
 * the "今日剧情" share card.
 *
 * Two entry points feed this:
 *   1. Landing's DailyDramaCard 📤 button → preview-only (no result)
 *   2. FiredResult's "✦ 分享今日战绩" button → with result baked in
 *
 * Renders the PNG into a sandboxed <img> so the user sees exactly what
 * they'd be posting. Buttons:
 *   - 📋 复制图片  (clipboard write — fails silently → toast falls back to 下载)
 *   - 📥 下载 PNG
 *   - ✕ 关闭
 *
 * The component owns the blob-URL lifecycle so callers don't have to
 * remember to URL.revokeObjectURL.
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  copyDailyShareCardToClipboard,
  downloadDailyShareCard,
  generateDailyShareCardPreviewUrl,
  type DailyShareCardData,
} from '../utils/dailyShareCard';

export interface DailyShareCardModalProps {
  open: boolean;
  data: DailyShareCardData | null;
  onClose: () => void;
}

export default function DailyShareCardModal({ open, data, onClose }: DailyShareCardModalProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [genErr, setGenErr] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Regenerate preview whenever the data changes or modal opens.
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
    generateDailyShareCardPreviewUrl(data)
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
    const ok = await copyDailyShareCardToClipboard(data);
    setActionMsg(ok ? '✓ 已复制到剪贴板,贴到聊天里' : '复制失败 — 试试下载吧');
  };

  const handleDownload = async () => {
    if (!data) return;
    try {
      const stamp = data.date.replace(/-/g, '');
      await downloadDailyShareCard(data, `office-zoo-daily-${stamp}.png`);
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
                📤 今日剧情卡
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
                  alt="今日剧情卡预览"
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
              1080 × 1350 · IG-portrait · 适合朋友圈 / 小红书 / Twitter
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
