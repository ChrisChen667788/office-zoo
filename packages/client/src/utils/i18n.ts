/**
 * i18n — v1.2.0/1/2 minimal locale lookup.
 *
 * Why a hand-rolled `t()` instead of i18next:
 *   - Bundle: i18next + plurals + interpolation = ~20 KB.
 *     A flat `Record<key, Record<locale, string>>` = ~0.5 KB of code.
 *   - Surface scope: product chrome only (CTAs, headings, footer copy).
 *     UGC content (talkshow bits, fired scenarios written by users)
 *     STAYS in original language — translation isn't applied to it.
 *   - No plurals, no dates, no RTL → no library needed.
 *
 * Lookup falls back to the key itself (visible in UI) so missing keys
 * are obvious during dev. Production build relies on TS Dict type to
 * keep every locale complete.
 *
 * Persisted: localStorage `office-zoo.locale`. Defaults to zh-CN.
 *
 * v1.2.2 — locales widened to {zh-CN, en-US, ja-JP, ko-KR} for the
 * Japan + Korea launches. The 中/EN pill on Landing was replaced by a
 * dropdown ([🌐 中文 ▾]) because 4-position toggles don't fit mobile.
 */

import { useSyncExternalStore } from 'react';

export type Locale = 'zh-CN' | 'en-US' | 'ja-JP' | 'ko-KR';

const STORAGE_KEY = 'office-zoo.locale';

/** Display label + emoji for the locale picker dropdown. Order matches the
 *  UI list. Native names for each language (so a Japanese user sees
 *  「日本語」, not the romaji). */
export const LOCALE_OPTIONS: Array<{ code: Locale; label: string }> = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en-US', label: 'English'  },
  { code: 'ja-JP', label: '日本語'   },
  { code: 'ko-KR', label: '한국어'   },
];

