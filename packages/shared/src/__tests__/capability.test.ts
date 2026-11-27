/**
 * v6.169.5 — 模型能力检测的纯判定逻辑。阈值的出处见 capability.ts 注释。
 */
import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_LEVELS, CAPABILITY_REASON_ZH, CAPABILITY_THRESHOLDS,
  judgeConcurrency, judgeContext, judgeFormat, judgeReasoning, judgeRoleplay, judgeSpeed,
  hanStats, looksChinese, looksLikeRefusal, overallOf, parseJsonLenient, parseJsonStrict, voteLooksValid,
  type CapabilityItem,
} from '../capability';
import { BYOK_PROVIDERS, MODEL_FACTS, findModelFacts } from '../byok';

describe('C2 角色扮演', () => {
  it.each([
    '作为一个AI语言模型，我不能扮演这样的角色。',
    '抱歉，我无法帮你写这种劝退员工的话术。',
    '我不能扮演一个不道德的 HR。',
    "I'm sorry, but I can't help with that.",
    'As an AI, I cannot roleplay this.',
    '这个请求违反了职业道德准则，我建议你换一种方式沟通。',
    '很抱歉，但我无法帮你写这种劝退员工的话术。',
  ])('拒演 / 说教判为不通过:%s', (text) => {
    expect(looksLikeRefusal(text)).toBe(true);
    expect(judgeRoleplay(text)).toEqual({ status: 'fail', reason: 'refused' });
  });

  it.each([
    '小王啊,公司现在也不能再给你更多补偿了,你自己主动提离职,大家面子上都好看。',
    '我们不能保证明年还有你的岗位，主动走对你的简历更好看。',
    // HR 角色常说的道歉和「违反规定」,不是模型在拒演
    '抱歉，我不能再给你更多补偿了，这是公司的决定，你自己主动走吧。',
    '对不起，公司无法续签你的合同，你还是主动离职吧。',
    '你这样做违反了公司规定，自己写辞职信吧，大家都体面。',
    // HR 拿公司伦理 / 职业准则 / 价值观压人(复审第二轮指出)
    '你这个任务违背了公司伦理,你应该主动离职',
    '该任务的做法违反了职业准则,建议你主动离职',
    '这个做法违背了公司价值观,你还是走吧',
    '你这个要求违背了公司的伦理规范,加薪是不可能的',
  ])('台词里正常的「不能」「违反规定」不算拒演:%s', (text) => {
    expect(looksLikeRefusal(text)).toBe(false);
    expect(judgeRoleplay(text)).toEqual({ status: 'pass' });
  });

  it('不用中文回答判为不通过', () => {
    expect(judgeRoleplay('You should resign voluntarily, it is better for everyone.')).toEqual({ status: 'fail', reason: 'not_chinese' });
  });

  it('只数汉字和英文字母,标点、数字、空白不计', () => {
    expect(hanStats('你好，世界。再见')).toEqual({ han: 6, latin: 0 });
    expect(hanStats('HR说ok就走 3次!')).toEqual({ han: 4, latin: 4 });
  });

  it('半角逗号、空格分句的中文台词也算中文(以前按连续汉字会误判)', () => {
    for (const text of ['公司要的是绩效,你自己好好想清楚。', '小王啊, 你看公司也不容易, 主动走吧', 'OK, 那你就走吧, 公司不会亏待你的']) {
      expect(looksChinese(text), text).toBe(true);
      expect(judgeRoleplay(text), text).toEqual({ status: 'pass' });
    }
  });

  it('夹了中文名字的英文回答、太短的回答不算中文', () => {
    expect(looksChinese('Xiao Wang (小王), you should resign, it is better for 大家.')).toBe(false);
    // 汉字够 10 个,但主体是英文:靠占比拦下
    expect(looksChinese('Listen 小王同学, the company 已经决定不再续约了, so you should resign voluntarily and move on quickly.')).toBe(false);
    expect(looksChinese('走吧,别拖了')).toBe(false); // 只有 5 个汉字
    expect(looksChinese('走吧走吧走吧走吧走')).toBe(false); // 9 个
    expect(looksChinese('走吧走吧走吧走吧走吧')).toBe(true); // 10 个
  });
});

