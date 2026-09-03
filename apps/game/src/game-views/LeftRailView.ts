/**
 * LeftRailView — the "pet management" dock anchored to the left of the
 * corridor canvas.
 *
 * On an iPad it stands open. On anything narrower than
 * RAIL_COLLAPSE_BREAKPOINT it collapses to a 56px pull-tab carrying the
 * arrivals count, and slides in over the scene when the tab is tapped —
 * 280px is 24% of a landscape phone, and a badge says the one urgent
 * thing the rail holds.
 *
 * Lives outside the corridor canvas itself so painted scenery and
 * animated sprites never get covered by floating buttons. Single home
 * for everything about the pets:
 *
 *   - "in care" / "waiting" / "needs care" counts at the top
 *   - Time-of-day + weather pill
 *   - Arrivals list (one card per arriving animal with a Welcome button)
 *   - "Welcome them all" footer button when >1 arriving
 *
 * Future expansion: per-pet status cards (energy / hunger / current task),
 * recent events feed.
 *
 * Render contract: pure function of (store + callbacks). No internal
 * state. Re-rendered whenever the GameScene's renderView() fires. The
 * caller (GameScene) owns the railContainer + clears it on each call.
 */

import Phaser from 'phaser';
import type { GameStateStore } from '../game-state/GameStateStore';
import type { Animal, Species } from '@arc/shared-types';
import { SPECIES_COLOURS, getUrgentNeed } from '@arc/game-logic';
import { createChromeButton } from '../ui/UIButton';
import { COLOURS, FONTS, TEXT_RESOLUTION, SAFE_MARGIN, MIN_TAP, MIN_TAP_GAP, TYPE } from '../ui/constants';
import { railBoundsFor, playAreaFor, RAIL_TAB_WIDTH, type RailBounds, type PlayArea } from '../ui/layout';

export { RAIL_WIDTH, RAIL_TAB_WIDTH, RAIL_COLLAPSE_BREAKPOINT, railIsCollapsible } from '../ui/layout';

export interface LeftRailCallbacks {
  /** Welcome a single arriving animal. */
  onWelcomeOne: (animal: Animal) => void;
  /** Welcome every arriving animal at once. */
  onWelcomeAll: (arriving: Animal[]) => void;
  /** Tap a needs-care badge — jump to corridor (or focus the relevant pet). */
  onCareAlertTap?: () => void;
  /** Tap an arriving animal's card body — show its details popup. */
  onShowAnimalDetails?: (animal: Animal) => void;
  /**
   * Open or close the collapsed rail. Only ever called in tab/overlay
   * mode; a rail that stands open has nothing to toggle.
   */
  onToggleRail?: () => void;
}

/**
 * Returns the rail's render bounds for the current viewport. GameScene
 * uses this to know how much horizontal space to leave for the corridor
 * canvas and to anchor the rail container.
 */
export function getRailBounds(scene: Phaser.Scene, open = false): RailBounds {
  const { width, height } = scene.scale;
  return railBoundsFor(width, height, open);
}

/**
 * The horizontal slice of the scene that game content may use.
 *
 * The rail is opaque and mounted at depth 50, over everything the game
 * draws at depth 0. Laying content out across the full scene width therefore
 * hides whatever falls in the reserved column — which was 36 of the 100
 * hand-authored room anchors on a landscape phone, including the snake and
 * fox door signs a child taps to enter a room.
 *
 * Views must lay out inside this box rather than the full width, and must
 * draw their background into it too: anchors are fractions of the background
 * art, so if the art and the anchors do not move together, animals stop
 * landing on the marks the art was painted for.
 */
export function getPlayArea(scene: Phaser.Scene): PlayArea {
  const { width, height } = scene.scale;
  return playAreaFor(width, height);
}

