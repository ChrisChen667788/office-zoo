/**
 * SquadMemberCard — v6.10 P4 popover for squad-mode members.
 *
 * Squad members are real users (X-User-Id pseudonymous), tagged with an
 * archetype from the quiz, NOT the 12-rat CHARACTERS roster used in
 * Classic mode. Forcing them into PersonaCard would mislabel — "Excel
 * 永动机" doesn't belong to a real squad attendee.
 *
 * Instead this is a sibling component that mirrors PersonaCard's
 * popover chrome but renders SquadMember fields: archetype emoji +
 * archetype name + displayName + isHost chip + a "also see 12-rat
 * roster →" footer link (soft cross-promote into the classic IP layer).
 *
 * Render strategy: same as PersonaCard (mount-on-hover, click-to-pin,
 * portal-less). No lifetime stats fetch — per-member squad attendance
 * stats need a new HTTP endpoint that doesn't exist yet (out of scope
 * for v6.10 P4).
 */

import { useState, useRef, useEffect, ReactNode } from 'react';
import { useT } from '../../utils/i18n';

/** v6.11 P3 — public squad stats payload shape from /api/squad/stats/of/:userId. */
interface SquadStats {
  totalSessions: number;
  cappedAt50: boolean;
  last7Days: number;
  last30Days: number;
  topCoMembers: Array<{ userId: string; displayName: string; sharedSessions: number }>;
}

// In-memory cache per-userId × 5 min TTL — re-opening the same card is instant.
const STATS_CACHE: Map<string, { stats: SquadStats | null; fetchedAt: number }> = new Map();
const STATS_TTL_MS = 5 * 60 * 1000;

interface SquadMemberShape {
  userId: string;
  displayName: string;
  archetypeId?: string;
  archetypeName?: string;
  archetypeEmoji?: string;
  isHost?: boolean;
}

const UI: Record<string, { 'zh-CN': string; en: string }> = {
  host:           { 'zh-CN': '🪑 攒局发起人', en: '🪑 Host' },
  noArchetype:    { 'zh-CN': '未做过 quiz',    en: 'No quiz profile' },
  alsoCheckIP:    { 'zh-CN': '想看 12 鼠 IP? → 经典模式',  en: 'Try 12-rat IP → Classic' },
  statsLoading:   { 'zh-CN': '战绩加载中…',     en: 'Loading stats…' },
  noSessions:     { 'zh-CN': '🆕 首次攒局',     en: '🆕 First squad' },
  totalSessions:  { 'zh-CN': '参加过',         en: 'Joined' },
  sessions:       { 'zh-CN': '局攒局',         en: 'squad sessions' },
  capped:         { 'zh-CN': '+',              en: '+' },
  recent7:        { 'zh-CN': '近 7 天',         en: 'Last 7d' },
  buddy:          { 'zh-CN': '常和',           en: 'Often with' },
};
function tr(key: keyof typeof UI, locale: string): string {
  const sub = locale.split('-')[0];
  const entry = UI[key];
  if (sub === 'en') return entry.en;
  return entry['zh-CN'];
}

interface Props {
  member: SquadMemberShape;
  children: ReactNode;
}

