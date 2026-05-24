/**
 * UgcHighlightsCarousel — v6.14 P2 approved UGC surface on Landing.
 *
 * Pulls /api/talkshow/ugc/monthly?limit=5 — these are the Maker-approved
 * segments that won the auto-mod gauntlet. Renders a horizontal-scroll
 * card strip; click any card OR the "see all" CTA jumps to /talkshow/ugc
 * where the full feed + submission form live.
 *
 * Hidden when:
 *   - Fetch fails (silent)
 *   - 0 entries returned (no maker-approved content yet — don't tease
 *     an empty strip)
 *
 * Why Landing (not Talkshow main): Landing has the highest impression
 * count. Approved-UGC surfacing here closes the loop "Maker → users
 * actually see the segment" without forcing a separate visit.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

interface MonthlyEntry {
  id: string;
  title: string;
  text: string;
  tag: string;
  region?: string;
  likes: number;
  createdAt: number;
}

const TAG_EMOJI: Record<string, string> = {
  overtime: '🌙',  kpi: '📊',  pua: '💢',  age: '👴',
  slacking: '🛌',  jargon: '🧩',  hr: '👔',  boss: '👑',  meta: '🗯️',
};

export default function UgcHighlightsCarousel() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<MonthlyEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/talkshow/ugc/monthly?limit=5')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { entries: MonthlyEntry[] }) => {
        if (!cancelled) setEntries(d.entries ?? []);
      })
      .catch(() => { /* silent — hide */ });
    return () => { cancelled = true; };
  }, []);

  // Hide while loading OR when empty.
  if (!entries || entries.length === 0) return null;

  return (
    <div style={{ width: '100%', maxWidth: 560, margin: '0 auto', marginTop: 16 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8, padding: '0 4px',
      }}>
        <div style={{
          fontSize: 10, fontWeight: 900, letterSpacing: '0.18em',
          color: '#FF4FA3', textTransform: 'uppercase',
        }}>📣 本月用户段子精选</div>
        <button
          onClick={() => navigate('/talkshow/ugc')}
          style={{
            fontSize: 9, color: '#FFD700', fontWeight: 700, cursor: 'pointer',
            letterSpacing: '0.05em', background: 'transparent', border: 'none',
            padding: 0,
          }}
        >→ 全部 / 投稿</button>
      </div>

      {/* Horizontal scroll strip — overflowX auto + flex no-wrap */}
      <div style={{
        display: 'flex', gap: 10, overflowX: 'auto', overflowY: 'hidden',
        paddingBottom: 8, scrollSnapType: 'x mandatory',
        // Hide scrollbar (Firefox + Webkit)
        scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,79,163,0.3) transparent',
      }}>
        {entries.map((e, i) => (
          <motion.button
            key={e.id}
            type="button"
            onClick={() => navigate('/talkshow/ugc')}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.04 * i, duration: 0.3 }}
            whileHover={{ y: -2 }}
            style={{
              flex: '0 0 260px', scrollSnapAlign: 'start',
              padding: '12px 14px', borderRadius: 12,
              background: 'linear-gradient(165deg, rgba(20,15,40,0.85) 0%, rgba(255,79,163,0.08) 100%)',
              border: '1px solid rgba(255,79,163,0.32)',
              boxShadow: '0 0 14px rgba(255,79,163,0.12)',
              textAlign: 'left', cursor: 'pointer',
              color: '#F8F4E3', fontFamily: 'inherit',
              display: 'flex', flexDirection: 'column', gap: 6,
              minHeight: 110,
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 9, fontWeight: 800, letterSpacing: '0.06em',
              color: 'rgba(248,244,227,0.55)',
            }}>
              <span style={{ fontSize: 14 }}>{TAG_EMOJI[e.tag] ?? '🗯️'}</span>
              <span>{e.tag.toUpperCase()}</span>
              {e.region && (
                <span style={{ color: 'rgba(248,244,227,0.4)' }}>· {e.region}</span>
              )}
              <span style={{ marginLeft: 'auto', color: '#FF4FA3', fontWeight: 900 }}>
                ❤ {e.likes}
              </span>
            </div>
            <div style={{
              fontSize: 12, fontWeight: 900, color: '#F8F4E3',
              overflow: 'hidden', textOverflow: 'ellipsis',
              display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
            }}>{e.title}</div>
            <div style={{
              fontSize: 11, color: 'rgba(248,244,227,0.65)', lineHeight: 1.4,
              overflow: 'hidden', textOverflow: 'ellipsis',
              display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
            }}>{e.text}</div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
