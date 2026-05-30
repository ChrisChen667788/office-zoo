/**
 * CompanyPackView — v6.38 P3 公司主题包只读分享页 + 一键导入.
 *
 * Lands here from a shared /company-pack/view/:packId link. Anyone can
 * read a pack (packId is the share token — see companyPack.ts GET
 * /:packId), so this page shows the pack's NPC roster read-only with a
 * "存成我的公司包" button.
 *
 * Import is done purely client-side against existing endpoints: read the
 * pack here, then POST its {name, npcs} as a NEW pack under the current
 * user (server assigns a fresh packId + ownerUserId). No dedicated
 * import endpoint needed. On success we bounce to the editor for the
 * freshly-created copy so the user can tweak names.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getUserId } from '../utils/userId';
import EventPill from '../components/EventPill';

interface PackNpc {
  name: string;
  role?: string;
  personality?: string;
  avatar?: string;
}
interface Pack {
  packId: string;
  ownerUserId: string;
  name: string;
  npcs: PackNpc[];
}

// Display labels mirror the editor dropdowns (CompanyPackEdit). Kept
// local so this read-only page has no dependency on the editor module.
const ROLE_LABEL: Record<string, string> = {
  engineer: '工程师', pm: '产品经理', manager: '管理岗', designer: '设计',
  hr: 'HR', sales: '销售/BD', finance: '财务',
};
const PERSONALITY_LABEL: Record<string, string> = {
  workaholic: '卷王 💼', social_butterfly: '社牛 🦋', introvert: '社恐 🐚',
  contrarian: '杠精 ⚔️', sycophant: '舔狗 🐶', passive_aggressive: '阴阳怪气 😏',
  hot_tempered: '暴躁老哥 🔥', smooth_operator: '老油条 🧈',
};

export default function CompanyPackView() {
  const navigate = useNavigate();
  const { packId } = useParams<{ packId: string }>();
  const [pack, setPack] = useState<Pack | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importErr, setImportErr] = useState<string | null>(null);

  useEffect(() => {
    if (!packId) return;
    fetch(`/api/company-pack/${packId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => setPack(d.pack as Pack))
      .catch((e) => setErr(`加载失败 (${e})`));
  }, [packId]);

  const isMine = pack && pack.ownerUserId === getUserId();

  async function importCopy() {
    if (!pack || importing) return;
    setImporting(true);
    setImportErr(null);
    try {
      const r = await fetch('/api/company-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': getUserId() },
        body: JSON.stringify({
          // Mark as a copy so the user can tell it apart in their list.
          name: `${pack.name} (副本)`.slice(0, 32),
          npcs: pack.npcs.map((n) => ({
            name: n.name,
            ...(n.role ? { role: n.role } : {}),
            ...(n.personality ? { personality: n.personality } : {}),
          })),
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      const j = await r.json();
      navigate(`/company-pack/edit/${j.pack.packId}`);
    } catch (e) {
      setImportErr(String(e instanceof Error ? e.message : e));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', padding: '32px 16px',
      color: 'rgba(255,255,255,0.92)',
      background:
        'radial-gradient(ellipse at 25% 18%, rgba(176,134,255,0.30) 0%, transparent 45%),' +
        'radial-gradient(ellipse at 78% 82%, rgba(255,215,0,0.18) 0%, transparent 50%),' +
        'radial-gradient(ellipse at 50% 50%, #2D1B69 0%, #1a0d35 60%, #0a0a1e 100%)',
    }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <button
            onClick={() => navigate('/')}
            style={{
              fontSize: 11, padding: '6px 12px', borderRadius: 999,
              background: 'rgba(255,255,255,0.85)', color: '#0a0a0a',
              border: '2px solid #0a0a0a', fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >← 首页</button>
          <EventPill stars={5} subtle>🏢 公司主题包</EventPill>
          <div style={{ width: 70 }} />
        </div>

        {err && (
          <div style={{
            padding: 16, borderRadius: 14, textAlign: 'center', fontSize: 13,
            background: 'rgba(15,14,46,0.65)', border: '1px solid rgba(255,79,87,0.35)',
            color: '#ff4f57',
          }}>{err}</div>
        )}

        {pack && (
          <div style={{
            padding: 16, borderRadius: 16,
            background: 'rgba(15,14,46,0.65)',
            border: '1px solid rgba(255,215,0,0.35)',
          }}>
            <div style={{
              fontSize: 10, fontWeight: 800, letterSpacing: '0.18em',
              color: '#FFD700', textTransform: 'uppercase', marginBottom: 4,
            }}>SHARED PACK · 别人分享的公司</div>
            <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 4 }}>{pack.name}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 14 }}>
              {pack.npcs.length} 名鼠人{isMine ? ' · 这是你自己的包' : ''}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {pack.npcs.map((n, i) => (
                <div
                  key={`${n.name}-${i}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <span style={{
                    width: 22, textAlign: 'center', fontSize: 11, fontWeight: 700,
                    color: 'rgba(255,255,255,0.4)',
                    fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
                  }}>{String(i + 1).padStart(2, '0')}</span>
                  {n.avatar && (
                    <span style={{ fontSize: 16, lineHeight: 1 }}>{n.avatar}</span>
                  )}
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{n.name}</span>
                  {n.role && ROLE_LABEL[n.role] && (
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 4,
                      background: 'rgba(78,205,196,0.12)', color: '#4ECDC4',
                      border: '1px solid rgba(78,205,196,0.3)',
                    }}>{ROLE_LABEL[n.role]}</span>
                  )}
                  {n.personality && PERSONALITY_LABEL[n.personality] && (
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 4,
                      background: 'rgba(176,134,255,0.14)', color: '#B086FF',
                      border: '1px solid rgba(176,134,255,0.3)',
                    }}>{PERSONALITY_LABEL[n.personality]}</span>
                  )}
                </div>
              ))}
            </div>

            {/* v6.38 P4 — direct-play: jump to Landing with this pack
                preselected (?pack=). No import needed — everyone who
                opens the same link plays the SAME packId, which is what
                groups them under "你公司内部 Top" on the leaderboard. */}
            <button
              type="button"
              onClick={() => navigate(`/?pack=${pack.packId}`)}
              style={{
                marginTop: 16, width: '100%', padding: '10px 16px', borderRadius: 10,
                background: 'linear-gradient(135deg, #4ECDC4 0%, #2fb8ff 100%)',
                color: '#0a0a1e', fontWeight: 900, fontSize: 13, border: 'none',
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: '0 4px 14px rgba(78,205,196,0.32)',
              }}
            >
              🎮 直接用这个包开局
            </button>

            <button
              type="button"
              onClick={importCopy}
              disabled={importing}
              style={{
                marginTop: 8, width: '100%', padding: '10px 16px', borderRadius: 10,
                background: importing
                  ? 'rgba(255,255,255,0.08)'
                  : 'linear-gradient(135deg, #FFD700 0%, #FFA947 100%)',
                color: importing ? 'rgba(255,255,255,0.4)' : '#0a0a1e',
                fontWeight: 900, fontSize: 13, border: 'none',
                cursor: importing ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                boxShadow: importing ? 'none' : '0 4px 14px rgba(255,215,0,0.32)',
              }}
            >
              {importing ? '导入中…' : '📥 存成我的公司包 (可改名)'}
            </button>

            {importErr && (
              <div style={{
                marginTop: 10, padding: '6px 10px', borderRadius: 6,
                background: 'rgba(255,79,87,0.12)', color: '#ff4f57',
                fontSize: 11, border: '1px solid rgba(255,79,87,0.32)',
              }}>{importErr}</div>
            )}

            <div style={{
              marginTop: 12, fontSize: 10, color: 'rgba(255,255,255,0.4)',
              textAlign: 'center', lineHeight: 1.6,
            }}>
              💡 导入后会成为你自己的副本, 可在首页"公司主题包"里选它开局
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
