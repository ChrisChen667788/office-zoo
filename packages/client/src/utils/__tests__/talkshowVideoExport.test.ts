/**
 * v6.169 — 班味单口导出视频 + 经典局导出视频的 AI 标识回归。
 *
 * 录制本身(MediaRecorder / WebAudio)只能在真浏览器里跑;这里锁住纯逻辑与逐帧绘制:
 *   - 字幕时间轴:片头 0、配音结束 1、按字符推进、长句只露最后几行
 *   - **每一帧**都画了「AI 生成」水印,片尾整屏「本视频由 AI 生成」(导出文件自带标识)
 *   - 录制格式:有声音时必须选带音频编码的 mime
 * 用一个只记录 fillText 的假 2D ctx 逐帧断言。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  captionAt,
  captionProgress,
  drawTalkshowFrame,
  exportTalkshowVideo,
  pickRecorderMime,
  splitSentences,
  talkshowTimeline,
  TALKSHOW_MAX_BODY_SEC,
  wrapLines,
} from '../talkshowVideoExport';
import { drawShareVideoFrame, stopRecorder } from '../videoExport';
import { AI_LABEL, AI_VIDEO_END_LABEL } from '../aiLabel';

/** 假 CanvasRenderingContext2D:记录 fillText,measureText 按字数估宽,其余方法 no-op。 */
function fakeCtx() {
  const texts: string[] = [];
  const state: Record<string | symbol, unknown> = { font: '10px sans-serif' };
  const target = {
    fillText: (t: string) => { texts.push(String(t)); },
    measureText: (t: string) => {
      const px = Number(/(\d+)px/.exec(String(state.font))?.[1] ?? 10);
      return { width: [...String(t)].length * px };
    },
    createLinearGradient: () => ({ addColorStop: () => {} }),
  } as Record<string, unknown>;
  const ctx = new Proxy(target, {
    get: (t, k) => (k in t ? t[k as string] : k in state ? state[k] : () => {}),
    set: (_t, k, v) => { state[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, texts, reset: () => { texts.length = 0; } };
}

const INPUT = {
  title: '周报写成了小说',
  tagLabel: '🗣️ 黑话',
  tagColor: '#7c3aed',
  personaLabel: '御姐音',
  personaEmoji: '💃',
};
const TEXT = '领导说要对齐颗粒度。我对齐了一下午，发现颗粒是我自己！你问我闭环了没？我说环是闭了，人没了。';

describe('字幕时间轴', () => {
  it('splitSentences 按句末标点切,标点留在句尾', () => {
    expect(splitSentences(TEXT)).toEqual([
      '领导说要对齐颗粒度。', '我对齐了一下午，发现颗粒是我自己！', '你问我闭环了没？', '我说环是闭了，人没了。',
    ]);
    expect(splitSentences('没有标点的一句')).toEqual(['没有标点的一句']);
    expect(splitSentences('  \n ')).toEqual([]);
  });

  it('captionProgress:片头为 0,配音结束为 1,中间线性', () => {
    const tl = talkshowTimeline(10);
    expect(captionProgress(0, tl)).toBe(0);
    expect(captionProgress(tl.introSec, tl)).toBe(0);
    expect(captionProgress(tl.introSec + 5, tl)).toBeCloseTo(0.5);
    expect(captionProgress(tl.introSec + 10, tl)).toBe(1);
    expect(captionProgress(tl.totalSec, tl)).toBe(1);
  });

  it('timeline:配音时长封顶 120 秒,非法时长有下限', () => {
    expect(talkshowTimeline(600).bodySec).toBe(TALKSHOW_MAX_BODY_SEC);
    expect(talkshowTimeline(Number.NaN).bodySec).toBe(3);
    expect(talkshowTimeline(0).bodySec).toBe(3);
  });

  it('captionAt:按字符推进;念到第二句时上一句作为淡显上下文', () => {
    const s = splitSentences(TEXT);
    expect(captionAt(s, 0)).toEqual({ previous: '', current: '' });
    const first = [...s[0]].length;
    const total = s.reduce((n, x) => n + [...x].length, 0);
    const mid = captionAt(s, (first + 3) / total);
    expect(mid.previous).toBe(s[0]);
    expect(mid.current).toBe([...s[1]].slice(0, 3).join(''));
    expect(captionAt(s, 1)).toEqual({ previous: s[2], current: s[3] });
    expect(captionAt([], 0.5)).toEqual({ previous: '', current: '' });
  });
});

describe('导出视频的每一帧都带 AI 生成标识', () => {
  it('班味单口:片头 / 正文 / 片尾所有采样帧都画了水印;片尾整屏声明', () => {
    const tl = talkshowTimeline(12);
    const sentences = splitSentences(TEXT);
    const { ctx, texts, reset } = fakeCtx();
    for (const dims of [{ w: 1080, h: 1920 }, { w: 1920, h: 1080 }]) {
      for (let t = 0; t <= tl.totalSec; t += 0.5) {
        reset();
        drawTalkshowFrame(ctx, t, INPUT, { portrait: null, sentences }, tl, dims);
        expect(texts, `t=${t} ${dims.w}x${dims.h}`).toContain(AI_LABEL);
      }
      reset();
      drawTalkshowFrame(ctx, tl.introSec + tl.bodySec + 1, INPUT, { portrait: null, sentences }, tl, dims);
      expect(texts).toContain(AI_VIDEO_END_LABEL);
    }
  });

  it('正文帧里能看到标题与正在念的字幕', () => {
    const tl = talkshowTimeline(12);
    const { ctx, texts } = fakeCtx();
    drawTalkshowFrame(ctx, tl.introSec + 11.9, INPUT, { portrait: null, sentences: splitSentences(TEXT) }, tl, { w: 1080, h: 1920 });
    const all = texts.join('|');
    expect(all).toContain('周报写成了小说');
    expect(all).toContain('人没了');
  });

  it('经典局高光视频:片头 / 高光 / 片尾每帧都画了水印,片尾有声明', () => {
    const { ctx, texts, reset } = fakeCtx();
    const opts = { highlights: [], winner: 'cat' };
    for (let t = 0; t <= 30; t += 1) {
      reset();
      drawShareVideoFrame(ctx, t, opts, new Map(), { w: 1080, h: 1920 });
      expect(texts, `t=${t}`).toContain(AI_LABEL);
    }
    reset();
    drawShareVideoFrame(ctx, 29.5, opts, new Map(), { w: 1080, h: 1920 });
    expect(texts).toContain(AI_VIDEO_END_LABEL);
  });
});

describe('wrapLines(画面字幕换行)', () => {
  const m = { measureText: (t: string) => ({ width: [...t].length * 10 }) } as Pick<CanvasRenderingContext2D, 'measureText'>;

  it('英文 / 数字连写不拆开(实测出现过「被 A / I 筛掉了」)', () => {
    const lines = wrapLines(m, '35 岁那年我的简历被 AI 筛掉了', 120);
    expect(lines.some((l) => l.endsWith('A') || l.startsWith('I'))).toBe(false);
    // 只可能在换行处吞掉空格,字不能丢
    expect(lines.join('').replace(/\s/g, '')).toBe('35岁那年我的简历被AI筛掉了');
    expect(lines.some((l) => l.includes('AI'))).toBe(true);
  });

  it('标点不落行首(实测出现过行首「、」)', () => {
    const lines = wrapLines(m, '会写代码、会做剪辑、会运营、还要长得好看。', 50);
    for (const l of lines) expect(/^[，。、！？；：,.!?;:]/.test(l)).toBe(false);
  });

  it('比一行还长的单词才逐字拆;显式换行保留', () => {
    expect(wrapLines(m, 'abcdefghijkl', 50)).toEqual(['abcde', 'fghij', 'kl']);
    expect(wrapLines(m, '第一行\n第二行', 200)).toEqual(['第一行', '第二行']);
  });
});

describe('pickRecorderMime', () => {
  it('有声音时只选带音频编码的格式,优先 mp4', () => {
    const all = () => true;
    expect(pickRecorderMime(true, all)).toBe('video/mp4;codecs=avc1.42E01E,mp4a.40.2');
    const chromeOld = (m: string) => m.startsWith('video/webm');
    expect(pickRecorderMime(true, chromeOld)).toBe('video/webm;codecs=vp9,opus');
  });
  it('无声音时选纯视频编码;都不支持返回 null;isTypeSupported 抛错按不支持处理', () => {
    expect(pickRecorderMime(false, (m) => m === 'video/webm;codecs=vp8')).toBe('video/webm;codecs=vp8');
    expect(pickRecorderMime(true, () => false)).toBeNull();
    expect(pickRecorderMime(true, () => { throw new Error('boom'); })).toBeNull();
  });
});

describe('录制收尾不挂死、不泄漏', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('录不了视频的浏览器:点击时为配音建的 AudioContext 会被关掉', async () => {
    const closed: number[] = [];
    class FakeAC { resume() { return Promise.resolve(); } close() { closed.push(1); return Promise.resolve(); } }
    vi.stubGlobal('window', { AudioContext: FakeAC }); // 没有 MediaRecorder → canRecordVideo() 为 false
    await expect(exportTalkshowVideo({ ...INPUT, text: TEXT, audioBlob: new Blob(['x']) } as Parameters<typeof exportTalkshowVideo>[0]))
      .rejects.toThrow(/unavailable/);
    expect(closed).toHaveLength(1);
  });

  it('stopRecorder:onstop 在 stop() 里同步触发也能收到(先挂回调再 stop)', async () => {
    const rec = { state: 'recording' as RecordingState, onstop: null as MediaRecorder['onstop'],
      stop() { this.state = 'inactive'; this.onstop?.call(this as unknown as MediaRecorder, new Event('stop')); } };
    vi.useFakeTimers(); // 时限兜底不推进:必须是 onstop 本身让它返回
    let done = false;
    void stopRecorder(rec, 5000).then(() => { done = true; });
    await Promise.resolve();
    expect(done).toBe(true);
  });

  it('stopRecorder:录制器已经自己停了 → 不调 stop()、立即返回', async () => {
    const stop = vi.fn();
    await stopRecorder({ state: 'inactive', onstop: null, stop }, 10_000);
    expect(stop).not.toHaveBeenCalled();
  });

  it('stopRecorder:onstop 一直不来 → 到时限也返回,导出不会永远挂着', async () => {
    vi.useFakeTimers();
    const p = stopRecorder({ state: 'recording', onstop: null, stop() {} }, 5000);
    vi.advanceTimersByTime(5000);
    await expect(p).resolves.toBeUndefined();
  });
});
