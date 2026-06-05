/**
 * Talkshow — v0.7.0 班味单口 (Workplace Standup) MVP.
 *
 * Three states the page can be in:
 *   1. List view (default) — grid of 30 seed scripts with tag chips +
 *      persona swatch. Tapping a card transitions to player view.
 *   2. Loading — script body + audio fetch in flight, showing a spinner
 *      over the about-to-play card.
 *   3. Player view — big avatar, speech bubble caption that streams in
 *      with the audio (cheap "lip sync" — text reveals at ~6 chars/sec
 *      to roughly track Minimax 2.8-hd's output rate), big play/pause +
 *      back button.
 *
 * No login, no persistence yet — every visit pulls /list fresh. v0.7.1
 * adds the character editor; v0.7.2 swaps the static avatar for Veo 3.1
 * generated B-roll.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  primeAudio,
  playTtsFromUrl,
  speakViaBrowserTTS,
  hasBrowserTTS,
  stopTts,
  setTtsPlaybackSpeed,
  getTtsPlaybackSpeed,
} from '../utils/audioUnlock';
import { getUserId } from '../utils/userId';
import EventPill from '../components/EventPill';
import {
  ARCHETYPE_TO_TALKSHOW_PERSONA,
  findArchetype,
  type Archetype,
} from '@furball/shared';
import type { UserProfile } from '../utils/profileTypes';
import { SkeletonCard } from '../components/ui/SkeletonCard';
import { EmptyState }   from '../components/ui/EmptyState';
import { WaveformBars } from '../components/ui/WaveformBars';
import RoastBooth from '../components/character/RoastBooth';

interface ScriptSummary {
  id: string;
  title: string;
  tag: string;
  persona: string;
  durationSec: number;
  /** v0.7.4 — 'seed' = hand-curated by us, 'user' = LLM-written from a
   *  user prompt. Drives the ✨ badge on the card so users can tell the
   *  fresh community bits from the curated catalogue. */
  source?: 'seed' | 'user';
  /** v0.7.5 — community heart count. Always present in v0.7.5+ responses
   *  (server backfills missing entries to 0). */
  likes?: number;
  /** v0.8.1 — pseudonymous creator id (matches localStorage). Powers the
   *  "我的创作" filter chip. */
  createdBy?: string;
  /** v0.9.2 — total times this bit's TTS has been generated. Drives the
   *  "▶ N" play-count badge + monthly leaderboard ranking. */
  plays?: number;
  /** v2.3.0 — optional region tag. When set, dailyDrama biases toward
   *  it; v3.2.0 also surfaces a "我的圈子" filter chip when the user's
   *  archetype's region matches. */
  region?: 'beijing' | 'shanghai' | 'shenzhen' | 'hangzhou' | 'chengdu' | 'overseas';
}

interface ScriptFull extends ScriptSummary {
  text: string;
}

// v1.3.3 — adds 'foryou' which client-side reorders by archetype
// affinity. Server doesn't need to know about it (no /list?sort=foryou
// endpoint) — we fetch 'default' and re-sort in the client based on
// the user's quiz profile.
type SortMode = 'default' | 'hot' | 'new' | 'monthly' | 'foryou';

type Persona = 'shaonv' | 'yujie' | 'qingse' | 'jingying' | 'badao' | 'qingnian';
type Tag =
  | 'overtime' | 'kpi' | 'pua' | 'age' | 'slacking'
  | 'jargon' | 'hr' | 'boss' | 'meta';

const TAG_LABELS: Record<string, { label: string; color: string }> = {
  overtime: { label: '🌙 加班', color: '#ff5588' },
  kpi:      { label: '📊 KPI', color: '#4c9eff' },
  pua:      { label: '🌀 PUA', color: '#a855f7' },
  age:      { label: '🪪 35岁', color: '#ffb84c' },
  slacking: { label: '🛋️ 摸鱼', color: '#6ee7b7' },
  jargon:   { label: '🗣️ 黑话', color: '#7c3aed' },
  hr:       { label: '🧑‍💼 HR', color: '#42a5f5' },
  boss:     { label: '👔 老板', color: '#ff4757' },
  meta:     { label: '🪞 自嘲', color: '#90caf9' },
};

/** v5.1.0 — each persona now also references an `imageUrl` pointing at
 *  the AI-generated portrait under /talkshow-personas/<id>.png. The
 *  emoji stays as a fallback for: (a) brand-new dev environments where
 *  the portraits haven't been generated yet, (b) image-load failures
 *  in the wild. See packages/server/src/services/talkshowAvatarGen.ts
 *  for art direction + scripts/regen-talkshow-personas.ts for the CLI. */
const PERSONA_LABELS: Record<string, {
  emoji: string;
  imageUrl: string;
  label: string;
  gender: 'female' | 'male';
}> = {
  shaonv:   { emoji: '👧',     imageUrl: '/talkshow-personas/shaonv.png',   label: '少女音',  gender: 'female' },
  yujie:    { emoji: '💃',     imageUrl: '/talkshow-personas/yujie.png',    label: '御姐音',  gender: 'female' },
  qingse:   { emoji: '🧑',     imageUrl: '/talkshow-personas/qingse.png',   label: '青涩男',  gender: 'male'   },
  jingying: { emoji: '🧔',     imageUrl: '/talkshow-personas/jingying.png', label: '精英男',  gender: 'male'   },
  badao:    { emoji: '👨‍💼', imageUrl: '/talkshow-personas/badao.png',    label: '霸道男',  gender: 'male'   },
  qingnian: { emoji: '👤',     imageUrl: '/talkshow-personas/qingnian.png', label: '青年音',  gender: 'male'   },
};

