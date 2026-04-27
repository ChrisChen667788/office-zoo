/**
 * Role registry — single source of truth for role id → Chinese label.
 *
 * Previously this map was duplicated in Immersive.tsx (as ROLE_VISUALS) and
 * partially in RoleLegend.tsx. New surfaces (PredictionBar, EliminationReveal)
 * need the same map, and three-way drift was a maintenance risk.
 *
 * `team` is derived from the id suffix (`_cat`/`_dog`/else) rather than stored
 * here, so adding a new role only requires one entry.
 */

export const ROLE_LABELS: Record<string, string> = {
  // 打工人阵营
  villager_cat: '普通员工',
  detective_cat: 'HR总监',
  medic_cat: '工会代表',
  engineer_cat: '程序员',
  bodyguard_cat: '法务顾问',
  medium_cat: '内审专员',
  vigilante_cat: '数据分析师',
  adventurer_cat: '销售冠军',
  mimic_cat: '实习生',
  politician_cat: '老油条',
  // 资本家阵营
  killer_dog: 'CEO',
  spy_dog: 'PPT高手',
  morphing_dog: '甩锅王',
  ninja_dog: '裁员专家',
  hypnotist_dog: 'PUA大师',
  bomber_dog: '内卷狂魔',
  assassin_dog: '职场刺客',
  silencer_dog: '禁言管理',
  // 摸鱼阵营
  jester: '摆烂达人',
  phantom: '背锅侠',
  pigeon: '鸽王',
  lone_wolf: '独行侠',
  lover: '办公室恋人',
};

/** Team resolver — tolerates unknown ids by defaulting to neutral. */
export function teamForRole(roleId?: string): 'cat' | 'dog' | 'neutral' {
  if (!roleId) return 'neutral';
  if (roleId.endsWith('_cat')) return 'cat';
  if (roleId.endsWith('_dog')) return 'dog';
  return 'neutral';
}

export const TEAM_LABELS: Record<'cat' | 'dog' | 'neutral', string> = {
  cat: '打工人',
  dog: '资本家',
  neutral: '摸鱼党',
};
