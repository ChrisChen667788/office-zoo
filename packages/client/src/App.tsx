import { Routes, Route } from 'react-router-dom';
import Landing from './routes/Landing';
import Classic from './routes/Classic';
import Immersive from './routes/Immersive';
import Result from './routes/Result';
import FiredLanding from './routes/FiredLanding';
import FiredChat from './routes/FiredChat';
import FiredResult from './routes/FiredResult';
import FiredPack from './routes/FiredPack';
import FiredRoom from './routes/FiredRoom';
import Talkshow from './routes/Talkshow';
import Premium from './routes/Premium';
import B2bBuilder from './routes/B2bBuilder';
import B2bEmbed from './routes/B2bEmbed';
import Quiz from './routes/Quiz';
import Profile from './routes/Profile';
import Squad from './routes/Squad';
import SquadHistory from './routes/SquadHistory';
import FiredChallenge from './routes/FiredChallenge';
import FiredLeaderboard from './routes/FiredLeaderboard';
import FiredDailyChallenge from './routes/FiredDailyChallenge';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/classic/:gameId" element={<Classic />} />
      <Route path="/immersive/new" element={<Immersive />} />
      <Route path="/immersive/:gameId" element={<Immersive />} />
      <Route path="/result/:gameId" element={<Result />} />
      <Route path="/fired" element={<FiredLanding />} />
      <Route path="/fired/chat" element={<FiredChat />} />
      <Route path="/fired/result" element={<FiredResult />} />
      {/* v0.9.0 — UGC pack play view (5 sequential scenarios). */}
      <Route path="/fired/pack/:packId" element={<FiredPack />} />
      {/* v0.9.3 — PvP room (worker vs human-HR). roomId="new" + ?scenarioId
          spawns a fresh room; existing rooms join via ?role=worker|hr. */}
      <Route path="/fired/room/:roomId" element={<FiredRoom />} />
      <Route path="/talkshow" element={<Talkshow />} />
      {/* v1.0.0 — Premium paywall + demo checkout. */}
      <Route path="/premium" element={<Premium />} />
      {/* v1.1.0 — B2B white-label builder + iframe embed target. */}
      <Route path="/b2b" element={<B2bBuilder />} />
      <Route path="/embed/:configId" element={<B2bEmbed />} />
      {/* v1.3.0 — "你是哪种打工人?" personality quiz + shareable profile card. */}
      <Route path="/quiz" element={<Quiz />} />
      <Route path="/profile/me" element={<Profile />} />
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
      {/* v4.0.0 — "X 挑战你这一关" comparison flow. Friend opens this link
          → sees challenger's archetype + grade → accepts → plays the
          same scenario → comparison share card. */}
      <Route path="/fired/challenge/:code" element={<FiredChallenge />} />
    </Routes>
  );
}
