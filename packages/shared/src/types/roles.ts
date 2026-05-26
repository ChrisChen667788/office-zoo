import { Team } from './game';

export enum Role {
  // Cat team (10 roles)
  VILLAGER_CAT = 'villager_cat',
  DETECTIVE_CAT = 'detective_cat',
  MEDIC_CAT = 'medic_cat',
  ENGINEER_CAT = 'engineer_cat',
  BODYGUARD_CAT = 'bodyguard_cat',
  MEDIUM_CAT = 'medium_cat',
  VIGILANTE_CAT = 'vigilante_cat',
  ADVENTURER_CAT = 'adventurer_cat',
  MIMIC_CAT = 'mimic_cat',
  POLITICIAN_CAT = 'politician_cat',
  // Dog team (8 roles)
  KILLER_DOG = 'killer_dog',
  SPY_DOG = 'spy_dog',
  MORPHING_DOG = 'morphing_dog',
  NINJA_DOG = 'ninja_dog',
  HYPNOTIST_DOG = 'hypnotist_dog',
  BOMBER_DOG = 'bomber_dog',
  ASSASSIN_DOG = 'assassin_dog',
  SILENCER_DOG = 'silencer_dog',
  // Neutral (5 roles)
  JESTER = 'jester',
  PHANTOM = 'phantom',
  PIGEON = 'pigeon',
  LONE_WOLF = 'lone_wolf',
  LOVER = 'lover'
}

export interface RoleInfo {
  role: Role;
  displayName: string;
  displayNameCN: string;
  team: Team;
  description: string;
  descriptionCN: string;
  emoji: string;
  canKill: boolean;
}

