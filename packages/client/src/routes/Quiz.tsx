/**
 * Quiz — v1.3.0 "你是哪种打工人?" personality quiz.
 *
 * TikTok-native swipe-card UX:
 *   - One question per screen, big chunky type
 *   - 4 answer cards in a column, tap or arrow-key picks
 *   - Progress dots top + percentage; smooth motion between questions
 *   - Final card = animated "正在分析你的班味…" while server LLM-
 *     generates the personalized catchphrases
 *   - Result: navigate to /profile/me
 *
 * Y2K theme (hot pink + cyan + acid yellow + chunky black borders) —
 * deliberately loud because the result card is screenshot-output for
 * social. The transition from neon-violet consumer chrome → Y2K quiz
 * page should feel "I'm in a different app now". See docs/DESIGN.md.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { QUIZ_QUESTIONS } from '@furball/shared';
import { getUserId } from '../utils/userId';

type Phase = 'intro' | 'question' | 'submitting' | 'error';

export default function Quiz() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('intro');
  const [questionIdx, setQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const total = QUIZ_QUESTIONS.length;
  const current = QUIZ_QUESTIONS[questionIdx];
  const myId = useMemo(() => getUserId(), []);

  // Keyboard 1-4 picks an answer. Esc bails.
  useEffect(() => {
    if (phase !== 'question') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= '1' && e.key <= '4') {
        const idx = parseInt(e.key, 10) - 1;
        pickAnswer(idx);
      } else if (e.key === 'Escape') {
        navigate('/');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, questionIdx]);

  const pickAnswer = (idx: number) => {
    if (phase !== 'question' || !current) return;
    if (idx < 0 || idx >= current.answers.length) return;
    const next = [...answers];
    next[questionIdx] = idx;
    setAnswers(next);
    if (questionIdx + 1 >= total) {
      // Finished — submit.
      submit(next);
    } else {
      setQuestionIdx((q) => q + 1);
    }
  };

  const submit = async (finalAnswers: number[]) => {
    setPhase('submitting');
    setSubmitErr(null);
    try {
      const r = await fetch('/api/quiz/score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': myId,
        },
        body: JSON.stringify({ answers: finalAnswers }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.message ?? body.error ?? `提交失败 (${r.status})`);
      }
      // Result is persisted server-side — profile route reads it.
      navigate('/profile/me');
    } catch (e) {
      setSubmitErr((e as Error).message ?? '提交失败');
      setPhase('error');
    }
  };

  const progress = phase === 'question'
    ? Math.round(((questionIdx) / total) * 100)
    : phase === 'submitting' || phase === 'error' ? 100 : 0;

  return (
    <div className="y2k-bg flex flex-col items-center justify-center px-4 py-8">
      {/* Progress strip — 8 dots top, % numeric to its right */}
      <div className="w-full max-w-lg flex items-center gap-3 mb-6">
        <div className="flex-1 flex gap-1.5">
          {QUIZ_QUESTIONS.map((_, i) => (
            <div
              key={i}
              className="flex-1 h-2 rounded-full transition-colors"
              style={{
                background: i < questionIdx
                  ? '#0a0a0a'
                  : i === questionIdx && phase === 'question'
                    ? '#ffe300'
                    : 'rgba(255,255,255,0.45)',
              }}
            />
          ))}
        </div>
        <span
          className="y2k-display text-base font-black tabular-nums"
          style={{ color: '#0a0a0a' }}
        >
          {progress}%
        </span>
      </div>

      <AnimatePresence mode="wait">
        {phase === 'intro' && (
          <IntroCard key="intro" onStart={() => setPhase('question')} />
        )}
        {phase === 'question' && current && (
          <QuestionCard
            key={current.id}
            num={questionIdx + 1}
            total={total}
            prompt={current.prompt}
            answers={current.answers.map((a) => a.text)}
            onPick={pickAnswer}
            onBack={questionIdx > 0 ? () => setQuestionIdx((q) => q - 1) : undefined}
          />
        )}
        {phase === 'submitting' && (
          <SubmittingCard key="loading" />
        )}
        {phase === 'error' && (
          <ErrorCard
            key="err"
            message={submitErr ?? '出错了'}
            onRetry={() => submit(answers)}
            onBack={() => navigate('/')}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ===========================================================================
// Sub-components
// ===========================================================================

function IntroCard({ onStart }: { onStart: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.3 }}
      className="y2k-sticker y2k-sparkle max-w-md w-full text-center"
    >
      <div className="text-6xl mb-4">🐀</div>
      <h1 className="y2k-display text-3xl mb-2">
        你是哪种打工人?
      </h1>
      <p className="text-[14px] mb-1" style={{ color: '#444' }}>
        8 道题 · 90 秒搞定
      </p>
      <p className="text-[13px] mb-6" style={{ color: '#666' }}>
        AI 根据你的回答匹配 12 种职场原型,生成你的"班味卡" — 截图发朋友圈,看看朋友也是哪种打工人。
      </p>
      <button onClick={onStart} className="y2k-cta">
        开始测试 →
      </button>
    </motion.div>
  );
}

