/**
 * TrendShareCardModal — v6.6.2 偏好曲线 PNG 分享 modal.
 * Mirrors WeeklyShareCardModal / FortuneShareCardModal.
 */
import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  copyTrendShareCardToClipboard,
  downloadTrendShareCard,
  generateTrendShareCardPreviewUrl,
  type TrendShareCardData,
} from '../utils/trendShareCard';

export interface TrendShareCardModalProps {
  open: boolean;
  data: TrendShareCardData | null;
  onClose: () => void;
}

function canSystemShareImage(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (typeof navigator.share !== 'function') return false;
  if (typeof navigator.canShare !== 'function') return false;
  try {
    const probe = new File([new Uint8Array(1)], 'p.png', { type: 'image/png' });
    return navigator.canShare({ files: [probe] });
  } catch { return false; }
}

export default function TrendShareCardModal({ open, data, onClose }: TrendShareCardModalProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const canSysShare = useMemo(() => canSystemShareImage(), []);

  useEffect(() => {
    if (!open || !data) {
      setPreviewUrl(null); setActionMsg(null);
      return;
    }
    let cancelled = false;
    let revoke: string | null = null;
    generateTrendShareCardPreviewUrl(data).then((url) => {
      if (cancelled) { URL.revokeObjectURL(url); return; }
      revoke = url;
      setPreviewUrl(url);
    }).catch(() => setPreviewUrl(null));
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [open, data]);

  const handleCopy = async () => {
    if (!data) return;
    const ok = await copyTrendShareCardToClipboard(data);
    setActionMsg(ok ? '✓ 已复制到剪贴板' : '复制失败 — 试试下载吧');
  };
  const handleDownload = async () => {
    if (!data) return;
    try {
      await downloadTrendShareCard(data, `office-zoo-trend-${new Date().toISOString().slice(0,10)}.png`);
      setActionMsg('✓ 已下载');
    } catch { setActionMsg('下载失败'); }
  };
  const handleSystemShare = async () => {
    if (!data) return;
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        import('../utils/trendShareCard').then(({ generateTrendShareCard }) => {
          generateTrendShareCard(data).then(resolve, reject);
        });
      });
      const file = new File([blob], 'office-zoo-trend.png', { type: 'image/png' });
      if (!navigator.canShare({ files: [file] })) throw new Error('canShare false');
      await navigator.share({
        files: [file],
        title: '我的周报偏好曲线 · OFFICE ZOO',
        text: `这是我的"AI 周报偏好"在过去一段时间的累计曲线 📈 #我的偏好曲线`,
        url: `${window.location.origin}/weekly/me`,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const ok = await copyTrendShareCardToClipboard(data);
      setActionMsg(ok ? '系统分享不支持, 已复制图片' : '分享失败');
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
                📊 我的偏好曲线 · 分享卡
              </h3>
              <button onClick={onClose}
                className="text-xs text-white/55 hover:text-white/95 transition px-2 py-1 rounded">
                ✕
              </button>
            </div>
            <div className="relative w-full aspect-[4/5] rounded-2xl overflow-hidden mb-4"
              style={{ background: 'rgba(255,255,255,0.025)' }}>
              {previewUrl ? (
                <img src={previewUrl} alt="偏好曲线预览"
                  className="absolute inset-0 w-full h-full object-contain" />
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
              1080 × 1350 · #我的偏好曲线 · 跨时间的累计趋势
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
