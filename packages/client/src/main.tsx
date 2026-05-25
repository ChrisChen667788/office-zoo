import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { migrateLocalStorage } from './utils/lsMigrate';
import './index.css';

// v6.25 P8 — one-shot localStorage namespace migration (office-arena.* →
// office-zoo.*). Runs before React mounts so any module reading from
// localStorage during render sees the migrated keys. Idempotent (guarded
// by office-zoo.lsmigrated.v1 flag).
migrateLocalStorage();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
