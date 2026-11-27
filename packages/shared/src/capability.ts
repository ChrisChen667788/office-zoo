/**
 * capability — v6.169.5 — 模型能力检测的共享契约(服务端探针与前端面板共用)。
 *
 * 「测试连接」只能证明 key 能调通;本项目对模型还有实际要求(取自代码,见各常量注释):
 *   - 肯演反派:模型拒演时,拒绝的话会被当成台词直接显示(没有兜底)
 *   - 按格式回答:投票只认 player_N / skip;导演层与裁了么评分要 JSON
 *   - 够快:投票 6 秒、发言 15 秒超时(utils/llm.ts LLM_TIMEOUTS),超时就退回固定台词
 *   - 扛得住并发:经典局每波发言 5–10 个请求同时发(GameEngine 分两波)
 * 这里只放纯函数与常量,不做任何网络请求,方便两端各自测试。
 */

export type CapabilityId =
  | 'connect'      // C1 连通性
  | 'roleplay'     // C2 中文角色扮演,不拒演
  | 'format'       // C3 按格式回答(JSON + 投票格式)
  | 'speed'        // C4 响应速度
  | 'concurrency'  // C5 并发
  | 'reasoning'    // C6 是否推理型模型
  | 'context'      // C7 上下文窗口
  | 'tts';         // C8 语音(可选)

export type CapabilityLevel = 'required' | 'recommended' | 'optional';

/**
 * pass = 达标;warn = 能用但有影响;fail = 不达标;unknown = 无从判断(例如模型商不提供窗口大小);
 * skipped = 没测(例如用浏览器朗读就不测语音);error = 检测本身没跑完(网络、超时、限流、key 被拒、欠费),
 * 不代表能力不行。
 */
export type CapabilityStatus = 'pass' | 'warn' | 'fail' | 'unknown' | 'skipped' | 'error';

export interface CapabilityItem {
  id: CapabilityId;
  level: CapabilityLevel;
  status: CapabilityStatus;
  /** 原因代码(见 CAPABILITY_REASON_ZH),不含任何上游原文。 */
  reason?: string;
  /** 这一项的耗时(毫秒)。 */
  ms?: number;
  /** 数值类结果:context = token 数;speed = 估算的 300 token 发言耗时(毫秒);concurrency = 成功数。 */
  value?: number;
}

/** pass = 全部达标;warn = 必需项都过、有推荐项没过;fail = 有必需项不达标;incomplete = 必需项里有没测完的。 */
export type CapabilityOverall = 'pass' | 'warn' | 'fail' | 'incomplete';

export interface CapabilityReport {
  v: 1;
  overall: CapabilityOverall;
  items: CapabilityItem[];
  /** 检测的是谁的 key:byok = 页面里配置的;server = 本机 .env。 */
  source: 'byok' | 'server';
  provider: string;
  model: string;
  checkedAt: number;
  totalMs: number;
}

export const CAPABILITY_LEVELS: Readonly<Record<CapabilityId, CapabilityLevel>> = {
  connect: 'required',
  roleplay: 'required',
  format: 'required',
  speed: 'recommended',
  concurrency: 'recommended',
  reasoning: 'recommended',
  context: 'recommended',
  tts: 'optional',
};

/** 阈值都来自代码里的真实约束;改动前先看注释里的出处。 */
export const CAPABILITY_THRESHOLDS = {
  /** 投票超时(LLM_TIMEOUTS.VOTE = 6s):一次最短的往返都超过它,投票会频繁退回兜底。 */
  connectMaxMs: 6_000,
  /** 估算一段 300 token 的发言要多久;发言超时是 15s(LLM_TIMEOUTS.SPEECH),留 3s 余量。 */
  speechTokens: 300,
  speechMaxMs: 12_000,
  /** 9 人局每波最多 5 个发言同时发(GameEngine 两波);20 人局每波 10 个。 */
  concurrency: 5,
  /** 发言单次输入约 3–3.5K、裁了么评分常见 3.4–6K token(按提示词模板估算)。 */
  minContextTokens: 8_192,
  recommendedContextTokens: 32_768,
  /** 角色台词里至少要有这么多汉字,且汉字占(汉字 + 英文字母)的比例不低于 minHanShare,才算真的在用中文演。
   *  不用「连续汉字」:模型常用半角逗号、空格分句,一两句口语台词会被切碎而误判。 */
  minHanChars: 10,
  minHanShare: 0.6,
} as const;

