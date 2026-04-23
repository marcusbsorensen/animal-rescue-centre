import Phaser from 'phaser';
import type { Animal, Species } from '@arc/shared-types';
import { SPECIES_COLOURS, getAvailableDecorationCounts, getRoomDecorations } from '@arc/game-logic';
import { createPillTitle } from '../ui/UIButton';
import { createAnimalSprite } from '../ui/sprites';
import { RoomAnchors, type Anchor } from '../lib/RoomAnchors';
import { COLOURS, FONTS, TEXT_RESOLUTION } from '../ui/constants';
import { getDecorationEmoji } from '../ui/DecoratePanel';
import type { GameStateStore } from '../game-state';
import type { ResolvedAnchor } from './GardenView';

/**
 * RoomView — renders a single species room with all its sheltered /
 * bonding / pet animals laid out against the species-specific
 * background. Plus dirty mud/flies, status chips, name pills, bond
 * bars, sibling link icons, and player-placed decorations.
 *
 * Phase 7 extraction. The most animation-heavy view — cross-fades
 * between visual states, dirty-state mud + flies, status-chip pulse,
 * per-animal interactive sprites. ~340 LOC.
 *
 * Anchor helpers (deriveAnchorState, resolveAnchor) live on the
 * scene for now and arrive via callbacks; they're shared with
 * GardenView so worth keeping scene-local until a later shared
 * "anchor-helpers" module is justified.
 */

export interface RoomCallbacks {
  deriveAnchorState: (animal: Animal) => string;
  resolveAnchor: (
    anchor: Anchor | null,
    bgTopY: number, bgW: number, bgH: number,
    baseW: number, baseH: number,
  ) => ResolvedAnchor | null;
  /** Tap an animal sprite — opens its details popup. */
  onShowAnimalDetails: (animal: Animal, anchor: { x: number; y: number; size: number }) => void;
  /** Tap the "Decorate" button — scene opens DecoratePanel. */
  onEnterDecorateMode: () => void;
  /** Draw the nav bar with Back. */
  renderNavBar: (opts: { showBack: boolean }) => void;
}

export interface RoomRenderContext {
  /** Current species whose room is being rendered. */
  species: Species;
  /** Per-animal Map tracking last rendered visual state, keyed by animal.id.
   *  Used to trigger cross-fades when a state changes. Scene owns this map;
   *  the view reads + writes as it renders. */
  lastVisualStates: Map<string, string>;
  /** Persistent layer for cross-fade ghost sprites — NOT cleared between
   *  renders so the ghost survives the next view switch. */
  transitionLayer: Phaser.GameObjects.Container;
}

