/**
 * firedAutostart — v6.169 — 首页「5 分钟速通」直达裁了么第一关(/fired/chat?autostart=true)。
 *
 * 跳过难度选择与关卡列表:直接装上第一关的场景与 HR,并像关卡入口一样记下 active-level,
 * 结算页才能按关卡给星。纯函数部分单独导出,便于测试。
 */
import { FIRED_LEVELS, type FiredLevel } from '../stores/firedProgress';

export const FIRED_AUTOSTART_PATH = '/fired/chat?autostart=true';

export function isAutostart(search: string): boolean {
  return new URLSearchParams(search).get('autostart') === 'true';
}

/** 速通永远是第一关(新手村,解锁不需要前置)。 */
export function autostartLevel(): FiredLevel {
  const first = FIRED_LEVELS.find((l) => l.level === 1);
  if (!first) throw new Error('FIRED_LEVELS has no level 1');
  return first;
}
