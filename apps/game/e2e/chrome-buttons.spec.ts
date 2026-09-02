import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForGameReady, waitForScene, mintRealSession, installSession } from './helpers';

/**
 * The screens `createButton`'s retirement actually changed.
 *
 * `ui-audit.spec.ts` shoots the twelve a child crosses, and buttons are
 * barely on four of them — the kitchen's Garden shortcut and nothing else.
 * The conversion's weight is in the overlays that spec never opens: the
 * animal card and its More grid, the Games popup, the walk encounter, the
 * Phaser PIN keypad. This shoots those.
 *
 * Same 874x402 as the audit, for the same reason — it is the app's real
 * WKWebView viewport, so a Chrome capture is geometrically faithful.
 */

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '__buttons__');
const PHONE = { width: 874, height: 402 };

test.use({ deviceScaleFactor: 1 });

type Page = import('@playwright/test').Page;

async function shoot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

test('the overlays the buttons live on', async ({ page }) => {
  test.setTimeout(240_000);
  fs.mkdirSync(OUT, { recursive: true });

  // ── The Phaser login keypad ──────────────────────────
  //
  // The fallback from MainMenuScene, not the DOM sign board, and the
  // reason it matters: its digits were white type on '#f5efe4', which is
  // 1.06:1 — a key you could feel but not read. There is no query param
  // that reaches it, so start the scene and step it to the PIN directly.
  await page.setViewportSize(PHONE);
  await page.goto('/?sideRail=0');
  await waitForGameReady(page);
  await page.evaluate(() => {
    const g = (window as unknown as { __PHASER_GAME__: Phaser.Game }).__PHASER_GAME__;
    g.scene.start('LoginScene');
  });
  await waitForScene(page, 'LoginScene', 20_000);
  // MainMenuScene's DOM sign board does not unmount when another scene is
  // started under it — the same trap `scene-walk.spec.ts` hit — so the
  // Phaser screen renders behind an iframe. Take the iframe away.
  await page.evaluate(() => {
    document.querySelectorAll('iframe[aria-label^="A.R.C."]').forEach((f) => f.remove());
  });
  await page.waitForTimeout(1200);
  //
  // Only reachable with `USE_OVERLAY` flipped to false in LoginScene —
  // the DOM sign board mounts and returns before the Phaser path runs, so
  // this capture is a deliberate one-off rather than something the suite
  // can hold. Skipped when the overlay is on, which is always in a normal
  // checkout.
  const reachedPhaser = await page.evaluate(() => {
    const g = (window as unknown as { __PHASER_GAME__: Phaser.Game }).__PHASER_GAME__;
    const s = g.scene.getScene('LoginScene') as unknown as
      { container?: unknown; selectedUsername: string; showPinEntry: () => void };
    if (!s.container) return false;
    s.selectedUsername = 'Tilly';
    s.showPinEntry();
    return true;
  });
  if (reachedPhaser) await shoot(page, '01-login-keypad');

  // ── Into the game ────────────────────────────────────
  const session = await mintRealSession();
  await installSession(page, session);
  await page.goto('/?sideRail=0');
  await waitForGameReady(page);
  await page.frameLocator('iframe[aria-label="A.R.C. menu screen"]')
    .locator('#continue-btn').click({ timeout: 30_000 });
  await page.frameLocator('iframe[aria-label="A.R.C. intro screen"]')
    .locator('#stage').click({ timeout: 30_000 });
  await waitForScene(page, 'GameScene', 30_000);
  await page.waitForTimeout(2500);

  try {
    await page.frameLocator('iframe[aria-label="A.R.C. arrival screen"]')
      .locator('#welcome-btn, .choice-welcome').first().click({ timeout: 4000 });
  } catch { /* no plaque */ }

  // Drive from the scene rather than by tapping painted art, which moves
  // with the layout — the same reason `ui-audit.spec.ts` does.
  type Scene = Record<string, unknown> & { store: { animals: unknown[] } };
  const scene = (): string => 'GameScene';

  // ── The animal card, main face then the More grid ────
  //
  // The More grid is where an unavailable action now draws as a plate
  // beside filled ones instead of as a grey button, so it wants seeing
  // with at least one action blocked — which any healthy animal gives.
  //
  // Open the card and find "More…" in the same evaluate. Doing it in two
  // steps failed silently: something on a timer re-renders the view inside
  // the screenshot's own wait, so by the second call there was no card to
  // search and the lookup returned null rather than erroring.
  const at = await page.evaluate(() => {
    const g = (window as unknown as { __PHASER_GAME__: Phaser.Game }).__PHASER_GAME__;
    const s = g.scene.getScene('GameScene') as unknown as
      Scene & { showAnimalDetails: (a: unknown) => void;
                animalCardContainer?: Phaser.GameObjects.Container };
    const animal = s.store.animals[0];
    if (!animal) return null;
    s.showAnimalDetails(animal);
    // The field, not `animalCard()` — that method destroys the container
    // and hands back a fresh empty one, so calling it to *read* the card
    // deletes the card. It cost four blank captures to notice.
    const card = s.animalCardContainer;
    if (!card) return null;
    const more = card.list.find((o) =>
      o instanceof Phaser.GameObjects.Container
      && o.list.some((c) => (c as Phaser.GameObjects.Text).text === 'More…'),
    ) as Phaser.GameObjects.Container | undefined;
    if (!more) return null;
    // World transform, not `more.x` — the button's x is relative to the
    // card container, and the card is not at the origin.
    const m = more.getWorldTransformMatrix();
    const canvas = g.canvas.getBoundingClientRect();
    return {
      x: canvas.left + m.tx * (canvas.width / g.scale.width),
      y: canvas.top + m.ty * (canvas.height / g.scale.height),
    };
  });
  await shoot(page, '02-animal-card');
  if (at) {
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(600);
    await shoot(page, '03-animal-card-more');
  }

  // ── The Games popup — three filled buttons on a cream plate ──
  //
  // Last, because it lays a full-screen dismiss rectangle over the scene
  // and nothing shot after it can be clicked: the first version of this
  // spec opened the popup, re-rendered, opened the card, and every click
  // on the card went to the popup's overlay instead.
  await page.evaluate(() => {
    const g = (window as unknown as { __PHASER_GAME__: Phaser.Game }).__PHASER_GAME__;
    const s = g.scene.getScene('GameScene') as unknown as Record<string, () => void>;
    s.showGamesPopup();
  });
  await shoot(page, '04-games-popup');

  // ── The Depot, on its board ──────────────────────────
  //
  // `scene-walk.spec.ts` only ever sees mode select, so the board — wood,
  // light cells, the goals row — went unlooked-at through the warm-up.
  await page.evaluate(() => {
    const g = (window as unknown as { __PHASER_GAME__: Phaser.Game }).__PHASER_GAME__;
    g.scene.start('DepotScene');
  });
  await waitForScene(page, 'DepotScene', 20_000);
  await page.waitForTimeout(1500);
  await shoot(page, '05-depot-select');
  await page.evaluate(() => {
    const g = (window as unknown as { __PHASER_GAME__: Phaser.Game }).__PHASER_GAME__;
    const s = g.scene.getScene('DepotScene') as unknown as
      { startMode: (m: string) => void };
    s.startMode('parts_and_tools');
  });
  await shoot(page, '06-depot-board');

  // ── The supply run, on the road ──────────────────────
  //
  // Same reason as the Depot's board: `scene-walk.spec.ts` only ever sees
  // destination select, so the drive itself — sky, road, dashboard — went
  // unlooked-at through the warm-up.
  await page.evaluate(() => {
    const g = (window as unknown as { __PHASER_GAME__: Phaser.Game }).__PHASER_GAME__;
    g.scene.start('SupplyRunScene');
  });
  await waitForScene(page, 'SupplyRunScene', 20_000);
  await page.waitForTimeout(1500);
  await shoot(page, '07-supply-select');
  await page.evaluate(() => {
    const g = (window as unknown as { __PHASER_GAME__: Phaser.Game }).__PHASER_GAME__;
    const s = g.scene.getScene('SupplyRunScene') as unknown as
      { startRun: (d: unknown) => void; destinations?: unknown[] };
    const w = window as unknown as { __SUPPLY_DESTS__?: unknown[] };
    const dest = (w.__SUPPLY_DESTS__ ?? [])[0]
      ?? { destination: 'bramble_farm', label: 'Bramble Farm Supplies', emoji: '🌾',
           description: 'Hay, straw, feed', basePay: 50, distance: 100, unlockLevel: 1 };
    s.startRun(dest);
  });
  await shoot(page, '08-supply-drive');

  void scene;
});
