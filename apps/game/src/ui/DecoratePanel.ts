import Phaser from 'phaser';
import type { PlacedDecoration, DepotState } from '@arc/shared-types';
import { ALL_REWARDS } from '@arc/game-logic';
import { COLOURS, FONTS, TEXT_RESOLUTION } from './constants';

/**
 * DecoratePanel — room decoration placement UI.
 *
 * Lives in its own file (rather than inside the already 3,000-LOC
 * GameScene) so the upcoming scene refactor can pick it up as-is.
 *
 * UX flow:
 * - Player taps "🎀 Decorate" in the species room header.
 * - This panel renders a bottom strip showing every decoration with a
 *   positive inventory count, plus a "Done" button.
 * - Player taps a palette item → it's "selected" (highlighted).
 * - Player taps anywhere in the room → selected item is placed at that
 *   point (caller handles the place callback, which updates state and
 *   re-renders).
 * - Player taps an existing placed decoration → a small remove button
 *   floats above it; tapping the ✕ returns it to inventory.
 * - Tapping "Done" dismisses the panel (returns control to the room).
 *
 * Intentional minimalism: this v1 ships a working decorate flow for
 * kids without drag-to-move complexity. Once we've validated the loop,
 * adding drag-to-reposition is straightforward on top of this.
 */

export interface DecoratePanelCallbacks {
  /** Called when the player taps the room with a palette item selected.
   *  Coordinates are fractional (0..1) relative to the room area. */
  onPlace: (code: string, x: number, y: number) => void;
  /** Called when the player taps the ✕ on an existing placed decoration. */
  onRemove: (id: string) => void;
  /** Called when the player taps "Done" to exit decorate mode. */
  onExit: () => void;
}

export interface DecoratePanelOptions {
  /** Depot state (for reading current decoration inventory counts). */
  depot: DepotState;
  /** Decorations already placed in the current room. */
  placedInRoom: PlacedDecoration[];
  /** Room bounds — used to translate tap coordinates into fractional positions. */
  roomBounds: { x: number; y: number; width: number; height: number };
  callbacks: DecoratePanelCallbacks;
}

/**
 * Lookup emoji for a reward code. Falls back to a question mark if the
 * catalogue doesn't have this code (should never happen for v1).
 */
function emojiFor(code: string): string {
  const reward = ALL_REWARDS.find((r) => r.code === code);
  return reward?.emoji ?? '❓';
}

function labelFor(code: string): string {
  const reward = ALL_REWARDS.find((r) => r.code === code);
  return reward?.label ?? code;
}

/**
 * Build the decorate overlay. Returns the container and a disposer that
 * should be called by the caller when exiting the mode (usually in
 * response to `onExit`). The caller is responsible for re-rendering
 * after state changes; this panel does not re-render itself.
 */
