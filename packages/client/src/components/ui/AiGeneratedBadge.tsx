/**
 * AiGeneratedBadge — v6.164 — 「AI 生成」小角标,贴在 AI 输出(发言区、语音、立绘)旁边。
 * 依据《人工智能生成合成内容标识办法》:在交互界面或内容周边添加显著的提示标识。
 */
import { useT } from '../../utils/i18n';

export default function AiGeneratedBadge({ className = '', tone = 'light' }: { className?: string; tone?: 'light' | 'dark' }) {
  const { t } = useT();
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-[1px] text-[10px] font-bold tracking-normal normal-case align-middle select-none ${className}`}
      style={{
        background: tone === 'light' ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.55)',
        border: '1px solid rgba(255,255,255,0.28)',
        color: 'rgba(255,255,255,0.85)',
        letterSpacing: 0,
      }}
      title={t('ai.notice')}
      data-ai-label="badge"
    >
      {t('ai.label')}
    </span>
  );
}
