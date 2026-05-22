/**
 * memoryWrite — v5.8.1 fire-and-forget memory entry writer.
 *
 * Public surface:
 *   - writeMemory(entry)                — single entry, embed + INSERT
 *   - writeMemoryBatch(entries)         — batch embed + multi-row INSERT
 *
 * Both flavours are fire-and-forget — they swallow errors after logging,
 * because losing a memory write must NEVER block the game loop. The
 * worst-case outcome is a missing memory, which the next reflection
 * pass can partially regenerate from speech transcripts.
 *
 * Embedding strategy:
 *   - Try to embed; if it fails, store the row with embedding=NULL per
 *     RFC §5.6. Recall falls back to LIKE search for null-embedding rows.
 *   - Batch path embeds all entries in one Qingyun roundtrip for the
 *     round-end burst (8 agents × 1 summary event = 1 API call).
 *
 * NOT exported:
 *   - direct SQL — callers should never compose memory INSERTs themselves
 *     (consistent embedding handling lives only here).
 */

import { getPool, ensureSchema } from './pgvectorClient';
import { embedOne, embedMany } from './memoryEmbedder';
import pgvector from 'pgvector/pg';

export type MemoryKind = 'event' | 'belief' | 'relationship';

export interface MemoryEntryInput {
  /** Personality id of the remembering agent. e.g. 'sass-master', 'social-cat'.
   *  This is the "person" the player meets across games (RFC §3.2). */
  agentArchetype: string;
  /** Optional: human player's X-User-Id, when memory is "about" a human.
   *  Currently NULL for classic mode (no human players yet — see v5.8.1
   *  scope note in CHANGELOG). */
  targetUserId?: string | null;
  /** Optional: another AI player's in-game id (player_0..7) — for
   *  "this AI remembers what THAT AI did to me last game". */
  targetPlayerId?: string | null;
  /** Where the memory came from. NULL only for reflection-derived beliefs. */
  sourceGameId?: string | null;
  sourceRound?: number | null;
  kind: MemoryKind;
  /** Natural language. e.g. "在 game_xyz 第3轮, 我目睹 @张三 投了 @李四 出局".
   *  Short + concrete is best for embedding recall precision. */
  content: string;
  /** 0-1. Defaults to 0.5 for events, callers override for kill / vote-out
   *  events (typically 0.8) and reflection beliefs (0.7). */
  importance?: number;
}

/** Single-entry write. Returns the inserted id, or null on failure
 *  (caller already shouldn't need it — this is fire-and-forget by
 *  convention, but the return is here for the verification script). */
export async function writeMemory(entry: MemoryEntryInput): Promise<number | null> {
  try {
    await ensureSchema();
    // Embedding failure is non-fatal — row still written with NULL,
    // recall path handles via LIKE fallback (RFC §5.6).
    const vec = await embedOne(entry.content);
    const pool = getPool();
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO memory_entries
         (agent_archetype, target_user_id, target_player_id,
          source_game_id, source_round, kind, content, embedding, importance)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        entry.agentArchetype,
        entry.targetUserId ?? null,
        entry.targetPlayerId ?? null,
        entry.sourceGameId ?? null,
        entry.sourceRound ?? null,
        entry.kind,
        entry.content,
        vec ? pgvector.toSql(vec) : null,
        entry.importance ?? 0.5,
      ],
    );
    return rows[0]?.id ?? null;
  } catch (err) {
    console.error('[memoryWrite] insert failed:', (err as Error).message);
    return null;
  }
}

/** Batch write — efficient for the round-end burst where 8 agents
 *  each get a summary event. One API call embeds everything; one
 *  multi-row INSERT lands them. Returns array of (id | null) parallel
 *  to inputs, so callers can correlate failures. */
export async function writeMemoryBatch(entries: MemoryEntryInput[]): Promise<(number | null)[]> {
  if (entries.length === 0) return [];
  try {
    await ensureSchema();
    const vecs = await embedMany(entries.map((e) => e.content));
    const pool = getPool();

    // Build a multi-row INSERT with a single VALUES list. We use $N
    // placeholders rather than constructing the string with values inline
    // for SQL-injection safety even though content is server-controlled.
    const placeholders: string[] = [];
    const params: unknown[] = [];
    entries.forEach((e, i) => {
      const base = i * 9;
      placeholders.push(
        `($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6}, $${base+7}, $${base+8}, $${base+9})`,
      );
      const vec = vecs[i];
      params.push(
        e.agentArchetype,
        e.targetUserId ?? null,
        e.targetPlayerId ?? null,
        e.sourceGameId ?? null,
        e.sourceRound ?? null,
        e.kind,
        e.content,
        vec ? pgvector.toSql(vec) : null,
        e.importance ?? 0.5,
      );
    });
    const sql = `
      INSERT INTO memory_entries
        (agent_archetype, target_user_id, target_player_id,
         source_game_id, source_round, kind, content, embedding, importance)
      VALUES ${placeholders.join(', ')}
      RETURNING id
    `;
    const { rows } = await pool.query<{ id: number }>(sql, params);
    return rows.map((r) => r.id);
  } catch (err) {
    console.error('[memoryWrite] batch insert failed:', (err as Error).message);
    return entries.map(() => null);
  }
}
