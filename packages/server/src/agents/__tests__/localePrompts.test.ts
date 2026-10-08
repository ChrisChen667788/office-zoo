/**
 * v6.156 — 英文局 prompt 正确性测试
 *
 * 核心断言:
 *   - 英文局所有 prompt 构建函数与 fallback 池输出不含汉字(/[一-鿿]/)
 *   - 英文局 system prompt 含 FAANG/Big Tech 关键词
 *   - gameLocaleFromUiLocale 映射正确
 *   - locale 从 socket schema 到 BaseAgent 字段的贯通
 *
 * v6.157 — 日韩局 prompt 正确性测试(同文件继续扩展)
 *   - 日韩局 system prompt 含对应语言指令
 *   - ja fallback 含假名、ko fallback 含谚文
 *   - ja/ko speech prompt 含语言指令与黑话词
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Team, Role, Personality, gameLocaleFromUiLocale } from '@furball/shared';

// v6.156 — mock LLM、memory、relation 层:测试不发起真实网络调用
vi.mock('../../utils/llm', () => ({
  callLLMWithTimeout: vi.fn(),
}));

vi.mock('../../services/memoryRecall', () => ({
  recallMemories: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../services/relationStore', () => ({
  getEdgesFor: vi.fn().mockReturnValue([]),
}));

import {
  BaseAgent,
  buildSystemPrompt,
  buildSpeechPrompt,
  buildVotePrompt,
  buildGhostCommentPrompt,
  buildGhostVotePrompt,
  ROOM_NAME_I18N,
  localizeRoom,
} from '../BaseAgent';
import { buildDiscussionContextFn } from '../../engine/GameEngine';
import { callLLMWithTimeout } from '../../utils/llm';

// ── helpers ────────────────────────────────────────────────────────────────

const CJK_RE = /[一-鿿]/;

function lastLLMCall() {
  const calls = (callLLMWithTimeout as ReturnType<typeof vi.fn>).mock.calls;
  if (calls.length === 0) throw new Error('callLLMWithTimeout was not called');
  const [kind, opts] = calls[calls.length - 1] as [string, { system?: string; prompt?: string }];
  return { kind, system: opts.system ?? '', prompt: opts.prompt ?? '' };
}

function mockLLMSuccess(text = '__MOCK_LLM__') {
  (callLLMWithTimeout as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, text });
}

function mockLLMFail() {
  (callLLMWithTimeout as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: false, reason: 'error', text: '',
  });
}

const EN_CONTEXT = 'Round 1 all-hands meeting. Active employees: Tony (in Open Office), Lisa (in Break Room).';
const EN_CANDIDATES = [
  { id: 'player_0', name: 'Tony' },
  { id: 'player_1', name: 'Lisa' },
  { id: 'player_2', name: 'Kevin' },
];

// ── v6.156 gameLocaleFromUiLocale 映射 ────────────────────────────────────

describe('gameLocaleFromUiLocale — UI locale → game locale mapping', () => {
  it('zh-CN → zh', () => expect(gameLocaleFromUiLocale('zh-CN')).toBe('zh'));
  it('zh-TW → zh', () => expect(gameLocaleFromUiLocale('zh-TW')).toBe('zh'));
  it('en-US → en', () => expect(gameLocaleFromUiLocale('en-US')).toBe('en'));
  it('en-GB → en', () => expect(gameLocaleFromUiLocale('en-GB')).toBe('en'));
  it('ja-JP → ja', () => expect(gameLocaleFromUiLocale('ja-JP')).toBe('ja'));
  it('ja → ja', () => expect(gameLocaleFromUiLocale('ja')).toBe('ja'));
  it('ko-KR → ko', () => expect(gameLocaleFromUiLocale('ko-KR')).toBe('ko'));
  it('ko → ko', () => expect(gameLocaleFromUiLocale('ko')).toBe('ko'));
  it('未知 → zh(兜底)', () => expect(gameLocaleFromUiLocale('fr-FR')).toBe('zh'));
  it('空字符串 → zh', () => expect(gameLocaleFromUiLocale('')).toBe('zh'));
});

// ── v6.156 buildSystemPrompt EN 无汉字 ────────────────────────────────────

describe('buildSystemPrompt EN — DOG/CAT/NEUTRAL × personality 无汉字', () => {
  const ALL_PERSONALITIES: Array<Personality | undefined> = [
    undefined,
    Personality.SOCIAL_BUTTERFLY, Personality.INTROVERT,
    Personality.CONTRARIAN, Personality.SYCOPHANT,
    Personality.PASSIVE_AGGRESSIVE, Personality.HOT_TEMPERED,
    Personality.SMOOTH_OPERATOR, Personality.WORKAHOLIC,
  ];

  for (const team of [Team.DOG, Team.CAT, Team.NEUTRAL]) {
    for (const p of ALL_PERSONALITIES) {
      it(`team=${team} p=${p ?? 'none'} — no CJK`, () => {
        const prompt = buildSystemPrompt(Role.VILLAGER_CAT, team, p, 'en');
        expect(CJK_RE.test(prompt)).toBe(false);
      });
    }
  }
});

// ── v6.156 buildSystemPrompt EN DOG 含 Big Tech 关键词 ────────────────────

describe('buildSystemPrompt EN — DOG contains Big Tech terms', () => {
  it('DOG system prompt contains "PIP" or "stack-rank" or "headcount"', () => {
    const prompt = buildSystemPrompt(Role.KILLER_DOG, Team.DOG, undefined, 'en');
    expect(prompt).toMatch(/PIP|stack-rank|headcount/i);
    expect(CJK_RE.test(prompt)).toBe(false);
  });

  it('DOG system prompt contains FAANG-style framing', () => {
    const prompt = buildSystemPrompt(Role.KILLER_DOG, Team.DOG, undefined, 'en');
    expect(prompt).toMatch(/FAANG|management|impact/i);
  });
});

// ── v6.156 buildSystemPrompt EN CAT 含 anti-corporate 关键词 ─────────────

describe('buildSystemPrompt EN — CAT contains anti-corporate terms', () => {
  it('CAT system prompt contains "jargon" or "worker" or "management mole"', () => {
    const prompt = buildSystemPrompt(Role.VILLAGER_CAT, Team.CAT, undefined, 'en');
    expect(prompt).toMatch(/jargon|worker|mole/i);
    expect(CJK_RE.test(prompt)).toBe(false);
  });
});

// ── v6.156 buildSpeechPrompt EN 无汉字 ────────────────────────────────────

describe('buildSpeechPrompt EN — output no CJK', () => {
  it('有 prior speeches 时不含汉字', () => {
    const prompt = buildSpeechPrompt({
      playerName: 'Tony',
      context: EN_CONTEXT,
      locale: 'en',
      priorSpeeches: [
        { name: 'Lisa', text: 'Tony keeps saying "impact" but I see zero actual impact.' },
      ],
      bigtechTerms: ['PIP', 'stack-rank', 'headcount', 'TC'],
      bigtechSentence: "let's take this offline",
    });
    expect(CJK_RE.test(prompt)).toBe(false);
    expect(prompt).toMatch(/Big Tech|jargon|impact/i);
  });

  it('无 prior speeches 时不含汉字', () => {
    const prompt = buildSpeechPrompt({
      playerName: 'Lisa',
      context: EN_CONTEXT,
      locale: 'en',
    });
    expect(CJK_RE.test(prompt)).toBe(false);
    expect(prompt).toMatch(/first speaker|attack/i);
  });
});

// ── v6.156 buildVotePrompt EN 无汉字 ─────────────────────────────────────

describe('buildVotePrompt EN — output no CJK', () => {
  it('英文投票 prompt 不含汉字', () => {
    const prompt = buildVotePrompt('Tony', EN_CONTEXT, 'player_1:Lisa, player_2:Kevin', 'You tend to vote decisively.', '', 'en');
    expect(CJK_RE.test(prompt)).toBe(false);
    expect(prompt).toMatch(/vote|fire/i);
  });
});

// ── v6.156 buildGhostCommentPrompt EN 无汉字 ─────────────────────────────

describe('buildGhostCommentPrompt EN — no CJK', () => {
  it('EN ghost comment — no CJK in system or prompt', () => {
    const { system, prompt } = buildGhostCommentPrompt({
      playerName: 'Tony', role: Role.KILLER_DOG, team: Team.DOG,
      context: EN_CONTEXT, locale: 'en',
    });
    expect(CJK_RE.test(system)).toBe(false);
    expect(CJK_RE.test(prompt)).toBe(false);
  });
});

// ── v6.156 buildGhostVotePrompt EN 无汉字 ────────────────────────────────

describe('buildGhostVotePrompt EN — no CJK', () => {
  it('英文鬼魂投票 prompt 不含汉字', () => {
    const { system, prompt } = buildGhostVotePrompt({
      playerName: 'Tony', role: Role.KILLER_DOG, team: Team.DOG,
      context: EN_CONTEXT, candidateList: 'player_1:Lisa, player_2:Kevin',
      locale: 'en',
    });
    expect(CJK_RE.test(system)).toBe(false);
    expect(CJK_RE.test(prompt)).toBe(false);
  });
});

// ── v6.156 BaseAgent locale 字段贯通 ─────────────────────────────────────

describe('BaseAgent locale field — routing', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    mockLLMSuccess();
  });
  afterEach(() => { randomSpy.mockRestore(); });

  it('locale 默认为 zh', () => {
    const agent = new BaseAgent('p0', '张总', Role.KILLER_DOG, Team.DOG);
    expect(agent.locale).toBe('zh');
  });

  it('locale=en 正确传入 constructor', () => {
    const agent = new BaseAgent('p0', 'Tony', Role.KILLER_DOG, Team.DOG, undefined, null, undefined, 'en');
    expect(agent.locale).toBe('en');
  });

  it('locale=en generateSpeech — LLM call system prompt 无汉字', async () => {
    const agent = new BaseAgent('p0', 'Tony', Role.KILLER_DOG, Team.DOG, undefined, null, undefined, 'en');
    await agent.generateSpeech(EN_CONTEXT);
    const { system, prompt } = lastLLMCall();
    expect(CJK_RE.test(system)).toBe(false);
    expect(CJK_RE.test(prompt)).toBe(false);
  });

  it('locale=en generateVote — LLM call prompt 无汉字', async () => {
    const agent = new BaseAgent('p0', 'Tony', Role.KILLER_DOG, Team.DOG, undefined, null, undefined, 'en');
    await agent.generateVote(EN_CONTEXT, EN_CANDIDATES);
    const { prompt } = lastLLMCall();
    expect(CJK_RE.test(prompt)).toBe(false);
  });
});

// ── v6.156 EN fallback speech 无汉字 ─────────────────────────────────────

describe('EN fallback speech — no CJK', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    mockLLMFail();
  });
  afterEach(() => { randomSpy.mockRestore(); });

  it('DOG EN fallback — no CJK', async () => {
    const agent = new BaseAgent('p0', 'Tony', Role.KILLER_DOG, Team.DOG, undefined, null, undefined, 'en');
    const result = await agent.generateSpeech(EN_CONTEXT);
    expect(CJK_RE.test(result)).toBe(false);
    expect(result.length).toBeGreaterThan(0);
  });

  it('CAT EN fallback — no CJK', async () => {
    const agent = new BaseAgent('p0', 'Lisa', Role.VILLAGER_CAT, Team.CAT, undefined, null, undefined, 'en');
    const result = await agent.generateSpeech(EN_CONTEXT);
    expect(CJK_RE.test(result)).toBe(false);
  });

  it('NEUTRAL EN fallback — no CJK', async () => {
    const agent = new BaseAgent('p0', 'Kevin', Role.JESTER, Team.NEUTRAL, undefined, null, undefined, 'en');
    const result = await agent.generateSpeech(EN_CONTEXT);
    expect(CJK_RE.test(result)).toBe(false);
  });
});

// ── v6.156 buildDiscussionContextFn EN 无汉字 ─────────────────────────────

describe('buildDiscussionContextFn EN — no CJK', () => {
  it('英文讨论上下文不含汉字,房间名被翻译', () => {
    const ctx = buildDiscussionContextFn(
      1,
      [
        { id: 'p0', name: 'Tony', position: { room: '开放工区' }, isAlive: true, team: Team.DOG, ghostVoteUsed: false } as never,
        { id: 'p1', name: 'Lisa', position: { room: '茶水间' }, isAlive: true, team: Team.CAT, ghostVoteUsed: false } as never,
      ],
      [
        { id: 'p0', name: 'Tony', position: { room: '开放工区' }, isAlive: true, team: Team.DOG, ghostVoteUsed: false } as never,
        { id: 'p1', name: 'Lisa', position: { room: '茶水间' }, isAlive: true, team: Team.CAT, ghostVoteUsed: false } as never,
      ],
      undefined, undefined, [], [], 'en',
    );
    expect(CJK_RE.test(ctx)).toBe(false);
    expect(ctx).toMatch(/Round 1|all-hands/i);
    expect(ctx).toMatch(/Open Office|Break Room/i);
  });
});

// ── v6.156 房间名国际化映射 ────────────────────────────────────────────────

describe('localizeRoom — room name i18n', () => {
  it('en: 开放工区 → Open Office', () => {
    expect(localizeRoom('开放工区', 'en')).toBe('Open Office');
  });
  it('en: 茶水间 → Break Room', () => {
    expect(localizeRoom('茶水间', 'en')).toBe('Break Room');
  });
  it('zh: fallback 原始名', () => {
    expect(localizeRoom('开放工区', 'zh')).toBe('开放工区');
  });
  it('未知房间名 fallback', () => {
    expect(localizeRoom('奇怪的地方', 'en')).toBe('奇怪的地方');
  });
  it('ROOM_NAME_I18N 覆盖全部10个房间', () => {
    expect(Object.keys(ROOM_NAME_I18N).length).toBeGreaterThanOrEqual(10);
  });
});

// ── v6.157 日韩局语言指令与黑话词 ────────────────────────────────────────

describe('v6.157 buildSystemPrompt JA/KO — language instruction', () => {
  it('JA DOG — contains Japanese language instruction', () => {
    const prompt = buildSystemPrompt(Role.KILLER_DOG, Team.DOG, undefined, 'ja');
    expect(prompt).toMatch(/Japanese|日本語/i);
  });

  it('KO CAT — contains Korean language instruction', () => {
    const prompt = buildSystemPrompt(Role.VILLAGER_CAT, Team.CAT, undefined, 'ko');
    expect(prompt).toMatch(/Korean|한국어/i);
  });

  it('JA system prompt — contains Japanese only instruction', () => {
    const prompt = buildSystemPrompt(Role.JESTER, Team.NEUTRAL, undefined, 'ja');
    expect(prompt).toMatch(/LANGUAGE INSTRUCTION|Respond ONLY in Japanese/i);
  });
});

// ── v6.157 日韩局 fallback 池含假名/谚文 ─────────────────────────────────

describe('v6.157 JA/KO fallback speech', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    mockLLMFail();
  });
  afterEach(() => { randomSpy.mockRestore(); });

  const HIRAGANA_KATAKANA = /[぀-ヿ]/;
  const HANGUL = /[가-힯]/;

  it('DOG JA fallback — contains hiragana/katakana', async () => {
    const agent = new BaseAgent('p0', 'Tony', Role.KILLER_DOG, Team.DOG, undefined, null, undefined, 'ja');
    const result = await agent.generateSpeech(EN_CONTEXT);
    expect(HIRAGANA_KATAKANA.test(result)).toBe(true);
  });

  it('CAT JA fallback — contains hiragana/katakana', async () => {
    const agent = new BaseAgent('p0', 'Lisa', Role.VILLAGER_CAT, Team.CAT, undefined, null, undefined, 'ja');
    const result = await agent.generateSpeech(EN_CONTEXT);
    expect(HIRAGANA_KATAKANA.test(result)).toBe(true);
  });

  it('NEUTRAL JA fallback — contains hiragana/katakana', async () => {
    const agent = new BaseAgent('p0', 'Kevin', Role.JESTER, Team.NEUTRAL, undefined, null, undefined, 'ja');
    const result = await agent.generateSpeech(EN_CONTEXT);
    expect(HIRAGANA_KATAKANA.test(result)).toBe(true);
  });

  it('DOG KO fallback — contains Hangul', async () => {
    const agent = new BaseAgent('p0', 'Tony', Role.KILLER_DOG, Team.DOG, undefined, null, undefined, 'ko');
    const result = await agent.generateSpeech(EN_CONTEXT);
    expect(HANGUL.test(result)).toBe(true);
  });

  it('CAT KO fallback — contains Hangul', async () => {
    const agent = new BaseAgent('p0', 'Lisa', Role.VILLAGER_CAT, Team.CAT, undefined, null, undefined, 'ko');
    const result = await agent.generateSpeech(EN_CONTEXT);
    expect(HANGUL.test(result)).toBe(true);
  });

  it('NEUTRAL KO fallback — contains Hangul', async () => {
    const agent = new BaseAgent('p0', 'Kevin', Role.JESTER, Team.NEUTRAL, undefined, null, undefined, 'ko');
    const result = await agent.generateSpeech(EN_CONTEXT);
    expect(HANGUL.test(result)).toBe(true);
  });
});

// ── v6.157 日韩局 speech prompt 含黑话词 ────────────────────────────────

describe('v6.157 buildSpeechPrompt JA/KO — language instruction & jargon', () => {
  it('JA speech prompt — contains Japanese language instruction and jargon', () => {
    const prompt = buildSpeechPrompt({
      playerName: 'Tony',
      context: EN_CONTEXT,
      locale: 'ja',
      bigtechTerms: ['PIP', 'stack-rank'],
      jaJargon: [
        { term: 'ブラック企業', gloss: 'exploitative company' },
        { term: '社畜', gloss: 'corporate livestock' },
      ],
    });
    expect(prompt).toMatch(/Japanese|日本語/i);
    expect(prompt).toMatch(/ブラック企業|社畜/);
  });

  it('KO speech prompt — contains Korean language instruction and jargon', () => {
    const prompt = buildSpeechPrompt({
      playerName: 'Lisa',
      context: EN_CONTEXT,
      locale: 'ko',
      bigtechTerms: ['headcount', 'reorg'],
      koJargon: [
        { term: '갑질', gloss: 'abuse of power' },
        { term: '야근', gloss: 'late-night overtime' },
      ],
    });
    expect(prompt).toMatch(/Korean|한국어/i);
    expect(prompt).toMatch(/갑질|야근/);
  });
});

// ── v6.157 ja/ko 房间名映射 ──────────────────────────────────────────────

describe('v6.157 localizeRoom ja/ko', () => {
  it('ja: 会议室 → 会議室', () => {
    expect(localizeRoom('会议室', 'ja')).toBe('会議室');
  });
  it('ko: 老板办公室 → 대표실', () => {
    expect(localizeRoom('老板办公室', 'ko')).toBe('대표실');
  });
});

// ── v6.157 gameLocaleFromUiLocale ja/ko 扩展 ────────────────────────────

describe('v6.157 gameLocaleFromUiLocale — ja/ko', () => {
  it('ja-JP → ja', () => expect(gameLocaleFromUiLocale('ja-JP')).toBe('ja'));
  it('ko-KR → ko', () => expect(gameLocaleFromUiLocale('ko-KR')).toBe('ko'));
});

// ── v6.156: roleIntelBlock EN — non-empty intel must not contain CJK ──
// Exercises the path that was previously untested: special CAT roles that
// receive addRoleIntel() strings.  In EN games, roleIntelBlock() must use an
// English header and the content strings from GameEngine are also English.

describe('v6.156: roleIntelBlock EN — no CJK with non-empty intel', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    mockLLMSuccess();
  });
  afterEach(() => { randomSpy.mockRestore(); });

  it('EN generateSpeech — roleIntel block 无汉字 (detective role intel)', async () => {
    const agent = new BaseAgent('p0', 'Tony', Role.DETECTIVE_CAT, Team.CAT, undefined, null, undefined, 'en');
    // Simulate GameEngine pushing an EN roleIntel string (as fixed in v6.158)
    agent.addRoleIntel('You (HR Director) ran Lisa\'s real performance file: they are on the management side.');
    await agent.generateSpeech(EN_CONTEXT);
    const { system, prompt } = lastLLMCall();
    expect(CJK_RE.test(system)).toBe(false);
    expect(CJK_RE.test(prompt)).toBe(false);
    // The intel block must actually appear in the prompt
    expect(prompt).toMatch(/private role intel|HR Director/i);
  });

  it('EN generateVote — roleIntel block 无汉字 (medic role intel)', async () => {
    const agent = new BaseAgent('p0', 'Tony', Role.MEDIC_CAT, Team.CAT, undefined, null, undefined, 'en');
    agent.addRoleIntel('You (Union Rep) secretly covered Lisa this round, blocking any "optimization" against them.');
    await agent.generateVote(EN_CONTEXT, EN_CANDIDATES);
    const { prompt } = lastLLMCall();
    expect(CJK_RE.test(prompt)).toBe(false);
    expect(prompt).toMatch(/private role intel|Union Rep/i);
  });
});

// ── v6.157: buildGhostVotePrompt JA/KO — language instruction ─────────

describe('v6.157: buildGhostVotePrompt JA/KO — language instruction', () => {
  it('JA ghost vote prompt — contains Japanese language instruction', () => {
    const { system, prompt } = buildGhostVotePrompt({
      playerName: 'Tony', role: Role.KILLER_DOG, team: Team.DOG,
      context: EN_CONTEXT, candidateList: 'player_1:Lisa',
      locale: 'ja',
    });
    expect(system).toMatch(/Japanese/i);
    expect(prompt).toMatch(/Japanese/i);
  });

  it('KO ghost vote prompt — contains Korean language instruction', () => {
    const { system, prompt } = buildGhostVotePrompt({
      playerName: 'Lisa', role: Role.VILLAGER_CAT, team: Team.CAT,
      context: EN_CONTEXT, candidateList: 'player_0:Tony',
      locale: 'ko',
    });
    expect(system).toMatch(/Korean/i);
    expect(prompt).toMatch(/Korean/i);
  });
});

// ── v6.156: sanitizeSpeech EN meta-tail cutting (spec gap) ─────────────
// sanitizeSpeech is private; exercise it indirectly through generateSpeech.
// The function must strip EN meta tails (Note:, P.S., (Alternative, Version A:).

describe('v6.156: sanitizeSpeech EN meta-tail cutting', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
  });
  afterEach(() => { randomSpy.mockRestore(); });

  it('cuts trailing "Note:" meta commentary', async () => {
    (callLLMWithTimeout as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: 'Your impact doc is missing. Who owns this outcome?\nNote: This is a harsher version if you want.',
    });
    const agent = new BaseAgent('p0', 'Tony', Role.KILLER_DOG, Team.DOG, undefined, null, undefined, 'en');
    const result = await agent.generateSpeech(EN_CONTEXT);
    expect(result).not.toMatch(/Note:/i);
    expect(result).toContain('Your impact doc is missing');
  });

  it('cuts trailing "P.S." meta commentary', async () => {
    (callLLMWithTimeout as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: 'Let\'s take this offline, @Lisa.\nP.S. Can adjust tone if needed.',
    });
    const agent = new BaseAgent('p0', 'Tony', Role.KILLER_DOG, Team.DOG, undefined, null, undefined, 'en');
    const result = await agent.generateSpeech(EN_CONTEXT);
    expect(result).not.toMatch(/P\.S\./i);
    expect(result).toContain("Let's take this offline");
  });

  it('cuts "(Alternative version" tail', async () => {
    (callLLMWithTimeout as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: 'Headcount is not aligned with our north star. (Alternative: softer version available)',
    });
    const agent = new BaseAgent('p0', 'Tony', Role.KILLER_DOG, Team.DOG, undefined, null, undefined, 'en');
    const result = await agent.generateSpeech(EN_CONTEXT);
    expect(result).not.toMatch(/Alternative/i);
    expect(result).toContain('Headcount is not aligned');
  });

  it('cuts "Version A:" meta tail on new line', async () => {
    (callLLMWithTimeout as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: 'Your role is being eliminated, not your performance.\nVersion A: gentler phrasing here.',
    });
    const agent = new BaseAgent('p0', 'Tony', Role.KILLER_DOG, Team.DOG, undefined, null, undefined, 'en');
    const result = await agent.generateSpeech(EN_CONTEXT);
    expect(result).not.toMatch(/Version A:/i);
    expect(result).toContain('Your role is being eliminated');
  });

  it('中文局 sanitizeSpeech 行为不变 — zh 中文 meta 尾巴被切', async () => {
    (callLLMWithTimeout as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: '这件事的 owner 是谁?我只看结果。\n(以下是另一种版本)',
    });
    const agent = new BaseAgent('p0', '张总', Role.KILLER_DOG, Team.DOG, undefined, null, undefined, 'zh');
    const result = await agent.generateSpeech('第一轮会议。在场员工: 张总 (在会议室)。');
    expect(result).not.toMatch(/以下是另一种版本/);
    expect(result).toContain('这件事的 owner 是谁');
  });
});
