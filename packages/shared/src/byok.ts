/**
 * byok — v6.167 — 「用户自带模型 key」的共享定义(前端设置面板与服务端校验共用)。
 *
 * owner 决策:产品本身不提供模型 API。托管版的每一次模型调用都用访客在浏览器里配置的 key;
 * 服务器只做转发——不持有、不落盘、不记录。
 *
 * 传输:HTTP 请求带 `X-Byok: <base64url(JSON)>`;Socket.IO 在握手 auth.byok 里带同样的串。
 * 服务端 decodeByok 严格校验(字段白名单、长度、字符集),不合法一律当没配。
 *
 * 模型商预设里的「推荐模型」只是建议值:模型 id 变化很快,设置面板「测试连接」时会用访客自己
 * 的 key 拉取模型商的 /models 列表供选择。base URL 是承重信息,来源见每项 docsUrl。
 */

export type ByokProviderId =
  | 'deepseek' | 'siliconflow' | 'moonshot' | 'zhipu' | 'dashscope'
  | 'volcengine' | 'openrouter' | 'openai' | 'minimax' | 'custom';

export interface ByokProviderPreset {
  id: ByokProviderId;
  name: string;
  /** OpenAI 兼容接口的 base URL(@ai-sdk/openai 会在后面拼 /chat/completions)。custom 为空。 */
  baseURL: string;
  /** 建议的模型 id(第一个为默认);以「测试连接」拉到的真实列表为准。 */
  suggestedModels: string[];
  /** 申请 / 管理 key 的页面。 */
  keyUrl: string;
  /** 官方价格页(面板只放链接,不写死价格)。 */
  pricingUrl?: string;
  /** base URL / 模型 id 的出处。 */
  docsUrl: string;
  /** 该家接受的 temperature 上限(部分国产模型只接受 0–1)。 */
  maxTemperature: number;
  /** OpenAI 兼容的 /audio/speech 语音合成(没有则 null,语音走浏览器朗读)。 */
  tts: { model: string; voices: { female: string; male: string } } | null;
  /** 面板上的一句提示。 */
  note?: string;
}

export const BYOK_PROVIDERS: readonly ByokProviderPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek 深度求索',
    baseURL: 'https://api.deepseek.com',
    suggestedModels: ['deepseek-flash', 'deepseek-v4-pro'],
    keyUrl: 'https://platform.deepseek.com/api_keys',
    pricingUrl: 'https://api-docs.deepseek.com/quick_start/pricing',
    docsUrl: 'https://api-docs.deepseek.com/quick_start/pricing',
    maxTemperature: 2,
    tts: null,
    note: '国内直连、价格低,推荐',
  },
  {
    id: 'siliconflow',
    name: '硅基流动 SiliconFlow',
    baseURL: 'https://api.siliconflow.cn/v1',
    suggestedModels: ['deepseek-ai/DeepSeek-V4-Flash', 'Qwen/Qwen3-8B'],
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
    pricingUrl: 'https://siliconflow.cn/pricing',
    docsUrl: 'https://api-docs.siliconflow.cn/api-reference/chat-completions/chat-completions',
    maxTemperature: 2,
    tts: { model: 'FunAudioLLM/CosyVoice2-0.5B', voices: { female: 'FunAudioLLM/CosyVoice2-0.5B:anna', male: 'FunAudioLLM/CosyVoice2-0.5B:alex' } },
    note: '模型多,部分开源模型免费;同一个 key 还能用语音合成',
  },
  {
    id: 'moonshot',
    name: 'Moonshot 月之暗面 Kimi',
    baseURL: 'https://api.moonshot.cn/v1',
    suggestedModels: ['kimi-k2.6'],
    keyUrl: 'https://platform.kimi.com/account/api-key',
    pricingUrl: 'https://platform.kimi.com/docs/pricing/chat',
    docsUrl: 'https://platform.kimi.com/docs/api/chat',
    maxTemperature: 1,
    tts: null,
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    suggestedModels: ['glm-4.7-flash'],
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    docsUrl: 'https://docs.bigmodel.cn/cn/guide/develop/openai/introduction',
    maxTemperature: 1,
    tts: null,
  },
  {
    id: 'dashscope',
    name: '阿里云百炼 通义千问',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    suggestedModels: ['qwen-plus', 'qwen-turbo'],
    keyUrl: 'https://bailian.console.aliyun.com/',
    docsUrl: 'https://www.alibabacloud.com/help/en/model-studio/developer-reference/compatibility-of-openai-with-dashscope',
    maxTemperature: 1.9,
    tts: null,
  },
  {
    id: 'volcengine',
    name: '火山方舟 豆包',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    suggestedModels: [],
    keyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
    docsUrl: 'https://www.volcengine.com/docs/82379',
    maxTemperature: 1,
    tts: null,
    note: '模型 id 填方舟控制台里的模型名或推理接入点 ID(ep-…)',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    suggestedModels: ['deepseek/deepseek-chat:free'],
    keyUrl: 'https://openrouter.ai/settings/keys',
    pricingUrl: 'https://openrouter.ai/models',
    docsUrl: 'https://openrouter.ai/docs/quick-start',
    maxTemperature: 2,
    tts: null,
    note: '境外聚合平台,国内访问可能不稳定',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    suggestedModels: [],
    keyUrl: 'https://platform.openai.com/api-keys',
    pricingUrl: 'https://openai.com/api/pricing/',
    docsUrl: 'https://platform.openai.com/docs/api-reference',
    maxTemperature: 2,
    tts: { model: 'gpt-4o-mini-tts', voices: { female: 'nova', male: 'onyx' } },
    note: '境外服务,国内网络通常无法直连',
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    baseURL: 'https://api.minimax.io/v1',
    suggestedModels: ['MiniMax-M2.7'],
    keyUrl: 'https://platform.minimax.io',
    pricingUrl: 'https://platform.minimax.io/docs/guides/pricing-paygo.md',
    docsUrl: 'https://platform.minimax.io/docs/api-reference/text-chat-openai',
    maxTemperature: 1,
    tts: null,
  },
  {
    id: 'custom',
    name: '其他 OpenAI 兼容接口',
    baseURL: '',
    suggestedModels: [],
    keyUrl: '',
    docsUrl: '',
    maxTemperature: 1,
    tts: null,
    note: '自填 base URL(必须 https);托管版可能关闭此项',
  },
];

