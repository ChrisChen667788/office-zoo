// v6.165 — 必须是第一个 import:在任何业务模块求值前加载 .env(见 env.ts)。
import './env';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Resolve paths first — CWD may be packages/server/ in workspace mode
const __filename2 = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
const __dirname2 = path.dirname(__filename2);

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { Server as SocketServer } from 'socket.io';
import { createServer } from 'http';
import { setupSocketHandler, getServerStats } from './socket/socketHandler';
import { setupFiredRoomHandler } from './socket/firedRoomHandler';
import { setupSquadHandler } from './socket/squadHandler';
import { ttsRoutes } from './routes/tts';
import { mediaRoutes } from './routes/media';
import { firedRouter } from './routes/fired';
import { shareRoutes } from './routes/share';
import { talkshowRoutes } from './routes/talkshow';
import { b2bRoutes } from './routes/b2b';
import { quizRoutes } from './routes/quiz';
import { dailyRoutes } from './routes/daily';
import { squadRoutes } from './routes/squad';
import { dailyChallengeRoutes } from './routes/dailyChallenge';
import { fortuneRoutes } from './routes/fortune';
import { memoryRoutes } from './routes/memory';
import { weeklyRoutes } from './routes/weekly';
import { statsRoutes, initStatsPersistence } from './routes/stats';
import { banweiRoutes } from './routes/banwei';
import { leaderboardRoutes } from './routes/leaderboard';
import { hotQuotesRoutes } from './routes/hotQuotes';
import { companyPackRoutes } from './routes/companyPack';
import { barRoutes } from './routes/bar';
import { characterRoutes } from './routes/characters';
import { shareSocialRoutes } from './routes/shareSocial';
import { billingRoutes } from './routes/billing';
import { wrappedRoutes } from './routes/wrapped';
import { replayRoutes } from './routes/replay';
import { negotiationRoutes } from './routes/negotiation';
import { reactionRoutes } from './routes/reaction';
import { bettingRoutes } from './routes/betting';
import { relationRoutes } from './routes/relations';
import { configRoutes } from './routes/config';
import { llmStatsSnapshot } from './utils/llmStats';
import { ASSET_FAMILIES, runtimeAssetDir } from './utils/assetDirs';
import { serveAssetFile } from './utils/staticAssets';
import { clientDistDir, serveClient } from './utils/clientStatic';
import { isHosted } from './utils/deployProfile';
import { hostedFeatureGate } from './utils/hostedFeatures';
import type { Server as HttpServer } from 'http';
import { sweepOgCache } from './services/ogCardRenderer';
import { logger } from './utils/logger';
import { requestIdMiddleware } from './middleware/requestId';
import { originGuardMiddleware, corsForAllowedOrigins, socketOriginOptions } from './utils/originGuard';

const PROCESS_START_MS = Date.now();

const app = new Hono();
// v6.162 — 取代 cors() 全开。不放行的跨站 Origin 直接 403(CORS 头只挡读响应,挡不住
// text/plain POST 的执行);放行的跨域来源(ALLOWED_ORIGINS / 本机开发端口)才回 CORS 头。
app.use('*', originGuardMiddleware);
app.use('*', corsForAllowedOrigins());
// v6.168 — 托管版关闭收款 / B2B / 邮箱订阅接口(owner 决策,见 utils/hostedFeatures)。
app.use('*', hostedFeatureGate);
app.use('*', requestIdMiddleware);

// API routes
// v6.163 — 前端运行时公开配置(统计开关、部署形态;不含任何密钥)。
app.route('/api/config', configRoutes);
app.route('/api/tts', ttsRoutes);
app.route('/api/media', mediaRoutes);
app.route('/api/fired', firedRouter);
app.route('/api/share', shareRoutes);
app.route('/api/talkshow', talkshowRoutes);
app.route('/api/b2b', b2bRoutes);
app.route('/api/quiz', quizRoutes);
app.route('/api/daily', dailyRoutes);
app.route('/api/squad', squadRoutes);
// v6.8 — character IP roster (epithet + catchphrases + lifetime stats)
// powering the PersonaCard popover on Classic/Immersive.
app.route('/api/characters', characterRoutes);
// v6.51 P3 — real Stripe Checkout (test-mode, env-driven). Falls back to
// the client demo flow when STRIPE_SECRET_KEY is unset.
app.route('/api/billing', billingRoutes);
// v6.51 P4 — 班味 Wrapped 邮件订阅 (subscribe + pluggable sender; console
// until RESEND_API_KEY is set).
app.route('/api/wrapped', wrappedRoutes);
// v6.54 — 🎬 对局回放 read API (write side = socketHandler game_over hook).
app.route('/api/replay', replayRoutes);
// v6.58 — 「裁了么」闯关牌局 HR 台词(数值在客户端 shared 引擎跑,这里只配台词).
app.route('/api/negotiation', negotiationRoutes);
app.route('/api/reaction', reactionRoutes);
// v6.74 P3 — 观众下注盘全网战绩榜(筹码榜 / 神算榜;数值在客户端 shared/betting 引擎跑).
app.route('/api/betting', bettingRoutes);
// v6.75 — AI 记忆关系网(跨局记仇/记恩;GameEngine round-end 钩子喂,这里只读图).
app.route('/api/relations', relationRoutes);
// v6.11 P4 — public crawler-friendly share pages. Mounted at /share (NOT
// /api/share — keeps the path clean for social link sharing). Each route
// returns full HTML with og:* meta tags for Twitter/Slack/WeChat unfurl.
app.route('/share', shareSocialRoutes);
// v5.0.0 — global today-only challenge (everyone races the same scenario).
app.route('/api/daily-challenge', dailyChallengeRoutes);
// v5.4.0 — 班味占卜 daily fortune. Deterministic per (user, date)
// tarot-ish card pick from a 24-card deck.
app.route('/api/fortune', fortuneRoutes);
// v5.8.1 — Phase B memory ops (forget mechanism, stats). per-user scoped
// forget arrives in v5.8.2; this version covers global / by-archetype /
// by-game wipes (法务安全网 per RFC §5.4).
app.route('/api/memory', memoryRoutes);
// v6.5.0 — 周报生成器. 1 句关键事件 → 4 种风格周报 (阿里黑话 / PUA /
// 装腔 / 直球). Viral 杠杆: 同一事件被 4 种话术包装后, 对照感强烈。
app.route('/api/weekly', weeklyRoutes);
// v6.31 P5 — server-side aggregate stats (global + per-user via X-User-Id).
app.route('/api/stats', statsRoutes);
// v6.32 P5 — 班味指数 weekly score + WoW delta + history.
app.route('/api/banwei', banweiRoutes);
// v6.36 P4 — public cross-user top-10 班味 leaderboard. Reads the
// same banwei store; userId truncated to 8 chars in the response.
app.route('/api/leaderboard', leaderboardRoutes);
// v6.33 P4 — spectator-curated 班味金句池. Submitted quotes get
// injected into the next game's leakedHints alongside per-user PSYWAR.
app.route('/api/hot-quotes', hotQuotesRoutes);
// v6.37 P3 — user-curated 公司主题包. 6-12 NPCs with optional
// role/personality hints; Landing can start a game using a pack
// id to override the default name pool.
app.route('/api/company-pack', companyPackRoutes);
// v6.2.0 — 🍺 深夜酒馆 1v1 dialogue surface. Writes into the same
// memory_entries table so bar conversations carry over into classic
// mode AI prompts (see routes/bar.ts header comment).
app.route('/api/bar', barRoutes);

