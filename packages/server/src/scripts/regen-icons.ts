/**
 * regen-icons — CLI to generate (or regenerate) every UI icon in
 * iconGen.ts's ICON_DETAILS registry.
 *
 * Usage:
 *   # Just populate missing icons (cached ones skipped):
 *   npx tsx packages/server/src/scripts/regen-icons.ts
 *
 *   # Force full regeneration:
 *   npx tsx packages/server/src/scripts/regen-icons.ts --force
 *
 *   # Generate only specific keys:
 *   npx tsx packages/server/src/scripts/regen-icons.ts mode_classic team_cat
 */
import 'dotenv/config';
import {
  ICON_DETAILS,
  clearIconCache,
  generateAllIcons,
} from '../services/iconGen.js';

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const explicit = args.filter((a) => !a.startsWith('-'));
  const targets = explicit.length ? explicit : Object.keys(ICON_DETAILS);

  if (force) {
    console.log('→ clearing icon cache');
    clearIconCache();
  }

  console.log(`→ generating ${targets.length} icons (force=${force})\n`);
  const t0 = Date.now();
  const result = await generateAllIcons(targets);
  const dt = ((Date.now() - t0) / 1000).toFixed(1);

  const ok = Object.keys(result).length;
  console.log(`\n→ done in ${dt}s — ${ok}/${targets.length} succeeded.`);
  const failed = targets.filter((k) => !result[k]);
  if (failed.length) {
    console.log(`→ failed: ${failed.join(', ')}`);
  }
}

main().catch((err) => {
  console.error('regen-icons crashed:', err);
  process.exit(1);
});
