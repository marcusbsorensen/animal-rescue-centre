import Phaser from 'phaser';
import type { Animal, Species } from '@arc/shared-types';
import {
  WARDROBE_COLOURS,
  formatWardrobe,
  getGarmentForSpecies,
  getWardrobeTextureKey,
} from '@arc/game-logic';
import { createAnimalSprite } from '../ui/sprites';
import { WardrobeAnchors } from '../lib/WardrobeAnchors';
import { renderWardrobePicker } from '../game-views/WardrobePickerView';

/**
 * Garments on animals, drawn by the game's own code — dev only, mounted by
 * `public/admin/wardrobe-review.html`.
 *
 * Nothing imports this from the game, so it is not in the production bundle.
 * It calls `createAnimalSprite` exactly as the Room does (a 200 by 160 box at
 * species scale), so what is on the page is what a child sees: the animal
 * bare, and the same animal wearing her kit, side by side, on one ground line.
 *
 * Query string, all optional:
 *   ?rows=dog:beagle,cat:ginger    which animals (species:variant)
 *   ?poses=sheltered,sleeping      which poses
 *   ?mode=fill                     the animal card's portrait instead of the room
 *   ?cell=150                      cell width
 *   ?renderer=webgl             draw with WebGL instead of the canvas renderer
 *   ?picker=dog:beagle             the wardrobe picker for that animal, as the
 *                                  animal card opens it (&worn=#2c3e50 to put
 *                                  her in something first)
 */

const DEFAULT_ROWS: [Species, string][] = [
  ['dog', 'beagle'], ['fox', 'red'], ['cat', 'ginger'], ['bunny', 'lop'],
  ['bat', 'brown'], ['parrot', 'macaw'], ['snake', 'corn'],
];
const DEFAULT_POSES = ['sheltered', 'eating', 'sleeping', 'walking'];

const params = new URLSearchParams(window.location.search);
const rows: [Species, string][] = params.get('rows')
  ? params.get('rows')!.split(',').map((r) => r.split(':') as [Species, string])
  : DEFAULT_ROWS;
const poses = params.get('poses') ? params.get('poses')!.split(',') : DEFAULT_POSES;
const mode = params.get('mode') === 'fill' ? 'fill' : 'species';
const CELL = Number(params.get('cell') ?? 150);
const ROW_H = mode === 'fill' ? 270 : 140;
const LABEL_W = 92;
const W = LABEL_W + poses.length * 2 * CELL;
const H = rows.length * ROW_H + 40;

function animalOf(species: Species, variant: string, wardrobe?: string): Animal {
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
    ...(wardrobe ? { wardrobe } : {}),
  } as Animal;
}

class Review extends Phaser.Scene {
  preload(): void {
    for (const [species, variant] of rows) {
      for (const pose of poses) {
        const key = `${species}-${variant}-${pose}`;
        if (!this.textures.exists(key)) {
          this.load.image(key, `/assets/animals/${key}.png`);
        }
      }
      const g = getWardrobeTextureKey(species);
      if (!this.textures.exists(g)) this.load.image(g, `/assets/animals/${g}.png`);
    }
  }

  create(): void {
    void WardrobeAnchors.getInstance().load().then(() => this.draw());
  }

  private draw(): void {
    poses.forEach((_pose, c) => {
      for (const [i, caption] of ['bare', 'with kit'].entries()) {
        this.add.text(LABEL_W + (c * 2 + i) * CELL + CELL / 2, 8, caption, {
          fontSize: '12px', fontFamily: 'system-ui', color: i ? '#3a2618' : '#9a8a76', fontStyle: i ? 'bold' : 'normal',
        }).setOrigin(0.5, 0);
      }
    });
    rows.forEach(([species, variant], r) => {
      const top = 28 + r * ROW_H;
      const groundY = top + ROW_H - 30;
      const garment = getGarmentForSpecies(species);
      const hex = WARDROBE_COLOURS[r % WARDROBE_COLOURS.length].hex;
      this.add.text(8, groundY - 30, `${species}\n${variant}\n${garment}`, {
        fontSize: '12px', fontFamily: 'system-ui', color: '#3a2618',
      });
      const g = this.add.graphics();
      g.lineStyle(1, 0xe3d6bf, 1);
      g.lineBetween(LABEL_W, groundY, W - 8, groundY);

      poses.forEach((pose, c) => {
        for (const dressed of [false, true]) {
          const cx = LABEL_W + (c * 2 + (dressed ? 1 : 0)) * CELL + CELL / 2;
          const animal = animalOf(species, variant, dressed ? formatWardrobe(garment, hex) : undefined);
          const box = mode === 'fill' ? { width: CELL - 16, height: CELL - 16 } : { width: 200, height: 160 };
          const sprite = createAnimalSprite(this, cx, groundY, animal, {
            ...box, stateOverride: pose, exactPose: true, scale: mode,
          });
          sprite.y = groundY - sprite.displayHeight / 2;
        }
        this.add.text(LABEL_W + c * 2 * CELL + CELL, groundY + 6, pose, {
          fontSize: '11px', fontFamily: 'system-ui', color: '#6b5744',
        }).setOrigin(0.5, 0);
      });
    });
    // Something a screenshot harness can wait for rather than guessing.
    document.title = 'A.R.C. — wardrobe review (ready)';
  }
}

/** The picker, on its own, over a plain ground. */
class PickerReview extends Phaser.Scene {
  preload(): void {
    const [species] = params.get('picker')!.split(':') as [Species, string];
    const g = getWardrobeTextureKey(species);
    if (!this.textures.exists(g)) this.load.image(g, `/assets/animals/${g}.png`);
  }

  create(): void {
    const [species, variant] = params.get('picker')!.split(':') as [Species, string];
    const worn = params.get('worn');
    const garment = getGarmentForSpecies(species);
    const animal = animalOf(species, variant, worn ? formatWardrobe(garment, worn) : undefined);
    const container = this.add.container(0, 0);
    renderWardrobePicker(this, container, animal, {
      onEquip: () => {}, onRemove: () => {}, onClose: () => {},
    });
    document.title = 'A.R.C. — wardrobe review (ready)';
  }
}

new Phaser.Game({
  // The game itself runs on whichever the device offers; ?renderer=webgl checks
  // the canvas textures survive the GPU upload, ?renderer=canvas the other path.
  type: params.get('renderer') === 'webgl' ? Phaser.WEBGL : Phaser.CANVAS,
  parent: 'game',
  width: params.get('picker') ? 640 : W,
  height: params.get('picker') ? 460 : H,
  backgroundColor: '#fffdf7',
  scene: params.get('picker') ? PickerReview : Review,
});