export function buildDecoratePanel(
  scene: Phaser.Scene,
  options: DecoratePanelOptions,
): { container: Phaser.GameObjects.Container; dispose: () => void } {
  const { depot, placedInRoom, roomBounds, callbacks } = options;
  const container = scene.add.container(0, 0);
  container.setDepth(200);

  const counts = getCountsFromDepot(depot);
  let selectedCode: string | null = null;
  let selectionFrame: Phaser.GameObjects.Rectangle | null = null;

  // ── Tap-to-place hit area ─────────────────────────────────────
  // Large invisible rectangle covering the room bounds. Only active when
  // a palette item is selected.
  const placeHit = scene.add
    .rectangle(
      roomBounds.x + roomBounds.width / 2,
      roomBounds.y + roomBounds.height / 2,
      roomBounds.width,
      roomBounds.height,
      0xffffff,
      0,
    )
    .setInteractive({ useHandCursor: false });

  placeHit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    if (!selectedCode) return;
    // Translate to fractional coords within roomBounds
    const fx = (pointer.x - roomBounds.x) / roomBounds.width;
    const fy = (pointer.y - roomBounds.y) / roomBounds.height;
    callbacks.onPlace(selectedCode, fx, fy);
    // Intentionally keep the selection — children often want to place
    // several of the same decoration in a row.
  });

  container.add(placeHit);

  // ── Remove buttons on existing placed decorations ─────────────
  // Small ✕ above each placed item. Tap to remove.
  for (const deco of placedInRoom) {
    const px = roomBounds.x + deco.x * roomBounds.width;
    const py = roomBounds.y + deco.y * roomBounds.height;

    const removeBtn = scene.add.container(px + 18, py - 18);
    const removeBg = scene.add.circle(0, 0, 12, 0xc0392b).setStrokeStyle(2, 0xffffff);
    const removeText = scene.add
      .text(0, 0, '✕', {
        fontSize: '14px',
        fontFamily: FONTS.body,
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(TEXT_RESOLUTION);
    removeBg.setInteractive({ useHandCursor: true });
    removeBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      callbacks.onRemove(deco.id);
    });
    removeBtn.add([removeBg, removeText]);
    container.add(removeBtn);
  }

  // ── Bottom palette strip ──────────────────────────────────────
  const cam = scene.cameras.main;
  const paletteY = cam.height - 90;
  const paletteBg = scene.add
    .rectangle(cam.width / 2, paletteY + 40, cam.width, 100, 0xfef9ef, 0.96)
    .setStrokeStyle(2, 0xd4783c, 1);
  container.add(paletteBg);

  // "Decorate mode" label (left)
  const label = scene.add
    .text(20, paletteY + 40, '🎀 Decorate', {
      fontSize: '16px',
      fontFamily: FONTS.title,
      color: COLOURS.text,
      fontStyle: 'bold',
    })
    .setOrigin(0, 0.5)
    .setResolution(TEXT_RESOLUTION);
  container.add(label);

  // "Done" button (right)
  const doneBg = scene.add
    .rectangle(cam.width - 70, paletteY + 40, 100, 44, 0x5aae4a)
    .setStrokeStyle(2, 0x3d8a2e)
    .setInteractive({ useHandCursor: true });
  const doneText = scene.add
    .text(cam.width - 70, paletteY + 40, 'Done', {
      fontSize: '16px',
      fontFamily: FONTS.title,
      color: '#ffffff',
      fontStyle: 'bold',
    })
    .setOrigin(0.5)
    .setResolution(TEXT_RESOLUTION);
  doneBg.on('pointerdown', () => callbacks.onExit());
  container.add([doneBg, doneText]);

  // ── Palette items ─────────────────────────────────────────────
  const codes = Object.keys(counts);
  if (codes.length === 0) {
    const emptyText = scene.add
      .text(cam.width / 2, paletteY + 40, 'No decorations earned yet — visit the Depot!', {
        fontSize: '14px',
        fontFamily: FONTS.body,
        color: COLOURS.textLight,
        fontStyle: 'italic',
      })
      .setOrigin(0.5)
      .setResolution(TEXT_RESOLUTION);
    container.add(emptyText);
  } else {
    // Compact row starting after the label, ending before the Done button
    const startX = 160;
    const endX = cam.width - 140;
    const slotW = 68;
    const maxSlots = Math.floor((endX - startX) / slotW);
    const visible = codes.slice(0, maxSlots);

    visible.forEach((code, idx) => {
      const slotX = startX + slotW / 2 + idx * slotW;
      const slotY = paletteY + 40;

      const slotBg = scene.add
        .rectangle(slotX, slotY, slotW - 6, 72, 0xffffff, 1)
        .setStrokeStyle(2, 0xd4c8b8)
        .setInteractive({ useHandCursor: true });

      const emoji = scene.add
        .text(slotX, slotY - 6, emojiFor(code), { fontSize: '28px' })
        .setOrigin(0.5)
        .setResolution(TEXT_RESOLUTION);

      const countText = scene.add
        .text(slotX, slotY + 22, '×' + counts[code], {
          fontSize: '12px',
          fontFamily: FONTS.body,
          color: COLOURS.text,
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setResolution(TEXT_RESOLUTION);

      slotBg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        selectedCode = code;
        // Redraw the selection highlight
        if (selectionFrame) selectionFrame.destroy();
        selectionFrame = scene.add
          .rectangle(slotX, slotY, slotW - 2, 76, 0x5aae4a, 0)
          .setStrokeStyle(3, 0x5aae4a);
        container.add(selectionFrame);
      });

      container.add([slotBg, emoji, countText]);
    });

    // Small "tap to place" hint
    if (visible.length > 0) {
      const hint = scene.add
        .text(cam.width / 2, paletteY - 20, 'Tap a decoration, then tap in the room to place it', {
          fontSize: '12px',
          fontFamily: FONTS.body,
          color: COLOURS.textLight,
          backgroundColor: '#ffffffdd',
          padding: { x: 8, y: 4 },
        })
        .setOrigin(0.5)
        .setResolution(TEXT_RESOLUTION);
      container.add(hint);
    }
  }

  const dispose = () => container.destroy();

  return { container, dispose };
}

function getCountsFromDepot(depot: DepotState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [code, count] of Object.entries(depot.inventory.decorations)) {
    if (count > 0) out[code] = count;
  }
  return out;
}

/** Re-export so callers can render placed decorations without importing ALL_REWARDS. */
export function getDecorationEmoji(code: string): string {
  return emojiFor(code);
}

export function getDecorationLabel(code: string): string {
  return labelFor(code);
}
