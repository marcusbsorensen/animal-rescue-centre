import Phaser from 'phaser';
import type { Animal, Species } from '@arc/shared-types';
import { SPECIES_COLOURS, getAvailableDecorationCounts, getRoomDecorations } from '@arc/game-logic';
import { createChromeTitle } from '../ui/UIButton';
import { createAnimalSprite } from '../ui/sprites';
import { RoomAnchors, type Anchor } from '../lib/RoomAnchors';
import { COLOURS, FONTS, TEXT_RESOLUTION, MIN_TAP, SAFE_MARGIN, TITLE_CY, TYPE } from '../ui/constants';
import { getDecorationEmoji } from '../ui/DecoratePanel';
import type { GameStateStore } from '../game-state';
import type { ResolvedAnchor } from './GardenView';
import { getPlayArea } from './LeftRailView';
import { pillFor } from '../ui/contrast';
import { navHeightFor, anchorSpaceFor, animalBoxFor, clampAnimalIntoBand, type PlayArea, titleAnchor, sideNavEnabled } from '../ui/layout';
import {
  renderApprenticeDecorations,
  type ApprenticeRoomSpecies,
} from './ApprenticeDecorations';

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
  onShowAnimalDetails: (animal: Animal) => void;
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
  // The side rail is opaque and sits on top of this container, so the room is
  // laid out inside the space it leaves. Background and anchors both use it,
  // so animals keep landing on the marks the art was painted for.
  const play = getPlayArea(scene);
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
    const bg = scene.add.image(play.x + play.w / 2, height / 2, roomBgKey);
    // Under side-nav the art is drawn into the play box: there is no
    // horizontal chrome for it to run behind, so the art rect and the
    // anchor rect are the same rect and `anchorSpaceFor` has nothing to
    // correct. `height - 40` is the bottom-bar habit — full-bleed art with
    // the chrome sitting on top of it — and left alone here it leaves a
    // cream margin against the rail.
    bg.setY(sideNavEnabled() ? play.y + play.h / 2 : height / 2);
    bg.setDisplaySize(play.w, sideNavEnabled() ? play.h : height - 40);
    container.add(bg);
  } else {
    const colour = SPECIES_COLOURS[species];
    container.add(
      scene.add.rectangle(play.x + play.w / 2, height / 2, play.w, height - 40, colour, 0.1),
    );
  }

  // Title — chrome, not scenery. 28px against the corridor's and garden's
  // 20 was the pill's own emphasis, and it made the room title the largest
  // type in the game; the three read as one product at one size.
  const titleAt = titleAnchor(play);
  container.add(
    createChromeTitle(scene, titleAt.x, TITLE_CY,
      `${species.charAt(0).toUpperCase() + species.slice(1)} Room`,
      { align: titleAt.align }),
  );

  // ── Placed decorations (under animals) ────────────────────
  renderPlacedDecorations(scene, store, container, species, play, height);

  // ── Decorate button (only if relevant) ────────────────────
  const availableDecorCount = Object.values(
    getAvailableDecorationCounts(store.depot),
  ).reduce((sum, n) => sum + n, 0);
  const hasPlaced = store.placedDecorations.some((d) => d.roomId === `room-${species}`);
  if (availableDecorCount > 0 || hasPlaced) {
    renderDecorateButton(scene, container, play.x + play.w, height, callbacks.onEnterDecorateMode);
  }

  // ── Empty state or animal grid ────────────────────────────
  if (roomAnimals.length === 0) {
    // Centred on the play band and the play column, not on the screen: the
    // screen centre is under the rail on the x and drifts towards the FAB
    // on the y as the viewport shortens.
    //
    // On a plate, for the same reason the garden's is. This is the second
    // instance of audit §3 and it had never been looked at — the harness
    // could not reach this screen, so nobody had seen mid-grey 18px set
    // over painted cat beds, cushions and balls of wool. It also had no
    // `resolution`, so it was drawn at 1x on a 3x display.
    container.add(
      createChromeTitle(scene, play.x + play.w / 2, play.y + play.h / 2,
        'No animals here yet.', { fontSize: TYPE.body, overArt: true }),
    );
  } else {
    const cols = Math.min(roomAnimals.length, 4);
    const colSpacing = Math.min(140, (play.w - 60) / cols);
    const startX = play.x + play.w / 2 - ((cols - 1) * colSpacing) / 2;

    const anchors = RoomAnchors.getInstance();
    const roomKey = `room-${species}`;
    // On a tall viewport this is the background art's own rect, so the
    // anchors resolve exactly as before; on a short one it is the play
    // band. 59 of the 100 hand-authored anchors sit below 0.7, which on a
    // 325px screen resolved to y >= 219 against a nav bar starting at 229.
    const anchorSpace = anchorSpaceFor(play, height);
    const bgTopY = anchorSpace.top, bgW = play.w, bgH = anchorSpace.h;
    // The row of animals sits in the lower half of the band, leaving the
    // upper half for the room's painted furniture and the title pill.
    const floorY = play.y + play.h * 0.55;

    roomAnimals.forEach((animal, i) => {
      // 200/240 is the drawn size, not half of it — the box handed to
      // createAnimalSprite is the box it draws in. Measured on a 325px
      // screen the two cats in the Cat Room were 256 and 288px, with their
      // name pills at y358 and y370 — off the bottom of the screen
      // entirely. The cap is far above the base on an iPad, so nothing
      // there moves.
      const baseSize = animalBoxFor(play, animal.state === 'pet' ? 240 : 200);
      const visualState = callbacks.deriveAnchorState(animal);
      const anchor = anchors.pick(roomKey, animal.species, visualState, i);
      const placed = callbacks.resolveAnchor(anchor, bgTopY, bgW, bgH, baseSize, baseSize * 0.8);

      // resolveAnchor maps the anchor fraction across bgW only; shift it into
      // the play area here so it lines up with the background drawn above.
      let x = placed ? play.x + placed.cx : startX + (i % 4) * colSpacing;
      let y = placed ? placed.cy : floorY + Math.floor(i / 4) * 150;
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

      // Decorations must be placed from what was actually drawn, not from
      // the box we asked for. The two agree far more often now the render
      // scale is gone, but the art is square and this box is 5:4, so the
      // animal is drawn narrower than `size` — using `size` here put the
      // name pill 16px inside the animal's feet and all three status chips
      // across its chest.
      const halfW = sprite.displayWidth / 2;
      const halfH = sprite.displayHeight / 2;

      // Pull the animal — and with it every label below, which is placed
      // off `y` — back inside the band. resolveAnchor now puts the drawn
      // box's feet on the anchor mark, but a third of the hand-authored
      // anchors resolve below the band on every device including an iPad,
      // so the clamp is still the guarantee and the anchor file is not.
      const clampedY = clampAnimalIntoBand(y, halfH, play);
      if (clampedY !== y) {
        y = clampedY;
        sprite.y = y;
      }

      // Same story sideways: an anchor at x 0.925 put a cat's right edge at
      // 824 on an 812px screen. The name pill is drawn centred on `x`, so
      // moving x here moves it too.
      const clampedX = Phaser.Math.Clamp(
        x, play.x + halfW, play.x + play.w - halfW,
      );
      if (clampedX !== x) {
        x = clampedX;
        sprite.x = x;
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
        renderDirtyOverlay(scene, container, animal, x, y, sprite.displayWidth, cleanliness);
      }

      // Name pill badge
      const namePillGfx = scene.add.graphics();
      // White on the species colour failed 4.5:1 for six of the eight
      // species — bunny at 1.50:1 was close to invisible. Pick the ink from
      // the pill's own luminance instead, and drop the 0.85 alpha, which
      // was letting painted room art bleed through and make it worse.
      const pill = pillFor(SPECIES_COLOURS[animal.species]);
      const nameText = scene.add.text(x, y + halfH + 14, animal.name, {
        fontSize: TYPE.caption, fontFamily: FONTS.title, fontStyle: 'bold',
        color: pill.ink, resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5);
      const nw = nameText.width + 20;
      const nh = nameText.height + 8;
      namePillGfx.fillStyle(pill.fill, 1);
      namePillGfx.fillRoundedRect(x - nw / 2, y + halfH + 14 - nh / 2, nw, nh, 10);
      container.add(namePillGfx);
      container.add(nameText);

      // ── Status chip stack (right of sprite) ─────────────
      renderStatusChips(scene, store, container, animal, x, y, halfW, halfH);

      // Bond bar
      if (animal.bondLevel > 0) {
        const barW = 50;
        const barY = y + halfH + 32;
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
          const sibIcon = scene.add.image(x - halfW + 6, y - halfH - 6, sibIconKey)
            .setDisplaySize(18, 18).setOrigin(0.5);
          container.add(sibIcon);
        } else {
          const sibDot = scene.add.circle(x - halfW + 6, y - halfH - 6, 6, 0x9b59b6)
            .setStrokeStyle(1, 0xffffff, 0.8);
          container.add(sibDot);
        }
      }

      sprite.on('pointerdown', () =>
        callbacks.onShowAnimalDetails(animal),
      );
      container.add(sprite);
    });
  }

  // Apprentice decorations — species-specific cameos (cat room gets
  // Amara/Rhubarb, parrot/snake rooms get Kofi, etc).
  renderApprenticeDecorations(scene, container, store, {
    viewMode: 'room',
    roomSpecies: species as ApprenticeRoomSpecies,
    width,
    height,
  });

  callbacks.renderNavBar({ showBack: true });
}

