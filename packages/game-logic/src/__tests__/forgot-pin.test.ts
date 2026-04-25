import { describe, it, expect } from 'vitest';
import {
  buildRecoveryQuestions,
  scoreRecovery,
  type RecoverySnapshot,
} from '../forgot-pin';
import { APPRENTICE_DEFS } from '../apprentices';

const baseAdopters = {
  recentlyPlacedIds: ['07-patel-greens'],
  householdLabels: {
    '07-patel-greens': 'The Patel-Greens',
    '01-bramble-fox': 'Bramble & Fox',
    '13-kumar-ishii': 'The Kumar-Ishiis',
    '14-theo-grandkids': 'Theo & the grandkids',
    '17-benji-wild-visit': 'Benji on a wild visit',
  },
};

const baseApprentices = {
  level: 3,
  apprentices: [
    { id: 'rhubarb', householdId: '30-two-houses', recruitedAt: 1700000000, role: 'feeder' },
  ],
  apprenticeUnlocks: { extraCareTasksPerDay: 1, extraCatSlots: 0, extraSpeciesSlots: 0 },
};

const baseCharms = {
  unlockedCharms: ['bone', 'lucky-teddy', 'bicycle-bell'] as ('bone' | 'lucky-teddy' | 'bicycle-bell')[],
  equippedCharm: 'bone' as const,
  eventCounters: {},
};

function snap(over: Partial<RecoverySnapshot> = {}): RecoverySnapshot {
  return {
    username: 'Lily',
    attemptIndex: 0,
    adopters: baseAdopters,
    apprentices: baseApprentices as RecoverySnapshot['apprentices'],
    charms: baseCharms as RecoverySnapshot['charms'],
    ...over,
  };
}

