/**
 * v6.94 — 段子活立绘图生视频:纯逻辑回归(prompt 拼装 / 任务态归一 / 下载 URL 容错挖取)。
 * 真正的 MiniMax i2v 调用是异步 I/O,不在单测覆盖(离线脚本 + 真机验证)。
 */
import { describe, it, expect } from 'vitest';
import {
  buildVideoPrompt,
  classifyTaskStatus,
  extractDownloadUrl,
  TALKSHOW_PERSONA_VIDEO_IDS,
} from '../talkshowVideoGen';

describe('talkshowVideoGen — buildVideoPrompt', () => {
  it('6 个 persona 都有专属 prompt,且都带循环/锁定机位/无水印约束', () => {
    expect(TALKSHOW_PERSONA_VIDEO_IDS).toEqual(['shaonv', 'yujie', 'qingse', 'jingying', 'badao', 'qingnian']);
    for (const id of TALKSHOW_PERSONA_VIDEO_IDS) {
      const p = buildVideoPrompt(id);
      expect(p.length).toBeGreaterThan(20);
      expect(p).toContain('循环');
      expect(p).toContain('锁定');
      expect(p).toContain('水印'); // "无…水印"
    }
  });
  it('御姐带讽刺/挑眉、霸道带反差萌 —— 人设关键词进了 prompt', () => {
    expect(buildVideoPrompt('yujie')).toContain('讽刺');
    expect(buildVideoPrompt('badao')).toContain('反差');
  });
  it('未知 persona → 安全兜底,不崩', () => {
    const p = buildVideoPrompt('nope');
    expect(p).toContain('待机');
    expect(p).toContain('循环');
  });
});

describe('talkshowVideoGen — classifyTaskStatus', () => {
  it('Success → success(大小写无关)', () => {
    expect(classifyTaskStatus('Success')).toBe('success');
    expect(classifyTaskStatus('success')).toBe('success');
  });
  it('Fail / failed → fail', () => {
    expect(classifyTaskStatus('Fail')).toBe('fail');
    expect(classifyTaskStatus('failed')).toBe('fail');
  });
  it('排队/处理中/未知 → pending(继续等)', () => {
    for (const s of ['Queueing', 'Preparing', 'Processing', '', undefined]) {
      expect(classifyTaskStatus(s)).toBe('pending');
    }
  });
});

describe('talkshowVideoGen — extractDownloadUrl', () => {
  it('顶层 download_url / video_url', () => {
    expect(extractDownloadUrl({ download_url: 'http://a/x.mp4' })).toBe('http://a/x.mp4');
    expect(extractDownloadUrl({ video_url: 'http://a/y.mp4' })).toBe('http://a/y.mp4');
  });
  it('嵌套 file.download_url(files/retrieve 形态)', () => {
    expect(extractDownloadUrl({ file: { download_url: 'http://a/z.mp4' } })).toBe('http://a/z.mp4');
  });
  it('挖不到 → null,且非对象不崩', () => {
    expect(extractDownloadUrl({ status: 'Success' })).toBeNull();
    expect(extractDownloadUrl(null)).toBeNull();
    expect(extractDownloadUrl('nope')).toBeNull();
  });
});
