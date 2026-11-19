/**
 * modelSetup — v6.167 — 「先配置模型」的统一入口。
 *
 *   requireModel(source):托管版(keyMode=byok)且还没配 key → 打开设置弹窗并返回 false,调用方就此停手;
 *   其余情况返回 true。服务端的 need_key 回馈(响应头 / game:error / squad:error)也走同一个弹窗。
 */
import { useSyncExternalStore } from 'react';
import { getByok } from './byok';
import { peekRuntimeConfig } from './runtimeConfig';
import { trackEvent } from './analytics';

export interface ModelSetupState {
  open: boolean;
  reason: 'need_key' | 'manual' | 'invalid_config';
  source?: string;
}

let state: ModelSetupState = { open: false, reason: 'manual' };
const listeners = new Set<() => void>();

function set(next: ModelSetupState) {
  state = next;
  for (const l of listeners) l();
}

export function openModelSetup(reason: ModelSetupState['reason'] = 'manual', source?: string): void {
  if (state.open) return;
  trackEvent('byok_open', { reason, source });
  set({ open: true, reason, source });
}

export function closeModelSetup(): void {
  set({ ...state, open: false });
}

export function useModelSetup(): ModelSetupState {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => state,
    () => state,
  );
}

/** 托管版且没配 key。配置还没到达时按「不需要」处理(服务端会兜底回 need_key)。 */
export function needsModelSetup(): boolean {
  return peekRuntimeConfig()?.llm.keyMode === 'byok' && !getByok();
}

export function requireModel(source: string): boolean {
  if (!needsModelSetup()) return true;
  openModelSetup('need_key', source);
  return false;
}
