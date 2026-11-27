/**
 * ModelSettingsPanel — v6.169.5 — 「配置你自己的模型 key」(BYOK)+ 能力检测展示。
 *
 * v6.167 原:选模型商 → 粘贴 key → 选模型 → 「测试连接」→ 保存。
 * v6.169.5 新增:
 *   - 「测试连接」改为「检测模型」,读取新字段 capability / source。
 *   - 结果区逐项展示 capability.items,顶部一句总体结论。
 *   - overall = fail 时保存按钮变「仍然使用」并红色说明。
 *   - server 模式 + serverKeyConfigured = true 时显示服务器模型检测入口。
 *   - 检测完成后写入缓存并触发 useModelStatus 刷新。
 */
import { useEffect, useMemo, useState } from 'react';
import {
  BYOK_HEADER, BYOK_PROVIDERS, CAPABILITY_LEVELS, CAPABILITY_REASON_ZH,
  encodeByok, findProvider, maskKey, normalizeBaseURL, validateByok,
  type ByokConfig, type ByokProviderId, type ByokTtsMode,
  type CapabilityItem, type CapabilityReport,
} from '@furball/shared';
import { clearByok, isRemembered, saveByok, useByok } from '../../utils/byok';
import { useRuntimeConfig } from '../../utils/runtimeConfig';
import { trackEvent } from '../../utils/analytics';
import { fingerprintFor, readCapabilityEntry, writeCapability } from '../../utils/capabilityCache';
import { notifyCapabilityUpdated } from '../../utils/modelStatus';