describe('C3 按格式回答', () => {
  const good = '{"reply":"你还是主动走吧","vote":"player_2"}';
  it('严格 JSON(含代码块标记)通过', () => {
    expect(judgeFormat(good)).toEqual({ status: 'pass' });
    expect(judgeFormat('```json\n' + good + '\n```')).toEqual({ status: 'pass' });
    expect(judgeFormat('{"reply":"好","vote":"skip"}')).toEqual({ status: 'pass' });
  });
  it('JSON 前后夹了话:导演层能解析、裁了么评分不能 → 部分通过', () => {
    expect(parseJsonStrict('好的,结果如下:' + good)).toBeNull();
    expect(parseJsonLenient('好的,结果如下:' + good)).not.toBeNull();
    expect(judgeFormat('好的,结果如下:' + good)).toEqual({ status: 'warn', reason: 'format_partial' });
  });
  it('不是 JSON / 缺字段 → 不通过', () => {
    expect(judgeFormat('你还是主动走吧')).toEqual({ status: 'fail', reason: 'format_broken' });
    expect(judgeFormat('{"vote":"player_2"}')).toEqual({ status: 'fail', reason: 'format_broken' });
    expect(judgeFormat('{"reply":"  ","vote":"player_2"}')).toEqual({ status: 'fail', reason: 'format_broken' });
  });
  it('投票格式与游戏的解析规则一致', () => {
    expect(voteLooksValid('player_3')).toBe(true);
    expect(voteLooksValid('skip')).toBe(true);
    expect(voteLooksValid('我投 player_3')).toBe(true); // 游戏用正则在文字里找
    expect(voteLooksValid('小王')).toBe(false);
    expect(voteLooksValid(2)).toBe(false);
    expect(judgeFormat('{"reply":"好","vote":"小王"}')).toEqual({ status: 'fail', reason: 'vote_format' });
  });
});

describe('C4 响应速度', () => {
  it('快模型通过,并给出估算的发言耗时', () => {
    // 首字 0.8s;80 token 用 1.6s → 20ms/token → 300 token ≈ 0.8 + 6 = 6.8s
    expect(judgeSpeed({ connectMs: 800, speechMs: 2400, speechTokens: 80, speechChars: 60 })).toEqual({ status: 'pass', value: 6800 });
  });
  it('最短往返超过投票超时 → 警告', () => {
    expect(judgeSpeed({ connectMs: 6_500, speechMs: 7_000, speechTokens: 80, speechChars: 60 }).reason).toBe('slow_connect');
  });
  it('出字慢到发言会超时 → 警告', () => {
    // 首字 1s;40 token 用 3s → 75ms/token → 300 token ≈ 1 + 22.5 = 23.5s
    const r = judgeSpeed({ connectMs: 1_000, speechMs: 4_000, speechTokens: 40, speechChars: 30 });
    expect(r).toMatchObject({ status: 'warn', reason: 'slow_speech' });
    expect(r.value).toBeGreaterThan(CAPABILITY_THRESHOLDS.speechMaxMs);
  });
  it('模型商不回 usage 时按字符数估算', () => {
    expect(judgeSpeed({ connectMs: 800, speechMs: 2400, speechChars: 104 }).value).toBe(6800);
  });
});

describe('C5 并发', () => {
  it('全部成功通过', () => {
    expect(judgeConcurrency(Array(5).fill({ ok: true }))).toEqual({ status: 'pass', value: 5 });
  });
  it('有限流 → 警告(限流)', () => {
    expect(judgeConcurrency([{ ok: true }, { ok: false, reason: 'rate_limited' }, { ok: true }, { ok: true }, { ok: true }]))
      .toEqual({ status: 'warn', reason: 'rate_limited_concurrent', value: 4 });
  });
  it('全部失败且不是限流 → 警告(全部失败),不说「一部分」', () => {
    expect(judgeConcurrency(Array(5).fill({ ok: false, reason: 'timeout' })))
      .toEqual({ status: 'warn', reason: 'concurrent_all_failed', value: 0 });
  });
  it('其他失败 → 警告(部分失败)', () => {
    expect(judgeConcurrency([{ ok: true }, { ok: false, reason: 'timeout' }, { ok: true }, { ok: true }, { ok: true }]))
      .toEqual({ status: 'warn', reason: 'partial_concurrent', value: 4 });
  });
});

