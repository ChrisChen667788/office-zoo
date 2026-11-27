/**
 * listenHost — v6.169.5 — 决定服务器监听哪个地址。
 *
 * 背景:zsh 会把机器名设置到 HOST 环境变量上,如果用 HOST 来控制绑定地址,会导致
 * 服务器绑定到机器名而不是预期地址。因此只用 FURBALL_HOST 变量,绝不读 HOST。
 *
 * 决策树:
 *   FURBALL_HOST 非空 → 用它(用户明确指定)
 *   托管模式 → undefined(监听所有网卡,让容器/反向代理决定)
 *   本机模式 → '127.0.0.1'(只监听本机回环,不暴露给局域网)
 *
 * 局域网攒局:本机模式下设置 FURBALL_HOST=0.0.0.0 可以监听所有网卡。
 */

import { isIP } from 'node:net';

/** 主机名:字母数字和连字符组成的若干段,用点隔开(localhost、my-box.local)。 */
const HOSTNAME_RE = /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;

/** FURBALL_HOST 非空时对应的 `serve()`/`listen()` hostname 参数。值不是 IP 也不是主机名时直接报错退出。 */
export function resolveListenHost(
  env: NodeJS.ProcessEnv,
  hosted: boolean,
): string | undefined {
  // 显式配置优先 — 注意:绝不读 HOST,那是 zsh 机器名
  const explicit = env['FURBALL_HOST']?.trim();
  if (explicit) {
    // 填错时(带空格、带端口、带 http://)让启动直接失败并说清是哪个变量,而不是在 Node 绑定端口时报一串看不懂的错。
    if (isIP(explicit) === 0 && !HOSTNAME_RE.test(explicit)) {
      throw new Error(`FURBALL_HOST=${JSON.stringify(explicit)} 不是合法的监听地址:应为 IP(如 0.0.0.0、127.0.0.1、::)或主机名,不要带端口和 http://`);
    }
    return explicit;
  }

  // 托管模式:监听所有网卡(让容器/反向代理决定),undefined 表示 Hono/Node.js 默认行为
  if (hosted) return undefined;

  // 本机模式:只监听回环地址,不暴露给局域网
  return '127.0.0.1';
}

/** 给定地址是否是回环地址。 */
export function isLoopbackAddress(host: string | undefined): boolean {
  if (!host) return false; // undefined = 监听所有网卡,不是回环
  const h = host.toLowerCase();
  return h === '127.0.0.1' || h === '::1' || h === 'localhost';
}

/**
 * 启动时要不要警告「别人能用你 .env 里的 key」,以及怎么建议。没有风险返回 null。
 *   本机模式开了局域网监听:同一网络的人能用 → 建议不需要攒局时设回 127.0.0.1
 *   托管模式又显式设了 LLM_KEY_MODE=server:公网所有访问者都能用 → 建议去掉这个设置(托管不能改监听地址,改了就没人访问得到)
 */
export function keyExposureWarning(opts: {
  listenHost: string | undefined;
  hosted: boolean;
  keyMode: 'server' | 'byok';
  serverChatAvailable: boolean;
}): string | null {
  if (isLoopbackAddress(opts.listenHost) || opts.keyMode !== 'server' || !opts.serverChatAvailable) return null;
  return opts.hosted
    ? '⚠ 托管模式设了 LLM_KEY_MODE=server,且 .env 里配有模型 key — 公网上所有访问者都会用你的 key。不想这样就去掉 LLM_KEY_MODE(托管默认让访客自带 key)。'
    : '⚠ 服务器正在非回环地址监听,且 .env 里配有模型 key — 同一局域网的人能用你的 key。如不需要局域网攒局,去掉 FURBALL_HOST 或设成 127.0.0.1。';
}
