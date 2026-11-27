/**
 * modelStatus — v6.169.5 — 派生「模型当前状态」并暴露 React hook。
 *
 * 状态含义:
 *   unconfigured — 完全没有可用的 key(byok 模式没配 / server 模式 .env 也没配)
 *   unchecked    — 有页面 key,但还没跑过检测
 *   pass         — 检测全部达标
 *   warn         — 有推荐项不达标但必需项通过
 *   fail         — 有必需项不达标
 *   server       — server 模式且服务器有 key,但还没做检测(或不知道)
 */
import { useSyncExternalStore } from 'react';
import type { CapabilityOverall, CapabilityReport } from '@furball/shared';
import { useByok } from './byok';
import { useRuntimeConfig } from './runtimeConfig';
import { readCapability, fingerprintFor } from './capabilityCache';
import { useEffect, useState } from 'react';
import type { ByokConfig } from '@furball/shared';

export type ModelStatusValue = 'unconfigured' | 'unchecked' | 'pass' | 'warn' | 'fail' | 'server';

/** 把 CapabilityOverall 映射成 ModelStatusValue(有报告时调用)。 */
function mapOverall(overall: CapabilityOverall): Exclude<ModelStatusValue, 'unconfigured' | 'server'> {
  switch (overall) {
    case 'pass': return 'pass';
    case 'warn': return 'warn';
    case 'fail': return 'fail';
    case 'incomplete': return 'unchecked';
  }
}

// ---------------------------------------------------------------------------
// 纯函数:给测试用
// ---------------------------------------------------------------------------

export interface DeriveModelStatusInput {
  keyMode: 'server' | 'byok';
  /** 来自 LlmRuntime.serverKeyConfigured;老服务器没有此字段为 undefined。 */
  serverKeyConfigured: boolean | undefined;
  hasByok: boolean;
  /** 当前 key 对应的缓存报告;没有或过期为 null。 */
  report: CapabilityReport | null;
}

export function deriveModelStatus(input: DeriveModelStatusInput): ModelStatusValue {
  const { keyMode, serverKeyConfigured, hasByok, report } = input;
  if (hasByok) {
    // 有页面 key
    if (!report) return 'unchecked';
    return mapOverall(report.overall);
  }
  // 没有页面 key
  if (keyMode === 'byok') return 'unconfigured';
  // keyMode === 'server'
  if (serverKeyConfigured === false) return 'unconfigured';
  if (serverKeyConfigured === true) {
    // server 模式且服务器有 key
    if (!report) return 'server';
    return mapOverall(report.overall);
  }
  // serverKeyConfigured === undefined(老服务器,不知道)→ server
  return 'server';
}

// ---------------------------------------------------------------------------
// 订阅机制(检测完成后通知 hook 刷新)
// ---------------------------------------------------------------------------

/** 外部调用这个函数来通知「检测完成,缓存已更新」。 */
let capabilityVersion = 0;
const capabilityListeners = new Set<() => void>();

export function notifyCapabilityUpdated(): void {
  capabilityVersion += 1;
  for (const l of capabilityListeners) l();
}

function subscribeCapability(cb: () => void): () => void {
  capabilityListeners.add(cb);
  return () => capabilityListeners.delete(cb);
}

function getCapabilityVersion(): number {
  return capabilityVersion;
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export function useModelStatus(): ModelStatusValue {
  const byokCfg = useByok();
  const runtimeCfg = useRuntimeConfig();

  // 订阅 capabilityVersion 变化(检测完成后触发刷新)
  const version = useSyncExternalStore(subscribeCapability, getCapabilityVersion, getCapabilityVersion);

  const [report, setReport] = useState<CapabilityReport | null>(null);

  // 异步读取缓存(fingerprintFor 是 async)。页面 key 用页面配置的指纹;没有页面 key 时,
  // 本机 .env 模式用服务器模型名的指纹(和设置面板「检测服务器模型」写入时一致)。
  const serverModel = runtimeCfg?.llm.keyMode === 'server' && runtimeCfg.llm.serverKeyConfigured === true
    ? runtimeCfg.llm.serverModel : undefined;
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const fp = byokCfg
          ? await fingerprintFor(byokCfg as ByokConfig)
          : serverModel ? await fingerprintFor({ source: 'server', model: serverModel }) : null;
        const cached = fp ? readCapability(fp) : null;
        if (!cancelled) setReport(cached);
      } catch {
        if (!cancelled) setReport(null);
      }
    }
    void load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byokCfg, serverModel, version]);

  const keyMode = runtimeCfg?.llm.keyMode ?? 'server';
  const serverKeyConfigured = runtimeCfg?.llm.serverKeyConfigured;

  return deriveModelStatus({
    keyMode,
    serverKeyConfigured,
    hasByok: !!byokCfg,
    report,
  });
}

// ---------------------------------------------------------------------------
// 横幅在不在:横幅已经在说「还没有可用的模型」时,不再弹同义的「需要先配置 key」提示条
// ---------------------------------------------------------------------------

let bannersShowing = 0;

/** 横幅出现时调用,返回撤下时要调用的函数。 */
export function markModelBannerShowing(): () => void {
  bannersShowing += 1;
  let done = false;
  return () => { if (!done) { done = true; bannersShowing -= 1; } };
}

export function isModelBannerShowing(): boolean {
  return bannersShowing > 0;
}
