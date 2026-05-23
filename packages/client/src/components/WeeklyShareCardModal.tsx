/**
 * WeeklyShareCardModal — v6.5 周报生成器 PNG 预览 + 分享。
 *
 * Sibling of FortuneShareCardModal / BarClusterShareModal — 同款 4:5 预览
 * 框 + capability-detect 系统分享 + 复制 + 下载 三按钮。
 */

import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  canSystemShareImage,
  copyWeeklyShareCardToClipboard,
  downloadWeeklyShareCard,
  generateWeeklyShareCardPreviewUrl,
  systemShareWeeklyCard,
  type WeeklyShareCardData,
} from '../utils/weeklyShareCard';

export interface WeeklyShareCardModalProps {
  open: boolean;
  data: WeeklyShareCardData | null;
  onClose: () => void;
}

export default function WeeklyShareCardModal({ open, data, onClose }: WeeklyShareCardModalProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [genErr, setGenErr] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const canSysShare = useMemo(() => canSystemShareImage(), []);

  useEffect(() => {
    if (!open || !data) {
      setPreviewUrl(null);
      setGenErr(null);
      setActionMsg(null);
      return;
    }
    let cancelled = false;
    let revoke: string | null = null;
    generateWeeklyShareCardPreviewUrl(data)
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
    const ok = await copyWeeklyShareCardToClipboard(data);
    setActionMsg(ok ? '✓ 已复制到剪贴板, 贴到聊天里' : '复制失败 — 试试下载吧');
  };
  const handleDownload = async () => {
    if (!data) return;
    try {
      await downloadWeeklyShareCard(data);
      setActionMsg('✓ 已下载');
    } catch { setActionMsg('下载失败, 请重试'); }
  };
  const handleSystemShare = async () => {
    if (!data) return;
    const ok = await systemShareWeeklyCard(data);
    if (!ok) {
      const copied = await copyWeeklyShareCardToClipboard(data);
      setActionMsg(copied ? '✓ 系统分享不支持, 已复制图片' : '分享 + 复制都失败');
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
              border: '1px solid rgba(255,215,0,0.42)',
              boxShadow: '0 24px 72px rgba(0,0,0,0.6)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="text-base font-black tracking-tight text-white/95">
                📊 周报 · 4 风格分享卡
              </h3>
              <button onClick={onClose}
                className="text-xs text-white/55 hover:text-white/95 transition px-2 py-1 rounded"
                aria-label="关闭">
                ✕
              </button>
            </div>

            <div className="relative w-full aspect-[4/5] rounded-2xl overflow-hidden mb-4"
              style={{ background: 'rgba(255,255,255,0.025)' }}>
              {previewUrl ? (
                <img src={previewUrl} alt="周报分享卡预览"
                  className="absolute inset-0 w-full h-full object-contain" />
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

            {canSysShare ? (
              <>
                <button onClick={handleSystemShare} disabled={!previewUrl}
                  className="w-full py-3 rounded-xl text-sm font-black tracking-wide disabled:opacity-50 mb-2"
                  style={{
                    background: 'linear-gradient(135deg, #FFD700, #FFA947)',
                    color: '#1a0d35',
                    boxShadow: '0 6px 18px rgba(255,215,0,0.32)',
                  }}>
                  📲 一键分享到 微信 / 小红书 / 微博
                </button>
                <div className="flex gap-2 mb-2">
                  <button onClick={handleCopy} disabled={!previewUrl}
                    className="flex-1 py-2 rounded-lg text-[11px] font-bold disabled:opacity-50"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: 'rgba(255,255,255,0.85)',
                    }}>📋 复制图片</button>
                  <button onClick={handleDownload} disabled={!previewUrl}
                    className="flex-1 py-2 rounded-lg text-[11px] font-bold disabled:opacity-50"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: 'rgba(255,255,255,0.85)',
                    }}>📥 下载 PNG</button>
                </div>
              </>
            ) : (
              <div className="flex gap-2 mb-2">
                <button onClick={handleCopy} disabled={!previewUrl}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg, #FFD700, #FFA947)',
                    color: '#1a0d35',
                    boxShadow: '0 6px 18px rgba(255,215,0,0.32)',
                  }}>📋 复制图片</button>
                <button onClick={handleDownload} disabled={!previewUrl}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold disabled:opacity-50"
                  style={{
                    background: 'rgba(176,134,255,0.16)',
                    border: '1px solid rgba(176,134,255,0.45)',
                    color: '#b086ff',
                  }}>📥 下载 PNG</button>
              </div>
            )}

            {actionMsg && (
              <div className="text-center text-[11px] text-white/65 mt-1">{actionMsg}</div>
            )}
            <p className="text-center text-[10px] text-white/35 mt-2">
              1080 × 1350 · IG-portrait · #周报生成器
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
