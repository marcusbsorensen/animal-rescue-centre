import Phaser from 'phaser';
import type { Animal, Species } from '@arc/shared-types';
import { SPECIES_COLOURS } from '@arc/game-logic';
import {
  createChromeTitle,
  createAmbientParticles,
} from '../ui/UIButton';
import { createAnimalSprite } from '../ui/sprites';
import { RoomAnchors } from '../lib/RoomAnchors';
import { FONTS, TEXT_RESOLUTION, pluralSpecies, SAFE_MARGIN, TITLE_CY, PAGE_MARGIN } from '../ui/constants';
import { getPlayArea } from './LeftRailView';
import {
  anchorSpaceFor, animalBoxFor, navBarMetrics, sideNavEnabled, ANIMAL_LABEL_HEIGHT,
} from '../ui/layout';
import type { GameStateStore } from '../game-state';
import { renderApprenticeDecorations } from './ApprenticeDecorations';

/**
 * CorridorView — renders the rescue-centre corridor with painted door
 * signs for each unlocked species and arriving-animal speech bubbles.
 *
 * Phase 7 extraction. Largest room view in the game (~330 LOC) with
 * procedural sign placement, optional hand-placed decor overrides, a
 * floor tier of arriving animals with individual speech bubbles, and
 * a "welcome them all" shortcut.
 *
 * State mutations (animal.state = 'sheltered', totalRescued, level
 * progression) stay in the scene — the view calls back.
 */

export interface CorridorCallbacks {
  /** Tap a door sign — switch to that species room. */
  onEnterRoom: (species: Species) => void;
  /** Tap an arriving animal's sprite — open its card. */
  onShowAnimalDetails: (animal: Animal) => void;
  /** Welcome button on an individual speech bubble. */
  onWelcomeOne: (animal: Animal) => void;
  /** "Welcome them all" batch accept. */
  onWelcomeAll: (arriving: Animal[]) => void;
  /** Draw the nav bar over the top. */
  renderNavBar: () => void;
  /** Scene tracks max scroll for drag/scroll handling; corridor is always 0. */
  setMaxScrollY: (maxScrollY: number) => void;
}

