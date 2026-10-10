/**
 * assetDirs — v6.165 — AI 生成的静态资产从哪里取、能不能现场生成。
 *
 *   runtime 目录:packages/server/public/<family>/  —— 本机生图脚本 / 懒生成写入的原图(gitignored)
 *   资产包目录:  packages/server/assets-pack/<family>/ —— 随仓库发布的压缩版(scripts/build-asset-pack.py)
 *
 * 读取顺序:runtime 优先(本机有原图就用原图),找不到再用资产包。
 * 托管模式(DEPLOY_PROFILE=hosted)禁止一切现场生图:服务器不持有模型 key(owner 决策:产品
 * 不提供模型 API),BYOK 之后懒生成还会花访客自己的钱去给所有人生成共享图——两种都不允许。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isHosted } from './deployProfile';

export const ASSET_FAMILIES = [
  'avatars',
  'icons',
  'talkshow-personas',
  'talkshow-personas-video',
  'archetype-portraits',
  'fired-hr-portraits',
] as const;
export type AssetFamily = (typeof ASSET_FAMILIES)[number];

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function runtimeAssetDir(family: AssetFamily): string {
  return path.join(SERVER_ROOT, 'public', family);
}

export function packAssetDir(family: AssetFamily): string {
  return path.join(SERVER_ROOT, 'assets-pack', family);
}

/** 文件名只允许 [A-Za-z0-9_-] + 扩展名,杜绝路径穿越。 */
export function isSafeAssetName(name: string): boolean {
  return /^[A-Za-z0-9_-]{1,80}\.[A-Za-z0-9]{2,5}$/.test(name);
}

/** 按目录顺序找第一个存在的文件;文件名不安全返回 null。纯函数,测试用临时目录驱动。 */
export function resolveIn(dirs: readonly string[], name: string): string | null {
  if (!isSafeAssetName(name)) return null;
  for (const dir of dirs) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** 多个目录里指定扩展名的文件名并集(去重、排序)。 */
export function listIn(dirs: readonly string[], ext: string): string[] {
  const names = new Set<string>();
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) if (f.endsWith(ext) && isSafeAssetName(f)) names.add(f);
  }
  return [...names].sort();
}

const searchDirs = (family: AssetFamily) => [runtimeAssetDir(family), packAssetDir(family)];

/** 解析到实际文件路径(runtime 优先,再资产包);不存在或文件名不安全返回 null。 */
export function resolveAssetFile(family: AssetFamily, name: string): string | null {
  return resolveIn(searchDirs(family), name);
}

export function hasAsset(family: AssetFamily, name: string): boolean {
  return resolveAssetFile(family, name) !== null;
}

/** runtime 与资产包的并集(去重),只列指定扩展名。 */
export function listAssetNames(family: AssetFamily, ext = '.png'): string[] {
  return listIn(searchDirs(family), ext);
}

/** 能不能现场调用生图 / 生视频接口。托管模式一律不能。 */
export function imageGenerationAllowed(): boolean {
  return !isHosted();
}
