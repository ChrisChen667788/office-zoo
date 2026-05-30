/**
 * CompanyPackEdit — v6.37 P4 用户自定义公司主题包编辑器.
 *
 * Lets a spectator define "我们公司的 6-12 个 NPC" by name (required)
 * + optional role hint + optional personality hint. POST to
 * /api/company-pack returns a packId that Landing then surfaces in
 * the pack picker (LeaderboardPanel for sharing is left for a future
 * round).
 *
 * Routes:
 *   /company-pack/edit              create new
 *   /company-pack/edit/:packId      edit existing (loads + verifies owner)
 *
 * The form intentionally stays minimal: free-text name, dropdown for
 * role/personality so users can't accidentally type garbage that the
 * server rejects. Server validation still runs as the source of truth.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getUserId } from '../utils/userId';
import EventPill from '../components/EventPill';

const MIN_NPCS = 6;
const MAX_NPCS = 12;

/** Roles users can pick — coarse-grained on purpose so we don't
 *  expose the full ROLE_REGISTRY (cat/dog/neutral split is engine
 *  internal; from the user's POV they're just job titles). */
const ROLE_HINTS: Array<{ id: string; label: string }> = [
  { id: '',          label: '不指定' },
  { id: 'engineer',  label: '工程师' },
  { id: 'pm',        label: '产品经理' },
  { id: 'manager',   label: '管理岗' },
  { id: 'designer',  label: '设计' },
  { id: 'hr',        label: 'HR' },
  { id: 'sales',     label: '销售/BD' },
  { id: 'finance',   label: '财务' },
];

/** Mirrors shared.Personality EXACTLY — ids must equal the enum string
 *  values or the engine's VALID_PERSONALITIES whitelist drops the hint. */
const PERSONALITY_HINTS: Array<{ id: string; label: string }> = [
  { id: '',                   label: '不指定' },
  { id: 'workaholic',         label: '卷王 💼' },
  { id: 'social_butterfly',   label: '社牛 🦋' },
  { id: 'introvert',          label: '社恐 🐚' },
  { id: 'contrarian',         label: '杠精 ⚔️' },
  { id: 'sycophant',          label: '舔狗 🐶' },
  { id: 'passive_aggressive', label: '阴阳怪气 😏' },
  { id: 'hot_tempered',       label: '暴躁老哥 🔥' },
  { id: 'smooth_operator',    label: '老油条 🧈' },
];

interface NpcRow {
  name: string;
  role: string;
  personality: string;
  avatar: string;
}

/** v6.39 P3 — preset emoji avatars users can pick per NPC. '' = 默认
 *  (role-generated image in game). Kept as a flat pool so the picker
 *  is a single compact <select>. */
const AVATAR_CHOICES = [
  '', '🐀', '🐱', '🐶', '🦊', '🐼', '🐯', '🦁', '🐸',
  '🐵', '🐰', '🐻', '🐷', '🦝', '🐹', '🐮', '🐲', '🦄',
];

