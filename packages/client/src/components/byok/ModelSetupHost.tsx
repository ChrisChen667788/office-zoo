/**
 * ModelSetupHost — v6.167 — 全局挂一次:模型设置弹窗 + 模型问题提示条。
 *
 * 触发来源:
 *   - requireModel()(入口处主动拦:托管版没配 key)
 *   - 服务端回馈:响应头 X-Llm-Error(byok.ts 的 fetch 拦截器)/ game:error{code:'need_key'} /
 *     squad:error{code:'need_key'} / game:llm_error{reason}
 * need_key / 配置无效 → 弹设置;key 被拒 / 欠费 / 限流 → 顶部提示条(同一原因 60 秒内只提示一次)。
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ModelSettingsPanel from './ModelSettingsPanel';
import { closeModelSetup, openModelSetup, useModelSetup } from '../../utils/modelSetup';
import { emitLlmIssue, getByok, onLlmIssue, type LlmIssue } from '../../utils/byok';
import { getSocket } from '../../hooks/useSocket';
import { trackEvent } from '../../utils/analytics';

const ISSUE_TEXT: Partial<Record<LlmIssue, string>> = {
  need_key_hint: 'AI 生成的内容需要先配置你自己的模型 key,现在显示的是预置内容',
  key_rejected: '你的模型 key 被模型商拒绝了(填错或已失效),AI 正在用兜底台词',
  quota: '你的模型商账户余额不足,AI 正在用兜底台词',
  rate_limited: '模型商限流了,稍后会恢复',
};

export default function ModelSetupHost() {
  const setup = useModelSetup();
  const navigate = useNavigate();
  const [toast, setToast] = useState<LlmIssue | null>(null);
  const lastShown = useRef<Partial<Record<LlmIssue, number>>>({});
  const [samples, setSamples] = useState<Array<{ gameId: string }>>([]);

  useEffect(() => onLlmIssue((issue) => {
    if (issue === 'need_key') { openModelSetup('need_key', 'server'); return; }
    if (issue === 'invalid_config') { if (getByok()) openModelSetup('invalid_config', 'server'); return; }
    const now = Date.now();
    // 缺 key 的轻提示每次打开页面只出一次;其余同一原因 60 秒内只提示一次
    if (issue === 'need_key_hint' && lastShown.current.need_key_hint) return;
    if ((lastShown.current[issue] ?? 0) > now - 60_000) return;
    lastShown.current[issue] = now;
    setToast(issue);
  }), []);

  // Socket 侧的同类回馈
  useEffect(() => {
    const s = getSocket();
    const onGameError = (d: { code?: string }) => { if (d?.code === 'need_key') emitLlmIssue('need_key'); };
    const onLlmError = (d: { reason?: string }) => {
      if (d?.reason === 'key_rejected' || d?.reason === 'quota' || d?.reason === 'rate_limited' || d?.reason === 'need_key') emitLlmIssue(d.reason);
    };
    s.on('game:error', onGameError);
    s.on('squad:error', onGameError);
    s.on('game:llm_error', onLlmError);
    return () => { s.off('game:error', onGameError); s.off('squad:error', onGameError); s.off('game:llm_error', onLlmError); };
  }, []);

  // 弹窗打开时取一次示例对局列表:没 key 的访客可以先看一局
  useEffect(() => {
    if (!setup.open || samples.length) return;
    fetch('/api/replay/samples').then((r) => (r.ok ? r.json() : null))
      .then((j: { samples?: Array<{ gameId: string }> } | null) => setSamples(j?.samples ?? []))
      .catch(() => {});
  }, [setup.open, samples.length]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast === 'need_key_hint' ? 6000 : 8000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <>
      {toast && ISSUE_TEXT[toast] && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[70] max-w-[92vw] rounded-xl px-4 py-2.5 text-[12px] text-white shadow-lg flex items-center gap-3"
          style={{ background: 'rgba(120,53,15,0.92)', border: '1px solid rgba(251,191,36,0.45)' }} role="status" data-testid="llm-issue-toast">
          <span>{toast === 'need_key_hint' ? '🔑' : '⚠️'} {ISSUE_TEXT[toast]}</span>
          <button type="button" className="underline text-amber-200 whitespace-nowrap" onClick={() => { setToast(null); openModelSetup('manual', 'toast'); }}>{toast === 'need_key_hint' ? '去配置' : '检查设置'}</button>
        </div>
      )}

      {setup.open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="配置你自己的模型 key"
          style={{ background: 'rgba(5,5,16,0.72)', backdropFilter: 'blur(6px)' }} onClick={closeModelSetup} data-testid="model-setup-modal">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-5 md:p-6"
            style={{ background: 'linear-gradient(160deg,#1a1333,#0d0b1e)', border: '1px solid rgba(255,255,255,0.12)' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="text-lg font-black text-white">配置你自己的模型 key</h2>
                <p className="text-[12px] text-white/55 mt-1 leading-relaxed">
                  {setup.reason === 'invalid_config'
                    ? '服务器没接受你保存的配置(可能是接口地址被限制),请检查后重新保存。'
                    : 'OFFICE ZOO 不提供模型 API:AI 鼠人的每句台词都由你自己的模型 key 生成,费用直接记在你的模型商账户上。'}
                </p>
              </div>
              <button type="button" onClick={closeModelSetup} className="text-white/50 hover:text-white text-xl leading-none" aria-label="关闭">×</button>
            </div>

            {samples.length > 0 && !getByok() && (
              <button type="button"
                onClick={() => { trackEvent('sample_replay_view', { from: 'model_setup' }); closeModelSetup(); navigate(`/result/${samples[0].gameId}`); }}
                className="w-full mb-4 rounded-xl px-4 py-2.5 text-[12px] text-amber-100 text-left"
                style={{ background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.35)' }}
                data-testid="sample-replay-cta">
                🎬 还没有 key?先看一局示例对局(真实模型跑出来的,不用 key)→
              </button>
            )}

            <ModelSettingsPanel compact onSaved={() => setTimeout(closeModelSetup, 600)} />
          </div>
        </div>
      )}
    </>
  );
}
