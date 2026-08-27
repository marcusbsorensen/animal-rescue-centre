/**
 * LeftRailView — the "pet management" dock anchored to the left of the
 * corridor canvas (or pulled up as a bottom drawer on iPhone).
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
import { createButton } from '../ui/UIButton';
import { COLOURS, FONTS, TEXT_RESOLUTION, SAFE_MARGIN } from '../ui/constants';

/** Width of the rail on iPad / desktop. iPhone collapses it. */
export const RAIL_WIDTH = 280;

/** Viewport width below which the rail becomes a bottom drawer. */
export const RAIL_DRAWER_BREAKPOINT = 600;

export interface LeftRailCallbacks {
  /** Welcome a single arriving animal. */
  onWelcomeOne: (animal: Animal) => void;
  /** Welcome every arriving animal at once. */
  onWelcomeAll: (arriving: Animal[]) => void;
  /** Tap a needs-care badge — jump to corridor (or focus the relevant pet). */
  onCareAlertTap?: () => void;
  /** Tap an arriving animal's card body — show its details popup. */
  onShowAnimalDetails?: (animal: Animal) => void;
}

/**
 * Returns the rail's render bounds for the current viewport. GameScene
 * uses this to know how much horizontal space to leave for the corridor
 * canvas and to anchor the rail container.
 */
export function getRailBounds(scene: Phaser.Scene): { x: number; y: number; w: number; h: number; mode: 'side' | 'drawer' } {
  const { width, height } = scene.scale;
  if (width < RAIL_DRAWER_BREAKPOINT) {
    // Phone: bottom drawer (peek state ~120px above the nav)
    const drawerH = 130;
    const navH = 84; // matches NavBarView's render height
    return { x: 0, y: height - navH - drawerH, w: width, h: drawerH, mode: 'drawer' };
  }
  // Tablet / desktop: full-height left rail
  const hudH = 110; // leave room for the slimmer HUD top strip
  return { x: 0, y: hudH, w: RAIL_WIDTH, h: height - hudH, mode: 'side' };
}

export function renderLeftRail(
  scene: Phaser.Scene,
  store: GameStateStore,
  container: Phaser.GameObjects.Container,
  callbacks: LeftRailCallbacks,
): void {
  container.removeAll(true);

  const bounds = getRailBounds(scene);
  const { x: rx, y: ry, w: rw, h: rh, mode } = bounds;

  // ── Painted-paper panel background ─────────────────────────
  // Layered shadow + cream paper. Slightly opaque so the corridor
  // beneath has a hint of warmth showing through. Rail is anchored
  // to its own bounds, so its (0,0) draws at top-left of the panel.
  const shadow = scene.add.graphics();
  shadow.fillStyle(0x000000, 0.18);
  shadow.fillRoundedRect(rx + 3, ry + 4, rw, rh, mode === 'side' ? 16 : 18);
  container.add(shadow);

  const paper = scene.add.graphics();
  paper.fillStyle(0xfef9ef, 0.96);
  paper.fillRoundedRect(rx, ry, rw, rh, mode === 'side' ? 16 : 18);
  // Hairline border
  paper.lineStyle(1.5, 0xd4c8b8, 0.9);
  paper.strokeRoundedRect(rx, ry, rw, rh, mode === 'side' ? 16 : 18);
  container.add(paper);

  // Counts derived from the store — same definitions as HUDView used to
  // compute, so the numbers stay consistent now that the badges have
  // moved out of the top strip.
  const inCareCount = store.animals.filter(
    (a) => a.state === 'sheltered' || a.state === 'bonding' || a.state === 'pet',
  ).length;
  const arriving = store.animals.filter((a) => a.state === 'arriving');
  const needsCareCount = store.animals.filter((a) => {
    if (a.state !== 'sheltered' && a.state !== 'bonding') return false;
    return getUrgentNeed(a) !== null || store.sickAnimals.has(a.id);
  }).length;

  if (mode === 'drawer') {
    renderDrawer(scene, store, container, callbacks, bounds, { inCareCount, arriving, needsCareCount });
  } else {
    renderSideRail(scene, store, container, callbacks, bounds, { inCareCount, arriving, needsCareCount });
  }
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
  bounds: { x: number; y: number; w: number; h: number },
  ctx: CountsContext,
): void {
  const padX = SAFE_MARGIN;
  const innerW = bounds.w - padX * 2;
  let cursorY = bounds.y + 16;

  // ── Header: "MY RESCUE" eyebrow ──────────────────────────
  container.add(
    scene.add.text(bounds.x + padX, cursorY, 'MY RESCUE', {
      fontSize: '14px', fontFamily: FONTS.body, fontStyle: 'bold',
      color: COLOURS.textLight, resolution: TEXT_RESOLUTION,
    }).setOrigin(0, 0),
  );
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
      '★ ARRIVALS WAITING', `${ctx.arriving.length}`, 0xE67E22,
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
      const btn = createButton(
        scene,
        bounds.x + bounds.w / 2, cursorY + 18,
        `Welcome them all (${ctx.arriving.length})`,
        () => callbacks.onWelcomeAll(ctx.arriving),
        { width: innerW - 6, fontSize: '14px', icon: 'icon-accept', bgColour: COLOURS.primary },
      );
      container.add(btn);
      cursorY += 44;
    }
  } else {
    // Empty state
    container.add(
      scene.add.text(bounds.x + bounds.w / 2, cursorY + 30,
        'No new arrivals\nright now',
        { fontSize: '14px', fontFamily: FONTS.body,
          color: COLOURS.textLight, align: 'center',
          resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5, 0.5),
    );
    cursorY += 60;
  }
}

