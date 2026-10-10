import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * What `checkBadges` hands the badge evaluator, asserted against the source.
 *
 * `GameScene` cannot be imported under test (Phaser probes a canvas the
 * moment it is), so this reads the file, as `collection-wiring.test.ts`
 * does. The thing worth pinning is that `cosy_centre` once sat unreachable
 * for the whole life of the game: the evaluator was handed a literal 0
 * where `store.houseUpgrades` was sitting right there, and the badge's own
 * test passed throughout because it fed the evaluator a 1 directly.
 */

const GAME_SCENE = fs.readFileSync(
  path.join(__dirname, '..', 'scenes/GameScene.ts'),
  'utf8',
);

const CHECK_BADGES = GAME_SCENE
  .split('private checkBadges(): void {')[1]
  ?.split('private openBadgeOverlay')[0] ?? '';

describe('checkBadges', () => {
  it('reads a body to check', () => {
    // If this fails the split has stopped finding the method and every
    // assertion below it has quietly stopped checking anything.
    expect(CHECK_BADGES).toContain('evaluateBadges(');
  });

  it('counts the upgrades the child has claimed, not a literal', () => {
    expect(CHECK_BADGES).toContain('houseUpgrades: this.store.houseUpgrades.length');
    expect(CHECK_BADGES).not.toMatch(/houseUpgrades:\s*\d/);
  });
});
