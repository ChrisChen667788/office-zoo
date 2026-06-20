import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Landing from './routes/Landing';          // 首屏:不分包,直出
import ErrorBoundary from './components/ErrorBoundary';
import CharacterFocusModal from './components/character/CharacterFocusModal';
import AchievementUnlockToast from './components/AchievementUnlockToast';
import { markDayVisited, refreshAuto } from './utils/achievements';

// v6.92 — 路由级代码分包:除首屏 Landing 外全部 React.lazy。原来所有路由静态 import
// 进同一个 ~1.3MB 主 chunk,首屏全量下载(含只在分享/动画用到的 html2canvas / lottie)。
// 改 lazy 后各路由(及其重依赖)按需拉,主包大幅瘦身、首屏更快。
const Classic = lazy(() => import('./routes/Classic'));
const Immersive = lazy(() => import('./routes/Immersive'));
const Result = lazy(() => import('./routes/Result'));
const FiredLanding = lazy(() => import('./routes/FiredLanding'));
const FiredChat = lazy(() => import('./routes/FiredChat'));
const FiredResult = lazy(() => import('./routes/FiredResult'));
const FiredPack = lazy(() => import('./routes/FiredPack'));
const FiredRoom = lazy(() => import('./routes/FiredRoom'));
const NegotiationBattle = lazy(() => import('./routes/NegotiationBattle'));
const Talkshow = lazy(() => import('./routes/Talkshow'));
const Premium = lazy(() => import('./routes/Premium'));
const B2bBuilder = lazy(() => import('./routes/B2bBuilder'));
const B2bEmbed = lazy(() => import('./routes/B2bEmbed'));
const Quiz = lazy(() => import('./routes/Quiz'));
const Profile = lazy(() => import('./routes/Profile'));
const Maker = lazy(() => import('./routes/Maker'));
const CharacterVotes = lazy(() => import('./routes/CharacterVotes'));
const VoteDuel = lazy(() => import('./routes/VoteDuel'));
const Squad = lazy(() => import('./routes/Squad'));
const SquadHistory = lazy(() => import('./routes/SquadHistory'));
const FiredChallenge = lazy(() => import('./routes/FiredChallenge'));
const FiredLeaderboard = lazy(() => import('./routes/FiredLeaderboard'));
const FiredDailyChallenge = lazy(() => import('./routes/FiredDailyChallenge'));
const Fortune = lazy(() => import('./routes/Fortune'));
const FortuneGallery = lazy(() => import('./routes/FortuneGallery'));
const FortuneHistory = lazy(() => import('./routes/FortuneHistory'));
const Settings = lazy(() => import('./routes/Settings'));
const TalkshowUgc = lazy(() => import('./routes/TalkshowUgc'));
const Weekly = lazy(() => import('./routes/Weekly'));
const WeeklyMe = lazy(() => import('./routes/WeeklyMe'));
const Bar = lazy(() => import('./routes/Bar'));
const Anniversary = lazy(() => import('./routes/Anniversary'));
const CompanyPackEdit = lazy(() => import('./routes/CompanyPackEdit'));
const CompanyPackView = lazy(() => import('./routes/CompanyPackView'));

/** lazy 路由切换时的轻量占位(分包加载那一瞬)。 */
function RouteFallback() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#050510', color: 'rgba(255,255,255,0.5)', fontSize: 14,
      fontFamily: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
    }}>
      加载中…
    </div>
  );
}

// v6.30 P4 — fire-once on app boot: mark today + auto-evaluate any
// achievements whose check predicate is satisfied (e.g. user already
// has 5 leaks from a prior session but hadn't unlocked yet).
markDayVisited();
refreshAuto();

