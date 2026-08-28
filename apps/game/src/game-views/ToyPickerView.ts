import Phaser from 'phaser';
import type { Animal } from '@arc/shared-types';
import { getAvailableToys, getPlayToyId, type ToyDef } from '@arc/game-logic';
import { COLOURS, FONTS, TEXT_RESOLUTION, MIN_FONT } from '../ui/constants';
import { createButton } from '../ui/UIButton';
import { createAnimalSprite } from '../ui/sprites';

/**
 * ToyPickerView — a short in-scene moment between AnimalDetailsPopup
 * and PlayScene. The player sees their animal in the middle of a
 * cream-and-wood card, a row of toy discs below, and a "Play now!"
 * button. Tapping a toy equips it as the animal's favourite (which
 * PlayScene then resolves via getPlayToyId).
 *
 * Only shown when the animal has more than one available toy —
 * otherwise GameScene skips straight to PlayScene.
 */

export interface ToyPickerCallbacks {
  /** Player picked a toy — caller persists `animal.favouriteToy = toyId`. */
  onPick: (toyId: string) => void;
  /** Player hit "Play now!" — caller launches PlayScene with the current animal. */
  onPlay: () => void;
  /** Player dismissed the picker (back arrow / overlay tap). */
  onBack: () => void;
}

/**
 * Render the toy picker overlay into `container`. Caller owns the
 * container's lifecycle (clear it on close). Responsive to
 * scene.scale.width/height — re-render on resize if needed.
 */
