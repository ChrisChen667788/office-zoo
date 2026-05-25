/**
 * v6.26 P2 — covers the furniture-proximity boost branch of
 * idleMoments.pickEmoteForPlayer. Verifies near-coffee_machine raises
 * ☕ probability vs no-furniture baseline, and that furniture wins
 * over room-vibe when both apply.
 */
import { describe, it, expect } from 'vitest';
import { pickEmoteForPlayer } from '../idleMoments';

function sampleEmojis(args: Parameters<typeof pickEmoteForPlayer>[0], n = 500): Map<string, number> {
  const tally = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const f = pickEmoteForPlayer({ ...args, tSec: i * 0.13 });
    if (f) tally.set(f.emoji, (tally.get(f.emoji) || 0) + 1);
  }
  return tally;
}

describe('pickEmoteForPlayer — furniture proximity boost', () => {
  it('near coffee_machine biases toward ☕', () => {
    const near = sampleEmojis({
      playerId: 'player_0',
      isAlive: true,
      activityKind: 'idle',
      nearestFurnitureKind: 'coffee_machine',
      tSec: 0,
    });
    const baseline = sampleEmojis({
      playerId: 'player_0',
      isAlive: true,
      activityKind: 'idle',
      tSec: 0,
    });
    const nearCoffee = near.get('☕') || 0;
    const baseCoffee = baseline.get('☕') || 0;
    // FURNITURE_VIBE.coffee_machine has ☕ doubled — should reliably
    // exceed baseline. Loose 1.4× margin to absorb stagger noise.
    expect(nearCoffee).toBeGreaterThan(Math.max(baseCoffee * 1.4, 30));
  });

  it('near printer biases toward 📠 / 🖨️ / 📄', () => {
    const tally = sampleEmojis({
      playerId: 'player_1',
      isAlive: true,
      activityKind: 'work',
      nearestFurnitureKind: 'printer',
      tSec: 0,
    });
    const printerHits = (tally.get('📠') || 0) + (tally.get('🖨️') || 0) + (tally.get('📄') || 0);
    expect(printerHits).toBeGreaterThan(0);
  });

  it('near sofa biases toward 💤 / 🛋️ / 😴', () => {
    const tally = sampleEmojis({
      playerId: 'player_2',
      isAlive: true,
      activityKind: 'idle',
      nearestFurnitureKind: 'sofa',
      tSec: 0,
    });
    const sofaHits = (tally.get('💤') || 0) + (tally.get('🛋️') || 0) + (tally.get('😴') || 0);
    expect(sofaHits).toBeGreaterThan(0);
  });

  it('furniture beats room when both supplied (closer source wins)', () => {
    // Player in 老板办公室 (room → 😨🫣🙊) but near coffee_machine.
    // Furniture pool should override room pool's emoji influx.
    const tally = sampleEmojis({
      playerId: 'player_3',
      isAlive: true,
      activityKind: 'idle',
      roomId: '老板办公室',
      nearestFurnitureKind: 'coffee_machine',
      tSec: 0,
    });
    const coffeeHits = tally.get('☕') || 0;
    const fearHits = (tally.get('😨') || 0) + (tally.get('🫣') || 0) + (tally.get('🙊') || 0);
    expect(coffeeHits).toBeGreaterThan(fearHits);
  });

  it('room vibe applies when no furniture proximity', () => {
    const tally = sampleEmojis({
      playerId: 'player_4',
      isAlive: true,
      activityKind: 'idle',
      roomId: '茶水间',
      tSec: 0,
    });
    // 茶水间 → ['☕', '🍵', '🥤']
    const teaHits = (tally.get('☕') || 0) + (tally.get('🍵') || 0) + (tally.get('🥤') || 0);
    expect(teaHits).toBeGreaterThan(0);
  });
});
