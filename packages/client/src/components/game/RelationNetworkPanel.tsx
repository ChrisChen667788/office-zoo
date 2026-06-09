/**
 * RelationNetworkPanel — v6.75 — 「AI 记忆关系网」恩怨图谱弹窗。
 *
 * 把 /api/relations 的跨局情绪边画成一张有向图:9 只鼠绕圈排,红线=记仇、绿线=记恩,
 * 越粗越浓(|score|),箭头从「记仇/恩的一方」指向「对象」。点边看详情(谁对谁、几次、上次因为啥)。
 * 节点名/emoji 来自 PERSONALITY_REGISTRY。数据全来自服务端,组件只画。
 */
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { PERSONALITY_REGISTRY, topFeuds, type RelationKind } from '@furball/shared';

/** 自带开关状态的入口按钮(右下角小药丸),丢进对局页就能用。 */
export function RelationNetworkButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} title="鼠人关系网 · 跨局恩怨录"
        style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 71,
          padding: '8px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700,
          color: '#fff', background: 'rgba(13,14,22,0.92)', border: '1px solid rgba(244,114,114,0.3)',
          backdropFilter: 'blur(12px)', boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}>
        🕸️ 恩怨录
      </button>
      {open && <RelationNetworkPanel onClose={() => setOpen(false)} />}
    </>
  );
}

interface Tier { label: string; emoji: string; tone: 'foe' | 'cold' | 'neutral' | 'warm' | 'ally'; }
interface ApiEdge {
  holderId: string; aboutId: string; score: number; count: number;
  lastKind: RelationKind; lastGameId: string; lastTs: number; tier: Tier;
}
interface Props { onClose: () => void; }

const KIND_CN: Record<RelationKind, string> = {
  voted_out: '投票把人开除', backstab: '同阵营反水', framed: '带节奏指认',
  defended: '替人说话', saved: '挡刀救人', allied_win: '同阵营一起赢',
};
const TONE_COLOR: Record<Tier['tone'], string> = {
  foe: '#ef4444', cold: '#f97316', neutral: '#64748b', warm: '#34d399', ally: '#22c55e',
};

function nameOf(id: string): { label: string; emoji: string } {
  const info = (PERSONALITY_REGISTRY as Record<string, { label: string; emoji: string }>)[id];
  return info ? { label: info.label, emoji: info.emoji } : { label: id.slice(0, 6), emoji: '🐭' };
}

