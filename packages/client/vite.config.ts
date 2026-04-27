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
      '/socket.io': {
        target: 'http://localhost:3101',
        ws: true
      }
    }
  }
});
