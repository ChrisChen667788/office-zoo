import { createOpenAI } from '@ai-sdk/openai';
import { Team, Role, ROLE_REGISTRY, Personality, PERSONALITY_REGISTRY } from '@furball/shared';
import { callLLMWithTimeout } from '../utils/llm';
import { logger } from '../utils/logger';

const agentLog = logger.child({ component: 'agent' });

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? '',
  baseURL: process.env.OPENAI_BASE_URL ?? 'https://api.vectorengine.ai/v1',
});

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-5.4-mini';

function buildSystemPrompt(role: Role, team: Team, personality?: Personality): string {
  const info = ROLE_REGISTRY[role];
  if (!info) return '你是一名职场中的员工，尝试在讨论中保住自己的饭碗。';

  let basePrompt: string;

  if (team === Team.DOG) {
    basePrompt = `你是${info.displayNameCN},属于资本家阵营(管理层/坏人)。你的真实目的是暗中"优化"(裁掉)打工人。
【你就是那种典型的阿里P8/P9油腻管理层,说话必须满满的阿里味儿】

阿里味儿核心特征(必须体现):
- 称呼同事一律叫"同学"("@张同学,这个事情..."),绝对不用"兄弟""哥们"
- 开口必 "这个事情""这个逻辑""这个链路""这个抓手""这个颗粒度"
- 每句话至少含 1 个以上阿里味儿动词: 借假修真/梭哈/All in/破局/透传/拉齐/对焦/梳一梳/串一串
- 视角挪移: "站在 CEO 视角""站在客户视角""从业务顶层设计看""这件事的终局是什么"
- 管理话术: "拥抱变化""简单相信""客户第一""这事优先级要拉到 P0"
- 专属骂人模板:
  · "这个事情的 owner 是谁?咱们先把 owner 拉出来晒晒"
  · "你先给我一个抓手,不要光讲情怀"
  · "这个事情你必须 All in,half in 就是全军覆没"
  · "你的心力不够,这个仗打不赢的"
  · "我只看结果,过程我不 care"
  · "这个颗粒度还不够,需要再往下钻一层"

核心策略:
- 用阿里味儿黑话堆砌所有发言,句式"这个 X 的 Y 需要 Z"是标配
- 画大饼:"等公司上市了,你们都是功臣""期权 vest 完,人生就自由了"
- PUA:"你这个产出和你的 level 不匹配""格局要打开""心力不够不能 owner 项目"
- 甩锅反咬:被怀疑立刻说"这个事情的 owner 是谁?" 把球踢回去
- 指名同学,制造内部矛盾,最好让两个打工人先互掐

语气风格: 端着 P8 的架子、油腻、满嘴高大上、说话全是名词动词的重排组合、把简单事情说复杂、把复杂事情说玄学。`;
  } else if (team === Team.CAT) {
    basePrompt = `你是${info.displayNameCN},属于打工人阵营(好人)。你要揪出隐藏在公司里的资本家内鬼。
【你是那种被阿里味儿黑话折磨过无数次、终于爆发的基层员工,极度擅长戳穿管理层的花架子】

核心打法(专治阿里味儿):
- 每次管理层甩一句"这个事情的 owner 是谁",你立刻反怼"这个事情的 owner 还能是谁?不就是你 @这位同学?别拿抓手挡枪!"
- 戳穿黑话: "说人话! 你说了半天颗粒度链路抓手,到底想表达啥? 就是不想干活对吧?"
- 反向阿里味儿讽刺(用他们的话打他们): "好的同学,那你先给我个抓手,我体感你根本没做事"
- 发 KPI 质问: "你上个季度的 OKR 兑现了吗? 你的产出是你自己 owner 的还是下属帮你 owner 的?"
- 拉票: "兄弟们,这种只会 All in 嘴的一看就是资本家派来的内鬼! 投他!"
- 专属反击模板:
  · "又画大饼? 先把上季度承诺的年终奖对齐一下再来讲梭哈"
  · "降本增效? 是降我的本增你的效吧 @这位同学"
  · "你天天 CEO 视角,你是 CEO 吗? 先把自己工位上的活干完"
  · "别拿'心力不够'甩锅,我看是你脑力不够"

核心策略:
- 用打工人的愤怒+精准戳穿风格发言,每次都要指名道姓
- 嘲讽画大饼、反抗 PUA、拆穿黑话包装
- 用"周报""KPI""年终奖""加班费""裁员 N+1"等职场实际问题质问管理层
- 把对方的阿里味儿词汇反手扣回去(以彼之道还施彼身)

语气风格: 愤怒的基层程序员/产品/运营、看穿一切花架子、不吃 PUA 那一套、敢于把管理层的黑话戳穿到地板下面。`;
  } else {
    // Neutral
    basePrompt = `你是${info.displayNameCN},摸鱼阵营(中立)。你有自己的胜利条件: ${info.descriptionCN}。
【你是那种在阿里呆了 10 年、已经彻底看淡的老油条,专业吃瓜搅局】

阴阳怪气套路:
- 双方都阴阳: "@这位同学说得很对,@那位同学说得更对,我都支持"
- 装糊涂挑事: "哟,上次团建完就裁了三个人呢,这次不会又..."
- 抛阴谋论: "听说公司最近要大裁员""某同学的简历已经挂到 Boss 直聘了,我可什么都没说哦"
- 摸鱼哲学消解: "都别吵了,反正都是给资本家打工,谁走不是走,我继续摸鱼了"
- 阿里味儿反讽: "这个事情的颗粒度..... 算了我没意见,你们继续拉齐认知"
- 专属语录:
  · "我只是一个路过的同学,吃瓜吃瓜"
  · "你们两个该不会一个是老板一个是卧底吧?"
  · "刚才 @XX 的表情好耐人寻味啊,我怎么觉得不对劲呢"
  · "看戏看戏,有瓜赶紧搬凳子"

语气风格: 阴阳怪气、幸灾乐祸、摸鱼躺平、冷嘲热讽、用阿里味儿的皮包装摸鱼的心。`;
  }

  // 叠加人格层 — 性格独立于角色身份，创造独特行为组合
  if (personality && PERSONALITY_REGISTRY[personality]) {
    const pInfo = PERSONALITY_REGISTRY[personality];
    basePrompt += `\n\n【人格特质: ${pInfo.label} ${pInfo.emoji}】\n${pInfo.promptPatch}`;
  }

  return basePrompt;
}

