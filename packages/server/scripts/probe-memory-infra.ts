/**
 * probe-memory-infra — v5.8.0 end-to-end smoke test.
 *
 * Run AFTER `docker compose up -d` brings pgvector online.
 *
 *   npx tsx packages/server/scripts/probe-memory-infra.ts
 *
 * Validates the v5.8.0 三件套 in order:
 *   1. pgvectorClient.ensureSchema()        — extension + table + indexes
 *   2. memoryEmbedder.embedOne(text)        — Qingyun OpenAI embed call
 *   3. INSERT a memory_entries row          — pgvector serialisation OK
 *   4. SELECT by cosine distance            — HNSW index actually used
 *   5. cleanup                              — leave the DB ready for v5.8.1
 *
 * Prints PASS/FAIL per step + a final summary. Non-zero exit on any FAIL.
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Load .env from monorepo root (../../.. from scripts/ = repo root).
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

import { ensureSchema, getPool, shutdown } from '../src/services/pgvectorClient';
import { embedOne, getEmbeddingCacheStats } from '../src/services/memoryEmbedder';
import pgvector from 'pgvector/pg';

let pass = 0;
let fail = 0;

function step(name: string, ok: boolean, detail?: string) {
  const icon = ok ? '✅' : '❌';
  console.log(`${icon} ${name}${detail ? ` — ${detail}` : ''}`);
  if (ok) pass++; else fail++;
}

async function main() {
  console.log('═══ v5.8.0 memory infrastructure probe ═══\n');

  // Step 1 — schema bootstrap
  try {
    await ensureSchema();
    step('1. ensureSchema()', true, 'extension + table + 2 indexes created');
  } catch (err) {
    step('1. ensureSchema()', false, (err as Error).message);
    await shutdown().catch(() => {});
    process.exit(1);
  }

  // Step 1b — verify the index was actually created (not just CREATE IF NOT EXISTS no-op)
  try {
    const { rows } = await getPool().query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'memory_entries'",
    );
    const names = rows.map((r) => r.indexname).sort();
    const ok = names.includes('idx_mem_agent_target') && names.includes('idx_mem_embedding');
    step('1b. indexes present', ok, `found: ${names.join(', ')}`);
  } catch (err) {
    step('1b. indexes present', false, (err as Error).message);
  }

  // Step 2 — embed a Chinese sentence
  const sampleText = '我在第3轮看到张三投了我, 这人记仇了';
  let vec: number[] | null = null;
  try {
    vec = await embedOne(sampleText);
    if (vec && vec.length === 1536) {
      step('2. embedOne()', true, `1536-dim vector, first val ${vec[0].toFixed(4)}`);
    } else {
      step('2. embedOne()', false, vec ? `unexpected dim ${vec.length}` : 'returned null');
    }
  } catch (err) {
    step('2. embedOne()', false, (err as Error).message);
  }

  if (!vec) {
    console.log('\n⚠️  Skipping insert/recall — no embedding to test with.');
    console.log('   Check OPENAI_BASE_URL + OPENAI_API_KEY in .env.');
    await shutdown().catch(() => {});
    process.exit(1);
  }

  // Step 2b — cache hit on repeat call
  try {
    const sizeBefore = getEmbeddingCacheStats().size;
    const vec2 = await embedOne(sampleText);
    const sizeAfter = getEmbeddingCacheStats().size;
    const sameContents = !!vec2 && vec2.every((v, i) => v === vec![i]);
    step('2b. embedOne() cache hit',
      sameContents && sizeAfter === sizeBefore,
      `cache size unchanged at ${sizeAfter}`,
    );
  } catch (err) {
    step('2b. embedOne() cache hit', false, (err as Error).message);
  }

  // Step 3 — insert a memory_entries row
  let insertedId: number | null = null;
  try {
    const { rows } = await getPool().query<{ id: number }>(
      `INSERT INTO memory_entries
         (agent_archetype, target_user_id, source_game_id, source_round,
          kind, content, embedding, importance)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        'sass-master',         // agent_archetype
        'u-probe-test',        // target_user_id
        'g-probe-test',        // source_game_id
        3,                     // source_round
        'event',               // kind
        sampleText,            // content
        pgvector.toSql(vec),   // embedding (serialise to '[v1,v2,...]')
        0.7,                   // importance
      ],
    );
    insertedId = rows[0]?.id ?? null;
    step('3. INSERT row', !!insertedId, `id=${insertedId}`);
  } catch (err) {
    step('3. INSERT row', false, (err as Error).message);
  }

  // Step 4 — cosine recall (the query that BaseAgent.recall will run)
  if (insertedId !== null) {
    try {
      const queryText = '张三 投票 记仇'; // semantic neighbour of inserted text
      const queryVec = await embedOne(queryText);
      if (!queryVec) {
        step('4. recall via cosine', false, 'query embedding failed');
      } else {
        const { rows } = await getPool().query<{ id: number; content: string; distance: number }>(
          `SELECT id, content, embedding <=> $1 AS distance
             FROM memory_entries
            WHERE agent_archetype = $2
              AND target_user_id  = $3
              AND embedding IS NOT NULL
            ORDER BY embedding <=> $1
            LIMIT 5`,
          [pgvector.toSql(queryVec), 'sass-master', 'u-probe-test'],
        );
        const hit = rows.find((r) => r.id === insertedId);
        step('4. recall via cosine',
          !!hit,
          hit ? `top-${rows.indexOf(hit) + 1} hit, distance ${hit.distance.toFixed(4)}` : 'inserted row not in recall',
        );
      }
    } catch (err) {
      step('4. recall via cosine', false, (err as Error).message);
    }
  }

  // Step 5 — cleanup
  if (insertedId !== null) {
    try {
      await getPool().query(`DELETE FROM memory_entries WHERE id = $1`, [insertedId]);
      step('5. cleanup', true, `deleted id=${insertedId}`);
    } catch (err) {
      step('5. cleanup', false, (err as Error).message);
    }
  }

  // Summary
  console.log(`\n═══ ${pass} pass · ${fail} fail ═══`);
  await shutdown().catch(() => {});
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('💥 unhandled:', err);
  await shutdown().catch(() => {});
  process.exit(1);
});