export default function SquadMemberCard({ member, children }: Props) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [stats, setStats] = useState<SquadStats | null | undefined>(undefined);
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const { locale } = useT();

  useEffect(() => {
    if (!pinned) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setPinned(false);
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [pinned]);

  // v6.11 P3 — fetch squad stats on first open. Cached 5 min per userId.
  useEffect(() => {
    if (!open || stats !== undefined) return;
    const cached = STATS_CACHE.get(member.userId);
    if (cached && Date.now() - cached.fetchedAt < STATS_TTL_MS) {
      setStats(cached.stats);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/squad/stats/of/${encodeURIComponent(member.userId)}`);
        if (!r.ok) {
          if (!cancelled) { setStats(null); STATS_CACHE.set(member.userId, { stats: null, fetchedAt: Date.now() }); }
          return;
        }
        const data = await r.json();
        const next = (data?.stats as SquadStats | null) ?? null;
        if (!cancelled) {
          setStats(next);
          STATS_CACHE.set(member.userId, { stats: next, fetchedAt: Date.now() });
        }
      } catch {
        if (!cancelled) setStats(null);
      }
    })();
    return () => { cancelled = true; };
  }, [open, member.userId, stats]);

  return (
    <span
      ref={wrapRef}
      style={{ position: 'relative', display: 'inline-flex', cursor: 'help' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => { if (!pinned) setOpen(false); }}
      onClick={(e) => {
        e.stopPropagation();
        setPinned((p) => !p);
        setOpen(true);
      }}
    >
      {children}
      {open && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 50,
            width: 240,
            padding: '10px 12px',
            borderRadius: 10,
            background: 'linear-gradient(165deg, rgba(20,15,40,0.97) 0%, rgba(45,27,105,0.95) 100%)',
            border: '1px solid rgba(176,134,255,0.32)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.45), 0 0 24px rgba(124,58,237,0.25)',
            color: '#F8F4E3',
            fontSize: 12,
            lineHeight: 1.4,
            pointerEvents: 'auto',
            animation: 'smcardIn 140ms ease-out',
          }}
        >
          {/* Header — archetype emoji + name + displayName */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 22 }}>{member.archetypeEmoji ?? '🐀'}</span>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{
                fontWeight: 900, fontSize: 13,
                background: 'linear-gradient(90deg, #B086FF 0%, #FF4FA3 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                letterSpacing: '-0.01em',
              }}>{member.archetypeName ?? tr('noArchetype', locale)}</span>
              <span style={{
                fontSize: 10, color: 'rgba(248,244,227,0.55)',
                fontWeight: 700, letterSpacing: '0.04em',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{member.displayName}</span>
            </div>
          </div>

          {/* isHost chip */}
          {member.isHost && (
            <div style={{ marginBottom: 6 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                fontSize: 10, padding: '2px 6px', borderRadius: 4,
                background: 'rgba(255,215,0,0.18)', color: '#FFD700',
                border: '1px solid rgba(255,215,0,0.45)', fontWeight: 800,
                letterSpacing: '0.06em',
              }}>
                {tr('host', locale)}
              </span>
            </div>
          )}

          {/* v6.11 P3 — squad stats. Shows total + recent + top buddy. */}
          <div style={{
            marginBottom: 8, paddingTop: 6,
            borderTop: '1px dashed rgba(176,134,255,0.18)',
          }}>
            {stats === undefined ? (
              <div style={{ fontSize: 9.5, color: 'rgba(248,244,227,0.4)', fontWeight: 600 }}>
                {tr('statsLoading', locale)}
              </div>
            ) : stats === null || stats.totalSessions === 0 ? (
              <div style={{ fontSize: 9.5, color: 'rgba(248,244,227,0.45)', fontWeight: 600 }}>
                {tr('noSessions', locale)}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{
                  fontSize: 10, color: 'rgba(248,244,227,0.78)', fontWeight: 700,
                }}>
                  {tr('totalSessions', locale)}{' '}
                  <span style={{ color: '#FFD700', fontWeight: 900 }}>
                    {stats.totalSessions}{stats.cappedAt50 ? tr('capped', locale) : ''}
                  </span>{' '}
                  {tr('sessions', locale)}
                  {stats.last7Days > 0 && (
                    <span style={{ marginLeft: 8, color: 'rgba(248,244,227,0.55)' }}>
                      · {tr('recent7', locale)} {stats.last7Days}
                    </span>
                  )}
                </div>
                {stats.topCoMembers[0] && (
                  <div style={{
                    fontSize: 9.5, color: 'rgba(248,244,227,0.55)', fontWeight: 600,
                  }}>
                    {tr('buddy', locale)} · {stats.topCoMembers[0].displayName}
                    {' '}<span style={{ color: 'rgba(176,134,255,0.7)' }}>
                      ×{stats.topCoMembers[0].sharedSessions}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* v6.10 cross-promote — soft link to the 12-rat Classic roster
              so squad attendees discover the parallel IP layer. */}
          <div style={{
            paddingTop: 6, borderTop: '1px dashed rgba(176,134,255,0.22)',
            fontSize: 9.5, color: 'rgba(176,134,255,0.78)',
            fontWeight: 700, letterSpacing: '0.04em',
            cursor: 'pointer',
          }}
            onClick={(e) => {
              e.stopPropagation();
              // 简单 navigate — Squad/Profile 都已在 react-router 内.
              window.location.href = '/classic';
            }}
          >
            {tr('alsoCheckIP', locale)} →
          </div>
        </div>
      )}
      <style>{`
        @keyframes smcardIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </span>
  );
}
