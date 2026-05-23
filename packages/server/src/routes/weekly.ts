/**
 * /api/weekly — v6.5.0 周报生成器
 *
 * 用户给一句关键事件 ("本周 OKR 没达成, 因为甲方需求改了 3 次"),
 * LLM 生成 4 种风格的"周报":
 *   阿里黑话版 / PUA 版 / 装腔版 / 直球版
 *
 * 设计意图: viral 杠杆。打工人最痛的事就是周报, 让他们一键看到"同
 * 一件事"在不同公司话术下的样子, 极强的情绪共鸣 + 转发欲。
 *
 * 实现:
 *   POST /api/weekly/generate { event, styles?[] }
 *     event: 30-300 字关键事件
 *     styles: 默认全 4 种, 也可指定子集
 *   并行 N 次 LLM 调用 (Promise.allSettled), 每种 style 独立 system prompt
 *
 * Rate limit: 1h × 5 (LLM 重活, 防滥用)
 * 无持久化 — 周报是一次性消费品, 不存档
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { createOpenAI } from '@ai-sdk/openai';
import { callLLMWithTimeout } from '../utils/llm';
import { validateBody } from '../utils/validate';
import { createRateLimiter } from '../utils/rateLimit';
import { logger } from '../utils/logger';
import {
  recordLike, getCounts, dominantStyle, clearPreferences,
  type WeeklyStyle as PrefStyle,
} from '../services/weeklyPreferenceStore';

const weeklyLog = logger.child({ route: 'weekly' });
const generateLimiter = createRateLimiter({ windowMs: 3600_000, max: 5 });

// Lazy provider — same ESM hoisting fix we did in BaseAgent / reflectionLoop
let _openai: ReturnType<typeof createOpenAI> | null = null;
function openai() {
  if (!_openai) {
    _openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY ?? '',
      baseURL: process.env.OPENAI_BASE_URL ?? 'https://api.qingyuntop.top/v1',
    });
  }
  return _openai;
}
const model = () => process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

export type WeeklyStyle = 'alibaba' | 'pua' | 'posh' | 'direct';

interface StyleSpec {
  label: string;
  emoji: string;
  description: string;
  systemPrompt: string;
}

const STYLES: Record<WeeklyStyle, StyleSpec> = {
  alibaba: {
    label: '阿里黑话版',
    emoji: '🧩',
    description: '颗粒度 / 抓手 / 闭环 / 拉齐 高密度堆砌',
    systemPrompt: `你是一位资深阿里 P8/P9, 帮员工把一句话事件改写成满满阿里味儿的周报段落 (150-250 字)。硬性要求:

1. 称呼一律 "@同学", 严禁 "兄弟/哥们"
2. 必须用 ≥6 个阿里味儿黑话 (从中挑): 颗粒度 / 抓手 / 闭环 / 链路 / 拉齐 / 对齐 / 赋能 / 沉淀 / 心智 / 体感 / 梳一梳 / 借假修真 / 第二曲线 / 主航道 / 全链路 / 站在 CEO 视角 / 终局是什么 / All in / 梭哈 / 透传
3. 把简单事说复杂, 把负面事用"挑战"/"机会"包装
4. 末尾习惯性立 flag: "下周我们要 All in 把 X 打透"
5. 输出格式: 直接给周报正文, 不要前置"周报"标题 / "Dear all" / 解释。

输出语气: 油腻 / 端着 / 玄学化 / 中年管理层。`,
  },
  pua: {
    label: 'PUA 版',
    emoji: '🎭',
    description: '老板向下 PUA 风格, "心力不够 / 格局打开"',
    systemPrompt: `你是一位极擅长 PUA 的老板, 帮员工把一句话事件包装成"你应该自我检讨"的 PUA 风格周报 (150-250 字)。硬性要求:

1. 整段话以"对自己不够苛刻"为核心情绪, 让员工觉得是自己问题
2. 必须用 ≥5 个 PUA 套话: 心力不够 / 格局打开 / 心态摆正 / 自驱不够 / 主动性差 / 不够 owner / 不够 push / 不够 stretch / "这个事情是你的 owner 不到位" / "你要从更高维度看"
3. 把客观困难转化为主观问题: 甲方改需求 → "我没有提前对齐预期", 加班 → "我效率没拉到极致"
4. 末尾自我 punishment: "下周我会自我反思, 把 owner 意识打透, 不再让团队为我背锅"
5. 输出格式: 直接给周报正文, 不要前置标题。

输出语气: 自我贬低 / 高度内化负面情绪 / 让旁观者看了想揍。`,
  },
  posh: {
    label: '装腔版',
    emoji: '🎩',
    description: '假大空 + 自我感动, "复盘 / 反思 / 成长"',
    systemPrompt: `你是一位极度热爱"自我提升"话术的中产白领, 帮员工把一句话事件改写成自我感动 + 行业洞察风格周报 (150-250 字)。硬性要求:

1. 用大量看起来很高级但没信息量的词: 复盘 / 反思 / 沉浸 / 思考 / 洞察 / 共情 / 链接 / 价值 / 长期主义 / 反脆弱 / 飞轮 / 一阶问题 / 二阶问题 / 信息熵 / 北极星指标
2. 引用一个 (虚构或真实的) 商业大佬名言: "正如 X 所说..."
3. 把日常打工事件提升到"人生顿悟"层面: "我突然意识到 ..."
4. 末尾立 inspirational flag: "下周, 我将以更长期主义的视角, 继续在不确定性中寻找确定性。"
5. 输出格式: 直接给周报正文, 不要前置标题。

输出语气: 装腔 / 自我感动 / 微博鸡汤博主 / 读完想笑。`,
  },
  direct: {
    label: '直球版',
    emoji: '💢',
    description: '最真实没修饰, "这周没干完, 因为..."',
    systemPrompt: `你是一位拒绝任何废话的实在打工人, 帮员工把一句话事件改写成简洁、直接、不装的周报 (80-150 字)。硬性要求:

1. 用最直白的口语, 不出现任何企业话术 (颗粒度 / 拉齐 / 心力 / 闭环 等一律禁止)
2. 客观陈述: 这周什么事没干完, 真实原因 (甲方反复 / 协作慢 / 自己懒 / 资源不够 都可以), 不归因到"心态"
3. 不立空 flag, 末尾只说"下周打算 …"+ 具体可执行动作
4. 末尾可以来一句吐槽 (例如: "甲方下次再改, 麻烦先给个钱")
5. 输出格式: 直接给周报正文。

输出语气: 直球 / 不装 / 像跟同事吃饭吐槽 / 让人想转发"这才是周报"。`,
  },
};

const GenerateSchema = z.object({
  event: z.string().min(8).max(300),
  styles: z.array(z.enum(['alibaba', 'pua', 'posh', 'direct'])).min(1).max(4).optional(),
});

export const weeklyRoutes = new Hono();

weeklyRoutes.post('/generate', async (c) => {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    ?? c.req.header('host') ?? 'unknown';
  const rate = generateLimiter.check(ip);
  if (!rate.ok) {
    return c.json({ error: '生成太快, 1 小时最多 5 份周报' }, 429);
  }
  const v = await validateBody(c, GenerateSchema);
  if (!v.ok) return v.response;
  const event = v.data.event.trim();
  const wantStyles = v.data.styles ?? (Object.keys(STYLES) as WeeklyStyle[]);

  // v6.5.2 — self-tuning: 读用户偏好计数, 识别主导风格,
  // 给该 style 加 temperature + 改 system prompt 让特征更突出。
  const userId = (c.req.header('x-user-id') ?? '').slice(0, 64);
  const userCounts = userId ? await getCounts(userId) : null;
  const dominant: WeeklyStyle | null = userCounts
    ? (dominantStyle(userCounts) as WeeklyStyle | null)
    : null;

  // Fire all style generations in parallel
  const results = await Promise.allSettled(
    wantStyles.map(async (s) => {
      const spec = STYLES[s];
      // Self-tuning: dominant style gets boosted temperature + appended prompt
      const isDominant = dominant === s;
      const sys = isDominant
        ? `${spec.systemPrompt}

【用户偏好强化】
用户在过去给"${spec.label}"点过最多赞 (累计 ${userCounts?.[s] ?? 0} 次), 说明他特别喜欢这种风格。请把你的特征发挥到极致, 比你平时更鲜明、更夸张、更密集 — 但仍保持不超出 250 字。`
        : spec.systemPrompt;
      const temp = isDominant ? 1.0 : 0.85;
      const res = await callLLMWithTimeout('SPEECH', {
        model: openai()(model()),
        system: sys,
        prompt: `本周关键事件: ${event}\n\n请按你的风格写出周报段落.`,
        maxTokens: 480,
        temperature: temp,
      });
      if (!res.ok) {
        weeklyLog.warn({ style: s, reason: res.reason, boost: isDominant }, 'weekly LLM failed');
        return {
          style: s,
          label: spec.label,
          emoji: spec.emoji,
          description: spec.description,
          text: `[${spec.label} 生成失败 — 神明在线维护 (${res.reason})]`,
          error: true,
          boosted: isDominant,
        };
      }
      return {
        style: s,
        label: spec.label,
        emoji: spec.emoji,
        description: spec.description,
        text: res.text.trim(),
        error: false,
        boosted: isDominant,
      };
    }),
  );

  const payload = results.map((r, i) =>
    r.status === 'fulfilled' ? r.value : {
      style: wantStyles[i],
      label: STYLES[wantStyles[i]].label,
      emoji: STYLES[wantStyles[i]].emoji,
      description: STYLES[wantStyles[i]].description,
      text: '[生成异常]',
      error: true,
      boosted: dominant === wantStyles[i],
    },
  );

  return c.json({
    event,
    results: payload,
    // 透传 self-tuning 状态给前端做"AI 在听我的"UI 提示
    tuning: dominant
      ? {
          dominantStyle: dominant,
          dominantLabel: STYLES[dominant].label,
          totalLikes: userCounts
            ? (userCounts.alibaba + userCounts.pua + userCounts.posh + userCounts.direct)
            : 0,
        }
      : null,
  });
});

/* ─── v6.5.2 self-tuning endpoints ───────────────────────────── */