// ─────────────────────────────────────────────────────────────────────
// Dictionary. Every key MUST have all four locales — TS will block PRs
// that miss one. UGC content (script bodies, scenario titles written by
// users) is NEVER routed through this.
// ─────────────────────────────────────────────────────────────────────
const DICT = {
  // Brand + header
  'brand.wordmark':      { 'zh-CN': 'OFFICE ZOO',         'en-US': 'OFFICE ZOO',          'ja-JP': 'OFFICE ZOO',          'ko-KR': 'OFFICE ZOO' },
  'brand.tagline':       { 'zh-CN': 'AI 鼠人 24h 营业',   'en-US': 'AI rats clocking in 24/7', 'ja-JP': 'AIネズミ社員 24時間営業', 'ko-KR': 'AI 직원 24시간 영업' },
  'header.howToPlay':    { 'zh-CN': '怎么玩',             'en-US': 'How to play',         'ja-JP': '遊び方',               'ko-KR': '플레이 방법' },
  'header.b2b':          { 'zh-CN': '🏢 B 端',             'en-US': '🏢 Enterprise',       'ja-JP': '🏢 法人版',             'ko-KR': '🏢 기업용' },
  'header.premium':      { 'zh-CN': '👑 Premium',          'en-US': '👑 Premium',          'ja-JP': '👑 Premium',           'ko-KR': '👑 Premium' },
  'header.backHome':     { 'zh-CN': '← 返回首页',         'en-US': '← Back home',         'ja-JP': '← トップへ',           'ko-KR': '← 홈으로' },

  // Landing hero
  'landing.hero.title':  { 'zh-CN': 'AI 鼠人陪你演',      'en-US': 'AI rats play you',    'ja-JP': 'AIネズミと共演',         'ko-KR': 'AI 직원과 함께' },
  'landing.hero.sub':    {
    'zh-CN': '4-12 个 AI 在办公室里搞事 · 你是其中之一 · 找到资本家',
    'en-US': '4-12 AI agents conspire in the office · you\'re one of them · find the boss',
    'ja-JP': 'オフィスで4〜12人のAIが暗躍 · あなたもその一人 · 資本家を見つけ出せ',
    'ko-KR': '4-12명의 AI가 사무실에서 암약 · 당신도 그중 하나 · 자본가를 찾아라',
  },
  'landing.startGame':   { 'zh-CN': '开局',                'en-US': 'Start game',          'ja-JP': 'ゲーム開始',            'ko-KR': '게임 시작' },

  // Mode cards (v1.2.1 — wired into Landing MODES)
  'mode.classic.title':  { 'zh-CN': '经典局',              'en-US': 'Classic',             'ja-JP': 'クラシック',            'ko-KR': '클래식' },
  'mode.classic.body':   {
    'zh-CN': '4-12 人开会推理,投票决定谁是资本家',
    'en-US': '4-12 agents meet, deduce, vote out the capitalists',
    'ja-JP': '4〜12人で会議・推理・投票で資本家を追い出す',
    'ko-KR': '4-12명이 회의·추리·투표로 자본가를 찾아냄',
  },
  'mode.immersive.title':{ 'zh-CN': '沉浸局',              'en-US': 'Immersive',           'ja-JP': 'イマーシブ',            'ko-KR': '몰입 모드' },
  'mode.immersive.body': {
    'zh-CN': 'AI 真人配音 + 写字楼 3D 地图 + 实时碰面',
    'en-US': 'Real-voice TTS + 3D office floor + live encounters',
    'ja-JP': 'リアルな音声 + 3Dオフィスマップ + リアルタイム遭遇',
    'ko-KR': '실음성 TTS + 3D 사무실 + 실시간 조우',
  },
  'mode.fired.title':    { 'zh-CN': '裁了么',              'en-US': 'You\'re Fired',       'ja-JP': '解雇通告',              'ko-KR': '해고당함' },
  'mode.fired.body':     {
    'zh-CN': '单挑 HR · 用法律 + 话术争最大赔偿',
    'en-US': 'Solo vs HR · use law + tactics for max severance',
    'ja-JP': 'HR と一騎打ち · 法律と話術で退職金を最大化',
    'ko-KR': 'HR와 일대일 · 법과 화술로 보상금 극대화',
  },
  'mode.talkshow.title': { 'zh-CN': '班味单口',            'en-US': 'Workplace Standup',   'ja-JP': '社畜スタンダップ',       'ko-KR': '직장인 스탠드업' },
  'mode.talkshow.body':  {
    'zh-CN': 'AI 鼠人替你讲段子 · 30+ 段职场暴论',
    'en-US': 'AI rats deliver standup · 30+ workplace rants',
    'ja-JP': 'AIネズミがあなたの代わりにネタを · 30本以上の職場あるある',
    'ko-KR': 'AI 직원이 대신 토크쇼 · 30개 이상의 직장 풍자',
  },

  // Premium page — chrome
  'premium.title':       { 'zh-CN': 'Premium · 班味 Pro',  'en-US': 'Premium · Office Zoo Pro', 'ja-JP': 'Premium · Office Zoo Pro', 'ko-KR': 'Premium · Office Zoo Pro' },
  'premium.subtitle':    {
    'zh-CN': '把"被 HR 优化"这件事玩到极致。海外大厂剧本,真人律师,定制声音,所有局永久回放。',
    'en-US': 'Take "getting layoff-optimized" to the next level. FAANG scenarios, real lawyers, voice clone, unlimited replays.',
    'ja-JP': '「リストラされる」を極める。FAANG シナリオ、本物の弁護士、音声クローン、リプレイ無制限。',
    'ko-KR': '"정리해고당하기"를 끝까지. FAANG 시나리오, 실제 변호사, 음성 클론, 무제한 다시보기.',
  },
  'premium.cta':         { 'zh-CN': '✨ 立即升级 Premium', 'en-US': '✨ Upgrade to Premium', 'ja-JP': '✨ Premium にアップグレード', 'ko-KR': '✨ Premium 업그레이드' },
  'premium.activated':   { 'zh-CN': 'Premium 已激活',      'en-US': 'Premium active',      'ja-JP': 'Premium 有効',           'ko-KR': 'Premium 활성화됨' },
  'premium.demoTag':     { 'zh-CN': '(Demo)',              'en-US': '(Demo)',              'ja-JP': '(デモ)',                'ko-KR': '(데모)' },
  'premium.cancelBtn':   { 'zh-CN': '重置为免费用户(debug)','en-US': 'Reset to free tier (debug)', 'ja-JP': '無料版にリセット(debug)', 'ko-KR': '무료 사용자로 초기화(debug)' },

  // Premium pricing labels
  'premium.monthLabel':  { 'zh-CN': '月度',                'en-US': 'Monthly',             'ja-JP': '月額',                  'ko-KR': '월간' },
  'premium.yearLabel':   { 'zh-CN': '年度',                'en-US': 'Annual',              'ja-JP': '年額',                  'ko-KR': '연간' },
  'premium.yearSaving':  { 'zh-CN': '省 35%',              'en-US': 'Save 35%',            'ja-JP': '35% お得',              'ko-KR': '35% 할인' },
  // Per-locale price strings — CNY for Chinese, USD for English/JP/KR.
  // Numbers picked at rough purchasing-power parity for each market.
  'premium.priceMonthly': { 'zh-CN': '¥39',                'en-US': '$5',                  'ja-JP': '¥780',                 'ko-KR': '₩6,900' },
  'premium.priceAnnual':  { 'zh-CN': '¥299',               'en-US': '$39',                 'ja-JP': '¥5,980',               'ko-KR': '₩52,000' },
  'premium.perMonth':    { 'zh-CN': '/月',                 'en-US': '/mo',                 'ja-JP': '/月',                  'ko-KR': '/월' },
  'premium.perYear':     { 'zh-CN': '/年',                 'en-US': '/yr',                 'ja-JP': '/年',                  'ko-KR': '/년' },
  'premium.refund':      { 'zh-CN': '7 天内不满意全额退款 · 任意时间取消', 'en-US': '7-day refund · cancel anytime', 'ja-JP': '7日間返金保証 · いつでも解約可', 'ko-KR': '7일 환불 보장 · 언제든 해지' },

  // Premium pricing card features list (5 bullets)
  'premium.feat.faang':  { 'zh-CN': '✅ 6 个海外大厂剧本(立即可玩)', 'en-US': '✅ 6 FAANG scenarios (playable now)', 'ja-JP': '✅ FAANG シナリオ6本(即プレイ可)', 'ko-KR': '✅ FAANG 시나리오 6개 (즉시 플레이)' },
  'premium.feat.lawyer': { 'zh-CN': '✅ 律师真人咨询入口(签约中)', 'en-US': '✅ Real-lawyer consultation (partners onboarding)', 'ja-JP': '✅ 弁護士相談窓口(提携中)', 'ko-KR': '✅ 실제 변호사 상담 (제휴 중)' },
  'premium.feat.voice':  { 'zh-CN': '✅ 高级 voice clone(开发中)', 'en-US': '✅ Advanced voice clone (in dev)', 'ja-JP': '✅ 高度な音声クローン(開発中)', 'ko-KR': '✅ 고급 보이스 클론 (개발 중)' },
  'premium.feat.replay': { 'zh-CN': '✅ 历史回放无限存储 + 4K 导出', 'en-US': '✅ Unlimited replay storage + 4K export', 'ja-JP': '✅ リプレイ無制限保存 + 4K書き出し', 'ko-KR': '✅ 다시보기 무제한 보관 + 4K 내보내기' },
  'premium.feat.future': { 'zh-CN': '✅ 所有未来 Premium 功能持续解锁', 'en-US': '✅ All future Premium features included', 'ja-JP': '✅ 今後追加される Premium 機能もすべて利用可', 'ko-KR': '✅ 향후 모든 Premium 기능 포함' },

  // Premium feature matrix headlines (4 cards on page)
  'premium.feature.faang.title':  { 'zh-CN': '海外大厂场景包', 'en-US': 'FAANG scenario pack', 'ja-JP': 'FAANG シナリオパック', 'ko-KR': 'FAANG 시나리오 팩' },
  'premium.feature.faang.body':   {
    'zh-CN': 'Twitter Purge / Meta 效率裁员 / Amazon RTO / Apple PM / Google reorg / startup cliff dump — 6 个真实事件改编,英美劳动法规则切换',
    'en-US': 'Twitter Purge / Meta efficiency layoff / Amazon RTO / Apple PM / Google reorg / startup cliff dump — 6 real-event remixes with US/UK labor law twists',
    'ja-JP': 'Twitter 大量解雇 / Meta「効率の年」 / Amazon 出社強制 / Apple PM / Google 再編 / スタートアップの cliff dump — 実話に基づく6本、米英の労働法に対応',
    'ko-KR': '트위터 대량해고 / Meta 효율의 해 / Amazon RTO / Apple PM / Google 조직개편 / 스타트업 cliff dump — 실화 기반 6개, 미·영 노동법 적용',
  },
  'premium.feature.voice.title':  { 'zh-CN': '高级 voice clone', 'en-US': 'Advanced voice clone', 'ja-JP': '高度な音声クローン', 'ko-KR': '고급 보이스 클론' },
  'premium.feature.voice.body':   {
    'zh-CN': '上传你老板 30 秒录音,AI 用他的声音念出"咱们一起拼一下"。回家放给爸妈听,他们终于知道你为啥天天加班',
    'en-US': 'Upload 30 sec of your boss\'s voice. AI generates them saying "let\'s grind together for one more quarter". Play it for your parents.',
    'ja-JP': '上司の声を30秒アップロード。AIがその声で「みんなで頑張ろう」と再生。実家で親に聞かせれば、なぜ毎日残業なのか分かってもらえる。',
    'ko-KR': '상사 목소리 30초 업로드. AI가 그 목소리로 "다 같이 분기 한 번만 더 갈아넣자"를 말해줌. 부모님께 들려주면 왜 매일 야근인지 이해함.',
  },
  'premium.feature.lawyer.title': { 'zh-CN': '律师真人咨询入口', 'en-US': 'Lawyer consultation entry', 'ja-JP': '弁護士相談窓口', 'ko-KR': '변호사 상담 창구' },
  'premium.feature.lawyer.body':  {
    'zh-CN': '已签约 2 家劳动法律所。Premium 用户每月 1 次 30 分钟免费咨询,过审后可继续 ¥299/小时(对比市价 ¥800-1500)',
    'en-US': '2 partner law firms signed. 1 free 30-min consultation per month for Premium users; follow-ups at $40/hr (vs $200+ market rate).',
    'ja-JP': '提携法律事務所2社。Premium会員は月1回30分の無料相談、追加は¥3,000/時(市場相場 ¥10,000+)',
    'ko-KR': '제휴 노동법 사무소 2곳. Premium 회원은 월 1회 30분 무료 상담, 추가 ₩50,000/시간(시세 ₩200,000+)',
  },
  'premium.feature.replay.title': { 'zh-CN': '历史回放无限存储', 'en-US': 'Unlimited replay storage', 'ja-JP': 'リプレイ無制限保存', 'ko-KR': '다시보기 무제한 보관' },
  'premium.feature.replay.body':  {
    'zh-CN': '免费版只保留最近 10 局短视频; Premium 永久保留 + 4K 导出 + 去水印 + 自定义封面文字',
    'en-US': 'Free tier keeps the last 10 shorts. Premium = permanent + 4K export + watermark removal + custom cover text.',
    'ja-JP': '無料版は直近10戦のみ保存。Premium は永久保存 + 4K書き出し + 透かし削除 + カバー文字カスタマイズ。',
    'ko-KR': '무료는 최근 10판만 보관. Premium은 영구 보관 + 4K 내보내기 + 워터마크 제거 + 커버 문구 커스텀.',
  },
  'premium.featureStatus.live': { 'zh-CN': '已上线', 'en-US': 'Live',     'ja-JP': '提供中',   'ko-KR': '제공 중' },
  'premium.featureStatus.soon': { 'zh-CN': '即将上线', 'en-US': 'Coming soon', 'ja-JP': '近日公開', 'ko-KR': '곧 출시' },

  // Demo notice banners
  'premium.demoNotice.title':   { 'zh-CN': '⚠️ Demo 模式说明', 'en-US': '⚠️ Demo mode notice', 'ja-JP': '⚠️ デモモードについて', 'ko-KR': '⚠️ 데모 모드 안내' },
  'premium.demoNotice.body':    {
    'zh-CN': 'v1.0.0 当前还没接 Stripe / 支付宝 / 微信支付。点"立即升级"会本地激活 Premium(只在你这台浏览器有效),不会真的扣款。这是给体验设计 + 反馈用的预览版本。后端真实支付集成进入 v1.0.1 / v1.0.2 路线图。',
    'en-US': 'v1.0.0 doesn\'t yet integrate Stripe. Clicking "Upgrade" activates Premium locally on your browser only — no real charge. This is a preview for UX feedback. Real payment integration ships in v1.0.1/v1.0.2.',
    'ja-JP': 'v1.0.0 はまだ Stripe を統合していません。「アップグレード」をクリックするとブラウザのみで Premium が有効になり、実際の課金は発生しません。UX フィードバック用のプレビューです。本番決済は v1.0.1/v1.0.2 で対応予定。',
    'ko-KR': 'v1.0.0은 아직 Stripe를 연동하지 않았습니다. "업그레이드"를 누르면 이 브라우저에만 Premium이 활성화되며 실제 결제는 없습니다. UX 피드백용 미리보기입니다. 실제 결제는 v1.0.1/v1.0.2에서 출시됩니다.',
  },
  'premium.checkout.title':       { 'zh-CN': '确认订阅 Premium', 'en-US': 'Confirm Premium subscription', 'ja-JP': 'Premium 加入を確定', 'ko-KR': 'Premium 구독 확정' },
  'premium.checkout.lineItem':    { 'zh-CN': '班味 Pro · {plan}订阅', 'en-US': 'Office Zoo Pro · {plan} subscription', 'ja-JP': 'Office Zoo Pro · {plan}サブスクリプション', 'ko-KR': 'Office Zoo Pro · {plan} 구독' },
  'premium.checkout.demoTitle':   { 'zh-CN': '🧪 Demo 模式', 'en-US': '🧪 Demo mode', 'ja-JP': '🧪 デモモード', 'ko-KR': '🧪 데모 모드' },
  'premium.checkout.demoBody':    {
    'zh-CN': '这一次"升级"不会真的扣款,只在你这台浏览器本地把 Premium flag 打开。点击下面按钮等于体验"如果真付款会怎样"。后续可以在 Premium 页面随时重置。',
    'en-US': 'This "upgrade" won\'t actually charge you — it only flips the Premium flag locally in your browser. Click below to preview "what would happen if you paid". Resettable from Premium page anytime.',
    'ja-JP': 'この「アップグレード」は実際には課金されず、ブラウザに Premium フラグを立てるだけです。「もし課金したらどうなるか」のプレビューです。Premium ページからいつでもリセット可。',
    'ko-KR': '이 "업그레이드"는 실제 결제 없이, 브라우저에만 Premium 플래그를 켭니다. "실제로 결제하면 어떻게 될지" 미리보기입니다. Premium 페이지에서 언제든 초기화 가능.',
  },
  'premium.checkout.confirmDemo': { 'zh-CN': '✨ 确认升级 (Demo)', 'en-US': '✨ Confirm upgrade (Demo)', 'ja-JP': '✨ アップグレードを確定 (デモ)', 'ko-KR': '✨ 업그레이드 확정 (데모)' },
  'premium.checkout.processing':  { 'zh-CN': '⏳ 处理中…', 'en-US': '⏳ Processing…', 'ja-JP': '⏳ 処理中…', 'ko-KR': '⏳ 처리 중…' },

  // Premium subscribed panel
  'premium.subscribed.body':    {
    'zh-CN': '所有 Premium 功能已解锁。海外大厂剧本会在剧本库里以"👑"标识显示。',
    'en-US': 'All Premium features unlocked. FAANG scenarios appear in the scenario library marked with "👑".',
    'ja-JP': 'すべての Premium 機能が解放されました。FAANG シナリオはシナリオライブラリに「👑」付きで表示されます。',
    'ko-KR': '모든 Premium 기능이 해금되었습니다. FAANG 시나리오는 라이브러리에 "👑" 표시로 나타납니다.',
  },
  'premium.subscribed.planLabel':       { 'zh-CN': '计划', 'en-US': 'Plan', 'ja-JP': 'プラン', 'ko-KR': '플랜' },
  'premium.subscribed.activatedLabel':  { 'zh-CN': '激活时间', 'en-US': 'Activated', 'ja-JP': '有効化日', 'ko-KR': '활성화일' },

  // Common
  'common.loading':      { 'zh-CN': '⏳ 加载中…',          'en-US': '⏳ Loading…',          'ja-JP': '⏳ 読み込み中…',         'ko-KR': '⏳ 로딩 중…' },
  'common.retry':        { 'zh-CN': '↻ 重试',              'en-US': '↻ Retry',              'ja-JP': '↻ 再試行',              'ko-KR': '↻ 다시 시도' },
  'common.cancel':       { 'zh-CN': '取消',                'en-US': 'Cancel',               'ja-JP': 'キャンセル',            'ko-KR': '취소' },
  'common.confirm':      { 'zh-CN': '确认',                'en-US': 'Confirm',              'ja-JP': '確定',                  'ko-KR': '확인' },
  'common.share':        { 'zh-CN': '🔗 分享',             'en-US': '🔗 Share',             'ja-JP': '🔗 共有',                'ko-KR': '🔗 공유' },
  'common.copy':         { 'zh-CN': '复制',                'en-US': 'Copy',                 'ja-JP': 'コピー',                'ko-KR': '복사' },
  'common.copied':       { 'zh-CN': '✓ 已复制',            'en-US': '✓ Copied',             'ja-JP': '✓ コピー済み',           'ko-KR': '✓ 복사됨' },

  // Locale picker
  'locale.switchHint':   { 'zh-CN': '语言',                'en-US': 'Language',             'ja-JP': '言語',                  'ko-KR': '언어' },

  // ─────────────────────────────────────────────────────────────────────
  // v2.2.0 — Archetype names + taglines for the 12 region/industry
  // archetypes added in v2.0.0. The original 12 v1.3.0 archetypes
  // intentionally NOT translated here (they still render in zh-CN
  // across all locales) — backwards-compatible behaviour, and the
  // translation cost vs. impact wasn't justified for v2.2.0 scope.
  //
  // Lookup pattern: `archetype.<id>.name`, `.shortName`, `.tagline`.
  // ─────────────────────────────────────────────────────────────────────

  // Industry archetypes (6)
  'archetype.soe-lifer.name':       { 'zh-CN': '国企铁饭碗',     'en-US': 'SOE Lifer',          'ja-JP': '国営の鉄飯椀',          'ko-KR': '국영 철밥통' },
  'archetype.soe-lifer.shortName':  { 'zh-CN': '国企',           'en-US': 'SOE',                'ja-JP': '国営',                  'ko-KR': '국영' },
  'archetype.soe-lifer.tagline':    { 'zh-CN': '下午 3 点喝茶,5 点准时下班,工资按月到账', 'en-US': 'Tea at 3, off at 5, paycheck like clockwork.', 'ja-JP': '15時に茶、17時退社、給料は月例。', 'ko-KR': '오후 3시 차, 5시 칼퇴, 월급은 시계처럼.' },

  'archetype.faang-cog.name':       { 'zh-CN': '大厂螺丝钉',     'en-US': 'FAANG Cog',          'ja-JP': '大手企業の歯車',        'ko-KR': '대기업 부품' },
  'archetype.faang-cog.shortName':  { 'zh-CN': '螺丝钉',         'en-US': 'Cog',                'ja-JP': '歯車',                  'ko-KR': '부품' },
  'archetype.faang-cog.tagline':    { 'zh-CN': '我是 OKR 里的一行字, 周报里的一个 bullet', 'en-US': 'A line in the OKR, a bullet in the weekly report.', 'ja-JP': 'OKRの中の一行、週報の中の一弾。', 'ko-KR': 'OKR 한 줄, 주간보고 한 줄.' },

  'archetype.startup-cowboy.name':  { 'zh-CN': '创业老炮',       'en-US': 'Startup Veteran',    'ja-JP': 'スタートアップ古参',    'ko-KR': '창업 베테랑' },
  'archetype.startup-cowboy.shortName': { 'zh-CN': '创业',       'en-US': 'Startup',            'ja-JP': '創業',                  'ko-KR': '창업' },
  'archetype.startup-cowboy.tagline': { 'zh-CN': '见过三轮裁员还活着 — 工资条比 commit log 还密', 'en-US': 'Survived 3 layoff rounds — paychecks denser than the git log.', 'ja-JP': '3度のリストラを生き残った — 給与明細はコミットログより密。', 'ko-KR': '3차례 정리해고에서 살아남음 — 급여명세서가 commit log보다 빽빽.' },

  'archetype.finance-suit.name':    { 'zh-CN': '金融体面人',     'en-US': 'Finance Suit',       'ja-JP': '金融エリート',          'ko-KR': '금융 정장' },
  'archetype.finance-suit.shortName':{'zh-CN': '金融',           'en-US': 'Finance',            'ja-JP': '金融',                  'ko-KR': '금융' },
  'archetype.finance-suit.tagline': { 'zh-CN': '讲话夹英文,西装革履,通勤陆家嘴', 'en-US': 'Code-switches mid-sentence, suit-clad, commutes to Lujiazui.', 'ja-JP': '英語混じり、スーツ姿、陸家嘴通勤。', 'ko-KR': '말끝마다 영어, 정장 차림, 루자쭈이 통근.' },

  'archetype.edu-survivor.name':    { 'zh-CN': '教培劫余',       'en-US': 'EdTech Survivor',    'ja-JP': '教育業界の生存者',      'ko-KR': '에듀테크 생존자' },
  'archetype.edu-survivor.shortName':{'zh-CN': '教培',           'en-US': 'EdTech',             'ja-JP': '教育',                  'ko-KR': '에듀' },
  'archetype.edu-survivor.tagline': { 'zh-CN': '双减后转 K9, 双语转一对一, 一对一转海外', 'en-US': 'Post-crackdown pivots: K9 → bilingual → 1-on-1 → overseas.', 'ja-JP': '規制後はK9へ、二言語から個別、個別から海外へ。', 'ko-KR': '단속 후 K9 → 이중언어 → 1대1 → 해외로 전환.' },

  'archetype.mcn-grinder.name':     { 'zh-CN': '网红打工人',     'en-US': 'MCN Hustler',        'ja-JP': 'インフルエンサー社員',  'ko-KR': 'MCN 노동자' },
  'archetype.mcn-grinder.shortName':{'zh-CN': '网红',            'en-US': 'MCN',                'ja-JP': 'MCN',                   'ko-KR': 'MCN' },
  'archetype.mcn-grinder.tagline':  { 'zh-CN': '今天涨了 200 粉, 这个月 GMV 还差 5 万', 'en-US': '+200 followers today, still 50K GMV short for the month.', 'ja-JP': '今日200人増、今月のGMVあと5万足りない。', 'ko-KR': '오늘 200명 증가, 이번 달 GMV 5만 부족.' },

  // Region archetypes (6)
  'archetype.bj-drift.name':        { 'zh-CN': '北漂',           'en-US': 'Beijing Drifter',    'ja-JP': '北京漂流者',            'ko-KR': '베이징 표류자' },
  'archetype.bj-drift.shortName':   { 'zh-CN': '北漂',           'en-US': 'BJ-drifter',         'ja-JP': '北京組',                'ko-KR': '베이징' },
  'archetype.bj-drift.tagline':     { 'zh-CN': '出租屋 + 沙县小吃 + 五号线早 7 点', 'en-US': 'Shared rental + cheap noodles + 7am Line 5.', 'ja-JP': '賃貸+大衆食堂+早朝の地下鉄5号線。', 'ko-KR': '월세방+분식+아침 7시 5호선.' },

  'archetype.sh-yuppie.name':       { 'zh-CN': '沪漂精致',       'en-US': 'Shanghai Yuppie',    'ja-JP': '上海プチセレブ',        'ko-KR': '상하이 여피' },
  'archetype.sh-yuppie.shortName':  { 'zh-CN': '沪漂',           'en-US': 'SH-yuppie',          'ja-JP': '上海組',                'ko-KR': '상하이' },
  'archetype.sh-yuppie.tagline':    { 'zh-CN': '周末必喝咖啡, 工作日早餐 manner', 'en-US': 'Weekend coffee ritual, weekday breakfast at Manner.', 'ja-JP': '週末はカフェ必須、平日はMannerの朝食。', 'ko-KR': '주말 카페 필수, 평일 Manner 아침.' },

  'archetype.sz-money-chaser.name': { 'zh-CN': '深漂搞钱党',     'en-US': 'Shenzhen Money-chaser', 'ja-JP': '深圳マネーハンター',  'ko-KR': '선전 돈벌이족' },
  'archetype.sz-money-chaser.shortName': { 'zh-CN': '深漂',      'en-US': 'SZ-chaser',          'ja-JP': '深圳組',                'ko-KR': '선전' },
  'archetype.sz-money-chaser.tagline':{ 'zh-CN': '搞钱搞钱搞钱, 别跟我谈情怀', 'en-US': 'Make money, make money, make money — don\'t talk passion.', 'ja-JP': '稼ぐ稼ぐ稼ぐ — 情熱の話はやめて。', 'ko-KR': '돈 돈 돈 — 열정 얘기는 그만.' },

  'archetype.hz-internet-kid.name': { 'zh-CN': '杭州互联网青年', 'en-US': 'Hangzhou Tech Youth','ja-JP': '杭州IT若手',            'ko-KR': '항저우 IT 청년' },
  'archetype.hz-internet-kid.shortName': { 'zh-CN': '杭漂',      'en-US': 'HZ-tech',            'ja-JP': '杭州組',                'ko-KR': '항저우' },
  'archetype.hz-internet-kid.tagline':{ 'zh-CN': '花名"小六", 居住未来科技城, 996 是天经地义', 'en-US': 'Code-name "Liu-Six", lives in Future Sci-Tech City, 996 is gospel.', 'ja-JP': 'コードネーム「小六」、未来科技城在住、996は当然。', 'ko-KR': '코드네임 "샤오류", 미래과기성 거주, 996은 당연.' },

  'archetype.cd-zen.name':          { 'zh-CN': '成都摆烂派',     'en-US': 'Chengdu Zen-Slacker','ja-JP': '成都のチル派',          'ko-KR': '청두 무기력파' },
  'archetype.cd-zen.shortName':     { 'zh-CN': '成都',           'en-US': 'Chengdu',            'ja-JP': '成都',                  'ko-KR': '청두' },
  'archetype.cd-zen.tagline':       { 'zh-CN': '巴适得板, 上班是为了下班吃火锅', 'en-US': 'Life is chill — work just funds the hotpot.', 'ja-JP': '人生まったり — 仕事は火鍋の資金稼ぎ。', 'ko-KR': '인생은 여유 — 일은 훠궈를 위한 자금.' },

  'archetype.escape-overseas.name': { 'zh-CN': '海外润人',       'en-US': 'Overseas Escapee',   'ja-JP': '海外脱出組',            'ko-KR': '해외 탈출족' },
  'archetype.escape-overseas.shortName':{'zh-CN': '润人',        'en-US': 'Escapee',            'ja-JP': '脱出',                  'ko-KR': '탈출' },
  'archetype.escape-overseas.tagline':{ 'zh-CN': '走为上策, 简历 + 英语 + 签证一起搞', 'en-US': 'Exit strategy: resume + English + visa, all at once.', 'ja-JP': '逃げるが勝ち — 履歴書、英語、ビザを同時並行。', 'ko-KR': '도망이 상책 — 이력서, 영어, 비자 동시 진행.' },

  // ─────────────────────────────────────────────────────────────────────
  // v3.4.0 — Squad chemistry hint headers + trait labels + tribe names.
  // The structured ChemistryHint payload from the server is rendered
  // per-locale via these entries. Template assembly happens in
  // utils/chemistryHint.ts so non-zh users see proper localized chips.
  // ─────────────────────────────────────────────────────────────────────

  // Hint type prefixes ("行业碰撞", "天敌同台" etc)
  'chemistry.cultureClashIndustry':  { 'zh-CN': '行业碰撞',     'en-US': 'Industry clash',       'ja-JP': '業界衝突',              'ko-KR': '업종 충돌' },
  'chemistry.cultureClashRegion':    { 'zh-CN': '地域碰撞',     'en-US': 'Region clash',         'ja-JP': '地域衝突',              'ko-KR': '지역 충돌' },
  'chemistry.sharedTribeRegion':     { 'zh-CN': '同城群像',     'en-US': 'Same-city ensemble',   'ja-JP': '同郷の群像',            'ko-KR': '같은 도시 군상' },
  'chemistry.sharedTribeIndustry':   { 'zh-CN': '同行业群像',   'en-US': 'Same-industry ensemble','ja-JP': '同業界の群像',          'ko-KR': '동종업계 군상' },
  'chemistry.rivalPair':             { 'zh-CN': '天敌同台',     'en-US': 'Nemesis pair on stage','ja-JP': '宿敵同席',              'ko-KR': '천적 동석' },
  'chemistry.traitExtreme':          { 'zh-CN': '两极对照',     'en-US': 'Trait extremes',       'ja-JP': '両極の対比',            'ko-KR': '양극단 대비' },
  'chemistry.soloOutlier':           { 'zh-CN': '单点外人',     'en-US': 'Solo outsider',        'ja-JP': '一人だけ場違い',        'ko-KR': '나 홀로 이질감' },

  // Trait labels (used by trait-extreme hint body)
  'chemistry.trait.grind':           { 'zh-CN': '卷度',         'en-US': 'grind',                'ja-JP': '頑張り度',              'ko-KR': '갈아넣기' },
  'chemistry.trait.snark':           { 'zh-CN': '阴阳度',       'en-US': 'snark',                'ja-JP': '皮肉度',                'ko-KR': '비꼼' },
  'chemistry.trait.ambition':        { 'zh-CN': '进取心',       'en-US': 'ambition',             'ja-JP': '上昇志向',              'ko-KR': '야망' },
  'chemistry.trait.empathy':         { 'zh-CN': '人情味',       'en-US': 'empathy',              'ja-JP': '人情味',                'ko-KR': '인정' },
  'chemistry.trait.cynicism':        { 'zh-CN': '摆烂度',       'en-US': 'cynicism',             'ja-JP': '諦観度',                'ko-KR': '체념' },
  'chemistry.trait.visibility':      { 'zh-CN': '存在感',       'en-US': 'visibility',           'ja-JP': '存在感',                'ko-KR': '존재감' },

  // v3.4.0 — chemistry section header (above the chip strips on the
  // squad directing / playing / ended screens).
  'chemistry.sectionHeader':         { 'zh-CN': '🎭 你们这桌的化学反应', 'en-US': '🎭 Your squad chemistry', 'ja-JP': '🎭 このチームの化学反応', 'ko-KR': '🎭 우리 팀 케미스트리' },

  // v3.6.0 — EvolutionPanel labels (Profile page).
  'evolution.title':                 { 'zh-CN': '🌀 班味演化',   'en-US': '🌀 Persona evolution', 'ja-JP': '🌀 ペルソナ進化',       'ko-KR': '🌀 페르소나 진화' },
  'evolution.recordSuffix':          { 'zh-CN': '次记录',        'en-US': 'events',               'ja-JP': '件記録',                'ko-KR': '회 기록' },
  'evolution.evolvedHeader':         { 'zh-CN': '你已演化',      'en-US': 'You evolved',          'ja-JP': '進化した',              'ko-KR': '진화함' },
  'evolution.driftHeader':           { 'zh-CN': '✦ 累计漂移',    'en-US': '✦ Cumulative drift',   'ja-JP': '✦ 累積ドリフト',         'ko-KR': '✦ 누적 드리프트' },
  'evolution.driftEmpty':            { 'zh-CN': '漂移幅度还很小,继续玩看看', 'en-US': 'Drift is still small — keep playing.', 'ja-JP': 'ドリフトはまだ小さい — もう少し遊んでみて。', 'ko-KR': '드리프트가 아직 작아요 — 더 플레이해 보세요.' },
  'evolution.recentEventsHeader':    { 'zh-CN': '✦ 最近事件',    'en-US': '✦ Recent events',      'ja-JP': '✦ 最近のイベント',      'ko-KR': '✦ 최근 이벤트' },
  'evolution.milestoneHeader':       { 'zh-CN': '✦ 下一站 · 你离这个 archetype 最近', 'en-US': '✦ Next milestone · closest archetype to you', 'ja-JP': '✦ 次の到達点 · 一番近いアーキタイプ', 'ko-KR': '✦ 다음 마일스톤 · 가장 가까운 원형' },
  'evolution.milestoneGap':          { 'zh-CN': '差距',          'en-US': 'Gap',                  'ja-JP': '差',                    'ko-KR': '차이' },
  'evolution.milestoneLever':        { 'zh-CN': '主要差',        'en-US': 'Mostly missing',       'ja-JP': '不足は主に',            'ko-KR': '주로 부족한 건' },
  'evolution.milestonePlay':         { 'zh-CN': '再玩',          'en-US': 'Play',                 'ja-JP': 'あと',                  'ko-KR': '플레이' },
  'evolution.milestonePlayTimes':    { 'zh-CN': '局',            'en-US': 'more times',           'ja-JP': '回',                    'ko-KR': '번' },
  'evolution.milestonePlayWith':     { 'zh-CN': '试试',          'en-US': 'to bridge it →',       'ja-JP': '挑戦してみよう →',       'ko-KR': '시도해 보세요 →' },

  // Event-kind labels for the recent-events feed.
  'evolution.kind.fired-completion': { 'zh-CN': '裁员谈判',      'en-US': 'Layoff chat',          'ja-JP': '解雇交渉',              'ko-KR': '해고 협상' },
  'evolution.kind.squad-end':        { 'zh-CN': '攒局',          'en-US': 'Squad',                'ja-JP': 'スクワッド',            'ko-KR': '스쿼드' },
  'evolution.kind.talkshow-create':  { 'zh-CN': '段子创作',      'en-US': 'Talkshow bit',         'ja-JP': 'ネタ作成',              'ko-KR': '코미디 작성' },
  'evolution.kind.pack-complete':    { 'zh-CN': '闯关包通关',    'en-US': 'Pack cleared',         'ja-JP': 'パック制覇',            'ko-KR': '팩 클리어' },

  // Suggested-activity labels for the milestone CTA.
  'evolution.activity.fired':        { 'zh-CN': '裁员谈判',      'en-US': 'Layoff Chat',          'ja-JP': '解雇交渉',              'ko-KR': '해고 협상' },
  'evolution.activity.squad':        { 'zh-CN': '攒局',          'en-US': 'Squad',                'ja-JP': 'スクワッド',            'ko-KR': '스쿼드' },
  'evolution.activity.talkshow':     { 'zh-CN': '写段子',        'en-US': 'Write a bit',          'ja-JP': 'ネタ作成',              'ko-KR': '코미디 작성' },
  'evolution.activity.pack':         { 'zh-CN': '通关闯关包',    'en-US': 'Clear a pack',         'ja-JP': 'パック制覇',            'ko-KR': '팩 클리어' },

  // Tribe values used as inline tokens in hint bodies. Keep short.
  'chemistry.region.beijing':        { 'zh-CN': '北漂',         'en-US': 'Beijing',              'ja-JP': '北京',                  'ko-KR': '베이징' },
  'chemistry.region.shanghai':       { 'zh-CN': '沪漂',         'en-US': 'Shanghai',             'ja-JP': '上海',                  'ko-KR': '상하이' },
  'chemistry.region.shenzhen':       { 'zh-CN': '深漂',         'en-US': 'Shenzhen',             'ja-JP': '深圳',                  'ko-KR': '선전' },
  'chemistry.region.hangzhou':       { 'zh-CN': '杭州',         'en-US': 'Hangzhou',             'ja-JP': '杭州',                  'ko-KR': '항저우' },
  'chemistry.region.chengdu':        { 'zh-CN': '成都',         'en-US': 'Chengdu',              'ja-JP': '成都',                  'ko-KR': '청두' },
  'chemistry.region.overseas':       { 'zh-CN': '海外',         'en-US': 'overseas',             'ja-JP': '海外',                  'ko-KR': '해외' },
  'chemistry.industry.soe':          { 'zh-CN': '国企',         'en-US': 'SOE',                  'ja-JP': '国営',                  'ko-KR': '국영' },
  'chemistry.industry.faang':        { 'zh-CN': '大厂',         'en-US': 'FAANG',                'ja-JP': '大手IT',                'ko-KR': '대기업' },
  'chemistry.industry.startup':      { 'zh-CN': '创业公司',     'en-US': 'startup',              'ja-JP': 'スタートアップ',        'ko-KR': '창업' },
  'chemistry.industry.finance':      { 'zh-CN': '金融',         'en-US': 'finance',              'ja-JP': '金融',                  'ko-KR': '금융' },
  'chemistry.industry.edu':          { 'zh-CN': '教培',         'en-US': 'EdTech',               'ja-JP': '教育',                  'ko-KR': '에듀' },
  'chemistry.industry.mcn':          { 'zh-CN': 'MCN',          'en-US': 'MCN',                  'ja-JP': 'MCN',                   'ko-KR': 'MCN' },
} as const;

