/**
 * FiredChallenge — v4.0.0 "X 挑战你这一关" accept surface.
 *
 * Friend opens a /fired/challenge/:code link → this page fetches the
 * challenge state and shows:
 *   - Challenger's archetype + name + grade chip ("🌀 阴阳怪气王 · S 级")
 *   - Scenario title + emoji
 *   - "接受挑战 →" CTA that pre-fills the fired flow with the same
 *     scenarioId AND stashes the challenge code in sessionStorage so
 *     FiredResult knows to POST /complete on round end.
 *   - If the challenge already has a challengeeResult, render the
 *     comparison directly (split-screen card) since both sides finished.
 *
 * Design: matches the y2k-gradient hero style used on Landing and
 * Squad so the surface reads as "important social moment", not
 * "yet another scenario picker".
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getUserId } from '../utils/userId';
import ChallengeShareCardModal from '../components/ChallengeShareCardModal';
import type { ChallengeShareCardData } from '../utils/challengeShareCard';

interface ChallengeParticipantInfo {
  userId: string;
  displayName: string;
  archetypeId?: string;
  archetypeName?: string;
  archetypeEmoji?: string;
}
interface ChallengeResult {
  compensationMonths: number;
  maxPossible: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D';
  tactic?: string;
  ts: number;
}
interface Challenge {
  code: string;
  scenarioId: string;
  scenarioTitle: string;
  scenarioEmoji: string;
  createdAt: number;
  challenger: ChallengeParticipantInfo;
  challengerResult: ChallengeResult;
  challengee?: ChallengeParticipantInfo;
  challengeeResult?: ChallengeResult;
}

const GRADE_COLOR: Record<ChallengeResult['grade'], string> = {
  S: '#ffb84c', A: '#4c9eff', B: '#9cff57', C: '#ffd166', D: '#ff3355',
};

export default function FiredChallenge() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [ch, setCh] = useState<Challenge | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    fetch(`/api/fired/challenge/${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { challenge: Challenge }) => setCh(d.challenge))
      .catch(() => setErr('挑战链接已过期或不存在'));
  }, [code]);

  const myId = getUserId();
  const isSelfChallenge = ch && ch.challenger.userId === myId;
  const bothDone = ch?.challengeeResult;

  const accept = () => {
    if (!ch) return;
    // Stash the challenge code so FiredResult can POST /complete on
    // round end and surface the comparison card.
    try {
      sessionStorage.setItem('office-zoo.active-challenge', JSON.stringify({
        code: ch.code, scenarioId: ch.scenarioId,
      }));
    } catch { /* private mode — challenge still playable, just no auto-complete */ }
    navigate(`/fired?focus=${ch.scenarioId}`);
  };

  if (err) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6"
        style={{ background: 'linear-gradient(180deg, #0a0a1e, #1a0d35 50%, #0a0a1e)' }}>
        <div className="text-center text-white/85">
          <div className="text-5xl mb-3">😶</div>
          <div className="font-bold text-base mb-4">{err}</div>
          <button onClick={() => navigate('/fired')}
            className="px-4 py-2 rounded-full text-xs font-bold text-white"
            style={{ background: 'linear-gradient(135deg,#ff3355,#ff8a4c)' }}>
            ← 去裁了么主页
          </button>
        </div>
      </div>
    );
  }
  if (!ch) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(180deg, #0a0a1e, #1a0d35 50%, #0a0a1e)' }}>
        <div className="text-white/55 text-sm">⏳ 加载挑战…</div>
      </div>
    );
  }

  const cGrade = GRADE_COLOR[ch.challengerResult.grade];

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-10 overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #0a0a1e, #1a0d35 50%, #0a0a1e)' }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full text-center"
      >
        <div className="text-[11px] uppercase tracking-[0.28em] text-white/55 mb-2">
          🥊 朋友挑战
        </div>
        <h1 className="text-2xl md:text-3xl font-black text-white mb-4 leading-tight">
          {ch.challenger.archetypeEmoji ?? '🐀'} {ch.challenger.displayName}{isSelfChallenge && ' (你)'}
          <br/>
          <span style={{ color: '#ff8aa6' }}>挑战你这一关</span>
        </h1>

        {/* Challenger's result card */}
        <div className="rounded-2xl p-5 mb-5 mx-auto"
          style={{
            background: 'linear-gradient(135deg, rgba(255,85,136,0.12), rgba(124,58,237,0.06))',
            border: '1px solid rgba(255,85,136,0.40)',
          }}>
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/55 mb-1">
            他的成绩
          </div>
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="text-4xl font-black"
              style={{ color: cGrade, textShadow: `0 0 20px ${cGrade}99` }}>
              {ch.challengerResult.grade}
            </div>
            <div className="text-left">
              <div className="text-xs text-white/65 leading-tight">谈到</div>
              <div className="text-xl font-black text-white tabular-nums leading-none">
                {ch.challengerResult.compensationMonths}
                <span className="text-[11px] font-normal text-white/55"> / {ch.challengerResult.maxPossible} 月</span>
              </div>
            </div>
          </div>
          {ch.challengerResult.tactic && (
            <div className="text-[11px] text-white/60 italic leading-snug">
              套路: "{ch.challengerResult.tactic}"
            </div>
          )}
        </div>

        {/* Scenario card */}
        <div className="rounded-2xl p-4 mb-6 mx-auto"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.10)',
          }}>
          <div className="text-3xl mb-1">{ch.scenarioEmoji}</div>
          <div className="text-sm font-bold text-white/95">{ch.scenarioTitle}</div>
        </div>

        {/* If friend already played: show comparison instead of accept CTA */}
        {bothDone ? (
          <ComparisonStrip challenge={ch} />
        ) : (
          <motion.button
            onClick={accept}
            whileHover={{ y: -1, scale: 1.01 }}
            whileTap={{ scale: 0.97 }}
            className="w-full py-3.5 rounded-2xl text-sm font-black text-white"
            style={{
              background: 'linear-gradient(135deg, #ff3355, #ff8a4c)',
              boxShadow: '0 8px 24px rgba(255,51,85,0.42)',
              textShadow: '1px 1px 0 rgba(0,0,0,0.35)',
            }}>
            接受挑战 → 谈这一局
          </motion.button>
        )}

        <button onClick={() => navigate('/fired')}
          className="mt-3 text-[11px] text-white/45 hover:text-white/85 transition px-3 py-2">
          不接 → 看看其他剧本
        </button>
      </motion.div>
    </div>
  );
}

