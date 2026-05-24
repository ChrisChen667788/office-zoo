/**
 * Maker — v6.11 P2 admin moderation page for Talkshow UGC.
 *
 * Lists pending submissions (oldest first) with approve / reject buttons.
 * Token-gated via X-Maker-Token header. Token stored in localStorage after
 * first manual input so the user doesn't re-paste every page load.
 *
 * Not linked from main nav (deliberately discoverable only via the URL).
 * Production-side: set MAKER_TOKEN env var on the server. Local dev:
 * default token in .env.example.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import EventPill from '../components/EventPill';

const TOKEN_KEY = 'office-zoo.maker.token';

interface PendingEntry {
  id: string;
  userId: string;
  title: string;
  text: string;
  tag: string;
  region?: string;
  modNotes?: string;
  createdAt: number;
}

function loadToken(): string {
  try { return window.localStorage.getItem(TOKEN_KEY) ?? ''; } catch { return ''; }
}
function saveToken(t: string) {
  try { window.localStorage.setItem(TOKEN_KEY, t); } catch { /* private mode */ }
}

export default function Maker() {
  const navigate = useNavigate();
  const [token, setToken] = useState<string>(loadToken());
  const [pending, setPending] = useState<PendingEntry[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);  // id currently being reviewed
  const [rejectReasonFor, setRejectReasonFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  async function fetchPending() {
    if (!token) return;
    setLoadErr(null);
    try {
      const r = await fetch('/api/talkshow/maker/pending', {
        headers: { 'X-Maker-Token': token },
      });
      if (r.status === 401) { setLoadErr('Token 无效, 请重新输入'); return; }
      if (r.status === 503) { setLoadErr('Maker 通道未开启 (服务端 MAKER_TOKEN 未设)'); return; }
      if (!r.ok) { setLoadErr(`加载失败 (${r.status})`); return; }
      const data = await r.json();
      setPending(data.pending ?? []);
    } catch (err) {
      setLoadErr((err as Error).message ?? '网络错误');
    }
  }
  useEffect(() => { fetchPending(); /* eslint-disable-next-line */ }, [token]);

  async function review(id: string, decision: 'approved' | 'rejected', reason?: string) {
    setBusy(id);
    try {
      const r = await fetch(`/api/talkshow/maker/review/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Maker-Token': token },
        body: JSON.stringify({ decision, rejectionReason: reason }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: 'unknown' }));
        alert(`操作失败: ${err.error ?? r.status}`);
        return;
      }
      // Optimistic: drop the entry from the list.
      setPending((cur) => cur.filter((e) => e.id !== id));
      setRejectReasonFor(null);
      setRejectReason('');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="flex flex-col items-center px-4 py-8 min-h-screen"
      style={{
        background:
          'radial-gradient(ellipse at 25% 18%, rgba(176,134,255,0.30) 0%, transparent 45%),' +
          'radial-gradient(ellipse at 78% 82%, rgba(255,215,0,0.18) 0%, transparent 50%),' +
          'radial-gradient(ellipse at 50% 50%, #2D1B69 0%, #1a0d35 60%, #0a0a1e 100%)',
      }}
    >
      <div className="w-full max-w-2xl flex items-center justify-between mb-4">
        <button
          onClick={() => navigate('/')}
          className="text-xs px-3 py-1.5 rounded-full font-bold"
          style={{ background: 'rgba(255,255,255,0.85)', color: '#0a0a0a', border: '2px solid #0a0a0a' }}
        >← 首页</button>
        <EventPill stars={5} subtle>🛠️ MAKER · UGC 审核</EventPill>
        <div style={{ width: 60 }} />
      </div>

      {/* Token input — shown empty or invalid */}
      {(!token || loadErr) && (
        <div className="w-full max-w-2xl mb-4 p-4 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,215,0,0.32)' }}>
          <div className="text-xs font-bold mb-2" style={{ color: '#FFD700', letterSpacing: '0.1em' }}>
            MAKER TOKEN
          </div>
          <input
            type="password"
            value={token}
            placeholder="输入 server 端 MAKER_TOKEN env 值"
            onChange={(e) => { setToken(e.target.value); saveToken(e.target.value); }}
            className="w-full px-3 py-2 rounded-md font-mono text-xs"
            style={{
              background: 'rgba(0,0,0,0.4)', color: '#F8F4E3',
              border: '1px solid rgba(255,215,0,0.32)',
            }}
          />
          {loadErr && (
            <div className="text-xs mt-2" style={{ color: '#ff6347' }}>{loadErr}</div>
          )}
        </div>
      )}

      {/* Pending list */}
      {token && !loadErr && (
        <div className="w-full max-w-2xl">
          {pending.length === 0 ? (
            <div className="p-6 rounded-xl text-center"
              style={{
                background: 'rgba(255,215,0,0.04)',
                border: '1px dashed rgba(255,215,0,0.25)',
                color: 'rgba(248,244,227,0.55)', fontSize: 13, fontWeight: 700,
              }}>
              🎉 审核队列为空 — 所有段子已处理
            </div>
          ) : (
            <>
              <div className="mb-3 text-xs font-bold"
                style={{ color: '#FFD700', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
                ⏳ {pending.length} 条待审核
              </div>
              <div className="flex flex-col gap-3">
                {pending.map((e) => (
                  <motion.div
                    key={e.id}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl p-4"
                    style={{
                      background: 'rgba(20,15,40,0.7)',
                      border: '1px solid rgba(176,134,255,0.32)',
                    }}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="text-sm font-black" style={{ color: '#F8F4E3' }}>
                          {e.title}
                        </div>
                        <div className="text-[10px] mt-1" style={{ color: 'rgba(248,244,227,0.45)' }}>
                          {e.userId.slice(0, 12)} · {e.tag}{e.region ? ` · ${e.region}` : ''} · {new Date(e.createdAt).toLocaleString('zh-CN')}
                        </div>
                      </div>
                    </div>
                    <div className="text-sm leading-relaxed mb-3" style={{ color: 'rgba(248,244,227,0.85)' }}>
                      {e.text}
                    </div>
                    {e.modNotes && (
                      <div className="text-[10px] mb-3 italic" style={{ color: 'rgba(248,244,227,0.4)' }}>
                        auto-mod: {e.modNotes}
                      </div>
                    )}
                    {rejectReasonFor === e.id ? (
                      <div className="flex gap-2">
                        <input
                          autoFocus
                          value={rejectReason}
                          placeholder="拒绝原因 (将告知投稿者)"
                          onChange={(ev) => setRejectReason(ev.target.value)}
                          className="flex-1 px-2 py-1 rounded text-xs"
                          style={{
                            background: 'rgba(0,0,0,0.4)', color: '#F8F4E3',
                            border: '1px solid rgba(255,71,87,0.45)',
                          }}
                        />
                        <button
                          disabled={!rejectReason.trim() || busy === e.id}
                          onClick={() => review(e.id, 'rejected', rejectReason)}
                          className="px-3 py-1 rounded text-xs font-bold"
                          style={{
                            background: rejectReason.trim() ? '#ff4757' : '#555',
                            color: 'white', cursor: rejectReason.trim() ? 'pointer' : 'not-allowed',
                          }}
                        >确认拒绝</button>
                        <button
                          onClick={() => { setRejectReasonFor(null); setRejectReason(''); }}
                          className="px-3 py-1 rounded text-xs font-bold"
                          style={{ background: 'transparent', color: 'rgba(248,244,227,0.5)', border: '1px solid rgba(255,255,255,0.18)' }}
                        >取消</button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          disabled={busy === e.id}
                          onClick={() => review(e.id, 'approved')}
                          className="flex-1 px-3 py-2 rounded text-xs font-bold"
                          style={{
                            background: 'linear-gradient(135deg, #5be24a 0%, #22c55e 100%)',
                            color: '#0a3017',
                            cursor: busy === e.id ? 'wait' : 'pointer',
                          }}>✓ 通过 (approve)</button>
                        <button
                          disabled={busy === e.id}
                          onClick={() => setRejectReasonFor(e.id)}
                          className="flex-1 px-3 py-2 rounded text-xs font-bold"
                          style={{
                            background: 'rgba(255,71,87,0.18)', color: '#ff6b7a',
                            border: '1px solid rgba(255,71,87,0.55)',
                            cursor: busy === e.id ? 'wait' : 'pointer',
                          }}>✗ 拒绝 (reject)</button>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </>
          )}
          <button
            onClick={fetchPending}
            className="mt-4 mx-auto block px-4 py-2 rounded-full text-xs font-bold"
            style={{
              background: 'rgba(255,215,0,0.12)', color: '#FFD700',
              border: '1px solid rgba(255,215,0,0.32)',
            }}
          >↻ 刷新</button>
        </div>
      )}
    </div>
  );
}