export type DictKey = keyof typeof DICT;

// ─────────────────────────────────────────────────────────────────────
// Singleton state + subscribers (for useSyncExternalStore)
// ─────────────────────────────────────────────────────────────────────
let _locale: Locale = (() => {
  if (typeof window === 'undefined') return 'zh-CN';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'zh-CN' || raw === 'en-US' || raw === 'ja-JP' || raw === 'ko-KR') return raw;
  } catch { /* fall through */ }
  return 'zh-CN';
})();
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getLocale(): Locale {
  return _locale;
}

export function setLocale(next: Locale): void {
  if (_locale === next) return;
  _locale = next;
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
      // <html lang> for screen readers / Chrome translate / SEO.
      document.documentElement.lang = next;
    }
  } catch { /* private mode is fine */ }
  for (const cb of listeners) cb();
}

/** The lookup. Returns the translated string for `key` in the current
 *  locale; on missing locale it falls back to zh-CN; on missing key it
 *  returns the key itself so the bug is visible in-app. */
export function t(key: DictKey): string {
  const entry = DICT[key];
  if (!entry) return key;
  return entry[_locale] ?? entry['zh-CN'] ?? key;
}

/** React hook — re-renders when the active locale changes. Returns the
 *  same `t` function + the current locale + a setter. */
export function useT() {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale);
  return { t, locale, setLocale };
}

/** v2.2.0 — archetype label resolver. Tries the i18n DICT first for
 *  archetype.<id>.<field>; falls back to the raw zh-CN provided by the
 *  archetype data (the v1.x archetypes which we deliberately didn't
 *  translate). This single function lets the Profile card / Squad
 *  card / Daily card all surface localized names without each one
 *  re-implementing the fallback chain.
 *
 *  Usage:
 *    archetypeLabel(myArchetype, 'name')      // "FAANG Cog" in en-US
 *    archetypeLabel(myArchetype, 'tagline')   // localized tagline
 */
export function archetypeLabel(
  archetype: { id: string; name: string; shortName: string; tagline: string } | null | undefined,
  field: 'name' | 'shortName' | 'tagline',
): string {
  if (!archetype) return '';
  const key = `archetype.${archetype.id}.${field}` as DictKey;
  const entry = (DICT as Record<string, Record<Locale, string>>)[key];
  if (entry) return entry[_locale] ?? entry['zh-CN'] ?? archetype[field];
  // No dict entry — legacy v1.x archetype. Return the raw zh-CN value
  // already on the archetype data object.
  return archetype[field];
}
