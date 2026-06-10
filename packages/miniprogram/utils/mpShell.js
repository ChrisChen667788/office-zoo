/**
 * mpShell — v6.82. web-view 壳页(landing/profile)的原生兜底纯逻辑。
 *
 * 背景:landing/profile/anniversary/company-pack 都是 web-view 包装 H5,但
 * globalData.webBase 在部署前是 example.com 占位符 —— 渲染出来就是白屏。
 * v6.82 给 landing/profile 加「原生壳」:占位符没换 / web-view 加载失败时,
 * 落到品牌化原生界面(模式介绍 + 原生玩法入口 + 我的公司包)。
 *
 * 这俩判定/裁剪是纯函数,抽出来 headless 单测(banwei/fortune paint 同一套路)。
 */

/** webBase 能不能真用 web-view:必须 https 且不是 example.com 占位符。 */
function shouldUseWebview(webBase) {
  if (typeof webBase !== 'string' || !webBase) return false;
  if (!/^https:\/\//.test(webBase)) return false;
  if (webBase.includes('example.com')) return false;
  return true;
}

/**
 * 公司包 NPC → 头像条:取 emoji(没设 avatar 的回退 🐀),最多 max 个,
 * 超出部分折叠成 more 计数(UI 画 "+N")。
 */
function avatarStrip(npcs, max) {
  const cap = typeof max === 'number' && max > 0 ? max : 8;
  const list = Array.isArray(npcs) ? npcs : [];
  const emojis = list.slice(0, cap).map((n) => (n && n.avatar) || '🐀');
  return { emojis, more: Math.max(0, list.length - cap) };
}

module.exports = { shouldUseWebview, avatarStrip };