export const ROLE_REGISTRY: Record<Role, RoleInfo> = {
  // ---- 打工人阵营 (Worker Team / Good guys) ----
  [Role.VILLAGER_CAT]: {
    role: Role.VILLAGER_CAT, displayName: 'Regular Employee', displayNameCN: '普通员工', team: Team.CAT,
    description: 'No special ability. Complete tasks and vote.', descriptionCN: '默默搬砖，偶尔摸鱼，完成工作并投票', emoji: '👨‍💻', canKill: false
  },
  [Role.DETECTIVE_CAT]: {
    role: Role.DETECTIVE_CAT, displayName: 'HR Director', displayNameCN: 'HR总监', team: Team.CAT,
    description: 'Can investigate one player per round.', descriptionCN: '每轮可以查一个人的真实绩效(身份)', emoji: '📋', canKill: false
  },
  [Role.MEDIC_CAT]: {
    role: Role.MEDIC_CAT, displayName: 'Union Rep', displayNameCN: '工会代表', team: Team.CAT,
    description: 'Can protect one player from being fired.', descriptionCN: '每轮可保护一名员工不被裁员(暗杀)', emoji: '🛡️', canKill: false
  },
  [Role.ENGINEER_CAT]: {
    role: Role.ENGINEER_CAT, displayName: 'Programmer', displayNameCN: '程序员', team: Team.CAT,
    description: 'Can use shortcuts to move quickly.', descriptionCN: '可走技术捷径快速移动', emoji: '💻', canKill: false
  },
  [Role.BODYGUARD_CAT]: {
    role: Role.BODYGUARD_CAT, displayName: 'Legal Counsel', displayNameCN: '法务顾问', team: Team.CAT,
    description: 'Can swap positions with target to protect.', descriptionCN: '可用法律手段保护目标员工', emoji: '⚖️', canKill: false
  },
  [Role.MEDIUM_CAT]: {
    role: Role.MEDIUM_CAT, displayName: 'Internal Auditor', displayNameCN: '内审专员', team: Team.CAT,
    description: 'Can investigate departed employees.', descriptionCN: '可调查已离职(死亡)员工的资料', emoji: '🔎', canKill: false
  },
  [Role.VIGILANTE_CAT]: {
    role: Role.VIGILANTE_CAT, displayName: 'Data Analyst', displayNameCN: '数据分析师', team: Team.CAT,
    description: 'Can check other players task progress.', descriptionCN: '可查看其他人的工作量和产出数据', emoji: '📊', canKill: false
  },
  [Role.ADVENTURER_CAT]: {
    role: Role.ADVENTURER_CAT, displayName: 'Sales Champion', displayNameCN: '销售冠军', team: Team.CAT,
    description: 'Can track a player movement.', descriptionCN: '人脉广，可追踪任何人的行踪', emoji: '🏆', canKill: false
  },
  [Role.MIMIC_CAT]: {
    role: Role.MIMIC_CAT, displayName: 'Intern', displayNameCN: '实习生', team: Team.CAT,
    description: 'Appears as management to enemies.', descriptionCN: '在资本家阵营眼中显示为自己人', emoji: '🎒', canKill: false
  },
  [Role.POLITICIAN_CAT]: {
    role: Role.POLITICIAN_CAT, displayName: 'Veteran Employee', displayNameCN: '老油条', team: Team.CAT,
    description: 'Survives first layoff.', descriptionCN: '被投票裁员时不会走人(一次性)', emoji: '🦊', canKill: false
  },
  // ---- 资本家阵营 (Management / Bad guys) ----
  [Role.KILLER_DOG]: {
    role: Role.KILLER_DOG, displayName: 'CEO', displayNameCN: 'CEO', team: Team.DOG,
    description: 'Can fire worker team players.', descriptionCN: '可"优化"(裁掉)打工人阵营员工', emoji: '👔', canKill: true
  },
  [Role.SPY_DOG]: {
    role: Role.SPY_DOG, displayName: 'PPT Master', displayNameCN: 'PPT高手', team: Team.DOG,
    description: 'Can see vote targets in meetings.', descriptionCN: '可在会议中看到所有人的投票意向', emoji: '📽️', canKill: true
  },
  [Role.MORPHING_DOG]: {
    role: Role.MORPHING_DOG, displayName: 'Blame Shifter', displayNameCN: '甩锅王', team: Team.DOG,
    description: 'Can morph into fired player.', descriptionCN: '裁人后可伪装成被裁者的身份', emoji: '🎭', canKill: true
  },
  [Role.NINJA_DOG]: {
    role: Role.NINJA_DOG, displayName: 'Layoff Expert', displayNameCN: '裁员专家', team: Team.DOG,
    description: 'Layoffs leave no trace.', descriptionCN: '悄无声息地裁人，不留证据', emoji: '🥷', canKill: true
  },
  [Role.HYPNOTIST_DOG]: {
    role: Role.HYPNOTIST_DOG, displayName: 'PUA Master', displayNameCN: 'PUA大师', team: Team.DOG,
    description: 'Can give false info to a worker.', descriptionCN: '可让一名打工人看到虚假的绩效信息', emoji: '🌀', canKill: true
  },
  [Role.BOMBER_DOG]: {
    role: Role.BOMBER_DOG, displayName: 'Overtime Demon', displayNameCN: '内卷狂魔', team: Team.DOG,
    description: 'When voted out, takes one voter down.', descriptionCN: '被赶走时可带走一名投票者同归于尽', emoji: '🔥', canKill: true
  },
  [Role.ASSASSIN_DOG]: {
    role: Role.ASSASSIN_DOG, displayName: 'Office Assassin', displayNameCN: '职场刺客', team: Team.DOG,
    description: 'Can guess and eliminate special roles in meeting.', descriptionCN: '会议中可指认并开除特殊岗位', emoji: '🗡️', canKill: true
  },
  [Role.SILENCER_DOG]: {
    role: Role.SILENCER_DOG, displayName: 'Mute Admin', displayNameCN: '禁言管理', team: Team.DOG,
    description: 'Can silence a player for next meeting.', descriptionCN: '可禁言一名员工，下轮会议无法发言', emoji: '🤐', canKill: true
  },
  // ---- 摸鱼阵营 (Neutral / Wild cards) ----
  [Role.JESTER]: {
    role: Role.JESTER, displayName: 'Slacker Pro', displayNameCN: '摆烂达人', team: Team.NEUTRAL,
    description: 'Wins by getting voted out (collects severance).', descriptionCN: '被投票开除即获胜(领N+1赔偿)', emoji: '😎', canKill: false
  },
  [Role.PHANTOM]: {
    role: Role.PHANTOM, displayName: 'Scapegoat', displayNameCN: '背锅侠', team: Team.NEUTRAL,
    description: 'Can interfere with votes after departure.', descriptionCN: '离职后仍可干扰公司投票决策', emoji: '👻', canKill: false
  },
  [Role.PIGEON]: {
    role: Role.PIGEON, displayName: 'Pigeon King', displayNameCN: '鸽王', team: Team.NEUTRAL,
    description: 'Can mark players to prevent voting.', descriptionCN: '可放别人鸽子，使其无法参与投票', emoji: '🕊️', canKill: false
  },
  [Role.LONE_WOLF]: {
    role: Role.LONE_WOLF, displayName: 'Lone Ranger', displayNameCN: '独行侠', team: Team.NEUTRAL,
    description: 'Can fire but not allied with management.', descriptionCN: '有开除权但不属于资本家阵营', emoji: '🐺', canKill: true
  },
  [Role.LOVER]: {
    role: Role.LOVER, displayName: 'Office Romance', displayNameCN: '办公室恋人', team: Team.NEUTRAL,
    description: 'Two bonded players, if one leaves both leave.', descriptionCN: '两人绑定，一人离职另一人也走', emoji: '💕', canKill: false
  }
};

