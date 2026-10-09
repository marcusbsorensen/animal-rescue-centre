import Phaser from 'phaser';
import type { Animal, Species } from '@arc/shared-types';
import { animalScaleUnit } from '@arc/game-logic';
import { createAnimalSprite } from '../ui/sprites';

/**
 * The scale ladder, drawn — dev only, mounted by
 * `public/admin/animal-scale-review.html`.
 *
 * Nothing imports this from the game, so it is not in the production bundle;
 * it is here rather than inline in the page so that `createAnimalSprite` and
 * the ladder are imported by their real specifiers and so that typecheck and
 * lint cover it.
 *
 * The picture it is for: a row of mixed species on one ground line, beside
 * the same row drawn the way every screen drew it before. That second band is
 * the bug — eight animals, one size, a hedgehog the size of a dog.
 */

/** Largest to smallest, one of each species the shelter can hold. */
const ROW: [Species, string][] = [
  ['dog', 'collie'], ['fox', 'red'], ['cat', 'ginger'], ['bunny', 'lop'],
  ['snake', 'python'], ['parrot', 'grey'], ['hedgehog', 'brown'], ['bat', 'brown'],
];

/** Variants inside one species, which a table keyed by species cannot hold. */
const VARIANTS: [Species, string][] = [
  ['parrot', 'macaw'], ['parrot', 'cockatiel'], ['parrot', 'budgie'], ['parrot', 'lovebird'],
  ['dog', 'collie'], ['dog', 'terrier'], ['dog', 'pug'],
];

const W = 1280;
const H = 760;
const BAND = 240;
const CELL = 150;

function animalOf(species: Species, variant: string): Animal {
  return {
    id: `${species}-${variant}`,
    name: variant,
    species,
    variant,
    state: 'sheltered',
    hunger: 0,
    tiredness: 0,
    happiness: 100,
    health: 100,
    bondLevel: 0,
    arrivalStory: '',
    roomId: '',
  } as Animal;
}

class Review extends Phaser.Scene {
  preload(): void {
    for (const [species, variant] of [...ROW, ...VARIANTS]) {
      const key = `${species}-${variant}-sheltered`;
      if (!this.textures.exists(key)) {
        this.load.image(key, `/assets/animals/${species}-${variant}-sheltered.png`);
      }
    }
  }

  private band(
    title: string,
    note: string,
    list: [Species, string][],
    scale: 'species' | 'fill',
    index: number,
  ): void {
    const top = 16 + index * BAND;
    const groundY = top + BAND - 70;

    this.add.text(20, top, title, {
      fontSize: '17px', fontFamily: 'system-ui', color: '#3a2618', fontStyle: 'bold',
    });
    this.add.text(20, top + 22, note, {
      fontSize: '13px', fontFamily: 'system-ui', color: '#6b5744',
    });

    // The ground line itself, so "standing on one line" is checkable by eye
    // rather than by belief.
    const g = this.add.graphics();
    g.lineStyle(2, 0xc9b79c, 1);
    g.lineBetween(20, groundY, W - 20, groundY);

    list.forEach(([species, variant], i) => {
      const cx = 100 + i * CELL;
      const sprite = createAnimalSprite(
        this, cx, groundY, animalOf(species, variant),
        { width: CELL - 10, height: CELL - 10, scale },
      );
      // Feet on the line, measured off what was drawn.
      sprite.y = groundY - sprite.displayHeight / 2;
      this.add.text(
        cx, groundY + 6, `${variant}\n${animalScaleUnit(species, variant)}`,
        { fontSize: '11px', fontFamily: 'system-ui', color: '#6b5744', align: 'center' },
      ).setOrigin(0.5, 0);
    });
  }

  create(): void {
    this.band(
      "scale: 'species' — a comparative screen",
      'The corridor, a room, the garden, a falling-out, the kitchen counter, the walk.',
      ROW, 'species', 0,
    );
    this.band(
      "scale: 'fill' — a solo screen, and what every screen drew before",
      'Eight animals, one size. A hedgehog the size of a dog: the bug, drawn.',
      ROW, 'fill', 1,
    );
    this.band(
      "scale: 'species' — variants inside one species",
      'A macaw against a lovebird, a collie against a pug. Eight exceptions, 52 inherit.',
      VARIANTS, 'species', 2,
    );
    // Something a screenshot harness can wait for rather than guessing.
    document.title = 'A.R.C. — animal scale review (ready)';
  }
}

new Phaser.Game({
  type: Phaser.CANVAS,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: '#fffdf7',
  scene: Review,
});
