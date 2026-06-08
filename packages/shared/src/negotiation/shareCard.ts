/**
 * negotiation/shareCard.ts — v6.65 — 赔偿谈判战绩卡的「文案/数据」纯函数层。
 *
 * 把一局的结果摊成卡面要画的标题 / 基调 / 数据行 / 一句嘴替 —— 纯函数,可单测。
 * 真正的 canvas 绘制在客户端 utils/negotiationShareCard.ts(jsdom 没 canvas 不便测,
 * 但内容在这里锁死)。
 */
export interface SettlementCardInput {
  outcomeKind: 'settled' | 'caved' | 'flipped' | 'ongoing';
  tier: number;        // CompTier 0-3
  multiple: string;    // '3N' / 'N+1' / '未谈成' …
  bossName: string;    // HR 专员 / CEO 亲自下场
  bossEmoji: string;
  relicName?: string;  // 装备的遗物(没带则不显示行)
  rounds: number;
  severance: number;   // 本局拿到的遣散费(个月)
  xp: number;
  careerTitle: string; // 维权斗士 …
}

export type SettlementVibe = 'win' | 'meh' | 'lose';

export interface SettlementCard {
  headline: string;
  vibe: SettlementVibe;
  rows: Array<{ label: string; value: string }>;
  tagline: string;
}

/** 结果基调:打到 2N/3N=赢麻,N+1/认怂还有=平,掀桌/空手=输。 */
export function settlementVibe(input: Pick<SettlementCardInput, 'outcomeKind' | 'tier'>): SettlementVibe {
  if (input.outcomeKind === 'flipped') return 'lose';
  if (input.tier >= 2) return 'win';
  if (input.tier >= 1) return 'meh';
  return 'lose'; // tier 0(没谈成 / 认怂空手)
}

function headlineFor(input: SettlementCardInput): string {
  switch (input.outcomeKind) {
    case 'flipped': return '💥 谈崩 · HR 掀桌走仲裁';
    case 'caved':   return input.tier >= 1 ? `😮‍💨 认怂收场 · 拿了 ${input.multiple}` : '😮‍💨 认怂 · 空手走人';
    case 'settled': return input.tier >= 1 ? `🤝 谈成 · ${input.multiple}` : '🚪 没谈成 · 空手走人';
    default:        return '⚔️ 谈判进行中';
  }
}

const TAGLINE: Record<SettlementVibe, string> = {
  win: '这波 HR 被我盘明白了,N+1 算什么,直接掀房顶。',
  meh: '没赢麻也没输光,落袋为安,打工人懂的。',
  lose: '行,劳动仲裁见 —— 下次带够遗物再来。',
};

/** 把一局结果摊成卡面内容。纯函数。 */
export function buildSettlementCard(input: SettlementCardInput): SettlementCard {
  const vibe = settlementVibe(input);
  const rows: Array<{ label: string; value: string }> = [
    { label: '对手', value: `${input.bossEmoji} ${input.bossName}` },
    { label: '赔偿档', value: input.tier >= 1 ? input.multiple : '未谈成' },
    { label: '用时', value: `${input.rounds} 回合` },
  ];
  if (input.relicName) rows.push({ label: '遗物', value: input.relicName });
  rows.push({ label: '收获', value: `经验 +${input.xp} · 遣散费 +${input.severance} 个月` });
  rows.push({ label: '职级', value: input.careerTitle });
  return { headline: headlineFor(input), vibe, rows, tagline: TAGLINE[vibe] };
}
