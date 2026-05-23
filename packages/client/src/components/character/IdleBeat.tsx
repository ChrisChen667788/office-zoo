/**
 * IdleBeat — v6.8 P3 typing-window idle micro-action.
 *
 * Surfaces during the 1-3s LLM-thinking window between the engine's
 * `speech_start` and `speech` events, when a player isSpeaking but
 * speechText is still empty.
 *
 * Per personality:
 *   - workaholic       (卷王)   → 🌀 转笔 (perpetual rotation)
 *   - introvert        (社恐)   → 💭 缩壳 (scale pulse)
 *   - contrarian       (杠精)   → ❓ 找漏洞 (slight horizontal shake)
 *   - sycophant        (舔狗)   → 💕 等夸 (opacity + scale pulse)
 *   - passive_aggressive (阴阳) → 😏 嘴角上扬 (slow rotate L/R)
 *   - hot_tempered     (暴躁)   → 💢 暴怒前夕 (fast shake)
 *   - smooth_operator  (老狐狸) → 🤔 算计 (vertical bob slow)
 *   - social_butterfly (社牛)   → 🗣️ 跃跃欲试 (bounce up loop)
 *
 * Replaces the default 3-dot typing indicator with personality-aware
 * micro-action. Disappears immediately when speechText arrives.
 *
 * Implementation: pure CSS keyframes (no framer-motion runtime cost
 * for an animation that re-mounts dozens of times per game). One
 * <style> block at module scope holds all 8 keyframes.
 */

import { useMemo } from 'react';

const ACTIONS: Record<string, { emoji: string; anim: string; caption: string }> = {
  workaholic:         { emoji: '🌀', anim: 'idleSpin',     caption: '在转笔' },
  introvert:          { emoji: '💭', anim: 'idleShrink',   caption: '缩壳' },
  contrarian:         { emoji: '❓', anim: 'idleHShake',   caption: '找漏洞' },
  sycophant:          { emoji: '💕', anim: 'idlePulse',    caption: '等夸我' },
  passive_aggressive: { emoji: '😏', anim: 'idleSmirk',    caption: '阴阳预热' },
  hot_tempered:       { emoji: '💢', anim: 'idleRage',     caption: '快忍不住' },
  smooth_operator:    { emoji: '🤔', anim: 'idleBob',      caption: '在算计' },
  social_butterfly:   { emoji: '🗣️', anim: 'idleBounce',   caption: '抢着说' },
};

// Fallback for personality ids we don't know — generic "thinking" dots.
const DEFAULT_ACTION = { emoji: '💭', anim: 'idleShrink', caption: '思考中' };

interface Props {
  personality?: string;
  /** Optional visual color tint from team / role (passed by caller). */
  tint?: string;
  /** Size in px for the emoji. Default 28, smaller for chat-row context. */
  size?: number;
  /** Show the caption next to the emoji (Immersive yes, chat-row no). */
  showCaption?: boolean;
}

export default function IdleBeat({ personality, tint = '#FFD700', size = 28, showCaption = true }: Props) {
  const action = useMemo(() => {
    if (personality && ACTIONS[personality]) return ACTIONS[personality];
    return DEFAULT_ACTION;
  }, [personality]);

  return (
    <div
      role="status"
      aria-label={action.caption}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 10px', borderRadius: 999,
        background: 'rgba(15,14,46,0.65)',
        backdropFilter: 'blur(8px)',
        border: `1px solid ${tint}44`,
        boxShadow: `0 0 14px ${tint}22`,
      }}
    >
      <span
        aria-hidden
        style={{
          fontSize: size,
          display: 'inline-block',
          animation: `${action.anim} 1.1s ease-in-out infinite`,
          transformOrigin: 'center center',
          // 部分 emoji 在 macOS 上自带描边, 强制透明 text-shadow 防系统底色透出.
          textShadow: `0 0 6px ${tint}55`,
        }}
      >{action.emoji}</span>
      {showCaption && (
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
          color: tint, opacity: 0.85,
        }}>{action.caption}…</span>
      )}
      {/* Module-scoped keyframes — one <style> per mount, browser de-dupes
          identical CSS at runtime so the cost is negligible. */}
      <style>{`
        @keyframes idleSpin {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes idleShrink {
          0%, 100% { transform: scale(1);    opacity: 0.85; }
          50%      { transform: scale(0.85); opacity: 0.5;  }
        }
        @keyframes idleHShake {
          0%, 100% { transform: translateX(0); }
          25%      { transform: translateX(-2px) rotate(-4deg); }
          75%      { transform: translateX(2px)  rotate(4deg);  }
        }
        @keyframes idlePulse {
          0%, 100% { transform: scale(0.95); opacity: 0.8; }
          50%      { transform: scale(1.15); opacity: 1;   }
        }
        @keyframes idleSmirk {
          0%, 100% { transform: rotate(-6deg); }
          50%      { transform: rotate(6deg);  }
        }
        @keyframes idleRage {
          0%, 100% { transform: translate(0, 0); }
          20%      { transform: translate(-1.5px, -1px); }
          40%      { transform: translate(1.5px, 1px); }
          60%      { transform: translate(-1.5px, 1px); }
          80%      { transform: translate(1.5px, -1px); }
        }
        @keyframes idleBob {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-3px); }
        }
        @keyframes idleBounce {
          0%, 100% { transform: translateY(0)    scale(1);    }
          30%      { transform: translateY(-5px) scale(1.08); }
          60%      { transform: translateY(0)    scale(1);    }
        }
      `}</style>
    </div>
  );
}
