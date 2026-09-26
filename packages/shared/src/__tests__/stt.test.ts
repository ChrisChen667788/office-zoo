/**
 * v6.151 — STT 纯函数回归:locale 映射 / 文本清洗 / 构造器探测。
 */
import { describe, it, expect } from 'vitest';
import {
  localeToSttLang,
  cleanSttTranscript,
  getSpeechRecognitionCtor,
  STT_NO_RESULT_TIMEOUT_MS,
} from '../human/stt';
import { HUMAN_SPEECH_MAX_LEN } from '../human/roles';

describe('localeToSttLang — 映射', () => {
  it('四个合法 locale 原样映射', () => {
    expect(localeToSttLang('zh-CN')).toBe('zh-CN');
    expect(localeToSttLang('en-US')).toBe('en-US');
    expect(localeToSttLang('ja-JP')).toBe('ja-JP');
    expect(localeToSttLang('ko-KR')).toBe('ko-KR');
  });

  it('未知值回落 zh-CN', () => {
    expect(localeToSttLang('')).toBe('zh-CN');
    expect(localeToSttLang('fr-FR')).toBe('zh-CN');
    expect(localeToSttLang('invalid')).toBe('zh-CN');
  });
});

describe('cleanSttTranscript — 清洗', () => {
  it('trim 前后空白', () => {
    expect(cleanSttTranscript('  hello  ')).toBe('hello');
  });

  it('连续空白压成单个空格', () => {
    expect(cleanSttTranscript('hello  \t  world\n大家好')).toBe('hello world 大家好');
  });

  it('截断到 maxLen', () => {
    const long = 'x'.repeat(200);
    const result = cleanSttTranscript(long);
    expect(result).toHaveLength(HUMAN_SPEECH_MAX_LEN);
  });

  it('自定义 maxLen', () => {
    const result = cleanSttTranscript('abcdefghij', 5);
    expect(result).toBe('abcde');
  });

  it('空字符串返回 null', () => {
    expect(cleanSttTranscript('')).toBeNull();
    expect(cleanSttTranscript('   ')).toBeNull();
    expect(cleanSttTranscript('\t\n')).toBeNull();
  });

  it('正常短文本原样返回', () => {
    expect(cleanSttTranscript('别欺负实习生')).toBe('别欺负实习生');
  });
});

describe('STT_NO_RESULT_TIMEOUT_MS — 常量', () => {
  it('值为 8000(8 秒)', () => {
    expect(STT_NO_RESULT_TIMEOUT_MS).toBe(8_000);
  });
});

describe('getSpeechRecognitionCtor — 构造器探测', () => {
  it('无 window 返回 null', () => {
    expect(getSpeechRecognitionCtor(null)).toBeNull();
    expect(getSpeechRecognitionCtor(undefined)).toBeNull();
    expect(getSpeechRecognitionCtor(42)).toBeNull();
  });

  it('没有 SpeechRecognition 也没有 webkit 前缀时返回 null', () => {
    expect(getSpeechRecognitionCtor({})).toBeNull();
    expect(getSpeechRecognitionCtor({ AudioContext: function () {} })).toBeNull();
  });

  it('标准 SpeechRecognition 存在时返回它', () => {
    const FakeSR = function () {};
    const win = { SpeechRecognition: FakeSR };
    expect(getSpeechRecognitionCtor(win)).toBe(FakeSR);
  });

  it('webkit 前缀回退:没有标准 SpeechRecognition 但有 webkitSpeechRecognition', () => {
    const FakeSR = function () {};
    const win = { webkitSpeechRecognition: FakeSR };
    expect(getSpeechRecognitionCtor(win)).toBe(FakeSR);
  });

  it('标准优先于 webkit 前缀', () => {
    const StandardSR = function () {};
    const WebkitSR = function () {};
    const win = { SpeechRecognition: StandardSR, webkitSpeechRecognition: WebkitSR };
    expect(getSpeechRecognitionCtor(win)).toBe(StandardSR);
  });
});
