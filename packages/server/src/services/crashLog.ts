/**
 * crashLog — v6.55 #1 — persistent engine-crash log.
 *
 * pino logs to stdout, which isn't captured when the dev server runs
 * detached — so an intermittent "经典局推进一段时间后报错卡死" left no trail
 * to diagnose from. This appends every contained game-loop crash to a file
 * with the gameId / round / phase / stack, so a recurrence is greppable
 * after the fact (the missing-log gap that blocked root-causing).
 *
 * On disk: packages/server/data/engine-crashes.log  (gitignored)
 * Best-effort: logging must NEVER throw back into the caller.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'engine-crashes.log');

export async function logEngineCrash(ctx: {
  gameId: string;
  round: number;
  phase: string;
  err: unknown;
}): Promise<void> {
  try {
    const detail = ctx.err instanceof Error ? (ctx.err.stack ?? ctx.err.message) : String(ctx.err);
    const line = `[${new Date().toISOString()}] game=${ctx.gameId} round=${ctx.round} phase=${ctx.phase}\n${detail}\n\n`;
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.appendFile(FILE, line, 'utf8');
  } catch {
    /* a crash logger that crashes helps no one — swallow */
  }
}
