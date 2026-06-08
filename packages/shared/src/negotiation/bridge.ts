/**
 * negotiation/bridge.ts — v6.66 — 主对局 →「裁了么」闯关牌局的桥接(纯函数)。
 *
 * 主对局是旁观局:AI 鼠互相裁员。每当一只鼠被裁,旁观者可以「替 TA 去谈赔偿」——
 * 跳进闯关牌局,替这只被裁的鼠跟 HR 谈。这里只定**纯种子**:替谁谈、配哪档 BOSS、
 * 横幅文案怎么写;真正的牌局还是那套 battle 引擎,UI 在客户端读种子预选。
 *
 * BOSS 按鼠名稳定 hash 挑(同一只鼠每次桥过去都配同一档,主题感一致),再夹到当前
 * 职级已解锁的范围内(锁了就降到最高已解锁),避免把没解锁的 BOSS 预选成锁定态。
 */
import { BOSS_TIERS, bossById, unlockedBosses } from './progression';

/** 名字 → 稳定非负 hash。 */
function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** 替某只被裁的鼠挑一档 BOSS(按名字稳定,不随机)。 */
export function pickBridgeBossId(name: string): string {
  if (!name) return BOSS_TIERS[0].id;
  return BOSS_TIERS[hashName(name) % BOSS_TIERS.length].id;
}

/** 把建议 BOSS 夹到当前职级解锁范围(已解锁→保留;锁了→降到最高已解锁;兜底 hr)。 */
export function clampBossToLevel(bossId: string, level: number): string {
  const unlocked = unlockedBosses(level);
  if (unlocked.some((b) => b.id === bossId)) return bossId;
  return unlocked.length ? unlocked[unlocked.length - 1].id : BOSS_TIERS[0].id;
}

/** 桥接横幅文案。 */
export function bridgeBanner(name: string, bossName: string): string {
  return `替「${name}」找 ${bossName} 谈赔偿`;
}

export interface BridgePlan {
  /** 替谁谈 */
  for: string;
  /** 预选 BOSS(已按职级夹过,保证可选) */
  bossId: string;
  /** 横幅文案 */
  banner: string;
}

/** 一把组好桥接种子:替 name 谈、配可用 BOSS、写好横幅。 */
export function buildBridge(name: string, level: number): BridgePlan {
  const bossId = clampBossToLevel(pickBridgeBossId(name), level);
  return { for: name, bossId, banner: bridgeBanner(name, bossById(bossId).name) };
}
