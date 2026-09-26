/**
 * v6.157 — 한국 갑질 직장 블랙 사전
 *
 * 每条带一句英文释义,便于 prompt 说明文化语境。
 * 15+ 条,覆盖갑질/야근/꼰대/회식文化。
 */

export interface KoJargonItem {
  term: string;
  gloss: string; // one-line English explanation
}

export const JARGON_KO: KoJargonItem[] = [
  { term: '갑질',     gloss: 'gapjil — abuse of power by those in a superior position (the "gap" side of a contract)' },
  { term: '야근',     gloss: 'late-night overtime — staying at the office well past normal hours' },
  { term: '칼퇴',     gloss: 'knife-leaving — leaving work exactly on time (seen as disloyal)' },
  { term: '꼰대',     gloss: 'kkondae — an old-school authoritarian who expects blind deference' },
  { term: '회식',     gloss: 'hwesik — mandatory company dinner / drinking session' },
  { term: '연봉협상', gloss: 'salary negotiation — the annual ritual where you beg for what you deserve' },
  { term: '퇴사각',   gloss: 'resignation angle — the moment you start seriously planning to quit' },
  { term: '눈치',     gloss: 'nunchi — the ability to read the social situation and act accordingly' },
  { term: '라떼는',   gloss: 'latte-neun ("back in my day...") — the kkondae\'s favorite opening' },
  { term: '월급루팡', gloss: 'salary Lupin — an employee who steals a paycheck by doing nothing' },
  { term: '사내정치', gloss: 'office politics — navigating power dynamics to survive the hierarchy' },
  { term: '업무강도', gloss: 'work intensity — how brutal the workload is' },
  { term: '직장내괴롭힘', gloss: 'workplace bullying — legally recognized form of abuse in Korean workplaces' },
  { term: '수직적문화', gloss: 'vertical culture — rigid top-down hierarchy where rank determines everything' },
  { term: '성과급',   gloss: 'performance bonus — the carrot dangled to justify the unreasonable workload' },
  { term: '번아웃',   gloss: 'burnout — emotional and physical exhaustion from overwork' },
];

/** 随机取若干条韩文职场黑话 */
export function sampleJargonKo(count: number): KoJargonItem[] {
  const shuffled = [...JARGON_KO].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