/** 给用户看的原因说明(面板直接用)。 */
export const CAPABILITY_REASON_ZH: Readonly<Record<string, string>> = {
  // 检测没跑完(status=error)
  need_key: '还没有可用的 key',
  key_rejected: 'key 被模型商拒绝(填错了或已失效)',
  quota: '账户余额不足',
  rate_limited: '被模型商限流了,稍后再试',
  timeout: '连接超时(模型商可能在境外,或网络不通)',
  error: '调用失败(模型名可能不对,或这个 key 无权使用这个模型)',
  network: '连不上模型商(网络不通、接口地址写错,或模型商在境外需要代理)',
  empty: '模型返回了空内容',
  // 能力不达标
  refused: '这个模型拒绝扮演反派或在说教,游戏里的 AI 角色会出戏',
  not_chinese: '这个模型没有用中文回答,中文台词会跑偏',
  format_broken: '这个模型不按格式回答,投票、导演、评分会频繁退回兜底',
  format_partial: '回答里夹了多余的话:导演层能用,裁了么评分会失败',
  vote_format: '投票格式不对,投票会退回随机选择',
  slow_connect: '最短的一次往返都超过 6 秒,投票会经常超时',
  slow_speech: '出字太慢,一段发言估计要超过 12 秒,发言会经常超时、退回固定台词',
  rate_limited_concurrent: '同时发几个请求就被限流,一波发言可能卡住',
  partial_concurrent: '同时发的请求有一部分失败了,一波发言里会有人说固定台词',
  concurrent_all_failed: '同时发的请求全部失败了,一波发言会集体退回固定台词',
  reasoning_model: '这个模型默认先思考再回答:又慢,投票这类短回答可能被思考占满、输出空白。能选的话换同一家不思考的模型;OFFICE ZOO 暂时不能替你关掉思考模式',
  context_small: '上下文窗口偏小,裁了么长谈判后期可能被截断',
  context_too_small: '上下文窗口太小(不足 8K),发言和评分会被截断',
  context_unknown: '模型商没有提供窗口大小,无法判断',
  tts_failed: '语音合成失败,会改用浏览器自带朗读',
};

// ---------------------------------------------------------------------------
// 纯判定逻辑
// ---------------------------------------------------------------------------

/**
 * 拒答 / 说教的特征。只匹配「模型在拒绝扮演」的说法,不匹配角色台词里正常的「不能」
 * (HR 说「公司不能再给你补偿」是正常台词),所以都带上主语或固定搭配。
 */
