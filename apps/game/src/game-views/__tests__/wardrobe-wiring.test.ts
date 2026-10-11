import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The wardrobe is wired through three screens and one gate. The behaviour
 * lives in tested modules (`wardrobe.ts`, `ui/wardrobe-art.ts`); these pin
 * that the screens call them and have not grown a private copy.
 */

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '../..', rel), 'utf8');

describe("the animal card's garment row", () => {
  const card = read('game-views/AnimalCard.ts');

  it('asks whether this animal needs one, not whether the weather is cold', () => {
    // `needsCoat` is the weather's half of the answer. A hedgehog, whose
    // scarf is not drawn yet, would be told to fetch one in the snow.
    expect(card).toMatch(/animalNeedsGarment\(/);
    expect(card).not.toMatch(/\bneedsCoat\(/);
  });

  it('says why when there is no garment to offer, and lets a garment come off', () => {
    expect(card).toMatch(/canBeDressed\(/);
    expect(card).toMatch(/Change the/);
  });
});

describe('the wardrobe picker', () => {
  const picker = read('game-views/WardrobePickerView.ts');

  it('draws the garment itself in each colour, from the one palette', () => {
    expect(picker).toMatch(/ensureTintedGarment\(/);
    expect(picker).toMatch(/WARDROBE_COLOURS/);
    // No colour list of its own to drift from the palette.
    expect(picker).not.toMatch(/name: '[A-Z][a-z]+',\s+hex:/);
  });

  it('writes what the sprite layer reads', () => {
    expect(picker).toMatch(/formatWardrobe\(/);
  });
});