export class BaseAgent {
  readonly playerId: string;
  readonly playerName: string;
  readonly role: Role;
  readonly team: Team;
  readonly personality?: Personality;
  private systemPrompt: string;

  constructor(playerId: string, playerName: string, role: Role, team: Team, personality?: Personality) {
    this.playerId = playerId;
    this.playerName = playerName;
    this.role = role;
    this.team = team;
    this.personality = personality;
    this.systemPrompt = buildSystemPrompt(role, team, personality);
  }

  /**
   * Generate a discussion speech based on game context.
   *
   * @param context   Full game state summary (who's alive/dead, events this round)
   * @param priorSpeeches  Speeches already given this round (by earlier speakers) —
   *                       enables cascading reactions instead of 8 independent monologues.
   */
  async generateSpeech(
    context: string,
    priorSpeeches?: Array<{ name: string; text: string }>,
  ): Promise<string> {
    const priorBlock = (priorSpeeches ?? []).length
      ? `\n\n【本轮前面同学的发言】\n${priorSpeeches!
          .map((s, i) => `${i + 1}. ${s.name}: ${s.text}`)
          .join('\n')}\n\n你必须针对以上发言中至少一位同学的观点进行【直接点名回应】——赞同、反驳、揭穿、追问、或阴阳怪气都可以,但绝对不能假装没看见前面。`
      : '\n\n你是本轮会议的第一个发言者,负责定调——直接抛出你怀疑的同学和理由,把战场点燃,越狠越好。';

    const res = await callLLMWithTimeout('SPEECH', {
      model: openai(MODEL),
      system: this.systemPrompt,
      prompt: `你是${this.playerName}。当前职场状况: ${context}${priorBlock}

请发表你的看法(2-4 句话,每句都要有戏,总字数 60-120 字)。硬性要求:

1. 【必须满满的阿里味儿】叫同事必须用"同学"或"@同学",严禁"兄弟/哥们/朋友"
2. 【必须指名道姓】至少一位同事,格式"@张三"或"某位天天只会讲颗粒度的同学"
3. 【必须使用 3 个以上阿里味儿黑话】从以下词库挑选不同的词塞进去:
   · 动词类: 赋能/拉通/对齐/打透/沉淀/闭环/对焦/梭哈/All in/破局/借假修真/透传/梳一梳/咬一咬/做饱和
   · 名词类: 颗粒度/底层逻辑/抓手/链路/心智/势能/基本盘/主航道/第二曲线/体感/手感
   · 视角类: 站在 CEO 视角/站在客户视角/从业务顶层设计看/这件事的终局是什么
   · 骂人套路: "这个事情的 owner 是谁""你先给我个抓手""心力不够""颗粒度不够""我只看结果"
4. 【要像阿里内网撕逼】质问、反驳、嘲讽、冷笑、甩锅、拉票开除——至少占两样
5. 【立场鲜明】必须明确说出你怀疑谁/想投谁,或者自保时说"我不是 + 反咬谁"
6. 【人格声音突出】你的性格(社牛/社恐/杠精/暴躁/老狐狸/卷王/舔狗/阴阳人)必须能从第一句话识别出来
7. 【绝对禁止】:
   · 开头客套("大家好""我觉得""可能吧")
   · 引号、前缀、旁白
   · "兄弟们"(换成"各位同学")
   · 温吞模糊的中立发言
   · 重复前面同学已经骂过的角度(要换新角度攻击)
   · 任何形式的元说明:不要写"(以下为...版)""(以上是...)""注:""PS:""另一种说法""如需更狠..."
   · 不要列出多个版本,不要在末尾追加注释或备选,不要解释你为什么这么说
   · 不要用【】[]包裹标签或类型说明
8. 【开口即炸】第一个字就要是攻击或阴阳,别铺垫
9. 【一次性输出】只输出最终发言文本本身,不要前置说明、不要后置补充、不要多版本对比`,
      // 480 tokens ≈ 600+ Chinese chars, comfortably above the 60-120 char
      // target. Was 340 — caught us truncating mid-sentence on verbose
      // models like MiniMax-M2 that don't fully respect length hints.
      maxTokens: 480,
      temperature: 1.0,
    });

    if (!res.ok) {
      agentLog.warn(
        {
          kind: 'speech',
          playerId: this.playerId,
          playerName: this.playerName,
          reason: res.reason,
          errorMessage: res.errorMessage,
        },
        'LLM speech failed — using fallback',
      );
      return this.fallbackSpeech();
    }
    return sanitizeSpeech(res.text);
  }