export function getRoleInfo(role: Role | string): RoleInfo {
  return ROLE_REGISTRY[role as Role] ?? ROLE_REGISTRY[Role.VILLAGER_CAT];
}

export function isDogRole(role: Role | string): boolean {
  const info = getRoleInfo(role);
  return info.team === Team.DOG;
}

export function canKill(role: Role | string): boolean {
  const info = getRoleInfo(role);
  return info.canKill;
}

// 8-player preset
export const ROLE_PRESETS: Record<number, { cat: Role[]; dog: Role[]; neutral: Role[] }> = {
  6: {
    cat: [Role.DETECTIVE_CAT, Role.MEDIC_CAT, Role.VILLAGER_CAT, Role.VILLAGER_CAT],
    dog: [Role.KILLER_DOG, Role.SPY_DOG],
    neutral: []
  },
  8: {
    cat: [Role.DETECTIVE_CAT, Role.MEDIC_CAT, Role.ENGINEER_CAT, Role.VILLAGER_CAT, Role.VILLAGER_CAT],
    dog: [Role.KILLER_DOG, Role.MORPHING_DOG],
    neutral: [Role.JESTER]
  },
  // v6.27 P1 — sits between 8 (5/2/1) and 10 (6/3/1). 6/2/1 = 9 total.
  // Earlier this gap caused `ROLE_PRESETS[9] ?? ROLE_PRESETS[8]` to fall
  // back to 8 (7 roles) for a 9-player game → roles[8] = undefined →
  // crash on `ROLE_REGISTRY[undefined].team`. Surfaced by v6.26 P2 tests.
  9: {
    cat: [Role.DETECTIVE_CAT, Role.MEDIC_CAT, Role.ENGINEER_CAT, Role.BODYGUARD_CAT, Role.VILLAGER_CAT, Role.VILLAGER_CAT],
    dog: [Role.KILLER_DOG, Role.MORPHING_DOG],
    neutral: [Role.JESTER]
  },
  10: {
    cat: [Role.DETECTIVE_CAT, Role.MEDIC_CAT, Role.ENGINEER_CAT, Role.BODYGUARD_CAT, Role.VIGILANTE_CAT, Role.VILLAGER_CAT],
    dog: [Role.KILLER_DOG, Role.MORPHING_DOG, Role.NINJA_DOG],
    neutral: [Role.JESTER]
  }
};
