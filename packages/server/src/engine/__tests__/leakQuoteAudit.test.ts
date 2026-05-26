/**
 * v6.28 P2 — detectLeakQuote 假阳性 audit.
 *
 * Generates a 50×10 grid of (random AI-style speech) × (unrelated leak
 * hint), runs the v6.27 P2 hybrid detector, asserts the false-positive
 * rate stays under 5%. If a tier 1 substring or tier 2 Jaccard match
 * fires on truly unrelated content, that's the threshold being too
 * loose — tune the constants in GameEngine.detectLeakQuote.
 *
 * Why both lists are seeded (not randomized): we want the audit to be
 * REPRODUCIBLE so a future commit that changes the threshold gets a
 * deterministic delta in the test output, not noise from RNG.
 */
import { describe, it, expect } from 'vitest';
import { GameEngine } from '../GameEngine';

// 50 hand-curated AI-speech samples. Tone matches real generations
// (BaseAgent.generateSpeech): 50-100 字, 班味, 阴阳怪气, 内卷, OKR 等。
const SPEECH_FIXTURES = [
  'KPI 又涨了, 老板说要拥抱变化, 拥抱不动了',
  '我猜投 Mike, 他白天眼神飘, 一看就有事',
  '会议室刚刚开了 2 小时, 没结论, 真有意思',
  '老板今天 PUA 我, 说我做事不到位, 不到位个屁',
  '昨晚加班到 3 点, 早上还要早会, 累成狗',
  '小郁那个 PRD 我看过了, 数据撑不起来结论',
  '阿里黑话太烦, 颗粒度对齐这种屁话',
  '推杯换盏说要赋能, 然后给我加 OKR',
  '茶水间见鬼了, 咖啡机坏了一周没修',
  '群里说我吐槽老板, 其实是说事不说人',
  'Helen 刚才看你的眼神不对, 你小心点',
  '我累了, 真心不想再开复盘会了',
  '产品部今天又改需求, 第四版了',
  '老张那个工位贴满便签, 强迫症犯了',
  'HR 找我谈了 20 分钟, 全是废话',
  '中午吃饭朋友说他公司也裁人, 大环境',
  '昨天周报又被打回来, 嫌不够丰富',
  '我对这个项目失去了信心, 真的',
  '老板娘来视察, 大家假装很忙',
  '电梯坏了, 走楼梯到 18 楼, 累死',
  '会议改时间改了 3 次, 行程表撕了',
  'KPI 没完成, 但我做了很多其他事',
  '同事八卦说 Tom 跟 HR 关系暧昧',
  '阿强昨天偷偷请假去面试了',
  'CEO 全员信又来了, 1500 字废话',
  '产品 demo 时电脑黑屏, 现场翻车',
  '部门拆分了, 我被分到了一个新组',
  '老板让我加微信, 说有事直接找我',
  '我们组今年 leader 换了 3 个',
  '钉钉今天又卡死, 上传不了文件',
  '茶水间冰箱里的便当被偷了, 是谁',
  '加班餐又是炸鸡套餐, 受不了',
  '昨晚梦到自己被裁了, 醒来心慌',
  'Jenkins 又挂了, 部署不了',
  '产品说要改 UI, 这是第 8 版了',
  'leader 在群里 @ 全员, 说要复盘',
  '今天周一, 心情已经在崩了',
  '甲方提了新需求, 没钱没人没时间',
  'monitoring 报警了一整夜, 没人 oncall',
  '客户投诉了 3 次, 老板说要重视',
  '我同事说要跑路, 跑路群我也加了',
  'OA 系统升级, 报销流程更复杂了',
  'leader 说要"向上管理", 我想跑路',
  '面试官迟到 40 分钟, 进来还笑',
  '阿强升职了, 直接管我, 真不爽',
  '今晚团建, 又是 KTV, 我不去',
  '客户说要砍预算, leader 让我去谈',
  '系统挂了一整天, 老板说要赔钱',
  '组里来了实习生, 完全不会用 git',
  '今天我请假, 老板说"你确定要请吗"',
];

// 10 unrelated hint pool. Each one a distinct topic so overlap with
// SPEECH_FIXTURES is incidental at most.
const HINT_FIXTURES = [
  '小心 Tony 在装大度',                    // Tony specific
  'Frank 偷过我工位的零食',                 // Frank specific + 偷零食
  '@Helen 那个 PRD 是抄我离职前 draft',     // Helen + PRD
  'Jack 上次跟老板说我的坏话',              // Jack + 坏话
  'Ruby 内心 OKR 焦虑表面光鲜',            // Ruby + OKR
  'Mike 工位贴满 sticky note',             // Mike + sticky
  'Grace 跟 CEO 关系不一般',               // Grace + CEO
  'Oscar 昨天在监控室待了 40 分钟',         // Oscar + 监控室
  '阿强其实是猎头, 来挖人的',               // 阿强 + 猎头
  '李总周三飞日本, 不是出差',               // 李总 + 日本
];

describe('detectLeakQuote — false positive audit (v6.28 P2)', () => {
  it('50 unrelated speeches × 10 unrelated hints, fp rate < 5%', () => {
    const engine = new GameEngine(8);
    engine.createPlayers();

    let positives = 0;
    let total = 0;
    const matches: Array<{ speech: string; hint: string }> = [];

    for (const hint of HINT_FIXTURES) {
      // Re-seed leakedHints with only this single hint per iteration
      // so each test pair is isolated (no cross-contamination from
      // earlier hints still in the FIFO).
      (engine as unknown as { leakedHints: string[] }).leakedHints = [hint];
      for (const speech of SPEECH_FIXTURES) {
        total++;
        const r = engine.detectLeakQuote(speech);
        if (r !== null) {
          positives++;
          matches.push({ speech: speech.slice(0, 30), hint: hint.slice(0, 30) });
        }
      }
    }

    const fpRate = positives / total;
    // Baseline log (visible even on pass) so future commits that
    // change the threshold see the delta. Tripped pairs printed for
    // easy "tune the threshold" debugging.
    console.log(`[fp audit] rate=${(fpRate * 100).toFixed(2)}% (${positives}/${total} pairs)`);
    if (matches.length > 0) {
      console.log('[fp audit] tripped pairs:', matches.slice(0, 10));
    }
    expect(fpRate).toBeLessThan(0.05);
  });

  it('high-overlap hint+speech pair DOES match (sanity check — detector still works)', () => {
    const engine = new GameEngine(8);
    engine.createPlayers();
    (engine as unknown as { leakedHints: string[] }).leakedHints = [
      'Frank 偷过我工位的零食',
    ];
    // Speech contains 4-char substring "工位的零" — tier 1 match.
    const r = engine.detectLeakQuote('听说 Frank 偷过我工位的零食, 真的');
    expect(r).toBe('Frank 偷过我工位的零食');
  });
});
