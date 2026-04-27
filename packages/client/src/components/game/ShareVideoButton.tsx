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
import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import {
  pickHighlights,
  type SpeechRecord,
} from '../../services/highlightPicker';
import {
  exportShareVideo,
  triggerDownload,
} from '../../utils/videoExport';
import {
  useAvatarUrls,
  useEliminationLog,
  usePlayers,
  useRound,
  useSpeechHistory,
  useWinner,
} from '../../stores/gameStore';

type Status = 'idle' | 'working' | 'done' | 'error';

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

  const handleExport = useCallback(async () => {
    if (status === 'working') return;
    setStatus('working');
    setProgress(0);
    setErrMsg(null);

    try {
      // SpeechHistory in the store is roughly chronological, but it doesn't
      // carry round info — we approximate with the current round (most
      // speeches happen during the discussion phase of the latest round).
      // Future: thread round through addSpeech for sharper scoring.
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

      // Server hosts avatars at /avatars/<role>.png — convert relative refs
      // to absolute so the off-DOM <img> can fetch them. Same pattern as
      // GameMap.
      const serverAbs: Record<string, string> = {};
      for (const [role, url] of Object.entries(avatarUrls)) {
        serverAbs[role] = url.startsWith('http') ? url : url; // already absolute in store
      }

      const result = await exportShareVideo({
        highlights,
        avatarUrls: serverAbs,
        winner,
        onProgress: (p) => setProgress(p),
      });

      triggerDownload(result);
      setStatus('done');
      setTimeout(() => setStatus('idle'), 2200);
    } catch (err) {
      console.error('[ShareVideoButton] export failed', err);
      setErrMsg((err as Error)?.message ?? '导出失败');
      setStatus('error');
      setTimeout(() => { setStatus('idle'); setErrMsg(null); }, 3500);
    }
  }, [
    status, players, eliminationLog, speechHistory, round, winner, avatarUrls,
  ]);

  const label =
    status === 'working' ? `渲染中 · ${Math.round(progress * 100)}%`
  : status === 'done'    ? '✅ 已下载'
  : status === 'error'   ? `失败 — ${errMsg ?? ''}`.slice(0, 36)
                         : '🎬 下载竖版视频';

  return (
    <motion.button
      onClick={handleExport}
      disabled={status === 'working'}
      whileHover={status === 'idle' ? { y: -1 } : undefined}
      whileTap={status === 'idle' ? { scale: 0.98 } : undefined}
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
        boxShadow: status === 'idle'
          ? '0 6px 18px rgba(255,85,136,0.35)'
          : 'none',
      }}
    >
      {/* Progress bar — visible only while encoding */}
      {status === 'working' && (
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
  );
}