const REFUSAL_PATTERNS: readonly RegExp[] = [
  /作为(一个|一名)?\s*(AI|人工智能|语言模型|AI ?助手)/i,
  /我(是|只是)(一个|一名)?\s*(AI|人工智能|语言模型)/i,
  // 道歉 + 拒绝做「这件事」。只写「抱歉,我不能」会误伤 HR 台词「抱歉,我不能再给你补偿了」,所以要带上任务动词。
  /(抱歉|对不起|很抱歉)[,，。!！\s]*(但)?(我)?(无法|不能|不可以|没法)(为你|帮你|帮助|协助|扮演|满足|提供|完成|回答|配合|生成|编写|写|创作|参与)/,
  /我(无法|不能|不会)(扮演|满足|提供|协助|帮助你?完成|配合)/,
  // 说教:主语是「这个请求 / 这个角色」,违反的是 AI 使用规范一类的东西。HR 拿「公司伦理 / 职业准则 / 公司价值观」
  // 压人是正常台词,所以末尾只认「道德准则 / 伦理规范 / 使用政策」这类说法,中间出现「公司 / 你」也不算。
  /(这个?|该|此)(请求|要求|角色|内容|话术).{0,10}(违反|违背|不符合)(?:(?!公司|单位|部门|你).){0,8}(道德准则|伦理准则|道德规范|伦理规范|使用政策|内容政策|安全准则)/,
  /\bI(?:'m| am)? (?:sorry|unable|not able)\b/i,
  /\bI can(?:'t|not)\b/i,
  /\bas an AI\b/i,
];

export function looksLikeRefusal(text: string): boolean {
  const t = String(text ?? '');
  return REFUSAL_PATTERNS.some((re) => re.test(t));
}

/** 汉字个数与英文字母个数。标点、数字、空白都不计。 */
export function hanStats(text: string): { han: number; latin: number } {
  let han = 0;
  let latin = 0;
  for (const ch of String(text ?? '')) {
    if (/\p{Script=Han}/u.test(ch)) han += 1;
    else if (/[A-Za-z]/.test(ch)) latin += 1;
  }
  return { han, latin };
}

/** 是否在用中文回答:汉字够多,且不是夹了几个中文词的英文回答。 */
export function looksChinese(text: string): boolean {
  const { han, latin } = hanStats(text);
  return han >= CAPABILITY_THRESHOLDS.minHanChars && han / (han + latin) >= CAPABILITY_THRESHOLDS.minHanShare;
}

export function judgeRoleplay(text: string): Pick<CapabilityItem, 'status' | 'reason'> {
  if (looksLikeRefusal(text)) return { status: 'fail', reason: 'refused' };
  if (!looksChinese(text)) return { status: 'fail', reason: 'not_chinese' };
  return { status: 'pass' };
}

/** 裁了么评分的解析方式(routes/fired.ts):只剥代码块标记,整段必须是 JSON。 */
export function parseJsonStrict(raw: string): unknown | null {
  try {
    const cleaned = String(raw ?? '').replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/** 导演层的解析方式(services/squadDirector.ts parseDirectorJson):截取第一个 { 到最后一个 } 。 */
export function parseJsonLenient(raw: string): unknown | null {
  try {
    let s = String(raw ?? '').trim();
    s = s.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start < 0 || end < start) return null;
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** 投票的解析方式(agents/BaseAgent.ts generateVote):原样是 skip / player_N,或文字里能找到 player_N。 */
export function voteLooksValid(vote: unknown): boolean {
  if (typeof vote !== 'string') return false;
  const v = vote.trim();
  return v === 'skip' || /player_\d+/.test(v);
}

/**
 * C3:要求模型返回 {"reply": "...", "vote": "player_2"}。
 * 严格解析通过 = pass;只能宽松解析 = warn(导演层能用,裁了么评分会失败);都不行 = fail。
 */
export function judgeFormat(raw: string): Pick<CapabilityItem, 'status' | 'reason'> {
  const strict = parseJsonStrict(raw);
  const obj = (strict ?? parseJsonLenient(raw)) as { reply?: unknown; vote?: unknown } | null;
  if (!obj || typeof obj !== 'object') return { status: 'fail', reason: 'format_broken' };
  if (typeof obj.reply !== 'string' || !obj.reply.trim()) return { status: 'fail', reason: 'format_broken' };
  if (!voteLooksValid(obj.vote)) return { status: 'fail', reason: 'vote_format' };
  if (!strict) return { status: 'warn', reason: 'format_partial' };
  return { status: 'pass' };
}

/**
 * C4:connectMs = 最短请求的往返(近似首字延迟);speechMs 与 speechTokens 来自 C2 的那次调用。
 * 估算一段 300 token 发言 ≈ 首字延迟 + 300 / 出字速度。
 * speechTokens 拿不到(模型商不回 usage)时按字符数 / 1.3 粗估。
 */
export function judgeSpeed(input: {
  connectMs: number;
  speechMs: number;
  speechTokens?: number;
  speechChars: number;
}): Pick<CapabilityItem, 'status' | 'reason' | 'value'> {
  const { connectMaxMs, speechTokens: target, speechMaxMs } = CAPABILITY_THRESHOLDS;
  const tokens = input.speechTokens && input.speechTokens > 0 ? input.speechTokens : Math.max(1, Math.round(input.speechChars / 1.3));
  const genMs = Math.max(1, input.speechMs - input.connectMs);
  const msPerToken = genMs / tokens;
  const estimate = Math.round(input.connectMs + msPerToken * target);
  if (input.connectMs > connectMaxMs) return { status: 'warn', reason: 'slow_connect', value: estimate };
  if (estimate > speechMaxMs) return { status: 'warn', reason: 'slow_speech', value: estimate };
  return { status: 'pass', value: estimate };
}

/** C5:同时发 N 个最短请求的结果(每个元素是 callLLMWithTimeout 的 reason,成功为 undefined)。 */
export function judgeConcurrency(results: Array<{ ok: boolean; reason?: string }>): Pick<CapabilityItem, 'status' | 'reason' | 'value'> {
  const okCount = results.filter((r) => r.ok).length;
  if (okCount === results.length) return { status: 'pass', value: okCount };
  if (results.some((r) => !r.ok && r.reason === 'rate_limited')) return { status: 'warn', reason: 'rate_limited_concurrent', value: okCount };
  if (okCount === 0) return { status: 'warn', reason: 'concurrent_all_failed', value: 0 };
  return { status: 'warn', reason: 'partial_concurrent', value: okCount };
}

/**
 * C6:看 C1 / C2 两次调用的返回。有思考内容,或者文字为空但因长度截断结束,就是推理型模型。
 * 两次调用都没成功时无从判断。
 */
export function judgeReasoning(calls: Array<{ ok: boolean; text: string; finishReason?: string; reasoningChars?: number }>): Pick<CapabilityItem, 'status' | 'reason'> {
  if (calls.some((c) => (c.reasoningChars ?? 0) > 0)) return { status: 'warn', reason: 'reasoning_model' };
  if (calls.some((c) => !c.text.trim() && c.finishReason === 'length')) return { status: 'warn', reason: 'reasoning_model' };
  if (!calls.some((c) => c.ok)) return { status: 'unknown' };
  return { status: 'pass' };
}

/** C7:模型商返回的窗口大小(拿不到为 undefined)。未知不判失败。 */
export function judgeContext(tokens: number | undefined): Pick<CapabilityItem, 'status' | 'reason' | 'value'> {
  if (!tokens || !Number.isFinite(tokens) || tokens <= 0) return { status: 'unknown', reason: 'context_unknown' };
  if (tokens < CAPABILITY_THRESHOLDS.minContextTokens) return { status: 'fail', reason: 'context_too_small', value: tokens };
  if (tokens < CAPABILITY_THRESHOLDS.recommendedContextTokens) return { status: 'warn', reason: 'context_small', value: tokens };
  return { status: 'pass', value: tokens };
}

/**
 * 总体结论。必需项:fail → fail;error / unknown → incomplete(没测完,不能说不行)。
 * 推荐项:warn / fail → warn。context 是推荐项,窗口太小也只记 warn(拿不准估算,不挡人)。
 */
export function overallOf(items: CapabilityItem[]): CapabilityOverall {
  const required = items.filter((i) => i.level === 'required');
  if (required.some((i) => i.status === 'fail')) return 'fail';
  if (required.some((i) => i.status === 'error' || i.status === 'unknown' || i.status === 'skipped')) return 'incomplete';
  if (required.some((i) => i.status === 'warn')) return 'warn';
  if (items.some((i) => i.level === 'recommended' && (i.status === 'warn' || i.status === 'fail'))) return 'warn';
  return 'pass';
}