function QuestionCard({
  num, total, prompt, answers, onPick, onBack,
}: {
  num: number; total: number; prompt: string;
  answers: string[];
  onPick: (idx: number) => void;
  onBack?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.25 }}
      className="max-w-lg w-full"
    >
      <div className="y2k-sticker mb-4">
        <div className="text-xs mb-2" style={{ color: '#666' }}>
          Question {num} / {total}
        </div>
        <div className="y2k-display text-xl leading-tight" style={{ color: '#0a0a0a' }}>
          {prompt}
        </div>
      </div>
      <div className="space-y-2">
        {answers.map((ans, idx) => (
          <motion.button
            key={idx}
            onClick={() => onPick(idx)}
            whileHover={{ scale: 1.015, x: 4 }}
            whileTap={{ scale: 0.98 }}
            className="w-full text-left p-4 transition-all"
            style={{
              background: '#fff',
              color: '#0a0a0a',
              border: '3px solid #0a0a0a',
              borderRadius: 14,
              boxShadow: '4px 4px 0 0 #0a0a0a',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              const colors = ['#ffe300', '#00ddff', '#ff2d92', '#6e00ff'];
              (e.currentTarget as HTMLButtonElement).style.background = colors[idx];
              if (idx === 3) (e.currentTarget as HTMLButtonElement).style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = '#fff';
              (e.currentTarget as HTMLButtonElement).style.color = '#0a0a0a';
            }}
          >
            <span className="font-black mr-2">{idx + 1}.</span>
            <span className="text-[14px]">{ans}</span>
          </motion.button>
        ))}
      </div>
      {onBack && (
        <button
          onClick={onBack}
          className="mt-4 text-xs px-3 py-1.5 rounded-full font-bold"
          style={{
            background: 'rgba(255,255,255,0.65)',
            color: '#0a0a0a',
            border: '2px solid #0a0a0a',
          }}
        >
          ← 上一题
        </button>
      )}
      <div className="mt-2 text-center text-[10px]" style={{ color: 'rgba(255,255,255,0.85)' }}>
        键盘 1-4 选答案 · ESC 退出
      </div>
    </motion.div>
  );
}

function SubmittingCard() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
      className="y2k-sticker y2k-sparkle max-w-md w-full text-center"
    >
      <motion.div
        className="text-6xl mb-4 inline-block"
        animate={{ rotate: [0, 12, -12, 0] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        🧠
      </motion.div>
      <h2 className="y2k-display text-2xl mb-2">
        AI 正在分析你的班味…
      </h2>
      <p className="text-[13px]" style={{ color: '#444' }}>
        生成你的招牌话术 + 匹配天敌/搭子<br/>
        <span className="text-[11px]" style={{ color: '#666' }}>
          (大约 5 秒,值得等)
        </span>
      </p>
    </motion.div>
  );
}

function ErrorCard({
  message, onRetry, onBack,
}: {
  message: string; onRetry: () => void; onBack: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      className="y2k-sticker max-w-md w-full text-center"
    >
      <div className="text-5xl mb-3">😵</div>
      <h2 className="y2k-display text-xl mb-2">出了点问题</h2>
      <p className="text-[13px] mb-5" style={{ color: '#666' }}>{message}</p>
      <div className="flex justify-center gap-2">
        <button
          onClick={onRetry}
          className="px-5 py-2 rounded-full font-bold text-sm"
          style={{
            background: '#0a0a0a',
            color: '#fff',
            border: '3px solid #0a0a0a',
            boxShadow: '4px 4px 0 0 #ffe300',
          }}
        >
          ↻ 重试
        </button>
        <button
          onClick={onBack}
          className="px-5 py-2 rounded-full font-bold text-sm"
          style={{
            background: '#fff',
            color: '#0a0a0a',
            border: '3px solid #0a0a0a',
          }}
        >
          ← 返回首页
        </button>
      </div>
    </motion.div>
  );
}
