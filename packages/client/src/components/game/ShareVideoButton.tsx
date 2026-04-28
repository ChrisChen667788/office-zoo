/**
 * ShareVideoButton — one-click "下载竖版视频" button on the post-game
 * HighlightReel modal.
 *
 * Flow:
 *   1. Click → enter `working` state, kick off `pickHighlights` + `exportShareVideo`
 *   2. Surface progress 0..100% in the button label (tied to `onProgress`)
 *   3. On success → `triggerDownload` (browser save-as) → flash 已下载 for 2 s
 *   4. On error → flash error label, restore idle after 3 s, log to console
 *
 * The button is intentionally heavy-weight (renders a 30 s 1080p video, takes
 * ~30-35 s wall-clock). We disable it during work + show the progress bar so
 * the user can't double-click and queue two encodes in parallel — the second
 * one would crash because MediaRecorder grabs the canvas exclusively.
 */
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  pickHighlights,
  type SpeechRecord,
} from '../../services/highlightPicker';
import { fetchHighlightCaptions } from '../../services/highlightCaptionClient';
import {
  exportShareVideo,
  triggerDownload,
  type ExportResult,
  type VideoAspect,
} from '../../utils/videoExport';
import {
  useAvatarUrls,
  useEliminationLog,
  usePlayers,
  useRound,
  useSpeechHistory,
  useWinner,
} from '../../stores/gameStore';

type Status = 'idle' | 'captions' | 'rendering' | 'transcoding' | 'done' | 'error';

/** Detect if the browser exposes the Web Share API with file support.
 *  iOS Safari 16+, Chrome on Android 89+. Desktop Chrome / Firefox don't
 *  ship file-share so we hide the button there. */
function canWebShareFile(file: File): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'share' in navigator &&
    typeof (navigator as Navigator & { canShare?: (data: ShareData) => boolean }).canShare === 'function' &&
    !!(navigator as Navigator & { canShare?: (data: ShareData) => boolean }).canShare?.({ files: [file] })
  );
}