export default function RelationNetworkPanel({ onClose }: Props) {
  const [edges, setEdges] = useState<ApiEdge[] | null>(null);
  const [sel, setSel] = useState<ApiEdge | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/relations?minAbs=1')
      .then((r) => r.json())
      .then((d) => { if (alive) setEdges(d.edges ?? []); })
      .catch(() => { if (alive) setEdges([]); });
    return () => { alive = false; };
  }, []);

  // 节点集合 = 所有出现过的鼠;绕圈布局
  const nodes = useMemo(() => {
    const ids = new Set<string>();
    (edges ?? []).forEach((e) => { ids.add(e.holderId); ids.add(e.aboutId); });
    const list = Array.from(ids);
    const R = 150, cx = 200, cy = 200;
    const pos: Record<string, { x: number; y: number }> = {};
    list.forEach((id, i) => {
      const ang = (i / Math.max(1, list.length)) * Math.PI * 2 - Math.PI / 2;
      pos[id] = { x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang) };
    });
    return { list, pos };
  }, [edges]);

  // v6.77 — 本周最毒世仇榜:窗口内 score 最负的几对(纯函数挑,组件只画)。
  const feuds = useMemo(() => topFeuds(edges ?? [], Date.now(), 3), [edges]);

  const SVG = 400;

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 92, background: 'rgba(0,0,0,0.66)', backdropFilter: 'blur(5px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <motion.div onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
        style={{ width: 'min(460px, 96vw)', maxHeight: '88vh', overflowY: 'auto',
          background: 'rgba(14,15,24,0.98)', border: '1px solid rgba(244,114,114,0.28)', borderRadius: 18,
          padding: 18, color: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 800, fontSize: 17 }}>🕸️ 恩怨录 · 鼠人关系网</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', opacity: 0.6 }}>✕</button>
        </div>
        <div style={{ fontSize: 11.5, opacity: 0.55, margin: '4px 0 10px' }}>
          跨局记仇 / 记恩 · 红线结仇 绿线交情 · 箭头指向被记的那只
        </div>

        {edges === null ? (
          <div style={{ textAlign: 'center', padding: 60, opacity: 0.5 }}>载入中…</div>
        ) : edges.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 50, opacity: 0.6, fontSize: 13, lineHeight: 1.8 }}>
            还没结下梁子 🕊️<br />
            <span style={{ fontSize: 11, opacity: 0.7 }}>等鼠人们多打几局,恩怨自然就有了</span>
          </div>
        ) : (
          <>
            {/* v6.77 — 🏆 本周最毒世仇榜:把最浓的几对仇拎到图谱顶上。 */}
            {feuds.length > 0 && (
              <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 12,
                background: 'linear-gradient(135deg, rgba(239,68,68,0.13), rgba(249,115,22,0.07))',
                border: '1px solid rgba(239,68,68,0.26)' }}>
                <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 7 }}>🏆 本周最毒世仇</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {feuds.map((e, i) => {
                    const h = nameOf(e.holderId), a = nameOf(e.aboutId);
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
                    return (
                      <div key={`${e.holderId}->${e.aboutId}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                        <span style={{ width: 18, flexShrink: 0 }}>{medal}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <b>{h.emoji}{h.label}</b>
                          <span style={{ opacity: 0.55 }}> 死记着 </span>
                          <b>{a.emoji}{a.label}</b>
                        </span>
                        <span style={{ color: '#ef4444', fontWeight: 800, flexShrink: 0 }}>{e.score}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <svg viewBox={`0 0 ${SVG} ${SVG}`} style={{ width: '100%', maxWidth: 400, display: 'block', margin: '0 auto' }}>
              <defs>
                <marker id="arrowFoe" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill="#ef4444" />
                </marker>
                <marker id="arrowAlly" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill="#22c55e" />
                </marker>
              </defs>
              {/* 边 */}
              {edges.map((e, i) => {
                const a = nodes.pos[e.holderId], b = nodes.pos[e.aboutId];
                if (!a || !b) return null;
                const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
                // 垂直偏移让 A→B / B→A 不重叠
                const dx = b.x - a.x, dy = b.y - a.y;
                const len = Math.hypot(dx, dy) || 1;
                const off = 22;
                const ctrl = { x: mx - (dy / len) * off, y: my + (dx / len) * off };
                const grudge = e.tier.tone === 'foe' || e.tier.tone === 'cold';
                const color = TONE_COLOR[e.tier.tone];
                const w = 1 + (Math.abs(e.score) / 100) * 4;
                // 末端缩进到节点边缘
                const t = 0.86;
                const ex = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * ctrl.x + t * t * b.x;
                const ey = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * ctrl.y + t * t * b.y;
                return (
                  <path key={i} d={`M${a.x},${a.y} Q${ctrl.x},${ctrl.y} ${ex},${ey}`}
                    fill="none" stroke={color} strokeWidth={w} strokeOpacity={sel === e ? 1 : 0.6}
                    markerEnd={grudge ? 'url(#arrowFoe)' : 'url(#arrowAlly)'}
                    style={{ cursor: 'pointer' }} onClick={() => setSel(e)} />
                );
              })}
              {/* 节点 */}
              {nodes.list.map((id) => {
                const p = nodes.pos[id]; const n = nameOf(id);
                return (
                  <g key={id}>
                    <circle cx={p.x} cy={p.y} r={20} fill="rgba(30,32,46,0.95)" stroke="rgba(255,255,255,0.25)" strokeWidth={1.5} />
                    <text x={p.x} y={p.y + 1} textAnchor="middle" dominantBaseline="middle" fontSize={18}>{n.emoji}</text>
                    <text x={p.x} y={p.y + 33} textAnchor="middle" fontSize={10.5} fill="#cbd5e1" fontWeight={600}>{n.label}</text>
                  </g>
                );
              })}
            </svg>

            {/* 选中边详情 / 提示 */}
            <div style={{ minHeight: 46, marginTop: 6, padding: '8px 12px', borderRadius: 10,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 12.5 }}>
              {sel ? (
                <span>
                  <b>{nameOf(sel.holderId).emoji}{nameOf(sel.holderId).label}</b>
                  {' '}对{' '}
                  <b>{nameOf(sel.aboutId).emoji}{nameOf(sel.aboutId).label}</b>:{' '}
                  <span style={{ color: TONE_COLOR[sel.tier.tone], fontWeight: 800 }}>{sel.tier.emoji}{sel.tier.label}</span>
                  <span style={{ opacity: 0.6 }}> · {sel.count} 次 · 上次「{KIND_CN[sel.lastKind]}」</span>
                </span>
              ) : (
                <span style={{ opacity: 0.5 }}>👆 点一条线,看这俩鼠之间的恩怨</span>
              )}
            </div>

            {/* 图例 */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10, fontSize: 11, opacity: 0.75 }}>
              <span>💢 世仇</span><span>😒 记仇</span><span>🙂 有交情</span><span>🤝 过命交情</span>
              <span style={{ opacity: 0.55 }}>· 线越粗,恩怨越深</span>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