export default function CompanyPackEdit() {
  const navigate = useNavigate();
  const { packId } = useParams<{ packId?: string }>();
  const [name, setName] = useState('');
  const [npcs, setNpcs] = useState<NpcRow[]>(
    Array.from({ length: MIN_NPCS }, () => ({ name: '', role: '', personality: '', avatar: '' })),
  );
  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle');
  const [errMsg, setErrMsg] = useState<string | null>(null);
  // v6.38 P3 — share-link copy feedback (only meaningful in edit mode
  // where a packId exists).
  const [shareCopied, setShareCopied] = useState(false);

  async function copyShareLink() {
    if (!packId) return;
    const url = `${window.location.origin}/company-pack/view/${packId}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1800);
    } catch {
      // Clipboard blocked (insecure context / permissions) — fall back
      // to a prompt so the user can still grab the link manually.
      window.prompt('复制这个分享链接:', url);
    }
  }

  // v6.37 P4 — edit mode preload. Pulls the existing pack and
  // hydrates the form. Owner check happens server-side on save (POST
  // with packId by non-owner returns 403).
  useEffect(() => {
    if (!packId) return;
    fetch(`/api/company-pack/${packId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => {
        const p = d.pack as { name: string; npcs: Array<{ name: string; role?: string; personality?: string; avatar?: string }> };
        setName(p.name);
        setNpcs(p.npcs.map((n) => ({
          name: n.name,
          role: n.role ?? '',
          personality: n.personality ?? '',
          avatar: n.avatar ?? '',
        })));
      })
      .catch((e) => setErrMsg(`加载失败 (${e})`));
  }, [packId]);

  const namesSeen = new Set<string>();
  let firstDup: string | null = null;
  for (const n of npcs) {
    const t = n.name.trim();
    if (!t) continue;
    if (namesSeen.has(t) && !firstDup) firstDup = t;
    namesSeen.add(t);
  }
  const filledCount = npcs.filter((n) => n.name.trim().length > 0).length;
  const canSave =
    name.trim().length > 0 &&
    filledCount >= MIN_NPCS &&
    !firstDup &&
    status !== 'saving';

  function setRow(i: number, patch: Partial<NpcRow>) {
    setNpcs((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function addRow() {
    if (npcs.length >= MAX_NPCS) return;
    setNpcs((prev) => [...prev, { name: '', role: '', personality: '', avatar: '' }]);
  }

  function removeRow(i: number) {
    if (npcs.length <= MIN_NPCS) return;
    setNpcs((prev) => prev.filter((_, j) => j !== i));
  }

  async function save() {
    if (!canSave) return;
    setStatus('saving');
    setErrMsg(null);
    // Strip empty optional fields before POST so the server's JSON shape
    // stays clean (and matches the test fixtures).
    const cleanedNpcs = npcs
      .filter((n) => n.name.trim().length > 0)
      .map((n) => ({
        name: n.name.trim(),
        ...(n.role ? { role: n.role } : {}),
        ...(n.personality ? { personality: n.personality } : {}),
        ...(n.avatar ? { avatar: n.avatar } : {}),
      }));
    try {
      const r = await fetch('/api/company-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': getUserId() },
        body: JSON.stringify({
          name: name.trim(),
          npcs: cleanedNpcs,
          ...(packId ? { packId } : {}),
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      setStatus('ok');
      setTimeout(() => navigate('/'), 800);
    } catch (e) {
      setStatus('err');
      setErrMsg(String(e instanceof Error ? e.message : e));
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      padding: '32px 16px',
      color: 'rgba(255,255,255,0.92)',
      background:
        'radial-gradient(ellipse at 25% 18%, rgba(176,134,255,0.30) 0%, transparent 45%),' +
        'radial-gradient(ellipse at 78% 82%, rgba(255,215,0,0.18) 0%, transparent 50%),' +
        'radial-gradient(ellipse at 50% 50%, #2D1B69 0%, #1a0d35 60%, #0a0a1e 100%)',
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              fontSize: 11, padding: '6px 12px', borderRadius: 999,
              background: 'rgba(255,255,255,0.85)', color: '#0a0a0a',
              border: '2px solid #0a0a0a', fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >← 返回</button>
          <EventPill stars={5} subtle>🏢 公司主题包</EventPill>
          {packId ? (
            <button
              onClick={copyShareLink}
              style={{
                fontSize: 11, padding: '6px 12px', borderRadius: 999,
                background: shareCopied ? 'rgba(34,197,94,0.85)' : 'rgba(78,205,196,0.18)',
                color: shareCopied ? '#0a0a1e' : '#4ECDC4',
                border: '1px solid rgba(78,205,196,0.5)', fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}
            >{shareCopied ? '✓ 已复制' : '🔗 分享'}</button>
          ) : (
            <div style={{ width: 80 }} />
          )}
        </div>

        <div style={{
          padding: 16, borderRadius: 16,
          background: 'rgba(15,14,46,0.65)',
          border: '1px solid rgba(255,215,0,0.35)',
        }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{
              fontSize: 10, fontWeight: 800, letterSpacing: '0.18em',
              color: '#FFD700', textTransform: 'uppercase', marginBottom: 6,
            }}>PACK NAME · 公司名</div>
            <input
              type="text"
              maxLength={32}
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 32))}
              placeholder='例: "字节跳动 PM 组" / "上海弄堂研发"'
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '8px 10px', fontSize: 14,
                background: 'rgba(15,14,46,0.6)', color: '#f4f4ff',
                border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
                fontFamily: 'inherit',
              }}
            />
            <div style={{ marginTop: 4, fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>
              {name.length}/32
            </div>
          </div>

          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            marginBottom: 8,
          }}>
            <div style={{
              fontSize: 10, fontWeight: 800, letterSpacing: '0.18em',
              color: '#4ECDC4', textTransform: 'uppercase',
            }}>NPCS · 6-12 个鼠人</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
              填好 {filledCount}/{MIN_NPCS} · 当前 {npcs.length} 行
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {npcs.map((row, i) => {
              const trimmedName = row.name.trim();
              const isDup = trimmedName && trimmedName === firstDup;
              return (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '26px 46px 1.2fr 0.9fr 0.9fr 24px',
                    gap: 6, alignItems: 'center',
                  }}
                >
                  <span style={{
                    textAlign: 'center', fontSize: 11, fontWeight: 700,
                    color: 'rgba(255,255,255,0.4)',
                    fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
                  }}>{String(i + 1).padStart(2, '0')}</span>
                  <select
                    value={row.avatar}
                    onChange={(e) => setRow(i, { avatar: e.target.value })}
                    title="选个 emoji 头像 (留空=默认)"
                    style={{
                      padding: '6px 2px', fontSize: 15, textAlign: 'center',
                      background: 'rgba(15,14,46,0.6)', color: '#f4f4ff',
                      border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6,
                      fontFamily: 'inherit',
                    }}
                  >
                    {AVATAR_CHOICES.map((a) => (
                      <option key={a || 'none'} value={a}>{a || '·'}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    maxLength={16}
                    value={row.name}
                    onChange={(e) => setRow(i, { name: e.target.value.slice(0, 16) })}
                    placeholder="名字"
                    style={{
                      padding: '6px 8px', fontSize: 12,
                      background: 'rgba(15,14,46,0.6)', color: '#f4f4ff',
                      border: `1px solid ${isDup ? 'rgba(255,79,87,0.6)' : 'rgba(255,255,255,0.1)'}`,
                      borderRadius: 6, fontFamily: 'inherit',
                    }}
                  />
                  <select
                    value={row.role}
                    onChange={(e) => setRow(i, { role: e.target.value })}
                    style={{
                      padding: '6px 4px', fontSize: 11,
                      background: 'rgba(15,14,46,0.6)', color: '#f4f4ff',
                      border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6,
                      fontFamily: 'inherit',
                    }}
                  >
                    {ROLE_HINTS.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
                  </select>
                  <select
                    value={row.personality}
                    onChange={(e) => setRow(i, { personality: e.target.value })}
                    style={{
                      padding: '6px 4px', fontSize: 11,
                      background: 'rgba(15,14,46,0.6)', color: '#f4f4ff',
                      border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6,
                      fontFamily: 'inherit',
                    }}
                  >
                    {PERSONALITY_HINTS.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    disabled={npcs.length <= MIN_NPCS}
                    style={{
                      padding: '4px 6px', fontSize: 12, lineHeight: 1,
                      background: 'transparent', cursor: npcs.length > MIN_NPCS ? 'pointer' : 'not-allowed',
                      color: npcs.length > MIN_NPCS ? 'rgba(255,79,87,0.7)' : 'rgba(255,255,255,0.15)',
                      border: 'none', fontFamily: 'inherit',
                    }}
                    title={npcs.length > MIN_NPCS ? '删除这行' : `至少 ${MIN_NPCS} 行`}
                  >×</button>
                </div>
              );
            })}
          </div>

          {firstDup && (
            <div style={{ marginTop: 8, fontSize: 11, color: '#ff4f57' }}>
              ⚠️ 名字重复: "{firstDup}" — 鼠人名字必须唯一
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <button
              type="button"
              onClick={addRow}
              disabled={npcs.length >= MAX_NPCS}
              style={{
                padding: '6px 12px', fontSize: 11,
                background: 'rgba(78,205,196,0.12)',
                color: npcs.length >= MAX_NPCS ? 'rgba(78,205,196,0.4)' : '#4ECDC4',
                border: '1px dashed rgba(78,205,196,0.45)', borderRadius: 6,
                cursor: npcs.length >= MAX_NPCS ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', fontWeight: 700,
              }}
            >+ 加一行 ({npcs.length}/{MAX_NPCS})</button>
            <button
              type="button"
              onClick={save}
              disabled={!canSave}
              style={{
                padding: '8px 18px', fontSize: 13, fontWeight: 800,
                background: status === 'ok'
                  ? 'rgba(34,197,94,0.85)'
                  : canSave
                    ? 'linear-gradient(135deg, #FFD700 0%, #FFA947 100%)'
                    : 'rgba(255,255,255,0.08)',
                color: status === 'ok' || canSave ? '#0a0a1e' : 'rgba(255,255,255,0.35)',
                border: 'none', borderRadius: 8, cursor: canSave ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
                boxShadow: canSave ? '0 4px 14px rgba(255,215,0,0.32)' : 'none',
              }}
            >
              {status === 'saving' ? '保存中…'
                : status === 'ok' ? '✓ 已保存'
                : packId ? '更新公司包 →' : '创建公司包 →'}
            </button>
          </div>

          {errMsg && (
            <div style={{
              marginTop: 10, padding: '6px 10px', borderRadius: 6,
              background: 'rgba(255,79,87,0.12)', color: '#ff4f57',
              fontSize: 11, border: '1px solid rgba(255,79,87,0.32)',
            }}>{errMsg}</div>
          )}
        </div>

        <div style={{
          marginTop: 14, fontSize: 10, color: 'rgba(255,255,255,0.4)',
          textAlign: 'center', lineHeight: 1.6,
        }}>
          💡 保存后, 回到首页 → "公司主题包" 选这个包 → 开局时 AI 鼠人就用你的名字了 ·{' '}
          每个用户最多 5 个包
        </div>
      </div>
    </div>
  );
}
