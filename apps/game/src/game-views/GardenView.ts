import Phaser from 'phaser';
import type { Animal } from '@arc/shared-types';
import { getAvailableUpgrades, getUnlockedUpgrades } from '@arc/game-logic';
import { createPillTitle, createTextButton } from '../ui/UIButton';
import { createAnimalSprite } from '../ui/sprites';
import { COLOURS, FONTS, TEXT_RESOLUTION } from '../ui/constants';
import { RoomAnchors, type Anchor } from '../lib/RoomAnchors';
import type { GameStateStore } from '../game-state';

/**
 * GardenView — renders the "bonded pets living their best life" area.
 *
 * Extracted from GameScene as part of the refactor blueprint
 * (docs/gamescene-refactor-plan.md, phase 2). Stateless by design:
 * takes the scene + store + container and a small callbacks bag for
 * actions that cross scene boundaries (opening the animal-details
 * popup, re-rendering after a state change, etc).
 *
 * Renders:
 * - Garden background (bg-garden texture or a green fill fallback).
 * - Pill title.
 * - Scattered pet sprites with collar colours, happiness dots, sick
 *   indicators, gentle idle float tween.
 * - Unlocked-upgrades label + next-upgrade claim button.
 * - Earned-badges count.
 */

/** Shape returned by the scene's anchor-resolver callback. */
export interface ResolvedAnchor {
  cx: number;
  cy: number;
  w: number;
  h: number;
  flipX: boolean;
}

export interface GardenCallbacks {
  /**
   * Derive the visual state bucket for a given animal — used to pick
   * the right anchor variant. Same helper the Room view uses; lives on
   * the scene for now, moves to a shared helper in a later phase.
   */
  deriveAnchorState: (animal: Animal) => string;

  /**
   * Translate an anchor record into a concrete pixel rect, or null
   * if no anchor is supplied (caller falls back to procedural layout).
   */
  resolveAnchor: (
    anchor: Anchor | null,
    bgTopY: number, bgW: number, bgH: number,
    baseW: number, baseH: number,
  ) => ResolvedAnchor | null;

  /** Open the animal-details popup for a tapped pet. */
  showAnimalDetails: (pet: Animal, pos: { x: number; y: number; size: number }) => void;

  /** Player claimed a newly-available house upgrade — increments the
   *  store's houseUpgrades, triggers badge check + save + re-render. */
  onUpgradeClaimed: (code: string) => void;

  /** Draw the nav bar on top of this view. */
  renderNavBar: (opts: { showBack: boolean }) => void;
}

