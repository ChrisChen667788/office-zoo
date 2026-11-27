/**
 * ModelStatusBanner — v6.169.5 — 模型未配置时在页面顶部显示的横幅。
 *
 * 只有状态为 `unconfigured` 时才显示;其他状态不渲染任何内容。
 * 关闭记在 sessionStorage(本标签页内不再显示),刷新页面后恢复。
 * 文案走 i18n(zh/en/ja/ko)。
 */
import { useEffect, useState } from 'react';
import { markModelBannerShowing, useModelStatus } from '../utils/modelStatus';
import { openModelSetup } from '../utils/modelSetup';
import { useT } from '../utils/i18n';

const SESSION_KEY = 'office-zoo.modelBannerDismissed';

function readDismissed(): boolean {
  try { return window.sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
}

function writeDismissed(): void {
  try { window.sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* 静默 */ }
}

interface ModelStatusBannerProps {
  /** 来源标识,传给 openModelSetup,用于埋点追踪。 */
  source: string;
}

export default function ModelStatusBanner({ source }: ModelStatusBannerProps) {
  const status = useModelStatus();
  const { t } = useT();
  const [dismissed, setDismissed] = useState(() => readDismissed());
  const visible = status === 'unconfigured' && !dismissed;
  // 横幅在场时,ModelSetupHost 不再弹同义的「需要先配置 key」提示条
  useEffect(() => (visible ? markModelBannerShowing() : undefined), [visible]);

  // 只在 unconfigured 状态且未关闭时显示
  if (!visible) return null;

  const handleDismiss = () => {
    writeDismissed();
    setDismissed(true);
  };

  const handleCta = () => {
    openModelSetup('manual', source);
  };

  return (
    <div
      role="alert"
      data-testid="model-status-banner"
      className="w-full px-4 py-2.5 flex items-center gap-3 text-[13px]"
      style={{
        background: 'rgba(255,85,88,0.12)',
        borderBottom: '1px solid rgba(255,85,88,0.25)',
        color: 'rgba(255,200,200,0.95)',
      }}
    >
      <span className="flex-1">{t('modelBanner.unconfigured')}</span>
      <button
        type="button"
        onClick={handleCta}
        className="shrink-0 px-3 py-1 rounded-lg text-[12px] font-semibold"
        style={{
          background: 'rgba(255,85,88,0.22)',
          border: '1px solid rgba(255,85,88,0.45)',
          color: 'rgba(255,210,210,1)',
        }}
        data-testid="model-banner-cta"
      >
        {t('modelBanner.cta')}
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={t('modelBanner.close')}
        className="shrink-0 text-white/40 hover:text-white/70 text-lg leading-none"
        data-testid="model-banner-close"
      >
        ×
      </button>
    </div>
  );
}
