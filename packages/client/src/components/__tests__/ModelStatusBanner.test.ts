// @vitest-environment jsdom
/**
 * v6.169.5 — ModelStatusBanner 组件测试。
 * 注:仓库无 @testing-library/react,使用 react-dom/client 直接渲染。
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import React from 'react';

// ── mock useModelStatus ───────────────────────────────────────────────
let mockStatus = 'unconfigured';
// 横幅在场标记用真实实现(要断言它和提示条的配合),只替换 useModelStatus
vi.mock('../../utils/modelStatus', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../utils/modelStatus')>();
  return { ...real, useModelStatus: () => mockStatus };
});
const { isModelBannerShowing } = await import('../../utils/modelStatus');
vi.mock('../../utils/modelSetup', () => ({
  openModelSetup: vi.fn(),
  closeModelSetup: vi.fn(),
  useModelSetup: () => ({ open: false, reason: 'manual' }),
}));

// ── sessionStorage mock ───────────────────────────────────────────────
function makeMockSessionStorage(): Storage {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length; },
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mockStatus = 'unconfigured';
  vi.stubGlobal('sessionStorage', makeMockSessionStorage());
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

async function renderBanner(source = 'test') {
  const { default: ModelStatusBanner } = await import('../ModelStatusBanner');
  act(() => { root.render(React.createElement(ModelStatusBanner, { source })); });
}

describe('ModelStatusBanner', () => {
  it('unconfigured 状态时显示横幅', async () => {
    mockStatus = 'unconfigured';
    await renderBanner();
    expect(container.querySelector('[data-testid="model-status-banner"]')).toBeTruthy();
  });

  it('pass 状态时不显示横幅', async () => {
    mockStatus = 'pass';
    await renderBanner();
    expect(container.querySelector('[data-testid="model-status-banner"]')).toBeNull();
  });

  it('warn 状态时不显示横幅', async () => {
    mockStatus = 'warn';
    await renderBanner();
    expect(container.querySelector('[data-testid="model-status-banner"]')).toBeNull();
  });

  it('server 状态时不显示横幅', async () => {
    mockStatus = 'server';
    await renderBanner();
    expect(container.querySelector('[data-testid="model-status-banner"]')).toBeNull();
  });

  it('unchecked 状态时不显示横幅', async () => {
    mockStatus = 'unchecked';
    await renderBanner();
    expect(container.querySelector('[data-testid="model-status-banner"]')).toBeNull();
  });

  it('fail 状态(有 key、必需项不达标)不显示「还没有可用模型」横幅', async () => {
    mockStatus = 'fail';
    await renderBanner();
    expect(container.querySelector('[data-testid="model-status-banner"]')).toBeNull();
  });

  it('关闭按钮的读屏文字走翻译,不写死中文', async () => {
    mockStatus = 'unconfigured';
    await renderBanner();
    const label = container.querySelector('[data-testid="model-banner-close"]')?.getAttribute('aria-label');
    expect(label).toBeTruthy();
    expect(label).not.toBe('modelBanner.close'); // 键名本身说明没取到翻译
  });

  it('关闭后本标签页不再显示', async () => {
    mockStatus = 'unconfigured';
    await renderBanner();
    const closeBtn = container.querySelector('[data-testid="model-banner-close"]') as HTMLElement;
    expect(closeBtn).toBeTruthy();
    act(() => { closeBtn.click(); });
    // sessionStorage 应记录关闭状态
    expect(window.sessionStorage.getItem('office-zoo.modelBannerDismissed')).toBe('1');
    // 横幅消失
    expect(container.querySelector('[data-testid="model-status-banner"]')).toBeNull();
  });

  it('横幅在场时标记为显示中(提示条据此不再叠一条),撤下或卸载后清掉', async () => {
    mockStatus = 'unconfigured';
    await renderBanner('test');
    expect(isModelBannerShowing()).toBe(true);
    mockStatus = 'pass';
    await renderBanner('test2');
    expect(isModelBannerShowing()).toBe(false);
    mockStatus = 'unconfigured';
    await renderBanner('test3');
    expect(isModelBannerShowing()).toBe(true);
    await act(async () => { root.unmount(); });
    expect(isModelBannerShowing()).toBe(false);
    root = createRoot(container); // afterEach 还会卸载一次
  });
});
