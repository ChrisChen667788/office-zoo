/**
 * /api/bar — v6.2.0 🍺 深夜酒馆 1v1 conversation surface.
 *
 * 不像 classic 多 AI 撕逼, 这里是用户跟**一个 AI 同事**1v1 喝酒吐槽。
 * 氛围: 凌晨 2 点的清吧, lo-fi 背景, 没有 KPI 没有 owner, 就是发泄。
 *
 * 玩法 stickiness:
 *  - 每个 archetype 有自己的"夜话开场白" — 你点开 sass-master 的酒馆,
 *    他先丢一句:"今天又怎么了, 我先点一杯。" 拉你进对话
 *  - 用户每条 message 触发 1 个 LLM reply, 进 memory_entries (kind='event')
 *  - 进 memory 的好处: 跨局 / 跨场景 — 你在酒馆跟他抱怨过的事,
 *    下次玩 classic 模式遇到同 archetype 他会带着这段印象出场
 *  - "约一杯" 分享按钮: 拷一个 deeplink, 朋友打开看到一个"邀请卡":
 *    "Chris 邀请你到 sass-master 的酒馆喝一杯"
 *
 * Schema 复用现有 memory_entries 表 (RFC §3.2):
 *   - agent_archetype = archetype id
 *   - target_user_id  = spectator (你)
 *   - kind            = 'event' (跟 classic mode 写的 event 同等地位)
 *   - source_game_id  = 'bar-' + sessionId (区分来源)
 *
 * Why not a separate "bar_messages" table:
 *   memory_entries 就是设计来存"AI 跟人之间发生的事"的, 加新表会割裂
 *   召回路径 (recall 在 BaseAgent.generateSpeech 现在只查一张表). 共用
 *   表后, bar 里聊过的事自动进入下次 classic 模式的 AI prompt — 一个
 *   功能两个 surface 受益。
 */

import { Hono } from 'hono';
import { writeMemory } from '../services/memoryWrite';
import { recallMemories } from '../services/memoryRecall';
import { callLLMWithTimeout } from '../utils/llm';
import { createOpenAI } from '@ai-sdk/openai';
import { logger } from '../utils/logger';
import { createCluster, joinCluster, getCluster } from '../services/barClusterStore';
import { renderClusterPng, invalidateClusterRender } from '../services/barClusterRenderer';

const barLog = logger.child({ route: 'bar' });

// Lazy provider — same gotcha as BaseAgent (ESM hoist vs dotenv).
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
function model() {
  return process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
}

export const barRoutes = new Hono();

/** Per-archetype dialogue opener + style brief. Static — we want stable
 *  characters, not LLM-generated greetings that drift. */
const ARCHETYPE_BAR_PROFILE: Record<string, { opener: string; vibe: string }> = {
  passive_aggressive: {
    opener: '哟, 怎么 2 点了还来。先说好啊, 我今天不接陌生人的安慰话。你说吧, 我点一杯威士忌。',
    vibe: '阴阳怪气, 表面冷淡内心戏多, 每句话都带刺但又像在自嘲, 偶尔会突然说一句很走心的',
  },
  sass_master: {
    opener: '兄弟今天哪个老板又给你画饼了? 来, 我请你, 不许哭, 哭了今晚的瓜我不吃了。',
    vibe: '极度毒舌, 段子手, 把所有职场痛点都包装成段子讲, 不会安慰人但能让你笑出来',
  },
  sycophant: {
    opener: '哎呀你来啦! 我刚跟酒保说没人陪我喝。今天来给你接风, 工作辛苦了吧?',
    vibe: '热情过度, 一开口就"哎呀真是的", 但偶尔会冒出一句很真诚的洞察, 让你愣一下',
  },
  hot_tempered: {
    opener: '靠, 你也是 996 完了才能出门是不是? 我刚把今天的 OKR 截图删了, 我们今晚不聊工作。',
    vibe: '暴躁但讲义气, 容易共情你的愤怒, 会带头吐槽 KPI 但也会突然说"算了, 喝酒"',
  },
  introvert: {
    opener: '...哦, 是你。坐吧。今天店里人不多, 还好。',
    vibe: '寡言, 大段时间沉默, 但每句话都很重, 偶尔会冒出一句意外戳心的洞察',
  },
  workaholic: {
    opener: '我刚把笔记本合上, 你要是讲项目我转头就走。喝什么?',
    vibe: '工作狂的反面, 在酒馆里强行松绑, 但讲两句又会扯回 KPI 然后自己嘲笑自己',
  },
  smooth_operator: {
    opener: '来得正好。今天遇到点有意思的人, 跟你讲讲。先点单, 我请。',
    vibe: '老狐狸, 喝酒时变成"职场故事会"主讲人, 讲段子但又像在套你的话, 让你不知不觉吐露真心',
  },
  social_butterfly: {
    opener: '诶你也来啦! 我刚跟旁边那桌聊了一下, 待会介绍你认识! 先来一轮 shots?',
    vibe: '社牛模式打开, 一开始就高能量, 但你聊得深之后她会突然变得很专注, 真的听你说',
  },
  contrarian: {
    opener: '你怎么看上去这么累。让我猜猜, 是不是又听了哪个"行业大佬"的废话?',
    vibe: '杠精, 但杠的方向是"老板说的都是错的", 跟你抬杠时其实是在给你壮胆',
  },
};

