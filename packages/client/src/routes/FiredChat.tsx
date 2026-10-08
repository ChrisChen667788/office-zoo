import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useFiredStore, type FiredMessage, type FiredScores } from '../stores/firedStore';
import { SCENARIOS as SHARED_SCENARIOS } from '@furball/shared';
import { uid as genId } from '../utils/uid';
import { getUserId } from '../utils/userId';

const PERSONALITY_LABELS: Record<string, string> = {
  rookie: '菜鸟HR',
  veteran: '老油条HR',
  demon: '魔鬼HR',
};

/* ------------------------------------------------------------------ */
/*  Score dimension labels                                             */
/* ------------------------------------------------------------------ */

const SCORE_DIMENSIONS: Array<{ key: keyof FiredScores; label: string; shortLabel: string; color: string }> = [
  { key: 'legalKnowledge', label: '法律知识', shortLabel: '法律', color: '#4c9eff' },
  { key: 'negotiationSkill', label: '谈判技巧', shortLabel: '谈判', color: '#ff8a4c' },
  { key: 'emotionalControl', label: '情绪控制', shortLabel: '情绪', color: '#9cff57' },
  { key: 'evidenceAwareness', label: '证据意识', shortLabel: '证据', color: '#a855f7' },
];

/* ------------------------------------------------------------------ */
/*  API helpers                                                        */
/* ------------------------------------------------------------------ */

// Relative URL — Vite proxies /api → :3100 in dev (vite.config.ts), and
// in prod the server serves the static client from the same origin so no
// cross-port traffic happens. Was previously hardcoded to
// `http://${hostname}:3100/api/fired` which broke HTTPS deploys (mixed
// content) and any reverse-proxied setup that doesn't expose port 3100.
const API_BASE = '/api/fired';
const REQUEST_TIMEOUT_MS = 30000;
const MAX_ROUNDS = 10;

/** Filter to only user/hr messages for the server API */
function toChatMessages(msgs: FiredMessage[]) {
  return msgs
    .filter((m) => m.role === 'user' || m.role === 'hr')
    .map((m) => ({ role: m.role, content: m.content }));
}

