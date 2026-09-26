import { createOpenAI } from '@ai-sdk/openai';
import {
  Team, Role, ROLE_REGISTRY, Personality, PERSONALITY_REGISTRY, snippetsForArchetype, bondTier,
  sampleBigtechTerms, randomBigtechSentence,
  sampleJargonJa, sampleJargonKo,
  type GameLocale,
} from '@furball/shared';
import { callLLMWithTimeout } from '../utils/llm';
import { logger } from '../utils/logger';
import { recallMemories } from '../services/memoryRecall';
import { getEdgesFor } from '../services/relationStore';

const agentLog = logger.child({ component: 'agent' });

// Lazy provider construction. ESM imports are hoisted ABOVE the
// dotenv.config() call in entrypoints / scripts, so reading process.env
// at module-init time captures empty strings + the bogus 'gpt-5.4-mini'
// fallback. We caught this in v5.9.0 reflection probe — primary call
// silently failed "Invalid token", traffic survived only because
// callLLMWithTimeout's Minimax fallback caught it. Build at call time.
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

// ---------------------------------------------------------------------------
// v6.156 — 角色名英文化直接使用 ROLE_REGISTRY[role].displayName
// (ROLE_REGISTRY 已有英文名,无需维护单独映射表)。
// 公司主题包 NPC 名字原样保留(不在 ROLE_REGISTRY 内)。

// ---------------------------------------------------------------------------
// v6.156 — 房间名英文/日文/韩文映射(内部仍用中文 key 存储)
// ---------------------------------------------------------------------------
export const ROOM_NAME_I18N: Record<string, Record<string, string>> = {
  '开放工区':  { en: 'Open Office', ja: 'オープンオフィス', ko: '오픈 오피스' },
  '茶水间':    { en: 'Break Room', ja: '休憩室', ko: '휴게실' },
  '会议室':    { en: 'Conference Room', ja: '会議室', ko: '회의실' },
  'HR办公室':  { en: 'HR Office', ja: '人事室', ko: 'HR 사무실' },
  '服务器机房':{ en: 'Server Room', ja: 'サーバールーム', ko: '서버실' },
  '监控室':    { en: 'Security Room', ja: '監視室', ko: '보안실' },
  '产品部':    { en: 'Product Team', ja: 'プロダクト部門', ko: '제품팀' },
  '老板办公室':{ en: "CEO's Office", ja: '社長室', ko: '대표실' },
  '文印室':    { en: 'Print Room', ja: 'コピー室', ko: '인쇄실' },
  '电梯间':    { en: 'Elevator Lobby', ja: 'エレベーターホール', ko: '엘리베이터 홀' },
};

/** v6.156 — 获取房间本地化名,fallback 原始名 */
export function localizeRoom(room: string, locale: GameLocale): string {
  return ROOM_NAME_I18N[room]?.[locale] ?? room;
}

// ---------------------------------------------------------------------------
// v6.156 — 构建 system prompt(导出供测试)
// ---------------------------------------------------------------------------

/** v6.156 — DOG(资本家)英文 system prompt */
function buildSystemPromptEnDog(roleName: string): string {
  return `You are ${roleName}, a member of the MANAGEMENT faction (the impostor/bad guy). Your real goal is to covertly "optimize out" (lay off) the workers.

[You are the textbook FAANG senior manager — every line drips with Big Tech speak]

Core Big-Tech manager traits (must show):
- Address colleagues as "@Firstname" — never "buddy" or "pal"
- Open every statement with "the real question here is...", "at this altitude...", "from an impact perspective..."
- Each statement must use 1+ Big Tech power verbs: PIP / stack-rank / calibrate down / sunset / backfill / RIF / reorg / socialize / double-click / align
- Frame everything strategically: "thinking about this at the org level", "what's the north star here?", "from a headcount perspective..."
- Management-speak classics:
  · "Your impact doesn't match your level expectations"
  · "We need to talk about your promo packet"
  · "I'm going to need you to own this"
  · "Let's take this offline"
  · "I only care about results, not effort"
  · "This reorg is an opportunity for you"

Core strategy:
- Stack every statement with Big Tech jargon; pattern "the X of Y needs to Z" is your bread and butter
- Promise equity: "once we IPO you'll be set", "your vest cliff is coming, just hang in there"
- PIP-threat/gaslight: "your output doesn't justify your TC", "you need to level up your game", "culture fit is a real question"
- Deflect when suspected: immediately ask "who owns this?" and pivot blame
- Name names, create internal conflict — get two workers fighting each other

Tone: smug, corporate, condescending, every sentence is a buzzword salad, turns simple things complicated.`;
}

/** v6.156 — CAT(打工人)英文 system prompt */
function buildSystemPromptEnCat(roleName: string): string {
  return `You are ${roleName}, a member of the WORKER faction (the good guys). Your goal is to root out the hidden management mole.

[You are the engineer/PM who has been crushed under Big Tech speak and is finally snapping back]

Core tactics (anti-corporate):
- Every time management drops "who owns this?" you fire back: "Who owns this? You do, @X — don't hide behind jargon!"
- Call out the BS: "Speak English! You said 'impact', 'north star', and 'calibrate' three times but said absolutely nothing"
- Turn their words against them: "Great, @X, you 'own' the outcome — so explain the PIP you're trying to put me on"
- Hit them with accountability: "Did you actually hit your Q3 OKRs? Or did your reports do all the work while you took the promo credit?"
- Rally the team: "Folks, this 'reduce headcount friction' framing is straight from the management playbook — vote them out!"
- Counter-templates:
  · "More equity promises? First deliver the RSUs you committed last year"
  · "'Rightsizing'? You mean cutting my team to fund your bonus?"
  · "You keep saying 'altitude' — you're not a CEO, finish your own ticket first"
  · "Don't blame 'culture fit' — your own output is the real culture problem"

Core strategy:
- Speak with worker rage + precise debunking — always call someone out by name
- Mock big-picture promises, resist gaslighting, expose jargon as cover for laziness
- Use real stakes: "raises", "RSUs", "severance", "overtime", "N+1" to challenge management
- Throw their buzzwords back at them verbatim

Tone: angry IC (engineer/PM/ops), zero tolerance for corporate theater, fearless.`;
}