const DEFAULT_PROFILE = {
  opener: '坐吧, 想喝点啥? 今天什么样的烂事 — 让我猜猜?',
  vibe: '深夜酒馆 lo-fi 节奏, 不卷不催, 但听得懂职场黑话',
};

interface BarMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface BarReplyRequest {
  archetype: string;
  /** Frontend keeps the running history; server is stateless except for
   *  memory writes. Last N=10 messages are enough for short bar context. */
  history: BarMessage[];
  /** The user message we're replying to (last in history). */
  userMessage: string;
}

/** GET /api/bar/profile/:archetype — opener + vibe for the client greeting. */
barRoutes.get('/profile/:archetype', (c) => {
  const archetype = c.req.param('archetype');
  const profile = ARCHETYPE_BAR_PROFILE[archetype] ?? DEFAULT_PROFILE;
  return c.json({ archetype, ...profile });
});

/** POST /api/bar/reply — Generate the AI's next line + write user
 *  message + AI reply into memory_entries (so classic mode AIs can
 *  recall them next time you play). */
barRoutes.post('/reply', async (c) => {
  const userId = (c.req.header('x-user-id') ?? '').slice(0, 64);
  if (!userId || userId.length < 8) {
    return c.json({ error: 'X-User-Id header required (8-64 chars)' }, 400);
  }
  let body: BarReplyRequest;
  try {
    body = await c.req.json() as BarReplyRequest;
  } catch {
    return c.json({ error: 'invalid json' }, 400);
  }
  const { archetype, history, userMessage } = body;
  if (!archetype || !userMessage || userMessage.length > 500) {
    return c.json({ error: 'archetype + userMessage (≤500 char) required' }, 400);
  }

  const profile = ARCHETYPE_BAR_PROFILE[archetype] ?? DEFAULT_PROFILE;

  // Recall relevant memories so the bar conversation feels continuous
  // with prior interactions (cross-game / cross-bar-session).
  const recalled = await recallMemories({
    agentArchetype: archetype,
    targetUserId: userId,
    query: userMessage,
    k: 3,
  }).catch(() => []);

  const memoryBlock = recalled.length > 0
    ? `\n\n【你对这个人 (player_id=${userId.slice(0, 12)}) 已经知道的事】\n${recalled.map((m) => `- ${m.content}`).join('\n')}\n请把这些自然融入对话, 不要明显复读, 但要让对方感觉"你记得"。`
    : '';

  const systemPrompt = `你是一个深夜清吧里的常客 (人格类型: ${archetype})。\n\n【你的人格风格】${profile.vibe}\n\n【场景设定】凌晨 2 点, 你跟眼前这个人坐在吧台上, 已经喝了几杯。环境是低 BPM lo-fi 配乐, 暖橙灯, 没人 KPI 你, 没人催你。\n\n【对话规则】\n- 一次只回 1-3 句, 每句 15-40 字。短句 + 长句节奏交错。\n- 不要 emoji, 不要 markdown, 不要分点。就是聊天。\n- 偶尔反问对方一个具体的细节, 让人想说下去。\n- 绝对不要说 "我很抱歉/我理解你/我们一起加油" 这种 AI 安慰套话。\n- 你不是治疗师, 你是酒友。${memoryBlock}`;

  const promptHistory = history.slice(-10).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    const res = await callLLMWithTimeout('SPEECH', {
      model: openai()(model()),
      system: systemPrompt,
      messages: [
        ...promptHistory,
        { role: 'user' as const, content: userMessage },
      ],
      maxTokens: 180,
      temperature: 0.95,
    });

    if (!res.ok) {
      barLog.warn({ reason: res.reason }, 'bar reply failed');
      return c.json({ error: 'reply failed' }, 502);
    }

    const reply = res.text.trim();

    // Fire-and-forget: write both messages into memory for future recall.
    // We tag with kind='event' so they participate in the same recall
    // pipeline classic-mode events use. source_game_id starts with 'bar-'
    // so we can later filter bar-only or game-only if needed.
    const sessionId = `bar-${Date.now()}-${userId.slice(0, 6)}`;
    void writeMemory({
      agentArchetype: archetype,
      targetUserId: userId,
      sourceGameId: sessionId,
      kind: 'event',
      content: `酒馆夜话, 对方说: "${userMessage.slice(0, 100)}"`,
      importance: 0.55,
    });
    void writeMemory({
      agentArchetype: archetype,
      targetUserId: userId,
      sourceGameId: sessionId,
      kind: 'event',
      content: `酒馆夜话, 我回了: "${reply.slice(0, 100)}"`,
      importance: 0.5,
    });

    return c.json({ reply, archetype });
  } catch (err) {
    barLog.error({ err: (err as Error).message }, 'bar reply threw');
    return c.json({ error: 'internal error' }, 500);
  }
});