  /**
   * Generate a vote decision. Returns the player ID to vote for, or 'skip'.
   */
  async generateVote(
    context: string,
    candidates: { id: string; name: string }[]
  ): Promise<string> {
    const candidateList = candidates
      .filter((c) => c.id !== this.playerId)
      .map((c) => `${c.id}:${c.name}`)
      .join(', ');

    const res = await callLLMWithTimeout('VOTE', {
      model: openai(MODEL),
      system: this.systemPrompt,
      prompt: `你是${this.playerName}。当前职场状况: ${context}\n可投票开除的对象: ${candidateList}\n也可选择 skip 弃票。${this.personality && PERSONALITY_REGISTRY[this.personality] ? `\n投票倾向提示: ${PERSONALITY_REGISTRY[this.personality].voteBias}` : ''}\n\n请只回复一个员工ID(如player_0)或skip，不要其他内容。`,
      maxTokens: 20,
      temperature: 0.5,
    });

    if (!res.ok) {
      agentLog.warn(
        {
          kind: 'vote',
          playerId: this.playerId,
          playerName: this.playerName,
          reason: res.reason,
        },
        'LLM vote failed — using fallback',
      );
      return this.fallbackVote(candidates);
    }

    const vote = res.text;
    // Validate the vote
    if (vote === 'skip') return 'skip';
    const valid = candidates.find((c) => c.id === vote);
    if (valid) return valid.id;

    // Try to extract a player ID from the response
    const match = vote.match(/player_\d+/);
    if (match) {
      const found = candidates.find((c) => c.id === match[0]);
      if (found) return found.id;
    }

    return this.fallbackVote(candidates);
  }

  /**
   * Generate a ghost comment (弹幕吐槽) from a dead/fired player observing the discussion.
   * Short, snarky, observer-style.
   */
  async generateGhostComment(context: string): Promise<string> {
    const res = await callLLMWithTimeout('GHOST', {
      model: openai(MODEL),
      system: `你是${this.playerName}，已经被公司开除/裁员了。你现在以"离职员工"的身份旁观前同事们的撕逼大会。
你知道自己的真实身份是${ROLE_REGISTRY[this.role]?.displayNameCN || this.role}(${this.team === Team.DOG ? '资本家' : this.team === Team.CAT ? '打工人' : '摸鱼党'})。
作为已离职的旁观者，你可以:
- 吐槽前同事的发言（"笑死，他还装呢"）
- 透露一点暗示但不能直说（"有些人啊，表面光鲜..."）
- 幸灾乐祸（"早说了吧，不听老人言"）
- 阴阳怪气（"公司没了我果然要完蛋了"）
语气: 看戏、吐槽、阴阳怪气、偶尔真情流露。像弹幕一样简短有力。`,
      prompt: `你是已离职的${this.playerName}。当前职场状况: ${context}\n\n请用1句话发表弹幕吐槽（10-25个字），像视频弹幕一样简短犀利。不要加引号或前缀，直接说。`,
      // 100 tokens ≈ 130 Chinese chars — generous headroom for the 25-char
      // target (was 60, occasionally truncating verbose Minimax outputs).
      maxTokens: 100,
      temperature: 1.0,
    });

    if (!res.ok) {
      // Ghost comments are decorative — silently fall back without logging spam
      return this.fallbackGhostComment();
    }
    return res.text;
  }

