/**
 * v6.165 — 资产随仓库预置 + 托管模式不生图。
 *
 *  1. 覆盖面(消费方校验):服务端注册的每个图标 / 角色头像 / 人格立绘 / HR 立绘,前端引用的
 *     每个 /icons/<key>.png,资产包里都要有——托管版不生图,缺一张就静默变 emoji。
 *  2. 解析顺序:本机原图优先,再资产包;文件名不安全一律拒绝。
 *  3. hosted:有缓存照常返回(缺图时不生图的分支在 v6165HostedNoGen.test.ts,用 mock,不动真实文件)。
 *  4. 静态下发:按文件头给 Content-Type(资产包里 .png 名的 JPEG),支持 Range(Safari 播 mp4)。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { isSafeAssetName, listIn, packAssetDir, resolveAssetFile, resolveIn, imageGenerationAllowed } from '../assetDirs';
import { parseRange, serveAssetFile, sniffContentType } from '../staticAssets';
import { ICON_DETAILS } from '../../services/iconGen';
import { ROLE_ART_DETAILS, generateAvatar } from '../../services/imageGen';
import { ARCHETYPE_IDS_WITH_ART } from '../../services/archetypeAvatarGen';
import { FIRED_HR_IDS } from '../../services/firedHrPortraitGen';
import * as clientIcons from '../../../../client/src/constants/icons';

afterEach(() => { delete process.env.DEPLOY_PROFILE; vi.restoreAllMocks(); });

const inPack = (family: Parameters<typeof packAssetDir>[0], name: string) =>
  fs.existsSync(path.join(packAssetDir(family), name));

describe('资产包覆盖面', () => {
  it('服务端注册的图标全部在资产包里', () => {
    const missing = Object.keys(ICON_DETAILS).filter((k) => !inPack('icons', `${k}.png`));
    expect(missing).toEqual([]);
  });

  it('前端引用的每个 /icons/<key>.png 都在资产包里', () => {
    const urls = new Set<string>();
    const walk = (v: unknown) => {
      if (typeof v === 'string' && v.startsWith('/icons/')) urls.add(v);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    Object.values(clientIcons).forEach(walk);
    // 表情立绘按名字稳定选 3 选 1:多试几个名字把三张都覆盖到
    const expr = (clientIcons as { expressionIcon?: (k: 'kill' | 'vote', n: string) => string }).expressionIcon;
    for (const name of ['Tony', 'Helen', 'Mia', 'Leo', 'Bob', 'Amy', 'Ken', 'Zoe', 'Ray', 'Ivy']) {
      if (expr) { urls.add(expr('kill', name)); urls.add(expr('vote', name)); }
    }
    expect(urls.size).toBeGreaterThan(20);
    const missing = [...urls].filter((u) => !inPack('icons', u.slice('/icons/'.length)));
    expect(missing).toEqual([]);
  });

  it('角色头像 / 人格立绘 / HR 立绘全部在资产包里', () => {
    expect(Object.keys(ROLE_ART_DETAILS).filter((r) => !inPack('avatars', `${r}.png`))).toEqual([]);
    expect(ARCHETYPE_IDS_WITH_ART.filter((a) => !inPack('archetype-portraits', `${a}.png`))).toEqual([]);
    expect(FIRED_HR_IDS.filter((h) => !inPack('fired-hr-portraits', `${h}.png`))).toEqual([]);
  });

  it('资产包体积 < 15MB(压缩过,不是原图)', () => {
    let total = 0;
    for (const fam of ['icons', 'avatars', 'archetype-portraits', 'fired-hr-portraits'] as const) {
      for (const f of fs.readdirSync(packAssetDir(fam))) total += fs.statSync(path.join(packAssetDir(fam), f)).size;
    }
    expect(total).toBeLessThan(15 * 1024 * 1024);
  });
});

describe('资产解析', () => {
  it('不安全的文件名一律拒绝', () => {
    for (const bad of ['../x.png', 'a/b.png', '..', 'x', '.png', 'a b.png', 'x.png/']) {
      expect(isSafeAssetName(bad), bad).toBe(false);
      expect(resolveAssetFile('icons', bad)).toBeNull();
    }
    expect(isSafeAssetName('mode_fired.png')).toBe(true);
  });

  it('本机原图优先,没有再用资产包;列表取并集(只在临时目录里操作)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-dirs-'));
    const runtime = path.join(root, 'runtime');
    const pack = path.join(root, 'pack');
    fs.mkdirSync(runtime);
    fs.mkdirSync(pack);
    try {
      fs.writeFileSync(path.join(pack, 'a.png'), 'pack');
      fs.writeFileSync(path.join(pack, 'b.png'), 'pack');
      expect(resolveIn([runtime, pack], 'a.png')).toBe(path.join(pack, 'a.png'));
      fs.writeFileSync(path.join(runtime, 'a.png'), 'runtime');
      expect(resolveIn([runtime, pack], 'a.png')).toBe(path.join(runtime, 'a.png'));
      expect(resolveIn([runtime, pack], 'c.png')).toBeNull();
      expect(listIn([runtime, pack], '.png')).toEqual(['a.png', 'b.png']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('hosted 不现场生图', () => {
  it('imageGenerationAllowed 跟随部署形态', () => {
    expect(imageGenerationAllowed()).toBe(true);
    process.env.DEPLOY_PROFILE = 'hosted';
    expect(imageGenerationAllowed()).toBe(false);
  });

  it('有缓存照常返回 URL(资产包命中,不发请求)', async () => {
    process.env.DEPLOY_PROFILE = 'hosted';
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const role = Object.keys(ROLE_ART_DETAILS)[0];
    expect(await generateAvatar(role)).toBe(`/avatars/${role}.png`);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('静态下发', () => {
  it('按文件头识别类型(.png 名的 JPEG、mp4)', () => {
    expect(sniffContentType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffContentType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(sniffContentType(Uint8Array.from([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70]))).toBe('video/mp4');
  });

  it('parseRange 各种写法与越界', () => {
    expect(parseRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=0-999', 100)).toEqual({ start: 0, end: 99 });
    expect(parseRange('bytes=100-', 100)).toBeNull();
    expect(parseRange('bytes=5-2', 100)).toBeNull();
    expect(parseRange('items=0-1', 100)).toBeNull();
    expect(parseRange(undefined, 100)).toBeNull();
  });

  it('资产包里的立绘:200 + image/jpeg;Range → 206 + Content-Range;不存在 → 404', async () => {
    const id = ARCHETYPE_IDS_WITH_ART[0];
    const full = serveAssetFile('archetype-portraits', `${id}.png`);
    expect(full.status).toBe(200);
    expect(full.headers.get('content-type')).toMatch(/^image\/(jpeg|png)$/);
    const size = Number(full.headers.get('content-length'));
    expect((await full.arrayBuffer()).byteLength).toBe(size);
    const part = serveAssetFile('archetype-portraits', `${id}.png`, 'bytes=0-99');
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe(`bytes 0-99/${size}`);
    expect((await part.arrayBuffer()).byteLength).toBe(100);
    expect(serveAssetFile('archetype-portraits', 'nope.png').status).toBe(404);
    expect(serveAssetFile('archetype-portraits', '../../package.json').status).toBe(404);
  });
});