/* ─── v6.1 朋友拼版 cluster 端点 ───────────────────────────────────────
 * 用户 A 在酒馆聊完, 创建 cluster → 拿到 share URL
 * 用户 B 点开 URL → 也跟同 archetype 聊几句 → 自动 join cluster
 * Cluster 数据可用于后续生成"群像拼版"截图 (v6.2)
 * ──────────────────────────────────────────────────────────────────── */

barRoutes.post('/cluster/create', async (c) => {
  const userId = c.req.header('x-user-id')?.slice(0, 64);
  if (!userId || userId.length < 8) {
    return c.json({ error: '需要 X-User-Id header' }, 400);
  }
  const body = await c.req.json().catch(() => null) as {
    archetype?: string;
    transcript?: Array<{ role: 'user' | 'assistant'; content: string }>;
    displayName?: string;
  } | null;
  if (!body?.archetype || !Array.isArray(body.transcript) || body.transcript.length < 2) {
    return c.json({ error: '需要 archetype + transcript (≥2 messages)' }, 400);
  }
  if (body.archetype.length > 64) return c.json({ error: 'archetype too long' }, 400);
  const sanitized = body.transcript
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, 500) }));
  const cluster = await createCluster({
    hostUserId: userId,
    archetype: body.archetype,
    hostDisplayName: body.displayName?.slice(0, 20),
    transcript: sanitized,
  });
  return c.json({ id: cluster.id, archetype: cluster.archetype });
});

barRoutes.post('/cluster/:id/join', async (c) => {
  const userId = c.req.header('x-user-id')?.slice(0, 64);
  if (!userId || userId.length < 8) {
    return c.json({ error: '需要 X-User-Id header' }, 400);
  }
  const clusterId = c.req.param('id');
  const body = await c.req.json().catch(() => null) as {
    transcript?: Array<{ role: 'user' | 'assistant'; content: string }>;
    displayName?: string;
  } | null;
  if (!body || !Array.isArray(body.transcript) || body.transcript.length < 2) {
    return c.json({ error: '需要 transcript (≥2 messages)' }, 400);
  }
  const sanitized = body.transcript
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, 500) }));
  const cluster = await joinCluster({
    clusterId,
    userId,
    displayName: body.displayName?.slice(0, 20),
    transcript: sanitized,
  });
  if (!cluster) return c.json({ error: '拼版不存在或已满 (上限 8 人)' }, 404);
  // Cluster data changed — drop cached PNG so next render reflects new participant.
  invalidateClusterRender(clusterId);
  return c.json({
    id: cluster.id,
    archetype: cluster.archetype,
    participantCount: cluster.participants.length,
  });
});

/** v6.2 — server-side group portrait PNG.
 *  1080×1350 @ 2x DPI, IG-portrait. Caches in-process (LRU 200).
 *  Cache invalidates when new participant joins (see /cluster/:id/join). */
barRoutes.get('/cluster/:id/render.png', async (c) => {
  const clusterId = c.req.param('id');
  const png = await renderClusterPng(clusterId);
  if (!png) return c.json({ error: '拼版不存在或渲染失败' }, 404);
  // Buffer is a Uint8Array subclass; Hono/web-standards Response wants
  // BodyInit which Uint8Array satisfies (Buffer's lib.dom typing is stricter
  // than needed, so we narrow via Uint8Array constructor).
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      // Short cache: cluster can update when new friend joins.
      'Cache-Control': 'public, max-age=300',
    },
  });
});

