/**
 * v6.157 — 日本ブラック企業黑話词典
 *
 * 每条带一句英文释义,便于 prompt 说明文化语境。
 * 15+ 条,覆盖ブラック企業/过劳/年功/社畜文化。
 */

export interface JaJargonItem {
  term: string;
  gloss: string; // one-line English explanation
}

export const JARGON_JA: JaJargonItem[] = [
  { term: 'ブラック企業',     gloss: 'black company — overworks / exploits employees' },
  { term: 'サービス残業',     gloss: 'unpaid overtime — "service" overtime the company doesn\'t pay for' },
  { term: '上司ガチャ',       gloss: 'boss lottery — whether you get a decent manager is pure luck' },
  { term: '年功序列',         gloss: 'seniority system — promotions based on years served, not merit' },
  { term: '飲みニケーション', gloss: 'drinking communication — mandatory after-work drinking as "team bonding"' },
  { term: 'パワハラ',         gloss: 'power harassment — workplace bullying by those with authority' },
  { term: '窓際族',           gloss: 'window-seat tribe — employees sidelined to do nothing, waiting to quit' },
  { term: '忖度',             gloss: 'reading the room to please superiors without being explicitly told' },
  { term: '社畜',             gloss: 'corporate livestock — someone completely enslaved by their company' },
  { term: '定時退社',         gloss: 'leaving on time — frowned upon; seen as not dedicated' },
  { term: 'KY',               gloss: 'can\'t read the room (空気読めない — kuuki yomenai)' },
  { term: '報連相',           gloss: 'hou-ren-sou: report, contact, consult — the holy trinity of Japanese workplace communication' },
  { term: 'マタハラ',         gloss: 'maternity harassment — discrimination against pregnant employees' },
  { term: '追い出し部屋',     gloss: 'chasing-out room — a dead-end department designed to make employees quit' },
  { term: '名ばかり管理職',   gloss: 'manager in name only — given a title to avoid paying overtime' },
  { term: 'やりがい搾取',     gloss: 'passion exploitation — paid low because "you love the work, right?"' },
  { term: '終身雇用',         gloss: 'lifetime employment — the disappearing promise of working one place forever' },
];

/** 随机取若干条日文职场黑话 */
export function sampleJargonJa(count: number): JaJargonItem[] {
  const shuffled = [...JARGON_JA].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
