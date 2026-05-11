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
    </Routes>
  );
}