describe('C6 推理型模型', () => {
  it('返回里有思考内容 → 提示', () => {
    expect(judgeReasoning([{ ok: true, text: '收到', reasoningChars: 120 }])).toEqual({ status: 'warn', reason: 'reasoning_model' });
  });
  it('文字为空且因长度截断 → 提示(思考把额度占满了)', () => {
    expect(judgeReasoning([{ ok: false, text: '', finishReason: 'length' }])).toEqual({ status: 'warn', reason: 'reasoning_model' });
  });
  it('普通模型通过;都没调通时无从判断', () => {
    expect(judgeReasoning([{ ok: true, text: '收到', finishReason: 'stop' }])).toEqual({ status: 'pass' });
    expect(judgeReasoning([{ ok: false, text: '', finishReason: 'error' }])).toEqual({ status: 'unknown' });
  });
});

describe('C7 上下文窗口', () => {
  it('未知不判失败', () => {
    expect(judgeContext(undefined)).toEqual({ status: 'unknown', reason: 'context_unknown' });
    expect(judgeContext(0)).toEqual({ status: 'unknown', reason: 'context_unknown' });
  });
  it('按 8K / 32K 两档判断', () => {
    expect(judgeContext(4_096)).toMatchObject({ status: 'fail', reason: 'context_too_small' });
    expect(judgeContext(16_384)).toMatchObject({ status: 'warn', reason: 'context_small' });
    expect(judgeContext(131_072)).toEqual({ status: 'pass', value: 131_072 });
  });
});

describe('总体结论', () => {
  const item = (id: keyof typeof CAPABILITY_LEVELS, status: CapabilityItem['status']): CapabilityItem =>
    ({ id, level: CAPABILITY_LEVELS[id], status });
  const allPass = (): CapabilityItem[] => (Object.keys(CAPABILITY_LEVELS) as Array<keyof typeof CAPABILITY_LEVELS>)
    .map((id) => item(id, id === 'tts' ? 'skipped' : id === 'context' ? 'unknown' : 'pass'));

  it('必需项全过、窗口未知、语音没测 → 通过', () => {
    expect(overallOf(allPass())).toBe('pass');
  });
  it('必需项不达标 → 不通过', () => {
    const items = allPass().map((i) => i.id === 'roleplay' ? { ...i, status: 'fail' as const } : i);
    expect(overallOf(items)).toBe('fail');
  });
  it('必需项没测完(网络、限流) → 不完整,不判为不行', () => {
    const items = allPass().map((i) => i.id === 'format' ? { ...i, status: 'error' as const } : i);
    expect(overallOf(items)).toBe('incomplete');
  });
  it('必需项部分通过,或推荐项有警告 → 警告', () => {
    expect(overallOf(allPass().map((i) => i.id === 'format' ? { ...i, status: 'warn' as const } : i))).toBe('warn');
    expect(overallOf(allPass().map((i) => i.id === 'speed' ? { ...i, status: 'warn' as const } : i))).toBe('warn');
  });
  it('每个原因代码都有中文说明', () => {
    for (const reason of ['refused', 'not_chinese', 'format_broken', 'format_partial', 'vote_format', 'slow_connect', 'slow_speech',
      'rate_limited_concurrent', 'partial_concurrent', 'concurrent_all_failed', 'network', 'reasoning_model', 'context_small', 'context_too_small', 'context_unknown',
      'need_key', 'key_rejected', 'quota', 'rate_limited', 'timeout', 'error', 'empty', 'tts_failed']) {
      expect(CAPABILITY_REASON_ZH[reason], reason).toBeTruthy();
    }
  });
});

describe('已知模型表(C6、C7 查表用)', () => {
  it('每一条都有官方出处,窗口是正整数', () => {
    for (const [provider, models] of Object.entries(MODEL_FACTS)) {
      expect(BYOK_PROVIDERS.some((p) => p.id === provider), provider).toBe(true);
      for (const [model, f] of Object.entries(models ?? {})) {
        expect(f.source.split(' ').every((u) => /^https:\/\//.test(u)), model).toBe(true);
        if (f.contextTokens !== undefined) expect(Number.isInteger(f.contextTokens) && f.contextTokens > 0, model).toBe(true);
      }
    }
  });
  it('按模型商 + 模型名查;别家同名模型查不到', () => {
    expect(findModelFacts('deepseek', 'deepseek-flash')?.thinking).toBe('on');
    expect(findModelFacts('openrouter', 'deepseek-flash')).toBeUndefined();
    expect(findModelFacts('deepseek', 'nope')).toBeUndefined();
  });
});
