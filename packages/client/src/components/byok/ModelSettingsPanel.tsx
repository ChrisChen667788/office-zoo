/**
 * ModelSettingsPanel — v6.167 — 「配置你自己的模型 key」(BYOK)。
 *
 * 托管版不提供模型 API(owner 决策),AI 发言、HR 对话、编剧都用访客在这里配置的 key。
 * 用在两处:全局弹窗(ModelSetupHost)和设置页。
 *
 * 交互:选模型商 → 粘贴 key → 选模型 → 「测试连接」(用这份草稿实际调一次,并拉取该 key 能用的
 * 模型列表供选择)→ 保存。默认只存在本标签页,勾选「在本机记住」才写进浏览器本地存储。
 */
import { useEffect, useMemo, useState } from 'react';
import {
  BYOK_HEADER, BYOK_PROVIDERS, encodeByok, findProvider, maskKey, validateByok,
  type ByokConfig, type ByokProviderId, type ByokTtsMode,
} from '@furball/shared';
import { clearByok, isRemembered, saveByok, useByok } from '../../utils/byok';
import { useRuntimeConfig } from '../../utils/runtimeConfig';
import { trackEvent } from '../../utils/analytics';

interface CheckResult {
  ok: boolean;
  reason?: string;
  detail?: string;
  latencyMs?: number;
  models?: string[] | null;
  modelListed?: boolean | null;
  tts?: 'browser' | 'ok' | 'failed';
}

const REASON_ZH: Record<string, string> = {
  need_key: '还没填 key',
  invalid_config: '配置没通过校验',
  key_rejected: 'key 被模型商拒绝(填错了或已失效)',
  quota: '账户余额不足',
  rate_limited: '请求太频繁,稍后再试',
  timeout: '连接超时(模型商可能在境外或网络不通)',
  error: '调用失败(模型名可能不对,或该 key 无权使用这个模型)',
  empty: '模型返回了空内容',
  custom_base_url_disabled: '当前站点不允许自定义接口地址',
  https_required: '接口地址必须是 https',
  host_not_allowed: '这个接口地址不允许使用',
  resolves_to_private_address: '接口地址指向内网,不允许使用',
  dns_failed: '接口地址解析失败',
};

const ERR_ZH: Record<string, string> = {
  bad_key: 'key 格式不对(8–512 位、不能有空格)',
  bad_model: '模型名格式不对',
  bad_fast_model: '快速模型名格式不对',
  bad_base_url: '接口地址格式不对',
  bad_tts_key: 'MiniMax 语音 key 格式不对',
  bad_tts_group: 'GroupId 只能是数字',
  provider_has_no_tts: '这家模型商没有语音接口',
};