export default function Talkshow() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [scripts, setScripts] = useState<ScriptSummary[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  /** v6.15 P3 — approved UGC entries interleaved into the AI script
   *  grid every 5 cards. Fetched once on mount; quiet-fail if no
   *  entries yet (carousel hides instead of teasing). */
  const [ugcEntries, setUgcEntries] = useState<Array<{
    id: string; title: string; text: string; tag: string;
    region?: string; likes: number; createdAt: number;
  }>>([]);
  /** v3.2.0 — "我的圈子" tribe filter. Mirror of FiredLanding's
   *  v2.1.0/v2.4.0 chip but for talkshow scripts. Talkshow scripts
   *  carry only `region?` (no industry), so this is a region filter
   *  in practice. */
  const [tribeOnly, setTribeOnly] = useState(false);
  /** v0.7.5 — sort mode for the grid. 'default' = user bits (recent) first
   *  + seeds in curated order; 'hot' = sorted by community likes desc;
   *  'new' = strict recency desc. */
  const [sortMode, setSortMode] = useState<SortMode>('default');
  /** v0.8.1 — when true, only show bits whose createdBy matches MY local
   *  pseudonymous id. Mutually exclusive with the tag filter UX-wise but
   *  technically composable. */
  const [mineOnly, setMineOnly] = useState(false);
  const myId = useMemo(() => getUserId(), []);
  /** v1.3.3 — fetched once on mount. When non-null we know the user's
   *  archetype + can offer "为你推荐" sort + match the creator persona. */
  const [profile, setProfile] = useState<UserProfile | null>(null);
  useEffect(() => {
    fetch('/api/quiz/me', { headers: { 'X-User-Id': myId } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { profile: UserProfile | null } | null) => {
        if (d?.profile) setProfile(d.profile);
      })
      .catch(() => { /* anonymous user — feature just stays inactive */ });
  }, [myId]);
  const myArchetype: Archetype | null = useMemo(() => {
    if (!profile?.topArchetypes?.[0]) return null;
    return findArchetype(profile.topArchetypes[0]) ?? null;
  }, [profile]);
  /** When non-null, we're in player view for this script. */
  const [active, setActive] = useState<ScriptFull | null>(null);
  /** v3.1.1 — transient evolution toast after the user creates a
   *  segment. Surfaces the trait drift that the server just recorded
   *  so the user sees their班味 update even when not on a Profile
   *  page. Auto-dismisses after 4.5s. */
  const [evolutionToast, setEvolutionToast] = useState<{
    summary: string;
    transitioned: boolean;
    toArchetype: string;
  } | null>(null);
  useEffect(() => {
    if (!evolutionToast) return;
    const id = setTimeout(() => setEvolutionToast(null), 4500);
    return () => clearTimeout(id);
  }, [evolutionToast]);
  /** v0.7.4 — when true, the create-bit modal is open. */
  const [creatorOpen, setCreatorOpen] = useState(false);
  /** v0.7.5 — set of script ids the current IP has already liked (per the
   *  server's per-IP dedup). Used to paint hearts filled-vs-outline. */
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  // Fetch list — extracted so we can call it again after a create completes
  // or when the sort mode changes.
  const reloadList = useRef<(opts?: { sort?: SortMode }) => Promise<void>>();
  useEffect(() => {
    let cancelled = false;
    const load = async (opts?: { sort?: SortMode }) => {
      try {
        const sort = opts?.sort ?? sortMode;
        const url = sort === 'default' ? '/api/talkshow/list' : `/api/talkshow/list?sort=${sort}`;
        const r = await fetch(url);
        const d = await r.json();
        if (cancelled) return;
        const next = (d.scripts ?? []) as ScriptSummary[];
        setScripts(next);
        // After list loads, batch-fetch which ones THIS IP has liked
        // so the hearts paint correctly on first frame.
        const ids = next.map((s) => s.id).join(',');
        if (ids) {
          fetch(`/api/talkshow/like-state?ids=${encodeURIComponent(ids)}`)
            .then((r2) => r2.json())
            .then((d2: { liked?: string[] }) => {
              if (!cancelled && Array.isArray(d2.liked)) {
                setLikedIds(new Set(d2.liked));
              }
            })
            .catch(() => { /* non-fatal — hearts just stay outlined */ });
        }
      } catch (e) {
        if (!cancelled) setLoadErr((e as Error).message ?? '加载失败');
      }
    };
    reloadList.current = load;
    load();
    // v6.15 P3 — also fetch a small batch of approved UGC entries to
    // interleave into the grid every 5 AI cards. Quiet fail (empty
    // array means no interleaving, grid renders pure AI).
    fetch('/api/talkshow/ugc/monthly?limit=6')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { entries: typeof ugcEntries }) => {
        if (!cancelled) setUgcEntries(d.entries ?? []);
      })
      .catch(() => { /* silent — fall back to pure AI grid */ });
    return () => { cancelled = true; stopTts(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortMode]);

  // Deeplink — `?id=bit-001` auto-opens the player. Also keeps the URL in
  // sync as the user navigates between bits, so refresh / share preserves
  // the current bit.
  useEffect(() => {
    const id = searchParams.get('id');
    if (!id) return;
    if (active && active.id === id) return;
    let cancelled = false;
    fetch(`/api/talkshow/script/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((full: ScriptFull) => {
        if (!cancelled) {
          // Prime audio in case the deeplink open is the user's first
          // gesture this session — Safari only unlocks audio inside one.
          primeAudio();
          setActive(full);
        }
      })
      .catch(() => { /* invalid id — silently ignore, keep grid view */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Mirror player navigation back to the URL so the back/forward button
  // and a fresh refresh both land on the same bit.
  useEffect(() => {
    if (active) {
      if (searchParams.get('id') !== active.id) {
        setSearchParams({ id: active.id }, { replace: true });
      }
    } else {
      if (searchParams.get('id')) {
        setSearchParams({}, { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const visible = useMemo(() => {
    let out = scripts;
    if (tagFilter) out = out.filter((s) => s.tag === tagFilter);
    if (mineOnly)  out = out.filter((s) => s.createdBy === myId);
    // v3.2.0 — tribe filter, region-only (talkshow scripts don't carry
    // industry). Mirrors FiredLanding's chip behavior.
    if (tribeOnly && myArchetype?.region) {
      out = out.filter((s) => s.region === myArchetype.region);
    }
    // v1.3.3 — "为你推荐" client-side reorder. Score = +3 if the bit's
    // tag matches the user's archetype shineTalkshowTag, +1 for any
    // bit also tagged with the same emotional bucket. Stable sort —
    // preserves relative order within tier so seeded curation isn't
    // destroyed.
    if (sortMode === 'foryou' && myArchetype) {
      const shineTag = myArchetype.shineTalkshowTag;
      out = [...out]
        .map((s, idx) => ({
          s, idx,
          score: s.tag === shineTag ? 3 : 0,
        }))
        .sort((a, b) => b.score - a.score || a.idx - b.idx)
        .map((e) => e.s);
    }
    return out;
  }, [scripts, tagFilter, mineOnly, tribeOnly, myId, sortMode, myArchetype]);

  /** v3.2.0 — count of region-matching scripts. Used to decide whether
   *  the tribe chip should render at all (avoid "0 results" filter). */
  const tribeCount = useMemo(() => {
    if (!myArchetype?.region) return 0;
    return scripts.filter((s) => s.region === myArchetype.region).length;
  }, [scripts, myArchetype]);

  /** v0.8.1 — count of MY creations across the whole catalogue (not just
   *  filtered). Drives the badge on the "我的创作" chip so users can see
   *  there's something to find before tapping it. */
  const mineCount = useMemo(
    () => scripts.filter((s) => s.createdBy === myId).length,
    [scripts, myId],
  );

  /** v0.7.5 — toggle like for `id` with optimistic UI: bump the count
   *  immediately, then reconcile with server response (which is authoritative
   *  in case our local likedIds disagrees). On network failure we roll back
   *  so the heart can be tapped again. */
  const toggleLike = async (id: string) => {
    const wasLiked = likedIds.has(id);
    // Optimistic local mutation
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (wasLiked) next.delete(id); else next.add(id);
      return next;
    });
    setScripts((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, likes: Math.max(0, (s.likes ?? 0) + (wasLiked ? -1 : 1)) } : s,
      ),
    );
    if (active?.id === id) {
      setActive((a) => (a ? { ...a, likes: Math.max(0, (a.likes ?? 0) + (wasLiked ? -1 : 1)) } : a));
    }
    try {
      const resp = await fetch('/api/talkshow/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptId: id, liked: !wasLiked }),
      });
      if (!resp.ok) throw new Error(`like ${resp.status}`);
      const data = await resp.json() as { likes: number };
      // Reconcile to authoritative count.
      setScripts((prev) =>
        prev.map((s) => (s.id === id ? { ...s, likes: data.likes } : s)),
      );
      if (active?.id === id) {
        setActive((a) => (a ? { ...a, likes: data.likes } : a));
      }
    } catch {
      // Roll back optimistic state.
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.add(id); else next.delete(id);
        return next;
      });
      setScripts((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, likes: Math.max(0, (s.likes ?? 0) + (wasLiked ? 1 : -1)) } : s,
        ),
      );
    }
  };

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const s of scripts) set.add(s.tag);
    return [...set];
  }, [scripts]);

  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={{ background: 'linear-gradient(180deg,#0a0a1e,#1a0d2e 50%,#0d0a25)' }}
    >
      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-10 py-5">
        <button
          onClick={() => navigate('/')}
          className="text-xs tracking-wider text-white/55 hover:text-white/90 transition px-3 py-1.5 rounded"
          style={{ background: 'rgba(255,255,255,0.05)' }}
        >
          ← 返回首页
        </button>
        <div className="flex items-baseline gap-3">
          <EventPill stars={5} subtle>🎤 班味单口</EventPill>
          <span className="text-[10px] text-white/35">
            {scripts.length > 0 && `${scripts.length} 段`}
          </span>
        </div>
        {/* v6.1 — UGC 段子投稿 + 月度精选入口 */}
        <button
          onClick={() => navigate('/talkshow/ugc')}
          className="text-[11px] font-bold tracking-wider px-2.5 py-1 rounded transition"
          style={{
            background: 'linear-gradient(135deg, rgba(255,215,0,0.18), rgba(255,169,71,0.12))',
            border: '1px solid rgba(255,215,0,0.42)',
            color: '#FFD58A',
          }}
          title="投稿你写的段子 · 月底精选上墙"
        >
          🎤 投稿 ★
        </button>
      </header>

      {/* Player view — slides in over the list */}
      <AnimatePresence mode="wait">
        {active ? (
          <PlayerView
            key="player"
            script={active}
            liked={likedIds.has(active.id)}
            onLikeToggle={() => toggleLike(active.id)}
            onBack={() => setActive(null)}
            onNavigate={async (direction) => {
              // Find the active script in the visible list and jump to the
              // next/previous one. Loops at the boundaries so users can keep
              // tapping ▶ without hitting a dead-end.
              const idx = visible.findIndex((s) => s.id === active.id);
              if (idx < 0 || visible.length <= 1) return;
              const next = direction === 'next'
                ? visible[(idx + 1) % visible.length]
                : visible[(idx - 1 + visible.length) % visible.length];
              try {
                const resp = await fetch(`/api/talkshow/script/${next.id}`);
                const full = (await resp.json()) as ScriptFull;
                setActive(full);
              } catch {
                setActive({ ...next, text: '(脚本加载失败)' });
              }
            }}
          />
        ) : (
          <motion.main
            key="list"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="relative z-10 px-4 md:px-10 pb-20"
          >
            {/* Hero */}
            <div className="text-center mb-8 mt-4">
              <h1
                className="font-black mb-3"
                style={{
                  fontSize: 'clamp(2.5rem, 5vw, 4rem)',
                  background: 'linear-gradient(135deg,#ff5588,#7c3aed,#4c9eff)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  letterSpacing: '0.02em',
                }}
              >
                班味单口
              </h1>
              <p className="text-white/60 text-sm md:text-base">
                AI 鼠人替你讲段子 · {scripts.length} 段职场暴论 · 真人音色播报
              </p>
            </div>

            {/* v6.55 #4 — 专属吐槽: vent a topic, AI fires back roast lines + TTS. */}
            <div className="max-w-2xl mx-auto">
              <RoastBooth />
            </div>

            {/* v0.7.5 sort chips + v0.8.1 "我的创作" filter — first row, the
                primary slice (hot/new/curated/mine) is the top-level decision. */}
            <div className="max-w-4xl mx-auto mb-3 flex flex-wrap gap-2 justify-center">
              <Chip
                active={sortMode === 'default' && !mineOnly}
                onClick={() => { setSortMode('default'); setMineOnly(false); }}
                color="#ffffff"
              >
                ✨ 推荐
              </Chip>
              <Chip
                active={sortMode === 'hot' && !mineOnly}
                onClick={() => { setSortMode('hot'); setMineOnly(false); }}
                color="#ff5588"
              >
                🔥 最热
              </Chip>
              <Chip
                active={sortMode === 'new' && !mineOnly}
                onClick={() => { setSortMode('new'); setMineOnly(false); }}
                color="#4c9eff"
              >
                🆕 最新
              </Chip>
              {/* v1.3.3 — "为你推荐" chip, only shown when user has a
                  quiz profile. Tap → reorder by archetype shineTalkshowTag. */}
              {myArchetype && (
                <Chip
                  active={sortMode === 'foryou' && !mineOnly}
                  onClick={() => { setSortMode('foryou'); setMineOnly(false); }}
                  color="#b086ff"
                >
                  🧠 为你推荐 · {myArchetype.emoji}
                </Chip>
              )}
              <Chip
                active={sortMode === 'monthly' && !mineOnly}
                onClick={() => { setSortMode('monthly'); setMineOnly(false); }}
                color="#ffb84c"
              >
                🏆 月度榜
              </Chip>
              {mineCount > 0 && (
                <Chip
                  active={mineOnly}
                  onClick={() => setMineOnly((v) => !v)}
                  color="#ffb84c"
                >
                  👤 我的创作 · {mineCount}
                </Chip>
              )}
              {/* v3.2.0 — tribe (region) filter chip. Renders only
                  when the user's archetype has a region tag AND at
                  least one script matches it. Color uses the
                  archetype's brand color so it reads as "tribe-
                  personalized". Parallel to FiredLanding's v2.4.0 chip. */}
              {tribeCount > 0 && myArchetype?.region && (
                <Chip
                  active={tribeOnly}
                  onClick={() => setTribeOnly((v) => !v)}
                  color={myArchetype.colors.start}
                >
                  {myArchetype.emoji} 我的圈子 · {tribeCount}
                </Chip>
              )}
            </div>

            {/* Tag filter */}
            {tags.length > 0 && (
              <div className="max-w-4xl mx-auto mb-6 flex flex-wrap gap-2 justify-center">
                <Chip
                  active={tagFilter === null}
                  onClick={() => setTagFilter(null)}
                  color="#ffffff"
                >
                  全部
                </Chip>
                {tags.map((t) => (
                  <Chip
                    key={t}
                    active={tagFilter === t}
                    onClick={() => setTagFilter(t)}
                    color={TAG_LABELS[t]?.color ?? '#ffffff'}
                  >
                    {TAG_LABELS[t]?.label ?? t}
                  </Chip>
                ))}
              </div>
            )}

            {/* Grid */}
            {loadErr ? (
              <EmptyState
                emoji="⚠️"
                title="段子库一时打不开"
                body={loadErr}
                cta={{ label: '↻ 重试', onClick: () => window.location.reload() }}
                glow="rgba(255,184,76,0.18)"
              />
            ) : (
              <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* v0.7.4 creator card — sticky first slot. Tapping opens
                    the modal editor; on success the new bit shows up at
                    the top of the grid AND auto-opens in PlayerView. */}
                <CreateBitCard
                  onOpen={() => {
                    primeAudio();           // gesture-window unlock for later TTS
                    setCreatorOpen(true);
                  }}
                />
                {/* v0.9.2.1 — first-load skeleton row. Renders only while
                    the initial /list fetch is in flight (scripts empty +
                    no error). 5 placeholders fill the typical above-fold
                    grid (the +1 creator card already takes slot 0). */}
                {scripts.length === 0 && !loadErr && (
                  <SkeletonCard variant="compact" count={5} />
                )}
                {/* Empty state — happens when the user is on "我的创作"
                    filter with zero authored bits. Default sort always has
                    seeds, so this only fires for the mine-filter dead-end. */}
                {scripts.length > 0 && visible.length === 0 && (
                  <EmptyState
                    emoji="✍️"
                    title="还没有你写的段子"
                    body="点上面的「✨ 自己写一段」试试,AI 帮你把吐槽编成段子"
                    cta={{ label: '✨ 写第一段', onClick: () => setCreatorOpen(true) }}
                  />
                )}
                {/* v6.15 P3 — interleave approved UGC every 5 AI cards.
                     Builds a flat virtual list of {kind, payload}.
                     UGC card click navigates to /talkshow/ugc for full
                     reading + like + report. */}
                {(() => {
                  const items: Array<
                    | { kind: 'ai'; script: typeof visible[number]; aiIdx: number }
                    | { kind: 'ugc'; entry: typeof ugcEntries[number] }
                  > = [];
                  let ugcCur = 0;
                  for (let i = 0; i < visible.length; i++) {
                    items.push({ kind: 'ai', script: visible[i], aiIdx: i });
                    // Inject UGC card AFTER every 5th AI card (positions 4, 9, 14, …).
                    if ((i + 1) % 5 === 0 && ugcCur < ugcEntries.length) {
                      items.push({ kind: 'ugc', entry: ugcEntries[ugcCur++] });
                    }
                  }
                  return items.map((item) => {
                    if (item.kind === 'ai') {
                      const s = item.script;
                      const idx = item.aiIdx;
                      return (
                        <ScriptCard
                          key={s.id}
                          script={s}
                          liked={likedIds.has(s.id)}
                          onLikeToggle={() => toggleLike(s.id)}
                          medal={sortMode === 'monthly' && idx < 3 ? (idx as 0 | 1 | 2) : undefined}
                          onSelect={async () => {
                            primeAudio();
                            try {
                              const resp = await fetch(`/api/talkshow/script/${s.id}`);
                              const full = (await resp.json()) as ScriptFull;
                              setActive(full);
                            } catch {
                              setActive({ ...s, text: '(脚本加载失败)' });
                            }
                          }}
                        />
                      );
                    }
                    return (
                      <UgcInlineCard key={`ugc-${item.entry.id}`} entry={item.entry}
                        onSelect={() => navigate('/talkshow/ugc')} />
                    );
                  });
                })()}
              </div>
            )}
          </motion.main>
        )}
      </AnimatePresence>

      {/* Creator modal — mounted at the route root so it overlays both
          the grid AND the player view (in case someone hits "create" from
          deeper in the flow later). Closed by default; opens via the
          ✨-card and via the future header CTA. */}
      <AnimatePresence>
        {creatorOpen && (
          <CreateBitModal
            /* v1.3.3 — pre-fill persona based on user's archetype so
               their bits sound like THEM by default. User can still
               override in the modal. Falls back to qingse when no
               profile (matches v1.3.2 behavior). */
            defaultPersona={
              myArchetype
                ? ARCHETYPE_TO_TALKSHOW_PERSONA[myArchetype.id] ?? 'qingse'
                : 'qingse'
            }
            archetypeHint={myArchetype}
            onCancel={() => setCreatorOpen(false)}
            onCreated={async (full, evo) => {
              setCreatorOpen(false);
              if (reloadList.current) await reloadList.current();
              setActive(full);
              // v3.1.1 — surface evolution toast if the server recorded a drift.
              if (evo) setEvolutionToast(evo);
            }}
          />
        )}
      </AnimatePresence>

      {/* v3.1.1 — evolution toast. Fires after talkshow create when
          the server recorded a trait drift. Auto-dismisses; tappable
          if the user wants to clear early. Sits bottom-center so it
          doesn't fight the script-player UI. */}
      <AnimatePresence>
        {evolutionToast && (
          <motion.button
            type="button"
            onClick={() => setEvolutionToast(null)}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="fixed left-1/2 bottom-6 -translate-x-1/2 z-50 max-w-[92vw] text-left rounded-2xl px-4 py-3 flex items-center gap-3"
            style={{
              background: evolutionToast.transitioned
                ? 'linear-gradient(135deg, rgba(255,184,76,0.22), rgba(255,85,136,0.12))'
                : 'rgba(176,134,255,0.14)',
              border: evolutionToast.transitioned
                ? '1px solid rgba(255,184,76,0.55)'
                : '1px solid rgba(176,134,255,0.45)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
              backdropFilter: 'blur(8px)',
              color: '#fff',
            }}
            aria-label="评估提示"
          >
            <span className="text-2xl">{evolutionToast.transitioned ? '🌀' : '✨'}</span>
            <div className="text-[12px] leading-snug">
              {evolutionToast.transitioned ? (
                <>
                  <div className="font-black text-[13px]" style={{ color: '#ffd58a' }}>
                    你已演化为新人格
                  </div>
                  <div className="text-white/85 mt-0.5">{evolutionToast.summary}</div>
                </>
              ) : (
                <div className="text-white/90">🌀 班味演化: {evolutionToast.summary}</div>
              )}
            </div>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Chip({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-xs font-bold tracking-wide transition"
      style={{
        color: active ? '#fff' : 'rgba(255,255,255,0.55)',
        background: active ? `${color}30` : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? color + '88' : 'rgba(255,255,255,0.08)'}`,
      }}
    >
      {children}
    </button>
  );
}

