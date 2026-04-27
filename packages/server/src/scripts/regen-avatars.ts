/**
 * regen-avatars — CLI script to clear the avatar cache and regenerate
 * all 22 role avatars with the current imageGen.ts prompt / model chain.
 *
 * Run from the repo root with:
 *   npx tsx packages/server/src/scripts/regen-avatars.ts
 *
 * Set IMAGE_MODEL=<id> in env to pin a single model; otherwise the chain
 * defined in imageGen.ts is walked and the first working model wins per
 * avatar (good for resilience when individual models are temporarily
 * disabled upstream).
 */
import 'dotenv/config';
import {
  ROLE_ART_DETAILS,
  clearAvatarCache,
  generateAllAvatars,
} from '../services/imageGen.js';

async function main() {
  const roles = Object.keys(ROLE_ART_DETAILS);
  console.log(`\n→ clearing cache and regenerating ${roles.length} avatars...\n`);
  clearAvatarCache();

  const t0 = Date.now();
  const result = await generateAllAvatars(roles);
  const dt = ((Date.now() - t0) / 1000).toFixed(1);

  const ok = Object.keys(result).length;
  console.log(`\n→ done in ${dt}s — ${ok}/${roles.length} succeeded.`);
  const failed = roles.filter((r) => !result[r]);
  if (failed.length) {
    console.log(`→ failed: ${failed.join(', ')}`);
  }
}

main().catch((err) => {
  console.error('regen-avatars crashed:', err);
  process.exit(1);
});