// Serve AI-generated static assets (avatars / icons / portraits / persona videos).
// v6.165 — 每个文件先找本机生成的原图(packages/server/public/<family>),找不到再用随仓库发布的
// 压缩资产包(packages/server/assets-pack/<family>);托管模式服务器不生图,全靠资产包。
// 之前 /fired-hr-portraits 与 /talkshow-personas-video 根本没挂路由(HR 立绘自 v6.99 起一直 404)。
for (const family of ASSET_FAMILIES) {
  const dir = runtimeAssetDir(family);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  app.get(`/${family}/:filename`, (c) => serveAssetFile(family, c.req.param('filename'), c.req.header('range')));
}

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
    // v6.163 — 进程内模型调用计数(只有次数与原因类别)。
    llm: llmStatsSnapshot(),
  });
});

// v6.166 — 生产 / 托管:服务器直接托管前端构建产物(同源同端口,见 utils/clientStatic)。
// 必须注册在所有 API 路由之后:只接住前面都没匹配上的 GET。
const clientDist = clientDistDir();
if (clientDist) {
  app.get('*', (c) => serveClient(clientDist, c.req.path) ?? c.json({ error: 'not found' }, 404));
  logger.info({ clientDist }, 'serving built client');
}

const port = parseInt(process.env.PORT || '3100');
const wsPort = parseInt(process.env.WS_PORT || '3101');
// v6.166 — 单端口模式:Socket.IO 挂在同一个 HTTP 服务上(托管平台通常只给一个端口)。
// hosted 默认开启;本机开发保持 3100 + 3101 双端口(vite 分别代理)。SINGLE_PORT=1/0 可强制。
const singlePort = process.env.SINGLE_PORT ? process.env.SINGLE_PORT === '1' : isHosted();

// HTTP server
const mainServer = serve({ fetch: app.fetch, port }, () => {
  logger.info({ port, singlePort }, 'HTTP server listening');
});

// v6.33 P5 — load persisted spectator counters + arm 60s flush timer.
initStatsPersistence();

// v6.13 — sweep OG cache directory at boot + every hour, dropping files
// older than 7 days. Keeps the disk bounded as stats invalidations
// rotate cache keys over time. Cheap (dozens of files).
sweepOgCache(7).then((r) => logger.info(r, 'og cache swept at boot'));
setInterval(() => {
  sweepOgCache(7).then((r) => logger.info(r, 'og cache hourly sweep'));
}, 60 * 60 * 1000);

// WebSocket server — separate port in local dev, same server in single-port mode.
const httpServer: HttpServer = singlePort ? (mainServer as HttpServer) : createServer();
const io = new SocketServer(httpServer, {
  // v6.162 — 握手按与 HTTP 相同的 Origin 规则放行(见 utils/originGuard)。
  ...socketOriginOptions(),
  maxHttpBufferSize: 10e6,
  pingInterval: 30000,
  pingTimeout: 120000, // 2 min timeout - AI speech generation can take 30-60s
});

setupSocketHandler(io);
// v0.9.3 — PvP room (worker vs human-HR) layered onto the same io
// instance. Uses `room:*` event namespace to stay clearly separate
// from `game:*` events that the main social-deduction engine owns.
setupFiredRoomHandler(io);
// v1.4.1 — squad mode (2-4 friends, LLM director writes 5-act sitcom)
setupSquadHandler(io);

if (!singlePort) {
  httpServer.listen(wsPort, () => {
    logger.info({ wsPort }, 'WebSocket server listening');
  });
}

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