// ── Private helpers ───────────────────────────────────────

function renderPlacedDecorations(
  scene: Phaser.Scene,
  store: GameStateStore,
  container: Phaser.GameObjects.Container,
  species: Species,
  play: PlayArea,
  height: number,
): void {
  const roomId = `room-${species}`;
  const inRoom = getRoomDecorations(store.placedDecorations, roomId);
  if (inRoom.length === 0) return;

  // Decoration coords are fractions of the background art, so they resolve
  // in the same space the animals do — the art's own rect on an iPad, the
  // play band on a phone. A decoration a child put on the floor otherwise
  // ends up behind the nav bar, along with the animal standing on it.
  const space = anchorSpaceFor(play, height);
  const roomBounds = { x: play.x, y: space.top, width: play.w, height: space.h };

  for (const deco of inRoom) {
    const px = roomBounds.x + deco.x * roomBounds.width;
    const py = roomBounds.y + deco.y * roomBounds.height;
    const emojiText = scene.add
      .text(px, py, getDecorationEmoji(deco.code), { fontSize: '32px', fontFamily: FONTS.body })
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
  playRight: number,
  height: number,
  onTap: () => void,
): void {
  // Was (width - 70, 55) at 120x40: inside the HUD strip, overlapping the
  // audio toggle's hit circle by 48x27px, 10px from the screen edge (inside
  // SAFE_MARGIN) and under MIN_TAP. The HUD is drawn after gameContainer, so
  // it took the tap — pressing the right half of Decorate turned the music
  // off. Moved to the bottom of the play area, between HUD and nav bar.
  const w = 140;
  const h = MIN_TAP;
  const cx = playRight - SAFE_MARGIN - w / 2;
  const cy = height - navHeightFor(height) - 8 - h / 2;
  const btnBg = scene.add
    .rectangle(cx, cy, w, h, 0xffffff, 0.96)
    .setStrokeStyle(2, 0xd4783c)
    .setInteractive({ useHandCursor: true });
  const btnText = scene.add
    .text(cx, cy, '🎀 Decorate', {
      fontSize: TYPE.caption,
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
      fontSize: TYPE.caption, fontFamily: FONTS.body, resolution: TEXT_RESOLUTION,
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
  halfW: number,
  halfH: number,
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
    const chipX = x + halfW - 4;
    const chipY = y - halfH - 4 + ci * 28;
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
        fontSize: '16px', fontFamily: FONTS.body, resolution: TEXT_RESOLUTION,
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
