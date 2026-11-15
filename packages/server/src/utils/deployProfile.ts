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

/**
 * v6.169 — Socket.IO 是否与 HTTP 共用一个端口。
 *   SINGLE_PORT=1/0 显式指定时照办;否则:托管形态,或由本服务器托管前端构建产物时,用单端口。
 * 生产构建的前端连的是「页面所在的同一个地址」(见前端 resolveSocketUrl),所以只要页面由本服务器
 * 提供,Socket.IO 就得在同一个端口上 —— 此前本机 `SERVE_CLIENT_DIR=…` 不带 SINGLE_PORT 时页面在 3100、
 * Socket.IO 在 3101,对局永远连不上。本机 `npm run dev`(vite 5173 代理)不托管前端,仍是双端口。
 */
export function resolveSinglePort(raw: string | undefined, hosted: boolean, servesClient: boolean): boolean {
  const v = raw?.trim();
  if (v === '1' || v === 'true') return true;
  if (v === '0' || v === 'false') return false;
  return hosted || servesClient;
}