function ScriptCard({
  script,
  onSelect,
  liked,
  onLikeToggle,
  medal,
}: {
  script: ScriptSummary;
  onSelect: () => void;
  /** v0.7.5 — has THIS IP already liked this bit (server's per-IP dedup
   *  surfaced via /like-state batch fetch). Drives heart fill. */
  liked: boolean;
  onLikeToggle: () => void;
  /** v0.9.2 — 0/1/2 = 🥇/🥈/🥉 medal in monthly leaderboard. */
  medal?: 0 | 1 | 2;
}) {
  const tagCfg = TAG_LABELS[script.tag] ?? { label: script.tag, color: '#888' };
  const personaCfg = PERSONA_LABELS[script.persona] ?? { emoji: '🎤', label: script.persona };
  const isUser = script.source === 'user';
  const likeCount = script.likes ?? 0;
  const playCount = script.plays ?? 0;
  const medalGlyph = medal === 0 ? '🥇' : medal === 1 ? '🥈' : medal === 2 ? '🥉' : null;
  return (
    <motion.button
      onClick={onSelect}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      className="hover-sheen frost-card text-left rounded-2xl p-4 transition flex flex-col gap-3 min-h-[140px] relative overflow-hidden"
      style={{
        background: medalGlyph
          ? 'linear-gradient(135deg, rgba(255,184,76,0.16), rgba(255,85,136,0.05))'
          : isUser
            ? 'linear-gradient(135deg, rgba(255,184,76,0.08), rgba(255,255,255,0.02))'
            : 'rgba(255,255,255,0.025)',
        border: `1px solid ${medalGlyph
          ? 'rgba(255,184,76,0.55)'
          : isUser ? 'rgba(255,184,76,0.28)' : 'rgba(255,255,255,0.06)'}`,
        boxShadow: medalGlyph ? '0 6px 24px rgba(255,184,76,0.25)' : undefined,
      }}
    >
      {/* v0.9.2 medal — corner badge in monthly leaderboard top 3.
          v0.9.2.1 adds the .medal-pulse class for an ambient glow breath. */}
      {medalGlyph && (
        <div
          className="medal-pulse absolute top-2 left-2 text-2xl leading-none select-none z-10"
          aria-label={`榜单第 ${(medal ?? 0) + 1} 名`}
        >
          {medalGlyph}
        </div>
      )}
      <div className={`flex items-center justify-between text-[10px] ${medalGlyph ? 'pl-9' : ''}`}>
        <span
          className="px-2 py-0.5 rounded-full font-bold tracking-wide"
          style={{
            color: tagCfg.color,
            background: `${tagCfg.color}18`,
            border: `1px solid ${tagCfg.color}40`,
          }}
        >
          {tagCfg.label}
        </span>
        <div className="flex items-center gap-2">
          {isUser && (
            <span
              className="px-1.5 py-0.5 rounded-full font-bold tracking-wide text-[9px]"
              style={{
                color: '#ffb84c',
                background: 'rgba(255,184,76,0.15)',
                border: '1px solid rgba(255,184,76,0.4)',
              }}
              title="社区创作"
            >
              ✨ 用户
            </span>
          )}
          <span className="text-white/35 tabular-nums">{script.durationSec}s</span>
        </div>
      </div>
      <div className="text-sm font-bold text-white/90 line-clamp-3 leading-snug">
        {script.title}
      </div>
      <div className="text-[11px] text-white/55 mt-auto flex items-center gap-1.5">
        <span>{personaCfg.emoji}</span>
        <span>{personaCfg.label}</span>
        {/* v0.9.2 play count — only shows when > 0 to dodge 0/0/0 noise on
            fresh seeds. tabular-nums + same color as persona label keeps it
            quiet. */}
        {playCount > 0 && (
          <span className="text-white/40 tabular-nums" title="播放次数">
            · ▶ {playCount}
          </span>
        )}
        {/* Heart pill — stops click bubbling so tapping the heart doesn't
            also navigate into the player. Slightly bumped opacity when
            liked so the count reads at-a-glance from across the grid. */}
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onLikeToggle(); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              e.preventDefault();
              onLikeToggle();
            }
          }}
          className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full transition cursor-pointer"
          style={{
            color: liked ? '#ff5588' : 'rgba(255,255,255,0.45)',
            background: liked ? 'rgba(255,85,136,0.12)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${liked ? 'rgba(255,85,136,0.45)' : 'rgba(255,255,255,0.08)'}`,
          }}
          title={liked ? '已喜欢 · 再点取消' : '喜欢这一段'}
        >
          <span className="leading-none">{liked ? '❤' : '♡'}</span>
          <span className="tabular-nums">{likeCount}</span>
        </span>
        <span className="text-white/30">▶</span>
      </div>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// v0.7.4 — Creator card + modal