function ComparisonStrip({ challenge }: { challenge: Challenge }) {
  // Both sides finished — render a compact side-by-side strip the
  // friend can screenshot.
  // v4.1.0 — also surface a "📤 分享对比卡" button that opens the
  // dedicated 1080×1350 PNG share card modal. Closes the v4.0.0
  // viral loop: comparison was previously only visible inside the
  // app; now it's a postable artefact.
  const c = challenge.challenger;
  const cR = challenge.challengerResult;
  const e = challenge.challengee!;
  const eR = challenge.challengeeResult!;
  const winner = cR.compensationMonths === eR.compensationMonths
    ? 'tie'
    : cR.compensationMonths > eR.compensationMonths ? 'challenger' : 'challengee';

  const [shareOpen, setShareOpen] = useState(false);
  const shareData = useMemo<ChallengeShareCardData>(() => ({
    date: new Date().toISOString().slice(0, 10),
    scenarioTitle: challenge.scenarioTitle,
    scenarioEmoji: challenge.scenarioEmoji,
    challenger: {
      displayName: c.displayName,
      archetypeEmoji: c.archetypeEmoji ?? '🐀',
      archetypeName: c.archetypeName ?? '—',
      grade: cR.grade,
      compensationMonths: cR.compensationMonths,
      maxPossible: cR.maxPossible,
      tactic: cR.tactic,
    },
    challengee: {
      displayName: e.displayName,
      archetypeEmoji: e.archetypeEmoji ?? '🐀',
      archetypeName: e.archetypeName ?? '—',
      grade: eR.grade,
      compensationMonths: eR.compensationMonths,
      maxPossible: eR.maxPossible,
      tactic: eR.tactic,
    },
  }), [challenge, c, cR, e, eR]);

  return (
    <>
      <div className="rounded-2xl p-5"
        style={{
          background: 'linear-gradient(135deg, rgba(255,184,76,0.20), rgba(255,45,146,0.10))',
          border: '1px solid rgba(255,184,76,0.55)',
        }}>
        <div className="text-[10px] uppercase tracking-[0.22em] mb-3"
          style={{ color: '#ffd58a' }}>
          ✦ 对比战绩
        </div>
        <div className="grid grid-cols-2 gap-3 text-center">
          <Side info={c} result={cR} highlight={winner === 'challenger'} label="挑战者" />
          <Side info={e} result={eR} highlight={winner === 'challengee'} label="应战者" />
        </div>
        {winner === 'tie' && (
          <div className="text-center mt-3 text-xs text-white/85 font-bold">
            🤝 平手 — 都拿了 {cR.compensationMonths} 个月
          </div>
        )}
        <button
          onClick={() => setShareOpen(true)}
          className="mt-4 w-full py-2.5 rounded-xl text-xs font-bold tracking-wide text-white"
          style={{
            background: 'linear-gradient(135deg,#ff5588,#7c3aed)',
            boxShadow: '0 6px 18px rgba(124,58,237,0.32)',
          }}>
          📤 分享这张对比卡 (1080×1350 PNG)
        </button>
      </div>

      <ChallengeShareCardModal
        open={shareOpen}
        data={shareData}
        onClose={() => setShareOpen(false)}
      />
    </>
  );
}

function Side({ info, result, highlight, label }: {
  info: ChallengeParticipantInfo; result: ChallengeResult; highlight: boolean; label: string;
}) {
  return (
    <div className="rounded-xl p-3"
      style={{
        background: highlight ? 'rgba(255,184,76,0.18)' : 'rgba(255,255,255,0.04)',
        border: highlight ? '1px solid rgba(255,184,76,0.55)' : '1px solid rgba(255,255,255,0.08)',
      }}>
      <div className="text-[10px] uppercase tracking-wider text-white/55 mb-1">
        {label}{highlight && ' · 👑'}
      </div>
      <div className="text-2xl mb-0.5">{info.archetypeEmoji ?? '🐀'}</div>
      <div className="text-xs font-bold text-white truncate">{info.displayName}</div>
      <div className="text-[10px] text-white/55 mb-2 truncate">{info.archetypeName ?? '—'}</div>
      <div className="text-xl font-black tabular-nums" style={{ color: GRADE_COLOR[result.grade] }}>
        {result.grade}
      </div>
      <div className="text-[10px] text-white/65 tabular-nums">
        {result.compensationMonths}/{result.maxPossible} 月
      </div>
    </div>
  );
}