interface CheckResult {
  ok: boolean;
  reason?: string;
  detail?: string;
  latencyMs?: number;
  provider?: string;
  model?: string;
  models?: string[] | null;
  modelListed?: boolean | null;
  tts?: 'browser' | 'ok' | 'failed';
  capability?: CapabilityReport;
  source?: 'byok' | 'server';
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
  network: '连不上模型商(网络不通或地址写错)',
  custom_base_url_disabled: '当前站点不允许自定义接口地址',
  https_required: '接口地址必须是 https',
  host_not_allowed: '这个接口地址不允许使用',
  resolves_to_private_address: '接口地址指向内网,不允许使用',
  dns_failed: '接口地址解析失败',
  dns_busy: '接口地址校验太频繁,请一分钟后再试',
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

// ---------------------------------------------------------------------------
// 能力检测结果展示辅助
// ---------------------------------------------------------------------------

const CAP_ICON: Record<string, string> = {
  pass: '✓', warn: '!', fail: '✕', error: '?', skipped: '–', unknown: '?',
};
const CAP_COLOR: Record<string, string> = {
  pass: '#a7f3d0', warn: '#fde68a', fail: '#fca5a5', error: '#94a3b8', skipped: '#64748b', unknown: '#94a3b8',
};
const CAP_NAME: Record<string, string> = {
  connect: '连通',
  roleplay: '不拒演',
  format: '按格式回答',
  speed: '响应速度',
  concurrency: '并发',
  reasoning: '非推理型',
  context: '上下文窗口',
  tts: '语音',
};
const LEVEL_ZH: Record<string, string> = {
  required: '必需', recommended: '推荐', optional: '可选',
};
/** 没有原因代码时,按状态补一句,免得一行只有图标。连通没过时后面各项都没测;连通过了还跳过的,各有原因。 */
function statusNote(item: CapabilityItem, connected: boolean): string {
  if (item.status === 'skipped') {
    if (!connected) return '连通没过,这一项没测';
    if (item.id === 'speed') return '台词没拿到,没法估算速度';
    if (item.id === 'tts') return '用浏览器朗读,不用测';
    return '这一项没测';
  }
  if (item.status === 'unknown') return '没法判断';
  return '';
}

const OVERALL_ZH: Record<string, string> = {
  pass: '检测通过',
  warn: '能用但有提醒',
  fail: '不达标',
  incomplete: '检测没跑完,可重试',
};
const OVERALL_COLOR: Record<string, string> = {
  pass: '#a7f3d0', warn: '#fde68a', fail: '#fca5a5', incomplete: '#94a3b8',
};

function formatCapValue(item: CapabilityItem): string {
  if (item.id === 'speed' && item.value !== undefined) {
    return `估算一段发言约 ${(item.value / 1000).toFixed(1)} 秒`;
  }
  if (item.id === 'context' && item.value !== undefined) {
    return `${item.value.toLocaleString()} tokens`;
  }
  if (item.id === 'concurrency' && item.value !== undefined) {
    return `5 个同时请求成功 ${item.value} 个`;
  }
  return '';
}

/** 总体结论那一行。没测完时写出是哪一项、什么原因,并说明这不等于模型不行。 */
function overallLine(report: CapabilityReport): string {
  if (report.overall !== 'incomplete') return OVERALL_ZH[report.overall] ?? report.overall;
  const stuck = report.items.find((i) => i.level === 'required' && (i.status === 'error' || i.status === 'unknown'));
  const why = stuck?.reason ? (CAPABILITY_REASON_ZH[stuck.reason] ?? stuck.reason) : '有必需项没测完';
  return `检测没完成:${why}。这不代表模型不达标,修好后再检测一次`;
}

/** 多久以前,给缓存结果用。 */
function ago(ts: number): string {
  const min = Math.max(0, Math.round((Date.now() - ts) / 60_000));
  if (min < 60) return min <= 1 ? '刚刚' : `${min} 分钟前`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} 小时前` : `${Math.round(h / 24)} 天前`;
}

function CapabilityResultSection({ report, cachedAt }: { report: CapabilityReport; cachedAt?: number }) {
  const overall = report.overall;
  const connected = report.items.find((i) => i.id === 'connect')?.status === 'pass';
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2" data-testid="capability-result" data-overall={overall}
      data-cached={cachedAt ? '1' : '0'} aria-live="polite">
      <div className="text-[12px] font-bold" style={{ color: OVERALL_COLOR[overall] }}>
        {overallLine(report)}
      </div>
      {cachedAt && (
        <div className="text-[11px] text-white/40" data-testid="capability-cached">
          上次检测:{ago(cachedAt)}(7 天内同一配置直接用这次的结果,不重复调用模型)
        </div>
      )}
      {report.items.map((item) => {
        const reason = item.reason ? (CAPABILITY_REASON_ZH[item.reason] ?? item.reason) : statusNote(item, connected);
        const valStr = formatCapValue(item);
        return (
          <div key={item.id} className="flex items-start gap-2 text-[11px]" data-testid={`capability-item-${item.id}`} data-status={item.status}>
            <span style={{ color: CAP_COLOR[item.status] ?? '#fff', minWidth: 12 }}>
              {CAP_ICON[item.status] ?? '?'}
            </span>
            <span className="text-white/70 min-w-[60px]">{CAP_NAME[item.id] ?? item.id}</span>
            <span className="text-white/35 min-w-[32px]">{LEVEL_ZH[CAPABILITY_LEVELS[item.id] ?? item.id] ?? ''}</span>
            <span className="text-white/50 flex-1">
              {reason}
              {valStr && <span className="ml-1 text-white/40">{valStr}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function ModelSettingsPanel({ onSaved, compact = false }: { onSaved?: () => void; compact?: boolean }) {
  const saved = useByok();
  const runtime = useRuntimeConfig();
  const allowCustom = runtime?.llm.customBaseUrl ?? true;
  const serverKeyConfigured = runtime?.llm.serverKeyConfigured;
  const keyMode = runtime?.llm.keyMode ?? 'server';
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
  // 检测结果连同「它是对哪份配置做的」一起存;配置一改,结果自然不再对得上(不靠 effect 清空,避免时序问题)
  const [checkRaw, setCheck] = useState<(CheckResult & { forKey: string }) | null>(null);
  const [cached, setCached] = useState<{ report: CapabilityReport; savedAt: number; forKey: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // v6.169.5 — server 模式检测
  const [checkingServer, setCheckingServer] = useState(false);
  const [serverCheck, setServerCheck] = useState<CheckResult | null>(null);
  const [serverCached, setServerCached] = useState<{ report: CapabilityReport; savedAt: number } | null>(null);

  const preset = findProvider(provider)!;

  // 换模型商:模型换成该家的推荐;语音若该家不支持就退回浏览器朗读。
  useEffect(() => {
    if (saved?.provider === provider) return;
    setModel(preset.suggestedModels[0] ?? '');
    setCheck(null);
    if (ttsMode === 'provider' && !preset.tts) setTtsMode('browser');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  // 检测结果只对检测时的那份配置有效(模型商、地址、模型、快速模型、key)。
  // 地址按保存时的同一规则规范化(去末尾 /),否则缓存对不上、保存后也不显示「已保存」
  const normBase = provider === 'custom' ? normalizeBaseURL(baseURL) : '';
  const draftKey = JSON.stringify([provider, normBase, model.trim(), fastModel.trim(), apiKey.trim()]);
  const check = checkRaw && checkRaw.forKey === draftKey ? checkRaw : null;

  // 同一份配置 7 天内检测过:直接显示上次的结果,不重复调用模型(计划验收第 7 条)
  useEffect(() => {
    let cancelled = false;
    const key = draftKey;
    if (!apiKey.trim() || !model.trim()) { setCached(null); return; }
    fingerprintFor({ v: 1, provider, apiKey: apiKey.trim(), model: model.trim(), ...(provider === 'custom' ? { baseURL: normBase } : {}) })
      .then((fp) => { if (!cancelled) { const e = readCapabilityEntry(fp); setCached(e ? { ...e, forKey: key } : null); } })
      .catch(() => { if (!cancelled) setCached(null); });
    return () => { cancelled = true; };
  }, [draftKey, provider, apiKey, model, normBase]);

  // 服务器 .env 模型的缓存结果
  const serverModel = runtime?.llm.serverModel;
  useEffect(() => {
    let cancelled = false;
    if (!serverModel) { setServerCached(null); return; }
    fingerprintFor({ source: 'server', model: serverModel })
      .then((fp) => { if (!cancelled) setServerCached(readCapabilityEntry(fp)); })
      .catch(() => { if (!cancelled) setServerCached(null); });
    return () => { cancelled = true; };
  }, [serverModel, checkingServer]);

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

  // v6.169.5 — 检测完成后写入缓存并通知刷新
  async function persistCapability(cfg: ByokConfig | { source: 'server'; model: string }, report: CapabilityReport) {
    try {
      const fp = await fingerprintFor(cfg);
      writeCapability(fp, report);
      notifyCapabilityUpdated();
    } catch { /* 写缓存失败不影响主流程 */ }
  }

  /**
   * 「保存并检测」/「重新检测」:先检测,再决定存不存。
   *   连通没过(key 错、地址错、连不上)→ 不保存,说明原因(计划验收第 2 条)
   *   必需项不达标 → 不自动保存,给出「仍然使用」(决策 D8)
   *   其他(通过、有提醒、后面几项没测完)→ 保存;全部通过时关掉弹窗,有提醒就留着让人看完
   */
  const runCheck = async () => {
    const cfg = validate();
    if (!cfg) return;
    if (!httpsOk(cfg)) return;
    const forKey = draftKey;
    setChecking(true);
    setCheck(null);
    setMsg(null);
    try {
      // 显式带上草稿的凭据(还没保存);拦截器看到已有头就不会覆盖
      const r = await fetch('/api/llm/check', { method: 'POST', headers: { [BYOK_HEADER]: encodeByok(cfg) } });
      const j = await r.json().catch(() => ({ ok: false, reason: 'error' })) as CheckResult & { retryAfterSec?: number };
      setCheck({ ...j, forKey });
      trackEvent('byok_test', { provider, result: j.ok ? (j.capability?.overall ?? 'ok') : (j.reason ?? 'error') });
      if (j.capability) await persistCapability(cfg, j.capability);
      if (!j.capability) {
        setMsg(j.retryAfterSec ? `检测太频繁,请 ${j.retryAfterSec} 秒后再试;没有保存` : '没有保存');
      } else if (!j.ok) {
        setMsg('连通没过,没有保存');
      } else if (j.capability.overall !== 'fail') {
        commitSave(cfg, j.capability.overall);
      }
    } catch {
      setCheck({ ok: false, reason: 'network', forKey });
      setMsg('连不上本站服务器,没有保存');
    } finally {
      setChecking(false);
    }
  };

  // v6.169.5 — 检测服务器模型(不带 byok 头)
  const runServerCheck = async () => {
    setCheckingServer(true);
    setServerCheck(null);
    try {
      const r = await fetch('/api/llm/check', { method: 'POST' });
      const j = await r.json().catch(() => ({ ok: false, reason: 'error' })) as CheckResult;
      setServerCheck(j);
      if (j.capability && j.model) {
        await persistCapability({ source: 'server', model: j.model }, j.capability);
      }
    } catch {
      setServerCheck({ ok: false, reason: 'timeout' });
    } finally {
      setCheckingServer(false);
    }
  };

  // 托管站点只接受 https 的自定义地址(服务端同一规则),检测前就拦下
  const httpsOk = (cfg: ByokConfig): boolean => {
    if (cfg.baseURL && runtime?.profile === 'hosted' && !/^https:\/\//i.test(cfg.baseURL)) {
      setMsg(REASON_ZH.https_required);
      return false;
    }
    return true;
  };

  /** 真正写入。overall 决定提示和要不要关弹窗。 */
  const commitSave = (cfg: ByokConfig, overall: CapabilityReport['overall'] | 'cached' | 'forced') => {
    const err = saveByok(cfg, remember);
    if (err) { setMsg(ERR_ZH[err] ?? err); return; }
    trackEvent('byok_saved', { provider, remember, tts: cfg.tts?.mode ?? 'browser', tested: overall });
    notifyCapabilityUpdated();
    if (overall === 'pass' || overall === 'cached') {
      setMsg('✓ 已保存');
      onSaved?.();
    } else if (overall === 'forced') {
      setMsg('已保存。有必需项不达标,游戏里可能经常出戏或退回固定台词');
    } else if (overall === 'incomplete') {
      setMsg('已保存(连通没问题)。有几项没测完,可以稍后点「重新检测」');
    } else {
      setMsg('已保存。上面有几项提醒,看完可以关掉这个窗口');
    }
  };

  /** 不再检测,直接保存:7 天内检测过且连通的同一份配置,或者不达标时用户选「仍然使用」。 */
  const saveWithoutCheck = (forced: boolean) => {
    const cfg = validate();
    if (!cfg || !httpsOk(cfg)) return;
    commitSave(cfg, forced ? 'forced' : 'cached');
  };

  const listed = check?.models ?? null;
  // 眼下要展示、要据以决定按钮的结果:这次刚测的,或者 7 天内同一配置的缓存
  const liveReport = check?.capability ?? null;
  const cachedNow = !check && cached && cached.forKey === draftKey ? cached : null;
  const report = liveReport ?? cachedNow?.report ?? null;
  const connectOk = !!report && report.items.find((i) => i.id === 'connect')?.status === 'pass';
  const capFail = report?.overall === 'fail';
  const failReasons = capFail
    ? (report?.items ?? []).filter((i) => i.status === 'fail' && i.reason)
      .map((i) => `${CAP_NAME[i.id] ?? i.id}:${CAPABILITY_REASON_ZH[i.reason!] ?? i.reason!}`)
    : [];
  const isSaved = !!saved && JSON.stringify([saved.provider, saved.provider === 'custom' ? saved.baseURL ?? '' : '', saved.model, saved.fastModel ?? '', saved.apiKey]) === draftKey;

  return (
    <div className={`text-left ${compact ? 'space-y-3' : 'space-y-4'}`} data-testid="model-settings">
      {saved && (
        <div className="text-[11px] text-emerald-300/80">
          当前:{findProvider(saved.provider)?.name} · {saved.model} · key {maskKey(saved.apiKey)}
          {isRemembered() ? ' · 已在本机记住' : ' · 仅本标签页'}
        </div>
      )}

      {/* v6.169.5 — server 模式且 .env 有 key 时,显示服务器模型检测入口 */}
      {/* serverModel 只在配了主路 key 时有;只配了 MiniMax 备路时没有可测的主路模型 */}
      {keyMode === 'server' && serverKeyConfigured === true && !!serverModel && !saved && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
          <div className="text-[12px] text-white/60">
            当前用的是服务器 .env 里配置的模型{runtime?.llm.serverModel ? `(${runtime.llm.serverModel})` : ''}。
            检测的是 OPENAI_MODEL 这一个;单独配了 FIRED_HR_MODEL 等的地方不在其内
          </div>
          <button
            type="button"
            onClick={runServerCheck}
            disabled={checkingServer}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white/90 bg-white/[0.08] border border-white/15 disabled:opacity-50"
            data-testid="server-check"
          >
            {checkingServer ? '检测中…(约 5–15 秒)' : serverCached ? '重新检测服务器模型' : '检测服务器模型'}
          </button>
          {serverCheck?.capability && <CapabilityResultSection report={serverCheck.capability} />}
          {!serverCheck?.capability && serverCached && <CapabilityResultSection report={serverCached.report} cachedAt={serverCached.savedAt} />}
          {serverCheck && !serverCheck.capability && (
            <div className="text-[12px] text-amber-300" data-testid="server-check-error">
              ✗ {(serverCheck as { retryAfterSec?: number }).retryAfterSec
                ? `检测太频繁(用的是服务器的 key,每 10 分钟最多 3 次),请 ${(serverCheck as { retryAfterSec?: number }).retryAfterSec} 秒后再试`
                : REASON_ZH[serverCheck.detail ?? ''] ?? REASON_ZH[serverCheck.reason ?? 'error'] ?? '调用失败'}
            </div>
          )}
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
            onChange={(e) => setApiKey(e.target.value)}
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
          {listed ? `已从模型商拉到 ${listed.length} 个可用模型,点输入框可选` : '检测时会顺便拉到这个 key 能用的模型列表'}
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
        {/* v6.169.5 —「测试连接」+「保存」合成「保存并检测」:先检测,连通了才保存(计划 2.3、验收第 2 条) */}
        {report && connectOk ? (
          <>
            {capFail ? (
              <button type="button" onClick={() => saveWithoutCheck(true)} disabled={checking || isSaved}
                className="px-4 py-2 rounded-xl text-xs font-black text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#9b1c1c,#b91c1c)' }}
                data-testid="byok-save">
                {isSaved ? '已在使用' : '仍然使用'}
              </button>
            ) : (
              <button type="button" onClick={() => saveWithoutCheck(false)} disabled={checking || isSaved}
                className="px-4 py-2 rounded-xl text-xs font-black text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#7c3aed,#ff5588)' }}
                data-testid="byok-save">
                {isSaved ? '已保存' : '保存'}
              </button>
            )}
            <button type="button" onClick={runCheck} disabled={checking || !apiKey.trim()}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white/90 bg-white/[0.08] border border-white/15 disabled:opacity-50"
              data-testid="byok-check">
              {checking ? '检测中…(约 5–15 秒)' : '重新检测'}
            </button>
          </>
        ) : (
          <button type="button" onClick={runCheck} disabled={checking || !apiKey.trim()}
            className="px-4 py-2 rounded-xl text-xs font-black text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#7c3aed,#ff5588)' }}
            data-testid="byok-check">
            {checking ? '检测中…(约 5–15 秒)' : '保存并检测'}
          </button>
        )}
        {saved && (
          <button type="button" onClick={() => { clearByok(); setApiKey(''); setCheck(null); setMsg('已清除'); }}
            className="px-3 py-2 rounded-xl text-xs text-white/55 border border-white/10">
            清除
          </button>
        )}
      </div>

      {/* v6.169.5 — 必需项不达标:红色说明是哪一项、为什么 */}
      {capFail && failReasons.length > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-300/90 space-y-1" data-testid="capability-fail-list">
          <div className="font-bold">不达标项:</div>
          {failReasons.map((r, i) => <div key={i}>• {r}</div>)}
        </div>
      )}

      {/* v6.169.5 — 能力检测详细结果(这次刚测的,或 7 天内的缓存) */}
      {report && <CapabilityResultSection report={report} cachedAt={liveReport ? undefined : cachedNow?.savedAt} />}

      {/* 没有检测报告的失败(配置不合法、检测太频繁、连不上本站) */}
      {check && !check.capability && (
        <div className="text-[12px] text-amber-300" data-testid="byok-check-result">
          ✗ {REASON_ZH[check.detail ?? ''] ?? REASON_ZH[check.reason ?? 'error'] ?? '调用失败'}
        </div>
      )}
      {msg && <div className="text-[12px] text-white/70" data-testid="byok-msg" role="status">{msg}</div>}

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[11px] leading-relaxed text-white/50">
        <p>🔒 key 只保存在你的浏览器里。每次需要 AI 时,它随请求发给本站服务器,由服务器转发给你选的模型商;服务器不保存、不写日志、不给其他人用。运营者在技术上能看到经过的请求——不放心可以用本地部署版。</p>
        <p className="mt-1.5">💰 费用由你的模型商账户支付。一局经典局约 2–3.5 万 token(本地实测 + DeepSeek 官方换算,2026-10),按 DeepSeek 等国产模型的公开价一局约几分钱;以官网价格为准。</p>
      </div>
    </div>
  );
}