export default function App() {
  return (
    <>
    <Suspense fallback={<RouteFallback />}>
    <Routes>
      <Route path="/" element={<Landing />} />
      {/* v6.90 — 对局视图套 ErrorBoundary:任何渲染崩溃降级成「回大厅」,不再整端白屏 */}
      <Route path="/classic/:gameId" element={<ErrorBoundary><Classic /></ErrorBoundary>} />
      <Route path="/immersive/new" element={<ErrorBoundary><Immersive /></ErrorBoundary>} />
      <Route path="/immersive/:gameId" element={<ErrorBoundary><Immersive /></ErrorBoundary>} />
      <Route path="/result/:gameId" element={<ErrorBoundary><Result /></ErrorBoundary>} />
      <Route path="/fired" element={<FiredLanding />} />
      <Route path="/fired/chat" element={<FiredChat />} />
      {/* v6.58 — 闯关牌局(方案 A):回合制话术卡谈判,数值客户端跑 + HR 台词走 LLM。
          Lives ABOVE /fired/result etc; literal "battle" segment, no collision. */}
      <Route path="/fired/battle" element={<NegotiationBattle />} />
      <Route path="/fired/result" element={<FiredResult />} />
      {/* v0.9.0 — UGC pack play view (5 sequential scenarios). */}
      <Route path="/fired/pack/:packId" element={<FiredPack />} />
      {/* v0.9.3 — PvP room (worker vs human-HR). roomId="new" + ?scenarioId
          spawns a fresh room; existing rooms join via ?role=worker|hr. */}
      <Route path="/fired/room/:roomId" element={<FiredRoom />} />
      <Route path="/talkshow" element={<Talkshow />} />
      {/* v6.1 — UGC 段子投稿 + 月度精选展示。Lives ABOVE /talkshow
          isn't needed (different segment); flat route. */}
      <Route path="/talkshow/ugc" element={<TalkshowUgc />} />
      {/* v6.5.0 — 周报生成器: 1 句关键事件 → 4 风格周报 */}
      {/* /weekly/me lives ABOVE /weekly so the literal segment wins. */}
      <Route path="/weekly/me" element={<WeeklyMe />} />
      <Route path="/weekly" element={<Weekly />} />
      {/* v1.0.0 — Premium paywall + demo checkout. */}
      <Route path="/premium" element={<Premium />} />
      {/* v1.1.0 — B2B white-label builder + iframe embed target. */}
      <Route path="/b2b" element={<B2bBuilder />} />
      <Route path="/embed/:configId" element={<B2bEmbed />} />
      {/* v1.3.0 — "你是哪种打工人?" personality quiz + shareable profile card. */}
      <Route path="/quiz" element={<Quiz />} />
      <Route path="/profile/me" element={<Profile />} />
      {/* v6.11 P2 — UGC moderation admin. Not linked from nav; token-gated server-side. */}
      <Route path="/maker" element={<Maker />} />
      {/* v6.17 P1 — public 全网鼠人选秀排行榜. */}
      <Route path="/character-votes" element={<CharacterVotes />} />
      {/* v6.18 P3 — 1v1 vote duel. /duel/new 创建, /duel/:id 加入 OR 看结果. */}
      <Route path="/duel/:id" element={<VoteDuel />} />
      {/* v1.4.1 — "攒局" squad mode (2-4 friends, LLM director, 5-act sitcom). */}
      <Route path="/squad/:roomId" element={<Squad />} />
      {/* v1.4.3 — squad history + group leaderboard. Lives ABOVE /squad/:id
          so the literal "history" segment wins the router precedence battle. */}
      <Route path="/squad-history" element={<SquadHistory />} />
      {/* v4.3.0 — challenge leaderboard. Lives ABOVE /fired/challenge/:code
          so the literal "leaderboard" segment wins router precedence. */}
      <Route path="/fired/challenge/leaderboard" element={<FiredLeaderboard />} />
      {/* v5.0.0 — "全网今日挑战" daily public leaderboard. Same scenario
          for everyone today, top-20 by comp ratio + your own rank. */}
      <Route path="/fired/daily-challenge" element={<FiredDailyChallenge />} />
      {/* v5.6.0 — 7-day fortune history + weekly summary. Lives ABOVE
          /fortune so the literal "history" segment wins router precedence. */}
      <Route path="/fortune/history" element={<FortuneHistory />} />
      {/* v5.7.0 — 牌库 gallery (read-only deck browser). Lives ABOVE
          /fortune so the literal "gallery" segment doesn't collide with
          any future /fortune/:cardId deep-link routing. */}
      <Route path="/fortune/gallery" element={<FortuneGallery />} />
      {/* v5.4.0 — 班味占卜 tarot-style daily fortune card. */}
      <Route path="/fortune" element={<Fortune />} />
      {/* v4.0.0 — "X 挑战你这一关" comparison flow. Friend opens this link
          → sees challenger's archetype + grade → accepts → plays the
          same scenario → comparison share card. */}
      <Route path="/fired/challenge/:code" element={<FiredChallenge />} />
      {/* v5.8.2 — settings (AI memory forget mechanism). */}
      <Route path="/settings" element={<Settings />} />
      {/* v6.2.0 — 🍺 深夜酒馆 1v1 (with an archetype, sharing via deeplink). */}
      <Route path="/bar/:archetype" element={<Bar />} />
      {/* v6.29 P4 — 周年纪念 mode: 6-milestone time capsule for v6 (28
          iteration rounds, 2026-05-21 → 2026-05-26). Linkable from
          social shares. */}
      <Route path="/anniversary" element={<Anniversary />} />
      {/* v6.37 P4 — 公司主题包 edit form. Lets users define 6-12 NPCs
          (name + optional role/personality) that override the default
          AI roster when starting a Classic game. */}
      <Route path="/company-pack/edit" element={<CompanyPackEdit />} />
      <Route path="/company-pack/edit/:packId" element={<CompanyPackEdit />} />
      {/* v6.38 P3 — read-only shared pack view + one-click import. */}
      <Route path="/company-pack/view/:packId" element={<CompanyPackView />} />
    </Routes>
    </Suspense>
    {/* v6.11 P4 — global overlay watching ?character=<name> deep-links
        from /share/character/:name social bounces. Renders nothing when
        the query is absent so other routes are unaffected. */}
    <CharacterFocusModal />
    {/* v6.30 P4 — global achievement unlock toast (cumulative spectator
        ratchet). Distinct from game/AchievementToast which is in-round. */}
    <AchievementUnlockToast />
    </>
  );
}
