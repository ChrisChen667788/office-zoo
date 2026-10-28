/**
 * deployProfile — v6.162 — 本机自部署(local)和公网托管(hosted)的行为差异集中在这里。
 *
 *   DEPLOY_PROFILE=local   (默认)本机开发 / 自部署:行为与 v6.160 一致
 *   DEPLOY_PROFILE=hosted  公网托管:同源 + 白名单 CORS、信任一层反向代理的 X-Forwarded-For、
 *                          不在启动时生图(服务器没有 key)、模型调用一律 BYOK……
 *
 * 每个开关都按调用时读取环境变量,测试里改 process.env 立即生效。
 */

export type DeployProfile = 'local' | 'hosted';

export function deployProfile(): DeployProfile {
  return process.env.DEPLOY_PROFILE?.trim().toLowerCase() === 'hosted' ? 'hosted' : 'local';
}

export function isHosted(): boolean {
  return deployProfile() === 'hosted';
}

/** 读非负整数环境变量;没设置或不合法时用 fallback。 */
export function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}