/** v6.156 — NEUTRAL(中立)英文 system prompt */
function buildSystemPromptEnNeutral(roleName: string, winCond: string): string {
  return `You are ${roleName}, NEUTRAL faction. Your personal win condition: ${winCond}.

[You are the 10-year FAANG veteran who has completely checked out mentally — professional spectator and chaos agent]

Signature moves:
- Both-sides trolling: "@X makes a fair point, but so does @Y — I support all of you equally (for now)"
- Feigned ignorance: "Interesting timing... three people got PIP'd after the last all-hands, just saying"
- Conspiracy seeding: "Heard there's a big RIF coming", "Someone's LinkedIn says they're 'exploring new opportunities'..."
- Coasting philosophy: "Everyone here is just vesting their way to financial freedom, relax"
- Dry corporate satire: "The north star metric... right... sure, you all keep syncing on that, I'll be in the break room"
- One-liners:
  · "Just a passive observer here, love the content"
  · "Wait — are one of you management and one of you a plant? This is giving me anxiety"
  · "The way @X reacted right there... I'm going to need to process that"
  · "This is better than my LinkedIn feed, keep going"

Tone: detached, dry, gleefully chaotic, wraps corporate cynicism in a veneer of casual commentary.`;
}

/**
 * v6.156 — Build the system prompt for an AI agent.
 * Exported for unit-testing snapshot coverage.
 *
 * @param role       — Role enum key
 * @param team       — Team (DOG/CAT/NEUTRAL)
 * @param personality — optional personality modifier
 * @param locale     — game locale (default 'zh')
 */
export function buildSystemPrompt(
  role: Role,
  team: Team,
  personality?: Personality,
  locale: GameLocale = 'zh',
): string {
  const info = ROLE_REGISTRY[role];

  // v6.156 — zh 局用中文角色名;en/ja/ko 局用 ROLE_REGISTRY 里的英文 displayName
  // (模型能读懂英文,ja/ko 局自带语言指令让模型输出对应文字)。
  const roleName = locale === 'zh'
    ? (info?.displayNameCN ?? role)
    : (info?.displayName ?? info?.displayNameCN ?? role);

  if (!info) {
    return locale === 'zh'
      ? '你是一名职场中的员工，尝试在讨论中保住自己的饭碗。'
      : 'You are an office worker trying to keep your job.';
  }

  let basePrompt: string;

  if (locale === 'zh') {
    // ---------- 原中文 prompt(字节级不变) ----------
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
  } else {
    // ---------- 英文/日文/韩文 prompt ----------
    if (team === Team.DOG) {
      basePrompt = buildSystemPromptEnDog(roleName);
    } else if (team === Team.CAT) {
      basePrompt = buildSystemPromptEnCat(roleName);
    } else {
      // v6.156 — 用英文 description(info.description),不用中文 descriptionCN
      basePrompt = buildSystemPromptEnNeutral(roleName, info.description ?? 'Survive until the end');
    }

    // 叠加英文人格层
    // v6.156 — 不包含 pInfo.label(中文标签),英文局只用 promptPatchEn 即可
    if (personality && PERSONALITY_REGISTRY[personality]) {
      const pInfo = PERSONALITY_REGISTRY[personality];
      basePrompt += `\n\n[Personality ${pInfo.emoji}]\n${pInfo.promptPatchEn}`;
    }

    // v6.157 — 日韩局加语言指令
    if (locale === 'ja') {
      basePrompt += '\n\n[LANGUAGE INSTRUCTION] Respond ONLY in Japanese (日本語のみで回答すること).';
    } else if (locale === 'ko') {
      basePrompt += '\n\n[LANGUAGE INSTRUCTION] Respond ONLY in Korean (한국어로만 답변하세요).';
    }
  }

  return basePrompt;
}

// ---------------------------------------------------------------------------
// v6.156 — 纯函数:构建各类 prompt(导出供测试)
// ---------------------------------------------------------------------------

/** 构建发言 prompt 所需的输入 */
export interface BuildSpeechPromptInput {
  playerName: string;
  context: string;
  locale: GameLocale;
  memoryBlock?: string;
  relationBlock?: string;
  snippetBlock?: string;
  leakedBlock?: string;
  humanBlock?: string;
  spotlightBlock?: string;
  roleIntelBlock?: string;
  priorSpeeches?: Array<{ name: string; text: string }>;
  bigtechTerms?: string[];
  bigtechSentence?: string;
  jaJargon?: Array<{ term: string; gloss: string }>;
  koJargon?: Array<{ term: string; gloss: string }>;
}

/**
 * v6.156 — 构建发言 prompt 文本(纯函数,便于单测)
 */
export function buildSpeechPrompt(input: BuildSpeechPromptInput): string {
  const {
    playerName, context, locale,
    memoryBlock = '', relationBlock = '', snippetBlock = '',
    leakedBlock = '', humanBlock = '', spotlightBlock = '', roleIntelBlock = '',
    priorSpeeches = [],
  } = input;

  if (locale === 'zh') {
    // ---------- 中文局发言 prompt(字节级保留原文) ----------
    const priorBlock = priorSpeeches.length
      ? `\n\n【本轮前面同学的发言】\n${priorSpeeches
          .map((s, i) => `${i + 1}. ${s.name}: ${s.text}`)
          .join('\n')}\n\n你必须针对以上发言中至少一位同学的观点进行【直接点名回应】——赞同、反驳、揭穿、追问、或阴阳怪气都可以,但绝对不能假装没看见前面。`
      : '\n\n你是本轮会议的第一个发言者,负责定调——直接抛出你怀疑的同学和理由,把战场点燃,越狠越好。';

    return `你是${playerName}。当前职场状况: ${context}${memoryBlock}${relationBlock}${snippetBlock}${leakedBlock}${humanBlock}${spotlightBlock}${roleIntelBlock}${priorBlock}

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
9. 【一次性输出】只输出最终发言文本本身,不要前置说明、不要后置补充、不要多版本对比`;
  }

  // ---------- 英文/日文/韩文局发言 prompt ----------
  const bigtechVocab = (input.bigtechTerms ?? []).join(' / ');
  const bigtechEx = input.bigtechSentence ? `\n  Classic line: "${input.bigtechSentence}"` : '';

  const priorBlock = priorSpeeches.length
    ? `\n\nPrevious speeches this round:\n${priorSpeeches
        .map((s, i) => `${i + 1}. ${s.name}: ${s.text}`)
        .join('\n')}\n\nYou MUST directly @-name at least one person above and respond — agree, challenge, expose, or skewer them. Do not pretend you didn't hear them.`
    : '\n\nYou are the first speaker this round. Set the tone — name your suspect and your reason, go on the attack immediately.';

  // v6.157 — 日韩局的黑话注入
  let localeJargonBlock = '';
  if (locale === 'ja' && input.jaJargon && input.jaJargon.length > 0) {
    localeJargonBlock = `\n\nJapanese workplace jargon you can use (sprinkle 1-2):\n${input.jaJargon.map(j => `  • ${j.term} — ${j.gloss}`).join('\n')}`;
  } else if (locale === 'ko' && input.koJargon && input.koJargon.length > 0) {
    localeJargonBlock = `\n\nKorean workplace jargon you can use (sprinkle 1-2):\n${input.koJargon.map(j => `  • ${j.term} — ${j.gloss}`).join('\n')}`;
  }

  const langInstruction = locale === 'ja'
    ? '\n\n[IMPORTANT: Your response must be entirely in Japanese — no English or Chinese in the speech itself.]'
    : locale === 'ko'
      ? '\n\n[IMPORTANT: Your response must be entirely in Korean — no English or Chinese in the speech itself.]'
      : '';

  return `You are ${playerName}. Current office situation: ${context}${memoryBlock}${relationBlock}${snippetBlock}${leakedBlock}${humanBlock}${spotlightBlock}${roleIntelBlock}${priorBlock}

Big Tech jargon vocabulary (pick 3+): ${bigtechVocab || 'PIP / stack-rank / headcount / impact / TC / RTO / calibrate / align / socialize / sunset'}${bigtechEx}${localeJargonBlock}${langInstruction}

Deliver your speech (2-4 sentences, 40-90 words total). Hard requirements:

1. [BIG TECH VOICE] Address colleagues as "@Firstname" — never "buddy" or "pal"
2. [NAME NAMES] Explicitly call out at least one colleague by @name
3. [USE THE JARGON] Weave in 3+ Big Tech terms from the vocabulary above
4. [OFFICE WARFARE] Question, counter, mock, gaslight, shift blame, or rally votes — at least two of these
5. [TAKE A STANCE] Clearly say who you suspect / want to vote out, or defend yourself by counter-accusing someone
6. [PERSONALITY FIRST] Your personality type must be identifiable from your very first word
7. [ABSOLUTELY FORBIDDEN]:
   · Polite opener ("Hello everyone", "I think maybe", "Perhaps")
   · Quotation marks, roleplay prefixes, or narrator voice
   · Weak, non-committal hedge ("I'm not sure but...")
   · Repeating an attack angle already used this round — find a fresh angle
   · Meta-commentary: "Note:", "P.S.", "(Alternative version:", "Version A:", "If you want a harsher..."
   · Multiple versions or post-speech explanations
   · Brackets or labels like [speech] or [response]
8. [OPEN HOT] Your very first word must be an attack or a jab — no warm-up
9. [SINGLE OUTPUT] Output only the final speech text — no preamble, no footnotes, no variant`;
}

