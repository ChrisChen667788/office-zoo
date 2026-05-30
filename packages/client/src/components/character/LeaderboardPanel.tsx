/**
 * LeaderboardPanel — v6.36 P4 公开 班味 Top-10.
 *
 * Reads /api/leaderboard/banwei (which reduces over banwei.json) to
 * surface the public top-10 scoreboard across all spectators. Caller's
 * own row gets highlighted by matching the truncated userIdPrefix
 * against `getUserId().slice(0, 8)`.
 *
 * Privacy note: server only returns the first 8 chars of each userId,
 * so a passerby can't reverse-engineer identities. Your own row is
 * recognizable because you know your own uid.
 *
 * UI: ranked list, gradient-tinted top 3, "你 →" pointer on your row.
 */
import { useEffect, useState } from 'react';
import { getUserId } from '../../utils/userId';

interface Row {
  userIdPrefix: string;
  score: number;
  weekKey: string;
  region?: string;
  industry?: string;
}

interface Response {
  top: Row[];
  total: number;
  weekKey: string;
  filters: { region?: string; industry?: string };
}

const MEDAL = ['🥇', '🥈', '🥉'] as const;
/** Tint by rank: gold → silver → bronze → neutral. */
const RANK_ACCENT = ['#FFD700', '#C0C0C0', '#CD7F32'] as const;

// v6.37 P1 — must mirror banwei.KNOWN_REGIONS / KNOWN_INDUSTRIES.
// Kept in display-order so chip rows scan left-to-right.
const REGION_CHIPS: Array<{ id: string; label: string }> = [
  { id: 'beijing',  label: '🌆 北漂' },
  { id: 'shanghai', label: '☕ 沪漂' },
  { id: 'shenzhen', label: '💰 深漂' },
  { id: 'hangzhou', label: '🌊 杭漂' },
  { id: 'chengdu',  label: '🐼 成都' },
  { id: 'overseas', label: '✈️ 海外' },
];
const INDUSTRY_CHIPS: Array<{ id: string; label: string }> = [
  { id: 'soe',     label: '🏛️ 国企' },
  { id: 'faang',   label: '⚙️ 大厂' },
  { id: 'startup', label: '🤠 创业' },
  { id: 'finance', label: '💼 金融' },
  { id: 'edu',     label: '📚 教培' },
  { id: 'mcn',     label: '📱 MCN' },
];

