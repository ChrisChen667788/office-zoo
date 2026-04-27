import type { MiddlewareHandler } from 'hono';
import { nanoid } from 'nanoid';
import { logger } from '../utils/logger';

/**
 * Attach a short request ID + a child logger to each request.
 *
 * Access in routes via:
 *   c.var.reqId      // string
 *   c.var.log        // pino child logger bound to { reqId, method, path }
 *
 * Also:
 *  - Propagates the incoming X-Request-Id header if present (upstream may set)
 *  - Writes a start/end log line with duration + status
 *  - Echoes the reqId back in the response header for correlation
 */
export const requestIdMiddleware: MiddlewareHandler = async (c, next) => {
  const incoming = c.req.header('x-request-id');
  const reqId = incoming && incoming.length <= 64 ? incoming : nanoid(10);
  const method = c.req.method;
  const path = c.req.path;
  const log = logger.child({ reqId, method, path });

  // @ts-expect-error — Hono's c.var is untyped at module scope, we attach ad hoc.
  c.set('reqId', reqId);
  // @ts-expect-error — same reason.
  c.set('log', log);

  const startedAt = Date.now();
  log.debug('request start');

  try {
    await next();
  } finally {
    const durationMs = Date.now() - startedAt;
    const status = c.res.status;
    // Echo req id so frontend / curl can correlate with server logs.
    c.res.headers.set('x-request-id', reqId);

    // Downgrade noisy health/static hits to debug; keep real API at info.
    const isNoisy = path === '/api/health' || path.startsWith('/avatars/');
    const lvl =
      status >= 500 ? 'error' : status >= 400 ? 'warn' : isNoisy ? 'debug' : 'info';
    log[lvl]({ status, durationMs }, 'request end');
  }
};