// ──────────────────────────────────────────────────────────────
// Bottom drawer (iPhone) — horizontal arrival cards in a peek strip
// ──────────────────────────────────────────────────────────────

function renderDrawer(
  scene: Phaser.Scene,
  _store: GameStateStore,
  container: Phaser.GameObjects.Container,
  callbacks: LeftRailCallbacks,
  bounds: { x: number; y: number; w: number; h: number },
  ctx: CountsContext,
): void {
  const padX = SAFE_MARGIN;
  const innerW = bounds.w - padX * 2;

  // Header strip — counts inline + tap-target to expand later (future)
  const headerY = bounds.y + 10;
  const headerText = ctx.arriving.length > 0
    ? `★ ${ctx.arriving.length} waiting · ${ctx.inCareCount} in care${ctx.needsCareCount > 0 ? ` · ${ctx.needsCareCount} need care` : ''}`
    : `${ctx.inCareCount} in care${ctx.needsCareCount > 0 ? ` · ${ctx.needsCareCount} need care` : ''}`;
  container.add(
    scene.add.text(bounds.x + padX, headerY,
      headerText,
      {
        fontSize: '14px', fontFamily: FONTS.body, fontStyle: 'bold',
        color: ctx.arriving.length > 0 ? '#A85A28' : COLOURS.textLight,
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0, 0),
  );

  // Arrival mini-cards laid out horizontally
  if (ctx.arriving.length > 0) {
    const cardsTop = bounds.y + 30;
    const cardsH = bounds.h - 38;
    const cardW = Math.min(180, (innerW - (ctx.arriving.length - 1) * 8) / ctx.arriving.length);
    let cx = bounds.x + padX;
    for (const animal of ctx.arriving) {
      drawMiniArrivalCard(scene, container, cx, cardsTop, cardW, cardsH, animal,
        () => callbacks.onWelcomeOne(animal));
      cx += cardW + 8;
    }

    // "All" pill at the right edge if >1
    if (ctx.arriving.length > 1) {
      const allBtn = createButton(
        scene,
        // -38, not -32: createButton pads out to about 76px wide, so half of
        // it is 38. The old guess put the pill 10px from the screen edge.
        bounds.x + bounds.w - padX - 38,
        bounds.y + 16,
        `All`,
        () => callbacks.onWelcomeAll(ctx.arriving),
        { width: 60, fontSize: '14px', bgColour: COLOURS.primary },
      );
      container.add(allBtn);
    }
  } else {
    container.add(
      scene.add.text(bounds.x + bounds.w / 2, bounds.y + bounds.h / 2 + 6,
        'All quiet at the rescue',
        { fontSize: '14px', fontFamily: FONTS.body,
          color: COLOURS.textLight, resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5, 0.5),
    );
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
      fontSize: '22px', fontFamily: FONTS.title, fontStyle: 'bold',
      color: '#3a2e22', resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5, 0.5),
  );
  container.add(
    scene.add.text(x + w / 2, y + 38, label, {
      fontSize: '14px', fontFamily: FONTS.body,
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
  container.add(
    scene.add.text(x, y, label, {
      fontSize: '14px', fontFamily: FONTS.body, fontStyle: 'bold',
      color: '#A85A28', resolution: TEXT_RESOLUTION,
    }).setOrigin(0, 0.5).setY(y + 8),
  );
  // Round badge with count
  const badgeX = x + 110;
  const badge1 = scene.add.graphics();
  badge1.fillStyle(badgeColour, 1);
  badge1.fillCircle(badgeX, y + 8, 9);
  container.add(badge1);
  container.add(
    scene.add.text(badgeX, y + 8, badge, {
      fontSize: '14px', fontFamily: FONTS.title, fontStyle: 'bold',
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
  const cardH = 96;

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
  container.add(bg);

  // Title: "Bramble the beagle dog" (variant if any, else species)
  const speciesLabel = animal.variant
    ? `${animal.variant} ${animal.species}`
    : animal.species;
  const titleText = `${animal.name} the ${speciesLabel}`;
  container.add(
    scene.add.text(x + 12, y + 8, titleText, {
      fontSize: '14px', fontFamily: FONTS.title, fontStyle: 'bold',
      color: '#3a2e22', resolution: TEXT_RESOLUTION,
      wordWrap: { width: w - 24 },
    }).setOrigin(0, 0),
  );

  // Body: the arrival story (truncated to 2 lines)
  const story = (animal.arrivalStory || '').trim();
  const truncated = story.length > 88 ? story.slice(0, 86) + '…' : story;
  container.add(
    scene.add.text(x + 12, y + 30, `"${truncated}"`, {
      fontSize: '14px', fontFamily: FONTS.body, fontStyle: 'italic',
      color: COLOURS.textLight, resolution: TEXT_RESOLUTION,
      wordWrap: { width: w - 24 }, maxLines: 2,
    }).setOrigin(0, 0),
  );

  // Welcome button — full width of card minus padding, anchored bottom
  const btn = createButton(
    scene, x + w / 2, y + cardH - 16,
    'Welcome',
    onWelcome,
    { width: w - 24, fontSize: '14px', icon: 'icon-accept', bgColour: COLOURS.primary },
  );
  container.add(btn);

  // Tap card body (above the button) to see details
  if (onTapCard) {
    const hit = scene.add.rectangle(x, y, w, cardH - 30, 0x000000, 0)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', onTapCard);
    container.add(hit);
  }
  return cardH;
}

function drawMiniArrivalCard(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  x: number, y: number, w: number, h: number,
  animal: Animal,
  onWelcome: () => void,
): void {
  const accentInt = SPECIES_COLOURS[animal.species as Species];

  const bg = scene.add.graphics();
  bg.fillStyle(0xffffff, 0.92);
  bg.fillRoundedRect(x, y, w, h, 6);
  bg.lineStyle(1, accentInt, 0.7);
  bg.strokeRoundedRect(x, y, w, h, 6);
  container.add(bg);

  // Name (single line, truncated)
  const title = `${animal.name}`;
  container.add(
    scene.add.text(x + 6, y + 6, title, {
      fontSize: '14px', fontFamily: FONTS.title, fontStyle: 'bold',
      color: '#3a2e22', resolution: TEXT_RESOLUTION,
    }).setOrigin(0, 0),
  );
  // Subtitle: "the beagle dog"
  const sub = animal.variant
    ? `the ${animal.variant} ${animal.species}`
    : `the ${animal.species}`;
  container.add(
    scene.add.text(x + 6, y + 23, sub, {
      fontSize: '14px', fontFamily: FONTS.body, fontStyle: 'italic',
      color: COLOURS.textLight, resolution: TEXT_RESOLUTION,
    }).setOrigin(0, 0),
  );

  // Mini welcome pill at the bottom
  const btn = createButton(
    scene, x + w / 2, y + h - 14,
    'Welcome',
    onWelcome,
    { width: w - 14, fontSize: '14px', bgColour: COLOURS.primary },
  );
  container.add(btn);
}
