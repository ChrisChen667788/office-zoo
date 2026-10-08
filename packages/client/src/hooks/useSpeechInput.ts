/**
 * hooks/useSpeechInput.ts — v6.151 — Web Speech API 语音输入 hook。
 *
 * 封装浏览器 SpeechRecognition 的生命周期管理:
 *   - 状态:idle | listening | unsupported | error
 *   - start / stop
 *   - 识别结果「追加」到外部 setter(不自动发送)
 *   - 8 秒无结果自动停并给出提示(大陆网络下浏览器语音服务可能连不上)
 *   - not-allowed 权限错误单独提示
 *   - 卸载时 abort
 *
 * 不依赖真实 window — 通过 getSpeechRecognitionCtor(window) 探测,
 * 测试可注入 fake window。
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  getSpeechRecognitionCtor,
  localeToSttLang,
  STT_NO_RESULT_TIMEOUT_MS,
} from '@furball/shared';
import { getLocale } from '../utils/i18n';

// v6.151 — 语音输入状态机
export type SpeechInputState = 'idle' | 'listening' | 'unsupported' | 'error';

export interface UseSpeechInputOptions {
  /** 识别到文字时的回调,调用方负责追加到输入框 */
  onTranscript: (text: string) => void;
  /** 错误/超时时的提示回调(人话文本) */
  onMessage?: (msg: string) => void;
  /** 用于测试注入假 window,生产代码无需传 */
  _win?: unknown;
}

export interface UseSpeechInputResult {
  state: SpeechInputState;
  start: () => void;
  stop: () => void;
}

export function useSpeechInput({
  onTranscript,
  onMessage,
  _win,
}: UseSpeechInputOptions): UseSpeechInputResult {
  const [state, setState] = useState<SpeechInputState>('idle');

  // 取真实 window(或注入的 fake)
  const win = typeof _win !== 'undefined' ? _win : (typeof window !== 'undefined' ? window : null);
  const Ctor = getSpeechRecognitionCtor(win);

  // 不支持时直接标记
  const supportedRef = useRef<boolean>(Ctor !== null);
  useEffect(() => {
    if (Ctor === null) setState('unsupported');
  }, []); // 只跑一次,支持性在整个 tab 生命周期不变

  const recognitionRef = useRef<InstanceType<NonNullable<typeof Ctor>> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const onMessageRef = useRef(onMessage);
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);

  // 清理计时器的辅助函数
  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // 停止并清理(不 abort,等识别器自然结束)
  const stop = useCallback(() => {
    clearTimer();
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setState('idle');
  }, [clearTimer]);

  const start = useCallback(() => {
    if (!supportedRef.current || Ctor === null) {
      setState('unsupported');
      return;
    }
    if (state === 'listening') return; // 已在监听,不重复

    try {
      const rec = new Ctor();
      rec.lang = localeToSttLang(getLocale());
      rec.interimResults = false;
      rec.continuous = false;

      rec.onresult = (e) => {
        clearTimer();
        const transcript = Array.from(e.results as ArrayLike<ArrayLike<{ transcript: string }>>)
          .map((r) => r[0]?.transcript ?? '')
          .join('');
        if (transcript) {
          onTranscriptRef.current(transcript);
        }
        setState('idle');
        recognitionRef.current = null;
      };

      rec.onerror = (e) => {
        clearTimer();
        recognitionRef.current = null;
        if (e.error === 'not-allowed') {
          setState('error');
          onMessageRef.current?.('麦克风权限被拒绝,请在浏览器设置里允许使用麦克风');
        } else if (e.error === 'network') {
          setState('error');
          onMessageRef.current?.('语音服务连接失败,大陆网络下浏览器语音 API 可能不可用,请手动输入');
        } else {
          setState('error');
          onMessageRef.current?.(`语音识别出错(${e.error}),请手动输入`);
        }
      };

      rec.onend = () => {
        clearTimer();
        recognitionRef.current = null;
        setState((s) => (s === 'listening' ? 'idle' : s));
      };

      rec.start();
      recognitionRef.current = rec;
      setState('listening');

      // v6.151 — 8 秒无结果自动停并给提示(大陆网络下浏览器语音服务可能连不上)
      timeoutRef.current = setTimeout(() => {
        if (recognitionRef.current) {
          recognitionRef.current.stop();
          recognitionRef.current = null;
        }
        setState('idle');
        onMessageRef.current?.(
          '8 秒内没有收到识别结果 — 大陆网络下浏览器语音服务可能连不上,请直接输入文字',
        );
      }, STT_NO_RESULT_TIMEOUT_MS);
    } catch (err) {
      setState('error');
      onMessageRef.current?.('语音识别启动失败,请手动输入');
      console.warn('[useSpeechInput] start failed:', err);
    }
  }, [Ctor, clearTimer, state]);

  // 卸载时 abort,避免后台识别器悬挂
  useEffect(() => {
    return () => {
      clearTimer();
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, [clearTimer]);

  return { state, start, stop };
}
