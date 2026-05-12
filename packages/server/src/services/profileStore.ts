/**
 * profileStore — v1.3.0 per-user "你是哪种打工人" identity persistence.
 *
 * Keyed by the same pseudonymous X-User-Id used everywhere else
 * (see client/utils/userId.ts). Stores the user's most recent quiz
 * result + LLM-personalized catchphrases so subsequent visits show
 * the profile card without re-quizzing.
 *
 * Same JSON-file pattern as scriptStore + scenarioStore + packStore +
 * b2bStore. Atomic-rename writes, lazy load, in-mem cache.
 *
 * On disk: packages/server/data/user_profiles.json
 *   { profiles: { [userId]: UserProfile } }
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TraitVector } from '@furball/shared';
import type { PersonalizedProfile } from './profileGenerator';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DATA_DIR  = path.resolve(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'user_profiles.json');

export interface UserProfile {
  userId: string;
  /** Top-3 archetype ids by similarity score; index 0 is the "you are
   *  this" pick, [1] + [2] surface as "你也有点像 X / Y". */
  topArchetypes: [string, string, string];
  /** Raw 6-dim trait vector from quiz answers — needed to render the
   *  radar chart on the card. */
  traits: TraitVector;
  /** LLM-personalized 3 catchphrases + tagline. */
  personalized: PersonalizedProfile;
  /** Unix ms — used to gate "you can re-quiz once a week" if we ever
   *  want to encourage refreshing identity. v1.3.0 lets unlimited
   *  re-quizzing; the constraint is purely UX. */
  takenAt: number;
}

interface StoreShape {
  profiles: Record<string, UserProfile>;
}

let cache: StoreShape | null = null;
let loadPromise: Promise<StoreShape> | null = null;

async function loadFromDisk(): Promise<StoreShape> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    if (!parsed.profiles || typeof parsed.profiles !== 'object') return { profiles: {} };
    return { profiles: parsed.profiles };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { profiles: {} };
    console.error('[profileStore] load failed:', err);
    return { profiles: {} };
  }
}

async function ensureLoaded(): Promise<StoreShape> {
  if (cache) return cache;
  if (!loadPromise) loadPromise = loadFromDisk().then((s) => { cache = s; return s; });
  return loadPromise;
}

async function persist(state: StoreShape): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmp, DATA_FILE);
}

export async function findProfile(userId: string): Promise<UserProfile | null> {
  const s = await ensureLoaded();
  return s.profiles[userId] ?? null;
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  const s = await ensureLoaded();
  s.profiles[profile.userId] = profile;
  await persist(s);
}