export function findProvider(id: string): ByokProviderPreset | undefined {
  return BYOK_PROVIDERS.find((p) => p.id === id);
}

/**
 * v6.169.5 — 已知模型的元数据,供能力检测的 C6(是否推理型)和 C7(上下文窗口)在模型商不提供时查表。
 * 每条都要有官方出处(source),数字以官方页面原文为准;查不到就不写,检测会显示「未知」,不会判失败。
 *   thinking:on = 不传额外参数时默认先思考;off = 支持思考但默认关闭;none = 不是推理型模型。
 */
export interface ModelFacts {
  contextTokens?: number;
  thinking?: 'on' | 'off' | 'none';
  /** 官方页面地址(多个用空格分开)。 */
  source: string;
}

export const MODEL_FACTS: Readonly<Partial<Record<ByokProviderId, Readonly<Record<string, ModelFacts>>>>> = {
  // 2026-11-25 逐条回官方页面核过;页面写 1M / 256K 就按 1000000 / 256000 记
  deepseek: {
    // 定价页:Supports both non-thinking and thinking (default) modes;关闭思考要传 reasoning_effort: none
    'deepseek-flash': { contextTokens: 1_000_000, thinking: 'on', source: 'https://api-docs.deepseek.com/quick_start/pricing https://api-docs.deepseek.com/guides/thinking_mode/' },
    'deepseek-v4-pro': { contextTokens: 1_000_000, thinking: 'on', source: 'https://api-docs.deepseek.com/quick_start/pricing' },
  },
  siliconflow: {
    // enable_thinking 默认 True(文档原文 Default is True);示例返回里带 reasoning_content
    'deepseek-ai/DeepSeek-V4-Flash': { contextTokens: 1_024_000, thinking: 'on', source: 'https://www.siliconflow.cn/models https://api-docs.siliconflow.cn/api-reference/chat-completions/chat-completions' },
    'Qwen/Qwen3-8B': { contextTokens: 131_000, thinking: 'on', source: 'https://www.siliconflow.com/models/llm https://docs.siliconflow.com/cn/api-reference/chat-completions/chat-completions' },
  },
  moonshot: {
    // thinking 默认 {type: enabled},传 disabled 可关闭
    'kimi-k2.6': { contextTokens: 256_000, thinking: 'on', source: 'https://platform.kimi.com/docs/api/models-overview https://platform.kimi.com/docs/api/chat' },
  },
  zhipu: {
    // 窗口已核;flash 专页没写思考默认开还是关,不填
    'glm-4.7-flash': { contextTokens: 200_000, source: 'https://docs.bigmodel.cn/cn/guide/models/free/glm-4.7-flash' },
  },
  dashscope: {
    // 混合思考,默认不开:Hybrid thinking mode, thinking mode not enabled by default
    'qwen-plus': { contextTokens: 1_000_000, thinking: 'off', source: 'https://www.alibabacloud.com/help/en/model-studio/qwen-plus https://www.alibabacloud.com/help/en/model-studio/deep-thinking' },
  },
};

/** 查已知模型的元数据;没有返回 undefined。 */
export function findModelFacts(provider: string, model: string): ModelFacts | undefined {
  return MODEL_FACTS[provider as ByokProviderId]?.[model];
}

/** 语音来源:浏览器朗读(免费,默认)/ 用同一家模型商的语音接口 / 另填 MiniMax 语音 key。 */
export type ByokTtsMode = 'browser' | 'provider' | 'minimax';

