/**
 * human/roles.ts — v6.124 — Phase C「真人场边角色」纯引擎。
 *
 * ITERATION_PLAN Phase C 的 MVP 切法:真人不占鼠人席位(不投票/不被裁),而是以
 * **场边影响者**身份上桌 —— 这与规划里的四个角色天然吻合(全是评论/干预型):
 *   🧑‍💼 hr        真人 HR    — 主持节奏,点名要求谁解释
 *   ✊ union      工会代表   — 替打工人说话,给弱势鼠站台
 *   ⚖️ lawyer     吃瓜律师   — 场边法条提示,合规视角搅局
 *   📰 reporter   媒体记者   — 放大爆点,把事捅到「朋友圈」
 *
 * 真人发言走 PSYWAR 同款注入链(engine 缓冲 → 下一轮讨论 prompt 注入,带角色署名),
 * AI 会真的听到并可能引用/回应 —— 这就是「AI 适应真人」的 MVP。
 *
 * 这里只管纯逻辑:角色表 / 认领台账(一人一角、一角一人)/ 发言格式化。
 * socket 限流、engine 缓冲在各自层。
 */

export type HumanRoleId = 'hr' | 'union' | 'lawyer' | 'reporter';

export interface HumanRole {
  id: HumanRoleId;
  label: string;
  emoji: string;
  /** 角色一句话定位(认领面板展示)。 */
  desc: string;
  /** 注入 AI prompt 时的署名头(让 AI 知道说话的是谁、什么立场)。 */
  promptTag: string;
  /** v6.160 — 非中文局用的英文名与署名头(外语局 prompt 不能混进中文)。 */
  labelEn: string;
  promptTagEn: string;
}

export const HUMAN_ROLES: HumanRole[] = [
  { id: 'hr',       label: '真人 HR',  emoji: '🧑‍💼', desc: '主持节奏,点名让谁解释',       promptTag: '真人HR(主持会议的人类)',
    labelEn: 'Human HR',      promptTagEn: 'Human HR (the real person chairing this meeting)' },
  { id: 'union',    label: '工会代表', emoji: '✊',    desc: '替打工人说话,给弱势鼠站台',   promptTag: '真人工会代表(帮员工说话的人类)',
    labelEn: 'Union rep',     promptTagEn: 'Human union rep (a real person speaking up for the staff)' },
  { id: 'lawyer',   label: '吃瓜律师', emoji: '⚖️',    desc: '场边法条提示,合规视角搅局',   promptTag: '真人律师(场边提供法律视角的人类)',
    labelEn: 'Gossip lawyer', promptTagEn: 'Human lawyer (a real person offering the legal angle from the sidelines)' },
  { id: 'reporter', label: '媒体记者', emoji: '📰',    desc: '放大爆点,把事捅到朋友圈',     promptTag: '真人记者(场边追问爆点的人类)',
    labelEn: 'Reporter',      promptTagEn: 'Human reporter (a real person digging for the scoop)' },
];

export function humanRoleById(id: string): HumanRole | undefined {
  return HUMAN_ROLES.find((r) => r.id === id);
}

/** 认领台账:roleId → userId。 */
export type RoleClaims = Partial<Record<HumanRoleId, string>>;

/**
 * 认领角色(不可变):一角一人 + 一人一角。
 * 幂等:同一人重复认领自己已有的角色返回 ok(台账不变)。
 */
export function claimRole(
  claims: RoleClaims,
  roleId: HumanRoleId,
  userId: string,
): { ok: boolean; reason?: 'role_taken' | 'already_has_role' | 'unknown_role'; claims: RoleClaims } {
  if (!humanRoleById(roleId)) return { ok: false, reason: 'unknown_role', claims };
  const holder = claims[roleId];
  if (holder === userId) return { ok: true, claims };            // 幂等重认领
  if (holder) return { ok: false, reason: 'role_taken', claims };
  const existing = (Object.keys(claims) as HumanRoleId[]).find((k) => claims[k] === userId);
  if (existing) return { ok: false, reason: 'already_has_role', claims };
  return { ok: true, claims: { ...claims, [roleId]: userId } };
}

/** 释放某用户占的所有角色(断线/主动退下用)。不可变。 */
export function releaseUserRoles(claims: RoleClaims, userId: string): RoleClaims {
  const next: RoleClaims = {};
  for (const k of Object.keys(claims) as HumanRoleId[]) {
    if (claims[k] !== userId) next[k] = claims[k];
  }
  return next;
}

/** 查某用户当前占的角色(没有则 null)。 */
export function roleOfUser(claims: RoleClaims, userId: string): HumanRoleId | null {
  for (const k of Object.keys(claims) as HumanRoleId[]) {
    if (claims[k] === userId) return k;
  }
  return null;
}

/** 每轮每角色的场边发言上限(engine 缓冲用;避免真人刷屏淹没 AI 讨论)。 */
export const HUMAN_SPEECH_PER_ROUND_CAP = 3;
/** 单条发言长度上限(字符)。 */
export const HUMAN_SPEECH_MAX_LEN = 120;

/** 把一条真人发言格式化成注入 AI prompt 的行(带角色署名 + 立场)。纯函数。
 *  v6.160 — 非中文局用英文署名(外语局 prompt 里不能混进中文署名)。 */
export function formatHumanSpeechForPrompt(
  roleId: HumanRoleId,
  text: string,
  locale: 'zh' | 'en' | 'ja' | 'ko' = 'zh',
): string {
  const role = humanRoleById(roleId)!;
  const body = text.trim().slice(0, HUMAN_SPEECH_MAX_LEN);
  return locale === 'zh' ? `【${role.promptTag}】${body}` : `[${role.promptTagEn}] ${body}`;
}
