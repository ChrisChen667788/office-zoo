import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { migrateLocalStorage } from './utils/lsMigrate';
import { initAnalytics } from './utils/analytics';
import './index.css';

// v6.25 P8 — one-shot localStorage namespace migration (office-arena.* →
// office-zoo.*). Runs before React mounts so any module reading from
// localStorage during render sees the migrated keys. Idempotent (guarded
// by office-zoo.lsmigrated.v1 flag).
migrateLocalStorage();
// v6.163 — 服务器配置了 Umami 才会加载统计脚本,否则完全 no-op。
void initAnalytics();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