export default function ModelSettingsPanel({ onSaved, compact = false }: { onSaved?: () => void; compact?: boolean }) {
  const saved = useByok();
  const runtime = useRuntimeConfig();
  const allowCustom = runtime?.llm.customBaseUrl ?? true;
  const providers = useMemo(() => BYOK_PROVIDERS.filter((p) => p.id !== 'custom' || allowCustom), [allowCustom]);

  const [provider, setProvider] = useState<ByokProviderId>(saved?.provider ?? 'deepseek');
  const [apiKey, setApiKey] = useState(saved?.apiKey ?? '');
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState(saved?.model ?? findProvider('deepseek')!.suggestedModels[0]);
  const [fastModel, setFastModel] = useState(saved?.fastModel ?? '');
  const [baseURL, setBaseURL] = useState(saved?.baseURL ?? '');
  const [ttsMode, setTtsMode] = useState<ByokTtsMode>(saved?.tts?.mode ?? 'browser');
  const [minimaxKey, setMinimaxKey] = useState(saved?.tts?.minimaxKey ?? '');
  const [minimaxGroupId, setMinimaxGroupId] = useState(saved?.tts?.minimaxGroupId ?? '');
  const [remember, setRemember] = useState(() => isRemembered());
  const [advanced, setAdvanced] = useState(!!(saved?.fastModel || (saved?.tts && saved.tts.mode !== 'browser')));
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const preset = findProvider(provider)!;

  // 换模型商:模型换成该家的推荐;语音若该家不支持就退回浏览器朗读。
  useEffect(() => {
    if (saved?.provider === provider) return;
    setModel(preset.suggestedModels[0] ?? '');
    setCheck(null);
    if (ttsMode === 'provider' && !preset.tts) setTtsMode('browser');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const draft = (): ByokConfig => ({
    v: 1,
    provider,
    apiKey: apiKey.trim(),
    model: model.trim(),
    ...(fastModel.trim() ? { fastModel: fastModel.trim() } : {}),
    ...(provider === 'custom' ? { baseURL: baseURL.trim() } : {}),
    ...(ttsMode !== 'browser'
      ? { tts: { mode: ttsMode, ...(ttsMode === 'minimax' ? { minimaxKey: minimaxKey.trim(), ...(minimaxGroupId.trim() ? { minimaxGroupId: minimaxGroupId.trim() } : {}) } : {}) } }
      : {}),
  });

  const validate = (): ByokConfig | null => {
    const v = validateByok(draft());
    if (!v.ok) { setMsg(ERR_ZH[v.error] ?? `配置不完整(${v.error})`); return null; }
    setMsg(null);
    return v.config;
  };

  const runCheck = async () => {
    const cfg = validate();
    if (!cfg) return;
    setChecking(true);
    setCheck(null);
    try {
      // 显式带上草稿的凭据(还没保存);拦截器看到已有头就不会覆盖
      const r = await fetch('/api/llm/check', { method: 'POST', headers: { [BYOK_HEADER]: encodeByok(cfg) } });
      const j = await r.json().catch(() => ({ ok: false, reason: 'error' })) as CheckResult;
      setCheck(j);
      trackEvent('byok_test', { provider, result: j.ok ? 'ok' : (j.reason ?? 'error') });
    } catch {
      setCheck({ ok: false, reason: 'timeout' });
    } finally {
      setChecking(false);
    }
  };

  const save = () => {
    const cfg = validate();
    if (!cfg) return;
    // 托管站点只接受 https 的自定义地址(服务端同一规则);没点「测试连接」直接保存时也要先拦下,
    // 否则存下来之后每个请求都被拒,访客只看到笼统的「配置无效」。
    if (cfg.baseURL && runtime?.profile === 'hosted' && !/^https:\/\//i.test(cfg.baseURL)) {
      setMsg(REASON_ZH.https_required);
      return;
    }
    const err = saveByok(cfg, remember);
    if (err) { setMsg(ERR_ZH[err] ?? err); return; }
    trackEvent('byok_saved', { provider, remember, tts: cfg.tts?.mode ?? 'browser', tested: !!check?.ok });
    setMsg('✓ 已保存');
    onSaved?.();
  };

  const listed = check?.models ?? null;

  return (
    <div className={`text-left ${compact ? 'space-y-3' : 'space-y-4'}`} data-testid="model-settings">
      {saved && (
        <div className="text-[11px] text-emerald-300/80">
          当前:{findProvider(saved.provider)?.name} · {saved.model} · key {maskKey(saved.apiKey)}
          {isRemembered() ? ' · 已在本机记住' : ' · 仅本标签页'}
        </div>
      )}

      <label className="block">
        <span className="text-[12px] text-white/70">模型商</span>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as ByokProviderId)}
          className="mt-1 w-full rounded-lg bg-white/[0.06] border border-white/15 px-3 py-2 text-sm text-white"
          data-testid="byok-provider"
        >
          {providers.map((p) => <option key={p.id} value={p.id} className="bg-[#14122a]">{p.name}</option>)}
        </select>
        <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/45">
          {preset.note && <span>{preset.note}</span>}
          {preset.keyUrl && <a href={preset.keyUrl} target="_blank" rel="noopener noreferrer" className="underline text-sky-300/80">申请 / 管理 key ↗</a>}
          {preset.pricingUrl && <a href={preset.pricingUrl} target="_blank" rel="noopener noreferrer" className="underline text-sky-300/80">官方价格 ↗</a>}
        </span>
      </label>

      {provider === 'custom' && (
        <label className="block">
          <span className="text-[12px] text-white/70">接口地址(OpenAI 兼容,必须 https)</span>
          <input value={baseURL} onChange={(e) => setBaseURL(e.target.value)} placeholder="https://your-llm.example.com/v1"
            className="mt-1 w-full rounded-lg bg-white/[0.06] border border-white/15 px-3 py-2 text-sm text-white" />
        </label>
      )}

      <label className="block">
        <span className="text-[12px] text-white/70">API key</span>
        <div className="mt-1 flex gap-2">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); setCheck(null); }}
            placeholder="sk-…"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 min-w-0 rounded-lg bg-white/[0.06] border border-white/15 px-3 py-2 text-sm text-white font-mono"
            data-testid="byok-key"
          />
          <button type="button" onClick={() => setShowKey((v) => !v)} className="px-3 rounded-lg text-[11px] text-white/60 bg-white/[0.05] border border-white/10">
            {showKey ? '隐藏' : '显示'}
          </button>
        </div>
      </label>

      <label className="block">
        <span className="text-[12px] text-white/70">模型</span>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          list="byok-models"
          placeholder={preset.suggestedModels[0] ?? '填模型商给的模型 id'}
          className="mt-1 w-full rounded-lg bg-white/[0.06] border border-white/15 px-3 py-2 text-sm text-white font-mono"
          data-testid="byok-model"
        />
        <datalist id="byok-models">
          {[...new Set([...(listed ?? []), ...preset.suggestedModels])].map((m) => <option key={m} value={m} />)}
        </datalist>
        <span className="mt-1 block text-[11px] text-white/40">
          {listed ? `已从模型商拉到 ${listed.length} 个可用模型,点输入框可选` : '先「测试连接」,可以拉到这个 key 能用的模型列表'}
        </span>
      </label>

      <button type="button" onClick={() => setAdvanced((v) => !v)} className="text-[11px] text-white/50 underline underline-offset-2">
        {advanced ? '收起高级设置' : '高级设置:快速模型 / 语音'}
      </button>
      {advanced && (
        <div className="space-y-3 rounded-xl border border-white/10 p-3">
          <label className="block">
            <span className="text-[12px] text-white/70">快速模型(可选,用于投票等短输出;不填用上面的模型)</span>
            <input value={fastModel} onChange={(e) => setFastModel(e.target.value)} list="byok-models"
              className="mt-1 w-full rounded-lg bg-white/[0.06] border border-white/15 px-3 py-2 text-sm text-white font-mono" />
          </label>
          <fieldset>
            <legend className="text-[12px] text-white/70">角色语音</legend>
            <div className="mt-1 space-y-1 text-[12px] text-white/75">
              <label className="flex items-center gap-2">
                <input type="radio" checked={ttsMode === 'browser'} onChange={() => setTtsMode('browser')} /> 浏览器自带朗读(免费,音色取决于系统)
              </label>
              {preset.tts && (
                <label className="flex items-center gap-2">
                  <input type="radio" checked={ttsMode === 'provider'} onChange={() => setTtsMode('provider')} /> 用同一个 key 的语音合成({preset.tts.model})
                </label>
              )}
              <label className="flex items-center gap-2">
                <input type="radio" checked={ttsMode === 'minimax'} onChange={() => setTtsMode('minimax')} /> MiniMax 语音(另填 key,中文音色最好)
              </label>
            </div>
            {ttsMode === 'minimax' && (
              <div className="mt-2 flex gap-2">
                <input type="password" value={minimaxKey} onChange={(e) => setMinimaxKey(e.target.value)} placeholder="MiniMax key" autoComplete="off"
                  className="flex-1 min-w-0 rounded-lg bg-white/[0.06] border border-white/15 px-3 py-2 text-sm text-white font-mono" />
                <input value={minimaxGroupId} onChange={(e) => setMinimaxGroupId(e.target.value)} placeholder="GroupId(可选)"
                  className="w-32 rounded-lg bg-white/[0.06] border border-white/15 px-3 py-2 text-sm text-white font-mono" />
              </div>
            )}
          </fieldset>
        </div>
      )}

      <label className="flex items-center gap-2 text-[12px] text-white/70">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} data-testid="byok-remember" />
        在本机记住(不勾选则关掉标签页就清除;公用电脑不要勾)
      </label>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={runCheck} disabled={checking || !apiKey.trim()}
          className="px-4 py-2 rounded-xl text-xs font-bold text-white/90 bg-white/[0.08] border border-white/15 disabled:opacity-50"
          data-testid="byok-check">
          {checking ? '测试中…' : '测试连接'}
        </button>
        <button type="button" onClick={save} disabled={!apiKey.trim()}
          className="px-4 py-2 rounded-xl text-xs font-black text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg,#7c3aed,#ff5588)' }}
          data-testid="byok-save">
          保存
        </button>
        {saved && (
          <button type="button" onClick={() => { clearByok(); setApiKey(''); setCheck(null); setMsg('已清除'); }}
            className="px-3 py-2 rounded-xl text-xs text-white/55 border border-white/10">
            清除
          </button>
        )}
      </div>

      {check && (
        <div className={`text-[12px] ${check.ok ? 'text-emerald-300' : 'text-amber-300'}`} data-testid="byok-check-result">
          {check.ok
            ? `✓ 可用 · ${((check.latencyMs ?? 0) / 1000).toFixed(1)} 秒${check.modelListed === false ? ' · 注意:这个模型不在该 key 的模型列表里' : ''}${check.tts === 'failed' ? ' · 语音合成失败,将用浏览器朗读' : ''}`
            : `✗ ${REASON_ZH[check.detail ?? ''] ?? REASON_ZH[check.reason ?? 'error'] ?? '调用失败'}`}
        </div>
      )}
      {msg && <div className="text-[12px] text-white/70">{msg}</div>}

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[11px] leading-relaxed text-white/50">
        <p>🔒 key 只保存在你的浏览器里。每次需要 AI 时,它随请求发给本站服务器,由服务器转发给你选的模型商;服务器不保存、不写日志、不给其他人用。运营者在技术上能看到经过的请求——不放心可以用本地部署版。</p>
        <p className="mt-1.5">💰 费用由你的模型商账户支付。一局经典局约 2–3.5 万 token(本地实测 + DeepSeek 官方换算,2026-10),按 DeepSeek 等国产模型的公开价一局约几分钱;以官网价格为准。</p>
      </div>
    </div>
  );
}
