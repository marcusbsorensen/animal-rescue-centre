import Phaser from 'phaser';
import type { Animal } from '@arc/shared-types';
import { getGarmentForSpecies } from '@arc/game-logic';
import { COLOURS, FONTS, TEXT_RESOLUTION, MIN_FONT, TYPE } from '../ui/constants';

/**
 * WardrobePickerView — a small modal that lets the player pick a
 * colour for their species' garment (coat / scarf / hat) and equip it.
 *
 * Design:
 *   - Species gets ONE garment type (see wardrobe.ts mapping). The
 *     picker only shows colour choices, not garment type.
 *   - 6 pre-set kid-friendly colours + a "none / remove" option.
 *   - Tapping a colour equips + closes modal; re-render happens on
 *     the scene side via the provided `onEquip` callback.
 *   - Tapping outside the panel or the ✕ closes without changing.
 *
 * The actual `wardrobe` field on Animal stores a code like
 * `"scarf:#ff6b9d"` — the garment name plus a `:#hex` suffix for the
 * tint to apply to the shared species-garment sprite at render time.
 */

const WARDROBE_COLOURS: Array<{ name: string; hex: string }> = [
  { name: 'Rust',    hex: '#c0392b' },
  { name: 'Navy',    hex: '#2c3e50' },
  { name: 'Mustard', hex: '#e3b04b' },
  { name: 'Forest',  hex: '#27ae60' },
  { name: 'Plum',    hex: '#8e44ad' },
  { name: 'Teal',    hex: '#16a085' },
];

export interface WardrobePickerCallbacks {
  /** Player picked a colour — persists the equip (code = "garment:#hex"). */
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
  const panelW = 320;
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
      'Tap a colour to equip it',
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

  // Colour swatches — 2 rows × 3 cols
  const swatchSize = 64;
  const gap = 18;
  const cols = 3;
  const gridW = cols * swatchSize + (cols - 1) * gap;
  const gridX0 = width / 2 - gridW / 2;
  const gridY0 = panelY + 80;

  WARDROBE_COLOURS.forEach(({ name, hex }, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const cx = gridX0 + col * (swatchSize + gap) + swatchSize / 2;
    const cy = gridY0 + row * (swatchSize + gap + 14) + swatchSize / 2;

    // Swatch circle
    const colourInt = Phaser.Display.Color.HexStringToColor(hex).color;
    const swatch = scene.add.circle(cx, cy, swatchSize / 2, colourInt)
      .setStrokeStyle(3, 0xffffff, 0.9)
      .setInteractive({ useHandCursor: true });
    // Highlight if currently equipped
    const equippedHex = animal.wardrobe?.split(':')[1];
    if (equippedHex === hex) {
      scene.add.circle(cx, cy, swatchSize / 2 + 4, 0x000000, 0)
        .setStrokeStyle(3, 0x333333, 1);
    }
    swatch.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      callbacks.onEquip(`${garment}:${hex}`);
    });
    container.add(swatch);

    // Colour name below
    container.add(
      scene.add.text(cx, cy + swatchSize / 2 + 8, name, {
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body,
        color: COLOURS.text, resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5, 0),
    );
  });

  // Remove-garment option (bottom of panel)
  const removeY = panelY + panelH - 36;
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
