import Phaser from 'phaser';
import type {
  Animal, GardenZone, Season, TimeOfDay, Weather,
} from '@arc/shared-types';
import {
  getAvailableUpgrades,
  getUnlockedUpgrades,
  partitionByZone,
  applyShakeOff,
  dry,
  getDueGardenReturns,
  markGardenReturnSeen,
  markAllDueGardenReturnsSeen,
} from '@arc/game-logic';
import { playShakeOff } from '../ui/ShakeOffAnimation';
import {
  createChromeTitle, createChromeCircleButton, createTextButton,
} from '../ui/UIButton';
import { showToast } from '../ui/ErrorOverlay';
import { createAnimalSprite } from '../ui/sprites';
import { COLOURS, FONTS, TEXT_RESOLUTION, EDGE_CONTROL_INSET, TITLE_CY, TYPE } from '../ui/constants';
import { RoomAnchors, type Anchor } from '../lib/RoomAnchors';
import { createWeatherParticles, type WeatherParticleHandle } from '../ui/WeatherParticles';
import type { GameStateStore } from '../game-state';
import { renderApprenticeDecorations } from './ApprenticeDecorations';
import { getPlayArea } from './LeftRailView';
import { anchorSpaceFor, animalBoxFor } from '../ui/layout';

/**
 * GardenView — renders the "bonded pets living their best life" area
 * as a TWO-ZONE CAROUSEL.
 *
 * The garden has two zones:
 *   - `lawn`  — the sunny social default, where most pets end up
 *   - `quiet` — a hedged nook for solitary species OR for pets whose
 *               enemy/intolerant is on the lawn (so each can chaperone
 *               their own species' visitors separately)
 *
 * The player swipes between zones with left/right arrows. A dot indicator
 * shows which zone is currently on. Each zone has its own background
 * picked from the 16 chibi-painted garden scenes (2 zones × 4 tod × 2
 * seasons) — falling back to a known-good scene if the precise combo
 * hasn't been generated yet.
 *
 * Also rendered in the garden now:
 *   - Outsiders (animals with `outsideAt` set) — visitors currently let
 *     out from the shelter, routed to whichever zone `assignGardenZone`
 *     picked when they came out. They display with a "visitor" tint
 *     rather than the collar ring that marks permanent pets.
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
  deriveAnchorState: (animal: Animal) => string;
  resolveAnchor: (
    anchor: Anchor | null,
    bgTopY: number, bgW: number, bgH: number,
    baseW: number, baseH: number,
  ) => ResolvedAnchor | null;
  showAnimalDetails: (animal: Animal) => void;
  onUpgradeClaimed: (code: string) => void;
  renderNavBar: (opts: { showBack: boolean }) => void;
}

// ── Zone carousel state ──────────────────────────────────────

/**
 * Which zone the garden view last showed. Survives re-renders within
 * the same session so the player's swipe choice isn't undone every
 * time an animal-details popup re-renders the view.
 */
let rememberedZone: GardenZone = 'lawn';

/**
 * Module-scoped handle to the current weather particle emitters.
 * We destroy + recreate on every renderZone so there's never a stale
 * emitter floating around when the view re-renders.
 */
let currentParticles: WeatherParticleHandle | null = null;

// ── BG picker ────────────────────────────────────────────────

/**
 * Pick the right garden background for (zone, season, time-of-day).
 * Falls back gracefully to what's available.
 *
 * Asset naming: `garden-{zone}-{season}-{tod}.png` where season
 * is the short form (summer, winter) rather than the calendar's
 * `summer_warmth` / `winter_cosy` — we strip the suffix here.
 *
 * Only summer + winter are generated at launch (per Marcus's "let's
 * see how Manus does summer+winter first" call). Spring + autumn fall
 * through to the nearest seasonal match for now.
 */