export function renderGarden(
  scene: Phaser.Scene,
  store: GameStateStore,
  container: Phaser.GameObjects.Container,
  callbacks: GardenCallbacks,
): void {
  const { width, height } = scene.scale;
  const pets = store.animals.filter((a) => a.state === 'pet');

  // ── Background ───────────────────────────────────────────
  if (scene.textures.exists('bg-garden')) {
    const bg = scene.add.image(width / 2, height / 2, 'bg-garden');
    bg.setDisplaySize(width, height - 40);
    container.add(bg);
  } else {
    container.add(
      scene.add.rectangle(width / 2, height / 2, width, height - 40, 0xe8f5e9),
    );
  }

  container.add(
    createPillTitle(scene, width / 2, 55, 'Garden', {
      bgColour: 0x2E8B57, fontSize: '22px', icon: 'icon-garden',
    }),
  );

  if (pets.length === 0) {
    container.add(
      scene.add.text(width / 2, height / 2 - 30, 'No pets yet!', {
        fontSize: '22px', fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5),
    );
    container.add(
      scene.add.text(width / 2, height / 2 + 10,
        'Keep caring for your animals — when their bond\nreaches 100%, they become your pet forever!', {
          fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.textLight, align: 'center',
        }).setOrigin(0.5),
    );
  } else {
    container.add(
      scene.add.text(width / 2, 95,
        `${pets.length} pet${pets.length > 1 ? 's' : ''} living their best life!`, {
          fontSize: '16px', fontFamily: FONTS.body, color: COLOURS.textLight,
        }).setOrigin(0.5),
    );

    // Scatter pets on the grass (lower 40% of screen, above nav bar)
    const anchors = RoomAnchors.getInstance();
    const bgTopY = 20, bgW = width, bgH = height - 40;

    pets.forEach((pet, i) => {
      const grassTop = height * 0.6;
      const gardenLeft = width * 0.15;
      const gardenRight = width * 0.85;
      const cols = Math.min(pets.length, 4);
      const spacing = (gardenRight - gardenLeft) / (cols + 1);

      const visualState = callbacks.deriveAnchorState(pet);
      const anchor = anchors.pick('garden', pet.species, visualState, i);
      const placed = callbacks.resolveAnchor(anchor, bgTopY, bgW, bgH, 100, 80);

      const cx = placed
        ? placed.cx
        : gardenLeft + spacing * ((i % cols) + 1) + (Math.random() - 0.5) * 30;
      const cy = placed
        ? placed.cy
        : grassTop + Math.floor(i / cols) * 80 + (Math.random() * 20);
      const spriteW = placed ? placed.w : 100;
      const spriteH = placed ? placed.h : 80;

      // Collar colour ring
      const collarHex = pet.collarColour ?? '#ff6b9d';
      const collarColour = Phaser.Display.Color.HexStringToColor(collarHex).color;

      // Pet sprite (larger than shelter animals, with collar colour ring)
      const sprite = createAnimalSprite(scene, cx, cy, pet, {
        width: spriteW, height: spriteH, interactive: true,
      });
      if (placed?.flipX && 'setFlipX' in sprite) {
        (sprite as Phaser.GameObjects.Image).setFlipX(true);
      }
      if (sprite instanceof Phaser.GameObjects.Rectangle) {
        sprite.setStrokeStyle(3, collarColour);
      }

      // Collar colour dot below name
      container.add(scene.add.circle(cx, cy + 42, 5, collarColour));
      // Collar colour dot above pet
      container.add(
        scene.add.circle(cx, cy - 44, 6, collarColour).setStrokeStyle(1, 0xffffff, 0.8),
      );

      // Name
      container.add(
        scene.add.text(cx, cy + 30, pet.name, {
          fontSize: '14px', fontFamily: FONTS.body, color: COLOURS.text,
          resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5),
      );

      // Happiness indicator — green / yellow / red
      const happyColour = pet.happiness > 70
        ? 0x2ecc71
        : pet.happiness > 40 ? 0xf1c40f : 0xe74c3c;
      container.add(
        scene.add.circle(cx + 30, cy - 20, 6, happyColour).setStrokeStyle(1, 0xffffff, 0.8),
      );

      // Sick indicator — draws attention to pets needing vet
      const petSickIllness = store.sickAnimals.get(pet.id);
      if (petSickIllness) {
        const sickLabel = scene.add.text(cx, cy + 50, 'Sick!', {
          fontSize: '14px', fontFamily: FONTS.body, color: '#c0392b',
          resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5);
        container.add(sickLabel);
        scene.tweens.add({
          targets: sickLabel,
          alpha: 0.4,
          duration: 800,
          yoyo: true,
          repeat: -1,
        });
      }

      sprite.on('pointerdown', () =>
        callbacks.showAnimalDetails(pet, { x: cx, y: cy, size: spriteW }),
      );
      container.add(sprite);

      // Gentle floating animation
      scene.tweens.add({
        targets: sprite,
        y: cy - 4,
        duration: 2000 + Math.random() * 1000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    });
  }

  // ── Upgrades ─────────────────────────────────────────────
  const unlocked = getUnlockedUpgrades(store.houseUpgrades);
  if (unlocked.length > 0) {
    const upgradeNames = unlocked.map((u) => u.name).join(', ');
    container.add(
      scene.add.text(width / 2, height - 110, `Upgrades: ${upgradeNames}`, {
        fontSize: '13px', fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5),
    );
  }

  // Check for new available upgrades
  const available = getAvailableUpgrades(pets.length, store.houseUpgrades);
  if (available.length > 0) {
    container.add(
      createTextButton(scene, width / 2, height - 85,
        `New upgrade available: ${available[0].name}!`, () => {
          callbacks.onUpgradeClaimed(available[0].code);
        }),
    );
  }

  // ── Badges ───────────────────────────────────────────────
  if (store.earnedBadges.length > 0) {
    container.add(
      scene.add.text(width / 2, height - 65,
        `${store.earnedBadges.length} badge${store.earnedBadges.length > 1 ? 's' : ''} earned`, {
          fontSize: '14px', fontFamily: FONTS.body, color: COLOURS.primary,
        }).setOrigin(0.5),
    );
  }

  callbacks.renderNavBar({ showBack: true });
}
