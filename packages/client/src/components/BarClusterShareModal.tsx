/**
 * BarClusterShareModal — v6.3 拼版分享预览 + 一键导出。
 *
 * 用 cluster id 拼出 PNG 预览 URL (走 server-side renderer GET
 * /api/bar/cluster/:id/render.png), 跟 FortuneShareCardModal 的体验对齐:
 *   - 顶部 4:5 预览框 (lazy <img>, 加载中显示 spinner)
 *   - 三按钮: 📲 系统分享 (capability-detect) / 📋 复制图片 /
 *     📥 下载 PNG
 *   - 底部 sharable URL (?cluster=<id>) + 复制按钮
 *
 * 与 FortuneShareCardModal 的关键差异:
 *   - PNG 在服务端渲染 (Playwright), 不在浏览器 canvas 画 — 所以前端
 *     不需要 canvas 绘图代码, 直接拉服务器 image URL 就行
 *   - "复制图片" / "下载" 都先 fetch image 再调 clipboard / a.download
 *
 * 失败兜底: 任何环节出错回退到 navigator.clipboard.writeText 的纯
 * 链接分享, 让用户至少能 share 个 URL。
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface BarClusterShareModalProps {
  open: boolean;
  clusterId: string | null;
  archetype: string;
  onClose: () => void;
  /** 显示在 modal 标题里的人格中文名 (e.g. "阴阳人"). */
  archetypeLabel?: string;
}

interface TeamProfile {
  teamLabel: string | null;
  teamDominant: string | null;
  teamTotal: number;
  perFriend: Array<{ name: string; dominantLabel: string | null; total: number }>;
  chemistry: string;
}