function pickBackgroundKey(
  scene: Phaser.Scene,
  zone: GardenZone,
  season: Season | undefined,
  tod: TimeOfDay | undefined,
): string | null {
  // Default to afternoon if time-of-day hasn't been wired in yet.
  const todSlug: TimeOfDay = tod ?? 'afternoon';

  // Map long season key to short slug; default to the closest available
  // season — summer_warmth / spring_bloom → summer, winter_cosy /
  // autumn_hush → winter.
  let seasonSlug: 'summer' | 'winter' = 'summer';
  if (season === 'winter_cosy' || season === 'autumn_hush') {
    seasonSlug = 'winter';
  }

  const key = `garden-${zone}-${seasonSlug}-${todSlug}`;
  if (scene.textures.exists(key)) return key;

  // Fall back to afternoon of the same season, then legacy single BG.
  const afternoonKey = `garden-${zone}-${seasonSlug}-afternoon`;
  if (scene.textures.exists(afternoonKey)) return afternoonKey;

  if (scene.textures.exists('bg-garden')) return 'bg-garden';
  return null;
}

// ── Render ───────────────────────────────────────────────────

export function renderGarden(
  scene: Phaser.Scene,
  store: GameStateStore,
  container: Phaser.GameObjects.Container,
  callbacks: GardenCallbacks,
): void {
  renderZone(scene, store, container, callbacks, rememberedZone);
}

/**
 * Internal renderer — draws one zone and the carousel controls.
 * Exported for tests / deep linking.
 */
