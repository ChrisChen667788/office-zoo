/**
 * TalkshowVideoButton — v6.169 — 班味单口播完后的「导出短视频」。
 *
 * 流程:点击 → 同步进入 exportTalkshowVideo(Safari 只在点击里允许 AudioContext 出声)→
 * 实时录制(耗时≈视频时长,按钮显示进度)→ 自动下载;手机上支持系统分享时多一个「分享到 App」。
 * 录不了视频的浏览器:导出带全文字幕与 AI 标识的海报 PNG,有配音时再另存 mp3。
 */
import { useState } from 'react';
import { triggerDownload, type ExportResult, type VideoAspect } from '../../utils/videoExport';
import {
  canRecordVideo,
  exportTalkshowPoster,
  exportTalkshowVideo,
  talkshowShareText,
  talkshowTimeline,
  type TalkshowVideoInput,
} from '../../utils/talkshowVideoExport';
import { AI_LABEL } from '../../utils/aiLabel';

type Status = 'idle' | 'working' | 'done' | 'error';

function shareableFile(result: ExportResult): File | null {
  try {
    const file = new File([result.blob], result.fileName, { type: result.blob.type });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    return typeof nav.share === 'function' && nav.canShare?.({ files: [file] }) ? file : null;
  } catch {
    return null;
  }
}

export default function TalkshowVideoButton({
  input,
  getAudioBlob,
}: {
  input: Omit<TalkshowVideoInput, 'audioBlob' | 'aspect' | 'onProgress'>;
  /** 当前段子已拿到的服务器配音;浏览器朗读兜底时为 null。 */
  getAudioBlob: () => Blob | null;
}) {
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [aspect, setAspect] = useState<VideoAspect>('vertical');
  const [result, setResult] = useState<ExportResult | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const recordable = canRecordVideo();
  const audioBlob = getAudioBlob();
  const estSec = Math.round(talkshowTimeline(input.fallbackDurationSec).totalSec);

  const handleExport = () => {
    if (status === 'working') return;
    setStatus('working');
    setProgress(0);
    setNote(null);
    setResult(null);
    const blob = getAudioBlob();
    const full: TalkshowVideoInput = { ...input, audioBlob: blob, aspect, onProgress: setProgress };

    // 不 await 在 setState 之前:exportTalkshowVideo 的第一步(创建 AudioContext)必须在点击的同步段里。
    const job = recordable ? exportTalkshowVideo(full) : exportTalkshowPoster(full);
    job
      .then((r) => {
        triggerDownload(r);
        setResult(r);
        setStatus('done');
        if (!recordable) {
          if (blob) {
            triggerDownload({
              blob, mimeType: 'audio/mpeg', durationMs: 0,
              fileName: r.fileName.replace(/\.png$/, '.mp3'),
            });
          }
          setNote('当前浏览器录不了视频,已导出海报' + (blob ? '和配音' : '') + ',可在剪映等 App 里合成');
        } else if ('hasAudio' in r && !(r as { hasAudio: boolean }).hasAudio) {
          setNote('这段用的是浏览器朗读,录不进视频,导出的是无声字幕版');
        }
      })
      .catch((err) => {
        console.warn('[talkshow] video export failed', err);
        setStatus('error');
        setNote('导出失败,换 Chrome 或 Safari 再试');
      });
  };

  const handleShare = async () => {
    if (!result) return;
    const file = shareableFile(result);
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: input.title, text: talkshowShareText(input.title) });
    } catch { /* 用户取消 */ }
  };

  const label =
    status === 'working' ? `🎬 生成中 ${Math.round(progress * 100)}%`
  : status === 'done' ? '✓ 已下载,再导一次'
  : recordable ? '🎬 导出短视频' : '🖼️ 导出海报';

  return (
    <div className="flex flex-col items-center gap-2 mb-4" data-testid="talkshow-video-export">
      <div className="flex items-center gap-2">
        {recordable && (
          <div className="flex rounded-lg overflow-hidden text-[11px]" role="group" aria-label="视频方向">
            {(['vertical', 'horizontal'] as const).map((a) => (
              <button
                key={a}
                onClick={() => setAspect(a)}
                disabled={status === 'working'}
                className="px-2.5 py-1.5 transition"
                style={{
                  background: aspect === a ? 'rgba(255,85,136,0.35)' : 'rgba(255,255,255,0.06)',
                  color: aspect === a ? '#fff' : 'rgba(255,255,255,0.6)',
                }}
              >
                {a === 'vertical' ? '竖版 9:16' : '横版 16:9'}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={handleExport}
          disabled={status === 'working'}
          className="px-4 py-2 rounded-xl text-xs font-bold tracking-wide text-white transition disabled:opacity-70"
          style={{ background: 'linear-gradient(135deg,#7c3aed,#4c9eff)', boxShadow: '0 6px 18px rgba(124,58,237,0.35)' }}
        >
          {label}
        </button>
        {status === 'done' && result && shareableFile(result) && (
          <button
            onClick={handleShare}
            className="px-3 py-2 rounded-xl text-xs font-semibold text-white/85"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)' }}
          >
            📤 分享到 App
          </button>
        )}
      </div>
      <div className="text-[11px] text-white/45 text-center px-4">
        {status === 'working'
          ? `实时录制中,约 ${estSec} 秒,请停留在本页`
          : note ?? `画面全程带「${AI_LABEL}」标识${audioBlob ? '' : ' · 本段无配音音频'}`}
      </div>
    </div>
  );
}