export default function BarClusterShareModal({
  open, clusterId, archetype, onClose, archetypeLabel,
}: BarClusterShareModalProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  // v6.6 — team style profile (拉自 server)
  const [teamProfile, setTeamProfile] = useState<TeamProfile | null>(null);

  const imgUrl = useMemo(() => {
    if (!clusterId) return null;
    // Bypass HTTP cache when modal re-opens (cluster might have new joiner)
    return `/api/bar/cluster/${clusterId}/render.png?t=${Date.now()}`;
  }, [clusterId, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const shareUrl = useMemo(() => {
    if (!clusterId) return '';
    return `${window.location.origin}/bar/${archetype}?cluster=${clusterId}`;
  }, [clusterId, archetype]);

  useEffect(() => {
    if (!open) {
      setImgLoaded(false);
      setImgErr(false);
      setActionMsg(null);
      setTeamProfile(null);
      return;
    }
    if (!clusterId) return;
    // v6.6 — 拉团队风格画像 (异步, 不阻塞 PNG 渲染)
    fetch(`/api/bar/cluster/${clusterId}/team-style-profile`)
      .then((r) => r.json() as Promise<TeamProfile>)
      .then(setTeamProfile)
      .catch(() => setTeamProfile(null));
  }, [open, clusterId]);

  /** Fetch the rendered PNG as a Blob for clipboard / download / share. */
  const fetchBlob = async (): Promise<Blob | null> => {
    if (!imgUrl) return null;
    try {
      const r = await fetch(imgUrl);
      if (!r.ok) return null;
      return await r.blob();
    } catch {
      return null;
    }
  };

  const handleCopy = async () => {
    const blob = await fetchBlob();
    if (!blob) {
      setActionMsg('拉取图片失败, 试试下载');
      return;
    }
    try {
      if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
        throw new Error('clipboard not available');
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setActionMsg('✓ 拼版图片已复制到剪贴板, 贴到聊天里');
    } catch {
      // Fall back to copying the share URL
      try {
        await navigator.clipboard.writeText(shareUrl);
        setActionMsg('图片复制不支持, 已复制链接 — 朋友点开就能看');
      } catch {
        setActionMsg('复制失败, 长按地址栏吧');
      }
    }
  };

  const handleDownload = async () => {
    const blob = await fetchBlob();
    if (!blob) {
      setActionMsg('下载失败, 请重试');
      return;
    }
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `office-zoo-cluster-${clusterId}.png`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 0);
      setActionMsg('✓ 已下载');
    } catch {
      setActionMsg('下载失败, 请重试');
    }
  };

  /** v5.5.1 风 capability detection — Web Share API + file payload */
  const canSystemShare = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    if (typeof navigator.share !== 'function') return false;
    if (typeof navigator.canShare !== 'function') return false;
    try {
      const probe = new File([new Uint8Array(1)], 'p.png', { type: 'image/png' });
      return navigator.canShare({ files: [probe] });
    } catch {
      return false;
    }
  }, []);

  const handleSystemShare = async () => {
    const blob = await fetchBlob();
    if (!blob) {
      setActionMsg('拉取图片失败');
      return;
    }
    try {
      const file = new File([blob], `office-zoo-cluster.png`, { type: 'image/png' });
      if (!navigator.canShare({ files: [file] })) throw new Error('canShare false');
      await navigator.share({
        files: [file],
        title: '朋友拼版 · OFFICE ZOO',
        text: `我们 ${(archetypeLabel ?? archetype)} 拼版的群像金句 🍷  #班味拼版`,
        url: shareUrl,
      });
      // OS share sheet IS the feedback — no message
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return; // user cancelled
      // Fall back to copy
      void handleCopy();
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setActionMsg('✓ 链接已复制, 朋友点开自动加入拼版');
    } catch {
      setActionMsg('复制失败');
    }
  };

  return (
    <AnimatePresence>
      {open && clusterId && (
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
                🍷 朋友拼版分享
              </h3>
              <button
                onClick={onClose}
                className="text-xs text-white/55 hover:text-white/95 transition px-2 py-1 rounded"
                aria-label="关闭"
              >
                ✕
              </button>
            </div>

            {/* PNG preview — 4:5 IG-portrait aspect */}
            <div className="relative w-full aspect-[4/5] rounded-2xl overflow-hidden mb-4"
              style={{ background: 'rgba(255,255,255,0.025)' }}>
              {imgUrl && !imgErr && (
                <img
                  src={imgUrl}
                  alt="朋友拼版 PNG 预览"
                  className="absolute inset-0 w-full h-full object-contain"
                  onLoad={() => setImgLoaded(true)}
                  onError={() => setImgErr(true)}
                />
              )}
              {!imgLoaded && !imgErr && (
                <div className="absolute inset-0 flex items-center justify-center text-white/45 text-xs">
                  ⏳ 服务器渲染中… 首次约 3-5 秒
                </div>
              )}
              {imgErr && (
                <div className="absolute inset-0 flex items-center justify-center text-rose-300/85 text-xs px-6 text-center">
                  ⚠️ 拼版渲染失败 — 可能 cluster 已过期 (30 天 TTL)
                </div>
              )}
            </div>

            {/* v6.6 — 团队风格画像 (基于 weekly preferences 聚合) */}
            {teamProfile && teamProfile.teamTotal > 0 && (
              <div className="rounded-xl p-3 mb-3"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,215,0,0.10), rgba(176,134,255,0.04))',
                  border: '1px solid rgba(255,215,0,0.42)',
                }}>
                <div className="text-[10px] tracking-[0.22em] uppercase mb-1.5 font-bold" style={{ color: '#FFD58A' }}>
                  🎭 团队风格画像
                </div>
                <p className="text-[12px] text-white/90 leading-relaxed mb-2">
                  {teamProfile.chemistry}
                </p>
                {teamProfile.perFriend.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {teamProfile.perFriend.map((f, i) => (
                      <span key={i} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full"
                        style={{
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          color: 'rgba(255,255,255,0.85)',
                        }}>
                        {f.name} {f.dominantLabel ? `· ${f.dominantLabel}` : '· 未点赞'}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            {canSystemShare ? (
              <>
                <button
                  onClick={handleSystemShare}
                  disabled={!imgLoaded}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-black tracking-wide text-white disabled:opacity-50 mb-2"
                  style={{
                    background: 'linear-gradient(135deg, #FFD700, #FFA947)',
                    color: '#1a0d35',
                    boxShadow: '0 6px 18px rgba(255,215,0,0.32)',
                  }}
                >
                  📲 一键分享到 微信 / 小红书 / 微博
                </button>
                <div className="flex gap-2 mb-2">
                  <button onClick={handleCopy} disabled={!imgLoaded}
                    className="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-bold disabled:opacity-50"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: 'rgba(255,255,255,0.85)',
                    }}>
                    📋 复制图片
                  </button>
                  <button onClick={handleDownload} disabled={!imgLoaded}
                    className="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-bold disabled:opacity-50"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: 'rgba(255,255,255,0.85)',
                    }}>
                    📥 下载 PNG
                  </button>
                  <button onClick={handleCopyLink}
                    className="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-bold"
                    style={{
                      background: 'rgba(176,134,255,0.16)',
                      border: '1px solid rgba(176,134,255,0.40)',
                      color: '#b086ff',
                    }}>
                    🔗 复制链接
                  </button>
                </div>
              </>
            ) : (
              <div className="flex gap-2 mb-2">
                <button onClick={handleCopy} disabled={!imgLoaded}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg, #FFD700, #FFA947)',
                    color: '#1a0d35',
                    boxShadow: '0 6px 18px rgba(255,215,0,0.32)',
                  }}>
                  📋 复制图片
                </button>
                <button onClick={handleDownload} disabled={!imgLoaded}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold disabled:opacity-50"
                  style={{
                    background: 'rgba(176,134,255,0.16)',
                    border: '1px solid rgba(176,134,255,0.45)',
                    color: '#b086ff',
                  }}>
                  📥 下载 PNG
                </button>
                <button onClick={handleCopyLink}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: 'rgba(255,255,255,0.85)',
                  }}>
                  🔗 链接
                </button>
              </div>
            )}

            {actionMsg && (
              <div className="text-center text-[11px] text-white/65 mt-1">{actionMsg}</div>
            )}
            <p className="text-center text-[10px] text-white/35 mt-2 leading-relaxed">
              1080 × 1350 · 服务器渲染 · 朋友越多, 金句越满
              <br/>
              邀请链接: <span className="text-white/50">{shareUrl.replace(window.location.origin, '')}</span>
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
