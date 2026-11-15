/**
 * v6.165 — hosted 下缺图时绝不现场生图。
 *
 * 「缺图」用 mock 模拟(hasAsset → false),不去移动任何真实文件——之前一版测试为了制造缺图
 * 把本机原图挪走,两个文件撞了同一个临时名,差点丢掉开发者的原图。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../assetDirs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assetDirs')>()),
  hasAsset: () => false,
}));

const { generateAvatar, ROLE_ART_DETAILS } = await import('../../services/imageGen');
const { generateArchetypePortrait, ARCHETYPE_IDS_WITH_ART } = await import('../../services/archetypeAvatarGen');
const { generateFiredHrPortrait, FIRED_HR_IDS } = await import('../../services/firedHrPortraitGen');
const { generateIcon, ICON_DETAILS } = await import('../../services/iconGen');
const { quizRoutes } = await import('../../routes/quiz');

afterEach(() => { delete process.env.DEPLOY_PROFILE; vi.restoreAllMocks(); });

describe('hosted 缺图不生图', () => {
  it('四类生图函数都直接返回 null,不发任何网络请求', async () => {
    process.env.DEPLOY_PROFILE = 'hosted';
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await generateAvatar(Object.keys(ROLE_ART_DETAILS)[0])).toBeNull();
    expect(await generateArchetypePortrait(ARCHETYPE_IDS_WITH_ART[0])).toBeNull();
    expect(await generateFiredHrPortrait(FIRED_HR_IDS[0])).toBeNull();
    expect(await generateIcon(Object.keys(ICON_DETAILS)[0])).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('quiz 懒生成:hosted 直接告诉前端别等(generation_disabled),不启动生成', async () => {
    process.env.DEPLOY_PROFILE = 'hosted';
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await quizRoutes.request(`/archetype-portrait/${ARCHETYPE_IDS_WITH_ART[0]}`);
    expect(await res.json()).toEqual({ ready: false, generating: false, error: 'generation_disabled' });
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