function renderZone(
  scene: Phaser.Scene,
  store: GameStateStore,
  container: Phaser.GameObjects.Container,
  callbacks: GardenCallbacks,
  zone: GardenZone,
): void {
  rememberedZone = zone;
  container.removeAll(true);
  // Kill any leftover weather particles from the previous render — they're
  // top-level scene objects (not in our container), so they don't get
  // wiped by removeAll.
  if (currentParticles) {
    currentParticles.destroy();
    currentParticles = null;
  }

  const { width, height } = scene.scale;
  // The side rail is opaque and sits on top of this container; lay the garden
  // out inside the space it leaves, background and anchors together.
  const play = getPlayArea(scene);

  // ── Garden occupants for this zone ───────────────────────
  // Pets (permanent residents) + outsiders (animals let out today).
  const partition = partitionByZone(store.animals);
  const zoneAnimals = zone === 'lawn' ? partition.lawn : partition.quiet;
  const pets       = zoneAnimals.filter((a) => a.state === 'pet');
  const outsiders  = zoneAnimals.filter((a) => a.state !== 'pet');

  // ── Background ───────────────────────────────────────────
  const bgKey = pickBackgroundKey(
    scene, zone,
    store.calendar?.currentSeason,
    store.timeProgress?.currentPhase,
  );
  if (bgKey) {
    const bg = scene.add.image(play.x + play.w / 2, height / 2, bgKey);
    bg.setDisplaySize(play.w, height - 40);
    container.add(bg);
  } else {
    // Fallback fill — lawn is warmer green, quiet is cooler
    const fill = zone === 'lawn' ? 0xe8f5e9 : 0xd4e3d7;
    container.add(
      scene.add.rectangle(play.x + play.w / 2, height / 2, play.w, height - 40, fill),
    );
  }

  // ── Weather particles ─────────────────────────────────────
  // Driven by store.gardenWeather.current. Particles render above the BG
  // but below the animals + HUD. Destroyed + recreated on every render
  // so they stay in sync when zone/weather changes.
  const wx = store.gardenWeather?.current;
  if (wx) {
    currentParticles = createWeatherParticles(scene, wx, {
      x: 0, y: 20, width, height: height - 40,
    });
  }

  // ── Zone label + carousel controls ───────────────────────
  //
  // Chrome, not scenery. The gold pill this replaced carried the painted
  // world's bevel and warmth on an element that floats above the world —
  // and the kitchen, which has a pill like it beside a white glass panel
  // and a flat green button, is why "three visual languages" is the first
  // finding in the audit. A view title is not an object in the world, so
  // it gets the one non-diegetic surface.
  //
  // Centred on the play area rather than the screen. The HUD leaves its
  // middle gap on the play origin, so a title centred on `width` drifts by
  // half the reserved column and lands under the shelter pill — corridor
  // and room already moved; the garden was the odd one out. `TITLE_CY`
  // matches theirs, clear of the HUD's second row at y 78..106.
  const zoneLabel = zone === 'lawn' ? 'Garden — Lawn' : 'Garden — Quiet nook';
  container.add(
    createChromeTitle(scene, play.x + play.w / 2, TITLE_CY, zoneLabel, {
      icon: 'icon-garden',
    }),
  );

  // Zone arrows → the other zone.
  //
  // Was a 48px text glyph with `.setInteractive()`, which gives a hit area
  // the size of the *glyph*, not of the control — and at x = play.x + 30
  // the left one was partly behind the arrivals rail while the right one
  // sat flush to the screen edge, where the OS takes the touch before the
  // game sees it. Both now sit SAFE_MARGIN clear of the play column, in
  // chrome circles whose hit area is floored at MIN_TAP independently of
  // what is drawn.
  const otherZone: GardenZone = zone === 'lawn' ? 'quiet' : 'lawn';
  const arrowY = play.y + play.h / 2;
  const swapZone = () => renderZone(scene, store, container, callbacks, otherZone);
  container.add(
    createChromeCircleButton(
      scene, play.x + EDGE_CONTROL_INSET, arrowY, '◀', swapZone,
    ),
  );
  container.add(
    createChromeCircleButton(
      scene, play.x + play.w - EDGE_CONTROL_INSET, arrowY, '▶', swapZone,
    ),
  );

  // Dot indicator — two dots, filled one = current zone
  // Above the upgrades/badges footer, which stacks up from the band
  // bottom at -76, -44 and -12.
  const dotY = play.y + play.h - 100;
  const dotSpacing = 18;
  const dots: [GardenZone, number][] = [['lawn', -1], ['quiet', 1]];
  for (const [dz, offset] of dots) {
    const filled = dz === zone;
    const dot = scene.add.circle(
      play.x + play.w / 2 + offset * dotSpacing, dotY,
      6,
      filled ? 0xffffff : 0xaaaaaa,
    ).setStrokeStyle(1, 0x333333);
    container.add(dot);
  }

  // ── Empty-zone messaging ─────────────────────────────────
  //
  // This was two lines of mid-grey set straight onto painted grass,
  // flowers and dappled light — close to illegible, and the only place in
  // the game where words carry no plate under them. It is also the one
  // finding a child actually loses information to: these two lines are how
  // she learns that bonding is what turns an animal into a pet.
  //
  // The rule the sign screens follow — nothing on screen that could not be
  // a sketch of something real — has a counterpart here: no words without
  // something to be written on. A heading with a caption on a chrome plate
  // is the same shape as a view title, so it is the same call.
  //
  // Centred on the play column, not the screen — the screen centre is
  // under the rail on the x. On the y it centres on the *content* space
  // rather than the band: the band's bottom 100px belongs to the dot
  // indicator and the upgrades footer, and the dots are added before this
  // and so draw on top. In the audit capture two of them are sitting in
  // the middle of "they become your pet forever", which was survivable
  // while the words were unplated and would not be once they are.
  if (zoneAnimals.length === 0) {
    const isFirstEver = pets.length === 0 && outsiders.length === 0 && zone === 'lawn';
    container.add(
      createChromeTitle(
        scene, play.x + play.w / 2, (play.y + dotY - 12) / 2,
        isFirstEver ? 'No pets yet!' : `Nobody in the ${zone} right now.`,
        {
          fontSize: '22px',
          subtitleSize: '16px',
          subtitle: isFirstEver
            ? 'Keep caring for your animals — when their bond\nreaches 100%, they become your pet forever!'
            : undefined,
        },
      ),
    );
  } else {
    const petsHere = pets.length;
    const visitorsHere = outsiders.length;
    const countLine = petsHere > 0 && visitorsHere > 0
      ? `${petsHere} pet${petsHere > 1 ? 's' : ''} and ${visitorsHere} visitor${visitorsHere > 1 ? 's' : ''}`
      : petsHere > 0
        ? `${petsHere} pet${petsHere > 1 ? 's' : ''} living their best life`
        : `${visitorsHere} visitor${visitorsHere > 1 ? 's' : ''} outside`;
    // Same origin as the title above it. The y is left where it was and is
    // still wrong: 95 is inside the HUD's second row (phase and weather
    // pills, y 78..106), which is drawn after this container and lands on
    // top. Moving it wants the same call as the other fifteen title
    // conversions — see the handover — rather than a local guess here.
    container.add(
      scene.add.text(play.x + play.w / 2, 95, countLine, {
        fontSize: '16px', fontFamily: FONTS.ui, color: COLOURS.textLight,
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5),
    );
  }

  // ── Scatter animals in the zone ──────────────────────────
  const anchors = RoomAnchors.getInstance();
  // The art's own rect on an iPad; the play band on a phone, so an animal
  // anchored to the grass is not drawn behind the nav bar.
  const gardenSpace = anchorSpaceFor(play, height);
  const bgTopY = gardenSpace.top, bgW = play.w, bgH = gardenSpace.h;
  // The drawn size, capped against the band — 200 is what this used to
  // come out at from a 100 that read like the answer.
  const gardenBox = animalBoxFor(play, 200);

  // Render pets first, then outsiders (so visitors sit "in front" visually).
  const ordered = [...pets, ...outsiders];
  ordered.forEach((animal, i) => {
    const grassTop = play.y + play.h * 0.6;
    const gardenLeft = play.x + play.w * 0.15;
    const gardenRight = play.x + play.w * 0.85;
    const cols = Math.min(Math.max(ordered.length, 1), 4);
    const spacing = (gardenRight - gardenLeft) / (cols + 1);

    const visualState = callbacks.deriveAnchorState(animal);
    // Zone-specific anchors could be added later; for now reuse the
    // existing 'garden' key which spreads across both zones.
    const anchor = anchors.pick('garden', animal.species, visualState, i);
    const placed = callbacks.resolveAnchor(anchor, bgTopY, bgW, bgH, gardenBox, gardenBox * 0.8);

    const cx = placed
      // resolveAnchor maps across bgW only; shift into the play area so the
      // anchor lines up with the background drawn above.
      ? play.x + placed.cx
      : gardenLeft + spacing * ((i % cols) + 1) + (Math.random() - 0.5) * 30;
    const cy = placed
      ? placed.cy
      : grassTop + Math.floor(i / cols) * 80 + (Math.random() * 20);
    // `gardenBox`, not a constant: an animal with no anchor for its
    // species and state falls through here, and a hardcoded 200 put it
    // outside the band on a landscape phone while the animal standing
    // next to it — the one that did have an anchor — was capped to 95.
    const spriteW = placed ? placed.w : gardenBox;
    const spriteH = placed ? placed.h : gardenBox * 0.8;

    // Collar ring only for pets (permanent residents). Outsiders get
    // a softer ring in a neutral colour to show they're visitors, not
    // residents.
    const isPet = animal.state === 'pet';
    const ringHex = isPet
      ? (animal.collarColour ?? '#ff6b9d')
      : '#cccccc';
    const ringColour = Phaser.Display.Color.HexStringToColor(ringHex).color;

    const sprite = createAnimalSprite(scene, cx, cy, animal, {
      width: spriteW, height: spriteH, interactive: true,
    });
    if (placed?.flipX && 'setFlipX' in sprite) {
      (sprite as Phaser.GameObjects.Image).setFlipX(true);
    }
    if (sprite instanceof Phaser.GameObjects.Rectangle) {
      sprite.setStrokeStyle(3, ringColour);
    }

    // Collar dots / visitor pip
    if (isPet) {
      container.add(scene.add.circle(cx, cy + 42, 5, ringColour));
      container.add(
        scene.add.circle(cx, cy - 44, 6, ringColour).setStrokeStyle(1, 0xffffff, 0.8),
      );
    } else {
      // Tiny "visitor" pip above the animal
      const pip = scene.add.text(cx, cy - 48, 'visiting', {
        fontSize: TYPE.caption, fontFamily: FONTS.body, color: '#ffffff',
        backgroundColor: '#555555', padding: { left: 4, right: 4, top: 1, bottom: 1 },
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5);
      container.add(pip);
    }

    // Name
    container.add(
      scene.add.text(cx, cy + 30, animal.name, {
        fontSize: TYPE.caption, fontFamily: FONTS.body, color: COLOURS.text,
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5),
    );

    // Happiness indicator — only for pets (outsiders are transient)
    if (isPet) {
      const happyColour = animal.happiness > 70
        ? 0x2ecc71
        : animal.happiness > 40 ? 0xf1c40f : 0xe74c3c;
      container.add(
        scene.add.circle(cx + 30, cy - 20, 6, happyColour).setStrokeStyle(1, 0xffffff, 0.8),
      );
    }

    // Sick indicator
    const sickIllness = store.sickAnimals.get(animal.id);
    if (sickIllness) {
      const sickLabel = scene.add.text(cx, cy + 50, 'Sick!', {
        fontSize: TYPE.caption, fontFamily: FONTS.body, color: '#c0392b',
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

    // Wet dogs (rain-lover that was brought in from the rain) shake off
    // water when tapped, splashing nearby animals. Tapping a wet dog
    // DOES NOT open the details popup — the shake IS the interaction.
    // Kid-comedy primary, popup secondary (available via long-press if
    // we add that later).
    if (animal.wet) {
      sprite.on('pointerdown', () => {
        playShakeOff(scene, sprite as Phaser.GameObjects.Image, {
          onPeak: () => {
            // Resolve the shaker and its neighbours against the store
            // before applying anything. `animal` and `zoneAnimals` were
            // captured when this zone was drawn, and GameScene's needs
            // tick replaces every Animal object every 2 seconds — so
            // `applyShakeOff` on the captured copies would produce
            // objects carrying stale hunger/tiredness/health, and the
            // writeback below would put them over the live entries,
            // undoing every tick since the render.
            const liveShaker = store.animals.find((a) => a.id === animal.id);
            if (!liveShaker) return;
            const nearby = zoneAnimals
              .filter((a) => a.id !== animal.id)
              .map((a) => store.animals.find((s) => s.id === a.id))
              .filter((a): a is NonNullable<typeof a> => a !== undefined);
            const result = applyShakeOff(liveShaker, nearby);
            // Apply the splash happiness deltas to the store
            for (const splashed of result.splashed) {
              const idx = store.animals.findIndex((a) => a.id === splashed.id);
              if (idx >= 0) store.animals[idx] = splashed;
            }
            // The shaker stays wet for now — one shake doesn't fully dry.
            // After a second delay, dry them and re-render (we can replace
            // this with wear-off-timer logic in a follow-up).
            scene.time.delayedCall(1400, () => {
              const shakerIdx = store.animals.findIndex((a) => a.id === animal.id);
              if (shakerIdx >= 0) store.animals[shakerIdx] = dry(store.animals[shakerIdx]);
              renderZone(scene, store, container, callbacks, rememberedZone);
            });
          },
        });
      });
    } else {
      sprite.on('pointerdown', () =>
        callbacks.showAnimalDetails(animal),
      );
    }
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

  // ── Wild returners (rewilded animals dropping by the garden) ────
  // Only rendered on the lawn zone — the quiet nook is for resident
  // pets that need calm. Renders as additional sprites with a sparkle
  // marker; tapping shows a small toast and marks the visit seen.
  if (zone === 'lawn') {
    const dueReturns = getDueGardenReturns(store, Date.now());
    dueReturns.forEach((ret, i) => {
      const cx = play.x + play.w * 0.2 + (i % 3) * (play.w * 0.22);
      const cy = play.y + play.h * 0.68 + Math.floor(i / 3) * 70;

      // Build a minimal Animal-like shape so createAnimalSprite can
      // pick the right texture. Uses the "playing" state since these
      // animals are happy to be back.
      const fakeAnimal = {
        id: `garden-return-${ret.id}`,
        species: ret.species,
        variant: ret.variant,
        name: ret.animalName,
        state: 'pet',
        happiness: 100,
      } as unknown as Animal;

      const sprite = createAnimalSprite(scene, cx, cy, fakeAnimal, {
        width: 180, height: 144, interactive: true,
        stateOverride: 'playing',
      });

      // Sparkle marker above — "wild visitor"
      const sparkle = scene.add.text(cx, cy - 46, '\u2728', {
        fontSize: '20px', fontFamily: FONTS.body, color: '#ffd86b',
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5);
      scene.tweens.add({
        targets: sparkle, alpha: 0.5, duration: 900,
        yoyo: true, repeat: -1,
      });

      container.add(sprite);
      container.add(sparkle);
      container.add(
        scene.add.text(cx, cy + 30, ret.animalName, {
          fontSize: TYPE.caption, fontFamily: FONTS.body, color: COLOURS.text,
          resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5),
      );

      sprite.on('pointerdown', () => {
        showToast(scene, `\uD83C\uDF32 ${ret.animalName} came back to visit!`);
        markGardenReturnSeen(store, ret.id);
      });
    });
  }

  // ── Upgrades + badges footer (pets only — visitors don't count) ──
  //
  // Stacked up from the bottom of the play band rather than down from the
  // screen edge. `height - 85` and `height - 65` sat inside the nav bar on
  // every viewport, not just a short one — which meant the "New upgrade
  // available" button, the one control here a child is meant to press, was
  // drawn under an opaque bar that is added after this container and takes
  // the tap.
  const footerBottom = play.y + play.h;
  const allPets = store.animals.filter((a) => a.state === 'pet');
  const unlocked = getUnlockedUpgrades(store.houseUpgrades);
  if (unlocked.length > 0) {
    const upgradeNames = unlocked.map((u) => u.name).join(', ');
    container.add(
      scene.add.text(play.x + play.w / 2, footerBottom - 76, `Upgrades: ${upgradeNames}`, {
        fontSize: TYPE.caption, fontFamily: FONTS.body, color: COLOURS.textLight,
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5),
    );
  }

  const available = getAvailableUpgrades(allPets.length, store.houseUpgrades);
  if (available.length > 0) {
    container.add(
      createTextButton(scene, play.x + play.w / 2, footerBottom - 44,
        `New upgrade available: ${available[0].name}!`, () => {
          callbacks.onUpgradeClaimed(available[0].code);
        }),
    );
  }

  if (store.earnedBadges.length > 0) {
    container.add(
      scene.add.text(play.x + play.w / 2, footerBottom - 12,
        `${store.earnedBadges.length} badge${store.earnedBadges.length > 1 ? 's' : ''} earned`, {
          fontSize: TYPE.caption, fontFamily: FONTS.body, color: COLOURS.primary,
          resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5),
    );
  }

  // Apprentice decorations — Rhubarb skateboarding in the lawn area,
  // etc. Only recruited apprentices render.
  renderApprenticeDecorations(scene, container, store, {
    viewMode: 'garden',
    width,
    height,
  });

  callbacks.renderNavBar({ showBack: true });
}

// Re-export the internal renderer for tests / potential external use.
export { renderZone as renderGardenZone };
