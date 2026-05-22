/**
 * pgvectorClient — v5.8.0 Phase B memory infrastructure.
 *
 * Single Postgres pool + idempotent schema initialisation for the
 * `memory_entries` table that backs episodic + reflection memory for
 * classic-mode agents.
 *
 * Two deploy targets:
 *   - dev: local pgvector container via `docker compose up -d` (port 5433)
 *   - prod: Neon serverless Postgres (set PGVECTOR_URL env)
 *
 * Schema spec lives in docs/V5.8_MEMORY_RFC.md §3.2 — when that
 * document changes, this file is the implementation of record.
 *
 * Public surface:
 *   - getPool()         — singleton pg.Pool, lazily constructed
 *   - ensureSchema()    — CREATE EXTENSION + CREATE TABLE + CREATE INDEX
 *                         idempotent. Safe to call on every server boot.
 *   - shutdown()        — close pool (for graceful server shutdown)
 *
 * Not exported: the raw connection details. All callers go through the
 * pool so connection lifecycle stays centralised.
 */

import { Pool, type PoolConfig } from 'pg';
import pgvector from 'pgvector/pg';

/**
 * Connection URL resolution order:
 *   1. PGVECTOR_URL env (prod Neon, or any override)
 *   2. local Docker compose default — postgresql://furball:furball@localhost:5433/furball
 *
 * The dev default exists so a teammate who just cloned the repo and ran
 * `docker compose up -d` can immediately run the server with no .env edits.
 */
function resolveConnectionConfig(): PoolConfig {
  const url = process.env.PGVECTOR_URL?.trim();
  if (url) {
    return {
      connectionString: url,
      // Neon requires SSL but encodes it in the URL (sslmode=require).
      // node-pg respects that, so we don't force ssl here — leaves the
      // dev-local case (no SSL) working without env juggling.
    };
  }
  return {
    host: 'localhost',
    port: 5433,
    user: 'furball',
    password: 'furball',
    database: 'furball',
    // Smallish pool — single Node process, embedding+recall are short
    // queries. Bumped if Phase C (multi-player rooms) materially raises
    // concurrent agent count.
    max: 10,
    idleTimeoutMillis: 30_000,
  };
}

let _pool: Pool | null = null;
let _schemaInitialised = false;
let _initPromise: Promise<void> | null = null;
let _vectorTypeRegistered = false;

export function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool(resolveConnectionConfig());
    _pool.on('error', (err) => {
      // pg.Pool emits these for idle clients — don't crash the process
      // (caller will see the next query rejection if it's a real outage).
      console.error('[pgvector] idle client error:', err.message);
    });
    // Note: vector type registration happens INSIDE ensureSchema() after
    // CREATE EXTENSION. Registering here (before extension exists) throws
    // "vector type not found in the database" — a chicken/egg footgun
    // we tripped on first run of the v5.8.0 probe (2026-05-22).
  }
  return _pool;
}

/**
 * Idempotent schema bootstrap. Run once at server start; the second call
 * within a process is a cheap memoised no-op.
 *
 * Order matters:
 *   1. CREATE EXTENSION vector   — pgvector binary serialisation depends on
 *                                  the catalog having the vector type
 *   2. pgvector.registerType()   — wires pool to read/write that type
 *   3. CREATE TABLE              — column uses VECTOR(1536)
 *   4. CREATE INDEX              — indexes target the table
 */
export async function ensureSchema(): Promise<void> {
  if (_schemaInitialised) return;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const pool = getPool();
    // pgvector.registerType operates on individual Client instances (it
    // calls client.setTypeParser, which Pool itself doesn't expose).
    // Strategy:
    //   1. Acquire one client manually for the bootstrap
    //   2. CREATE EXTENSION on it (so the type exists)
    //   3. registerType on it (parser table now has VECTOR OID)
    //   4. Run remaining DDL on the same client (vector-aware)
    //   5. Hook pool.on('connect') so EVERY subsequent client also
    //      gets registerType — otherwise reads from later requests
    //      come back as raw '[v1,v2,...]' strings instead of number[]
    //   6. Release the bootstrap client back to the pool
    const client = await pool.connect();
    try {
      // CREATE EXTENSION needs superuser on Postgres < 14 sometimes, but
      // pgvector image runs as POSTGRES_USER (superuser by default) and
      // Neon grants it on the free tier.
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');

      // Register on this bootstrap client immediately so the next
      // queries in this very transaction know about VECTOR.
      await pgvector.registerType(client);

      // Hook future-acquired clients (only once per pool lifetime).
      if (!_vectorTypeRegistered) {
        pool.on('connect', (c) => {
          // Fire-and-forget — if it fails on a single client, that
          // client's queries will fall back to text-mode VECTOR
          // (still functional, just less ergonomic).
          pgvector.registerType(c).catch((err: Error) => {
            console.error('[pgvector] per-connection registerType failed:', err.message);
          });
        });
        _vectorTypeRegistered = true;
      }

      await client.query(`
        CREATE TABLE IF NOT EXISTS memory_entries (
          id                BIGSERIAL PRIMARY KEY,
          agent_archetype   TEXT NOT NULL,
          target_user_id    TEXT,
          target_player_id  TEXT,
          source_game_id    TEXT,
          source_round      INT,
          ts                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          kind              TEXT NOT NULL,
          content           TEXT NOT NULL,
          embedding         VECTOR(1536),
          importance        REAL NOT NULL DEFAULT 0.5,
          decay_ts          TIMESTAMPTZ
        )
      `);

      // Composite covering index for the dominant recall query shape:
      // "memories that THIS agent has about THIS player, by kind".
      // ~95% of recall traffic hits this index per RFC §3.2.
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_mem_agent_target
          ON memory_entries (agent_archetype, target_user_id, kind)
      `);

      // HNSW vector index for cosine-distance search. m=16 / ef_construction=64
      // is the pgvector default sweet spot for ≤1M rows.
      // Note: HNSW builds slower than IVFFlat but query latency is the
      // priority for memory recall (it runs inline on every speech).
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_mem_embedding
          ON memory_entries
          USING hnsw (embedding vector_cosine_ops)
          WITH (m = 16, ef_construction = 64)
      `);

      _schemaInitialised = true;
    } finally {
      client.release();
    }
  })();
  try {
    await _initPromise;
  } finally {
    _initPromise = null;
  }
}

/** Graceful shutdown — called by process exit handlers. After this the
 *  next getPool() recreates the pool, so it's safe to call mid-process
 *  if you want to force a reconnect (rare). */
export async function shutdown(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _schemaInitialised = false;
    _vectorTypeRegistered = false;
  }
}
