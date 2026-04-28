import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Resolve paths first — CWD may be packages/server/ in workspace mode
const __filename2 = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
const __dirname2 = path.dirname(__filename2);

// Load .env from monorepo root (../../.. from src/index.ts = monorepo root)
dotenv.config({ path: path.resolve(__dirname2, '../../../.env') });
// Also try CWD/.env as fallback (won't override existing)
dotenv.config();

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { Server as SocketServer } from 'socket.io';
import { createServer } from 'http';
import { cors } from 'hono/cors';
import { setupSocketHandler, getServerStats } from './socket/socketHandler';
import { ttsRoutes } from './routes/tts';
import { mediaRoutes } from './routes/media';
import { firedRouter } from './routes/fired';
import { shareRoutes } from './routes/share';
import { logger } from './utils/logger';
import { requestIdMiddleware } from './middleware/requestId';

const PROCESS_START_MS = Date.now();

const app = new Hono();
app.use('*', cors());
app.use('*', requestIdMiddleware);

// API routes
app.route('/api/tts', ttsRoutes);
app.route('/api/media', mediaRoutes);
app.route('/api/fired', firedRouter);
app.route('/api/share', shareRoutes);

// Serve generated avatars + icons as static PNGs.
// Two near-identical routes share a helper — not worth abstracting further
// because both directories are otherwise independent (avatars are churned
// per-game via TTL; icons are a build-time asset set).
const avatarDir = path.resolve(__dirname2, '../public/avatars');
const iconDir = path.resolve(__dirname2, '../public/icons');
if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });
if (!fs.existsSync(iconDir))   fs.mkdirSync(iconDir,   { recursive: true });

// Detect actual image format from magic bytes — Minimax `image_generation`
// returns JPEG even when we asked for PNG, so trusting the file extension
// gave Safari the wrong Content-Type and the avatar silently failed to render
// (Chrome is more forgiving). This sniffs the first few bytes of the file.
function sniffImageType(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46
      && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
  return 'application/octet-stream';
}

function servePng(dir: string) {
  return async (c: { req: { param: (name: string) => string }; json: (obj: unknown, code: number) => Response }) => {
    const filename = c.req.param('filename');
    // Prevent path traversal — filenames must stay within the served dir.
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      return c.json({ error: 'invalid filename' }, 400);
    }
    const filePath = path.join(dir, filename);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath);
      return new Response(data, {
        headers: { 'Content-Type': sniffImageType(data), 'Cache-Control': 'public, max-age=3600' },
      });
    }
    return c.json({ error: 'not found' }, 404);
  };
}

app.get('/avatars/:filename', servePng(avatarDir));
app.get('/icons/:filename',   servePng(iconDir));

// ---------------------------------------------------------------------------
// Health check — honest one. Returns:
//   status        "ok" | "degraded"   "degraded" if required env missing
//   uptimeMs      process uptime
//   activeGames   current in-memory game count (sanity check for leaks)
//   memory        RSS / heap used (MB)
//   env           which critical env vars are configured (not the values)
// ---------------------------------------------------------------------------
app.get('/api/health', (c) => {
  const stats = getServerStats();
  const mem = process.memoryUsage();

  const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
  const envFlags = {
    OPENAI_API_KEY: hasOpenAIKey,
    MINIMAX_API_KEY: !!process.env.MINIMAX_API_KEY,
    QINGYUN_API_KEY: !!process.env.QINGYUN_API_KEY,
  };

  // OpenAI is the one truly required dependency — without it speeches /
  // scoring / suggestions all fail. TTS degrading is non-fatal.
  const status: 'ok' | 'degraded' = hasOpenAIKey ? 'ok' : 'degraded';

  return c.json({
    status,
    uptimeMs: Date.now() - PROCESS_START_MS,
    activeGames: stats.activeGames,
    pendingCleanups: stats.pendingCleanups,
    oldestGameAgeMs: stats.oldestGameAgeMs,
    memory: {
      rssMB: Math.round(mem.rss / 1024 / 1024),
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
    },
    env: envFlags,
  });
});

const port = parseInt(process.env.PORT || '3100');
const wsPort = parseInt(process.env.WS_PORT || '3101');

// HTTP server
serve({ fetch: app.fetch, port }, () => {
  logger.info({ port }, 'HTTP server listening');
});

// WebSocket server on separate port
const httpServer = createServer();
const io = new SocketServer(httpServer, {
  cors: { origin: '*' },
  maxHttpBufferSize: 10e6,
  pingInterval: 30000,
  pingTimeout: 120000, // 2 min timeout - AI speech generation can take 30-60s
});

setupSocketHandler(io);

httpServer.listen(wsPort, () => {
  logger.info({ wsPort }, 'WebSocket server listening');
});

// Unhandled rejections / uncaught exceptions — log and don't silently die.
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandledRejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaughtException');
  // Let the process exit after flushing — crash-only design is safer than
  // attempting to limp along in an unknown state.
  setTimeout(() => process.exit(1), 100).unref();
});
