/**
 * v6.164 — AI 生成标识组件:四种语言都有文案;全站声明不拦截点击。
 */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AiNoticeBar from '../AiNoticeBar';
import AiGeneratedBadge from '../ui/AiGeneratedBadge';
import { setLocale } from '../../utils/i18n';

describe('AI 生成标识', () => {
  it('全站声明:pointer-events:none,不挡住下面的按钮;中文文案', () => {
    setLocale('zh-CN');
    const html = renderToStaticMarkup(createElement(AiNoticeBar));
    expect(html).toContain('pointer-events:none');
    expect(html).toContain('AI 生成内容');
    expect(html).toContain('data-ai-label="notice"');
  });

  it('角标:四种语言都有译文(不会回落成 key)', () => {
    const expected = { 'zh-CN': 'AI 生成', 'en-US': 'AI-generated', 'ja-JP': 'AI生成', 'ko-KR': 'AI 생성' } as const;
    for (const [loc, text] of Object.entries(expected)) {
      setLocale(loc as keyof typeof expected);
      const html = renderToStaticMarkup(createElement(AiGeneratedBadge));
      expect(html, loc).toContain(`>${text}<`);
      expect(html).not.toContain('ai.label');
    }
    setLocale('zh-CN');
  });
});