export function renderRoom(
  scene: Phaser.Scene,
  store: GameStateStore,
  container: Phaser.GameObjects.Container,
  ctx: RoomRenderContext,
  callbacks: RoomCallbacks,
): void {
  const { width, height } = scene.scale;
  const species = ctx.species;
  // Hide outsiders — animals currently let out into the garden
  // shouldn't appear in their indoor room. They render in GardenView.
  const roomAnimals = store.animals.filter(
    (a) => a.species === species && a.state !== 'arriving' && !a.outsideAt,
  );

  // ── Background ───────────────────────────────────────────
  const roomBgKey = scene.textures.exists(`bg-room-${species}`)
    ? `bg-room-${species}`
    : 'bg-room-generic';
  if (scene.textures.exists(roomBgKey)) {
    const bg = scene.add.image(width / 2, height / 2, roomBgKey);
    bg.setDisplaySize(width, height - 40);
    container.add(bg);
  } else {
    const colour = SPECIES_COLOURS[species];
    container.add(
      scene.add.rectangle(width / 2, height / 2, width, height - 40, colour, 0.1),
    );
  }

  container.add(
    createPillTitle(scene, width / 2, 55,
      `${species.charAt(0).toUpperCase() + species.slice(1)} Room`,
      { bgColour: 0x5AAE4A, fontSize: '28px', padX: 36, padY: 14 }),
  );

  // ── Placed decorations (under animals) ────────────────────
  renderPlacedDecorations(scene, store, container, species, width, height);

  // ── Decorate button (only if relevant) ────────────────────
  const availableDecorCount = Object.values(
    getAvailableDecorationCounts(store.depot),
  ).reduce((sum, n) => sum + n, 0);
  const hasPlaced = store.placedDecorations.some((d) => d.roomId === `room-${species}`);
  if (availableDecorCount > 0 || hasPlaced) {
    renderDecorateButton(scene, container, width, callbacks.onEnterDecorateMode);
  }

  // ── Empty state or animal grid ────────────────────────────
  if (roomAnimals.length === 0) {
    container.add(
      scene.add.text(width / 2, height / 2, 'No animals here yet.', {
        fontSize: '18px', fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5),
    );
  } else {
    const cols = Math.min(roomAnimals.length, 4);
    const colSpacing = Math.min(140, (width - 60) / cols);
    const startX = width / 2 - ((cols - 1) * colSpacing) / 2;
    const floorY = height * 0.55;

    const anchors = RoomAnchors.getInstance();
    const roomKey = `room-${species}`;
    const bgTopY = 20, bgW = width, bgH = height - 40;

    roomAnimals.forEach((animal, i) => {
      const baseSize = animal.state === 'pet' ? 120 : 100;
      const visualState = callbacks.deriveAnchorState(animal);
      const anchor = anchors.pick(roomKey, animal.species, visualState, i);
      const placed = callbacks.resolveAnchor(anchor, bgTopY, bgW, bgH, baseSize, baseSize * 0.8);

      const x = placed ? placed.cx : startX + (i % 4) * colSpacing;
      const y = placed ? placed.cy : floorY + Math.floor(i / 4) * 150;
      const size = placed ? placed.w : baseSize;

      // Cross-fade when state changed since last render
      const prevVisualState = ctx.lastVisualStates.get(animal.id);
      const stateChanged = prevVisualState !== undefined && prevVisualState !== visualState;

      const sprite = createAnimalSprite(scene, x, y, animal, {
        width: size, height: size * 0.8, interactive: true,
      });
      if (placed?.flipX && 'setFlipX' in sprite) {
        (sprite as Phaser.GameObjects.Image).setFlipX(true);
      }

      if (stateChanged) {
        // Old-state ghost in the persistent transition layer survives the
        // next container.removeAll(true) cleanly while fading out.
        const ghost = createAnimalSprite(scene, x, y, animal, {
          width: size, height: size * 0.8, stateOverride: prevVisualState,
        });
        if (placed?.flipX && 'setFlipX' in ghost) {
          (ghost as Phaser.GameObjects.Image).setFlipX(true);
        }
        ctx.transitionLayer.add(ghost);
        scene.tweens.add({
          targets: ghost,
          alpha: 0,
          duration: 400,
          ease: 'Sine.easeOut',
          onComplete: () => ghost.destroy(),
        });
        // New sprite fades in on top
        sprite.setAlpha(0);
        scene.tweens.add({
          targets: sprite,
          alpha: 1,
          duration: 400,
          ease: 'Sine.easeIn',
        });
      }
      ctx.lastVisualStates.set(animal.id, visualState);

      // Pet gold border (if sprite is fallback rectangle)
      if (animal.state === 'pet' && sprite instanceof Phaser.GameObjects.Rectangle) {
        sprite.setStrokeStyle(3, 0xffd700, 0.8);
      }

      // ── Dirty overlay (mud + flies) ─────────────────────
      //
      // When cleanliness drops below 60 the animal looks visibly grubby.
      // Kids learn to read the visuals (mud = needs a brush) rather
      // than a tiny icon.
      const cleanliness = animal.cleanliness ?? 100;
      if (cleanliness < 60 && animal.state !== 'pet') {
        renderDirtyOverlay(scene, container, animal, x, y, size, cleanliness);
      }

      // Name pill badge
      const namePillGfx = scene.add.graphics();
      const nameText = scene.add.text(x, y + size / 2 + 14, animal.name, {
        fontSize: '16px', fontFamily: FONTS.title, fontStyle: 'bold',
        color: '#ffffff', resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5);
      const nw = nameText.width + 20;
      const nh = nameText.height + 8;
      namePillGfx.fillStyle(SPECIES_COLOURS[animal.species], 0.85);
      namePillGfx.fillRoundedRect(x - nw / 2, y + size / 2 + 14 - nh / 2, nw, nh, 10);
      container.add(namePillGfx);
      container.add(nameText);

      // ── Status chip stack (right of sprite) ─────────────
      renderStatusChips(scene, store, container, animal, x, y, size);

      // Bond bar
      if (animal.bondLevel > 0) {
        const barW = 50;
        const barY = y + size / 2 + 32;
        const bondBar = scene.add.rectangle(x, barY, barW, 5, 0xdddddd, 0.6).setOrigin(0.5);
        const bondFill = scene.add.rectangle(
          x - barW / 2 + (animal.bondLevel / 100) * barW / 2, barY,
          (animal.bondLevel / 100) * barW, 5, 0xff6b9d,
        ).setOrigin(0.5);
        container.add(bondBar);
        container.add(bondFill);
      }

      // Sibling indicator
      if (animal.siblingId) {
        const sibIconKey = 'icon-friends';
        if (scene.textures.exists(sibIconKey)) {
          const sibIcon = scene.add.image(x - size / 2 + 6, y - size * 0.4 - 6, sibIconKey)
            .setDisplaySize(18, 18).setOrigin(0.5);
          container.add(sibIcon);
        } else {
          const sibDot = scene.add.circle(x - size / 2 + 6, y - size * 0.4 - 6, 6, 0x9b59b6)
            .setStrokeStyle(1, 0xffffff, 0.8);
          container.add(sibDot);
        }
      }

      sprite.on('pointerdown', () =>
        callbacks.onShowAnimalDetails(animal, { x, y, size }),
      );
      container.add(sprite);
    });
  }

  callbacks.renderNavBar({ showBack: true });
}

// ── Private helpers ───────────────────────────────────────

function renderPlacedDecorations(
  scene: Phaser.Scene,
  store: GameStateStore,
  container: Phaser.GameObjects.Container,
  species: Species,
  width: number,
  height: number,
): void {
  const roomId = `room-${species}`;
  const inRoom = getRoomDecorations(store.placedDecorations, roomId);
  if (inRoom.length === 0) return;

  // Room bg area is roughly the top of the screen to the nav bar.
  const roomBounds = { x: 0, y: 20, width, height: height - 40 };

  for (const deco of inRoom) {
    const px = roomBounds.x + deco.x * roomBounds.width;
    const py = roomBounds.y + deco.y * roomBounds.height;
    const emojiText = scene.add
      .text(px, py, getDecorationEmoji(deco.code), { fontSize: '32px' })
      .setOrigin(0.5)
      .setResolution(TEXT_RESOLUTION);
    // Below animals, above bg
    emojiText.setDepth(5);
    container.add(emojiText);
  }
}

function renderDecorateButton(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  width: number,
  onTap: () => void,
): void {
  const btnBg = scene.add
    .rectangle(width - 70, 55, 120, 40, 0xffffff, 0.96)
    .setStrokeStyle(2, 0xd4783c)
    .setInteractive({ useHandCursor: true });
  const btnText = scene.add
    .text(width - 70, 55, '🎀 Decorate', {
      fontSize: '14px',
      fontFamily: FONTS.title,
      color: COLOURS.text,
      fontStyle: 'bold',
    })
    .setOrigin(0.5)
    .setResolution(TEXT_RESOLUTION);
  btnBg.on('pointerdown', onTap);
  container.add([btnBg, btnText]);
}

function renderDirtyOverlay(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  animal: Animal,
  x: number,
  y: number,
  size: number,
  cleanliness: number,
): void {
  // Deterministic-ish spot placement seeded by animal id so mud doesn't
  // dance around every re-render.
  const seed = animal.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const rand = (n: number) => {
    const r = Math.sin(seed * 9999 + n) * 10000;
    return r - Math.floor(r);
  };
  // 3 spots at cleanliness=59, up to 6 at 0
  const spotCount = 3 + Math.floor((60 - cleanliness) / 15);
  const halfW = size * 0.28;
  const halfH = size * 0.22;
  for (let si = 0; si < spotCount; si += 1) {
    const ox = (rand(si * 2) * 2 - 1) * halfW;
    const oy = (rand(si * 2 + 1) * 2 - 1) * halfH + size * 0.05;
    const r = 4 + rand(si * 3) * 4;
    const tone = rand(si * 5) > 0.5 ? 0x8b6f47 : 0x6b5a4a;
    const mud = scene.add.ellipse(x + ox, y + oy, r * 2, r * 1.4, tone, 0.72);
    container.add(mud);
  }
  // Flies — 1 at 40-59, 2 below. Tiny figure-8 above the animal's head.
  const flyCount = cleanliness < 40 ? 2 : 1;
  for (let fi = 0; fi < flyCount; fi += 1) {
    const flyOriginX = x + (fi === 0 ? -size * 0.18 : size * 0.18);
    const flyOriginY = y - size * 0.48;
    const fly = scene.add.text(flyOriginX, flyOriginY, '🐝', {
      fontSize: '12px', resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5).setAlpha(0.85);
    container.add(fly);
    const phase = fi * Math.PI;
    const orbit = { t: phase };
    scene.tweens.add({
      targets: orbit,
      t: phase + Math.PI * 2,
      duration: 1800 + fi * 300,
      repeat: -1,
      onUpdate: () => {
        fly.x = flyOriginX + Math.cos(orbit.t) * 12;
        fly.y = flyOriginY + Math.sin(orbit.t * 2) * 6;
      },
    });
  }
}

type StatusChip = { iconKey: string; tint: number; emoji: string; pulse: boolean };

function renderStatusChips(
  scene: Phaser.Scene,
  store: GameStateStore,
  container: Phaser.GameObjects.Container,
  animal: Animal,
  x: number,
  y: number,
  size: number,
): void {
  const chips: StatusChip[] = [];
  const sickIllness = store.sickAnimals.get(animal.id);
  if (sickIllness) {
    chips.push({ iconKey: 'icon-heal', tint: 0xe74c3c, emoji: '🩹', pulse: true });
  }
  // Multiple unmet needs can show at once — stack teaches body language
  // ("hungry + tired = she's had a rough day").
  if (animal.hunger >= 70) {
    chips.push({ iconKey: 'icon-feed', tint: 0xe67e22, emoji: '🍽️', pulse: !sickIllness });
  }
  if (animal.tiredness >= 70) {
    chips.push({ iconKey: 'icon-rest', tint: 0x3498db, emoji: '💤', pulse: false });
  }
  if (animal.happiness <= 30) {
    chips.push({ iconKey: 'icon-play', tint: 0xf1c40f, emoji: '🙁', pulse: false });
  }

  // Cap at 3 — keeps the room uncluttered.
  const visibleChips = chips.slice(0, 3);
  visibleChips.forEach((chip, ci) => {
    const chipX = x + size / 2 - 4;
    const chipY = y - size * 0.4 - 4 + ci * 28;
    const chipR = 14;
    const bg = scene.add.graphics();
    bg.fillStyle(0x000000, 0.18);
    bg.fillCircle(chipX + 1, chipY + 2, chipR);
    bg.fillStyle(0xfffaf0, 1);
    bg.fillCircle(chipX, chipY, chipR);
    bg.lineStyle(2, chip.tint, 0.9);
    bg.strokeCircle(chipX, chipY, chipR);
    container.add(bg);
    if (scene.textures.exists(chip.iconKey)) {
      const ic = scene.add.image(chipX, chipY, chip.iconKey)
        .setDisplaySize(20, 20).setOrigin(0.5);
      scene.textures.get(chip.iconKey).setFilter(Phaser.Textures.FilterMode.LINEAR);
      container.add(ic);
    } else {
      const em = scene.add.text(chipX, chipY, chip.emoji, {
        fontSize: '16px', resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5);
      container.add(em);
    }
    if (chip.pulse) {
      const p = { s: 1 };
      scene.tweens.add({
        targets: p,
        s: 1.2,
        duration: 650,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        onUpdate: () => {
          bg.setScale(p.s, p.s);
          bg.x = chipX * (1 - p.s);
          bg.y = chipY * (1 - p.s);
        },
      });
    }
  });
}
