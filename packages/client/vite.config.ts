import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// v6.160 — 代理目标可用环境变量改端口(默认不变):本机 3100/3101 被别的服务占用时,
// FURBALL_API_PORT=3200 PORT=3200 WS_PORT=3201 npm run dev 即可整套挪开。
// API 端口不读 PORT —— 预览类工具常给 vite 进程注入 PORT=5173,会把代理指回 vite 自己。
const API = `http://localhost:${process.env.FURBALL_API_PORT ?? '3100'}`;
const WS = `http://localhost:${process.env.WS_PORT ?? '3101'}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@furball/shared': path.resolve(__dirname, '../shared/src')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api':     API,
      // Same-origin proxy for AI-generated assets. Without this the browser
      // hits :3100 cross-origin — usually fine for <img>, but Safari ITP can
      // silently fail to render images served from a different port even
      // within the same hostname. Proxying removes the cross-origin axis.
      '/avatars': API,
      '/icons':   API,
      // v5.1.0 — talkshow persona portraits (parallel to /avatars + /icons).
      // Without this proxy, GET /talkshow-personas/<id>.png falls through
      // to the SPA index.html → the <img> tag's onError fires → the emoji
      // fallback shows up everywhere, defeating the whole v5.1.0 visual
      // upgrade. Caught the first time the user reloaded after v5.1.0
      // shipped.
      '/talkshow-personas': API,
      // v5.2.0 — archetype portraits, lazy-generated server-side.
      '/archetype-portraits': API,
      '/socket.io': {
        target: WS,
        ws: true
      }
    }
  }
});
