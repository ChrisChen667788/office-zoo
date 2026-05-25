/**
 * GhostChatPanel — v6.22 "前同事吐槽群" UI.
 *
 * Right-bottom corner floating panel that re-frames the existing ghost
 * comments (currently shown as drifting danmaku at the top) into a
 * persistent group-chat surface. Replaces nothing — the danmaku still
 * flies — but adds a "scroll-back the snark" surface so users can read
 * what they missed and feel the community of fired rats.
 *
 * Why a chat panel (not just enriching danmaku):
 *   - Danmaku is fire-and-forget; a snarky line goes by once at 6s and
 *     you can't read the rat who said it.
 *   - WeChat/Discord-style group chat is intuitive — every Chinese user
 *     knows it, and it sells the "ex-coworker group" narrative.
 *   - Persistent panel lets us layer secondary signals (welcome
 *     reactions, ghost-vote tally) without cluttering the map.
 *
 * Collapsed by default with a "👻 N" pill so it doesn't fight the
 * GameMap for attention. Tap → expands to 280×360 panel with avatars,
 * names, bubbles, timestamps. Auto-scroll to bottom on new arrivals
 * (unless user scrolled up to read history — then we stop hijacking).
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { GhostCommentItem } from '../../stores/gameStore';

interface GhostChatPanelProps {
  comments: GhostCommentItem[];
  avatarUrls?: Record<string, string>;
  /** v6.23 P3 — alive players for the "战术 @" psy-war dialog. The
   *  user (real human watching) picks one and a preset taunt; the most
   *  recent ghost "delivers" it as a highlighted bubble. AI players
   *  do NOT read these messages — it's purely a UI ritual for drama. */
  alivePlayers?: Array<{ id: string; name: string }>;
}

/* ── Psy-war taunt pool ──────────────────────────────────────────────
 *
 * v6.23 P3. User picks {target} + one of these templates; the most
 * recent ghost speaks it. Mix of 落井下石 / 暗示 / 八卦 / 黑色幽默
 * — match the "已离职但还在群里搅" 班味 调调. `{target}` token gets
 * replaced with the picked alive player's display name.
 */
const PSYWAR_PRESETS = [
  '小心 @{target}, 表面光鲜内心 OKR 焦虑',
  '@{target} 偷过我工位的零食 (匿名爆料)',
  '我离职前看 @{target} 跟 HR 嘀咕半小时',
  '@{target} 那个 PRD 是抄我离职前的 draft',
  '@{target} 上次跟我说过, 老板看他不顺眼了',
  '@{target}, 你下一个 🪦 我们群里等你',
  '@{target} 出去抽根烟? 我们一起骂老板',
  '@{target} 别装了, 老板早把你工位标 P0 了',
];

/* ── Welcome-reaction pool ──────────────────────────────────────────────
 *
 * When a brand-new rat appears in the ghost group, the previously-most-
 * recent ghost greets them. Client-side, deterministic on (newGhostId,
 * prevGhostId) so the reaction doesn't shimmer on re-render. Keeps the
 * panel feeling alive without any extra server LLM calls.
 */
const WELCOME_REACTIONS = [
  '欢迎进群 🤝',
  '终于不孤单了',
  '你也来啦, 一起骂',
  '兄弟挺住, 大家都一样',
  '群里啥都能说, 反正没工牌了',
  '哎妈, 这就第 N 个了',
  '快, 自我介绍一下被裁原因',
  '上一个被裁的就是我, 沙发让你',
  '老板的脸还红着呢, 真过瘾',
  '记得拉离职红包群',
];

function djb2(s: string): number {
  let h = 5381 >>> 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) + h) ^ s.charCodeAt(i); h >>>= 0; }
  return h;
}