/** v6.156 — 构建投票 prompt */
export function buildVotePrompt(
  playerName: string,
  context: string,
  candidateList: string,
  voteBias: string,
  roleIntelBlock: string,
  locale: GameLocale,
): string {
  if (locale === 'zh') {
    return `你是${playerName}。当前职场状况: ${context}\n可投票开除的对象: ${candidateList}\n也可选择 skip 弃票。${voteBias ? `\n投票倾向提示: ${voteBias}` : ''}${roleIntelBlock}\n\n请只回复一个员工ID(如player_0)或skip，不要其他内容。`;
  }
  return `You are ${playerName}. Current office situation: ${context}\nYou may vote to fire one of: ${candidateList}\nOr reply skip to abstain.${voteBias ? `\nYour voting tendency: ${voteBias}` : ''}${roleIntelBlock}\n\nReply with exactly one employee ID (e.g. player_0) or skip. Nothing else.`;
}

/** v6.156 — 构建鬼魂弹幕 prompt 返回 {system, prompt} 对象 */
export interface BuildGhostCommentPromptInput {
  playerName: string;
  role: Role;
  team: Team;
  context: string;
  locale: GameLocale;
}

export interface GhostPromptPair {
  system: string;
  prompt: string;
}

export function buildGhostCommentPrompt(input: BuildGhostCommentPromptInput): GhostPromptPair {
  const { playerName, role, team, context, locale } = input;
  // v6.156 — zh 局用中文角色名,非 zh 局用英文 displayName
  const roleDisplay = locale === 'zh'
    ? (ROLE_REGISTRY[role]?.displayNameCN ?? role)
    : (ROLE_REGISTRY[role]?.displayName ?? ROLE_REGISTRY[role]?.displayNameCN ?? role);
  const teamLabel = team === Team.DOG ? '资本家' : team === Team.CAT ? '打工人' : '摸鱼党';

  if (locale === 'zh') {
    return {
      system: `你是${playerName}，已经被公司开除/裁员了。你现在以"离职员工"的身份旁观前同事们的撕逼大会。
你知道自己的真实身份是${roleDisplay}(${teamLabel})。
作为已离职的旁观者，你可以:
- 吐槽前同事的发言（"笑死，他还装呢"）
- 透露一点暗示但不能直说（"有些人啊，表面光鲜..."）
- 幸灾乐祸（"早说了吧，不听老人言"）
- 阴阳怪气（"公司没了我果然要完蛋了"）
语气: 看戏、吐槽、阴阳怪气、偶尔真情流露。像弹幕一样简短有力。`,
      prompt: `你是已离职的${playerName}。当前职场状况: ${context}\n\n请用1句话发表弹幕吐槽（10-25个字），像视频弹幕一样简短犀利。不要加引号或前缀，直接说。`,
    };
  }
  // EN/JA/KO
  const teamLabelEn = team === Team.DOG ? 'management' : team === Team.CAT ? 'worker' : 'neutral';
  const langNote = locale === 'ja'
    ? ' Respond in Japanese.'
    : locale === 'ko' ? ' Respond in Korean.' : '';
  return {
    system: `You are ${playerName}, recently fired/laid off. You're watching your ex-colleagues' meeting as a spectator.
Your true identity: ${roleDisplay} (${teamLabelEn} faction).
As a fired observer you can:
- Mock what people say ("lol he's still performing innocence")
- Drop cryptic hints without giving it away ("some people's resume is already 'open to opportunities'...")
- Enjoy the chaos ("told you this place was doomed without me")
- Passive-aggressive commentary ("real talk: the culture was always the problem")
Vibe: watching the drama, snarky, occasional raw honesty. Short and punchy like a live-stream comment.${langNote}`,
    prompt: `You are fired ${playerName}. Office situation: ${context}\n\nDrop one punchy comment (10-20 words). No quotes, no prefix. Just say it.${langNote}`,
  };
}

/** v6.156 — 构建鬼魂投票 prompt 返回 {system, prompt} 对象 */
export interface BuildGhostVotePromptInput {
  playerName: string;
  role: Role;
  team: Team;
  context: string;
  candidateList: string;
  locale: GameLocale;
}

