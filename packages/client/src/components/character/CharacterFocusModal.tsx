/**
 * CharacterFocusModal — v6.11 P4.
 *
 * Watches URL for `?character=<name>` query param. When present, fetches
 * the character + opens a centered overlay rendering the PersonaCard
 * popover. Close → strips the param from the URL.
 *
 * Mounted at the App root (next to <Routes>) so it works on ANY page
 * the share-link redirect lands on. Inert otherwise (renders nothing
 * when the param is absent).
 *
 * Why an overlay instead of pushing into a /character/:name route:
 * - Single mount = always available regardless of which route the
 *   redirect ends up on
 * - Modal pattern matches how PersonaCard already feels (popover that
 *   can be dismissed)
 * - No route entry → no impact on Vite chunking
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { findCharacter } from '@furball/shared';
import PersonaCard from './PersonaCard';

export default function CharacterFocusModal() {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    function syncFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const n = params.get('character');
      setName(n && findCharacter(n) ? n : null);
    }
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  function close() {
    const params = new URLSearchParams(window.location.search);
    params.delete('character');
    const newSearch = params.toString();
    const newUrl = newSearch
      ? `${window.location.pathname}?${newSearch}${window.location.hash}`
      : `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState(null, '', newUrl);
    setName(null);
  }

  return (
    <AnimatePresence>
      {name && (
        <motion.div
          key="char-focus"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(10, 10, 30, 0.78)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 320, position: 'relative',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 12,
            }}
          >
            <button
              type="button"
              onClick={close}
              style={{
                position: 'absolute', top: -12, right: -12,
                width: 32, height: 32, borderRadius: '50%',
                background: 'rgba(255,255,255,0.12)', color: '#F8F4E3',
                border: '1px solid rgba(255,215,0,0.32)', cursor: 'pointer',
                fontSize: 14, fontWeight: 900,
              }}
              aria-label="Close"
            >×</button>
            <div style={{
              fontSize: 11, fontWeight: 900, letterSpacing: '0.22em',
              color: '#FFD700', textTransform: 'uppercase',
            }}>🎭 鼠人档案 / 来自分享链接</div>
            <PersonaCard playerName={name} personality={undefined}>
              <div style={{
                cursor: 'pointer',
                padding: '14px 20px',
                borderRadius: 14,
                background: 'linear-gradient(135deg, #1a0d35 0%, #2D1B69 100%)',
                border: '1px solid rgba(255,215,0,0.45)',
                boxShadow: '0 0 32px rgba(255,79,163,0.32)',
                color: '#F8F4E3', fontWeight: 800,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              }}>
                <span style={{ fontSize: 32 }}>{findCharacter(name)?.emoji ?? '🐀'}</span>
                <span style={{ fontSize: 18, fontWeight: 900 }}>{findCharacter(name)?.epithet}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
                  color: 'rgba(248,244,227,0.55)',
                }}>{name.toUpperCase()}</span>
                <span style={{
                  fontSize: 10, marginTop: 4, color: '#FFD700',
                  fontWeight: 700, letterSpacing: '0.05em',
                }}>点这里看完整档案 ↓</span>
              </div>
            </PersonaCard>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