export default function LeaderboardPanel() {
  const [data, setData] = useState<Response | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [region, setRegion] = useState<string | undefined>(undefined);
  const [industry, setIndustry] = useState<string | undefined>(undefined);
  // v6.38 P4 — pack-scoped view ("你公司内部 Top"). Only offered when the
  // user has actually played with a pack (lastPackId in localStorage).
  const [packScope, setPackScope] = useState(false);
  const [myPackId] = useState<string | undefined>(() => {
    try { return localStorage.getItem('office-arena.lastPackId') || undefined; }
    catch { return undefined; }
  });
  const myPrefix = getUserId().slice(0, 8);

  useEffect(() => {
    const qs = new URLSearchParams({ limit: '10' });
    if (region) qs.set('region', region);
    if (industry) qs.set('industry', industry);
    if (packScope && myPackId) qs.set('packId', myPackId);
    fetch(`/api/leaderboard/banwei?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => { setData(d as Response); setErr(null); })
      .catch((e) => setErr(String(e)));
  }, [region, industry, packScope, myPackId]);

  if (err) {
    return (
      <div style={{
        marginTop: 16, padding: 14, borderRadius: 14,
        background: 'rgba(15,14,46,0.6)',
        border: '1px solid rgba(255,255,255,0.08)',
        color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'center',
      }}>🏆 班味排行榜暂不可用 ({err})</div>
    );
  }
  if (!data) return null;

  return (
    <div style={{
      marginTop: 16, padding: 14, borderRadius: 14,
      background: 'rgba(15,14,46,0.6)',
      border: '1px solid rgba(255,215,0,0.35)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <div>
          <div style={{
            fontSize: 10, fontWeight: 900, letterSpacing: '0.2em',
            color: '#FFD700', textTransform: 'uppercase', marginBottom: 4,
          }}>🏆 BANWEI LEADERBOARD · 班味 TOP 10</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
            本周 {data.weekKey} · 全网共 {data.total} 位打工人参与
          </div>
        </div>
      </div>

      {/* v6.38 P4 — pack scope toggle. Shown only when the user has
          played with a 公司主题包. Flips the whole board to "your
          company" — everyone who played the same shared pack. */}
      {myPackId && (
        <button
          type="button"
          onClick={() => setPackScope((v) => !v)}
          style={{
            width: '100%', marginBottom: 8, padding: '6px 10px', borderRadius: 8,
            fontSize: 11, fontWeight: 800, letterSpacing: '0.04em',
            cursor: 'pointer', fontFamily: 'inherit',
            background: packScope
              ? 'linear-gradient(135deg, #4ECDC4 0%, #2fb8ff 100%)'
              : 'rgba(78,205,196,0.1)',
            color: packScope ? '#0a0a1e' : '#4ECDC4',
            border: `1px solid ${packScope ? 'rgba(78,205,196,0.6)' : 'rgba(78,205,196,0.3)'}`,
          }}
        >
          {packScope ? '🏢 本公司 Top · 点击看全网' : '🏢 只看本公司同事 Top'}
        </button>
      )}

      {/* v6.37 P1 — tribe filter chip rows. Toggling a chip refetches
          with the corresponding query param; clicking the active chip
          clears the filter. */}
      <FilterChipRow
        label="REGION"
        chips={REGION_CHIPS}
        selected={region}
        onChange={setRegion}
      />
      <FilterChipRow
        label="INDUSTRY"
        chips={INDUSTRY_CHIPS}
        selected={industry}
        onChange={setIndustry}
      />

      {data.top.length === 0 ? (
        <div style={{
          padding: 18, textAlign: 'center', fontSize: 12,
          color: 'rgba(255,255,255,0.45)',
        }}>
          🐀 还没人打卡, 你可以是本周第一个上榜的鼠人 →
        </div>
      ) : (
        <ol style={{
          listStyle: 'none', padding: 0, margin: 0,
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {data.top.map((row, i) => {
            const isMe = row.userIdPrefix === myPrefix;
            const accent: string = i < 3 ? RANK_ACCENT[i] : 'rgba(255,255,255,0.35)';
            const medal: string = i < 3 ? MEDAL[i] : `#${i + 1}`;
            return (
              <li
                key={`${row.userIdPrefix}-${i}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '6px 10px', borderRadius: 8,
                  background: isMe ? 'rgba(255,215,0,0.12)' : 'rgba(255,255,255,0.04)',
                  border: isMe ? `1px solid ${accent}` : '1px solid rgba(255,255,255,0.05)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <span style={{
                  width: 28, textAlign: 'center', fontSize: 14, fontWeight: 900,
                  color: accent,
                }}>{medal}</span>
                <span style={{
                  flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.78)',
                  fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
                }}>
                  {row.userIdPrefix}
                  {isMe && (
                    <span style={{
                      marginLeft: 8, padding: '1px 6px', borderRadius: 4,
                      background: 'rgba(255,215,0,0.25)',
                      color: '#FFD700', fontSize: 10, fontWeight: 900,
                      letterSpacing: '0.08em',
                    }}>← 你</span>
                  )}
                </span>
                <span style={{
                  fontSize: 14, fontWeight: 900, color: accent,
                  minWidth: 36, textAlign: 'right',
                }}>{row.score}</span>
              </li>
            );
          })}
        </ol>
      )}

      <div style={{
        marginTop: 10, fontSize: 9.5, color: 'rgba(255,255,255,0.35)',
        textAlign: 'center', letterSpacing: '0.04em', lineHeight: 1.5,
      }}>
        🔒 隐私: 仅显示你的 user id 前 8 位 · 谁也认不出别人, 但你能认出自己
      </div>
    </div>
  );
}

/** v6.37 P1 — a horizontal scroll of clickable tribe chips. Click the
 *  active chip to clear. Single-select (not multi). Kept inline because
 *  it's only used here and the styling is tightly coupled. */
function FilterChipRow({
  label, chips, selected, onChange,
}: {
  label: string;
  chips: Array<{ id: string; label: string }>;
  selected: string | undefined;
  onChange: (id: string | undefined) => void;
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{
        fontSize: 9, fontWeight: 800, letterSpacing: '0.18em',
        color: 'rgba(255,255,255,0.42)', marginBottom: 4,
      }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {chips.map((c) => {
          const active = c.id === selected;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange(active ? undefined : c.id)}
              style={{
                fontSize: 10, fontWeight: 700, padding: '3px 8px',
                borderRadius: 999, cursor: 'pointer',
                background: active ? 'rgba(255,215,0,0.22)' : 'rgba(255,255,255,0.04)',
                color: active ? '#FFD700' : 'rgba(255,255,255,0.65)',
                border: `1px solid ${active ? 'rgba(255,215,0,0.55)' : 'rgba(255,255,255,0.08)'}`,
                fontFamily: 'inherit',
              }}
            >{c.label}</button>
          );
        })}
      </div>
    </div>
  );
}