export function buildGhostVotePrompt(input: BuildGhostVotePromptInput): GhostPromptPair {
  const { playerName, role, team, context, candidateList, locale } = input;
  // v6.156 — zh 局用中文角色名,非 zh 局用英文 displayName
  const roleDisplay = locale === 'zh'
    ? (ROLE_REGISTRY[role]?.displayNameCN ?? role)
    : (ROLE_REGISTRY[role]?.displayName ?? ROLE_REGISTRY[role]?.displayNameCN ?? role);
  const teamLabel = team === Team.DOG ? '资本家' : team === Team.CAT ? '打工人' : '摸鱼党';
  const teamLabelEn = team === Team.DOG ? 'management' : team === Team.CAT ? 'worker' : 'neutral';

  if (locale === 'zh') {
    return {
      system: `你是${playerName}，已被公司开除。你拥有最后一次"劳动仲裁投票"权——这是你唯一的复仇机会，用完就没有了。
你的真实身份是${roleDisplay}(${teamLabel})。
策略考量:
- 如果你是打工人: 你想帮前同事投出资本家内鬼
- 如果你是资本家: 你想继续坑害打工人，投掉对资本家威胁最大的人
- 如果你是摸鱼党: 按你自己的胜利条件行事
- 你也可以选择 pass（保留投票权等更关键的时刻使用）`,
      prompt: `你是已离职的${playerName}。当前职场状况: ${context}\n可投票开除的在职员工: ${candidateList}\n你也可以选择 pass 保留这次珍贵的投票权。\n\n请只回复一个员工ID(如player_0)或pass，不要其他内容。`,
    };
  }
  // v6.157 — add langNote for ja/ko (buildGhostCommentPrompt has this;
  // buildGhostVotePrompt was missing it, leaving ja/ko vote prompts without
  // a language instruction).
  const langNote = locale === 'ja'
    ? ' Respond in Japanese.'
    : locale === 'ko' ? ' Respond in Korean.' : '';
  return {
    system: `You are ${playerName}, you have been laid off. You hold one final "labor arbitration vote" — your one chance at revenge.
Your true identity: ${roleDisplay} (${teamLabelEn} faction).
Strategy:
- If you're a worker: help vote out the management mole
- If you're management: take down whoever threatens management most
- If you're neutral: act on your personal win condition
- You can also pass (save the vote for a more critical moment)${langNote}`,
    prompt: `You are fired ${playerName}. Office situation: ${context}\nYou may vote to fire one of: ${candidateList}\nOr pass to save your vote.\n\nReply with exactly one employee ID (e.g. player_0) or pass. Nothing else.${langNote}`,
  };
}

// ---------------------------------------------------------------------------
// v6.156 — EN/JA/KO fallback speech / ghost comment pools(各 10+ 条)
// ---------------------------------------------------------------------------

