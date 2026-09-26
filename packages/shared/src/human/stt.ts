/**
 * human/stt.ts — v6.151 — STT(语音转文字)纯辅助函数。
 *
 * 浏览器 Web Speech API 包装层的「共享」部分:locale 映射、文本清洗、构造器探测。
 * 不依赖任何浏览器 API,可在 Node / Vitest 环境里测。
 *
 * 对应 HUMAN_SPEECH_MAX_LEN(来自 human/roles.ts)复用到嘉宾发言长度上限。
 */

import { HUMAN_SPEECH_MAX_LEN } from './roles';

export type SttLocale = 'zh-CN' | 'en-US' | 'ja-JP' | 'ko-KR';

/** 四个支持 locale 原样映射到 SpeechRecognition lang 属性;未知值回落 'zh-CN'。 */
export function localeToSttLang(locale: string): SttLocale {
  const supported: SttLocale[] = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR'];
  return supported.includes(locale as SttLocale)
    ? (locale as SttLocale)
    : 'zh-CN';
}

/**
 * 清洗 STT 识别结果:
 *   - trim 前后空白
 *   - 连续空白(空格/制表符/换行)压成单个空格
 *   - 截断到 maxLen
 *   - 空字符串返回 null
 */
export function cleanSttTranscript(
  raw: string,
  maxLen: number = HUMAN_SPEECH_MAX_LEN,
): string | null {
  const trimmed = raw.trim().replace(/\s+/g, ' ').slice(0, maxLen);
  return trimmed.length > 0 ? trimmed : null;
}

/** 没有 STT 结果超时毫秒数(大陆网络下浏览器语音服务可能连不上,8 秒算无结果)。 */
export const STT_NO_RESULT_TIMEOUT_MS = 8_000;

/** SpeechRecognition 构造器类型(避免直接引用浏览器全局)。 */
export type SpeechRecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<{ [index: number]: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

/**
 * 从 window-like 对象中探测 SpeechRecognition 构造器。
 * 依次取 SpeechRecognition / webkitSpeechRecognition,都没有返回 null。
 * 纯函数,可用假 window 对象测。
 */
export function getSpeechRecognitionCtor(
  win: unknown,
): SpeechRecognitionCtor | null {
  if (!win || typeof win !== 'object') return null;
  const w = win as Record<string, unknown>;
  if (typeof w['SpeechRecognition'] === 'function') {
    return w['SpeechRecognition'] as SpeechRecognitionCtor;
  }
  if (typeof w['webkitSpeechRecognition'] === 'function') {
    return w['webkitSpeechRecognition'] as SpeechRecognitionCtor;
  }
  return null;
}
