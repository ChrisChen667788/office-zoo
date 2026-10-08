/**
 * v6.156 — Big Tech Jargon Dictionary (英文大厂黑话词典)
 *
 * 供英文局 AI 发言使用。分为短词/短语(verbs/nouns/phrases)和整句两类。
 * 词条覆盖 FAANG/大厂 HR 话术、绩效/裁员黑话、大厂文化梗。
 */

// ---- Action verbs / phrases (动词短语) ----
export const BIGTECH_VERBS = [
  'PIP',              // Performance Improvement Plan — 优化前兆
  'stack-rank',       // 强制曲线排名
  'calibrate down',   // 向下校准绩效
  'sunset',           // 终止产品 / 项目
  'backfill',         // 职位补员
  'RIF',              // Reduction In Force — 裁员委婉说法
  'reorg',            // 重组部门
  'scope creep',      // 需求蔓延
  'impact',           // 刷 impact/show impact
  'align on',         // 对齐
  'socialize',        // 提前沟通/造势("We need to socialize this idea")
  'move fast',        // 快速迭代
  'ship it',          // 发布
  'iterate',          // 迭代
  'leverage',         // 借力/利用
  'double-click',     // 深入细节("Let me double-click on that")
  'action item',      // 待办事项
  'take offline',     // 私下讨论
  'circle back',      // 之后再跟进
  'parking lot',      // 暂时搁置("Let's put that in the parking lot")
];

// ---- Nouns / titles (名词) ----
export const BIGTECH_NOUNS = [
  'headcount',        // 编制/HC
  'promo packet',     // 晋升材料
  'impact doc',       // 绩效文档
  'TC',               // Total Compensation — 总薪酬
  'vest cliff',       // 股票归属悬崖(满1年才开始vesting)
  'RTO',              // Return to Office — 回办公室令
  'perf review',      // 绩效评估
  'leveling',         // 级别评定
  'scope',            // 工作范围
  'runway',           // 资金/时间窗口
  'north star metric',// 核心指标
  'OKR',              // Objectives and Key Results
  'L5→L6',           // 晋升路径("trying to get from L5 to L6")
  'IC vs EM',         // Individual Contributor vs Engineering Manager
  'on-call',          // 值班
];

// ---- Full sentences (整句黑话) ----
export const BIGTECH_SENTENCES = [
  "let's take this offline",
  "it's not a layoff, it's a reduction in force",
  "your role is being eliminated, not your performance",
  "headcount has been reallocated to higher-priority initiatives",
  "we're rightsizing the organization",
  "this decision was made above my pay grade",
  "your comp will be very competitive at your new level",
  "we're investing in you — that's why we're putting you on a PIP",
  "your impact doesn't match your current level expectation",
  "we need someone who can operate at a higher altitude",
  "this reorg is an opportunity, not a threat",
  "culture fit is a real thing and we take it seriously",
];

/** 随机取若干条黑话短词,供 prompt 注入用 */
export function sampleBigtechTerms(count: number): string[] {
  const all = [...BIGTECH_VERBS, ...BIGTECH_NOUNS];
  const shuffled = [...all].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/** 随机取1条整句黑话 */
export function randomBigtechSentence(): string {
  return BIGTECH_SENTENCES[Math.floor(Math.random() * BIGTECH_SENTENCES.length)];
}
