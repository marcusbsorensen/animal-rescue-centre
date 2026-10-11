import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * What `checkBadges` hands the badge evaluator, asserted against the source.
 *
 * `GameScene` cannot be imported under test (Phaser probes a canvas the
 * moment it is), so this reads the file, as `collection-wiring.test.ts`
 * does. The thing worth pinning is that eleven of twenty-five badges once sat
 * unreachable for the whole life of the game: the evaluator was handed a
 * literal where a real number was sitting right there, and each badge's own
 * test passed throughout because it fed the evaluator the number directly.
 *
 * Three kinds of check, in order: that the numbers `checkBadges` hands over
 * are real ones and the only literals left are the two known ones; that the
 * places which move those numbers do move them (and save); and that the
 * scenes which know a thing happened tell the scene that counts.
 */

const SRC = path.join(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const GAME_SCENE = read('scenes/GameScene.ts');

const CHECK_BADGES = GAME_SCENE
  .split('private checkBadges(): void {')[1]
  ?.split('private openBadgeOverlay')[0] ?? '';

/** The body of one GameScene method, up to the next method at the same indent. */
function method(name: string): string {
  const after = GAME_SCENE.split(new RegExp(`\\n  (?:private |public )?(?:async )?${name}\\(`))[1] ?? '';
  return after.split(/\n  (?:private |public )?(?:async )?[a-zA-Z]+\(/)[0] ?? '';
}

describe('checkBadges', () => {
  it('reads a body to check', () => {
    // If this fails the split has stopped finding the method and every
    // assertion below it has quietly stopped checking anything.
    expect(CHECK_BADGES).toContain('evaluateBadges(');
    expect(CHECK_BADGES.length).toBeGreaterThan(800);
  });

  it('counts the upgrades the child has claimed, not a literal', () => {
    expect(CHECK_BADGES).toContain('houseUpgrades: this.store.houseUpgrades.length');
    expect(CHECK_BADGES).not.toMatch(/houseUpgrades:\s*\d/);
  });

  // Each badge input, and the expression that must supply it.
  const WIRED: Array<[field: string, badges: string, expression: string]> = [
    ['giftsSentCount', 'giver, generous', 'this.store.giftsSentCount'],
    ['giftsReceivedCount', 'receiver', 'this.store.giftsReceivedCount'],
    ['selfHealed', 'vet_apprentice, vet_pro', 'this.store.selfHealed'],
    ['walksWithoutIncident', 'good_walker', 'this.store.walksWithoutIncident'],
    ['conflictsResolved', 'peacekeeper', 'this.store.conflictsResolved'],
    ['consecutiveDays', 'daily_week', 'consecutiveDays(this.store.playedDays,'],
    ['totalDaysPlayed', 'daily_month', 'totalDaysPlayed(this.store.playedDays,'],
    ['hedgehogsRescued', 'all_species', "lifetimeRescuedCount('hedgehog', this.store)"],
  ];

  for (const [field, badges, expression] of WIRED) {
    it(`reads ${field} (${badges}) from the store, not a literal`, () => {
      expect(CHECK_BADGES).toContain(`${field}: ${expression}`);
      expect(CHECK_BADGES).not.toMatch(new RegExp(`${field}:\\s*\\d`));
    });
  }

  it('leaves exactly two numeric literals, both with a reason', () => {
    // `trainer` needs a training screen that does not exist, and
    // `early_supporter` needs the server to say where in the signup order a
    // child came. Wiring either is a feature, not a one-line fix. Anything
    // new that lands here as a bare number is the bug this file exists for;
    // if one of these two is ever wired, delete it from this list.
    const literals = [...CHECK_BADGES.matchAll(/^\s*(\w+):\s*\d+\s*,/gm)].map((m) => m[1]).sort();
    expect(literals).toEqual(['animalsTrained', 'playerNumber']);
  });
});

describe('what moves the counters', () => {
  it('counts a heal only when the animal was sick, so a heal reported twice is one', () => {
    const heal = method('healedByCare');
    expect(heal).toContain('const wasSick = this.store.sickAnimals.delete(animalId)');
    expect(heal).toMatch(/if \(wasSick\) this\.store\.selfHealed\+\+/);
  });

  it('takes a vet game heal from the registry, which is where VetScene reports it', () => {
    // VetScene sets `vetResult` and starts GameScene; it never calls the
    // `onComplete` that doVetVisit passes it, so counting there alone
    // counted nothing.
    const create = method('create');
    expect(create).toContain("this.registry.get('vetResult')");
    expect(create).toMatch(/vetResult\?\.healed && vetResult\.animalId\) \{\s*this\.healedByCare\(vetResult\.animalId\)/);
    expect(create).not.toMatch(/sickAnimals\.delete\(vetResult/);
  });

  it('counts home care as the child\'s own nursing, and a paid vet visit as not', () => {
    const popup = method('mountVetPopup');
    const vet = popup.split("action === 'treatment-vet'")[1]?.split("action === 'treatment-home'")[0] ?? '';
    const home = popup.split("action === 'treatment-home'")[1]?.split("action === 'treatment-rest'")[0] ?? '';
    expect(vet.length).toBeGreaterThan(100);
    expect(home.length).toBeGreaterThan(100);
    expect(vet).not.toContain('healedByCare');
    expect(home).toContain('this.healedByCare(animal.id)');
  });

  it('checks the badges after the vet popup has gone, or the plaque is taken down with it', () => {
    // A badge plaque is mounted over whichever overlay is open, and
    // `unmount()` takes down whatever overlay is open. Checked first, the
    // plaque went up and straight down again, with the badge already marked
    // earned and never shown.
    const popup = method('mountVetPopup');
    for (const action of ['treatment-vet', 'treatment-home']) {
      const branch = popup.split(`action === '${action}'`)[1]?.split(/action === 'treatment-/)[0] ?? '';
      expect(branch.indexOf('unmount()'), action).toBeGreaterThanOrEqual(0);
      expect(branch.indexOf('this.checkBadges()'), action).toBeGreaterThan(branch.indexOf('unmount()'));
    }
  });

  it('counts a walk as safe on the road, not as perfect, and takes it from the registry', () => {
    // WalkScene sets `walkResult` on its results screen and never calls its
    // `onComplete`. `perfectWalk` also wants 60% explored, which the badge
    // ("without a road incident") does not mention.
    const create = method('create');
    expect(create).toContain("this.registry.get('walkResult')");
    expect(create).toMatch(/walkResult\?\.roadSafe\) \{\s*this\.store\.walksWithoutIncident\+\+/);
    expect(create).not.toMatch(/walkResult\?\.perfectWalk\) \{\s*this\.store\.walksWithoutIncident/);

    const walkScene = read('scenes/WalkScene.ts');
    expect(walkScene).toContain("this.registry.set('walkResult', { perfectWalk: rewards.perfectWalk, roadSafe: rewards.roadSafe })");
  });

  it('saves after a squabble is settled, so the tally outlives the sitting', () => {
    const resolve = method('resolveActiveConflict');
    const counted = resolve.indexOf('this.store.conflictsResolved++');
    expect(counted).toBeGreaterThanOrEqual(0);
    expect(resolve.indexOf('this.saveState()')).toBeGreaterThan(counted);
  });

  it('checks the badges when it starts, before a van opens a room over the top', () => {
    // The day (counted at load, at the menu), the server's gift counts (a
    // send or a claim in the social scene) and a heal or walk that has just
    // come back all change while this scene is not running.
    const create = method('create');
    const checked = create.indexOf('this.checkBadges()');
    expect(checked).toBeGreaterThanOrEqual(0);
    expect(create.slice(Math.max(0, checked - 40), checked)).toContain('!this.arrived');
    expect(checked).toBeLessThan(create.indexOf('this.handleArrival()'));
  });
});

describe('what tells the counters', () => {
  it('hands the social scene\'s gift counts to the shelter', () => {
    const social = read('scenes/SocialScene.ts');
    expect(social).toMatch(/const sent = await sendGift\(/);
    expect(social).toContain('recordGiftCounts(store, sent)');
    expect(social).toMatch(/const claimed = await claimGift\(/);
    expect(social).toContain('recordGiftCounts(store, claimed)');
  });

  it('does not count gifts in the client', () => {
    // The server increments them (`rescue_stats`). A second tally here is
    // the thing that drifts the first time a send is retried.
    for (const file of ['scenes/GameScene.ts', 'scenes/SocialScene.ts', 'lib/gifts.ts']) {
      expect(read(file), file).not.toMatch(/giftsSentCount\s*(\+\+|\+=)/);
      expect(read(file), file).not.toMatch(/giftsReceivedCount\s*(\+\+|\+=)/);
    }
  });
});
