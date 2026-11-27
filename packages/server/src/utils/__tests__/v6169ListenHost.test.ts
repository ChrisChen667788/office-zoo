/**
 * v6.169.5 — resolveListenHost 三种情况 + 忽略 HOST。
 */
import { describe, it, expect } from 'vitest';
import { resolveListenHost, isLoopbackAddress, keyExposureWarning } from '../listenHost';

describe('resolveListenHost', () => {
  it('FURBALL_HOST 非空:直接使用,不管 hosted 标志', () => {
    expect(resolveListenHost({ FURBALL_HOST: '0.0.0.0' } as NodeJS.ProcessEnv, false)).toBe('0.0.0.0');
    expect(resolveListenHost({ FURBALL_HOST: '0.0.0.0' } as NodeJS.ProcessEnv, true)).toBe('0.0.0.0');
    expect(resolveListenHost({ FURBALL_HOST: '192.168.1.1' } as NodeJS.ProcessEnv, false)).toBe('192.168.1.1');
  });

  it('托管模式(hosted=true)且没有 FURBALL_HOST → undefined(监听所有网卡)', () => {
    expect(resolveListenHost({} as NodeJS.ProcessEnv, true)).toBeUndefined();
    expect(resolveListenHost({ HOST: 'my-machine' } as NodeJS.ProcessEnv, true)).toBeUndefined();
  });

  it('本机模式(hosted=false)且没有 FURBALL_HOST → 127.0.0.1', () => {
    expect(resolveListenHost({} as NodeJS.ProcessEnv, false)).toBe('127.0.0.1');
    expect(resolveListenHost({ HOST: 'my-machine' } as NodeJS.ProcessEnv, false)).toBe('127.0.0.1');
  });

  it('完全忽略 HOST 变量(zsh 会把机器名放进去)', () => {
    // HOST 里有任意值都不影响结果
    const withHost = { HOST: 'some-macbook.local' } as NodeJS.ProcessEnv;
    expect(resolveListenHost(withHost, false)).toBe('127.0.0.1');
    expect(resolveListenHost(withHost, true)).toBeUndefined();
  });

  it('FURBALL_HOST 为空字符串/空白:视为没设置', () => {
    expect(resolveListenHost({ FURBALL_HOST: '' } as NodeJS.ProcessEnv, false)).toBe('127.0.0.1');
    expect(resolveListenHost({ FURBALL_HOST: '   ' } as NodeJS.ProcessEnv, false)).toBe('127.0.0.1');
  });
});

describe('isLoopbackAddress', () => {
  it('127.0.0.1 / ::1 / localhost 是回环地址', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('::1')).toBe(true);
    expect(isLoopbackAddress('localhost')).toBe(true);
  });

  it('undefined / 0.0.0.0 / 其他不是回环地址', () => {
    expect(isLoopbackAddress(undefined)).toBe(false);
    expect(isLoopbackAddress('0.0.0.0')).toBe(false);
    expect(isLoopbackAddress('192.168.1.1')).toBe(false);
  });

  it('FURBALL_HOST 合法:IPv4、IPv6、主机名都接受', () => {
    for (const v of ['0.0.0.0', '192.168.1.20', '::', '::1', 'localhost', 'my-box.local']) {
      expect(resolveListenHost({ FURBALL_HOST: v } as NodeJS.ProcessEnv, false), v).toBe(v);
    }
  });

  it('FURBALL_HOST 填错(带空格、端口、协议)时启动直接报错,并点名变量', () => {
    for (const v of ['my laptop', '0.0.0.0:3100', 'http://0.0.0.0', '-bad-', 'a..b']) {
      expect(() => resolveListenHost({ FURBALL_HOST: v } as NodeJS.ProcessEnv, false), v).toThrow(/FURBALL_HOST/);
    }
  });

  it('启动警告:本机开局域网 + .env key → 建议去掉 FURBALL_HOST;托管 + LLM_KEY_MODE=server → 建议去掉 LLM_KEY_MODE,不建议改监听地址', () => {
    const lan = keyExposureWarning({ listenHost: '0.0.0.0', hosted: false, keyMode: 'server', serverChatAvailable: true });
    expect(lan).toContain('局域网');
    expect(lan).toContain('FURBALL_HOST');
    const hosted = keyExposureWarning({ listenHost: undefined, hosted: true, keyMode: 'server', serverChatAvailable: true });
    expect(hosted).toContain('LLM_KEY_MODE');
    expect(hosted).not.toContain('127.0.0.1'); // 托管改监听地址等于下线
  });

  it('启动警告:只在回环以外 + server 模式 + 有 key 时出现', () => {
    const base = { listenHost: '0.0.0.0', hosted: false, keyMode: 'server' as const, serverChatAvailable: true };
    expect(keyExposureWarning({ ...base, listenHost: '127.0.0.1' })).toBeNull();
    expect(keyExposureWarning({ ...base, keyMode: 'byok' })).toBeNull();
    expect(keyExposureWarning({ ...base, serverChatAvailable: false })).toBeNull();
    expect(keyExposureWarning({ ...base, hosted: true, listenHost: undefined, keyMode: 'byok' })).toBeNull(); // 托管默认
  });
});
