/**
 * redact — v6.163 — 写日志 / 回错误信息前,把可能夹带的密钥打码。
 *
 * 上游模型商的错误信息有时会回显部分 key(例如 "Incorrect API key provided: sk-abc…"),
 * BYOK 之后这些 key 属于访客,绝不能进日志或回给别人。规则偏保守:宁可多打码。
 */
const PATTERNS: RegExp[] = [
  /\b(sk|pk|rk|ak|mpg|ms|re|whsec|price)[-_][A-Za-z0-9_\-]{8,}/gi, // 常见前缀式 key
  /\bBearer\s+[A-Za-z0-9._\-~+/]{8,}=*/gi,                        // Authorization 头
  /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{5,}/g, // JWT
  /\b[A-Fa-f0-9]{32,}\b/g,                                          // 长十六进制串
  /\b[A-Za-z0-9_\-]{40,}\b/g,                                       // 其他超长无空格串
];

/**
 * v6.167 — 当前请求里访客的 key 原文(由 aiClient 注册)。正则只认常见格式,
 * 像火山方舟那种 36 位 UUID 式 key 一条都匹配不上;拿原文逐字替换才稳。
 */
let secretSource: () => Array<string | undefined> = () => [];
export function setSecretSource(fn: () => Array<string | undefined>): void {
  secretSource = fn;
}

export function redactSecrets(input: string): string {
  let out = input;
  for (const secret of secretSource()) {
    if (secret && secret.length >= 8) out = out.split(secret).join(`${secret.slice(0, 3)}…[redacted]`);
  }
  for (const re of PATTERNS) out = out.replace(re, (m) => `${m.slice(0, 3)}…[redacted]`);
  return out;
}

/** 截断 + 打码,给日志用。 */
export function safeErrorText(err: unknown, max = 200): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  return redactSecrets(raw).slice(0, max);
}
