/**
 * MicButton.tsx — v6.151 — 语音输入触发按钮。
 *
 * 行为:
 *   - 浏览器不支持 SpeechRecognition → 不渲染任何内容
 *   - 点击开始/停止识别;识别中有脉冲动效
 *   - 识别结果「追加」到调用方的 setter(不自动发送)
 *   - 遵守长度上限(maxLen)
 *   - 错误/超时时调用 onMessage 给出人话提示
 */

import React from 'react';
import { useSpeechInput } from '../hooks/useSpeechInput';
import { getSpeechRecognitionCtor } from '@furball/shared';

export interface MicButtonProps {
  /** 识别文字追加到 value,调用方更新输入框 */
  value: string;
  onChange: (next: string) => void;
  maxLen?: number;
  /** 错误/超时时的提示回调 */
  onMessage?: (msg: string) => void;
  /** 样式覆盖(可选) */
  style?: React.CSSProperties;
}

export default function MicButton({
  value,
  onChange,
  maxLen = 120,
  onMessage,
  style,
}: MicButtonProps) {
  // 浏览器不支持时不渲染,避免占位
  if (typeof window !== 'undefined' && getSpeechRecognitionCtor(window) === null) {
    return null;
  }

  return <MicButtonInner value={value} onChange={onChange} maxLen={maxLen} onMessage={onMessage} style={style} />;
}

// 分离内部组件以便 hook 在真实浏览器里调用
function MicButtonInner({
  value,
  onChange,
  maxLen,
  onMessage,
  style,
}: Required<Pick<MicButtonProps, 'value' | 'onChange' | 'maxLen'>> &
  Pick<MicButtonProps, 'onMessage' | 'style'>) {
  const { state, start, stop } = useSpeechInput({
    onTranscript: (text) => {
      // v6.151 — 追加到输入框,遵守长度上限
      const combined = (value + text).slice(0, maxLen);
      onChange(combined);
    },
    onMessage,
  });

  if (state === 'unsupported') return null;

  const isListening = state === 'listening';

  return (
    <button
      type="button"
      onClick={isListening ? stop : start}
      title={isListening ? '停止录音' : '语音输入(点击后说话)'}
      style={{
        // v6.151 — 麦克风按钮:圆形小按钮,听写中有红色脉冲
        width: 28, height: 28,
        borderRadius: '50%',
        border: isListening
          ? '1.5px solid rgba(255, 80, 80, 0.85)'
          : '1.5px solid rgba(127, 212, 255, 0.35)',
        background: isListening
          ? 'rgba(255, 60, 60, 0.18)'
          : 'rgba(127, 212, 255, 0.08)',
        color: isListening ? '#ff5050' : 'rgba(127, 212, 255, 0.75)',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        flexShrink: 0,
        padding: 0,
        // 脉冲动画:听写中微微缩放
        animation: isListening ? 'micPulse 1s ease-in-out infinite' : 'none',
        ...style,
      }}
    >
      {isListening ? '⏹' : '🎙'}
    </button>
  );
}