// ---------------------------------------------------------------------------

function CreateBitCard({ onOpen }: { onOpen: () => void }) {
  return (
    <motion.button
      onClick={onOpen}
      whileHover={{ y: -2, scale: 1.005 }}
      whileTap={{ scale: 0.98 }}
      className="text-left rounded-2xl p-4 transition flex flex-col items-center justify-center gap-2 min-h-[140px] cursor-pointer"
      style={{
        background:
          'radial-gradient(circle at 20% 0%, rgba(255,85,136,0.18), rgba(124,58,237,0.10) 60%, transparent), rgba(255,255,255,0.03)',
        border: '1px dashed rgba(255,85,136,0.45)',
        boxShadow: '0 8px 24px -12px rgba(255,85,136,0.4)',
      }}
    >
      <div className="text-3xl mb-1">✍️</div>
      <div className="text-sm font-bold text-white/90">自己写一段</div>
      <div className="text-[11px] text-white/55 text-center">
        给个话题 · 选个口音 · AI 替你编出爆款
      </div>
    </motion.button>
  );
}

const CREATE_TAGS: Array<{ key: Tag; label: string; color: string }> = [
  { key: 'overtime', label: '🌙 加班',  color: '#ff5588' },
  { key: 'kpi',      label: '📊 KPI',    color: '#4c9eff' },
  { key: 'pua',      label: '🌀 PUA',    color: '#a855f7' },
  { key: 'age',      label: '🪪 35岁',   color: '#ffb84c' },
  { key: 'slacking', label: '🛋️ 摸鱼',  color: '#6ee7b7' },
  { key: 'jargon',   label: '🗣️ 黑话',  color: '#7c3aed' },
  { key: 'hr',       label: '🧑‍💼 HR',  color: '#42a5f5' },
  { key: 'boss',     label: '👔 老板',   color: '#ff4757' },
  { key: 'meta',     label: '🪞 自嘲',   color: '#90caf9' },
];