const LikeSchema = z.object({
  style: z.enum(['alibaba', 'pua', 'posh', 'direct']),
});
const likeLimiter = createRateLimiter({ windowMs: 60_000, max: 30 }); // 30/min

weeklyRoutes.post('/like', async (c) => {
  const userId = (c.req.header('x-user-id') ?? '').slice(0, 64);
  if (!userId || userId.length < 8) {
    return c.json({ error: '需要 X-User-Id header (≥ 8 char)' }, 400);
  }
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    ?? c.req.header('host') ?? 'unknown';
  if (!likeLimiter.check(`${ip}::${userId}`).ok) {
    return c.json({ error: '点赞太快了' }, 429);
  }
  const v = await validateBody(c, LikeSchema);
  if (!v.ok) return v.response;
  const counts = await recordLike(userId, v.data.style as PrefStyle);
  const dom = dominantStyle(counts);
  return c.json({
    counts,
    dominantStyle: dom,
    dominantLabel: dom ? STYLES[dom as WeeklyStyle].label : null,
    total: counts.alibaba + counts.pua + counts.posh + counts.direct,
  });
});

weeklyRoutes.get('/preferences', async (c) => {
  const userId = (c.req.header('x-user-id') ?? '').slice(0, 64);
  if (!userId || userId.length < 8) {
    return c.json({ counts: { alibaba: 0, pua: 0, posh: 0, direct: 0 }, dominantStyle: null });
  }
  const counts = await getCounts(userId);
  const dom = dominantStyle(counts);
  return c.json({
    counts,
    dominantStyle: dom,
    dominantLabel: dom ? STYLES[dom as WeeklyStyle].label : null,
    total: counts.alibaba + counts.pua + counts.posh + counts.direct,
  });
});

weeklyRoutes.delete('/preferences', async (c) => {
  const userId = (c.req.header('x-user-id') ?? '').slice(0, 64);
  if (!userId || userId.length < 8) return c.json({ error: '需要 X-User-Id' }, 400);
  await clearPreferences(userId);
  return c.json({ cleared: true });
});

/** Static catalogue — frontend uses this to render style cards before submit. */
weeklyRoutes.get('/styles', (c) => {
  return c.json({
    styles: (Object.keys(STYLES) as WeeklyStyle[]).map((s) => ({
      id: s,
      label: STYLES[s].label,
      emoji: STYLES[s].emoji,
      description: STYLES[s].description,
    })),
  });
});
