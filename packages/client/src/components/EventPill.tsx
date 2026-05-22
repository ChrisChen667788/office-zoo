/**
 * EventPill — v6.2 米哈游风 design system 共享组件。
 *
 * 用在每个路由的 header 区域, 凸显"游戏 UI"的活动公告感。
 * 配 5★ 金色 chip + 紫粉金 gradient + pulse dot, 直接拷自 storyboard.html
 * 的相同视觉 token。
 *
 * Usage:
 *   <EventPill>v6.1 · NEW · AI 同事会记住你</EventPill>
 *   <EventPill stars={5}>v6.1 · 段子 UGC 上线</EventPill>
 *   <EventPill subtle>BAR · 4★</EventPill>   // 弱化版, 用在工具栏
 */

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export interface EventPillProps {
  children: ReactNode;
  /** 末尾追加 N 个金色 ★. 0 = 不加。默认 0。 */
  stars?: 0 | 3 | 4 | 5;
  /** subtle = 用于次要位置(如导航 chip), 配色更克制。 */
  subtle?: boolean;
  /** 不脉冲(静态场景). 默认 true 脉冲。 */
  pulse?: boolean;
}

export default function EventPill({
  children, stars = 0, subtle = false, pulse = true,
}: EventPillProps) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full"
      style={{
        padding: subtle ? '4px 12px' : '6px 16px',
        background: subtle
          ? 'rgba(255,215,0,0.10)'
          : 'linear-gradient(90deg, rgba(255,215,0,0.18), rgba(176,134,255,0.18), rgba(255,79,163,0.16))',
        border: `1px solid ${subtle ? 'rgba(255,215,0,0.30)' : 'rgba(255,215,0,0.55)'}`,
        boxShadow: subtle ? 'none' : '0 4px 18px rgba(255,215,0,0.18)',
      }}
    >
      {pulse && (
        <motion.span
          className="rounded-full"
          style={{
            width: 6, height: 6,
            background: '#FFD700',
            boxShadow: '0 0 8px #FFD700',
          }}
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 1.6, repeat: Infinity }}
        />
      )}
      <span
        className="font-black uppercase"
        style={{
          fontSize: subtle ? 10 : 11,
          letterSpacing: '0.22em',
          background: 'linear-gradient(180deg, #fff 0%, #FFD58A 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        {children}
      </span>
      {stars > 0 && (
        <span
          className="font-black px-1.5 py-0.5 rounded"
          style={{
            fontSize: 9,
            letterSpacing: '0.16em',
            background: 'linear-gradient(90deg, #FFD700, #FFA947)',
            color: '#1a0d35',
          }}
        >
          {'★'.repeat(stars)}
        </span>
      )}
    </span>
  );
}
