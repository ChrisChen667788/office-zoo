import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

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
      '/api':     'http://localhost:3100',
      // Same-origin proxy for AI-generated assets. Without this the browser
      // hits :3100 cross-origin — usually fine for <img>, but Safari ITP can
      // silently fail to render images served from a different port even
      // within the same hostname. Proxying removes the cross-origin axis.
      '/avatars': 'http://localhost:3100',
      '/icons':   'http://localhost:3100',
      // v5.1.0 — talkshow persona portraits (parallel to /avatars + /icons).
      // Without this proxy, GET /talkshow-personas/<id>.png falls through
      // to the SPA index.html → the <img> tag's onError fires → the emoji
      // fallback shows up everywhere, defeating the whole v5.1.0 visual
      // upgrade. Caught the first time the user reloaded after v5.1.0
      // shipped.
      '/talkshow-personas': 'http://localhost:3100',
      // v5.2.0 — archetype portraits, lazy-generated server-side.
      '/archetype-portraits': 'http://localhost:3100',
      '/socket.io': {
        target: 'http://localhost:3101',
        ws: true
      }
    }
  }
});
