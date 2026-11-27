// @vitest-environment jsdom
/**
 * v6.169.5 — 首屏横幅在场时,不再叠一条同义的「需要先配置 key」提示条;横幅不在时照旧提示。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import React from 'react';

let bannerShowing = false;
vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }));
vi.mock('../../../hooks/useSocket', () => ({ getSocket: () => ({ on: () => {}, off: () => {} }) }));
vi.mock('../../../utils/analytics', () => ({ trackEvent: () => {} }));
vi.mock('../../../utils/modelStatus', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../utils/modelStatus')>();
  return { ...real, isModelBannerShowing: () => bannerShowing };
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  window.fetch = vi.fn(async () => new Response('{}')) as typeof fetch;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  document.body.removeChild(container);
});

async function mountAndEmit(issue: 'need_key_hint' | 'key_rejected') {
  vi.resetModules();
  const Host = (await import('../ModelSetupHost')).default;
  const { emitLlmIssue } = await import('../../../utils/byok');
  await act(async () => { root.render(React.createElement(Host)); });
  await act(async () => { emitLlmIssue(issue); });
  return container.querySelector('[data-testid="llm-issue-toast"]');
}

describe('ModelSetupHost 提示条与首屏横幅', () => {
  it('横幅在场:缺 key 的轻提示不再弹', async () => {
    bannerShowing = true;
    expect(await mountAndEmit('need_key_hint')).toBeNull();
  });
  it('横幅不在:缺 key 的轻提示照旧弹(对照)', async () => {
    bannerShowing = false;
    expect(await mountAndEmit('need_key_hint')).not.toBeNull();
  });
  it('横幅在场也不影响别的问题(key 被拒)照旧提示', async () => {
    bannerShowing = true;
    expect((await mountAndEmit('key_rejected'))?.textContent).toContain('被模型商拒绝');
  });
});