export default function ShareVideoButton() {
  const players = usePlayers();
  const eliminationLog = useEliminationLog();
  const speechHistory = useSpeechHistory();
  const round = useRound();
  const winner = useWinner();
  const avatarUrls = useAvatarUrls();

  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  /** Cached last-rendered video so the "系统分享" button can re-share without
   *  re-rendering. Cleared when status flips back to idle. */
  const [lastResult, setLastResult] = useState<ExportResult | null>(null);
  /** v0.4.0 — output orientation. Default vertical (抖音 / 小红书 / 朋友圈).
   *  User can switch to horizontal for B 站 PC / Twitter / YouTube preview. */
  const [aspect, setAspect] = useState<VideoAspect>('vertical');
  /** v0.4.0 — server transcode availability, probed once on mount. When
   *  the server has ffmpeg installed we surface a "🎞️ 转高清 MP4" affordance
   *  after the initial download so non-mp4 outputs (Chrome webm) get a
   *  one-click upgrade for platforms that reject webm. */
  const [transcodeOK, setTranscodeOK] = useState<boolean>(false);
  // Probe once.
  useEffect(() => {
    let mounted = true;
    fetch('/api/share/capabilities')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (mounted && data?.transcode) setTranscodeOK(true); })
      .catch(() => { /* leave false */ });
    return () => { mounted = false; };
  }, []);

  const handleExport = useCallback(async () => {
    if (status === 'captions' || status === 'rendering') return;
    setStatus('captions');
    setProgress(0);
    setErrMsg(null);
    setLastResult(null);

    try {
      // SpeechHistory in the store is roughly chronological, but it doesn't
      // carry round info — we approximate with the current round (most
      // speeches happen during the discussion phase of the latest round).
      const speeches: SpeechRecord[] = speechHistory.map((s) => ({
        playerId: s.playerId,
        playerName: s.playerName,
        text: s.text,
        role: s.role,
        team: s.team as SpeechRecord['team'],
        round,
      }));

      const highlights = pickHighlights({
        players,
        eliminationLog,
        speeches,
        winner,
        totalRounds: round,
      });

      // v0.3.1 — fetch LLM captions in parallel before render. Soft-fail:
      // any failure returns each highlight's structured headline as the
      // caption, so the video render NEVER blocks on captioning.
      const captions = await fetchHighlightCaptions(highlights);
      const captioned = highlights.map((h, i) => ({ ...h, caption: captions[i] }));

      setStatus('rendering');

      // Server hosts avatars at /avatars/<role>.png — already absolute URLs
      // in the store thanks to setAvatarUrl prepending the server host.
      const result = await exportShareVideo({
        highlights: captioned,
        avatarUrls,
        winner,
        aspect,
        onProgress: (p) => setProgress(p),
      });

      triggerDownload(result);
      setLastResult(result);
      setStatus('done');
      // Don't auto-flip back to idle while a result is cached — let the
      // "系统分享" button stay visible so the user can re-share immediately.
    } catch (err) {
      console.error('[ShareVideoButton] export failed', err);
      setErrMsg((err as Error)?.message ?? '导出失败');
      setStatus('error');
      setTimeout(() => { setStatus('idle'); setErrMsg(null); }, 3500);
    }
  }, [
    status, players, eliminationLog, speechHistory, round, winner, avatarUrls, aspect,
  ]);

  /** v0.4.0 — pipe the cached webm/mp4 through /api/share/transcode for an
   *  h.264 mp4 with faststart. Replaces `lastResult` with the transcoded
   *  blob so the system-share button picks up the new format too. */
  const handleTranscode = useCallback(async () => {
    if (!lastResult) return;
    setStatus('transcoding');
    try {
      const resp = await fetch('/api/share/transcode', {
        method: 'POST',
        headers: { 'Content-Type': lastResult.mimeType },
        body: lastResult.blob,
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        throw new Error(err.error ?? `HTTP ${resp.status}`);
      }
      const mp4Blob = await resp.blob();
      const baseName = lastResult.fileName.replace(/\.(webm|mp4)$/i, '');
      const upgraded: ExportResult = {
        blob: mp4Blob,
        mimeType: 'video/mp4',
        fileName: `${baseName}.mp4`,
        durationMs: lastResult.durationMs,
      };
      triggerDownload(upgraded);
      setLastResult(upgraded);
      setStatus('done');
    } catch (err) {
      console.error('[ShareVideoButton] transcode failed', err);
      setErrMsg((err as Error)?.message ?? '转码失败');
      setStatus('error');
      setTimeout(() => { setStatus('done'); setErrMsg(null); }, 3500);
    }
  }, [lastResult]);

  /** v0.3.2: Web Share API integration. Tries `navigator.share` with the
   *  cached video file; falls back to a text+URL share so iOS Android still
   *  surfaces the system share sheet even when file-share isn't supported. */
  const handleSystemShare = useCallback(async () => {
    if (!lastResult) return;
    const file = new File([lastResult.blob], lastResult.fileName, { type: lastResult.mimeType });
    const baseShare: ShareData = {
      title: 'OFFICE ZOO · 班味剧场',
      text: '我的 AI 鼠人剧场战报 — 看 9 个 AI 员工怎么互卷开除我老板',
      url: 'https://github.com/ChrisChen667788/office-zoo',
    };
    try {
      if (canWebShareFile(file)) {
        await navigator.share({ ...baseShare, files: [file] });
      } else if ('share' in navigator) {
        await navigator.share(baseShare);
      } else {
        // Final fallback: copy a deeplink so the user can paste anywhere.
        await navigator.clipboard.writeText(`${baseShare.text}\n${baseShare.url}`);
        // Lightweight toast via the same status flash mechanism.
        setErrMsg('已复制分享文案到剪贴板');
        setStatus('error');
        setTimeout(() => { setStatus('done'); setErrMsg(null); }, 2200);
      }
    } catch (err) {
      // User-cancelled share = no-op. Other errors → console.
      const isAbort = (err as Error)?.name === 'AbortError';
      if (!isAbort) console.warn('[ShareVideoButton] share failed', err);
    }
  }, [lastResult]);

  const label =
    status === 'captions'    ? '💡 生成爆款标题中…'
  : status === 'rendering'   ? `渲染视频 · ${Math.round(progress * 100)}%`
  : status === 'transcoding' ? '🎞️ 转码 mp4 中…'
  : status === 'done'        ? '✅ 已下载,点击重导'
  : status === 'error'       ? `失败 — ${errMsg ?? ''}`.slice(0, 36)
                             : '🎬 下载视频';

  // Surface the system-share button only after a successful render AND when
  // at least basic Web Share API exists. Hidden on desktop browsers.
  const showShareSystem =
    status === 'done' && lastResult !== null &&
    typeof navigator !== 'undefined' && 'share' in navigator;

  const isWorking = status === 'captions' || status === 'rendering' || status === 'transcoding';
  // Surface the transcode button only when:
  //   - server reports ffmpeg available
  //   - we have a successful local render
  //   - that render isn't already mp4 (saves a wasted round-trip)
  const showTranscode =
    status === 'done' && lastResult !== null && transcodeOK &&
    !lastResult.mimeType.includes('mp4');

  return (
    <div className="inline-flex gap-2 flex-wrap items-center">
      {/* v0.4.0 aspect toggle — sits to the LEFT of the main CTA so the
          user picks orientation before clicking download. Hidden during
          render to avoid mid-flight format swaps. */}
      {!isWorking && (
        <div
          className="inline-flex p-0.5 rounded-lg"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.10)',
          }}
        >
          {(['vertical', 'horizontal'] as VideoAspect[]).map((opt) => (
            <button
              key={opt}
              onClick={() => setAspect(opt)}
              className="px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide transition"
              style={{
                color: aspect === opt ? '#fff' : 'rgba(255,255,255,0.55)',
                background: aspect === opt
                  ? 'linear-gradient(135deg, #ff5588 0%, #7c3aed 100%)'
                  : 'transparent',
              }}
              aria-label={opt === 'vertical' ? '竖版 9:16' : '横版 16:9'}
            >
              {opt === 'vertical' ? '📱 竖版' : '💻 横版'}
            </button>
          ))}
        </div>
      )}

      <motion.button
        onClick={handleExport}
        disabled={isWorking}
        whileHover={!isWorking ? { y: -1 } : undefined}
        whileTap={!isWorking ? { scale: 0.98 } : undefined}
        className="relative overflow-hidden px-5 py-2.5 rounded-xl text-[12px] font-bold tracking-wide disabled:cursor-wait"
        style={{
          background: status === 'done'
            ? 'linear-gradient(135deg, #6ee7b7 0%, #4cb5ff 100%)'
            : status === 'error'
              ? 'rgba(248,113,113,0.18)'
              : 'linear-gradient(135deg, #ff5588 0%, #7c3aed 100%)',
          color: status === 'error' ? '#f87171' : '#fff',
          border: status === 'error'
            ? '1px solid rgba(248,113,113,0.45)'
            : '1px solid rgba(255,255,255,0.18)',
          boxShadow: !isWorking
            ? '0 6px 18px rgba(255,85,136,0.35)'
            : 'none',
        }}
      >
        {/* Progress bar — visible only while encoding (rendering phase). */}
        {status === 'rendering' && (
          <span
            aria-hidden
            className="absolute left-0 top-0 bottom-0"
            style={{
              width: `${Math.round(progress * 100)}%`,
              background: 'rgba(255,255,255,0.25)',
              transition: 'width 0.3s ease-out',
            }}
          />
        )}
        <span className="relative z-10 inline-flex items-center gap-1.5">
          {label}
        </span>
      </motion.button>

      {/* v0.4.0 — server-side transcode button. Only when ffmpeg is on
          the host AND the local render isn't already mp4. */}
      {showTranscode && (
        <motion.button
          onClick={handleTranscode}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          className="px-4 py-2.5 rounded-xl text-[12px] font-bold tracking-wide"
          style={{
            background: 'rgba(126,200,255,0.12)',
            color: '#7ec8ff',
            border: '1px solid rgba(126,200,255,0.45)',
          }}
        >
          🎞️ 转高清 mp4
        </motion.button>
      )}

      {/* v0.3.2 — system share button. Mobile-only (Web Share API). */}
      {showShareSystem && (
        <motion.button
          onClick={handleSystemShare}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          className="px-4 py-2.5 rounded-xl text-[12px] font-bold tracking-wide"
          style={{
            background: 'rgba(255,255,255,0.10)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.25)',
          }}
        >
          📤 系统分享
        </motion.button>
      )}
    </div>
  );
}
