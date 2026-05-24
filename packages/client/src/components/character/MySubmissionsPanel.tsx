/**
 * MySubmissionsPanel — v6.12 P1 "我的 UGC 投稿" Profile section.
 *
 * Closes the loop on /talkshow/ugc/me — fetches the current user's
 * submissions, shows pending / approved / rejected counts + a click-
 * through to /talkshow/ugc. Empty state shows the soft hint
 * "去 PersonaCard 把鼠人编进段子" pointing back to the IP system.
 *
 * Why on /profile (not /talkshow/ugc): users go to /profile far more
 * often than /talkshow/ugc, and the submission stats are personal
 * identity content (alongside the班味卡). Putting it here makes the
 * UGC contribution visible to the user without forcing a separate visit.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUserId } from '../../utils/userId';

interface MySubmission {
  id: string;
  title: string;
  text: string;
  tag: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  likes: number;
  createdAt: number;
}

export default function MySubmissionsPanel() {
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<MySubmission[] | null>(null);
  const myId = getUserId();

  useEffect(() => {
    let cancelled = false;
    fetch('/api/talkshow/ugc/me', { headers: { 'X-User-Id': myId } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { submissions: MySubmission[] }) => {
        if (!cancelled) setSubmissions(d.submissions ?? []);
      })
      .catch(() => { if (!cancelled) setSubmissions([]); });
    return () => { cancelled = true; };
  }, [myId]);

  if (submissions === null) {
    return (
      <div style={{
        width: '100%', maxWidth: 512, marginTop: 16,
        padding: '12px 16px', borderRadius: 14,
        background: 'rgba(255,79,163,0.04)',
        border: '1px dashed rgba(255,79,163,0.18)',
        textAlign: 'center', color: 'rgba(248,244,227,0.4)',
        fontSize: 11, fontWeight: 700,
      }}>UGC 投稿加载中…</div>
    );
  }

  // Empty state — guide user to PersonaCard ✍️ 编段子 button.
  if (submissions.length === 0) {
    return (
      <div style={{
        width: '100%', maxWidth: 512, marginTop: 16,
        padding: '14px 18px', borderRadius: 14,
        background: 'linear-gradient(135deg, rgba(255,79,163,0.06), rgba(176,134,255,0.04))',
        border: '1px dashed rgba(255,79,163,0.32)',
        color: 'rgba(248,244,227,0.7)',
      }}>
        <div style={{
          fontSize: 11, fontWeight: 900, letterSpacing: '0.15em',
          color: '#FF4FA3', textTransform: 'uppercase', marginBottom: 6,
        }}>✍️ 我的 UGC 投稿</div>
        <div style={{ fontSize: 12, lineHeight: 1.5 }}>
          还没投过段子. 去 Classic 模式 hover 任意鼠人 → 点 "✍️ 编段子"
          自动生成一条投稿. 通过后会出现在
          <span
            onClick={() => navigate('/talkshow/ugc')}
            style={{
              color: '#FFD700', cursor: 'pointer', fontWeight: 700,
              textDecoration: 'underline', textDecorationStyle: 'dashed',
              marginLeft: 4,
            }}
          >本月精选</span>.
        </div>
      </div>
    );
  }

  const pending = submissions.filter((s) => s.status === 'pending').length;
  const approved = submissions.filter((s) => s.status === 'approved').length;
  const rejected = submissions.filter((s) => s.status === 'rejected').length;
  const totalLikes = submissions.reduce((sum, s) => sum + (s.likes || 0), 0);

  return (
    <div style={{ width: '100%', maxWidth: 512, marginTop: 16 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8, padding: '0 4px',
      }}>
        <div style={{
          fontSize: 12, fontWeight: 900, letterSpacing: '0.18em',
          color: '#FF4FA3', textTransform: 'uppercase',
        }}>✍️ 我的 UGC 投稿</div>
        <div
          onClick={() => navigate('/talkshow/ugc')}
          style={{
            fontSize: 9, color: '#FFD700', fontWeight: 700, cursor: 'pointer',
            letterSpacing: '0.05em',
          }}
        >→ 本月精选</div>
      </div>
      <div style={{
        padding: '14px 18px', borderRadius: 14,
        background: 'linear-gradient(135deg, rgba(20,15,40,0.85), rgba(45,27,105,0.4))',
        border: '1px solid rgba(255,79,163,0.32)',
        display: 'flex', gap: 12, flexWrap: 'wrap',
      }}>
        <Stat label="待审核" value={pending} color="#FFD700" />
        <Stat label="已通过" value={approved} color="#5be24a" emphasis />
        <Stat label="被驳回" value={rejected} color="#ff6347" />
        <Stat label="累计赞" value={totalLikes} color="#FF4FA3" />
      </div>
      {pending > 0 && (
        <div style={{
          marginTop: 6, fontSize: 10, color: 'rgba(248,244,227,0.45)',
          textAlign: 'center', fontStyle: 'italic',
        }}>
          maker 通常 24h 内审核, 通过后立刻进精选池
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color, emphasis }: { label: string; value: number; color: string; emphasis?: boolean }) {
  return (
    <div style={{
      flex: '1 1 80px', minWidth: 70, textAlign: 'center',
      padding: '6px 4px', borderRadius: 8,
      background: emphasis ? `${color}14` : 'transparent',
      border: emphasis ? `1px solid ${color}45` : 'none',
    }}>
      <div style={{
        fontSize: 22, fontWeight: 900, color, lineHeight: 1,
        letterSpacing: '-0.02em',
      }}>{value}</div>
      <div style={{
        fontSize: 10, marginTop: 4, color: 'rgba(248,244,227,0.55)',
        fontWeight: 700, letterSpacing: '0.04em',
      }}>{label}</div>
    </div>
  );
}