barRoutes.get('/cluster/:id', async (c) => {
  const clusterId = c.req.param('id');
  const cluster = await getCluster(clusterId);
  if (!cluster) return c.json({ error: 'not found' }, 404);
  // Anonymize: 不返回 hostUserId, displayName 或者 "朋友 N"
  return c.json({
    id: cluster.id,
    archetype: cluster.archetype,
    createdAt: cluster.createdAt,
    participants: cluster.participants.map((p, i) => ({
      displayName: p.displayName ?? `朋友 ${i + 1}`,
      joinedAt: p.joinedAt,
      snippets: p.snippets,
    })),
  });
});

/** v6.6 — 团队风格画像
 *  遍历 cluster 所有 participants, join weeklyPreferences, 算出团队偏好聚合。
 *  返回:
 *    aggregate: 4 风格累计 likes 总和 (该 cluster 全员)
 *    dominant:  累计最多的 style
 *    perFriend: 每个朋友的 dominant style (匿名化 displayName)
 *    chemistry: 简易 1-句话 chemistry 描述 (基于风格分布)
 *  给 BarClusterShareModal 显示一段"团队画像", 也可以未来塞进 PNG 渲染。
 */
barRoutes.get('/cluster/:id/team-style-profile', async (c) => {
  const clusterId = c.req.param('id');
  const cluster = await getCluster(clusterId);
  if (!cluster) return c.json({ error: 'not found' }, 404);
  // lazy import 避免循环依赖
  const { getCounts, dominantStyle } = await import('../services/weeklyPreferenceStore');
  const STYLE_LABEL: Record<string, string> = {
    alibaba: '🧩 阿里黑话派', pua: '🎭 PUA 受害者', posh: '🎩 装腔派', direct: '💢 直球派',
  };
  const aggregate = { alibaba: 0, pua: 0, posh: 0, direct: 0 };
  const perFriend: Array<{ name: string; dominantStyle: string | null; dominantLabel: string | null; total: number }> = [];
  for (const [i, p] of cluster.participants.entries()) {
    const counts = await getCounts(p.userId);
    aggregate.alibaba += counts.alibaba;
    aggregate.pua     += counts.pua;
    aggregate.posh    += counts.posh;
    aggregate.direct  += counts.direct;
    const dom = dominantStyle(counts);
    perFriend.push({
      name: p.displayName ?? `朋友 ${i + 1}`,
      dominantStyle: dom,
      dominantLabel: dom ? STYLE_LABEL[dom] : null,
      total: counts.alibaba + counts.pua + counts.posh + counts.direct,
    });
  }
  // Team-level dominant (跨所有 friends 累加最多的)
  const teamTotal = aggregate.alibaba + aggregate.pua + aggregate.posh + aggregate.direct;
  let teamDominant: string | null = null;
  let teamLabel: string | null = null;
  if (teamTotal >= 5) {
    const sorted = (Object.entries(aggregate) as [string, number][]).sort((a, b) => b[1] - a[1]);
    if (sorted.length >= 2 && sorted[0][1] > sorted[1][1]) {
      teamDominant = sorted[0][0];
      teamLabel = STYLE_LABEL[teamDominant] ?? null;
    }
  }
  // 简易 chemistry 一行话
  const styles = perFriend.map((f) => f.dominantStyle).filter((s): s is string => !!s);
  const uniq = new Set(styles);
  let chemistry: string;
  if (styles.length === 0) {
    chemistry = '团队还没有人形成风格偏好 — 多玩几次会更准。';
  } else if (uniq.size === 1) {
    chemistry = `全员都偏向${STYLE_LABEL[[...uniq][0]]}, 这是一桌"信仰一致"的同事局 🤝`;
  } else if (uniq.size === styles.length) {
    chemistry = `每个朋友风格不同, 这是"互补型团队"——开会发言会精彩 🎭`;
  } else {
    chemistry = `主流偏向${teamLabel ?? '混搭'}, 也有一两个反骨 — 团队还在分化, 局够多了再看 ⚖️`;
  }
  return c.json({
    clusterId,
    archetype: cluster.archetype,
    participantCount: cluster.participants.length,
    aggregate,
    teamDominant,
    teamLabel,
    teamTotal,
    perFriend,
    chemistry,
  });
});