export interface ByokConfig {
  v: 1;
  provider: ByokProviderId;
  apiKey: string;
  model: string;
  /** 可选:便宜快速的模型,用于投票等短输出;不填用 model。 */
  fastModel?: string;
  /** 仅 provider=custom。 */
  baseURL?: string;
  tts?: { mode: ByokTtsMode; minimaxKey?: string; minimaxGroupId?: string };
}

export const BYOK_HEADER = 'x-byok';
/** 编码后串的长度上限(防止超大请求头)。 */
export const BYOK_MAX_ENCODED = 4096;

const KEY_RE = /^[\x21-\x7e]{8,512}$/;
const MODEL_RE = /^[A-Za-z0-9._:/@+-]{1,128}$/;
const GROUP_RE = /^[0-9]{1,32}$/;
const TTS_MODES: ByokTtsMode[] = ['browser', 'provider', 'minimax'];

export type ByokValidation = { ok: true; config: ByokConfig } | { ok: false; error: string };

/** 严格校验一个(不可信来源的)对象,只保留白名单字段。 */
export function validateByok(input: unknown): ByokValidation {
  if (!input || typeof input !== 'object') return { ok: false, error: 'not_object' };
  const o = input as Record<string, unknown>;
  if (o.v !== 1) return { ok: false, error: 'bad_version' };
  const preset = typeof o.provider === 'string' ? findProvider(o.provider) : undefined;
  if (!preset) return { ok: false, error: 'bad_provider' };
  if (typeof o.apiKey !== 'string' || !KEY_RE.test(o.apiKey)) return { ok: false, error: 'bad_key' };
  if (typeof o.model !== 'string' || !MODEL_RE.test(o.model)) return { ok: false, error: 'bad_model' };
  const cfg: ByokConfig = { v: 1, provider: preset.id, apiKey: o.apiKey, model: o.model };
  if (o.fastModel !== undefined && o.fastModel !== '') {
    if (typeof o.fastModel !== 'string' || !MODEL_RE.test(o.fastModel)) return { ok: false, error: 'bad_fast_model' };
    cfg.fastModel = o.fastModel;
  }
  if (preset.id === 'custom') {
    if (typeof o.baseURL !== 'string' || o.baseURL.length > 300) return { ok: false, error: 'bad_base_url' };
    let u: URL;
    try { u = new URL(o.baseURL); } catch { return { ok: false, error: 'bad_base_url' }; }
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password || u.hash) {
      return { ok: false, error: 'bad_base_url' };
    }
    cfg.baseURL = normalizeBaseURL(u.toString());
  }
  if (o.tts !== undefined) {
    const t = o.tts as Record<string, unknown> | null;
    if (!t || typeof t !== 'object' || !TTS_MODES.includes(t.mode as ByokTtsMode)) return { ok: false, error: 'bad_tts' };
    const tts: NonNullable<ByokConfig['tts']> = { mode: t.mode as ByokTtsMode };
    if (tts.mode === 'minimax') {
      if (typeof t.minimaxKey !== 'string' || !KEY_RE.test(t.minimaxKey)) return { ok: false, error: 'bad_tts_key' };
      tts.minimaxKey = t.minimaxKey;
      if (t.minimaxGroupId !== undefined && t.minimaxGroupId !== '') {
        if (typeof t.minimaxGroupId !== 'string' || !GROUP_RE.test(t.minimaxGroupId)) return { ok: false, error: 'bad_tts_group' };
        tts.minimaxGroupId = t.minimaxGroupId;
      }
    }
    if (tts.mode === 'provider' && !preset.tts) return { ok: false, error: 'provider_has_no_tts' };
    cfg.tts = tts;
  }
  return { ok: true, config: cfg };
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeByok(cfg: ByokConfig): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(cfg)));
}

/** 解码 + 校验;任何异常都返回 null(不可信输入)。 */
export function decodeByok(raw: unknown): ByokConfig | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > BYOK_MAX_ENCODED) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  try {
    const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(fromBase64Url(raw)));
    const v = validateByok(parsed);
    return v.ok ? v.config : null;
  } catch {
    return null;
  }
}

/** 给日志 / 界面看的 key 指纹:只露前 3 位与后 4 位。 */
export function maskKey(key: string): string {
  if (key.length <= 8) return '•'.repeat(key.length);
  return `${key.slice(0, 3)}…${key.slice(-4)}`;
}

/**
 * 自定义接口地址的规范写法(去掉首尾空白和末尾的 /)。保存时(validateByok)和前端算缓存指纹、判断「已保存」时
 * 必须用同一个函数,不然 https://x/v1/ 和 https://x/v1 会被当成两份配置。解析不了就原样(去空白)返回。
 */
export function normalizeBaseURL(raw: string): string {
  const t = raw.trim();
  try { return new URL(t).toString().replace(/\/+$/, ''); } catch { return t; }
}

/** 解析出实际调用的 base URL。 */
export function resolveBaseURL(cfg: ByokConfig): string {
  if (cfg.provider === 'custom') return cfg.baseURL ?? '';
  return findProvider(cfg.provider)?.baseURL ?? '';
}
