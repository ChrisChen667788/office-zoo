/**
 * Structured logging — pino.
 *
 * Usage:
 *   import { logger } from './utils/logger';
 *   logger.info({ gameId, event: 'phase_change' }, 'Phase advanced');
 *
 * Child loggers (for per-request / per-game context):
 *   const log = logger.child({ reqId, gameId });
 *   log.warn({ reason: 'timeout' }, 'LLM call failed');
 *
 * Development: readable pretty-printed output.
 * Production (NODE_ENV=production): single-line JSON — ready for log shippers.
 */
import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  // In dev use pino-pretty transport for human-readable output. In prod,
  // keep raw JSON — cheaper and parseable by tools like Datadog / Loki.
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: {
    // Drop pino's default pid/hostname noise — we don't need them in dev.
    // In prod, set via env: PINO_BASE='{"service":"furball-server"}'
    ...tryParse(process.env.PINO_BASE),
  },
});

function tryParse(v: string | undefined): Record<string, unknown> {
  if (!v) return {};
  try {
    const parsed = JSON.parse(v);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Shorthand for common child-logger patterns.
 */
export function gameLogger(gameId: string) {
  return logger.child({ gameId });
}

export function reqLogger(reqId: string) {
  return logger.child({ reqId });
}