/** fetch with automatic 30s timeout, plus an optional externally-provided signal. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  externalSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), REQUEST_TIMEOUT_MS);
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort('external');
    else externalSignal.addEventListener('abort', () => controller.abort('external'), { once: true });
  }
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function sendChat(
  body: {
    scenarioId: string;
    personalityId: string;
    messages: FiredMessage[];
    userMessage: string;
  },
  signal?: AbortSignal,
) {
  const res = await fetchWithTimeout(
    `${API_BASE}/chat`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // v0.8.2 — pseudonymous id so the server can pull this user's
        // PRIOR scenario memories and inject them into the HR system
        // prompt for pre-empting repeated tactics.
        'X-User-Id': getUserId(),
      },
      body: JSON.stringify({
        scenarioId: body.scenarioId,
        personalityId: body.personalityId,
        messages: toChatMessages(body.messages),
      }),
    },
    signal,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchSuggestions(
  body: {
    scenarioId: string;
    personalityId: string;
    messages: FiredMessage[];
  },
  signal?: AbortSignal,
) {
  const res = await fetchWithTimeout(
    `${API_BASE}/suggest`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // v0.8.2 — same memory id as /chat. Suggestions are colocated
        // server-side so eventually we'll want them memory-aware too.
        'X-User-Id': getUserId(),
      },
      body: JSON.stringify({
        scenarioId: body.scenarioId,
        messages: toChatMessages(body.messages),
      }),
    },
    signal,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function FiredChat() {
  const navigate = useNavigate();
  const {
    scenarioId,
    personalityId,
    messages,
    isLoading,
    isOver,
    currentScores,
    suggestions,
    addMessage,
    setLoading,
    setSuggestions,
    updateScores,
    setOutcome,
    setIsOver,
  } = useFiredStore();

  const [inputText, setInputText] = useState('');
  const [keyMomentFlash, setKeyMomentFlash] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  /** v1.3.2 — when the user has a quiz profile, the server returns
   *  archetypeContext on every /chat response. We surface it as a one-shot
   *  banner under the header so the user knows the HR is reading their
   *  archetype. Set on first /chat response, persists for the round. */
  const [archetypeNotice, setArchetypeNotice] = useState<{
    name: string; emoji: string; aggressiveness: 'subtle' | 'medium' | 'full';
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const greetingSent = useRef(false);
  const inflightRef = useRef<AbortController | null>(null);

  /** How many user messages have been sent — drives the round counter. */
  const userTurnCount = useMemo(
    () => messages.filter((m) => m.role === 'user').length,
    [messages],
  );

  // Redirect if no scenario selected
  useEffect(() => {
    if (!scenarioId) {
      navigate('/fired');
    }
  }, [scenarioId, navigate]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Abort any inflight request when navigating away
  useEffect(() => {
    return () => {
      inflightRef.current?.abort();
    };
  }, []);

  // Initial HR greeting (guard against StrictMode double-fire)
  useEffect(() => {
    if (scenarioId && messages.length === 0 && !greetingSent.current) {
      greetingSent.current = true;
      handleInitialGreeting();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioId]);

  const handleInitialGreeting = async () => {
    setLoading(true);
    const controller = new AbortController();
    inflightRef.current = controller;
    try {
      const data = await sendChat(
        {
          scenarioId: scenarioId!,
          personalityId,
          messages: [],
          userMessage: '__INIT__',
        },
        controller.signal,
      );
      if (data.hrMessage) {
        const hrMsg: FiredMessage = {
          id: genId(),
          role: 'hr',
          content: data.hrMessage,
          timestamp: Date.now(),
          scores: data.scores,
          keyMoment: data.keyMoment,
        };
        addMessage(hrMsg);
        if (data.scores) updateScores(data.scores);
        if (data.keyMoment) flashKeyMoment(data.keyMoment);
      }
      // v1.3.2 — surface archetype notice on first turn so the user knows
      // HR is using their personality profile. Skipped silently for
      // anonymous users (no profile = no archetypeContext on response).
      if (data.archetypeContext && !archetypeNotice) {
        setArchetypeNotice(data.archetypeContext);
      }
      if (data.lawyerTip) {
        addMessage({ id: genId(), role: 'lawyer', content: data.lawyerTip, timestamp: Date.now() });
      }
      if (data.suggestions) setSuggestions(data.suggestions);
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError' || controller.signal.reason !== 'external') {
        const isTimeout = controller.signal.reason === 'timeout';
        addMessage({
          id: genId(),
          role: 'system',
          content: isTimeout
            ? '请求超时(30秒),可能网络不佳或服务器繁忙。'
            : '连接服务器失败,请检查后端是否运行。',
          timestamp: Date.now(),
          retryAction: 'init',
        });
        // Allow greeting to fire again on manual retry
        greetingSent.current = false;
      }
    }
    if (inflightRef.current === controller) inflightRef.current = null;
    setLoading(false);
  };

  const flashKeyMoment = (text: string) => {
    setKeyMomentFlash(text);
    setTimeout(() => setKeyMomentFlash(null), 3000);
  };

  const handleSend = useCallback(
    async (text?: string) => {
      const msg = text || inputText.trim();
      if (!msg || isLoading || isOver) return;

      const userMsg: FiredMessage = {
        id: genId(),
        role: 'user',
        content: msg,
        timestamp: Date.now(),
      };
      addMessage(userMsg);
      setInputText('');
      setLoading(true);
      setSuggestions([]);

      const controller = new AbortController();
      inflightRef.current = controller;

      try {
        const data = await sendChat(
          {
            scenarioId: scenarioId!,
            personalityId,
            messages: [...messages, userMsg],
            userMessage: msg,
          },
          controller.signal,
        );

        if (data.hrMessage) {
          const hrMsg: FiredMessage = {
            id: genId(),
            role: 'hr',
            content: data.hrMessage,
            timestamp: Date.now(),
            scores: data.scores,
            keyMoment: data.keyMoment,
          };
          addMessage(hrMsg);
          if (data.scores) updateScores(data.scores);
          if (data.keyMoment) flashKeyMoment(data.keyMoment);
        }

        if (data.lawyerTip) {
          addMessage({ id: genId(), role: 'lawyer', content: data.lawyerTip, timestamp: Date.now() });
        }

        if (data.isOver) {
          setIsOver(true);
          if (data.outcome) setOutcome(data.outcome);
          setTimeout(() => navigate('/fired/result'), 2000);
        } else {
          // Fetch new suggestions (best-effort — don't block main flow)
          try {
            const sugData = await fetchSuggestions(
              {
                scenarioId: scenarioId!,
                personalityId,
                messages: [
                  ...messages,
                  userMsg,
                  ...(data.hrMessage
                    ? [{
                        id: genId(),
                        role: 'hr' as const,
                        content: data.hrMessage,
                        timestamp: Date.now(),
                      }]
                    : []),
                ],
              },
              controller.signal,
            );
            if (sugData.suggestions) setSuggestions(sugData.suggestions);
          } catch {
            // Suggestions are optional, don't block
          }
        }
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError' || controller.signal.reason !== 'external') {
          const isTimeout = controller.signal.reason === 'timeout';
          addMessage({
            id: genId(),
            role: 'system',
            content: isTimeout ? '请求超时(30秒),请点击重试。' : '发送失败,请点击重试。',
            timestamp: Date.now(),
            retryAction: { type: 'send', text: msg },
          });
        }
      }

      if (inflightRef.current === controller) inflightRef.current = null;
      setLoading(false);
      inputRef.current?.focus();
    },
    [
      inputText, isLoading, isOver, scenarioId, personalityId, messages,
      addMessage, setLoading, setSuggestions, updateScores, setOutcome, setIsOver, navigate,
    ],
  );

  /** Retry a failed request. Called by the retry button on system error messages. */
  const handleRetry = useCallback(
    (action: FiredMessage['retryAction']) => {
      if (!action || isLoading) return;
      if (action === 'init') {
        greetingSent.current = true;
        handleInitialGreeting();
      } else if (typeof action === 'object' && action.type === 'send') {
        handleSend(action.text);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isLoading, handleSend],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const scenarioInfo = useMemo(() => {
    if (!scenarioId) return null;
    const s = SHARED_SCENARIOS.find((sc) => sc.id === scenarioId);
    return s ? { title: s.title, emoji: s.emoji, description: s.description } : null;
  }, [scenarioId]);

  /* ---- Shared right-panel content (desktop panel + mobile drawer) ---- */
  const PanelContent = () => (
    <>
      {/* Scenario info card */}
      {scenarioInfo && (
        <div
          className="mx-4 mt-4 p-4 rounded-2xl"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,68,68,0.15)',
            backdropFilter: 'blur(20px)',
          }}
        >
          {/* v6.99 — HR 反派立绘:一眼看清你在跟哪档黑心 HR 谈(菜鸟/老油条/魔鬼)。
              直接 <img>,立绘未生成/404 时 onError 隐藏 → 露出 emoji 兜底。 */}
          <div className="flex items-center gap-3 mb-3 pb-3" style={{ borderBottom: '1px solid rgba(255,68,68,0.12)' }}>
            <div className="relative w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0"
              style={{ border: '1px solid rgba(255,68,68,0.4)', boxShadow: '0 0 18px rgba(255,68,68,0.28)' }}>
              <span className="absolute inset-0 flex items-center justify-center text-2xl" aria-hidden>🧑‍💼</span>
              <img
                src={`/fired-hr-portraits/${personalityId}.png`}
                alt={PERSONALITY_LABELS[personalityId]}
                className="absolute inset-0 w-full h-full object-cover"
                draggable={false}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
            <div>
              <div className="text-[9px] tracking-[0.22em] uppercase" style={{ color: 'rgba(255,68,68,0.7)' }}>对面 HR · BOSS</div>
              <div className="text-sm font-black" style={{ color: '#FF6B35' }}>{PERSONALITY_LABELS[personalityId]}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">{scenarioInfo.emoji}</span>
            <div>
              <h3 className="text-sm font-bold" style={{ color: '#FF6B35' }}>
                {scenarioInfo.title}
              </h3>
              <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                {PERSONALITY_LABELS[personalityId]}
              </p>
            </div>
          </div>
          <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {scenarioInfo.description}
          </p>
        </div>
      )}

      {/* Score bars */}
      <div
        className="mx-4 mt-4 p-4 rounded-2xl"
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          backdropFilter: 'blur(20px)',
        }}
      >
        <h4
          className="text-xs font-bold tracking-wider uppercase mb-4"
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          实时评分
        </h4>
        <div className="space-y-3">
          {SCORE_DIMENSIONS.map((dim) => (
            <div key={dim.key}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {dim.label}
                </span>
                <span className="text-[11px] font-bold" style={{ color: dim.color }}>
                  {currentScores[dim.key]}
                </span>
              </div>
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.05)' }}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: dim.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${currentScores[dim.key]}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Suggestions panel */}
      <div
        className="mx-4 mt-4 mb-4 p-4 rounded-2xl"
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          backdropFilter: 'blur(20px)',
        }}
      >
        <h4
          className="text-xs font-bold tracking-wider uppercase mb-3"
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          策略建议
        </h4>
        {suggestions.length === 0 && !isLoading && (
          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
            等待对话开始...
          </p>
        )}
        <div className="space-y-2">
          {suggestions.map((sug, idx) => {
            const icon =
              sug.style === 'aggressive'
                ? '\uD83D\uDD25'
                : sug.style === 'calm'
                  ? '\uD83D\uDE0C'
                  : '\u2696\uFE0F';
            const label =
              sug.style === 'aggressive'
                ? '强硬回击'
                : sug.style === 'calm'
                  ? '以退为进'
                  : '依法维权';
            return (
              <motion.div
                key={idx}
                className="p-3 rounded-xl cursor-pointer"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)',
                }}
                whileHover={{
                  background: 'rgba(255,255,255,0.05)',
                  borderColor: 'rgba(255,255,255,0.12)',
                }}
                onClick={() => { handleSend(sug.text); setShowPanel(false); }}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-sm">{icon}</span>
                  <span className="text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {label}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  {sug.text}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </>
  );

  return (
    <div
      className="relative h-screen flex overflow-hidden noise"
      style={{ background: '#050510' }}
    >
      {/* Ambient heat aurora — very subtle, just tints the page. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="aurora"
          style={{
            top: '-30%',
            left: '-15%',
            width: '60vmax',
            height: '60vmax',
            ['--c' as never]: 'rgba(255, 51, 85, 0.28)',
            opacity: 0.35,
          }}
        />
        <div
          className="aurora"
          style={{
            bottom: '-25%',
            right: '-10%',
            width: '50vmax',
            height: '50vmax',
            ['--c' as never]: 'rgba(255, 138, 76, 0.22)',
            opacity: 0.3,
          }}
        />
      </div>

      {/* Key moment flash banner */}
      <AnimatePresence>
        {keyMomentFlash && (
          <motion.div
            className="absolute top-0 left-0 right-0 z-50 py-3 px-6 text-center text-sm font-bold"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(255,200,0,0.15), transparent)',
              color: '#fbbf24',
              borderBottom: '1px solid rgba(255,200,0,0.3)',
            }}
            initial={{ opacity: 0, y: -40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            transition={{ duration: 0.4 }}
          >
            <span className="mr-2">&#9888;</span> 关键时刻: {keyMomentFlash}
          </motion.div>
        )}
      </AnimatePresence>

      {/* LEFT: Chat area (full width on mobile, 60% on desktop) */}
      <div className="relative z-10 flex-1 md:flex-[3] flex flex-col min-w-0">
        {/* Chat header */}
        <div
          className="flex items-center gap-3 px-4 md:px-6 py-4 shrink-0 backdrop-blur-xl"
          style={{
            background: 'rgba(6,6,18,0.55)',
            borderBottom: '1px solid rgba(255,51,85,0.14)',
          }}
        >
          <motion.button
            onClick={() => navigate('/fired')}
            className="text-xs px-3 py-1.5 rounded-lg tracking-wider"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.65)',
            }}
            whileHover={{ scale: 1.04, borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.95)' }}
            whileTap={{ scale: 0.96 }}
          >
            ← 退出
          </motion.button>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold truncate tracking-tight" style={{ color: 'rgba(255,255,255,0.92)' }}>
              {scenarioInfo?.emoji} {scenarioInfo?.title}
            </h2>
            <p className="text-[11px] tracking-wide flex items-center gap-1.5 flex-wrap" style={{ color: 'rgba(255,255,255,0.45)' }}>
              <span>对手 · {PERSONALITY_LABELS[personalityId]}</span>
              {/* v1.3.2 — archetype recognition pill. Pink = full PUA
                  (demon), purple = medium (veteran), grey = subtle (rookie). */}
              {archetypeNotice && (
                <span
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold tracking-wide"
                  title={archetypeNotice.aggressiveness === 'full'
                    ? 'HR 已读取你的人事档案,会针对性 PUA'
                    : archetypeNotice.aggressiveness === 'medium'
                      ? 'HR 看过你的档案,可能利用你的性格'
                      : 'HR 大概看了一眼你的档案'}
                  style={{
                    color: archetypeNotice.aggressiveness === 'full' ? '#ff5588'
                         : archetypeNotice.aggressiveness === 'medium' ? '#a855f7'
                         : 'rgba(255,255,255,0.65)',
                    background: archetypeNotice.aggressiveness === 'full' ? 'rgba(255,85,136,0.14)'
                              : archetypeNotice.aggressiveness === 'medium' ? 'rgba(168,85,247,0.14)'
                              : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${archetypeNotice.aggressiveness === 'full' ? 'rgba(255,85,136,0.45)'
                            : archetypeNotice.aggressiveness === 'medium' ? 'rgba(168,85,247,0.40)'
                            : 'rgba(255,255,255,0.10)'}`,
                  }}
                >
                  🧠 HR 看了你 · {archetypeNotice.emoji}{archetypeNotice.name}
                </span>
              )}
            </p>
          </div>

          {/* Round counter chip */}
          <div
            className="shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wider tabular-nums"
            style={{
              background: userTurnCount >= MAX_ROUNDS - 2
                ? 'rgba(255,51,85,0.14)'
                : 'rgba(255,255,255,0.04)',
              border: `1px solid ${
                userTurnCount >= MAX_ROUNDS - 2
                  ? 'rgba(255,51,85,0.4)'
                  : 'rgba(255,255,255,0.08)'
              }`,
              color: userTurnCount >= MAX_ROUNDS - 2
                ? '#ff8a4c'
                : 'rgba(255,255,255,0.7)',
            }}
            title={`已进行 ${userTurnCount} 轮 / 共 ${MAX_ROUNDS} 轮`}
          >
            第 {Math.min(userTurnCount, MAX_ROUNDS)} / {MAX_ROUNDS} 轮
          </div>
        </div>

        {/* Mobile score HUD — hidden on desktop */}
        <div
          className="flex md:hidden items-center gap-2 px-4 py-2 shrink-0 overflow-x-auto"
          style={{
            background: 'rgba(0,0,0,0.25)',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          {SCORE_DIMENSIONS.map((dim, i) => (
            <div key={dim.key} className="flex items-center gap-1 shrink-0">
              {i > 0 && (
                <span className="text-[10px] mx-1" style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
              )}
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                {dim.shortLabel}
              </span>
              <span className="text-[10px] font-bold ml-0.5" style={{ color: dim.color }}>
                {currentScores[dim.key]}
              </span>
            </div>
          ))}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-4">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onRetry={handleRetry}
                isLoading={isLoading}
              />
            ))}
          </AnimatePresence>

          {/* Loading indicator */}
          {isLoading && (
            <motion.div
              className="flex items-center gap-2 px-4 py-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-2 h-2 rounded-full"
                    style={{ background: '#FF4444' }}
                    animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      delay: i * 0.2,
                    }}
                  />
                ))}
              </div>
              <span className="text-xs" style={{ color: 'rgba(255,68,68,0.6)' }}>
                HR正在思考...
              </span>
            </motion.div>
          )}

          {/* Game over message */}
          {isOver && (
            <motion.div
              className="text-center py-4"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <p className="text-lg font-bold" style={{ color: '#FF6B35' }}>
                谈判结束
              </p>
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                正在生成结果...
              </p>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div
          className="shrink-0 px-4 md:px-6 py-4 backdrop-blur-xl"
          style={{
            background: 'rgba(6,6,18,0.55)',
            borderTop: '1px solid rgba(255,51,85,0.14)',
            paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
          }}
        >
          {/* Mobile suggestion chips — shown inline above input, hidden on desktop */}
          <AnimatePresence>
            {suggestions.length > 0 && !isOver && (
              <motion.div
                className="flex md:hidden flex-wrap gap-2 mb-3"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
              >
                {suggestions.map((sug, idx) => {
                  const styleIcon =
                    sug.style === 'aggressive'
                      ? '\uD83D\uDD25'
                      : sug.style === 'calm'
                        ? '\uD83D\uDE0C'
                        : '\u2696\uFE0F';
                  const borderColor =
                    sug.style === 'aggressive'
                      ? 'rgba(255,68,68,0.4)'
                      : sug.style === 'calm'
                        ? 'rgba(34,197,94,0.4)'
                        : 'rgba(59,130,246,0.4)';
                  return (
                    <motion.button
                      key={idx}
                      onClick={() => handleSend(sug.text)}
                      disabled={isLoading}
                      className="px-3 py-1.5 rounded-xl text-xs text-left max-w-[220px] truncate disabled:opacity-50"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: `1px solid ${borderColor}`,
                        color: 'rgba(255,255,255,0.7)',
                        backdropFilter: 'blur(10px)',
                      }}
                      whileTap={{ scale: 0.96 }}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.08 }}
                    >
                      {styleIcon} {sug.text}
                    </motion.button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Desktop suggestion buttons — hidden on mobile */}
          <AnimatePresence>
            {suggestions.length > 0 && !isOver && (
              <motion.div
                className="hidden md:flex flex-wrap gap-2 mb-3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
              >
                {suggestions.map((sug, idx) => {
                  const styleIcon =
                    sug.style === 'aggressive'
                      ? '\uD83D\uDD25'
                      : sug.style === 'calm'
                        ? '\uD83D\uDE0C'
                        : '\u2696\uFE0F';
                  const borderColor =
                    sug.style === 'aggressive'
                      ? 'rgba(255,68,68,0.4)'
                      : sug.style === 'calm'
                        ? 'rgba(34,197,94,0.4)'
                        : 'rgba(59,130,246,0.4)';
                  return (
                    <motion.button
                      key={idx}
                      onClick={() => handleSend(sug.text)}
                      disabled={isLoading}
                      className="px-3 py-2 rounded-xl text-xs text-left max-w-[280px] truncate disabled:opacity-50"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: `1px solid ${borderColor}`,
                        color: 'rgba(255,255,255,0.7)',
                        backdropFilter: 'blur(10px)',
                      }}
                      whileHover={{ scale: 1.02, background: 'rgba(255,255,255,0.06)' }}
                      whileTap={{ scale: 0.98 }}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.1 }}
                    >
                      {styleIcon} {sug.text}
                    </motion.button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Text input */}
          <div className="flex gap-3">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading || isOver}
              placeholder={isOver ? '谈判已结束' : '输入你的回应...'}
              className="flex-1 px-4 py-3 rounded-xl text-sm outline-none transition disabled:opacity-40 focus:border-white/25"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.92)',
                backdropFilter: 'blur(12px)',
              }}
            />
            <motion.button
              onClick={() => handleSend()}
              disabled={isLoading || isOver || !inputText.trim()}
              className="px-6 py-3 rounded-xl text-sm font-semibold tracking-wide disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #ff3355 0%, #ff8a4c 100%)',
                color: '#fff',
                boxShadow: '0 6px 24px rgba(255,51,85,0.3), inset 0 1px 0 rgba(255,255,255,0.16)',
              }}
              whileHover={
                !isLoading && !isOver && inputText.trim()
                  ? { scale: 1.03, y: -1 }
                  : {}
              }
              whileTap={
                !isLoading && !isOver && inputText.trim()
                  ? { scale: 0.97 }
                  : {}
              }
            >
              发送 →
            </motion.button>
          </div>
        </div>
      </div>

      {/* RIGHT: Info panel (40%) — desktop only */}
      <div
        className="relative z-10 hidden md:flex flex-[2] flex-col border-l min-w-0 overflow-y-auto"
        style={{
          borderColor: 'rgba(255,51,85,0.12)',
          background: 'rgba(6,6,18,0.35)',
          backdropFilter: 'blur(16px)',
        }}
      >
        {/* Scenario info card */}
        {scenarioInfo && (
          <div
            className="mx-4 mt-4 p-4 rounded-2xl"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,68,68,0.15)',
              backdropFilter: 'blur(20px)',
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{scenarioInfo.emoji}</span>
              <div>
                <h3 className="text-sm font-bold" style={{ color: '#FF6B35' }}>
                  {scenarioInfo.title}
                </h3>
                <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  {PERSONALITY_LABELS[personalityId]}
                </p>
              </div>
            </div>
            <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {scenarioInfo.description}
            </p>
          </div>
        )}

        {/* Score bars */}
        <div
          className="mx-4 mt-4 p-4 rounded-2xl"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            backdropFilter: 'blur(20px)',
          }}
        >
          <h4
            className="text-xs font-bold tracking-wider uppercase mb-4"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            实时评分
          </h4>
          <div className="space-y-3">
            {SCORE_DIMENSIONS.map((dim) => (
              <div key={dim.key}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {dim.label}
                  </span>
                  <span className="text-[11px] font-bold" style={{ color: dim.color }}>
                    {currentScores[dim.key]}
                  </span>
                </div>
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.05)' }}
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: dim.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${currentScores[dim.key]}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Suggestions panel */}
        <div
          className="mx-4 mt-4 mb-4 p-4 rounded-2xl flex-1"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            backdropFilter: 'blur(20px)',
          }}
        >
          <h4
            className="text-xs font-bold tracking-wider uppercase mb-3"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            策略建议
          </h4>
          {suggestions.length === 0 && !isLoading && (
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
              等待对话开始...
            </p>
          )}
          <div className="space-y-2">
            {suggestions.map((sug, idx) => {
              const icon =
                sug.style === 'aggressive'
                  ? '\uD83D\uDD25'
                  : sug.style === 'calm'
                    ? '\uD83D\uDE0C'
                    : '\u2696\uFE0F';
              const label =
                sug.style === 'aggressive'
                  ? '强硬回击'
                  : sug.style === 'calm'
                    ? '以退为进'
                    : '依法维权';
              return (
                <motion.div
                  key={idx}
                  className="p-3 rounded-xl cursor-pointer"
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}
                  whileHover={{
                    background: 'rgba(255,255,255,0.05)',
                    borderColor: 'rgba(255,255,255,0.12)',
                  }}
                  onClick={() => handleSend(sug.text)}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-sm">{icon}</span>
                    <span className="text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      {label}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
                    {sug.text}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      {/* MOBILE: Floating toggle button for bottom-drawer panel */}
      <motion.button
        onClick={() => setShowPanel(true)}
        className="md:hidden fixed z-40 rounded-full flex items-center justify-center"
        style={{
          right: 16,
          bottom: 'calc(env(safe-area-inset-bottom) + 92px)',
          width: 48,
          height: 48,
          background: 'linear-gradient(135deg, rgba(255,68,68,0.85), rgba(255,107,53,0.85))',
          border: '1px solid rgba(255,255,255,0.2)',
          color: '#fff',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
        }}
        whileTap={{ scale: 0.9 }}
        whileHover={{ scale: 1.05 }}
        aria-label="打开场景/评分面板"
      >
        <span className="text-xl" aria-hidden>
          &#x1F4CA;
        </span>
      </motion.button>

      {/* MOBILE: Bottom-sheet drawer */}
      <AnimatePresence>
        {showPanel && (
          <>
            {/* Backdrop */}
            <motion.div
              className="md:hidden fixed inset-0 z-40"
              style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setShowPanel(false)}
            />
            {/* Drawer */}
            <motion.div
              className="md:hidden fixed left-0 right-0 bottom-0 z-50 flex flex-col overflow-hidden rounded-t-3xl"
              style={{
                maxHeight: '82vh',
                background: 'linear-gradient(180deg, #1a0d0b 0%, #120807 100%)',
                borderTop: '1px solid rgba(255,68,68,0.25)',
                paddingBottom: 'env(safe-area-inset-bottom)',
              }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            >
              {/* Grabber handle + close */}
              <div className="flex items-center justify-between px-4 pt-3 pb-1 shrink-0">
                <div
                  className="mx-auto w-10 h-1 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.2)' }}
                />
              </div>
              <div
                className="flex items-center justify-between px-4 pb-3 shrink-0"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
              >
                <span className="text-xs font-bold tracking-wider" style={{ color: '#FF6B35' }}>
                  场景 · 评分 · 建议
                </span>
                <button
                  onClick={() => setShowPanel(false)}
                  className="text-xs px-2 py-1 rounded-lg"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.6)',
                  }}
                >
                  关闭
                </button>
              </div>
              <div className="flex-1 overflow-y-auto pb-2">
                <PanelContent />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Message Bubble                                                     */
/* ------------------------------------------------------------------ */

interface MessageBubbleProps {
  message: FiredMessage;
  onRetry?: (action: FiredMessage['retryAction']) => void;
  isLoading?: boolean;
}

function MessageBubble({ message, onRetry, isLoading }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isHR = message.role === 'hr';
  const isLawyer = message.role === 'lawyer';
  const isSystem = message.role === 'system';

  let borderColor = 'rgba(255,255,255,0.06)';
  let bgColor = 'rgba(255,255,255,0.02)';
  let textColor = 'rgba(255,255,255,0.7)';
  let label = '';

  if (isUser) {
    borderColor = 'rgba(59,130,246,0.3)';
    bgColor = 'rgba(59,130,246,0.06)';
    textColor = 'rgba(255,255,255,0.9)';
    label = '你';
  } else if (isHR) {
    borderColor = 'rgba(255,68,68,0.3)';
    bgColor = 'rgba(255,68,68,0.06)';
    textColor = 'rgba(255,255,255,0.85)';
    label = 'HR';
  } else if (isLawyer) {
    borderColor = 'rgba(34,197,94,0.3)';
    bgColor = 'rgba(34,197,94,0.04)';
    textColor = 'rgba(34,197,94,0.7)';
    label = '律师提示';
  } else if (isSystem) {
    borderColor = 'rgba(255,200,0,0.2)';
    bgColor = 'rgba(255,200,0,0.04)';
    textColor = 'rgba(255,200,0,0.6)';
    label = '系统';
  }

  return (
    <motion.div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${isLawyer ? 'text-[11px] italic' : 'text-sm'}`}
        style={{
          background: bgColor,
          border: `1px solid ${borderColor}`,
          color: textColor,
          backdropFilter: 'blur(10px)',
        }}
      >
        {label && (
          <div
            className="text-[10px] font-bold uppercase tracking-wider mb-1"
            style={{
              color: isHR
                ? 'rgba(255,68,68,0.6)'
                : isUser
                  ? 'rgba(59,130,246,0.6)'
                  : isLawyer
                    ? 'rgba(34,197,94,0.5)'
                    : 'rgba(255,200,0,0.5)',
            }}
          >
            {label}
          </div>
        )}
        <p className="leading-relaxed whitespace-pre-wrap">{message.content}</p>

        {/* Key moment badge */}
        {message.keyMoment && (
          <motion.div
            className="mt-2 px-2 py-1 rounded-lg text-[10px] inline-block"
            style={{
              background: 'rgba(255,200,0,0.1)',
              border: '1px solid rgba(255,200,0,0.3)',
              color: '#fbbf24',
            }}
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
          >
            <span className="mr-1">&#9733;</span>
            {message.keyMoment}
          </motion.div>
        )}

        {/* Retry button on system error messages */}
        {isSystem && message.retryAction && onRetry && (
          <motion.button
            onClick={() => onRetry(message.retryAction)}
            disabled={isLoading}
            className="mt-2 px-3 py-1.5 rounded-lg text-[11px] font-bold disabled:opacity-40"
            style={{
              background: 'rgba(255,200,0,0.12)',
              border: '1px solid rgba(255,200,0,0.4)',
              color: '#fbbf24',
            }}
            whileHover={!isLoading ? { scale: 1.04, background: 'rgba(255,200,0,0.2)' } : {}}
            whileTap={!isLoading ? { scale: 0.96 } : {}}
          >
            <span className="mr-1">&#x21bb;</span>
            重试
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}