/** v5.1.0 — Personas in the "write a new bit" modal. Same fallback
 *  pattern as PERSONA_LABELS: AI portrait via /talkshow-personas/<id>.png
 *  with emoji as 404-safe fallback so users see the actual voice
 *  character they're picking, not a generic person emoji. */
const CREATE_PERSONAS: Array<{ key: Persona; emoji: string; imageUrl: string; label: string }> = [
  { key: 'shaonv',   emoji: '👧',     imageUrl: '/talkshow-personas/shaonv.png',   label: '少女音' },
  { key: 'yujie',    emoji: '💃',     imageUrl: '/talkshow-personas/yujie.png',    label: '御姐音' },
  { key: 'qingse',   emoji: '🧑',     imageUrl: '/talkshow-personas/qingse.png',   label: '青涩男' },
  { key: 'jingying', emoji: '🧔',     imageUrl: '/talkshow-personas/jingying.png', label: '精英男' },
  { key: 'badao',    emoji: '👨‍💼', imageUrl: '/talkshow-personas/badao.png',    label: '霸道男' },
  { key: 'qingnian', emoji: '👤',     imageUrl: '/talkshow-personas/qingnian.png', label: '青年音' },
];

const CREATE_SAMPLES = [
  '我老板让我把"死线"翻译成"目标节点"',
  '入职第一天 HR 让我签了个"自愿加班同意书"',
  '35 岁那年我开始研究公积金提取',
  '我妈不懂为什么我每天 11 点才下班',
  '同事在群里 @ 全员说"求大佬看一眼"已经第三次了',
];

