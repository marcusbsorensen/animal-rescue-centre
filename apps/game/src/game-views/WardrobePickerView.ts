import Phaser from 'phaser';
import type { Animal } from '@arc/shared-types';
import {
  getGarmentForSpecies,
  getWardrobeTextureKey,
  parseWardrobe,
  formatWardrobe,
  WARDROBE_COLOURS,
} from '@arc/game-logic';
import { COLOURS, FONTS, TEXT_RESOLUTION, MIN_FONT, TYPE } from '../ui/constants';
import { ensureTintedGarment } from '../ui/wardrobe-art';

/**
 * WardrobePickerView — a small modal that lets the player pick a
 * garment (coat / scarf / hat) for their animal and put it on.
 *
 * Design:
 *   - Species gets ONE garment type (see wardrobe.ts mapping), so what
 *     varies is its colour. Each choice is **the garment itself, drawn in
 *     that colour** — not a swatch of the colour. A child who cannot read
 *     "coat" and "hat" can still see which one is on offer, and what it
 *     will look like on the animal, because it is the same picture.
 *   - 6 pre-set kid-friendly colours (`WARDROBE_COLOURS`) + a "take off"
 *     option.
 *   - Tapping one equips + closes modal; re-render happens on
 *     the scene side via the provided `onEquip` callback.
 *   - Tapping outside the panel or the ✕ closes without changing.
 *
 * The actual `wardrobe` field on Animal stores a code like
 * `"scarf:#ff6b9d"` — the garment name plus a `:#hex` suffix, which is the
 * tint `createAnimalSprite` paints the garment in (`ui/wardrobe-art.ts`).
 * If the garment's art is not available — not loaded yet, or never drawn —
 * the tile falls back to a swatch of the colour rather than an empty box.
 */

export interface WardrobePickerCallbacks {
  /** Player picked one — persists the equip (code = "garment:#hex"). */
  onEquip: (wardrobeCode: string) => void;
  /** Player tapped the remove-garment option. */
  onRemove: () => void;
  /** Picker dismissed with no change (overlay tap or ✕). */
  onClose: () => void;
}

/**
 * Open the wardrobe picker for a given animal. Renders into the
 * provided container (caller removes the container on close).
 */
export function renderWardrobePicker(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  animal: Animal,
  callbacks: WardrobePickerCallbacks,
): void {
  const { width, height } = scene.scale;

  // Dim overlay — tap to dismiss
  const overlay = scene.add
    .rectangle(width / 2, height / 2, width, height, 0x000000, 0.4)
    .setInteractive();
  overlay.on('pointerdown', () => callbacks.onClose());
  container.add(overlay);

  // Panel
  // 300 tall: the shortest screen we draw on is the 325px web clip.
  const panelW = 330;
  const panelH = 300;
  const panelX = width / 2 - panelW / 2;
  const panelY = height / 2 - panelH / 2;

  const shadow = scene.add.graphics();
  shadow.fillStyle(0x000000, 0.25);
  shadow.fillRoundedRect(panelX + 4, panelY + 6, panelW, panelH, 18);
  container.add(shadow);

  const body = scene.add.graphics();
  body.fillStyle(0xfffaf0, 1);
  body.fillRoundedRect(panelX, panelY, panelW, panelH, 18);
  body.lineStyle(2, 0xd9c8a8, 0.6);
  body.strokeRoundedRect(panelX, panelY, panelW, panelH, 18);
  container.add(body);

  const garment = getGarmentForSpecies(animal.species);
  const garmentKey = getWardrobeTextureKey(animal.species);
  const wornHex = parseWardrobe(animal.wardrobe)?.hex;

  // Title
  container.add(
    scene.add.text(width / 2, panelY + 24,
      `Pick a ${garment} for ${animal.name}`,
      {
        fontSize: TYPE.caption, fontFamily: FONTS.title, fontStyle: 'bold',
        color: COLOURS.text, resolution: TEXT_RESOLUTION,
      },
    ).setOrigin(0.5),
  );

  container.add(
    scene.add.text(width / 2, panelY + 48,
      'Tap one to put it on',
      {
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body,
        color: COLOURS.textLight, resolution: TEXT_RESOLUTION,
      },
    ).setOrigin(0.5),
  );

  // Close X
  const closeX = scene.add.text(panelX + panelW - 18, panelY + 14, '\u2715', {
    fontSize: '18px', fontFamily: FONTS.body, color: '#999', resolution: TEXT_RESOLUTION,
  }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true });
  closeX.on('pointerdown', (p: Phaser.Input.Pointer) => {
    p.event?.stopPropagation();
    callbacks.onClose();
  });
  container.add(closeX);

  // The garment in each colour — 2 rows x 3 cols
  const tileW = 92;
  const tileH = 64;
  const gap = 12;
  const cols = 3;
  const gridW = cols * tileW + (cols - 1) * gap;
  const gridX0 = width / 2 - gridW / 2;
  const gridY0 = panelY + 68;

  WARDROBE_COLOURS.forEach(({ name, hex }, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const cx = gridX0 + col * (tileW + gap) + tileW / 2;
    const cy = gridY0 + row * (tileH + 28) + tileH / 2;
    const equipped = wornHex === hex;

    // Tile — the tap target, and the one the animal is wearing is ringed
    const tile = scene.add.graphics();
    tile.fillStyle(0xffffff, 0.85);
    tile.fillRoundedRect(cx - tileW / 2, cy - tileH / 2, tileW, tileH, 14);
    tile.lineStyle(equipped ? 4 : 2, equipped ? 0x333333 : 0xd9c8a8, equipped ? 1 : 0.8);
    tile.strokeRoundedRect(cx - tileW / 2, cy - tileH / 2, tileW, tileH, 14);
    container.add(tile);

    // The garment itself, coloured. No art (not loaded, or not drawn yet)
    // is a swatch of the colour, not an empty tile.
    const tinted = ensureTintedGarment(scene, garmentKey, hex);
    if (tinted) {
      const art = scene.add.image(cx, cy, tinted);
      art.setScale(Math.min((tileW - 18) / art.width, (tileH - 14) / art.height));
      container.add(art);
    } else {
      container.add(
        scene.add.circle(cx, cy, 26, Phaser.Display.Color.HexStringToColor(hex).color)
          .setStrokeStyle(3, 0xffffff, 0.9),
      );
    }

    const hit = scene.add.rectangle(cx, cy, tileW, tileH, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      callbacks.onEquip(formatWardrobe(garment, hex));
    });
    container.add(hit);

    // Colour name below
    container.add(
      scene.add.text(cx, cy + tileH / 2 + 4, name, {
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body,
        color: COLOURS.text, resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5, 0),
    );
  });

  // Remove-garment option (bottom of panel)
  const removeY = panelY + panelH - 28;
  if (animal.wardrobe) {
    const removeHit = scene.add.rectangle(width / 2, removeY, 200, 28, 0xeeeeee, 0.8)
      .setStrokeStyle(1, 0xd9c8a8)
      .setInteractive({ useHandCursor: true });
    removeHit.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      callbacks.onRemove();
    });
    container.add(removeHit);
    container.add(
      scene.add.text(width / 2, removeY, 'Take off', {
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body, fontStyle: 'bold',
        color: '#7b5c3a', resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5),
    );
  }
}
