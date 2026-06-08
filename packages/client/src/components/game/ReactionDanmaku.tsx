/**
 * ReactionDanmaku — v6.68 — 吃瓜群众表情包弹幕,飘过游戏区域。
 *
 * 每当有鼠被优化 / 被投票出局,经典局 & 沉浸局都往这层丢一个 `{id, kind}` 触发;
 * 组件按 id 当种子从 `pickReaction` 取 2 条吐槽,做成右→左飘过的弹幕(分车道、错时延),
 * 几秒后自动清掉。纯展示层,`pointer-events-none` 不挡操作;文案池在 shared/data/reactions。
 *
 * 摆放:
 *   - 经典局:放进 `.game-stage`(已是 relative),`absolute inset-0` 只盖地图。
 *   - 沉浸局:`fixed`(全屏沉浸)。
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { pickReaction, type ReactionKind } from '@furball/shared';

export interface DanmakuTrigger {
  id: number; // 单调递增;同时当取词种子,保证同一事件不抖动
  kind: ReactionKind;
}

interface Bullet {
  key: number;
  emoji: string;
  text: string;
  lane: number; // 垂直车道
  delay: number; // 错时延,做出"一串飘过"的感觉
}

const LANES = 6;
const PER_TRIGGER = 2; // 每次事件丢 2 条,更热闹
const LIFETIME_MS = 7200;

export default function ReactionDanmaku({
  trigger,
  fixed = false,
}: {
  trigger: DanmakuTrigger | null;
  fixed?: boolean;
}) {
  const [bullets, setBullets] = useState<Bullet[]>([]);

  useEffect(() => {
    if (!trigger) return;
    const made: Bullet[] = Array.from({ length: PER_TRIGGER }, (_, n) => {
      const r = pickReaction(trigger.kind, trigger.id * 7 + n * 13);
      return {
        key: trigger.id * 10 + n,
        emoji: r.emoji,
        text: r.text,
        lane: (trigger.id * 2 + n) % LANES,
        delay: n * 0.55,
      };
    });
    setBullets((prev) => [...prev, ...made]);
    const t = setTimeout(() => {
      setBullets((prev) => prev.filter((b) => !made.some((m) => m.key === b.key)));
    }, LIFETIME_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger?.id]);

  return (
    <div
      className="pointer-events-none overflow-hidden"
      style={{ position: fixed ? 'fixed' : 'absolute', inset: 0, zIndex: 45 }}
    >
      <AnimatePresence>
        {bullets.map((b) => (
          <motion.div
            key={b.key}
            initial={{ left: '100%', opacity: 0 }}
            animate={{ left: '-105%', opacity: [0, 1, 1, 1, 0] }}
            transition={{ duration: 6.4, delay: b.delay, ease: 'linear', times: [0, 0.05, 0.5, 0.9, 1] }}
            style={{
              position: 'absolute',
              top: `${7 + b.lane * 13}%`,
              whiteSpace: 'nowrap',
              fontSize: 13,
              fontWeight: 700,
              color: '#fce7f3',
              background: 'rgba(244,114,182,0.18)',
              border: '1px solid rgba(244,114,182,0.42)',
              borderRadius: 999,
              padding: '3px 12px',
              backdropFilter: 'blur(4px)',
              textShadow: '0 1px 3px rgba(0,0,0,0.6)',
              boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
            }}
          >
            {b.emoji} {b.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