export function renderLeftRail(
  scene: Phaser.Scene,
  store: GameStateStore,
  container: Phaser.GameObjects.Container,
  callbacks: LeftRailCallbacks,
  open = false,
): void {
  container.removeAll(true);

  const bounds = getRailBounds(scene, open);
  const { x: rx, y: ry, w: rw, h: rh, mode } = bounds;

  // Counts derived from the store — the tab needs them before it draws,
  // so they are computed ahead of the panel art.
  const inCareCount = store.animals.filter(
    (a) => a.state === 'sheltered' || a.state === 'bonding' || a.state === 'pet',
  ).length;
  const arriving = store.animals.filter((a) => a.state === 'arriving');
  const needsCareCount = store.animals.filter((a) => {
    if (a.state !== 'sheltered' && a.state !== 'bonding') return false;
    return getUrgentNeed(a) !== null || store.sickAnimals.has(a.id);
  }).length;

  if (mode === 'tab') {
    renderTab(scene, container, callbacks, bounds, { inCareCount, arriving, needsCareCount });
    return;
  }

  // An open overlay rail is dismissed by tapping the scene beside it.
  // The catcher goes in first so it sits under the rail's own art, and
  // covers the whole scene so there is no dead strip a tap falls into.
  if (mode === 'overlay') {
    const { width, height } = scene.scale;
    const catcher = scene.add.rectangle(0, 0, width, height, 0x000000, 0.25)
      .setOrigin(0, 0)
      .setInteractive();
    catcher.on('pointerdown', () => callbacks.onToggleRail?.());
    container.add(catcher);
  }

  // ── Painted-paper panel background ─────────────────────────
  // Layered shadow + cream paper. Slightly opaque so the corridor
  // beneath has a hint of warmth showing through. Rail is anchored
  // to its own bounds, so its (0,0) draws at top-left of the panel.
  const shadow = scene.add.graphics();
  shadow.fillStyle(0x000000, 0.18);
  shadow.fillRoundedRect(rx + 3, ry + 4, rw, rh, 16);
  container.add(shadow);

  const paper = scene.add.graphics();
  paper.fillStyle(0xfef9ef, 0.96);
  paper.fillRoundedRect(rx, ry, rw, rh, 16);
  // Hairline border
  paper.lineStyle(1.5, 0xd4c8b8, 0.9);
  paper.strokeRoundedRect(rx, ry, rw, rh, 16);
  container.add(paper);

  renderSideRail(scene, store, container, callbacks, bounds, {
    inCareCount, arriving, needsCareCount,
  });
}

// ──────────────────────────────────────────────────────────────
// Collapsed tab (phone) — the pull-tab that brings the rail in
// ──────────────────────────────────────────────────────────────

/**
 * A 56px pull-tab at the left edge, vertically centred in the rail band.
 *
 * It carries one thing: how many animals are waiting. That is the only
 * part of the rail a child has to act on promptly, and an orange badge
 * with a number says it in the space available. Everything else in the
 * rail is a count she reads when she chooses to.
 */