describe('buildRecoveryQuestions', () => {
  it('returns up to 3 questions when full state is available', () => {
    const qs = buildRecoveryQuestions(snap());
    expect(qs.length).toBeGreaterThanOrEqual(1);
    expect(qs.length).toBeLessThanOrEqual(3);
  });

  it('is deterministic for the same seed', () => {
    expect(buildRecoveryQuestions(snap())).toEqual(buildRecoveryQuestions(snap()));
  });

  it('changes when attemptIndex changes', () => {
    const a = buildRecoveryQuestions(snap({ attemptIndex: 0 }));
    const b = buildRecoveryQuestions(snap({ attemptIndex: 1 }));
    // They should not all be identical — at minimum option ordering differs.
    expect(JSON.stringify(a)).not.toEqual(JSON.stringify(b));
  });

  it('returns empty when no progress AND no early-game state available', () => {
    const qs = buildRecoveryQuestions({
      username: 'NewKid',
      attemptIndex: 0,
      adopters: { recentlyPlacedIds: [], householdLabels: {} },
      apprentices: undefined,
      charms: undefined,
    });
    expect(qs).toEqual([]);
  });

  it('returns early-game questions for a brand-new player (no progress yet)', () => {
    const qs = buildRecoveryQuestions({
      username: 'NewKid',
      attemptIndex: 0,
      early: {
        signupAvatar: '🦊',
        firstAnimalName: 'Pumpkin',
        firstAnimalSpecies: 'cat',
      },
    });
    expect(qs.length).toBe(3);
    const ids = qs.map((q) => q.id).sort();
    expect(ids).toEqual([
      'q-first-animal-name',
      'q-first-animal-species',
      'q-signup-avatar',
    ]);
  });

  it('signup-avatar Q has 4 options including the correct emoji', () => {
    const qs = buildRecoveryQuestions({
      username: 'Lily',
      attemptIndex: 0,
      early: { signupAvatar: '🐍' },
    });
    const q = qs.find((x) => x.id === 'q-signup-avatar');
    expect(q).toBeDefined();
    expect(q!.options).toHaveLength(4);
    expect(q!.options[q!.correct]).toBe('🐍');
  });

  it('first-animal-name Q uses the saved name as the correct answer', () => {
    const qs = buildRecoveryQuestions({
      username: 'Lily',
      attemptIndex: 0,
      early: { firstAnimalName: 'Marmalade' },
    });
    const q = qs.find((x) => x.id === 'q-first-animal-name');
    expect(q).toBeDefined();
    expect(q!.options).toHaveLength(3);
    expect(q!.options).toContain('Marmalade');
    expect(q!.options[q!.correct]).toBe('Marmalade');
    // No sprite passed → text layout fallback.
    expect(q!.display ?? 'text').toBe('text');
    expect(q!.sharedSprite).toBeUndefined();
  });

  it('first-animal-name Q renders as cards when a sprite is provided', () => {
    const qs = buildRecoveryQuestions({
      username: 'Lily',
      attemptIndex: 0,
      early: {
        firstAnimalName: 'Marmalade',
        firstAnimalSpriteSrc: '/assets/animals/cat-ginger-sheltered.png',
      },
    });
    const q = qs.find((x) => x.id === 'q-first-animal-name');
    expect(q).toBeDefined();
    expect(q!.display).toBe('cards');
    expect(q!.sharedSprite).toBe('/assets/animals/cat-ginger-sheltered.png');
    expect(q!.options).toHaveLength(3);
    // The 3 cards show the same sprite — only the name tag differs.
    expect(q!.options[q!.correct]).toBe('Marmalade');
  });

  it('first-animal-species Q capitalises the species options', () => {
    const qs = buildRecoveryQuestions({
      username: 'Lily',
      attemptIndex: 0,
      early: { firstAnimalSpecies: 'fox' },
    });
    const q = qs.find((x) => x.id === 'q-first-animal-species');
    expect(q).toBeDefined();
    expect(q!.options[q!.correct]).toBe('Fox');
    // Every option starts with uppercase
    for (const opt of q!.options) {
      expect(opt[0]).toBe(opt[0].toUpperCase());
    }
  });

  it('still returns 3 questions when both early + late state is available, picking variety', () => {
    const qs = buildRecoveryQuestions(
      snap({
        early: {
          signupAvatar: '🐱',
          firstAnimalName: 'Pumpkin',
          firstAnimalSpecies: 'cat',
        },
      }),
    );
    expect(qs.length).toBe(3);
    // No duplicates
    const ids = new Set(qs.map((q) => q.id));
    expect(ids.size).toBe(qs.length);
  });

  it('includes the correct answer in options for each question', () => {
    const qs = buildRecoveryQuestions(snap());
    for (const q of qs) {
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      expect(q.correct).toBeGreaterThanOrEqual(0);
      expect(q.correct).toBeLessThan(q.options.length);
    }
  });

  it('apprentice question uses the most-recently-recruited apprentice', () => {
    const qs = buildRecoveryQuestions(
      snap({
        apprentices: {
          ...baseApprentices,
          apprentices: [
            { id: 'rhubarb', householdId: '30-two-houses', recruitedAt: 1700000000, role: 'feeder' },
            { id: 'kofi', householdId: '14-theo-grandkids', recruitedAt: 1750000000, role: 'bookworm' },
          ],
        } as RecoverySnapshot['apprentices'],
      }),
    );
    const aprQ = qs.find((q) => q.id === 'q-bonded-apprentice');
    if (aprQ) {
      expect(aprQ.options[aprQ.correct]).toBe(APPRENTICE_DEFS.kofi.name);
    }
  });

  it('charm question marks a locked charm as the correct answer', () => {
    const qs = buildRecoveryQuestions(snap());
    const charmQ = qs.find((q) => q.id === 'q-locked-charm');
    if (charmQ) {
      const correctLabel = charmQ.options[charmQ.correct];
      // The correct answer must NOT be one of the unlocked charms.
      expect(['Bone', 'Lucky Teddy', 'Bicycle Bell']).not.toContain(correctLabel);
    }
  });
});

describe('scoreRecovery', () => {
  const qs = [
    { id: 'a', prompt: '?', options: ['x', 'y', 'z'], correct: 1 },
    { id: 'b', prompt: '?', options: ['x', 'y', 'z'], correct: 2 },
    { id: 'c', prompt: '?', options: ['x', 'y', 'z'], correct: 0 },
  ];

  it('all correct → pass', () => {
    expect(scoreRecovery(qs, [1, 2, 0])).toEqual({ kind: 'pass', correctCount: 3 });
  });

  it('2/3 → fall-through-to-hint', () => {
    expect(scoreRecovery(qs, [1, 2, 9])).toMatchObject({ kind: 'fall-through-to-hint', correctCount: 2 });
  });

  it('1/3 → parent-help', () => {
    expect(scoreRecovery(qs, [1, 9, 9])).toMatchObject({ kind: 'parent-help', correctCount: 1 });
  });

  it('0/3 → parent-help', () => {
    expect(scoreRecovery(qs, [9, 9, 9])).toMatchObject({ kind: 'parent-help', correctCount: 0 });
  });

  it('no questions → straight to hint', () => {
    expect(scoreRecovery([], [])).toMatchObject({ kind: 'fall-through-to-hint' });
  });
});
