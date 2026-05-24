/**
 * DailyRatSpotlight — v6.14 P1 "今日鼠人主角" Landing card.
 *
 * Fetches /api/characters/daily (deterministic per server-local date),
 * renders a horizontal banner-style card that pops the PersonaCard
 * popover when clicked. Uses the same `?character=X` deep-link
 * convention as the OG share path, so click routes through
 * CharacterFocusModal (already mounted at App root).
 *
 * Sits in the Landing hero area, between the EventPill row and the
 * existing daily-drama / quiz CTA. Shared content across all users
 * for the day = social conversation hook ("今天主角是 Tony, 加油").
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { CharacterCard } from '@furball/shared';

interface DailyPayload {
  date: string;
  character: CharacterCard;
}

export default function DailyRatSpotlight() {
  const [data, setData] = useState<DailyPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/characters/daily')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: DailyPayload) => { if (!cancelled) setData(d); })
      .catch(() => { /* silent — hide card on fail */ });
    return () => { cancelled = true; };
  }, []);

  if (!data) return null;
  const { character } = data;

  function open() {
    // Use CharacterFocusModal's deep-link convention so the popover
    // opens consistently across the app. Just change the URL —
    // CharacterFocusModal listens to popstate via window.dispatch.
    const params = new URLSearchParams(window.location.search);
    params.set('character', character.name);
    const newSearch = params.toString();
    const newUrl = `${window.location.pathname}?${newSearch}${window.location.hash}`;
    window.history.pushState(null, '', newUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  return (
    <motion.button
      type="button"
      onClick={open}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.4 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        width: '100%', maxWidth: 480,
        padding: '14px 18px', borderRadius: 16,
        background: 'linear-gradient(135deg, rgba(255,215,0,0.10) 0%, rgba(255,79,163,0.10) 100%)',
        border: '1px solid rgba(255,215,0,0.32)',
        boxShadow: '0 0 24px rgba(255,79,163,0.18), inset 0 0 0 1px rgba(255,255,255,0.04)',
        cursor: 'pointer', textAlign: 'left',
        color: '#F8F4E3', fontFamily: 'inherit',
        margin: '0 auto',
      }}
    >
      {/* Big emoji with halo */}
      <div style={{
        width: 64, height: 64, borderRadius: '50%', flex: '0 0 64px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 36,
        background: 'radial-gradient(circle, rgba(255,79,163,0.35) 0%, rgba(124,58,237,0.18) 60%, transparent 100%)',
      }}>{character.emoji}</div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        {/* Top chip — gold "今日鼠人主角" */}
        <div style={{
          fontSize: 9.5, fontWeight: 900, letterSpacing: '0.18em',
          color: '#FFD700', textTransform: 'uppercase',
        }}>🌟 今日鼠人主角 · {data.date}</div>

        {/* Big epithet gradient text */}
        <div style={{
          fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em',
          background: 'linear-gradient(135deg, #FFD700 0%, #FF4FA3 50%, #B086FF 100%)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text',
          color: 'transparent', lineHeight: 1.1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{character.epithet}</div>

        {/* Quote */}
        <div style={{
          fontSize: 11, color: 'rgba(248,244,227,0.75)', fontStyle: 'italic',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>"{character.catchphrases[0]}"</div>
      </div>

      {/* CTA arrow */}
      <div style={{
        flex: '0 0 auto', color: '#FFD700', fontSize: 14, fontWeight: 900,
        opacity: 0.75,
      }}>→</div>
    </motion.button>
  );
}
