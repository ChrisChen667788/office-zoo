/**
 * v6.156 — gameLocaleFromUiLocale 单元测试
 *
 * 覆盖:
 *   - zh/en/ja/ko 各主要 BCP-47 变体
 *   - 未知 locale 兜底 → 'zh'
 */

import { describe, it, expect } from 'vitest';
import { gameLocaleFromUiLocale } from '../utils/locale';

describe('gameLocaleFromUiLocale', () => {
  it('zh-CN → zh', () => expect(gameLocaleFromUiLocale('zh-CN')).toBe('zh'));
  it('zh-TW → zh', () => expect(gameLocaleFromUiLocale('zh-TW')).toBe('zh'));
  it('ZH-cn (大写) → zh', () => expect(gameLocaleFromUiLocale('ZH-CN')).toBe('zh'));
  it('en-US → en', () => expect(gameLocaleFromUiLocale('en-US')).toBe('en'));
  it('en-GB → en', () => expect(gameLocaleFromUiLocale('en-GB')).toBe('en'));
  it('EN-US (大写) → en', () => expect(gameLocaleFromUiLocale('EN-US')).toBe('en'));
  it('ja-JP → ja', () => expect(gameLocaleFromUiLocale('ja-JP')).toBe('ja'));
  it('ja → ja', () => expect(gameLocaleFromUiLocale('ja')).toBe('ja'));
  it('JA-JP (大写) → ja', () => expect(gameLocaleFromUiLocale('JA-JP')).toBe('ja'));
  it('ko-KR → ko', () => expect(gameLocaleFromUiLocale('ko-KR')).toBe('ko'));
  it('ko → ko', () => expect(gameLocaleFromUiLocale('ko')).toBe('ko'));
  it('KO-KR (大写) → ko', () => expect(gameLocaleFromUiLocale('KO-KR')).toBe('ko'));
  it('fr-FR → zh (兜底)', () => expect(gameLocaleFromUiLocale('fr-FR')).toBe('zh'));
  it('de → zh (兜底)', () => expect(gameLocaleFromUiLocale('de')).toBe('zh'));
  it('空字符串 → zh (兜底)', () => expect(gameLocaleFromUiLocale('')).toBe('zh'));
  it('pt-BR → zh (兜底)', () => expect(gameLocaleFromUiLocale('pt-BR')).toBe('zh'));
});
