/**
 * squadAb — v6.51 P2 — A/B the squad director across two models.
 *
 * Squad direction is the product's highest-value LLM call (one per squad,
 * drives the screenshot-worthy 5-act office sitcom). The roadmap wants to
 * compare the current default (claude-opus-4-7) against a cheaper candidate
 * (claude-sonnet-*) on 演出效果 before switching. This runs ONE fixed roster
 * through both models and dumps both scripts side-by-side for eyeballing.
 *
 * Run:    npm -w @furball/server run squad:ab
 *         (or: npx tsx packages/server/src/scripts/squadAb.ts)
 * Prereq: real OPENAI_API_KEY / QINGYUN_API_KEY in .env — THIS BURNS QUOTA
 *         (2 director calls, ~1800 output tokens each).
 * Env:    SQUAD_DIRECTOR_MODEL    control, default claude-opus-4-7
 *         SQUAD_DIRECTOR_MODEL_B  variant, default claude-sonnet-4-7
 * Output: console side-by-side + /tmp/squad-ab-A.json + /tmp/squad-ab-B.json
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { directSquadStory } from '../services/squadDirector';
import type { SquadMember } from '@furball/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// monorepo root = ../../../../ from packages/server/src/scripts/
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config();

// Fixed roster — a deliberately high-chemistry mix (卷王 vs 摸鱼 vs 阴阳师
// vs 老好人) so differences in comic timing / voice / 黑话 show up clearly.
const SQUAD: SquadMember[] = [
  { userId: 'ab-1', displayName: '卷王老张', archetypeId: 'grinder', isHost: true, joinedAt: 0 },
  { userId: 'ab-2', displayName: '摸鱼小李', archetypeId: 'slacker', isHost: false, joinedAt: 1 },
  { userId: 'ab-3', displayName: '阴阳怪气王姐', archetypeId: 'sass-master', isHost: false, joinedAt: 2 },
  { userId: 'ab-4', displayName: '老好人阿强', archetypeId: 'pleaser', isHost: false, joinedAt: 3 },
];

const CONTROL = process.env.SQUAD_DIRECTOR_MODEL ?? 'claude-opus-4-7';
// default = Sonnet 4.5 as actually served by the qingyun proxy (verified
// via GET /v1/models). An earlier guess 'claude-sonnet-4-7' 4xx'd → tmpl.
const VARIANT = process.env.SQUAD_DIRECTOR_MODEL_B ?? 'claude-sonnet-4-5-20250929';

type Story = Awaited<ReturnType<typeof directSquadStory>>;

function isFallback(r: Story): boolean {
  return r.recap.headline.includes('AI 编剧暂时离线');
}

function renderStory(label: string, model: string, r: Story, ms: number): string {
  const out: string[] = [];
  out.push('\n' + '═'.repeat(66));
  out.push(`【${label}】model=${model}  (${ms}ms)${isFallback(r) ? '  ⚠ 模板兜底(模型调用失败,非真输出)' : ''}`);
  out.push('═'.repeat(66));
  for (const act of r.acts) {
    out.push(`\n▌ ${act.title}`);
    for (const b of act.beats) out.push(`   ${b.speakerLabel}: ${b.line}`);
  }
  out.push(`\n★ recap: ${r.recap.headline}`);
  for (const a of r.recap.awards) out.push(`   ${a.label} — ${a.line}`);
  out.push(`   closer: ${r.recap.closer}`);
  return out.join('\n');
}

async function main() {
  if (!(process.env.OPENAI_API_KEY || process.env.QINGYUN_API_KEY)) {
    console.error('✕ 没有 OPENAI_API_KEY / QINGYUN_API_KEY — A/B 需要真实 key(会烧额度)。');
    process.exit(1);
  }
  console.log(`Squad 导演 A/B — control=${CONTROL}  vs  variant=${VARIANT}`);
  console.log(`Roster: ${SQUAD.map((m) => m.displayName).join('、')}`);

  const t0 = Date.now();
  const a = await directSquadStory({ members: SQUAD, model: CONTROL });
  const t1 = Date.now();
  const b = await directSquadStory({ members: SQUAD, model: VARIANT });
  const t2 = Date.now();

  console.log(renderStory('A · CONTROL', CONTROL, a, t1 - t0));
  console.log(renderStory('B · VARIANT', VARIANT, b, t2 - t1));

  writeFileSync('/tmp/squad-ab-A.json', JSON.stringify({ model: CONTROL, ...a }, null, 2));
  writeFileSync('/tmp/squad-ab-B.json', JSON.stringify({ model: VARIANT, ...b }, null, 2));
  console.log('\n✎ 完整 JSON: /tmp/squad-ab-A.json + /tmp/squad-ab-B.json');
  console.log('判断维度: 笑点密度 / 人设贴合 / 黑话准确 / 5 幕节奏 / 是否真输出(非⚠模板).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