function CreateBitModal({
  onCancel,
  onCreated,
  defaultPersona,
  archetypeHint,
}: {
  onCancel: () => void;
  /** v3.1.1 — second arg is the evolution payload from the server's
   *  /generate response (null for anonymous users / no-profile). */
  onCreated: (
    full: ScriptFull,
    evolution: { summary: string; transitioned: boolean; toArchetype: string } | null,
  ) => void;
  /** v1.3.3 — pre-fill persona; user can still override. */
  defaultPersona?: Persona;
  /** v1.3.3 — when present, show a "based on your X archetype"
   *  hint over the persona picker. Pure UI affordance. */
  archetypeHint?: Archetype | null;
}) {
  const [topic, setTopic] = useState('');
  const [persona, setPersona] = useState<Persona>(defaultPersona ?? 'qingse');
  const [tag, setTag] = useState<Tag>(archetypeHint?.shineTalkshowTag as Tag | undefined ?? 'overtime');
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sample = useMemo(
    () => CREATE_SAMPLES[Math.floor(Math.random() * CREATE_SAMPLES.length)],
    [],
  );

  // Autofocus + Esc to close.
  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, submitting]);

  const canSubmit = topic.trim().length >= 4 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setErrMsg(null);
    try {
      const resp = await fetch('/api/talkshow/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // v0.8.1 — pseudonymous creator id for "我的创作" filter.
          'X-User-Id': getUserId(),
        },
        body: JSON.stringify({ topic: topic.trim(), persona, tag }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        // v0.7.6 — surface the server's friendly message verbatim where
        // it's set (rate limit gives "每小时最多 5 段,N 分钟后再试",
        // safety check gives "不接受真实政治人物姓名" etc).
        const msg = body.message ?? body.error ?? `生成失败 (${resp.status})`;
        throw new Error(msg);
      }
      // v3.1.1 — extract optional evolution payload (added in v3.1.1
       // server-side). Older server responses omit the field → null.
      const json = (await resp.json()) as ScriptFull & {
        evolution?: { summary: string; transitioned: boolean; toArchetype: string } | null;
      };
      const { evolution: evo, ...full } = json;
      onCreated(full as ScriptFull, evo ?? null);
    } catch (e) {
      setErrMsg((e as Error).message ?? '生成失败,稍后再试');
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(8,6,24,0.78)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onCancel();
      }}
    >
      <motion.div
        initial={{ y: 20, scale: 0.96, opacity: 0 }}
        animate={{ y: 0,  scale: 1,    opacity: 1 }}
        exit={{    y: 20, scale: 0.96, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-lg rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        style={{
          background: 'linear-gradient(180deg,#15122e,#0d0b25)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-black text-white">✍️ 写一段班味单口</h3>
          <button
            onClick={onCancel}
            disabled={submitting}
            className="text-white/45 hover:text-white/85 transition text-xl leading-none disabled:opacity-30"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        {/* Topic */}
        <label className="block text-[11px] text-white/55 tracking-wide mb-1.5">
          话题（一句话越具体越好,4-200 字）
        </label>
        <textarea
          ref={inputRef}
          value={topic}
          onChange={(e) => setTopic(e.target.value.slice(0, 200))}
          disabled={submitting}
          rows={3}
          placeholder={`比如:${sample}`}
          className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-pink-400/40 transition resize-none"
          style={{
            background: 'rgba(0,0,0,0.35)',
            border: '1px solid rgba(255,255,255,0.10)',
          }}
        />
        <div className="text-right text-[10px] text-white/35 mt-1 tabular-nums">
          {topic.length}/200
        </div>

        {/* Persona */}
        <label className="block text-[11px] text-white/55 tracking-wide mb-1.5 mt-3">
          叙述者口音
          {/* v1.3.3 — when user has a quiz profile, the default + tag
              are pre-tuned to their archetype. Tiny hint above the
              picker to make this discoverable. */}
          {archetypeHint && (
            <span
              className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-bold"
              style={{
                color: '#b086ff',
                background: 'rgba(176,134,255,0.12)',
                border: '1px solid rgba(176,134,255,0.35)',
              }}
            >
              已按 {archetypeHint.emoji}{archetypeHint.name} 推荐
            </span>
          )}
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {CREATE_PERSONAS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPersona(p.key)}
              disabled={submitting}
              className="rounded-lg py-2 text-xs font-semibold transition flex flex-col items-center gap-1"
              style={{
                background: persona === p.key
                  ? 'linear-gradient(135deg,rgba(255,85,136,0.25),rgba(124,58,237,0.18))'
                  : 'rgba(255,255,255,0.04)',
                border: `1px solid ${persona === p.key ? 'rgba(255,85,136,0.55)' : 'rgba(255,255,255,0.08)'}`,
                color: persona === p.key ? '#fff' : 'rgba(255,255,255,0.6)',
              }}
            >
              {/* v5.1.0 — AI portrait thumbnail, 40px circle. Emoji
                  absolutely-positioned behind so 404 falls through. */}
              <span className="relative w-10 h-10 rounded-full overflow-hidden flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg,#ff5588 0%,#7c3aed 100%)' }}>
                <span className="absolute inset-0 flex items-center justify-center text-base leading-none"
                  aria-hidden>{p.emoji}</span>
                <img
                  src={p.imageUrl}
                  alt={p.label}
                  className="absolute inset-0 w-full h-full object-cover"
                  draggable={false}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              </span>
              <span>{p.label}</span>
            </button>
          ))}
        </div>

        {/* Tag */}
        <label className="block text-[11px] text-white/55 tracking-wide mb-1.5 mt-3">话题分类</label>
        <div className="flex flex-wrap gap-1.5">
          {CREATE_TAGS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTag(t.key)}
              disabled={submitting}
              className="px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide transition"
              style={{
                color: tag === t.key ? '#fff' : 'rgba(255,255,255,0.55)',
                background: tag === t.key ? `${t.color}30` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${tag === t.key ? `${t.color}88` : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {errMsg && (
          <div className="mt-3 text-[12px] text-amber-300/90">⚠️ {errMsg}</div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 rounded-xl text-xs font-semibold tracking-wide text-white/65 transition disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="px-5 py-2 rounded-xl text-xs font-bold tracking-wide text-white transition disabled:opacity-40"
            style={{
              background: 'linear-gradient(135deg,#ff5588,#7c3aed)',
              boxShadow: '0 6px 18px rgba(255,85,136,0.45)',
            }}
          >
            {submitting ? '✍️ AI 编写中…' : '✨ 生成段子'}
          </button>
        </div>

        <div className="mt-3 text-[10px] text-white/35 leading-relaxed">
          生成的段子会进入"全部"列表的最前面,带 ✨ 标。所有人都能看到+收听+分享。请勿输入真人姓名 / 真公司名。
        </div>
      </motion.div>
    </motion.div>
  );
}

function PlayerView({
  script,
  onBack,
  onNavigate,
  liked,
  onLikeToggle,
}: {
  script: ScriptFull;
  onBack: () => void;
  /** Jump to the previous / next script in the currently-visible (filtered)
   *  list. Loops at the boundaries. Lets users binge through the bits
   *  without going back to the grid every time. */
  onNavigate: (direction: 'prev' | 'next') => void;
  /** v0.7.5 — has THIS IP already liked this bit. */
  liked: boolean;
  onLikeToggle: () => void;
}) {
  const [revealedChars, setRevealedChars] = useState(0);
  /** v0.9.2 — TTS playback speed (0.85 / 1.0 / 1.25). Initialized from
   *  audioUnlock module so the user's last-chosen speed survives bit
   *  navigation within the binge flow. */
  const [speed, setSpeed] = useState<number>(() => getTtsPlaybackSpeed());
  // 'fetching' = TTS request in flight; 'ready' = blob fetched but waiting
  // for a user click (Safari autoplay denial); 'playing' = audio rolling
  // (server MP3); 'browser' = playing via Web Speech API fallback (server
  // chain exhausted or 502); 'done' = audio finished; 'failed' = even the
  // browser fallback is unavailable (no SpeechSynthesis support).
  const [audioState, setAudioState] = useState<
    'fetching' | 'ready' | 'playing' | 'browser' | 'done' | 'failed'
  >('fetching');
  // v3.6.x bugfix — was a plain boolean ref that StrictMode double-mount
  // bricked: 1st effect set ref=true + started fetch; 1st cleanup set
  // cancelled=true; 2nd effect saw ref=true and bailed; 1st fetch's
  // promise resolved, found cancelled=true, dropped the result without
  // updating state → UI stuck at "正在生成真人音色…" forever in dev. Fix
  // is to key the ref by script.id so the in-flight check uses an
  // invariant the cleanup can't flip.
  const fetchedRef = useRef<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  /** End-of-audio timer for the server MP3 path — we don't have a direct
   *  'ended' hook on the shared element so we approximate using durationSec.
   *  Cleared on unmount / replay so we don't fire stale flips. */
  const endTimerRef = useRef<number | null>(null);
  const personaCfg = PERSONA_LABELS[script.persona]
    ?? { emoji: '🎤', label: script.persona, gender: 'male' as const };
  const tagCfg = TAG_LABELS[script.tag] ?? { label: script.tag, color: '#888' };

  const armEndTimer = (seconds: number) => {
    if (endTimerRef.current) window.clearTimeout(endTimerRef.current);
    endTimerRef.current = window.setTimeout(() => {
      setAudioState((s) => (s === 'playing' ? 'done' : s));
    }, Math.max(2000, seconds * 1000 + 800));
  };

  /** Fall back to the browser's Web Speech API. Returns the audioState we
   *  should land in: 'browser' on success, 'failed' if even SpeechSynthesis
   *  isn't supported (older browsers, certain in-app webviews). The voice
   *  picker uses the persona's gender hint so 御姐音 doesn't come out as a
   *  male system voice. */
  const speakBrowser = async () => {
    if (!hasBrowserTTS()) {
      setAudioState('failed');
      return;
    }
    setAudioState('browser');
    try {
      await speakViaBrowserTTS(script.text, {
        genderHint: personaCfg.gender,
        // Slightly faster than default — talkshow bits read better quickly,
        // and the browser voice tends to sound robotic when slow.
        rate: 1.15,
      });
      setAudioState('done');
    } catch {
      setAudioState('failed');
    }
  };

  // Step 1: fetch TTS once on mount. Doesn't try to play yet — Safari kills
  // play() called in an async-resolved promise that started inside a gesture.
  // We stash the blob URL and ALWAYS attempt autoplay first; if autoplay is
  // rejected we surface a "点击播放" button that retries inside a fresh click.
  // If the SERVER chain is exhausted (502 / network error), we silently fall
  // back to Web Speech so users still get a voice instead of a silent screen.
  useEffect(() => {
    // De-dup by script.id (not by a plain boolean) so StrictMode's
    // synthetic double-mount short-circuits the SECOND mount cleanly
    // without forcing the FIRST run's promise to bail.
    if (fetchedRef.current === script.id) return;
    fetchedRef.current = script.id;
    // Resetting state to 'fetching' on legitimate script switch — the
    // earlier `cancelled` closure flag is gone; staleness check now
    // uses fetchedRef.current vs. script.id at each await boundary.
    setAudioState('fetching');
    const myScriptId = script.id; // pin for staleness comparison below
    (async () => {
      try {
        const resp = await fetch('/api/talkshow/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scriptId: myScriptId }),
        });
        if (!resp.ok) {
          // Server-side TTS chain exhausted (502) or some other error.
          // Don't throw — degrade to browser TTS so the UX still has audio.
          console.warn(`[talkshow] server tts ${resp.status} — falling back to Web Speech`);
          if (fetchedRef.current === myScriptId) await speakBrowser();
          return;
        }
        const blob = await resp.blob();
        // Staleness check: only commit if the user is still on THIS script.
        if (fetchedRef.current !== myScriptId) return;
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        // Try autoplay first (works when the shared audio element was
        // unlocked by primeAudio() during the earlier click).
        const ok = await playTtsFromUrl(url);
        if (fetchedRef.current !== myScriptId) return;
        if (ok) {
          setAudioState('playing');
          armEndTimer(script.durationSec);
          // v6.31 P2 — bump talkshow_played for the achievement
          // (5-play threshold unlocks talkshow_5).
          void import('../utils/achievements').then((m) => m.bumpProgress('talkshow_played', 1));
        } else {
          // Autoplay denied. Surface an explicit play button.
          setAudioState('ready');
        }
      } catch (err) {
        console.warn('[talkshow] tts fetch errored — falling back to Web Speech', err);
        if (fetchedRef.current === myScriptId) await speakBrowser();
      }
    })();
    return () => {
      // StrictMode-safe cleanup: DO NOT flip a cancellation flag here.
      // The in-flight effect uses fetchedRef.current === script.id as its
      // staleness check, and fetchedRef gets overwritten only when the
      // script.id actually changes. So this cleanup ALWAYS leaves the
      // in-flight fetch alone for the current script.
      stopTts();
      if (endTimerRef.current) {
        window.clearTimeout(endTimerRef.current);
        endTimerRef.current = null;
      }
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
    // speakBrowser captures personaCfg/script.text but is stable per render
    // and we WANT this effect to fire only on script.id change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script.id]);

  // Step 2: explicit click-to-play retry. Runs inside a guaranteed user
  // gesture so Safari can't refuse this time around. If even THIS retry
  // fails we drop into Web Speech.
  const handleManualPlay = async () => {
    primeAudio();
    if (blobUrlRef.current) {
      const ok = await playTtsFromUrl(blobUrlRef.current);
      if (ok) {
        setAudioState('playing');
        armEndTimer(script.durationSec);
        return;
      }
    }
    // No blob (server failed) or playback still blocked → browser fallback.
    await speakBrowser();
  };

  // Cheap subtitle reveal: ~7 chars/sec while ANY audio is playing (server
  // MP3 or browser fallback). Not word-accurate, but good enough that
  // captions feel synced on first watch. v0.7.x will swap this for a real
  // audio analyser. Reset when state flips to a new playback start so a
  // replay re-runs the reveal cleanly.
  useEffect(() => {
    if (audioState !== 'playing' && audioState !== 'browser') return;
    setRevealedChars(0);
    const total = script.text.length;
    const charPerSec = total / Math.max(8, script.durationSec);
    const tickMs = 60;
    const charsPerTick = Math.max(1, charPerSec * (tickMs / 1000));
    let raw = 0;
    const id = setInterval(() => {
      raw += charsPerTick;
      const next = Math.min(total, Math.floor(raw));
      setRevealedChars(next);
      if (next >= total) clearInterval(id);
    }, tickMs);
    return () => clearInterval(id);
  }, [audioState, script.text, script.durationSec]);

  const visibleText = script.text.slice(0, revealedChars);

  /** Web Share API where supported (mobile + Safari macOS); falls back to
   *  copying a deeplink to clipboard with a one-shot toast. */
  const handleShare = async () => {
    const url = `${window.location.origin}/talkshow?id=${script.id}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `班味单口 · ${script.title}`,
          text: script.text.slice(0, 80) + '…',
          url,
        });
        return;
      }
    } catch {
      /* user cancelled — fall through to clipboard */
    }
    try {
      await navigator.clipboard.writeText(url);
      // Lightweight toast — no need to wire a global system for one button.
      const toast = document.createElement('div');
      toast.textContent = '✓ 链接已复制';
      toast.style.cssText = 'position:fixed;bottom:32px;left:50%;transform:translateX(-50%);background:rgba(15,14,46,0.95);color:#fff;padding:10px 18px;border-radius:9999px;font-size:13px;z-index:9999;border:1px solid rgba(255,255,255,0.15);box-shadow:0 8px 24px rgba(0,0,0,0.5)';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 1800);
    } catch {
      /* clipboard blocked too — silent fail, share is optional */
    }
  };

  // ── Keyboard shortcuts ───────────────────────────────────────────────
  // ← prev bit · → next bit · Esc back to grid · Space replay (when done)
  // Only bind when the player view is mounted; auto-cleanup on unmount.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore when an input/textarea has focus (user is typing)
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft')  { e.preventDefault(); onNavigate('prev'); }
      if (e.key === 'ArrowRight') { e.preventDefault(); onNavigate('next'); }
      if (e.key === 'Escape')     { e.preventDefault(); onBack(); }
      if (e.key === ' ' && audioState === 'done') {
        e.preventDefault();
        handleManualPlay();
      }
      // v0.7.5 — L heart toggle. Mirrors the heart button so binge-listeners
      // can like without leaving the keyboard.
      if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        onLikeToggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioState, script.id]);

  return (
    <motion.main
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.25 }}
      className="relative z-10 px-4 md:px-10 pb-12 max-w-3xl mx-auto"
    >
      {/* Transport bar: back · share · prev/next. Single row on desktop,
          wraps tight on mobile. Keyboard shortcuts mirror these (←/→/Esc). */}
      <div className="flex items-center justify-between mb-6 gap-2">
        <button
          onClick={onBack}
          className="text-xs tracking-wider text-white/55 hover:text-white/90 transition px-3 py-1.5 rounded"
          style={{ background: 'rgba(255,255,255,0.05)' }}
          title="Esc"
        >
          ← 返回段子库
        </button>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onNavigate('prev')}
            className="text-xs text-white/55 hover:text-white/90 transition px-3 py-1.5 rounded"
            style={{ background: 'rgba(255,255,255,0.05)' }}
            title="← 上一段"
            aria-label="上一段"
          >
            ← 上一段
          </button>
          {/* v0.7.5 — heart button. Pink fill when liked, outline otherwise.
              Count is the authoritative server count (script.likes), updated
              optimistically on tap via toggleLike. Keyboard L mirrors. */}
          <button
            onClick={onLikeToggle}
            className="text-xs transition px-3 py-1.5 rounded inline-flex items-center gap-1.5"
            style={{
              color: liked ? '#ff5588' : 'rgba(255,255,255,0.55)',
              background: liked ? 'rgba(255,85,136,0.12)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${liked ? 'rgba(255,85,136,0.45)' : 'transparent'}`,
            }}
            title={liked ? '已喜欢 (L)' : '喜欢 (L)'}
          >
            <span className="leading-none">{liked ? '❤' : '♡'}</span>
            <span className="tabular-nums">{script.likes ?? 0}</span>
          </button>
          <button
            onClick={handleShare}
            className="text-xs text-white/55 hover:text-white/90 transition px-3 py-1.5 rounded"
            style={{ background: 'rgba(255,255,255,0.05)' }}
            title="分享"
          >
            🔗 分享
          </button>
          <button
            onClick={() => onNavigate('next')}
            className="text-xs text-white/55 hover:text-white/90 transition px-3 py-1.5 rounded"
            style={{ background: 'rgba(255,255,255,0.05)' }}
            title="→ 下一段"
            aria-label="下一段"
          >
            下一段 →
          </button>
        </div>
      </div>

      {/* v0.9.2 — TTS speed picker. Persists across bit changes (state lives
          in the audioUnlock module so a 1.25× preference holds for the
          whole binge session). */}
      <div className="flex items-center justify-end gap-1.5 mb-3 text-[10px]">
        <span className="text-white/40 mr-1">语速</span>
        {([0.85, 1.0, 1.25] as const).map((rate) => (
          <button
            key={rate}
            onClick={() => { setTtsPlaybackSpeed(rate); setSpeed(rate); }}
            className="px-2 py-0.5 rounded font-bold tracking-wide transition tabular-nums"
            style={{
              color: speed === rate ? '#fff' : 'rgba(255,255,255,0.55)',
              background: speed === rate
                ? 'linear-gradient(135deg, rgba(255,85,136,0.25), rgba(124,58,237,0.18))'
                : 'rgba(255,255,255,0.04)',
              border: `1px solid ${speed === rate ? 'rgba(255,85,136,0.55)' : 'rgba(255,255,255,0.08)'}`,
            }}
            title={rate === 1.0 ? '正常' : rate < 1 ? '慢一点' : '快一点'}
          >
            {rate === 1.0 ? '1×' : `${rate}×`}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-3 text-[10px]">
        <span
          className="px-2 py-0.5 rounded-full font-bold tracking-wide"
          style={{
            color: tagCfg.color,
            background: `${tagCfg.color}18`,
            border: `1px solid ${tagCfg.color}40`,
          }}
        >
          {tagCfg.label}
        </span>
        <span className="text-white/45">{personaCfg.emoji} {personaCfg.label}</span>
        <span className="text-white/35 ml-auto">{script.durationSec}s</span>
      </div>

      <h2 className="text-2xl md:text-3xl font-black text-white mb-6 leading-tight">
        {script.title}
      </h2>

      {/* v0.9.2.1 — Avatar treatment redesigned for premium player feel:
          - Two outer rings that bloom outward in opposite phase during
            playback (Spotify-like radial pulse, but slower + more cinematic)
          - Inner gradient disc with glassy specular highlight on top
          - 5-bar EQ overlay below the emoji during active playback
          - When fetching, an indeterminate progress arc spins around the
            outer ring instead of bland "⏳" text
          v0.7.x will swap the emoji for an AI portrait, but the framing
          stays. */}
      <div className="flex justify-center mb-6">
        <div className="relative w-44 h-44 grid place-items-center">
          {/* Bloom rings — opposite phase so the glow "breathes" continuously. */}
          {(audioState === 'playing' || audioState === 'browser') && (
            <>
              <motion.div
                aria-hidden
                className="absolute inset-0 rounded-full"
                animate={{ scale: [1, 1.18, 1], opacity: [0.55, 0, 0.55] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
                style={{
                  background:
                    'radial-gradient(circle at center, rgba(255,85,136,0.30) 0%, rgba(124,58,237,0.10) 55%, transparent 70%)',
                }}
              />
              <motion.div
                aria-hidden
                className="absolute inset-0 rounded-full"
                animate={{ scale: [1, 1.32, 1], opacity: [0, 0.42, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut', delay: 1.2 }}
                style={{
                  background:
                    'radial-gradient(circle at center, rgba(255,85,136,0.25) 0%, transparent 60%)',
                }}
              />
            </>
          )}

          {/* Indeterminate spinner ring during fetching — replaces the
              emoji-pulse loading affordance with something that says
              "we're generating your voice right now". */}
          {audioState === 'fetching' && (
            <motion.div
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{
                border: '2px solid rgba(255,85,136,0.18)',
                borderTopColor: '#ff5588',
                borderRightColor: 'rgba(124,58,237,0.55)',
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
            />
          )}

          {/* Avatar disc — a touch bigger (128 → 144) and richer gradient.
              The inner specular highlight (top-left arc) gives it glass
              depth. Subtle "floaty" drift when idle so the screen never
              feels frozen. */}
          <motion.div
            animate={
              (audioState === 'playing' || audioState === 'browser')
                ? { scale: [1, 1.04, 1], y: 0 }
                : audioState === 'fetching'
                  ? { scale: 0.92, y: 0 }
                  : { scale: 1, y: [0, -3, 0] }
            }
            transition={{
              duration: (audioState === 'playing' || audioState === 'browser') ? 0.9 : 4.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="relative w-36 h-36 rounded-full flex items-center justify-center text-6xl select-none overflow-hidden"
            style={{
              background:
                'radial-gradient(circle at 32% 28%, rgba(255,255,255,0.35), transparent 35%), linear-gradient(135deg, #ff5588 0%, #7c3aed 100%)',
              boxShadow:
                '0 0 50px rgba(255,85,136,0.45), inset 0 2px 0 rgba(255,255,255,0.18), inset 0 -8px 24px rgba(0,0,0,0.18)',
            }}
          >
            {/* v5.1.0 — AI-generated portrait. Emoji absolutely-positioned
                behind so it shows through if the image 404s (legacy
                fallback) AND survives momentary load lag. The img is
                full-disc cover-crop so the character fills the circle. */}
            <span className="absolute inset-0 flex items-center justify-center text-6xl pointer-events-none"
              aria-hidden>
              {personaCfg.emoji}
            </span>
            <img
              src={personaCfg.imageUrl}
              alt={personaCfg.label}
              className="absolute inset-0 w-full h-full object-cover"
              draggable={false}
              onError={(e) => {
                // Hide on 404 so the emoji fallback (sitting in the same
                // bounding box behind us) shows through.
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
            {/* EQ bars overlay — bottom-center, sits inside the disc so
                it reads as "the avatar is the source of the sound". */}
            {(audioState === 'playing' || audioState === 'browser') && (
              <span className="absolute bottom-3.5 left-1/2 -translate-x-1/2 z-10">
                <WaveformBars active={true} count={5} height={14} />
              </span>
            )}
          </motion.div>
        </div>
      </div>

      {audioState === 'fetching' && (
        <div className="text-center text-white/65 mb-4 text-sm flex items-center justify-center gap-2">
          <WaveformBars active={true} count={3} height={12} />
          <span>正在生成真人音色…</span>
        </div>
      )}
      {audioState === 'ready' && (
        <div className="text-center mb-4">
          <button
            onClick={handleManualPlay}
            className="px-5 py-2.5 rounded-xl text-sm font-bold tracking-wide"
            style={{
              background: 'linear-gradient(135deg,#ff5588,#7c3aed)',
              color: '#fff',
              boxShadow: '0 6px 18px rgba(255,85,136,0.45)',
            }}
          >
            🔊 点击播放
          </button>
          <div className="text-[11px] text-white/50 mt-2">
            浏览器拦了自动播放,点一下就好
          </div>
        </div>
      )}
      {audioState === 'browser' && (
        <div className="text-center text-cyan-300/80 text-[11px] mb-4">
          🤖 真人音色配额用完了,临时用浏览器系统音替播
        </div>
      )}
      {audioState === 'done' && (
        <div className="flex justify-center gap-2 mb-4">
          <button
            onClick={handleManualPlay}
            className="px-4 py-2 rounded-xl text-xs font-semibold tracking-wide text-white/80 transition"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
            title="Space"
          >
            ↻ 再听一遍
          </button>
          <button
            onClick={() => onNavigate('next')}
            className="px-5 py-2 rounded-xl text-xs font-bold tracking-wide text-white shadow-lg"
            style={{
              background: 'linear-gradient(135deg,#ff5588,#7c3aed)',
              boxShadow: '0 6px 18px rgba(255,85,136,0.4)',
            }}
            title="→"
          >
            下一段 →
          </button>
        </div>
      )}
      {audioState === 'failed' && (
        <div className="text-center text-amber-400 mb-4 text-sm">
          ⚠️ 音色和系统音都不可用 · 纯文字模式
        </div>
      )}

      {/* Subtitle bubble — reveal-as-you-listen during ANY active playback
          (server MP3 or browser TTS). On 'failed', 'ready', 'fetching', or
          'done' we just dump the full text so users can always read. */}
      <div
        className="rounded-2xl p-5 md:p-6 text-base md:text-lg leading-relaxed text-white/90 min-h-[140px]"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.10)',
          backdropFilter: 'blur(8px)',
        }}
      >
        {(audioState === 'playing' || audioState === 'browser') ? (
          <>
            {visibleText}
            {revealedChars < script.text.length && (
              <span className="inline-block w-0.5 h-5 bg-white/70 ml-0.5 animate-pulse align-middle" />
            )}
          </>
        ) : (
          script.text
        )}
      </div>
    </motion.main>
  );
}

/**
 * v6.15 P3 — UgcInlineCard. Renders an approved user-submitted segment
 * inline in the Talkshow grid every 5 AI cards. Visually distinct from
 * ScriptCard (pink border + 用户投稿 badge) so users immediately register
 * "this came from another person, not from an AI rat". Click → jumps to
 * /talkshow/ugc for full reading + like + submission UI.
 */
function UgcInlineCard({
  entry,
  onSelect,
}: {
  entry: {
    id: string; title: string; text: string; tag: string;
    region?: string; likes: number; createdAt: number;
  };
  onSelect: () => void;
}) {
  return (
    <motion.button
      onClick={onSelect}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      className="text-left rounded-2xl p-4 transition flex flex-col gap-3 min-h-[140px] relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(255,79,163,0.10), rgba(176,134,255,0.06))',
        border: '1px solid rgba(255,79,163,0.35)',
        boxShadow: '0 0 16px rgba(255,79,163,0.12)',
      }}
    >
      {/* 用户投稿 badge top-right */}
      <span style={{
        position: 'absolute', top: 10, right: 10,
        fontSize: 9, padding: '2px 6px', borderRadius: 999,
        background: 'rgba(255,79,163,0.22)', color: '#FF4FA3',
        border: '1px solid rgba(255,79,163,0.55)', fontWeight: 800,
        letterSpacing: '0.06em',
      }}>👥 用户投稿</span>

      <div className="text-sm font-black text-white truncate pr-20">
        {entry.title}
      </div>
      <div className="text-xs leading-relaxed text-white/75"
        style={{
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
        }}>
        {entry.text}
      </div>

      <div className="mt-auto flex items-center gap-3 text-[11px] font-bold">
        <span style={{ color: '#FF4FA3' }}>❤ {entry.likes}</span>
        <span style={{ color: 'rgba(248,244,227,0.55)' }}>{entry.tag}{entry.region ? ` · ${entry.region}` : ''}</span>
        <span style={{ marginLeft: 'auto', color: '#FFD700' }}>→ 看全部精选</span>
      </div>
    </motion.button>
  );
}
