/**
 * MyBallotsPanel — v6.17 P3 "我本周的鼠人选秀票" on /profile.
 *
 * Fetches /api/characters/votes/me — Record<characterName, personality>
 * for the current week. Each row shows the user's vote per rat with
 * click-through to that rat's CharacterFocusModal (via ?character
 * deep-link, same as DailyRatSpotlight).
 *
 * Sits below SquadBuddiesPanel — gives the user a clear "track" of
 * their weekly participation in the IP self-tuning loop. Empty state
 * pitches them to vote ("还没投过 — 去 Classic / Result 任意鼠人 hover
 * → 🗳️ 选秀").
 */
import { useEffect, useState } from 'react';
import { CHARACTERS } from '@furball/shared';
import { PERSONALITY_LABELS_LITE } from '../../constants/personalityLabels';
import { getUserId } from '../../utils/userId';

interface MyBallotData {
  ballot: Record<string, string>; // characterName → personality id
  weekKey: string;
}

export default function MyBallotsPanel() {
  const [data, setData] = useState<MyBallotData | null>(null);
  const myId = getUserId();

  useEffect(() => {
    let cancelled = false;
    fetch('/api/characters/votes/me', { headers: { 'X-User-Id': myId } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: MyBallotData) => { if (!cancelled) setData(d); })
      .catch(() => { /* silent */ });
    return () => { cancelled = true; };
  }, [myId]);

  if (data === null) return null; // silent loading

  const ballot = data.ballot ?? {};
  const entries = Object.entries(ballot);

  // Empty state — pitch them to vote
  if (entries.length === 0) {
    return (
      <div style={{
        width: '100%', maxWidth: 512, marginTop: 16,
        padding: '14px 18px', borderRadius: 14,
        background: 'linear-gradient(135deg, rgba(255,215,0,0.04), rgba(255,79,163,0.04))',
        border: '1px dashed rgba(255,215,0,0.25)',
        color: 'rgba(248,244,227,0.65)',
      }}>
        <div style={{
          fontSize: 11, fontWeight: 900, letterSpacing: '0.15em',
          color: '#FFD700', textTransform: 'uppercase', marginBottom: 6,
        }}>🗳️ 我的本周选秀票 · {data.weekKey}</div>
        <div style={{ fontSize: 12, lineHeight: 1.5 }}>
          还没投过. 去 Classic / Result / Squad 任意鼠人 hover, 点 click pin,
          按 "🗳️ 选秀" 投出你这一周的票. 投票直接影响下周 GameEngine
          50% personality bias.
        </div>
      </div>
    );
  }

  function openCharacter(name: string) {
    const params = new URLSearchParams(window.location.search);
    params.set('character', name);
    const newUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
    window.history.pushState(null, '', newUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  return (
    <div style={{ width: '100%', maxWidth: 512, marginTop: 16 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8, padding: '0 4px',
      }}>
        <div style={{
          fontSize: 12, fontWeight: 900, letterSpacing: '0.18em',
          color: '#FFD700', textTransform: 'uppercase',
        }}>🗳️ 我本周的选秀票 · {entries.length}/12</div>
        <div style={{
          fontSize: 9, color: 'rgba(248,244,227,0.4)', fontWeight: 600,
        }}>{data.weekKey}</div>
      </div>

      <div style={{
        padding: '12px 14px', borderRadius: 14,
        background: 'linear-gradient(135deg, rgba(20,15,40,0.85), rgba(255,215,0,0.08))',
        border: '1px solid rgba(255,215,0,0.32)',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        {entries.map(([name, personalityId]) => {
          const char = CHARACTERS[name];
          const persona = PERSONALITY_LABELS_LITE[personalityId];
          if (!char || !persona) return null;
          return (
            <button
              key={name}
              type="button"
              onClick={() => openCharacter(name)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 10,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                cursor: 'pointer', color: '#F8F4E3',
                fontFamily: 'inherit', textAlign: 'left',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,215,0,0.06)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
            >
              <span style={{ fontSize: 22, flex: '0 0 22px' }}>{char.emoji}</span>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{
                  fontSize: 12, fontWeight: 800, color: '#F8F4E3',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{char.epithet}</span>
                <span style={{
                  fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em',
                  color: 'rgba(248,244,227,0.5)',
                }}>{name.toUpperCase()}</span>
              </div>
              <span style={{
                fontSize: 13,
                color: persona.color,
                fontWeight: 800,
                whiteSpace: 'nowrap',
              }}>→ {persona.emoji} {persona.label}</span>
            </button>
          );
        })}
      </div>
      <div style={{
        marginTop: 6, fontSize: 9.5, color: 'rgba(248,244,227,0.4)',
        textAlign: 'center', fontStyle: 'italic',
      }}>
        每行 click 跳鼠人档案. 想改投: 档案里 → 🗳️ 选秀.
      </div>
    </div>
  );
}