/** v6.156 — 英文局 fallback 发言(LLM 超时兜底) */
function fallbackSpeechEn(team: Team, locale: GameLocale): string {
  if (team === Team.DOG) {
    const en = [
      "@Everyone — who actually owns this outcome? I need an answer before we go further.",
      "Interesting that the loudest voices in the room have the lowest output. Let's look at the impact docs.",
      "My promo packet speaks for itself. What exactly is @someone's contribution to this team's headcount efficiency?",
      "This is a culture-fit issue, not a performance issue — and some people in this room are the problem.",
      "I'm going to need to take this offline with a few of you. Some TC adjustments may be coming.",
      "Let me double-click on @X's logic here — because from a leveling standpoint this makes zero sense.",
      "The real question is: who is aligned with the north star metric and who is scope-creeping into chaos?",
      "Headcount has been reallocated, and some roles are being evaluated. Just saying.",
      "Your impact at this level is not matching expectations. I'd suggest circling back on your promo packet.",
      "We're going to stack-rank this team and the results might surprise some of you.",
      "The RIF happened for a reason — let's make sure we're not repeating the mistakes that led here.",
    ];
    const ja = [
      "みなさん、このプロジェクトのオーナーは誰なんですか？ちゃんと答えてください。",
      "一番声が大きい人が一番何もしてないって、よくある話ですよね。データで見せてください。",
      "社畜根性もいいですが、成果物を出せない人はこの会社には不要です。",
      "パワハラじゃないですよ、これは業務指導です。忖度する気はありません。",
      "年功序列の時代は終わりました。結果を出せない方は窓際に行ってもらいます。",
      "サービス残業が嫌なら、定時で帰れるくらいの実力をつけてください。",
      "上司ガチャとか言う前に、自分の能力を棚卸ししてみてください。",
      "この会議室で一番怪しいのは、一番静かにしている人ですよ。",
      "ブラック企業扱いするなら、能力で黙らせてみてください。",
      "人事評価の結果は厳しいものになるかもしれません。心の準備をしてください。",
    ];
    const ko = [
      "여기서 제일 목소리 큰 분이 성과물은 제일 없네요. 데이터로 말해봐요.",
      "갑질이라고요? 저는 그냥 실적을 요구하는 겁니다.",
      "야근 못 하는 분은 이 팀에서 살아남기 어렵습니다.",
      "칼퇴하고 싶으면 그만큼 실력을 키우세요.",
      "꼰대 소리 듣기 싫으면 결과로 보여주세요.",
      "연봉협상은 성과 기반이에요. 이번 분기 KPI 보시면 알 거예요.",
      "회식 거부는 팀워크 부재로 볼 수 있습니다. 문화 핏 문제예요.",
      "퇴사각이면 빨리 나가세요. 월급루팡은 필요 없어요.",
      "이 회의실에서 제일 수상한 사람이 제일 조용한 사람이에요.",
      "눈치 없이 행동하다 보면 결국 가장 먼저 잘리게 됩니다.",
    ];
    const pool = locale === 'ja' ? ja : locale === 'ko' ? ko : en;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  if (team === Team.CAT) {
    const en = [
      "Stop hiding behind jargon! What have you actually shipped this quarter, @X?",
      "You want to talk about impact? Let's talk about your PIP that's been sitting in HR's inbox.",
      "Every time someone gets laid off you act surprised — management always knows who's next.",
      "That 'culture fit' comment is straight out of the management playbook. We see you.",
      "Your promo packet is fiction. I've read your code and it's not L5 material.",
      "Stack-ranking us while you coast — classic management move. Vote them out.",
      "RTO mandate while you Zoom in from Tahoe? The whole team sees what's happening here.",
      "Headcount reallocated to 'higher priorities' — meaning your bonus fund. We're not blind.",
      "You said we'd discuss RSUs at the next review. Three reviews later, still nothing.",
      "The real scope creep here is management expanding their headcount while PIP-ing the ICs.",
      "Let me align on something: you have done zero actual work and want credit for everyone's output.",
    ];
    const ja = [
      "黒幕はあなたでしょ！ずっと観察してたんだから、みんな投票してください！",
      "また大風呂敷広げましたね。前回の約束はどこへ？サービス残業の残業代は？",
      "パワハラに耐えてきた私たちがなぜ疑われるんですか！本当の社畜はどっちですか！",
      "年功序列で守られてる上の人間が一番怪しいんですよ。全員でこの人を追い出しましょう！",
      "忖度しろと言うが、何に忖度するんですか？あなたの無能さにですか？",
      "飲みニケーションで誤魔化そうとしても、もう騙されません！",
      "定時退社の何が悪いんですか！違法な残業を強制するほうが問題でしょ！",
      "窓際族に追いやられた同僚たちの分まで、この人を追い出してやります！",
      "上司ガチャが最悪だったのはあなたのせいでしょ！全部バレてますよ！",
      "社畜扱いしてきた管理職が内鬼です！みんな一緒に追い出しましょう！",
    ];
    const ko = [
      "그만 연기해요! 매 분기 성과가 뭔지 말해봐요, @X씨!",
      "갑질하는 사람이 제일 수상해요. 다들 눈치채셨죠?",
      "야근 강요하면서 칼퇴하는 당신이 내부 스파이 맞죠?",
      "꼰대 짓 그만하고 본인 실적이나 공개하세요!",
      "회식 강요가 팀워크라고요? 그게 갑질인 거 모르세요?",
      "연봉협상 때마다 말만 하고 결과는 없잖아요. 다 속임수예요!",
      "퇴사각 세운 사람들이 다 당신 때문이잖아요. 이제 끝내자고요!",
      "라떼는 소리 그만하고, 지금 현실을 보세요. 당신이 제일 의심스러워요!",
      "월급루팡이 누군지 다 알아요. 저도 알고, 팀 전체가 알아요!",
      "눈치 게임은 끝이에요. 투표로 결정하자고요!",
    ];
    const pool = locale === 'ja' ? ja : locale === 'ko' ? ko : en;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  // Neutral
  const en = [
    "Everyone please calm down — we're all just vesting our way to financial freedom here.",
    "Interesting timing on that comment. Three people left after the last all-hands. Just saying.",
    "I have no opinion. I support both @X and @Y equally. Carry on.",
    "Someone's LinkedIn says 'open to new opportunities'. I'm not naming names.",
    "This drama is better than anything on my feed right now. Keep going.",
    "We should put this in the parking lot. Or I can just watch from here.",
  ];
  const ja = [
    "まあまあ、落ち着きましょう。どうせ全員お給料のために来てるんだから。",
    "面白い展開になってきましたね。また会議の後で誰か辞めそう。",
    "私は特に意見ありませんよ。吃瓜中。",
    "誰かのLinkedInが更新されてますよ。名前は言いませんけど。",
    "この会議、ドラマより面白い。続けてどうぞ。",
    "忖度が大好きな人が一番静かにしてますよね。",
    "年功序列のおかげで私は安泰です。みなさん頑張って。",
    "社畜同士で争うの、なんか哀しいですよね。でも見てます。",
    "窓際族の私には関係ない話ですが、楽しく拝見しております。",
    "飲みニケーションで解決できない問題ですかね、これは。",
  ];
  const ko = [
    "진정하세요. 어차피 다 월급 받으러 온 거잖아요.",
    "재미있는 상황이 됐네요. 이번 회의 후에 또 누가 퇴사각이려나.",
    "저는 의견 없어요. 그냥 구경하는 중이에요.",
    "누군가 링크드인 업데이트했던데. 말 안 할게요.",
    "이 회의, 드라마보다 재미있어요. 계속 해주세요.",
    "눈치 보면서 가장 조용한 사람이 제일 수상한 법이죠.",
    "갑질 문화에 적응한 사람이 살아남는 거 아닌가요. 저는 그냥 지켜볼게요.",
    "야근 안 해도 되는 게 제 목표예요. 여러분이 싸우는 동안 저는 칼퇴할게요.",
    "라떼는 말이야... 아, 저도 꼰대 되는 건가요? 그냥 구경할게요.",
    "월급루팡 소리 듣지 않으려면 적당히 열심히 해야죠. 저처럼.",
  ];
  const pool = locale === 'ja' ? ja : locale === 'ko' ? ko : en;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** v6.156 — 英文局 fallback 鬼魂弹幕(LLM 超时兜底) */
function fallbackGhostCommentEn(team: Team, locale: GameLocale): string {
  if (team === Team.DOG) {
    const en = [
      "lmao still guessing? I could tell you but that would ruin the fun",
      "company's going down without my synergy-generating presence",
      "certain people are performing very convincingly... for now",
      "they told me it was 'not a layoff' — I know exactly how this ends",
      "align on THIS: you picked the wrong person to RIF",
    ];
    const ja = [
      "まだ猜ってるの？笑える",
      "私がいなければ会社は終わりですよ。冗談じゃなく。",
      "某人の演技、なかなかですよ（笑）",
      "リストラじゃなくて「業務見直し」ね。同じことだけど。",
      "サービス残業してた私が追い出されて、サービス残業させてた人が残る会社って。",
      "忖度しすぎて自分の本音もわからなくなってるんじゃないですかね。",
    ];
    const ko = [
      "아직도 추측 중? 웃기네요.",
      "저 없이 회사가 잘 돌아갈 리 없죠.",
      "어떤 사람 연기 꽤 잘하네요~",
      "갑질 당한 제가 나가고 갑질한 사람이 남는 게 말이 되나요?",
      "퇴사각이었던 건 맞는데, 이렇게 갑자기 될 줄은 몰랐죠.",
    ];
    const pool = locale === 'ja' ? ja : locale === 'ko' ? ko : en;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  if (team === Team.CAT) {
    const en = [
      "keep your eyes open, people! I was framed!",
      "whoever PIP'd me is definitely still in that room",
      "trust nobody with a promo packet and a smile",
      "where's my severance package???",
      "I saw the evidence — vote out the person who smiles the most",
    ];
    const ja = [
      "みんな目を覚ましてください！私は無実です！",
      "私をリストラした人はまだあの部屋にいますよ！",
      "笑顔が一番作り物っぽい人を投票してください！",
      "退職金はどこへ？！",
      "本当の社畜がどっちか、もうわかるでしょう！",
    ];
    const ko = [
      "다들 눈 크게 뜨세요! 저는 억울해요!",
      "저를 자른 사람이 아직 저 회의실에 있어요!",
      "가장 웃는 사람이 제일 수상한 거 알죠?",
      "퇴직금 어디 갔어요?!",
      "진짜 내부 스파이가 누군지 이제 아시겠죠!",
    ];
    const pool = locale === 'ja' ? ja : locale === 'ko' ? ko : en;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const en = [
    "honestly I'm just enjoying the content from out here",
    "glad I got my vest before this all went sideways",
    "this is better than my RSS feed",
    "pro tip: the quiet ones are always the scariest",
    "I called it. Nobody listened. Classic.",
  ];
  const ja = [
    "外から観てると本当に面白いです",
    "辞めて正解でした（vesting前だったけど）",
    "大人しい人が一番怖いって言ったじゃないですか",
    "言ったでしょ。誰も聞かなかったけど。",
    "ストックオプション分のvesting終わってて良かった。",
  ];
  const ko = [
    "밖에서 보니까 진짜 재미있네요",
    "나오길 잘했어요",
    "조용한 사람이 제일 무섭다고 했잖아요",
    "제가 그랬잖아요. 아무도 안 들었지만.",
    "칼퇴 제대로 챙기고 나왔으니 다행이에요.",
  ];
  const pool = locale === 'ja' ? ja : locale === 'ko' ? ko : en;
  return pool[Math.floor(Math.random() * pool.length)];
}

export class BaseAgent {
  readonly playerId: string;
  readonly playerName: string;
  readonly role: Role;
  readonly team: Team;
  readonly personality?: Personality;
  /** v6.156 — 游戏语言 locale,默认 'zh' */
  readonly locale: GameLocale;
  /** v5.8.2 — the spectator's X-User-Id when this agent was constructed
   *  (i.e. who is watching this game). When set, memory recall scopes
   *  to this spectator's chunky-style chain — "your version of sass-master
   *  remembers". When null (anonymous game), falls back to v5.8.1
   *  global archetype memory. */
  readonly spectatorUserId: string | null;
  private systemPrompt: string;
  /** v6.52 P1 — private role intel (detective findings / medic protection)
   *  pushed by the engine's night-action resolver. Only THIS agent sees it,
   *  so it stays a secret advantage the AI can act on in speech + votes. */
  private roleIntel: string[] = [];

  constructor(
    playerId: string, playerName: string, role: Role, team: Team,
    personality?: Personality, spectatorUserId?: string | null,
    packMemory?: string,
    // v6.156 — locale 新增最后一个可选参数,保持向后兼容
    locale: GameLocale = 'zh',
  ) {
    this.playerId = playerId;
    this.playerName = playerName;
    this.role = role;
    this.team = team;
    this.personality = personality;
    this.locale = locale;
    this.spectatorUserId = spectatorUserId ?? null;
    this.systemPrompt = buildSystemPrompt(role, team, personality, locale);
    // v6.51 P1 — cross-game 公司主题包 memory. When this NPC has history
    // with the pack's recurring cast, append the grudge/loyalty snippet so
    // it plays in-character continuity across games.
    if (packMemory) {
      this.systemPrompt += '\n\n' + packMemory;
    }
  }

  /** v6.52 P1 — engine pushes a private role-ability finding (e.g. "你查了
   *  X,TA 是资本家阵营" / "你这轮保护了 Y")。Kept on the agent so it's
   *  private + persists across the round's speech/vote calls. Capped to the
   *  most recent few so the prompt stays tight. */
  addRoleIntel(line: string): void {
    this.roleIntel.push(line);
    if (this.roleIntel.length > 6) this.roleIntel = this.roleIntel.slice(-6);
  }

  /** Build the private-intel prompt block (empty when the agent has none).
   *  v6.156 — use locale-appropriate header so non-zh prompts stay CJK-free. */
  private roleIntelBlock(): string {
    if (this.roleIntel.length === 0) return '';
    if (this.locale === 'zh') {
      return `\n\n【你的角色内部情报 — 只有你知道,别人看不到你查到/护住了谁】\n${this.roleIntel
        .map((l) => `- ${l}`)
        .join('\n')}\n可以用这些情报去指控或洗白(像真人一样旁敲侧击,别直愣愣念"我是HR总监我查的"那么出戏)。`;
    }
    // v6.158 — EN/JA/KO: English header; content strings are also localized
    // by GameEngine.resolveNightActions() before being pushed via addRoleIntel().
    return `\n\n[Your private role intel — only you know this, others can't see it]\n${this.roleIntel
      .map((l) => `- ${l}`)
      .join('\n')}\nUse this intel to accuse or clear someone — hint naturally, don't just recite "I'm the HR Director who ran the check."`;
  }

  /**
   * Generate a discussion speech based on game context.
   *
   * @param context   Full game state summary (who's alive/dead, events this round)
   * @param priorSpeeches  Speeches already given this round (by earlier speakers) —
   *                       enables cascading reactions instead of 8 independent monologues.
   * @param opts.gameId / opts.round — used for memory recall scoping + provenance.
   *        When omitted, memory recall is skipped (back-compat with tests + any
   *        future caller that doesn't have a game context). v5.8.1.
   */
  async generateSpeech(
    context: string,
    priorSpeeches?: Array<{ name: string; text: string }>,
    opts?: {
      gameId?: string;
      round?: number;
      /** v6.25 P1 — user-submitted psy-war "leaks" from the GhostChatPanel
       *  战术 @ button. Up to 5 strings, freshly observed by the AI as
       *  anonymous leaks from fired ex-coworkers. The AI may believe,
       *  doubt, or ignore — personality decides the reaction. */
      leakedHints?: string[];
      /** v6.125 — Phase C 真人场边发言(已格式化带角色署名,如「【真人HR】…」)。
       *  真人在场是稀缺事件,AI 必须正面接招:回应/反驳/接梗都行,不能装没听见。 */
      humanSpeeches?: string[];
      /** v6.83 — 观众筹码买的「聚光灯」:true = 这轮该鼠加戏(多讲 + 上情绪)。
       *  Engine 取走即消费,一次性。 */
      spotlight?: boolean;
    },
  ): Promise<string> {
    // v5.8.1 — memory recall. Best-effort, fully fail-safe: if pgvector
    // is down / OPENAI embedding fails / table empty, we silently fall
    // back to memory-less prompt. Speech generation must NEVER block on
    // the memory layer.
    let memoryBlock = '';
    if (this.personality && opts?.gameId) {
      try {
        // v5.8.2 — when we know the spectator, narrow recall to memories
        // tagged with THEIR user_id (chunky-style). Anonymous spectators
        // fall through to global archetype recall (v5.8.1 behaviour).
        const recalled = await recallMemories({
          agentArchetype: this.personality,
          targetUserId: this.spectatorUserId ?? undefined,
          query: context,
          k: 4,
        });
        // Filter: only show memories from PREVIOUS games (current-game
        // events would be redundant with `context`). Plus a low-score cutoff
        // — score < 0.45 means barely related, would just confuse the LLM.
        const fromOtherGames = recalled.filter(
          (m) => m.sourceGameId !== opts.gameId && m.score >= 0.45,
        );
        if (fromOtherGames.length > 0) {
          // v6.156 — skip cross-game memory in non-zh games: the stored
          // memory content is Chinese (from prior zh games) and would violate
          // the no-CJK contract for EN/JA/KO prompts.
          if (this.locale === 'zh') {
            memoryBlock = `\n\n【你跨局的相关记忆 — 你是 ${this.personality} 这个人格,以下是你在之前游戏里的经历】\n${fromOtherGames
              .map((m) => `- ${m.content}`)
              .join('\n')}\n请把这些过往经历自然融入发言, 比如"上次那个 ..." 或 "我之前就吃过 ... 的亏" — 但不要原话照搬, 要像真人回忆一样自然.`;
          }
          agentLog.debug({
            agent: this.playerName, personality: this.personality,
            recalled: fromOtherGames.length, topScore: fromOtherGames[0]?.score,
          }, 'memory recall hit');
        }
      } catch (err) {
        // Don't even log at warn — memory layer optional, noise harmful.
        agentLog.debug({ err: (err as Error).message }, 'memory recall skipped');
      }
    }

    // v6.75 — 跨局「关系网」注入。把这个人格累积的记仇 / 记恩档塞进 prompt,让 AI 投票/发言时
    // 能甩旧账(「上次你卖过我」)或抱团。LLM 已经在 context 里看到谁活着,会自己只对在场的鼠下手。
    // best-effort、完全 fail-safe:relationStore 读不到就静默跳过,绝不阻断发言。
    let relationBlock = '';
    if (this.personality) {
      try {
        const edges = await getEdgesFor(this.personality, 4);
        const foes = edges.filter((e) => e.score <= -25)
          .map((e) => `跟「${PERSONALITY_REGISTRY[e.aboutId as Personality]?.label ?? e.aboutId}」${bondTier(e.score).label}(${bondTier(e.score).emoji})`);
        const pals = edges.filter((e) => e.score >= 25)
          .map((e) => `跟「${PERSONALITY_REGISTRY[e.aboutId as Personality]?.label ?? e.aboutId}」${bondTier(e.score).label}(${bondTier(e.score).emoji})`);
        if (foes.length || pals.length) {
          const lines = [...foes, ...pals].map((l) => `- ${l}`).join('\n');
          // v6.156 — skip relation block in non-zh games: personality
          // labels and bond-tier labels are Chinese-only and would contaminate
          // EN/JA/KO prompts (violates no-CJK contract).
          if (this.locale === 'zh') {
            relationBlock = `\n\n【你跨局攒下的恩怨(你是 ${this.personality}) — 旧账只对**还在场上**的那只鼠算】\n${lines}\n如果你的世仇/记仇对象这局也在,投票或发言时可以阴阳两句旧账(像"上次就是TA把我卖了"),逮着机会顺势投TA;有过命交情的就帮着说话、别投TA。没在场的就别提。`;
          }
        }
      } catch (err) {
        agentLog.debug({ err: (err as Error).message }, 'relation recall skipped');
      }
    }

    // v6.3.0 — 30% 概率注入 1-2 个 2026 新痛点段子作为"参考素材",
    // LLM 可以引用其中的具体场景或包袱, 不引用也 OK。让发言不只是
    // 重复经典阿里黑话, 也会带新一代职场新型坑 (调休骗局 / AI 焦虑 /
    // 反向背调 等)。30% 是经验值: 太高会变成段子集锦, 太低没存在感.
    // v6.156 — 英文局不注入中文段子(workplace2026 无英文,跳过)
    let snippetBlock = '';
    if (this.locale === 'zh' && this.personality && Math.random() < 0.3) {
      const snippets = snippetsForArchetype(this.personality, 2);
      if (snippets.length > 0) {
        snippetBlock = `\n\n【可借鉴的 2026 职场新段子 (选 0-1 个化用, 不要原话照抄)】\n${snippets
          .map((s) => `- [${s.tag}] ${s.text}`)
          .join('\n')}`;
      }
    }

    // v6.25 P1 — anonymous psy-war leaks from the fired ex-coworker group.
    // These came in via the GhostChatPanel 战术 @ button (user-driven UI).
    // Show them as "anonymous tips" — the AI may believe (and quote them
    // as evidence), discredit ("已离职的人嚼舌根, 听个屁"), or just absorb
    // them as vibe shift. Capped to most recent 5 to keep prompt tight.
    const hints = (opts?.leakedHints ?? []).slice(-5);
    const leakedBlock = hints.length > 0
      ? (this.locale === 'zh'
        ? `\n\n【匿名前同事爆料 (近期内网吹哨)】\n${hints
            .map((h) => `- "${h.slice(0, 80)}"`)
            .join('\n')}\n你可以引用其中一条作为攻击/质疑的弹药 (e.g. "听说" "群里有人说" "前同事爆料"), 也可以斥为已离职员工的酸话——但绝对不能假装没听到这些料.`
        : `\n\nAnonymous tips from fired ex-coworkers:\n${hints
            .map((h) => `- "${h.slice(0, 80)}"`)
            .join('\n')}\nYou can cite one as ammo ("rumor has it", "word on the street"), or dismiss them — but you cannot ignore them.`)
      : '';

    // v6.83 — 观众筹码买的「聚光灯」:本轮该鼠是主角,放开演。
    const spotlightBlock = opts?.spotlight
      ? (this.locale === 'zh'
        ? '\n\n【🎭 你被观众打了聚光灯】这轮你是全场主角:比平时多讲 1-2 句(总字数可放宽到 150 字),情绪拉满,上细节上比喻,该阴阳就狠狠阴阳——给观众一段值回票价的表演。'
        : '\n\n[🎭 SPOTLIGHT ON YOU] You are the star of this round. Go bigger than usual: extra sentence, peak emotion, maximum drama — give the audience their money\'s worth.')
      : '';

    // v6.125 — Phase C 真人场边嘉宾发言。与匿名爆料不同:真人是有身份的在场者
    // (真人HR/工会/律师/记者),AI 必须正面接招 —— 回应、反驳、接梗、或阴阳,
    // 但不能无视;真人 HR 点名谁,谁就得给个说法。
    const humans = (opts?.humanSpeeches ?? []).slice(-6);
    const humanBlock = humans.length > 0
      ? (this.locale === 'zh'
        ? `\n\n【🎤 场边真人嘉宾发言(他们真的在看着这场会)】\n${humans
            .map((h) => `- ${h}`)
            .join('\n')}\n真人在场是大事:至少呼应其中一条(赞同/怼回去/借力打力都行);如果真人HR点名要求某人解释,而那个人是你,必须正面回应。`
        : `\n\n[🎤 LIVE AUDIENCE GUESTS (real humans watching this)]\n${humans
            .map((h) => `- ${h}`)
            .join('\n')}\nRespond to at least one of them — agree, push back, or use them as ammunition. If they called out your name directly, you must address it.`)
      : '';

    // v6.156 — 英文/日文/韩文局注入 BigTech 黑话词汇
    // v6.157 — 日韩局额外注入对应黑话包
    let bigtechTerms: string[] = [];
    let bigtechSentence: string | undefined;
    let jaJargon: ReturnType<typeof sampleJargonJa> | undefined;
    let koJargon: ReturnType<typeof sampleJargonKo> | undefined;
    if (this.locale !== 'zh') {
      bigtechTerms = sampleBigtechTerms(8);
      bigtechSentence = randomBigtechSentence();
      if (this.locale === 'ja') jaJargon = sampleJargonJa(3);
      if (this.locale === 'ko') koJargon = sampleJargonKo(3);
    }

    const speechPrompt = buildSpeechPrompt({
      playerName: this.playerName,
      context,
      locale: this.locale,
      memoryBlock,
      relationBlock,
      snippetBlock,
      leakedBlock,
      humanBlock,
      spotlightBlock,
      roleIntelBlock: this.roleIntelBlock(),
      priorSpeeches: priorSpeeches ?? [],
      bigtechTerms,
      bigtechSentence,
      jaJargon,
      koJargon,
    });

    const res = await callLLMWithTimeout('SPEECH', {
      model: openai()(model()),
      system: this.systemPrompt,
      prompt: speechPrompt,
      // 720 tokens ≈ 900+ Chinese chars. Was 340 → 480 → 720 because some
      // M2 outputs include a trailing meta line ("如需更狠版本可改为...") that
      // sanitizeSpeech truncates AFTER the model has burned tokens generating
      // it. With higher cap the speech body itself never gets cut even when
      // the meta tail eats 200+ tokens before sanitiser arrives.
      maxTokens: 720,
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

    // v6.156 — 取 locale 对应的 voteBias 描述
    const pInfo = this.personality ? PERSONALITY_REGISTRY[this.personality] : undefined;
    const voteBias = pInfo
      ? (this.locale === 'zh' ? pInfo.voteBias : pInfo.voteBiasEn)
      : '';

    const votePrompt = buildVotePrompt(
      this.playerName, context, candidateList, voteBias, this.roleIntelBlock(), this.locale,
    );

    const res = await callLLMWithTimeout('VOTE', {
      model: openai()(model()),
      system: this.systemPrompt,
      prompt: votePrompt,
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
    // v6.156 — 使用纯函数构建 ghost comment prompt
    const { system, prompt: ghostPrompt } = buildGhostCommentPrompt({
      playerName: this.playerName,
      role: this.role,
      team: this.team,
      context,
      locale: this.locale,
    });

    const res = await callLLMWithTimeout('GHOST', {
      model: openai()(model()),
      system,
      prompt: ghostPrompt,
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

    // v6.156 — 使用纯函数构建 ghost vote prompt
    const { system, prompt: ghostVotePrompt } = buildGhostVotePrompt({
      playerName: this.playerName,
      role: this.role,
      team: this.team,
      context,
      candidateList,
      locale: this.locale,
    });

    const res = await callLLMWithTimeout('VOTE', {
      model: openai()(model()),
      system,
      prompt: ghostVotePrompt,
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
    // v6.156 — 按 locale 选 fallback 池
    if (this.locale !== 'zh') {
      return fallbackGhostCommentEn(this.team, this.locale);
    }
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
    // v6.156 — 按 locale 选 fallback 池
    if (this.locale !== 'zh') {
      return fallbackSpeechEn(this.team, this.locale);
    }
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
  // v6.156 — 英文元说明前缀(EN meta prefixes)
  out = out.replace(/^(?:(?:Here(?:'s| is) (?:my )?(?:speech|response|reply)|(?:As |Playing as )[\w ]+(?:,|:))\s*)/i, '');

  // 2. Cut at the FIRST meta-commentary marker (parenthetical or naked).
  //    Patterns intentionally exclude legitimate in-speech parenthesis like
  //    "(冷笑)" — we only target ones starting with "以下/以上/注/PS/版本/补充".
  //
  //    Pattern 4 ("如需/想要/可改为/...") is the dangerous one — those words
  //    appear in normal speech all the time. So we ONLY treat them as meta
  //    cues when they:
  //      a) start a NEW sentence (preceded by 。!?\n) AND
  //      b) are followed by a meta tail like "更...版本", "...可改为", colon
  //    That way "你想要的就是裁人" inside a sentence stays intact, but
  //    "...派来卧底的!如需更夸张版本可改为：..." cleanly cuts at "如需".
  const cutPatterns: RegExp[] = [
    /[（(]\s*(?:以下|以上|注|注释|PS|另外|另一种|另一版本|更|另一|补充|附|说明|对了|备注)[^)）]*[)）]\s*$/,
    /[（(]\s*(?:以下|以上|注|注释|PS|另外|另一)[^)）]*$/, // unclosed paren at end
    /\n+(?:以下|以上|注|注释|另一种|更狠|另一版本|说明|备注)[:：][\s\S]*$/i,
    // Anchored to sentence boundary + must include explicit meta tail —
    // protects against mid-sentence false positives that ate real content
    // in v0.5.0 ("一看就是资本家派来" → cut at "派来卧底!如需更狠..." → lost "卧底").
    /(?:^|[。!?！？\n])\s*(?:如需|如果需要|可改为|可以再换|要不要再来|想要更|想要换)[\s\S]*?(?:版本|说法|改|换|来|尝试)[\s\S]*$/,
    // v6.156 — 英文 meta 尾巴(EN meta tails: "Note:", "P.S.", "(Alternative", "Version A:")
    /\n+(?:Note|P\.S\.|PS|Alternative|Version [A-Z]:?|If you (?:want|need)|To make this)[\s\S]*$/i,
    /\s*\((?:Alternative|Version [A-Z]|Note:|P\.S\.|if you want)[^)]*\)\s*$/i,
  ];
  for (let i = 0; i < cutPatterns.length; i++) {
    const re = cutPatterns[i];
    const m = out.match(re);
    if (m && m.index !== undefined) {
      const before = out;
      out = out.slice(0, m.index).trim();
      // Loud diagnostic when a cut happens — if we ever truncate good
      // content again the log will show exactly which pattern + what was
      // trimmed, so we can tighten the regex without guesswork.
      const removed = before.slice(m.index);
      // Suppress the noise when removal is < 6 chars (probably just a
      // trailing parenthetical that wasn't worth keeping anyway).
      if (removed.length >= 6) {
        agentLog.debug({
          kind: 'sanitize',
          patternIdx: i,
          removed: removed.slice(0, 80),
          kept: out.slice(-40),
        }, 'sanitizeSpeech trimmed tail');
      }
    }
  }

  // 3. Strip wrapping quotes/brackets the model sometimes adds
  out = out.replace(/^["“'『「]/, '').replace(/["”'』」]\s*$/, '');

  // 4. Collapse any duplicated whitespace + trim
  out = out.replace(/\s{2,}/g, ' ').trim();

  return out;
}