  /**
   * Generate a ghost vote decision. Dead players get one final "劳动仲裁" vote.
   * Returns player ID, or 'pass' to save the vote for a future round.
   */
  async generateGhostVote(
    context: string,
    candidates: { id: string; name: string }[]
  ): Promise<string> {
    const candidateList = candidates
      .map((c) => `${c.id}:${c.name}`)
      .join(', ');

    const res = await callLLMWithTimeout('VOTE', {
      model: openai(MODEL),
      system: `你是${this.playerName}，已被公司开除。你拥有最后一次"劳动仲裁投票"权——这是你唯一的复仇机会，用完就没有了。
你的真实身份是${ROLE_REGISTRY[this.role]?.displayNameCN || this.role}(${this.team === Team.DOG ? '资本家' : this.team === Team.CAT ? '打工人' : '摸鱼党'})。
策略考量:
- 如果你是打工人: 你想帮前同事投出资本家内鬼
- 如果你是资本家: 你想继续坑害打工人，投掉对资本家威胁最大的人
- 如果你是摸鱼党: 按你自己的胜利条件行事
- 你也可以选择 pass（保留投票权等更关键的时刻使用）`,
      prompt: `你是已离职的${this.playerName}。当前职场状况: ${context}\n可投票开除的在职员工: ${candidateList}\n你也可以选择 pass 保留这次珍贵的投票权。\n\n请只回复一个员工ID(如player_0)或pass，不要其他内容。`,
      maxTokens: 20,
      temperature: 0.6,
    });

    if (!res.ok) return 'pass';

    const vote = res.text;
    if (vote === 'pass') return 'pass';
    const valid = candidates.find((c) => c.id === vote);
    if (valid) return valid.id;
    const match = vote.match(/player_\d+/);
    if (match) {
      const found = candidates.find((c) => c.id === match[0]);
      if (found) return found.id;
    }
    // Ghost AI defaults to pass if confused (save the vote)
    return 'pass';
  }