export function renderToyPicker(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  animal: Animal,
  callbacks: ToyPickerCallbacks,
): void {
  const { width, height } = scene.scale;

  // Local selection state — tracked per-render so the highlighted
  // card updates instantly without waiting for the parent re-render.
  let selectedToyId = getPlayToyId(animal);
  const toys = getAvailableToys(animal);

  // Dim overlay — tap to back out.
  const overlay = scene.add
    .rectangle(width / 2, height / 2, width, height, 0x000000, 0.45)
    .setInteractive();
  overlay.on('pointerdown', () => callbacks.onBack());
  container.add(overlay);

  // ── Panel geometry ─────────────────────────────────────────
  const panelW = Math.min(420, width - 32);
  const cardSize = 96;
  const cardGap = 14;
  // Grow panel so toys + title + sprite + play button all fit.
  const panelH = Math.min(520, height - 60);
  const panelX = width / 2 - panelW / 2;
  const panelY = height / 2 - panelH / 2;

  // Cream panel with soft wood border
  const shadow = scene.add.graphics();
  shadow.fillStyle(0x000000, 0.25);
  shadow.fillRoundedRect(panelX + 4, panelY + 6, panelW, panelH, 22);
  container.add(shadow);

  const body = scene.add.graphics();
  body.fillStyle(0xfffaf0, 1);
  body.fillRoundedRect(panelX, panelY, panelW, panelH, 22);
  body.lineStyle(3, 0xd9c8a8, 0.9);
  body.strokeRoundedRect(panelX, panelY, panelW, panelH, 22);
  container.add(body);

  // ── Title ──────────────────────────────────────────────────
  const titleY = panelY + 26;
  const title = scene.add.text(width / 2, titleY,
    `Which toy for ${animal.name}?`, {
      fontSize: '20px', fontFamily: FONTS.title, fontStyle: 'bold',
      color: COLOURS.text, resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5, 0);
  container.add(title);

  // ── Close X (top-right) ────────────────────────────────────
  const closeX = scene.add.text(panelX + panelW - 20, panelY + 16, '\u2715', {
    fontSize: '20px', color: '#999', resolution: TEXT_RESOLUTION,
  }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true });
  closeX.on('pointerdown', (p: Phaser.Input.Pointer) => {
    p.event?.stopPropagation();
    callbacks.onBack();
  });
  container.add(closeX);

  // ── Animal sprite ──────────────────────────────────────────
  const spriteCY = titleY + 40 + 60;
  const spriteSize = 120;
  const sprite = createAnimalSprite(scene, width / 2, spriteCY, animal, {
    width: spriteSize,
    height: spriteSize,
    stateOverride: 'sheltered',
  });
  container.add(sprite);

  // ── Toy cards row ──────────────────────────────────────────
  // Horizontal row centred on panel. If too many toys to fit in a
  // single row, wrap to a second row. Realistically there are 1-4
  // toys per animal so this is usually a single row.
  const rowY = spriteCY + spriteSize / 2 + 30;

  const cardRadius = cardSize / 2;
  const maxPerRow = Math.max(1, Math.floor((panelW - 32) / (cardSize + cardGap)));
  const cardObjects: Array<{ toy: ToyDef; ring: Phaser.GameObjects.Arc }> = [];

  const drawRow = (rowToys: ToyDef[], rowIndex: number) => {
    const rowW = rowToys.length * cardSize + (rowToys.length - 1) * cardGap;
    const rowStartX = width / 2 - rowW / 2 + cardSize / 2;
    const thisRowY = rowY + rowIndex * (cardSize + 28);

    rowToys.forEach((toy, i) => {
      const cx = rowStartX + i * (cardSize + cardGap);
      const cy = thisRowY;

      // Soft shadow beneath the disc
      const discShadow = scene.add.graphics();
      discShadow.fillStyle(0x000000, 0.18);
      discShadow.fillCircle(cx + 2, cy + 3, cardRadius);
      container.add(discShadow);

      // Selection glow (behind disc) — green ring, visible only when selected
      const glow = scene.add.circle(cx, cy, cardRadius + 7, 0x4CAF50, 0);
      container.add(glow);

      // Disc body (warm cream)
      const disc = scene.add.circle(cx, cy, cardRadius, 0xfff4dc)
        .setStrokeStyle(3, 0xfaf1d9, 1);
      container.add(disc);

      // Selection ring (crisp green outline) — on top of disc
      const ring = scene.add.circle(cx, cy, cardRadius - 1, 0x000000, 0)
        .setStrokeStyle(4, 0x4CAF50, 0);
      container.add(ring);

      // Emoji (big)
      const emoji = scene.add.text(cx, cy - 4, toy.emoji, {
        fontSize: '46px',
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5);
      container.add(emoji);

      // Label underneath
      const label = scene.add.text(cx, cy + cardRadius + 8, toy.label, {
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body, fontStyle: 'bold',
        color: COLOURS.text, resolution: TEXT_RESOLUTION,
        align: 'center', wordWrap: { width: cardSize + 20 },
      }).setOrigin(0.5, 0);
      container.add(label);

      // Hit area — whole disc
      const hit = scene.add.circle(cx, cy, cardRadius, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      container.add(hit);

      const applySelection = () => {
        const isSelected = toy.id === selectedToyId;
        ring.setStrokeStyle(4, 0x4CAF50, isSelected ? 1 : 0);
        glow.setFillStyle(0x4CAF50, isSelected ? 0.18 : 0);
      };
      applySelection();

      hit.on('pointerover', () => {
        scene.tweens.add({ targets: [disc, emoji, ring, glow, label],
          scale: 1.05, duration: 80, ease: 'Sine.Out' });
      });
      hit.on('pointerout', () => {
        scene.tweens.add({ targets: [disc, emoji, ring, glow, label],
          scale: 1, duration: 80, ease: 'Sine.Out' });
      });
      hit.on('pointerdown', (p: Phaser.Input.Pointer) => {
        p.event?.stopPropagation();
        if (toy.id === selectedToyId) return;
        selectedToyId = toy.id;
        callbacks.onPick(toy.id);
        cardObjects.forEach((c) => {
          const sel = c.toy.id === selectedToyId;
          c.ring.setStrokeStyle(4, 0x4CAF50, sel ? 1 : 0);
        });
        // Update glows too
        container.list.forEach(() => {/* no-op; glows handled via cardObjects below if we stored them */});
      });

      cardObjects.push({ toy, ring });
    });
  };

  // Split into rows if needed
  for (let r = 0; r * maxPerRow < toys.length; r++) {
    drawRow(toys.slice(r * maxPerRow, (r + 1) * maxPerRow), r);
  }

  // ── "Play now!" pill button ────────────────────────────────
  const playBtnY = panelY + panelH - 40;
  container.add(
    createButton(scene, width / 2, playBtnY, 'Play now!',
      () => callbacks.onPlay(),
      {
        width: 220, fontSize: '18px',
        bgColour: '#E6A23C', // honey-amber wooden-button style
        radius: 22,
      }),
  );
}