export function renderCorridor(
  scene: Phaser.Scene,
  store: GameStateStore,
  container: Phaser.GameObjects.Container,
  callbacks: CorridorCallbacks,
  processing: { isProcessing: () => boolean; setProcessing: (v: boolean) => void },
): void {
  const { width, height } = scene.scale;
  // The side rail is opaque and sits on top of this container, so the
  // corridor is laid out inside the space it leaves rather than across the
  // full width. Background and anchors both use it, so animals keep landing
  // on the marks the art was painted for.
  const play = getPlayArea(scene);

  // ── Background ───────────────────────────────────────────
  // `height - 40` is the tall-viewport habit: the art is drawn nearly
  // full-bleed and allowed to run behind the chrome, which is why the
  // anchor space has to be corrected separately. Under the side-nav
  // layout there is no horizontal chrome to hide behind, so the art is
  // drawn into the play box and the two rects agree.
  //
  // Still a stretch, not a fit — 696x402 is 1.73 against art authored at
  // 1.78, so it is a 3% squash rather than the 19% one the bottom-bar
  // layout imposes. Deciding cover-vs-contain is the next step and wants
  // to be looked at on a device, not calculated.
  const bgH = sideNavEnabled() ? play.h : height - 40;
  const bgCy = sideNavEnabled() ? play.y + play.h / 2 : height / 2;
  if (scene.textures.exists('bg-corridor')) {
    const bg = scene.add.image(play.x + play.w / 2, bgCy, 'bg-corridor');
    bg.setDisplaySize(play.w, bgH);
    container.add(bg);
  } else {
    container.add(
      scene.add
        .rectangle(
          play.x + play.w / 2, height / 2, play.w, height - 40,
          Phaser.Display.Color.HexStringToColor('#f5efe4').color,
        )
        .setOrigin(0.5),
    );
    container.add(
      createAmbientParticles(scene, ['\uD83D\uDC3E', '\u2B50'], {
        count: 8, minAlpha: 0.04, maxAlpha: 0.1,
      }),
    );
  }

  // Subtle brick pattern
  const bgPattern = scene.add.graphics();
  bgPattern.lineStyle(1, 0xd4c8b8, 0.05);
  for (let bx = 0; bx < width; bx += 50) {
    for (let by = 0; by < height; by += 25) {
      const ox = ((by / 25) % 2) * 25;
      bgPattern.strokeRect(bx + ox, by, 48, 23);
    }
  }
  container.add(bgPattern);

  // Title — chrome, not scenery. See CHROME in ui/constants: the painted
  // language belongs to the sign boards, which are objects in the world.
  container.add(
    createChromeTitle(scene, play.x + play.w / 2, TITLE_CY, 'Rescue Centre', {
      icon: 'icon-rescue-centre',
    }),
  );

  // ── Door slots ───────────────────────────────────────────
  //
  // Flat view: 7 same-sized doors across the back wall. Signs radiate
  // out from the middle as more species unlock — L1 (cat + dog) sit
  // side-by-side near centre, outer doors fill in at higher levels.
  // Unlock order: cat=0, dog=1, fox=2, bunny=3, bat=4, parrot=5, snake=6.
  const DOOR_SLOTS: { xFrac: number; yFrac: number; scale: number }[] = [
    { xFrac: 0.40, yFrac: 0.38, scale: 1.00 }, // 0 cat   — left-of-centre
    { xFrac: 0.60, yFrac: 0.38, scale: 1.00 }, // 1 dog   — right-of-centre
    { xFrac: 0.27, yFrac: 0.38, scale: 1.00 }, // 2 fox
    { xFrac: 0.73, yFrac: 0.38, scale: 1.00 }, // 3 bunny
    { xFrac: 0.14, yFrac: 0.38, scale: 1.00 }, // 4 bat   — far left
    { xFrac: 0.86, yFrac: 0.38, scale: 1.00 }, // 5 parrot — far right
    { xFrac: 0.50, yFrac: 0.38, scale: 1.00 }, // 6 snake — dead centre (fills last)
  ];
  // Both the signs and the arriving animals are positioned as fractions of
  // the background art. On a tall viewport this rect is that art's own; on a
  // short one it is the play band, so a 0.9 decor override lands above the
  // nav bar rather than behind it.
  const anchorSpace = anchorSpaceFor(play, height);
  const doorBodyH = anchorSpace.h;
  const doorBodyTop = anchorSpace.top;

  // Hand-tuned sign-decor overrides from the anchor editor (if any).
  // Lets signs be repositioned per background art without a code deploy.
  const corridorDecor = RoomAnchors.getInstance().getDecor('corridor');

  store.unlockedSpecies.forEach((species, i) => {
    const fallbackSlot = DOOR_SLOTS[i] ?? DOOR_SLOTS[DOOR_SLOTS.length - 1];
    const placedAnchors = corridorDecor[`sign-${species}`] ?? [];
    const placed = placedAnchors[0];
    const y = placed ? doorBodyTop + doorBodyH * placed.y : doorBodyTop + doorBodyH * fallbackSlot.yFrac;
    const s = placed ? placed.scale : fallbackSlot.scale;
    // Keep the whole sign inside the play area. The outermost slots sit only
    // ~0.14 of the way in, which is less than half a sign width once the rail
    // has taken its column — on iPad portrait the bat sign clipped under the
    // rail by 2px without this.
    const halfSign = (140 * s) / 2;
    const x = Phaser.Math.Clamp(
      play.x + play.w * (placed ? placed.x : fallbackSlot.xFrac),
      play.x + halfSign,
      play.x + play.w - halfSign,
    );

    const roomAnimals = store.animals.filter((a) => a.species === species && a.state !== 'arriving');
    const count = roomAnimals.length;
    const colour = SPECIES_COLOURS[species];

    // Painted door sign (sign-cat.png, sign-dog.png, …). Fall back to the
    // programmatic plank + icon combo only if the painted asset is missing.
    const signKey = `sign-${species}`;
    const hasPainted = scene.textures.exists(signKey);

    const signW = 140 * s;
    const signDisplay = hasPainted
      ? (() => {
        const tex = scene.textures.get(signKey).getSourceImage() as HTMLImageElement;
        const ratio = tex && tex.height ? tex.width / tex.height : 2.2;
        const w = signW;
        const h = w / ratio;
        return { w, h };
      })()
      : { w: 120 * s, h: 56 * s };

    let signDisplayObj: Phaser.GameObjects.GameObject;

    if (hasPainted) {
      const signImg = scene.add.image(x, y, signKey)
        .setDisplaySize(signDisplay.w, signDisplay.h)
        .setOrigin(0.5);
      container.add(signImg);
      signDisplayObj = signImg;
    } else {
      // Fallback: wooden plank with species icon + name + count
      const signGfx = scene.add.graphics();
      const sw = signDisplay.w, sh = signDisplay.h;
      signGfx.fillStyle(0x000000, 0.22);
      signGfx.fillRoundedRect(x - sw / 2 + 2, y - sh / 2 + 3, sw, sh, 10);
      signGfx.fillStyle(0xd4a574, 1);
      signGfx.fillRoundedRect(x - sw / 2, y - sh / 2, sw, sh, 10);
      signGfx.fillStyle(0xe8c48d, 1);
      signGfx.fillRoundedRect(x - sw / 2 + 4, y - sh / 2 + 4, sw - 8, sh - 8, 7);
      signGfx.fillStyle(colour, 1);
      signGfx.fillRoundedRect(x - sw / 2 + 4, y - sh / 2 + 4, 5, sh - 8, { tl: 7, tr: 0, bl: 7, br: 0 });
      signGfx.lineStyle(2, 0x8b5a2b, 0.85);
      signGfx.strokeRoundedRect(x - sw / 2, y - sh / 2, sw, sh, 10);
      container.add(signGfx);

      const iconX = x - sw / 2 + 22 * s;
      const iconPx = 34 * s;
      const speciesIconKey = `icon-${species}`;
      if (scene.textures.exists(speciesIconKey)) {
        container.add(
          scene.add.image(iconX, y, speciesIconKey)
            .setDisplaySize(iconPx, iconPx).setOrigin(0.5),
        );
      } else {
        const fg = scene.add.graphics();
        fg.fillStyle(colour, 1);
        fg.fillCircle(iconX, y, iconPx / 2);
        container.add(fg);
      }

      const textX = iconX + iconPx / 2 + 6;
      const nameLabel = species.charAt(0).toUpperCase() + species.slice(1);
      container.add(
        scene.add.text(textX, y - 9, nameLabel, {
          fontSize: `${Math.round(13 * s)}px`, fontFamily: FONTS.title, fontStyle: 'bold',
          color: '#4a2d14', resolution: TEXT_RESOLUTION,
        }).setOrigin(0, 0.5),
      );
      container.add(
        scene.add.text(textX, y + 9, `${count} ${pluralSpecies(species, count)}`, {
          fontSize: `${Math.round(11 * s)}px`, fontFamily: FONTS.body, fontStyle: 'bold',
          color: '#6b4020', resolution: TEXT_RESOLUTION,
        }).setOrigin(0, 0.5),
      );
      signDisplayObj = signGfx;
    }

    // Chalkboard hung below each painted sign with the current count in
    // chalk-writing. Feels like something a child scribbled at the
    // rescue centre rather than an app-style notification badge. Only on
    // painted signs — the programmatic fallback renders the count inline.
    if (hasPainted && count > 0) {
      const boardW = Math.max(44, 58 * s);
      const boardH = Math.max(30, 38 * s);
      const boardX = x;
      const boardY = y + signDisplay.h / 2 + boardH / 2 + 6 * s;
      // Stable hand-hung tilt, seeded by species.
      const tiltSeed = species.charCodeAt(0) % 5;
      const tilt = Phaser.Math.DegToRad(-2 + tiltSeed);

      const innerPad = Math.max(3, 4 * s);
      const boardGfx = scene.add.graphics();
      boardGfx.x = boardX;
      boardGfx.y = boardY;
      boardGfx.setRotation(tilt);
      boardGfx.fillStyle(0x000000, 0.22);
      boardGfx.fillRoundedRect(-boardW / 2 + 2, -boardH / 2 + 3, boardW, boardH, 4);
      boardGfx.fillStyle(0x6b4423, 1);
      boardGfx.fillRoundedRect(-boardW / 2, -boardH / 2, boardW, boardH, 4);
      boardGfx.fillStyle(0x1e3a2a, 1);
      boardGfx.fillRoundedRect(
        -boardW / 2 + innerPad, -boardH / 2 + innerPad,
        boardW - innerPad * 2, boardH - innerPad * 2, 2,
      );
      boardGfx.fillStyle(0xffffff, 0.05);
      boardGfx.fillEllipse(0, -boardH * 0.18, boardW * 0.6, boardH * 0.25);
      container.add(boardGfx);

      // Hanging strings
      const stringGfx = scene.add.graphics();
      stringGfx.lineStyle(1, 0x3a2a1a, 0.55);
      stringGfx.lineBetween(
        boardX - boardW * 0.25, y + signDisplay.h / 2 + 1,
        boardX - boardW * 0.25, boardY - boardH / 2,
      );
      stringGfx.lineBetween(
        boardX + boardW * 0.25, y + signDisplay.h / 2 + 1,
        boardX + boardW * 0.25, boardY - boardH / 2,
      );
      container.add(stringGfx);

      const chalkText = scene.add.text(boardX, boardY + 2 * s, String(count), {
        fontSize: `${Math.round(boardH * 0.85)}px`,
        fontFamily: FONTS.chalk,
        fontStyle: 'bold',
        color: '#fffaf0',
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5).setRotation(tilt).setAlpha(0.95);
      container.add(chalkText);
    }

    // Hit area over the sign
    const hitArea = scene.add.rectangle(x, y, signDisplay.w, signDisplay.h, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    hitArea.on('pointerover', () => {
      if ('setAlpha' in signDisplayObj) (signDisplayObj as Phaser.GameObjects.Image).setAlpha(0.85);
    });
    hitArea.on('pointerout', () => {
      if ('setAlpha' in signDisplayObj) (signDisplayObj as Phaser.GameObjects.Image).setAlpha(1);
    });
    hitArea.on('pointerdown', () => callbacks.onEnterRoom(species));
    container.add(hitArea);
  });

  // ── Arriving animals — stand on corridor floor with speech bubbles ──
  const arriving = store.animals.filter((a) => a.state === 'arriving');
  // The floor is the top of the nav dock — the animals stand on it, so it
  // is the lowest line their feet may reach, and the FAB is lifted proud
  // of the bar so it, not the bar, sets that line.
  //
  // This used to be `Math.max(height * 0.68, height - 125)`, whose second
  // term was a hand-copy of the FAB top and read as intended on an iPad.
  // On a 325px screen 68% won instead — 221, against a FAB reaching up to
  // 201 and a bar starting at 229 — and an arriving dog measured y158..306:
  // the child saw it from the chest up. `Math.max` was also the wrong
  // direction for its own comment ("well above the FAB/nav dock").
  // Under the side-nav layout there is no FAB and no bar to stand clear
  // of, so the floor is the bottom of the play box less the room a name
  // pill and bond bar need under an animal.
  const floorY = sideNavEnabled()
    ? play.y + play.h - ANIMAL_LABEL_HEIGHT
    : navBarMetrics(height).fabTop;

  if (arriving.length > 0) {
    // PROTOTYPE: the arrival pill banner, the speech-bubble Welcome
    // buttons, and the "Welcome them all" CTA have all moved into
    // LeftRailView. The corridor canvas now ONLY shows the painted
    // sprites + their floor shadows so the scenery never gets covered
    // by interactive UI. The rail (rendered separately by GameScene)
    // is the single place to act on arrivals.

    const floorGfx = scene.add.graphics();
    floorGfx.fillStyle(0x000000, 0.08);
    floorGfx.fillRect(PAGE_MARGIN, floorY + 1, width - PAGE_MARGIN * 2, 2);
    container.add(floorGfx);

    const n = arriving.length;
    const slotW = Math.min(280, (play.w - 40) / n);
    const startX = play.x + play.w / 2 - ((n - 1) * slotW) / 2;

    // If the anchor editor has placed corridor.<species>.arriving anchors,
    // use them. Otherwise fall back to procedural even-spacing along the
    // floor. Per-species index tracking ensures that when multiple of the
    // same species arrive together, subsequent animals cycle through any
    // additional anchors defined for that species (RoomAnchors.pick
    // handles the modulo cycling).
    const corridorAnchors = RoomAnchors.getInstance();
    const bgTopY = anchorSpace.top;
    const bgW = play.w;
    const bgH = anchorSpace.h;
    const perSpeciesCounter: Record<string, number> = {};

    arriving.forEach((animal, i) => {
      const speciesIdx = perSpeciesCounter[animal.species] ?? 0;
      perSpeciesCounter[animal.species] = speciesIdx + 1;

      const anchor = corridorAnchors.pick('corridor', animal.species, 'arriving', speciesIdx);
      // Default procedural position (on the floor, evenly spaced)
      const proceduralAX = startX + i * slotW;
      // Sized against the band, not a constant. `false` — an arrival
      // carries no name pill or bond bar on the canvas; those live in the
      // rail. Over half the band, not all of it: the corridor also carries
      // the door signs a child taps to enter a room, and an arrival sized
      // to the whole band stands in front of every one of them.
      const spriteH = animalBoxFor({ ...play, h: play.h * 0.55 }, 148, false);
      const spriteW = spriteH * (90 / 74);
      const proceduralCY = floorY - spriteH / 2 + 2;

      let ax = proceduralAX;
      let spriteCy = proceduralCY;
      let useAnchorScale = false;
      let anchorW = spriteW;
      let anchorH = spriteH;
      let anchorFlipX = false;

      if (anchor) {
        // Anchor is feet-position in fractional bg coords; translate to
        // sprite-centre for drawing. Matches resolveAnchor in GameScene
        // but inlined here to avoid pulling the helper through a callback.
        const s = anchor.scale ?? 1;
        anchorW = spriteW * s;
        anchorH = spriteH * s;
        const feetX = play.x + anchor.x * bgW;
        const feetY = bgTopY + anchor.y * bgH;
        ax = feetX;
        spriteCy = feetY - anchorH / 2;
        useAnchorScale = true;
        anchorFlipX = anchor.facing === 'left';
      }

      const drawW = useAnchorScale ? anchorW : spriteW;
      const drawH = useAnchorScale ? anchorH : spriteH;

      const sprite = createAnimalSprite(
        scene, ax, spriteCy, animal,
        { width: drawW, height: drawH, interactive: true },
      );
      if (anchorFlipX && 'setFlipX' in sprite) {
        (sprite as Phaser.GameObjects.Image).setFlipX(true);
      }

      // Floor drop shadow, under the feet the child can see. Built after
      // the sprite so it can be measured off it, and added to the
      // container first so it still draws underneath — the box is 5:4 and
      // the art is square, so `drawW`/`drawH` would put a shadow four
      // fifths as wide as the animal 33px up inside its body.
      const shadowFeetY = spriteCy + sprite.displayHeight / 2;
      const shadow = scene.add.ellipse(
        ax, shadowFeetY + 4,
        sprite.displayWidth * 0.65, sprite.displayHeight * 0.16,
        0x000000, 0.28,
      );
      container.add(shadow);

      // Keep the tappable sprite clear of the bottom safe margin. Anchors
      // are authored in the editor against a roomier canvas; on a landscape
      // phone the same fractional y puts a scaled-up arrival's lower edge
      // inside the bottom inset, which on iOS is the home-gesture strip —
      // the OS takes the touch and tapping the animal does nothing.
      //
      // Measured from the sprite rather than from drawH: createAnimalSprite
      // renders a few pixels taller than the size it is handed, so clamping
      // against the requested height leaves the real lower edge inside the
      // margin. Only moves a sprite that would otherwise sit in it.
      // The band bottom, not the screen's — the nav bar is opaque and drawn
      // after this container, so a sprite reaching past the band is covered
      // as surely as one reaching into the OS home strip below the screen.
      const bandBottom = Math.min(play.y + play.h, height - SAFE_MARGIN);
      const overflow = sprite.getBounds().bottom - bandBottom;
      if (overflow > 0) {
        sprite.y -= overflow;
        shadow.y -= overflow;
        spriteCy -= overflow;
      }

      sprite.on('pointerdown', () =>
        callbacks.onShowAnimalDetails(animal),
      );
      container.add(sprite);

      // Gentle idle bob
      scene.tweens.add({
        targets: sprite, y: sprite.y - 3,
        duration: 1400 + i * 120, yoyo: true, repeat: -1,
        ease: 'Sine.easeInOut', delay: i * 200,
      });

      // PROTOTYPE: the per-sprite Welcome speech-bubble used to live
      // here. Moved into LeftRailView so it can't overlap painted
      // scenery or other sprites. The sprite is still interactive via
      // onShowAnimalDetails — players can tap it to see who the
      // arrival is, but the action button lives in the rail.
    });

    // PROTOTYPE: "Welcome them all" button moved to the rail too.
  }

  // Apprentice decorations — recruited apprentices make cameo
  // appearances around the corridor. Safe no-op when none are recruited.
  renderApprenticeDecorations(scene, container, store, {
    viewMode: 'corridor',
    width,
    height,
  });

  // Corridor never scrolls — doors + floor always fit
  callbacks.setMaxScrollY(0);

  callbacks.renderNavBar();
}
