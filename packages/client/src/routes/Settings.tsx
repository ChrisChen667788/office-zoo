/**
 * Settings — v5.8.2 minimum-viable settings surface.
 *
 * Currently only one section: AI memory controls. Will accumulate
 * other preferences (locale, sfx, etc.) as they come along.
 *
 * Why a separate page (vs settings drawer):
 *  - Forget AI memory needs an explicit confirmation step + a count
 *    of what's about to be deleted. That's too much UX for a drawer.
 *  - URL is shareable for support / docs ("go to /settings, click the
 *    forget button").
 *
 * The forget UI honours the chunky-style model (RFC §5.4):
 *   - GLOBAL forget for THIS user — drops everything in memory_entries
 *     where target_user_id = me. Other users' AI agents unaffected.
 *   - Per-archetype: drop one personality at a time.
 *
 * Server endpoints:
 *   GET  /api/memory/stats  → total + by-archetype counts (NOTE: this
 *                              is global stats in v5.8.1; v5.8.2 should
 *                              add ?userId= filter for accuracy here.
 *                              Until then the UI shows what the AI
 *                              MAY know about you, possibly overstating.)
 *   POST /api/memory/forget → {targetUserId, archetype?} delete scoped
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUserId } from '../utils/userId';
import EventPill from '../components/EventPill';

interface MemoryStats {
  total: number;
  byArchetype: Array<{ archetype: string; count: number }>;
}

interface BeliefBundle {
  userId: string;
  archetypes: Array<{
    archetype: string;
    beliefs: Array<{
      content: string;
      ts: string;
      importance: number;
      sourceGameId: string | null;
    }>;
  }>;
}

// Personality archetype labels — mirror the enum in shared but kept local
// because importing the entire personality module pulls in unused trait
// metadata. 8 entries, low maintenance burden.
const PERSONALITY_LABEL: Record<string, string> = {
  social_butterfly:    '社牛 🦋',
  introvert:           '社恐 🐢',
  contrarian:          '杠精 🗡️',
  sycophant:           '舔狗 🐶',
  passive_aggressive:  '阴阳人 🐍',
  hot_tempered:        '暴躁老哥 🔥',
  smooth_operator:     '老狐狸 🦊',
  workaholic:          '卷王 🥇',
};

function archetypeLabel(id: string): string {
  return PERSONALITY_LABEL[id] ?? id;
}

export default function Settings() {
  const navigate = useNavigate();
  const myId = useMemo(() => getUserId(), []);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [beliefs, setBeliefs] = useState<BeliefBundle | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  const refetch = () => {
    fetch('/api/memory/stats')
      .then((r) => r.json() as Promise<MemoryStats>)
      .then(setStats)
      .catch(() => setStats({ total: 0, byArchetype: [] }));
    fetch(`/api/memory/beliefs?userId=${encodeURIComponent(myId)}`)
      .then((r) => r.json() as Promise<BeliefBundle>)
      .then(setBeliefs)
      .catch(() => setBeliefs({ userId: myId, archetypes: [] }));
  };
  useEffect(() => { refetch(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const forget = async (archetype: string | null) => {
    setBusy(archetype ?? 'all');
    setMsg(null);
    try {
      const body: Record<string, string> = { targetUserId: myId };
      if (archetype) body.archetype = archetype;
      const resp = await fetch('/api/memory/forget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await resp.json() as { deleted?: number };
      const n = json.deleted ?? 0;
      setMsg(`✓ 已清空 ${n} 条记忆${archetype ? ` (${archetypeLabel(archetype)})` : ''}`);
      refetch();
    } catch {
      setMsg('清空失败, 请重试');
    } finally {
      setBusy(null);
      setConfirmKey(null);
    }
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden"
      style={{ background: 'radial-gradient(circle at 30% 20%, #1a0d35 0%, #050510 70%)' }}>
      <header className="px-6 md:px-10 py-5 flex items-center justify-between">
        <button onClick={() => navigate('/')}
          className="text-xs text-white/55 hover:text-white/90 transition px-3 py-1.5 rounded"
          style={{ background: 'rgba(255,255,255,0.05)' }}>
          ← 首页
        </button>
        <EventPill stars={4} subtle>⚙️ 设置 · v6.2</EventPill>
        <span className="w-12" />
      </header>

      <main className="max-w-md mx-auto px-4 md:px-6 pb-16">
        <section className="mt-4">
          <h2 className="text-base font-black text-white/95 mb-1">🧠 AI 同事记忆</h2>
          <p className="text-[11px] text-white/55 leading-relaxed mb-4">
            "经典模式" 里那些 AI 同事会跨局记得你 — 你救过谁、谁阴阳过你、上局是谁
            把你投出局的。下面你可以清空他们对你的记忆,或针对单个人格类型清。
          </p>

          {/* Global summary */}
          <div className="rounded-2xl p-4 mb-4"
            style={{
              background: 'rgba(176,134,255,0.08)',
              border: '1px solid rgba(176,134,255,0.32)',
            }}>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[10px] tracking-[0.22em] uppercase" style={{ color: '#b086ff' }}>
                ✦ 总记忆条数
              </span>
              <span className="text-[10px] text-white/45 tabular-nums">
                来自 {stats?.byArchetype.length ?? 0} 种人格
              </span>
            </div>
            <div className="text-3xl font-black text-white tabular-nums"
              style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
              {stats ? stats.total : '…'}
            </div>
            <div className="text-[10px] text-white/40 mt-1">
              注: v5.8.1 stats 显示全库总数, 不只是关于你的部分; v5.8.2 后将精确
              到 per-user 视图
            </div>
          </div>

          {/* v6.0.0 — belief panel. Shows the high-level judgments each
              AI archetype has formed about you. Empty until reflection
              fires (round 5 of any classic game with your userId). */}
          {beliefs && beliefs.archetypes.length > 0 && (
            <div className="mb-5">
              <div className="text-[10px] tracking-[0.22em] uppercase mb-2"
                style={{ color: '#9be6ff' }}>
                💭 他们对你的判断
              </div>
              <div className="space-y-2.5">
                {beliefs.archetypes.map((g) => (
                  <div key={g.archetype}
                    className="rounded-xl p-3"
                    style={{
                      background: 'linear-gradient(135deg, rgba(155,230,255,0.08), rgba(255,255,255,0.03))',
                      border: '1px solid rgba(155,230,255,0.25)',
                    }}>
                    <div className="text-xs font-bold text-white/95 mb-2">
                      {archetypeLabel(g.archetype)}
                    </div>
                    <ul className="space-y-1">
                      {g.beliefs.map((b, i) => (
                        <li key={i} className="text-[12px] text-white/85 leading-relaxed">
                          <span className="text-white/40 mr-1.5">·</span>
                          {b.content}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-white/40 mt-2 leading-relaxed">
                这些是 AI 在跨局反思后形成的高层判断 (每 5 轮一次)。
                影响他们下一局怎么对你 — 你救过他他记得, 你坑过他他更记得。
              </p>
            </div>
          )}
          {beliefs && beliefs.archetypes.length === 0 && stats && stats.total > 0 && (
            <div className="mb-5 text-center text-[11px] text-white/45 py-4 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.15)' }}>
              💭 反思尚未触发 — 需要在一场经典模式玩到第 5 轮才会形成 belief
            </div>
          )}

          {/* Per-archetype list */}
          {stats && stats.byArchetype.length > 0 && (
            <div className="space-y-2 mb-4">
              {stats.byArchetype.map((row) => {
                const label = archetypeLabel(row.archetype);
                const isConfirm = confirmKey === row.archetype;
                const isBusy = busy === row.archetype;
                return (
                  <div key={row.archetype}
                    className="flex items-center gap-3 rounded-xl p-3"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.10)',
                    }}>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-white/90 truncate">{label}</div>
                      <div className="text-[10px] text-white/45 tabular-nums">{row.count} 条记忆</div>
                    </div>
                    {isConfirm ? (
                      <div className="flex gap-1.5">
                        <button onClick={() => forget(row.archetype)} disabled={isBusy}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white disabled:opacity-50"
                          style={{ background: '#ef4444' }}>
                          {isBusy ? '清空中…' : '确认清空'}
                        </button>
                        <button onClick={() => setConfirmKey(null)} disabled={isBusy}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] text-white/70 hover:text-white"
                          style={{ background: 'rgba(255,255,255,0.06)' }}>
                          取消
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmKey(row.archetype)}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-rose-300/85 hover:text-rose-200"
                        style={{
                          background: 'rgba(239,68,68,0.08)',
                          border: '1px solid rgba(239,68,68,0.25)',
                        }}>
                        清空
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Nuclear option */}
          <div className="rounded-2xl p-4 mt-6"
            style={{
              background: 'rgba(239,68,68,0.05)',
              border: '1px solid rgba(239,68,68,0.20)',
            }}>
            <div className="text-[10px] tracking-[0.22em] uppercase mb-2 text-rose-300/85">
              ☢ 核选项
            </div>
            <p className="text-xs text-white/70 mb-3 leading-relaxed">
              清空 <span className="font-bold text-white/95">所有人格</span> 对你的记忆。
              下次进游戏, 所有 AI 同事都会重新认识你, 从零开始。
            </p>
            {confirmKey === '__ALL__' ? (
              <div className="flex gap-2">
                <button onClick={() => forget(null)} disabled={busy === 'all'}
                  className="flex-1 py-2.5 rounded-xl text-xs font-black text-white disabled:opacity-50"
                  style={{ background: '#ef4444' }}>
                  {busy === 'all' ? '清空中…' : '确认: 抹掉所有 AI 对我的记忆'}
                </button>
                <button onClick={() => setConfirmKey(null)} disabled={busy === 'all'}
                  className="px-4 rounded-xl text-xs text-white/70"
                  style={{ background: 'rgba(255,255,255,0.06)' }}>
                  取消
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmKey('__ALL__')}
                className="w-full py-2.5 rounded-xl text-xs font-bold text-rose-300/95"
                style={{
                  background: 'rgba(239,68,68,0.10)',
                  border: '1px solid rgba(239,68,68,0.40)',
                }}>
                🧹 清空全部 AI 同事的记忆
              </button>
            )}
          </div>

          {msg && (
            <div className="text-center text-[11px] text-white/65 mt-4">{msg}</div>
          )}
        </section>
      </main>
    </div>
  );
}
