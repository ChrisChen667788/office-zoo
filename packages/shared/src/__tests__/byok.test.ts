/**
 * v6.167 — BYOK 凭据格式:严格校验(不可信输入)+ 编解码往返。
 */
import { describe, it, expect } from 'vitest';
import {
  BYOK_MAX_ENCODED, BYOK_PROVIDERS, decodeByok, encodeByok, findProvider, maskKey, resolveBaseURL, validateByok,
  type ByokConfig,
} from '../byok';

const good: ByokConfig = { v: 1, provider: 'deepseek', apiKey: 'sk-test-0123456789abcdef', model: 'deepseek-flash' };

describe('validateByok', () => {
  it('合法配置通过,只保留白名单字段', () => {
    const r = validateByok({ ...good, extra: 'x', baseURL: 'https://evil.example' });
    expect(r).toEqual({ ok: true, config: good }); // 非 custom 时 baseURL 被丢弃,不能借预设改地址
  });

  it('逐项拒绝(每条只放一个缺陷)', () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ ...good, v: 2 }, 'bad_version'],
      [{ ...good, provider: 'nope' }, 'bad_provider'],
      [{ ...good, apiKey: 'short' }, 'bad_key'],
      [{ ...good, apiKey: 'sk-has space-0123456789' }, 'bad_key'],
      [{ ...good, apiKey: 'sk-中文-0123456789' }, 'bad_key'],
      [{ ...good, model: 'a b' }, 'bad_model'],
      [{ ...good, model: '' }, 'bad_model'],
      [{ ...good, fastModel: 'x y' }, 'bad_fast_model'],
      [{ ...good, provider: 'custom' }, 'bad_base_url'],
      [{ ...good, provider: 'custom', baseURL: 'ftp://x.example/v1' }, 'bad_base_url'],
      [{ ...good, provider: 'custom', baseURL: 'https://user:pass@x.example/v1' }, 'bad_base_url'],
      [{ ...good, tts: { mode: 'loud' } }, 'bad_tts'],
      [{ ...good, tts: { mode: 'minimax' } }, 'bad_tts_key'],
      [{ ...good, tts: { mode: 'minimax', minimaxKey: 'sk-0123456789', minimaxGroupId: 'abc' } }, 'bad_tts_group'],
      [{ ...good, tts: { mode: 'provider' } }, 'provider_has_no_tts'], // DeepSeek 没有语音接口
    ];
    for (const [input, err] of cases) expect(validateByok(input), err).toEqual({ ok: false, error: err });
  });

  it('custom 地址规范化(去尾斜杠);模型商语音只在有语音接口的预设上可选', () => {
    const r = validateByok({ ...good, provider: 'custom', baseURL: 'https://llm.example.com/v1/' });
    expect(r.ok && r.config.baseURL).toBe('https://llm.example.com/v1');
    expect(validateByok({ ...good, provider: 'siliconflow', model: 'Qwen/Qwen3-8B', tts: { mode: 'provider' } }).ok).toBe(true);
  });
});

describe('encode / decode', () => {
  it('往返一致', () => {
    const cfg: ByokConfig = { ...good, fastModel: 'deepseek-flash', tts: { mode: 'minimax', minimaxKey: 'mm-0123456789', minimaxGroupId: '123' } };
    expect(decodeByok(encodeByok(cfg))).toEqual(cfg);
  });

  it('不可信输入一律 null:非字符串 / 超长 / 非 base64url / 非 JSON / 校验不过', () => {
    expect(decodeByok(undefined)).toBeNull();
    expect(decodeByok(123)).toBeNull();
    expect(decodeByok('a'.repeat(BYOK_MAX_ENCODED + 1))).toBeNull();
    expect(decodeByok('abc+/==')).toBeNull();
    expect(decodeByok(encodeByok({ ...good, provider: 'nope' } as unknown as ByokConfig))).toBeNull();
    expect(decodeByok('bm90LWpzb24')).toBeNull(); // "not-json"
  });
});

describe('presets', () => {
  it('每个预设(custom 除外)都有 https base URL、出处与 key 页面;id 唯一', () => {
    const ids = BYOK_PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of BYOK_PROVIDERS.filter((x) => x.id !== 'custom')) {
      expect(p.baseURL, p.id).toMatch(/^https:\/\/[^/]+/);
      expect(p.docsUrl, p.id).toMatch(/^https:\/\//);
      expect(p.keyUrl, p.id).toMatch(/^https:\/\//);
      expect(p.maxTemperature).toBeGreaterThan(0);
    }
    expect(resolveBaseURL(good)).toBe(findProvider('deepseek')!.baseURL);
  });

  it('maskKey 只露首尾', () => {
    expect(maskKey('sk-test-0123456789abcdef')).toBe('sk-…cdef');
    expect(maskKey('abc')).toBe('•••');
  });
});
