/**
 * TalkshowUgc — v6.1 段子 UGC 投稿 + 月度精选展示。
 *
 * 入口路径: `/talkshow/ugc`
 * 入口来源: Talkshow 页 header "🎤 投稿" 按钮 / Landing 卡片角标
 *
 * 三个 section:
 *   1. ⭐ 本月精选 — 拉 /api/talkshow/ugc/monthly, 横向滚动卡片
 *   2. 🎤 投稿你的段子 — 标题 + 段子正文 + tag + region 选项, 提交后返回 id
 *   3. 📋 我的投稿历史 — 按时间倒序, 含 pending / approved / rejected 状态
 *
 * 设计意图: 让用户感觉"我的段子也能上墙", UGC viral loop 闭环。
 * auto-moderation 黑名单覆盖政治 / 直接公司点名 / 色情 / 暴力, 但
 * 调侃 "拥抱变化" / "颗粒度" / "PUA" 这类企业话术全允许 — 那本来就是
 * 产品的核心调性。
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getUserId } from '../utils/userId';

const TAGS = [
  { value: 'overtime', label: '加班 / 周报', emoji: '🌙' },
  { value: 'kpi',      label: 'KPI / OKR',  emoji: '📊' },
  { value: 'pua',      label: 'PUA / 画饼',  emoji: '🎭' },
  { value: 'age',      label: '35 岁 / 中年', emoji: '⏳' },
  { value: 'slacking', label: '摸鱼 / 划水',  emoji: '🐟' },
  { value: 'jargon',   label: '阿里黑话',     emoji: '🧩' },
  { value: 'hr',       label: 'HR / 裁员',   emoji: '⚖️' },
  { value: 'boss',     label: '老板 / 高管',  emoji: '👔' },
  { value: 'meta',     label: '自嘲 / 行业',  emoji: '🪞' },
] as const;

const REGIONS = [
  { value: '',          label: '不限地区' },
  { value: 'beijing',   label: '北漂 🏙️' },
  { value: 'shanghai',  label: '沪漂 🌉' },
  { value: 'shenzhen',  label: '深漂 🌴' },
  { value: 'hangzhou',  label: '杭漂 🍵' },
  { value: 'chengdu',   label: '蓉漂 🐼' },
  { value: 'overseas',  label: '海外润 ✈️' },
] as const;

interface MonthlyEntry {
  id: string;
  title: string;
  text: string;
  tag: string;
  region?: string;
  likes: number;
  createdAt: number;
}

interface MySubmission {
  id: string;
  title: string;
  text: string;
  tag: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  likes: number;
  createdAt: number;
}

const STATUS_LABEL: Record<MySubmission['status'], { label: string; color: string }> = {
  pending:  { label: '⏳ 待审核', color: '#ffd58a' },
  approved: { label: '✓ 已上墙', color: '#4ade80' },
  rejected: { label: '✗ 未通过', color: '#ef4444' },
};

export default function TalkshowUgc() {
  const navigate = useNavigate();
  const myId = useMemo(() => getUserId(), []);

  // Submit form state
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [tag, setTag] = useState<string>('overtime');
  const [region, setRegion] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Data state
  const [monthly, setMonthly] = useState<MonthlyEntry[] | null>(null);
  const [mine, setMine] = useState<MySubmission[] | null>(null);

  const refetch = () => {
    fetch('/api/talkshow/ugc/monthly?limit=10')
      .then((r) => r.json() as Promise<{ entries: MonthlyEntry[] }>)
      .then((d) => setMonthly(d.entries ?? []))
      .catch(() => setMonthly([]));
    fetch('/api/talkshow/ugc/me', { headers: { 'X-User-Id': myId } })
      .then((r) => r.json() as Promise<{ submissions: MySubmission[] }>)
      .then((d) => setMine(d.submissions ?? []))
      .catch(() => setMine([]));
  };
  useEffect(() => { refetch(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const canSubmit = title.trim().length >= 4 && text.trim().length >= 30 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setMsg(null);
    try {
      const resp = await fetch('/api/talkshow/ugc/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': myId },
        body: JSON.stringify({ title: title.trim(), text: text.trim(), tag, region: region || undefined }),
      });
      const json = await resp.json() as { id?: string; status?: string; message?: string; error?: string };
      if (resp.ok && json.id) {
        setMsg({ kind: 'ok', text: json.message ?? '✓ 投稿成功' });
        setTitle('');
        setText('');
        refetch();
      } else {
        setMsg({ kind: 'err', text: json.error ?? json.message ?? '提交失败' });
      }
    } catch {
      setMsg({ kind: 'err', text: '网络错误, 请重试' });
    } finally {
      setBusy(false);
    }
  };

  const like = async (id: string) => {
    try {
      const resp = await fetch(`/api/talkshow/ugc/like/${id}`, { method: 'POST' });
      if (resp.ok) {
        const json = await resp.json() as { id: string; likes: number };
        setMonthly((cur) => cur?.map((e) => e.id === json.id ? { ...e, likes: json.likes } : e) ?? null);
      }
    } catch { /* silent */ }
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden"
      style={{ background: 'radial-gradient(circle at 30% 20%, #1a0d35 0%, #050510 70%)' }}>
      <header className="px-6 md:px-10 py-5 flex items-center justify-between">
        <button onClick={() => navigate('/talkshow')}
          className="text-xs text-white/55 hover:text-white/90 transition px-3 py-1.5 rounded"
          style={{ background: 'rgba(255,255,255,0.05)' }}>
          ← 段子库
        </button>
        <span className="text-[11px] uppercase tracking-[0.28em] text-white/55">
          🎤 段子投稿
        </span>
        <span className="w-12" />
      </header>

      <main className="max-w-2xl mx-auto px-4 md:px-6 pb-16">
        {/* ============== 月度精选 ============== */}
        <section className="mt-4">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-base font-black text-white/95">⭐ 本月精选 UGC</h2>
            <span className="text-[10px] text-white/40 uppercase tracking-[0.22em]">过去 30 天</span>
          </div>
          {monthly === null && (
            <div className="text-center py-6 text-white/45 text-sm">⏳ 加载中...</div>
          )}
          {monthly && monthly.length === 0 && (
            <div className="text-center py-8 text-white/55 text-sm rounded-2xl"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.15)' }}>
              📭 暂无精选 — 抢首发! 你的段子可能成为本月头条
            </div>
          )}
          {monthly && monthly.length > 0 && (
            <div className="space-y-3">
              {monthly.map((e) => {
                const tagInfo = TAGS.find((t) => t.value === e.tag);
                return (
                  <div key={e.id}
                    className="rounded-2xl p-4"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255,215,0,0.08), rgba(176,134,255,0.04))',
                      border: '1px solid rgba(255,215,0,0.32)',
                    }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-base">{tagInfo?.emoji ?? '✨'}</span>
                      <h3 className="text-sm font-black text-white/95 flex-1 truncate">{e.title}</h3>
                      <button onClick={() => like(e.id)}
                        className="text-[11px] text-white/65 hover:text-rose-300 transition px-2 py-1 rounded"
                        style={{ background: 'rgba(255,255,255,0.05)' }}>
                        ❤ {e.likes}
                      </button>
                    </div>
                    <p className="text-[12px] text-white/80 leading-relaxed whitespace-pre-wrap">{e.text}</p>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ============== 投稿表单 ============== */}
        <section className="mt-8">
          <h2 className="text-base font-black text-white/95 mb-3">🎤 投稿你的段子</h2>
          <p className="text-[11px] text-white/55 leading-relaxed mb-4">
            写一段你最近遇到的职场段子 / 老板话术 / 同事金句。
            通过审核后会进入精选池, 让其他打工人为你点赞。
            <br/>
            <span className="text-white/40">
              🚫 自动屏蔽: 直接公司点名 / 政治 / 色情 / 暴力
              <br/>
              ✅ 允许: 阿里黑话 / "拥抱变化" / "毕业" / 阴阳话术 / PUA 反讽
            </span>
          </p>

          <div className="rounded-2xl p-4 space-y-3"
            style={{
              background: 'rgba(176,134,255,0.06)',
              border: '1px solid rgba(176,134,255,0.30)',
            }}>
            <div>
              <label className="text-[10px] uppercase tracking-[0.22em] text-white/55">标题 (4-40 字)</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={40}
                placeholder='例: "周会上我老板的第 17 次拥抱变化"'
                className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white outline-none"
                style={{
                  background: 'rgba(0,0,0,0.30)',
                  border: '1px solid rgba(255,255,255,0.10)',
                }}
              />
              <div className="text-right text-[10px] text-white/35 mt-0.5">{title.length}/40</div>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.22em] text-white/55">段子正文 (30-800 字)</label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={800}
                rows={8}
                placeholder={'周一早会, 老板说: "这周我们要拉齐认知, 把第二曲线的颗粒度沉淀一下..."\n\n我心里 OS: 你能不能先把第一曲线的工资给我对齐了...'}
                className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white leading-relaxed outline-none resize-none"
                style={{
                  background: 'rgba(0,0,0,0.30)',
                  border: '1px solid rgba(255,255,255,0.10)',
                }}
              />
              <div className="text-right text-[10px] text-white/35 mt-0.5">{text.length}/800</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-[0.22em] text-white/55">主题 tag</label>
                <select value={tag} onChange={(e) => setTag(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white outline-none"
                  style={{ background: 'rgba(0,0,0,0.30)', border: '1px solid rgba(255,255,255,0.10)' }}>
                  {TAGS.map((t) => (
                    <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.22em] text-white/55">地域</label>
                <select value={region} onChange={(e) => setRegion(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white outline-none"
                  style={{ background: 'rgba(0,0,0,0.30)', border: '1px solid rgba(255,255,255,0.10)' }}>
                  {REGIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={submit}
              disabled={!canSubmit}
              className="w-full py-3 rounded-xl text-sm font-black tracking-wide text-white disabled:opacity-40"
              style={{
                background: 'linear-gradient(135deg, #FFD700, #FFA947)',
                color: '#1a0d35',
                boxShadow: '0 6px 22px rgba(255,215,0,0.32)',
              }}>
              {busy ? '提交中…' : '🚀 提交段子'}
            </button>

            <AnimatePresence>
              {msg && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center text-[12px] py-2 rounded-lg"
                  style={{
                    color: msg.kind === 'ok' ? '#4ade80' : '#fca5a5',
                    background: msg.kind === 'ok' ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)',
                  }}>
                  {msg.text}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* ============== 我的投稿史 ============== */}
        {mine && mine.length > 0 && (
          <section className="mt-8">
            <h2 className="text-base font-black text-white/95 mb-3">📋 我的投稿</h2>
            <div className="space-y-2">
              {mine.map((s) => {
                const st = STATUS_LABEL[s.status];
                const tagInfo = TAGS.find((t) => t.value === s.tag);
                return (
                  <div key={s.id} className="rounded-xl p-3"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">{tagInfo?.emoji ?? '✨'}</span>
                      <span className="text-sm font-bold text-white/90 flex-1 truncate">{s.title}</span>
                      <span className="text-[10px] font-bold" style={{ color: st.color }}>{st.label}</span>
                      {s.status === 'approved' && <span className="text-[10px] text-white/55">❤ {s.likes}</span>}
                    </div>
                    {s.rejectionReason && (
                      <div className="text-[10px] text-rose-300/75 leading-relaxed">
                        原因: {s.rejectionReason}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div className="text-center text-[10px] text-white/35 mt-8 leading-relaxed">
          段子库每月评选 Top 5 上首页轮播 · 你的段子也有机会
        </div>
      </main>
    </div>
  );
}
