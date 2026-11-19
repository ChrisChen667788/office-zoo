/**
 * AiNoticeBar — v6.164 — 全站常驻的 AI 生成内容声明(左下角小字)。
 *
 * 每个页面都有 AI 生成的发言 / 语音 / 形象,这条声明保证任何页面都有通用标识;具体输出
 * 区域另有 AiGeneratedBadge。pointer-events:none —— 绝不挡住下面的按钮。
 */
import { useT } from '../utils/i18n';

export default function AiNoticeBar() {
  const { t } = useT();
  return (
    <div
      className="fixed left-1.5 bottom-1.5 z-[60] rounded-full px-2 py-0.5 text-[10px] leading-4"
      style={{
        pointerEvents: 'none',
        background: 'rgba(5,5,16,0.62)',
        border: '1px solid rgba(255,255,255,0.14)',
        color: 'rgba(255,255,255,0.7)',
        backdropFilter: 'blur(6px)',
      }}
      role="note"
      aria-label={t('ai.notice')}
      data-ai-label="notice"
    >
      🤖 {t('ai.noticeShort')}
    </div>
  );
}