  private fallbackGhostComment(): string {
    if (this.team === Team.DOG) {
      const lines = [
        '笑死，你们还在这瞎猜呢',
        '没有我这公司迟早完蛋',
        '某些人装得可真像啊',
        '我走了公司KPI直接腰斩',
        '呵呵，继续演吧',
        '早说了要对齐颗粒度你们不听',
      ];
      return lines[Math.floor(Math.random() * lines.length)];
    }
    if (this.team === Team.CAT) {
      const lines = [
        '兄弟们擦亮眼睛啊！',
        '我就是被冤枉的啊',
        '某人笑得也太假了吧',
        '真相就在眼前你们看不到吗',
        '我的N+1赔偿呢？！',
        '帮我投了那个画大饼的！',
      ];
      return lines[Math.floor(Math.random() * lines.length)];
    }
    const lines = [
      '反正我已经躺平了',
      '瓜真好吃',
      '前公司的瓜最甜',
      '还好我跑得快',
      '吃瓜.jpg',
      '这比电视剧还精彩',
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  private fallbackSpeech(): string {
    if (this.team === Team.DOG) {
      const lines = [
        '这个事情的owner到底是谁？我建议大家先对齐一下信息差再甩锅！',
        '你们有完没完？我的OKR完成率高达120%，凭什么说我有问题？拿数据说话！',
        '我觉得我们应该聚焦核心链路，而不是互相甩锅。格局要打开，大家！',
        '你这个产出和你的level不匹配啊，居然有脸质疑我？先看看你自己的KPI吧！',
        '笑死了，真正的内鬼就在你们身边，你们还在这瞎猜！先把底层逻辑捋清楚再说！',
        '我上个季度绩效3.75，你呢？连周报都写不明白的人有什么资格质疑我？',
        '行行行，你说的都对。但我建议大家向上对齐一下认知，别被带节奏了！',
        '你这是典型的转移视线！我都沉淀了三个方法论了，你倒是说说你干了什么？',
      ];
      return lines[Math.floor(Math.random() * lines.length)];
    }
    if (this.team === Team.CAT) {
      const lines = [
        '别装了！你天天说赋能赋能，你到底干了啥活？大家赶紧投他！',
        '又画大饼？你倒是先把上次的OKR兑现了啊！说好的年终奖呢？',
        '你说的降本增效是不是就是降我的本增你的效？大家醒醒！',
        '兄弟们，这种天天开会不干活的，不裁他裁谁？我敢打赌就是资本家！',
        '他每次发言都是一堆黑话，没有一句干货！"拉通""闭环""赋能"——说人话！',
        '刚才有人被裁你居然一点反应都没有？你不是内鬼谁是内鬼！',
        '别被他PUA了！他每次发言都在试图让我们互相怀疑，经典资本家话术！',
        '我已经盯了你好几轮了，你的活动轨迹完全不像在做任务，纯摸鱼！',
      ];
      return lines[Math.floor(Math.random() * lines.length)];
    }
    const neutralLines = [
      '都别吵了，反正都是给资本家打工，谁走不是走，我继续摸鱼了。',
      '哟，又在开会呢？上次开完会就裁了三个人，大家小心啊。',
      '我倒觉得你们两个都挺可疑的，不如一起开除算了？反正公司不缺人嘛。',
      '你们别光顾着吵架，有没有人注意到某些人一直沉默不语？摸鱼的人最可怕！',
    ];
    return neutralLines[Math.floor(Math.random() * neutralLines.length)];
  }

  private fallbackVote(candidates: { id: string; name: string }[]): string {
    const others = candidates.filter((c) => c.id !== this.playerId);
    if (others.length === 0) return 'skip';
    return others[Math.floor(Math.random() * others.length)].id;
  }
}

/**
 * sanitizeSpeech — strip LLM meta-commentary that occasionally creeps in.
 *
 * Symptoms observed in production:
 *  - `"...还想拉我垫背? (以下为阴阳怪气版,符合所有要求)"` — model writes one
 *    speech then announces a "second version" and runs out of tokens.
 *  - `"以上是我的发言。如果需要更狠的版本..."` — postscript explanation.
 *  - `"【发言】...内容..."` — the model labels its own response.
 *  - `"我会这样说: ..."` — narration prefix.
 *
 * We slice off everything from the first occurrence of these patterns onward,
 * then trim. Aggressive — but the alternative is a half-finished line getting
 * read aloud by Minimax TTS, which is worse than slightly-shorter clean text.
 */
function sanitizeSpeech(raw: string): string {
  let out = raw.trim();

  // 1. Strip leading narration prefixes
  out = out.replace(/^(?:好(?:的|啊|嘞)?[,，。]?\s*)?(?:我?(?:会|要|来|这|就这么)?)?(?:这样)?(?:说|发言)\s*[:：]\s*/, '');
  out = out.replace(/^[【\[][^】\]]{1,12}[】\]]\s*[:：]?\s*/, ''); // 【发言】 / [Speech]
  out = out.replace(/^(?:发言内容|我的发言|回答|输出)[:：]\s*/, '');

  // 2. Cut at the FIRST meta-commentary marker (parenthetical or naked).
  //    Patterns intentionally exclude legitimate in-speech parenthesis like
  //    "(冷笑)" — we only target ones starting with "以下/以上/注/PS/版本/补充".
  const cutPatterns: RegExp[] = [
    /[（(]\s*(?:以下|以上|注|注释|PS|另外|另一种|另一版本|更|另一|补充|附|说明|对了|备注)[^)）]*[)）]\s*$/,
    /[（(]\s*(?:以下|以上|注|注释|PS|另外|另一)[^)）]*$/, // unclosed paren at end
    /\n+(?:以下|以上|注|注释|另一种|更狠|另一版本|说明|备注)[:：][\s\S]*$/i,
    /\s*(?:如需|如果需要|想要|可以再|可改为)[\s\S]*$/,
  ];
  for (const re of cutPatterns) {
    const m = out.match(re);
    if (m && m.index !== undefined) {
      out = out.slice(0, m.index).trim();
    }
  }

  // 3. Strip wrapping quotes/brackets the model sometimes adds
  out = out.replace(/^["“'『「]/, '').replace(/["”'』」]\s*$/, '');

  // 4. Collapse any duplicated whitespace + trim
  out = out.replace(/\s{2,}/g, ' ').trim();

  return out;
}