function renderTab(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  callbacks: LeftRailCallbacks,
  bounds: { x: number; y: number; w: number; h: number },
  ctx: CountsContext,
): void {
  const tabH = 150;
  /**
   * Centred on the **play band**, not on the rail's own bounds.
   *
   * `railBoundsFor` hands this the strip from the top of the screen to the
   * bottom of it, because that is the region the rail may draw in. Centring
   * a 150px tab in that put it at y 167.5..317.5 on the phone while the band
   * runs 110..297 — 39px below the band's middle, with its last 20px behind
   * the nav bar. That is what makes the bottom-left corner read as a step
   * rather than as a corner.
   *
   * The band is where the content is, so the tab belongs on its centre.
   */
  const play = playAreaFor(scene.scale.width, scene.scale.height);
  const tabY = play.y + Math.max(0, (play.h - tabH) / 2);
  const w = RAIL_TAB_WIDTH;
  const waiting = ctx.arriving.length;

  const shadow = scene.add.graphics();
  shadow.fillStyle(0x000000, 0.18);
  shadow.fillRoundedRect(bounds.x + 3, tabY + 4, w, tabH, 16);
  container.add(shadow);

  const paper = scene.add.graphics();
  paper.fillStyle(0xfef9ef, 0.96);
  paper.fillRoundedRect(bounds.x, tabY, w, tabH, 16);
  paper.lineStyle(1.5, 0xd4c8b8, 0.9);
  paper.strokeRoundedRect(bounds.x, tabY, w, tabH, 16);
  container.add(paper);

  const cx = bounds.x + w / 2;

  // ARC paw mark, or a paw glyph where the texture has not loaded yet.
  if (scene.textures.exists('icon-arc-badge')) {
    const badge = scene.add.image(cx, tabY + 40, 'icon-arc-badge');
    const scale = Math.min(32 / badge.width, 32 / badge.height);
    badge.setScale(scale);
    container.add(badge);
  } else {
    container.add(
      scene.add.text(cx, tabY + 40, '🐾', {
        fontSize: '26px', fontFamily: FONTS.body, resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5, 0.5),
    );
  }

  // Waiting badge — the reason to open the rail at all.
  if (waiting > 0) {
    const badgeCy = tabY + 86;
    const ring = scene.add.graphics();
    ring.fillStyle(0xE67E22, 1);
    ring.fillCircle(cx, badgeCy, 16);
    container.add(ring);
    container.add(
      scene.add.text(cx, badgeCy, `${waiting}`, {
        fontSize: TYPE.lead, fontFamily: FONTS.title, fontStyle: 'bold',
        color: '#ffffff', resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5, 0.5),
    );
    container.add(
      scene.add.text(cx, tabY + 114, 'waiting', {
        fontSize: TYPE.caption, fontFamily: FONTS.body, fontStyle: 'bold',
        color: '#A85A28', resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5, 0.5),
    );
  } else {
    container.add(
      scene.add.text(cx, tabY + 92, `${ctx.inCareCount}`, {
        fontSize: TYPE.lead, fontFamily: FONTS.title, fontStyle: 'bold',
        color: '#3a2e22', resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5, 0.5),
    );
    container.add(
      scene.add.text(cx, tabY + 114, 'in care', {
        fontSize: TYPE.caption, fontFamily: FONTS.body,
        color: COLOURS.textLight, resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5, 0.5),
    );
  }

  // The whole tab is the target — 56 x 150 clears MIN_TAP in both axes.
  const hit = scene.add.rectangle(
    bounds.x, tabY, Math.max(w, MIN_TAP), Math.max(tabH, MIN_TAP), 0x000000, 0,
  ).setOrigin(0, 0).setInteractive({ useHandCursor: true });
  hit.on('pointerdown', () => callbacks.onToggleRail?.());
  container.add(hit);
}

// ──────────────────────────────────────────────────────────────
// Side rail (iPad / desktop) — full-height column
// ──────────────────────────────────────────────────────────────

interface CountsContext {
  inCareCount: number;
  arriving: Animal[];
  needsCareCount: number;
}

function renderSideRail(
  scene: Phaser.Scene,
  _store: GameStateStore,
  container: Phaser.GameObjects.Container,
  callbacks: LeftRailCallbacks,
  bounds: RailBounds,
  ctx: CountsContext,
): void {
  const padX = SAFE_MARGIN;
  const innerW = bounds.w - padX * 2;
  // A rail that slid in needs its own way out — a child should not have
  // to guess that the scene behind it is tappable. It goes at the top,
  // beside the eyebrow, where nothing else competes for the space: at the
  // bottom it landed on the first arrival's Welcome button, which is the
  // one control in the rail she must not miss.
  const isOverlay = bounds.mode === 'overlay';
  let cursorY = bounds.y + (isOverlay ? 30 : 16);

  // ── Header: "MY RESCUE" eyebrow ──────────────────────────
  container.add(
    scene.add.text(bounds.x + padX, cursorY, 'My rescue', {
      fontSize: TYPE.caption, fontFamily: FONTS.body, fontStyle: 'bold',
      color: COLOURS.textLight, resolution: TEXT_RESOLUTION,
    }).setOrigin(0, 0),
  );

  if (isOverlay) {
    const closeCx = bounds.x + bounds.w - padX - 16;
    const closeCy = cursorY + 4;
    const ring = scene.add.graphics();
    ring.fillStyle(0xe8ded0, 1);
    ring.fillCircle(closeCx, closeCy, 16);
    container.add(ring);
    container.add(
      scene.add.text(closeCx, closeCy, '✕', {
        fontSize: '18px', fontFamily: FONTS.body, fontStyle: 'bold',
        color: '#3a2e22', resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5, 0.5),
    );
    const closeHit = scene.add.rectangle(
      closeCx, closeCy, MIN_TAP, MIN_TAP, 0x000000, 0,
    ).setInteractive({ useHandCursor: true });
    closeHit.on('pointerdown', () => callbacks.onToggleRail?.());
    container.add(closeHit);
  }

  cursorY += 16;

  // ── Counts row: in-care / waiting / needs-care ────────────
  const countCellW = (innerW - 8) / 3;
  cursorY += drawCountCell(scene, container, bounds.x + padX, cursorY, countCellW, 'In care', `${ctx.inCareCount}`, 0x5AAE4A);
  drawCountCell(scene, container, bounds.x + padX + (countCellW + 4), cursorY - 54, countCellW, 'Waiting', `${ctx.arriving.length}`, 0xE67E22);
  drawCountCell(scene, container, bounds.x + padX + (countCellW + 4) * 2, cursorY - 54, countCellW, 'Need care', `${ctx.needsCareCount}`, ctx.needsCareCount > 0 ? 0xe3b04b : 0xb8a888,
    ctx.needsCareCount > 0 ? callbacks.onCareAlertTap : undefined);
  cursorY += 10;

  // ── Divider ──────────────────────────────────────────────
  cursorY += drawDivider(scene, container, bounds.x + padX, cursorY, innerW);

  // ── Arrivals section header ──────────────────────────────
  if (ctx.arriving.length > 0) {
    cursorY += drawSectionHeader(
      scene, container, bounds.x + padX, cursorY,
      '★ Arrivals waiting', `${ctx.arriving.length}`, 0xE67E22,
    );

    // One card per arriving animal
    for (const animal of ctx.arriving) {
      cursorY += drawArrivalCard(
        scene, container,
        bounds.x + padX, cursorY, innerW,
        animal,
        () => callbacks.onWelcomeOne(animal),
        callbacks.onShowAnimalDetails ? () => callbacks.onShowAnimalDetails!(animal) : undefined,
      );
      cursorY += 8;
    }

    // "Welcome them all" footer when >1 waiting
    if (ctx.arriving.length > 1) {
      cursorY += 4;
      const btn = createChromeButton(
        scene,
        bounds.x + bounds.w / 2, cursorY + 18,
        `Welcome them all (${ctx.arriving.length})`,
        () => callbacks.onWelcomeAll(ctx.arriving),
        // Filled, not plated: the rail is itself cream paper, so a plate
        // here would be a button drawn on its own colour.
        { width: innerW - 6, fontSize: TYPE.caption, icon: 'icon-accept', iconStyle: 'glyph', variant: 'filled' },
      );
      container.add(btn);
      cursorY += 44;
    }
  } else {
    // Empty state
    container.add(
      scene.add.text(bounds.x + bounds.w / 2, cursorY + 30,
        'No new arrivals\nright now',
        { fontSize: TYPE.caption, fontFamily: FONTS.body,
          color: COLOURS.textLight, align: 'center',
          resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5, 0.5),
    );
    cursorY += 60;
  }
}

// ──────────────────────────────────────────────────────────────
// Pieces
// ──────────────────────────────────────────────────────────────

function drawCountCell(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  x: number, y: number, w: number,
  label: string, value: string, ringColour: number,
  onTap?: () => void,
): number {
  const h = 54;
  const bg = scene.add.graphics();
  bg.fillStyle(0xf7efdf, 1);
  bg.fillRoundedRect(x, y, w, h, 8);
  bg.lineStyle(1.2, ringColour, 0.7);
  bg.strokeRoundedRect(x, y, w, h, 8);
  container.add(bg);

  container.add(
    scene.add.text(x + w / 2, y + 14, value, {
      fontSize: TYPE.lead, fontFamily: FONTS.title, fontStyle: 'bold',
      color: '#3a2e22', resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5, 0.5),
  );
  container.add(
    scene.add.text(x + w / 2, y + 38, label, {
      fontSize: TYPE.caption, fontFamily: FONTS.body,
      color: COLOURS.textLight, resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5, 0.5),
  );

  if (onTap) {
    const hit = scene.add.rectangle(x, y, w, h, 0x000000, 0)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', onTap);
    container.add(hit);
  }
  return h;
}

function drawSectionHeader(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  x: number, y: number,
  label: string, badge: string, badgeColour: number,
): number {
  // "\u2605 Arrivals waiting" measures ~160px at Nunito bold 16px, so the
  // badge's old hardcoded x + 110 printed the count circle over the middle of
  // the word WAITING. Measure the label and sit the badge after it.
  const labelText = scene.add.text(x, y, label, {
    fontSize: TYPE.caption, fontFamily: FONTS.body, fontStyle: 'bold',
    color: '#A85A28', resolution: TEXT_RESOLUTION,
  }).setOrigin(0, 0.5).setY(y + 8);
  container.add(labelText);
  const badgeX = x + labelText.width + 19;
  const badge1 = scene.add.graphics();
  badge1.fillStyle(badgeColour, 1);
  badge1.fillCircle(badgeX, y + 8, 9);
  container.add(badge1);
  container.add(
    scene.add.text(badgeX, y + 8, badge, {
      fontSize: TYPE.caption, fontFamily: FONTS.title, fontStyle: 'bold',
      color: '#ffffff', resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5, 0.5),
  );
  return 22;
}

function drawDivider(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  x: number, y: number, w: number,
): number {
  const line = scene.add.graphics();
  line.lineStyle(1, 0xd4c8b8, 0.8);
  line.lineBetween(x, y, x + w, y);
  container.add(line);
  return 12;
}

function drawArrivalCard(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  x: number, y: number, w: number,
  animal: Animal,
  onWelcome: () => void,
  onTapCard?: () => void,
): number {
  const accentInt = SPECIES_COLOURS[animal.species as Species];
  const welcomeH = MIN_TAP;

  // The card sizes to its own text rather than to a constant.
  //
  // It used to be a fixed 112 with the story pinned at y+30 and the button
  // pinned to the bottom. Two lines of story reach y+68 and the button's
  // top edge is at y+60, so the second line was printed under the button —
  // which is where the animal's story ends, and the story is the only
  // reason a child reads the card at all. A long name wrapping the title
  // to two lines pushed it further under still. Measuring both and
  // stacking them means neither can collide with the other again.
  const speciesLabel = animal.variant
    ? `${animal.variant} ${animal.species}`
    : animal.species;
  const title = scene.add.text(x + 12, y + 8, `${animal.name} the ${speciesLabel}`, {
    fontSize: TYPE.caption, fontFamily: FONTS.title, fontStyle: 'bold',
    color: '#3a2e22', resolution: TEXT_RESOLUTION,
    wordWrap: { width: w - 24 },
  }).setOrigin(0, 0);

  const rawStory = (animal.arrivalStory || '').trim();
  const truncated = rawStory.length > 88 ? rawStory.slice(0, 86) + '…' : rawStory;
  const story = scene.add.text(x + 12, title.y + title.height + 4, `"${truncated}"`, {
    fontSize: TYPE.caption, fontFamily: FONTS.body, fontStyle: 'italic',
    color: COLOURS.textLight, resolution: TEXT_RESOLUTION,
    wordWrap: { width: w - 24 }, maxLines: 2,
  }).setOrigin(0, 0);

  // 112 stays the floor so a one-line arrival looks the same as before.
  const textBottom = story.y + story.height;
  const cardH = Math.max(112, textBottom - y + 10 + welcomeH + 8);

  // Card background — pale paper with a coloured left edge that
  // signals which species the arrival is
  const bg = scene.add.graphics();
  bg.fillStyle(0xffffff, 0.85);
  bg.fillRoundedRect(x, y, w, cardH, 8);
  bg.lineStyle(1, 0xd4c8b8, 0.7);
  bg.strokeRoundedRect(x, y, w, cardH, 8);
  // Coloured species rib down the left side
  bg.fillStyle(accentInt, 1);
  bg.fillRoundedRect(x, y, 5, cardH, { tl: 8, bl: 8, tr: 0, br: 0 });

  // Added in paint order: paper, then the text that sits on it.
  container.add(bg);
  container.add(title);
  container.add(story);

  // Welcome button — full width of card minus padding, anchored bottom.
  // The 8px bottom pad is why cardH reserves welcomeH + 8 above: an
  // earlier 96px card let this overhang the paper by 7px.
  const btn = createChromeButton(
    scene, x + w / 2, y + cardH - 8 - welcomeH / 2,
    'Welcome',
    onWelcome,
    {
      width: w - 24, height: welcomeH, fontSize: TYPE.caption,
      icon: 'icon-accept', iconStyle: 'glyph', variant: 'filled',
    },
  );
  container.add(btn);

  // Tap card body (above the button) to see details
  if (onTapCard) {
    // Stops MIN_TAP_GAP short of the button's top edge, not 12px short of
    // the button's *centre*. The button hangs 8px above the card's bottom,
    // so subtracting 12 left exactly 4px between the two targets — the
    // only T4 failure in the game, on tablet and desktop, and the reason
    // this number is now derived rather than picked.
    const hit = scene.add.rectangle(x, y, w, cardH - welcomeH - 8 - MIN_TAP_GAP, 0x000000, 0)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', onTapCard);
    container.add(hit);
  }
  return cardH;
}