/** Per-ghost team accent for chat-bubble border. Matches GameMap team palette. */
function teamColor(team?: string): string {
  if (team === 'cat') return '#2fb8ff';
  if (team === 'dog') return '#ff4757';
  return '#fdd835';
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

/* ── Component ───────────────────────────────────────────────────────── */

export default function GhostChatPanel({ comments, avatarUrls = {}, alivePlayers = [] }: GhostChatPanelProps) {
  const [open, setOpen] = useState(false);
  const [seenCount, setSeenCount] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Psy-war local state ──────────────────────────────────────────────
  //
  // psywarSent — synthesized messages the user has fired via the
  // "战术 @" button. Lives in component state (not the store) so it
  // resets on game change but persists during a single match. Each
  // entry is delivered by the most-recent ghost as its "voice".
  const [psywarSent, setPsywarSent] = useState<GhostCommentItem[]>([]);
  const [psywarOpen, setPsywarOpen] = useState(false);
  const [psywarTarget, setPsywarTarget] = useState<string>('');
  const [psywarLineIdx, setPsywarLineIdx] = useState<number>(0);
  // v6.25 P6 — optional free-form override text. When non-empty + valid
  // (≤ 60 chars), wins over the preset selection. Empty falls back to
  // preset. Gives user complete agency without losing the canned-pool
  // convenience for quick taunts.
  const [psywarCustom, setPsywarCustom] = useState<string>('');
  const PSYWAR_CUSTOM_MAX = 60;

  // ── Synthesize welcome reactions ─────────────────────────────────────
  //
  // Detect first appearance of each ghost (unique playerId). When a NEW
  // ghost is seen and there's a previous one, splice a reaction message
  // from the previous ghost in front of them. Reactions are virtual —
  // they don't go into the store, only into the rendered list — so the
  // server stays the source of truth for actual ghost lines.
  const enrichedBase = augmentWithReactions(comments);
  // Merge psywar messages in chronological order
  const enriched = [...enrichedBase, ...psywarSent].sort((a, b) => a.timestamp - b.timestamp);

  // Latest ghost = speaker for the next psywar message. Falls back to
  // null when no ghosts exist yet (button disabled in that case).
  const latestGhost = comments.length > 0 ? comments[comments.length - 1] : null;
  const canPsywar = latestGhost !== null && alivePlayers.length > 0;

  // ── Auto-scroll ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !autoScroll) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [enriched.length, open, autoScroll]);

  // Mark as seen when opened or when new comments arrive while open
  useEffect(() => {
    if (open) setSeenCount(enriched.length);
  }, [open, enriched.length]);

  const unread = Math.max(0, enriched.length - seenCount);

  return (
    <div style={{
      position: 'absolute',
      right: 16,
      bottom: 16,
      zIndex: 30,
      pointerEvents: 'auto',
    }}>
      {/* ── Collapsed pill: floating 👻 N badge ────────────────────── */}
      <AnimatePresence initial={false} mode="wait">
        {!open && (
          <motion.button
            key="pill"
            type="button"
            initial={{ opacity: 0, scale: 0.85, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setOpen(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '8px 14px', borderRadius: 999,
              background: 'rgba(15,14,46,0.82)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,215,0,0.45)',
              color: '#FFD58A', fontWeight: 800, fontSize: 13,
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: unread > 0
                ? '0 0 20px rgba(255,215,0,0.35), 0 4px 12px rgba(0,0,0,0.4)'
                : '0 4px 12px rgba(0,0,0,0.3)',
            }}
            aria-label={`open ghost chat (${unread} unread)`}
          >
            <span style={{ fontSize: 16 }}>👻</span>
            <span>前同事吐槽群</span>
            {unread > 0 && (
              <span style={{
                background: '#FFD700', color: '#0a0a1e',
                padding: '1px 7px', borderRadius: 999,
                fontSize: 11, fontWeight: 900,
              }}>{unread > 99 ? '99+' : unread}</span>
            )}
          </motion.button>
        )}

        {/* ── Expanded chat panel ───────────────────────────────────── */}
        {open && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            style={{
              width: 'min(320px, 90vw)',
              height: 'min(380px, 60vh)',
              background: 'rgba(6,6,18,0.92)',
              backdropFilter: 'blur(20px) saturate(140%)',
              borderRadius: 16,
              border: '1px solid rgba(255,215,0,0.38)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.55), 0 0 30px rgba(255,79,163,0.15)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '10px 14px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ fontSize: 18 }}>👻</span>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#FFD58A', letterSpacing: '0.02em' }}>
                    前同事吐槽群
                  </span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                    {enriched.length} 条 · {countDistinctGhosts(comments)} 位前员工
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="close"
                style={{
                  width: 24, height: 24, borderRadius: 6,
                  background: 'rgba(255,255,255,0.06)',
                  color: 'rgba(255,255,255,0.7)',
                  border: 'none', cursor: 'pointer',
                  fontSize: 14, fontWeight: 700,
                  fontFamily: 'inherit',
                }}
              >×</button>
            </div>

            {/* Scrollable message list */}
            <div
              ref={scrollRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
                setAutoScroll(atBottom);
              }}
              style={{
                flex: 1, overflowY: 'auto',
                padding: '12px 12px 8px',
                display: 'flex', flexDirection: 'column', gap: 10,
              }}
            >
              {enriched.length === 0 && (
                <div style={{
                  margin: 'auto', textAlign: 'center', padding: 20,
                  color: 'rgba(255,255,255,0.4)', fontSize: 12,
                }}>
                  群里还没人被裁<br />
                  第一个进来的就是群主了 🪦
                </div>
              )}
              {enriched.map((c) => (
                <ChatBubble key={c.id} c={c} avatarUrl={avatarUrls[c.role || '']} />
              ))}
            </div>

            {/* v6.23 P3 — psy-war "@" dialog. Inline above footer so the
                user picks a target + a preset taunt without leaving the
                panel. The most recent ghost "speaks" it. Closed by
                default so the panel stays a reader most of the time. */}
            {psywarOpen && canPsywar && (
              <div style={{
                padding: '8px 12px',
                borderTop: '1px solid rgba(176,134,255,0.35)',
                background: 'rgba(176,134,255,0.08)',
                display: 'flex', flexDirection: 'column', gap: 6,
                fontSize: 11,
              }}>
                <div style={{ color: '#B086FF', fontWeight: 800, letterSpacing: '0.06em' }}>
                  让 {latestGhost!.playerName} 鬼声 · 心理战 @
                </div>
                <select
                  value={psywarTarget}
                  onChange={(e) => setPsywarTarget(e.target.value)}
                  style={{
                    padding: '4px 8px', borderRadius: 6,
                    background: 'rgba(15,14,46,0.85)',
                    color: '#f4f4ff', fontSize: 11,
                    border: '1px solid rgba(176,134,255,0.4)',
                  }}
                >
                  <option value="">@ 选个活人…</option>
                  {alivePlayers.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <select
                  value={psywarLineIdx}
                  onChange={(e) => setPsywarLineIdx(Number(e.target.value))}
                  disabled={psywarCustom.trim().length > 0}
                  style={{
                    padding: '4px 8px', borderRadius: 6,
                    background: 'rgba(15,14,46,0.85)',
                    color: '#f4f4ff', fontSize: 11,
                    border: '1px solid rgba(176,134,255,0.4)',
                    opacity: psywarCustom.trim().length > 0 ? 0.4 : 1,
                  }}
                >
                  {PSYWAR_PRESETS.map((p, i) => (
                    <option key={i} value={i}>{p.replace('{target}', '___')}</option>
                  ))}
                </select>
                {/* v6.25 P6 — free-form override. When non-empty wins
                    over preset. `{target}` token expanded same way as
                    presets. Char limit visible, prevents abuse. */}
                <textarea
                  value={psywarCustom}
                  onChange={(e) => setPsywarCustom(e.target.value.slice(0, PSYWAR_CUSTOM_MAX))}
                  placeholder={`或自定义 (≤ ${PSYWAR_CUSTOM_MAX} 字, 用 {target} 插入名字)`}
                  rows={2}
                  style={{
                    padding: '5px 8px', borderRadius: 6,
                    background: 'rgba(15,14,46,0.85)',
                    color: '#f4f4ff', fontSize: 11,
                    border: `1px solid ${psywarCustom.trim().length > 0 ? 'rgba(176,134,255,0.85)' : 'rgba(176,134,255,0.3)'}`,
                    resize: 'none', fontFamily: 'inherit', lineHeight: 1.35,
                    outline: 'none',
                  }}
                />
                <div style={{
                  fontSize: 9, color: 'rgba(255,255,255,0.4)',
                  textAlign: 'right', marginTop: -2,
                }}>
                  {psywarCustom.length}/{PSYWAR_CUSTOM_MAX}
                  {psywarCustom.trim().length > 0 && (
                    <span style={{ color: '#B086FF', marginLeft: 6 }}>· 自定义优先</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                  <button
                    type="button"
                    onClick={() => {
                      const target = alivePlayers.find((p) => p.id === psywarTarget);
                      if (!target || !latestGhost) return;
                      // v6.25 P6 — custom override wins. Auto-prefix
                      // with @target if the user forgot to mention them,
                      // matching the preset convention.
                      const raw = psywarCustom.trim();
                      let text: string;
                      if (raw.length > 0) {
                        text = raw.includes('{target}')
                          ? raw.replace(/\{target\}/g, target.name)
                          : raw.includes(`@${target.name}`) || raw.startsWith('@')
                            ? raw
                            : `@${target.name} ${raw}`;
                      } else {
                        text = PSYWAR_PRESETS[psywarLineIdx].replace('{target}', target.name);
                      }
                      setPsywarSent((prev) => [...prev, {
                        id: `psywar:${latestGhost.playerId}:${target.id}:${Date.now()}`,
                        playerId: latestGhost.playerId,
                        playerName: latestGhost.playerName,
                        text,
                        role: latestGhost.role,
                        team: latestGhost.team,
                        timestamp: Date.now(),
                      }]);
                      setPsywarOpen(false);
                      setPsywarTarget('');
                      setPsywarCustom('');
                    }}
                    disabled={!psywarTarget}
                    style={{
                      flex: 1, padding: '5px 10px', borderRadius: 6,
                      background: psywarTarget ? 'linear-gradient(135deg, #B086FF 0%, #7c3aed 100%)' : 'rgba(176,134,255,0.2)',
                      color: psywarTarget ? '#fff' : 'rgba(255,255,255,0.4)',
                      border: 'none', fontWeight: 800, fontSize: 11,
                      cursor: psywarTarget ? 'pointer' : 'not-allowed',
                      fontFamily: 'inherit',
                    }}
                  >
                    👻 让他说
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPsywarOpen(false); setPsywarTarget(''); setPsywarCustom(''); }}
                    style={{
                      padding: '5px 10px', borderRadius: 6,
                      background: 'rgba(255,255,255,0.06)',
                      color: 'rgba(255,255,255,0.6)',
                      border: 'none', fontSize: 11, fontFamily: 'inherit',
                      cursor: 'pointer',
                    }}
                  >取消</button>
                </div>
              </div>
            )}

            {/* Footer — hint + 战术 @ button (v6.23 P3) */}
            <div style={{
              padding: '6px 12px 10px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 8,
            }}>
              <button
                type="button"
                onClick={() => setPsywarOpen((v) => !v)}
                disabled={!canPsywar}
                title={canPsywar ? '让最近的鬼魂 @ 一个活人' : '需要至少 1 个鬼魂'}
                style={{
                  padding: '3px 8px', borderRadius: 6,
                  background: psywarOpen ? 'rgba(176,134,255,0.3)' : 'rgba(176,134,255,0.12)',
                  border: '1px solid rgba(176,134,255,0.45)',
                  color: '#B086FF',
                  fontSize: 10, fontWeight: 800,
                  fontFamily: 'inherit',
                  cursor: canPsywar ? 'pointer' : 'not-allowed',
                  opacity: canPsywar ? 1 : 0.4,
                }}
              >
                {psywarOpen ? '收起' : '战术 @'}
              </button>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
                AI 鼠人吐槽 · 不输入, 只围观
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Chat bubble ─────────────────────────────────────────────────────── */

function ChatBubble({ c, avatarUrl }: { c: GhostCommentItem; avatarUrl?: string }) {
  const accent = teamColor(c.team);
  // Welcome reactions are tagged via a special prefix on the id so we can
  // style them differently (smaller, italic, no avatar). Distinguished by
  // an id starting with "welcome:" — see augmentWithReactions below.
  const isWelcome = c.id.startsWith('welcome:');
  // v6.23 P3 — psy-war messages user-triggered via 战术 @, "spoken" by
  // the most recent ghost. Distinguished by id "psywar:..." prefix —
  // render with violet rim + 💢 tag so they don't get mistaken for
  // server-generated lines.
  const isPsywar = c.id.startsWith('psywar:');

  if (isWelcome) {
    return (
      <div style={{
        alignSelf: 'center',
        padding: '3px 10px',
        background: 'rgba(255,215,0,0.10)',
        border: '1px solid rgba(255,215,0,0.22)',
        borderRadius: 10,
        fontSize: 10.5,
        color: 'rgba(255,215,0,0.75)',
        fontStyle: 'italic',
        maxWidth: '85%', textAlign: 'center',
      }}>
        <span style={{ opacity: 0.7, marginRight: 4 }}>{c.playerName}:</span>
        {c.text}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <div style={{
        flexShrink: 0,
        width: 28, height: 28, borderRadius: '50%',
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.05)',
        border: `1.5px solid ${accent}88`,
        display: 'grid', placeItems: 'center',
        fontSize: 14, color: 'rgba(255,255,255,0.6)',
      }}>
        {avatarUrl
          ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : '👻'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: accent }}>{c.playerName}</span>
          <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.3)' }}>{formatTime(c.timestamp)}</span>
        </div>
        <div style={{
          padding: '6px 10px',
          // Psy-war messages get violet rim + filled tint so they pop
          // visually as "this was player-triggered drama, not LLM".
          background: isPsywar ? 'rgba(176,134,255,0.14)' : 'rgba(255,255,255,0.06)',
          border: isPsywar ? '1px dashed rgba(176,134,255,0.7)' : `1px solid ${accent}30`,
          borderRadius: 10,
          fontSize: 12.5, lineHeight: 1.45,
          color: '#f4f4ff',
          wordBreak: 'break-word',
        }}>
          {isPsywar && (
            <span style={{
              display: 'inline-block', marginRight: 6,
              padding: '0 5px', borderRadius: 4,
              background: 'rgba(176,134,255,0.35)',
              fontSize: 9, fontWeight: 900, letterSpacing: '0.06em',
              color: '#FFD58A', verticalAlign: 'middle',
            }}>💢 战术</span>
          )}
          {c.text}
        </div>
      </div>
    </div>
  );
}

/* ── Augmentation: synth welcome reactions ─────────────────────────────
 *
 * Walk through the comments timeline. Track unique ghosts seen so far.
 * When we encounter a brand-new ghost (first comment with their id) and
 * there was a previous distinct ghost, splice a synthetic "welcome"
 * line from that previous ghost in front of the new one.
 *
 * Deterministic — same input always produces same output, so React
 * key collisions are impossible across re-renders.
 */
function augmentWithReactions(comments: GhostCommentItem[]): GhostCommentItem[] {
  const out: GhostCommentItem[] = [];
  const seen = new Set<string>();
  let prevGhost: GhostCommentItem | null = null;
  for (const c of comments) {
    if (!seen.has(c.playerId)) {
      // First time seeing this ghost — synthesize welcome from prev
      if (prevGhost) {
        const idx = djb2(`${c.playerId}|${prevGhost.playerId}`) % WELCOME_REACTIONS.length;
        out.push({
          id: `welcome:${prevGhost.playerId}->${c.playerId}`,
          playerId: prevGhost.playerId,
          playerName: prevGhost.playerName,
          text: WELCOME_REACTIONS[idx],
          role: prevGhost.role,
          team: prevGhost.team,
          timestamp: c.timestamp - 1, // sort just before the new ghost's first line
        });
      }
      seen.add(c.playerId);
    }
    out.push(c);
    prevGhost = c;
  }
  return out;
}

function countDistinctGhosts(comments: GhostCommentItem[]): number {
  const ids = new Set<string>();
  for (const c of comments) ids.add(c.playerId);
  return ids.size;
}
