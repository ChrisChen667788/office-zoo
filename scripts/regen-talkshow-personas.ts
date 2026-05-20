#!/usr/bin/env npx tsx
/**
 * regen-talkshow-personas — v5.1.0 CLI to (re)generate the 6 talkshow
 * persona portraits.
 *
 * Usage:
 *   npx tsx scripts/regen-talkshow-personas.ts              # only missing
 *   npx tsx scripts/regen-talkshow-personas.ts --force      # regen all
 *   npx tsx scripts/regen-talkshow-personas.ts shaonv yujie # specific personas
 *
 * Writes PNGs to packages/server/public/talkshow-personas/<persona>.png.
 * Reads keys + base URLs from the monorepo-root .env (same as the
 * server). Walks the same model chain as imageGen — first model that
 * returns a usable image wins.
 *
 * Cost: ~6 calls × $0.04ish per Flux image = under $0.30 for a full
 * regen. Cached afterwards (won't re-call on subsequent dev starts).
 */

import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  generateTalkshowPersona,
  TALKSHOW_PERSONA_IDS,
} from '../packages/server/src/services/talkshowAvatarGen';

const __filename2 = fileURLToPath(import.meta.url);
const __dirname2 = path.dirname(__filename2);
const ROOT = path.resolve(__dirname2, '..');
const OUT_DIR = path.join(ROOT, 'packages/server/public/talkshow-personas');

const args = process.argv.slice(2);
const force = args.includes('--force');
const explicitIds = args.filter((a) => !a.startsWith('--'));

const ids = explicitIds.length > 0
  ? explicitIds.filter((id) => TALKSHOW_PERSONA_IDS.includes(id))
  : TALKSHOW_PERSONA_IDS;

if (explicitIds.length > 0 && ids.length === 0) {
  console.error(`No matching personas. Known ids: ${TALKSHOW_PERSONA_IDS.join(', ')}`);
  process.exit(1);
}

if (force) {
  // Wipe targets so the cached-file check in generateTalkshowPersona
  // falls through and re-hits the API.
  for (const id of ids) {
    const p = path.join(OUT_DIR, `${id}.png`);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      console.log(`  - removed ${id}.png`);
    }
  }
}

// Wrap in IIFE — tsx defaults to CJS where top-level await is rejected.
(async () => {
  console.log(`\n${force ? 'Force regenerating' : 'Filling in missing'} ${ids.length} talkshow persona(s): ${ids.join(', ')}\n`);

  const start = Date.now();
  let ok = 0, fail = 0;
  for (const id of ids) {
    const url = await generateTalkshowPersona(id);
    if (url) ok++;
    else { fail++; }
  }
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\n${ok}/${ids.length} generated in ${elapsed}s`);
  if (fail > 0) {
    console.error(`⚠️ ${fail} failed — check the model chain logs above. Re-run with --force to retry.`);
    process.exit(1);
  }
  console.log(`✓ files in ${OUT_DIR}`);
})();
