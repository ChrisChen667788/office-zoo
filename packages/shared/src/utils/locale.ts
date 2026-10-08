/**
 * v6.156 — 游戏语言工具函数
 *
 * 客户端 UI locale(BCP 47)→ 游戏内部 locale('zh'|'en'|'ja'|'ko')。
 * 逻辑在 shared,方便 server/client 共用,也方便单测。
 */

import type { GameConfig } from '../types/game';

/** v6.156 — 游戏支持的 locale 枚举(与 GameConfig.locale 保持同步)。
 *  v6.157 加入 ja / ko。 */
export type GameLocale = NonNullable<GameConfig['locale']>;

/**
 * 把浏览器/客户端 UI locale(BCP 47 字符串)映射到游戏内部 locale。
 *
 * - 'zh-CN' | 'zh-TW' | 'zh-*' → 'zh'
 * - 'en-US' | 'en-GB' | 'en-*' → 'en'
 * - 'ja-JP' | 'ja'              → 'ja'  (v6.157)
 * - 'ko-KR' | 'ko'              → 'ko'  (v6.157)
 * - 其他 / 未知                  → 'zh' (兜底)
 */
export function gameLocaleFromUiLocale(uiLocale: string): GameLocale {
  const lower = uiLocale.toLowerCase();
  if (lower.startsWith('zh')) return 'zh';
  if (lower.startsWith('en')) return 'en';
  if (lower.startsWith('ja')) return 'ja';
  if (lower.startsWith('ko')) return 'ko';
  return 'zh';
}
