/**
 * talkshowDeeplink — v6.169 — 班味单口播放器与地址栏 `?id=` 的同步规则。
 *
 * 分享按钮给出的是 `/talkshow?id=bit-xxx`。此前「播放器关着就清掉 ?id=」在首屏也会执行:
 * 深链的剧本还在加载、播放器尚未打开,地址栏的 id 先被清掉,加载请求随之作废 —— 所有分享出去的
 * 链接都只打开段子库(自 v0.7.3 起)。规则:只有播放器「开过又关上」才清。
 */
export type DeeplinkAction = { kind: 'set'; id: string } | { kind: 'clear' } | null;

export function talkshowUrlAction(activeId: string | null, urlId: string | null, wasOpen: boolean): DeeplinkAction {
  if (activeId) return urlId === activeId ? null : { kind: 'set', id: activeId };
  return wasOpen && urlId ? { kind: 'clear' } : null;
}
