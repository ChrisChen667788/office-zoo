import { Routes, Route } from 'react-router-dom';
import Landing from './routes/Landing';
import Classic from './routes/Classic';
import Immersive from './routes/Immersive';
import Result from './routes/Result';
import FiredLanding from './routes/FiredLanding';
import FiredChat from './routes/FiredChat';
import FiredResult from './routes/FiredResult';

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
    </Routes>
  );
}
