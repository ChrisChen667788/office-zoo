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
  /** v6.69 — 显式弹幕文案(LLM 实时生成的那句)。给了就飘这一条,不走静态池。 */
  text?: string;
  emoji?: string;
  /** v6.69 — 弹幕出发点(被裁工位,0..1 归一化)。给了就从这点冒出来 + 上飘。 */
  origin?: { x: number; y: number };
  /** v6.72 — 同一次裁员的弹幕分到一组(默认 = id)。 */
  groupId?: number;
  /** v6.72 — true 时先清掉本组旧弹幕再放新的(LLM 到了替换静态,不叠加)。 */
  replace?: boolean;
}

interface Bullet {
  key: number;
  emoji: string;
  text: string;
  lane: number; // 垂直车道(无 origin 时用)
  delay: number; // 错时延,做出"一串飘过"的感觉
  origin?: { x: number; y: number }; // 有就从这点上飘,没有就横向飘过
  groupId: number; // v6.72 — 同次裁员一组,replace 时按组清
}

const LANES = 6;
const PER_TRIGGER = 2; // 每次事件丢 2 条,更热闹
const LIFETIME_MS = 7200;

const PILL: React.CSSProperties = {
  position: 'absolute',
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
};

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
    const gid = trigger.groupId ?? trigger.id;
    let made: Bullet[];
    if (trigger.text) {
      // v6.69 — LLM 实时那句:就飘这一条
      made = [{
        key: trigger.id * 10, emoji: trigger.emoji || '🗣️', text: trigger.text,
        lane: (trigger.id * 2) % LANES, delay: 0, origin: trigger.origin, groupId: gid,
      }];
    } else {
      made = Array.from({ length: PER_TRIGGER }, (_, n) => {
        const r = pickReaction(trigger.kind, trigger.id * 7 + n * 13);
        return {
          key: trigger.id * 10 + n, emoji: r.emoji, text: r.text,
          lane: (trigger.id * 2 + n) % LANES, delay: n * 0.55, origin: trigger.origin, groupId: gid,
        };
      });
    }
    // v6.72 — replace:先清掉本组旧弹幕(LLM 到了替换静态),否则直接追加
    setBullets((prev) => [...(trigger.replace ? prev.filter((b) => b.groupId !== gid) : prev), ...made]);
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
        {bullets.map((b) =>
          b.origin ? (
            // v6.69 — 从被裁工位冒出来 + 上飘 + 淡出(有指向性)
            <motion.div
              key={b.key}
              initial={{ opacity: 0, scale: 0.7, x: '-50%', y: '-50%' }}
              animate={{ opacity: [0, 1, 1, 0], scale: 1, y: '-220%' }}
              exit={{ opacity: 0, transition: { duration: 0.3 } }}
              transition={{ duration: 4.2, delay: b.delay, ease: 'easeOut', times: [0, 0.14, 0.7, 1] }}
              style={{
                ...PILL,
                left: `${Math.max(2, Math.min(98, b.origin.x * 100))}%`,
                top: `${Math.max(6, Math.min(94, b.origin.y * 100))}%`,
              }}
            >
              {b.emoji} {b.text}
            </motion.div>
          ) : (
            // 横向飘过(无坐标时的兜底:Immersive / 拿不到工位)
            <motion.div
              key={b.key}
              initial={{ left: '100%', opacity: 0 }}
              animate={{ left: '-105%', opacity: [0, 1, 1, 1, 0] }}
              exit={{ opacity: 0, transition: { duration: 0.3 } }}
              transition={{ duration: 6.4, delay: b.delay, ease: 'linear', times: [0, 0.05, 0.5, 0.9, 1] }}
              style={{ ...PILL, top: `${7 + b.lane * 13}%` }}
            >
              {b.emoji} {b.text}
            </motion.div>
          ),
        )}
      </AnimatePresence>
    </div>
  );
}
