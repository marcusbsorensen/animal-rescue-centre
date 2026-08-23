import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForGameReady, seedFakeSession, collectConsoleErrors } from './helpers';

/**
 * Scene walk — a diagnostic sweep, not a pass/fail gate.
 *
 * The audit found 23,800 lines of scene code with zero tests over it, and
 * three smoke tests that only prove the game boots. This walks every
 * registered scene, starts it, and records what happens: did it activate,
 * did it paint anything, did it throw. The output is a table you can read
 * top-to-bottom to decide what to fix first.
 *
 * It deliberately does not assert per-scene. A scene that needs a selected
 * animal, or a destination, or a loaded save is *expected* to complain when
 * started cold — that is information about coupling, not a regression. The
 * one hard assertion is at the end: no scene may hard-crash the game.
 *
 * Run it:
 *   pnpm --filter @arc/game exec playwright test e2e/scene-walk.spec.ts
 *
 * Artefacts land in e2e/__walk__/ (gitignored) — one PNG per scene plus
 * walk-report.json.
 */

/** Every scene registered in main.ts, in rough player-journey order. */
const SCENES = [
  'MainMenuScene',
  'SignupScene',
  'LoginScene',
  'ForgotPinScene',
  'AccountScene',
  'IntroScene',
  'GameScene',
  'KitchenMinigameScene',
  'WalkScene',
  'VetScene',
  'GroomingScene',
  'PlayScene',
  'AdoptionMatchScene',
  'CharmSelectScene',
  'DepotScene',
  'SupplyRunScene',
  'PtvDriveScene',
  'SocialScene',
  'FriendsScene',
] as const;

/** Network/auth noise from having no real Supabase behind the test run. */
const EXPECTED_NOISE = [
  'Failed to fetch',
  'AuthSessionMissing',
  'NetworkError',
  'status code 401',
  'Invalid API key',
  'ERR_INTERNET_DISCONNECTED',
  // The Edge Functions reject the fake session at the preflight, so every
  // save/load in a test run surfaces as a CORS failure plus a resource
  // error. Expected here; not a signal about the game.
  'Access to fetch at',
  'blocked by CORS policy',
  'net::ERR_FAILED',
  // Harness artefact: this walk stops and restarts GameScene once per
  // sub-game, and each start re-registers its backgrounds instead of
  // checking textures.exists() first. Harmless in normal play, where
  // GameScene starts once — but worth knowing it is us, not the game.
  'Texture key already in use',
];

const isNoise = (msg: string) => EXPECTED_NOISE.some((n) => msg.includes(n));

interface SceneResult {
  scene: string;
  activated: boolean;
  painted: boolean;
  displayObjects: number;
  /** DOM nodes mounted outside the canvas — the HTML-overlay scenes. */
  overlayNodes: number;
  /** A launcher that delegates and stops itself is doing its job, not failing. */
  selfStopping: boolean;
  errors: string[];
}

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '__walk__');

test('walk every scene and report', async ({ page }) => {
  test.setTimeout(180_000);

  fs.mkdirSync(OUT, { recursive: true });
  const errors = collectConsoleErrors(page);

  await page.goto('/');
  await seedFakeSession(page);
  await page.reload();
  await waitForGameReady(page);
  await page.waitForTimeout(1500);

  const results: SceneResult[] = [];

  for (const scene of SCENES) {
    const before = errors.length;

    // Stop whatever is running, then start the target cold. Wrapped so a
    // throw inside create() is captured rather than killing the walk.
    await page.evaluate((key) => {
      const g = (window as unknown as {
        __PHASER_GAME__?: {
          scene: {
            scenes: Array<{ sys: { settings: { key: string; active: boolean } } }>;
            stop: (k: string) => void;
            start: (k: string) => void;
          };
        };
      }).__PHASER_GAME__;
      if (!g) return;
      for (const s of g.scene.scenes) {
        if (s.sys.settings.active) {
          try { g.scene.stop(s.sys.settings.key); } catch { /* ignore */ }
        }
      }
      try { g.scene.start(key); } catch { /* captured via pageerror */ }
    }, scene);

    await page.waitForTimeout(2200);

    // Did it come up, and did it put anything on screen?
    //
    // "On screen" means two different things in this codebase. Most scenes
    // draw Phaser display objects onto the canvas, but a third of them —
    // signup, login, forgot-pin, intro, walk, adoption — mount an HTML
    // iframe overlay instead and leave the display list empty. Counting
    // only display objects marks all of those as blank when they are
    // working perfectly, so count both.
    const state = await page.evaluate((key) => {
      const g = (window as unknown as {
        __PHASER_GAME__?: {
          scene: {
            scenes: Array<{
              sys: { settings: { key: string; active: boolean }; displayList?: { length: number } };
            }>;
          };
        };
      }).__PHASER_GAME__;
      const s = g?.scene.scenes.find((x) => x.sys.settings.key === key);
      // Anything mounted outside the Phaser canvas container.
      const overlayNodes = document.querySelectorAll(
        'body > iframe, body > div:not(#game-container), #game-container > iframe, #game-container > div',
      ).length;
      return {
        activated: s?.sys.settings.active ?? false,
        displayObjects: s?.sys.displayList?.length ?? 0,
        overlayNodes,
      };
    }, scene);

    await page.screenshot({ path: path.join(OUT, `${scene}.png`) });

    // A scene that is inactive but left GameScene running delegated and
    // stopped itself on purpose — the launcher pattern, not a failure.
    const gameSceneUp = await page.evaluate(() => {
      const g = (window as unknown as {
        __PHASER_GAME__?: {
          scene: { scenes: Array<{ sys: { settings: { key: string; active: boolean } } }> };
        };
      }).__PHASER_GAME__;
      return Boolean(
        g?.scene.scenes.some((s) => s.sys.settings.key === 'GameScene' && s.sys.settings.active),
      );
    });

    results.push({
      scene,
      activated: state.activated,
      painted: state.displayObjects > 0 || state.overlayNodes > 0,
      displayObjects: state.displayObjects,
      overlayNodes: state.overlayNodes,
      selfStopping: !state.activated && gameSceneUp,
      errors: errors.slice(before).filter((e) => !isNoise(e)),
    });
  }

  fs.writeFileSync(path.join(OUT, 'walk-report.json'), JSON.stringify(results, null, 2));

  // Readable summary in the test output.
  const pad = (s: string, n: number) => s.padEnd(n);
  const verdict = (r: SceneResult) =>
    r.selfStopping ? 'launcher'
      : !r.activated ? 'DID NOT START'
      : !r.painted ? 'BLANK'
      : r.errors.length > 0 ? 'threw'
      : 'ok';

  console.log(`\n${pad('SCENE', 24)} ${pad('VERDICT', 15)} ${pad('CANVAS', 8)} ${pad('DOM', 5)} NOTE`);
  console.log('-'.repeat(78));
  for (const r of results) {
    console.log(
      `${pad(r.scene, 24)} ${pad(verdict(r), 15)} ${pad(String(r.displayObjects), 8)} ` +
      `${pad(String(r.overlayNodes), 5)} ${r.errors[0]?.slice(0, 60) ?? ''}`,
    );
  }

  const launchers = results.filter((r) => r.selfStopping);
  const dead = results.filter((r) => !r.activated && !r.selfStopping);
  const blank = results.filter((r) => r.activated && !r.painted);
  const throwing = results.filter((r) => r.errors.length > 0);
  console.log(
    `\n${results.length} scenes: ${dead.length} did not start, ${blank.length} blank, ` +
    `${throwing.length} threw, ${launchers.length} are self-stopping launchers.\n`,
  );

  // The only hard gate: the game itself must survive the whole walk.
  const stillAlive = await page.evaluate(
    () => Boolean((window as unknown as { __PHASER_GAME__?: unknown }).__PHASER_GAME__),
  );
  expect(stillAlive, 'the Phaser game was destroyed part-way through the walk').toBe(true);
});

/**
 * The walk above cold-starts every scene, which is a coverage sweep rather
 * than gameplay. This one plays: it lets GameScene build real state, takes
 * a real animal out of its store, and hands that animal to the sub-games
 * the way GameScene itself does.
 *
 * The distinction matters for triage. A scene that renders nothing cold but
 * renders correctly when handed an animal is coupled, not broken — a design
 * note rather than a bug to fix before shipping.
 */
test('sub-games render when handed real game state', async ({ page }) => {
  test.setTimeout(120_000);

  const errors = collectConsoleErrors(page);
  await page.goto('/');
  await seedFakeSession(page);
  await page.reload();
  await waitForGameReady(page);

  await page.evaluate(() => {
    const g = (window as unknown as { __PHASER_GAME__?: { scene: { start: (k: string) => void } } }).__PHASER_GAME__;
    g?.scene.start('GameScene');
  });
  await page.waitForTimeout(3000);

  const animalCount = await page.evaluate(() => {
    const g = (window as unknown as {
      __PHASER_GAME__?: {
        scene: { scenes: Array<{ sys: { settings: { key: string } }; store?: { animals?: unknown[] } }> };
      };
    }).__PHASER_GAME__;
    const gs = g?.scene.scenes.find((s) => s.sys.settings.key === 'GameScene');
    return (gs?.store?.animals ?? []).length;
  });

  console.log(`\nGameScene built ${animalCount} animals of real state.`);

  // Each sub-game has its own init() contract, and passing the wrong shape
  // produces a crash that looks like a product bug but is the harness's
  // fault. These mirror the call sites in GameScene — the `extra` field
  // names the keys beyond the common {animal, allAnimals, onComplete}.
  const DATA_SCENES: Array<{ key: string; extra: string[] }> = [
    { key: 'WalkScene', extra: [] },
    { key: 'PlayScene', extra: [] },
    { key: 'GroomingScene', extra: [] },
    { key: 'VetScene', extra: ['illness'] },        // GameScene.ts:892
    { key: 'AdoptionMatchScene', extra: ['store'] },
  ];
  const rows: Array<{ scene: string; objects: number }> = [];

  for (const { key: scene, extra } of DATA_SCENES) {
    await page.evaluate(({ key, extra }) => {
      const g = (window as unknown as {
        __PHASER_GAME__?: {
          scene: {
            scenes: Array<{
              sys: { settings: { key: string } };
              store?: { animals?: unknown[]; sickAnimals?: Map<string, unknown> };
            }>;
            start: (k: string, d?: unknown) => void;
            stop: (k: string) => void;
          };
        };
      }).__PHASER_GAME__;
      if (!g) return;
      const gs = g.scene.scenes.find((s) => s.sys.settings.key === 'GameScene');
      const all = gs?.store?.animals ?? [];
      const payload: Record<string, unknown> = {
        animal: all[0],
        allAnimals: all,
        onComplete: () => {},
      };
      if (extra.includes('store')) payload.store = gs?.store;
      if (extra.includes('illness')) {
        // A plausible illness record — VetScene reads .emoji off it.
        payload.illness = { id: 'sniffles', name: 'Sniffles', emoji: '🤧', severity: 'mild', treatment: 'treatment-home' };
      }
      g.scene.stop('GameScene');
      g.scene.start(key, payload);
    }, { key: scene, extra });

    await page.waitForTimeout(2500);
    const count = await page.evaluate((key) => {
      const g = (window as unknown as {
        __PHASER_GAME__?: {
          scene: { scenes: Array<{ sys: { settings: { key: string }; displayList?: { length: number } } }> };
        };
      }).__PHASER_GAME__;
      return g?.scene.scenes.find((s) => s.sys.settings.key === key)?.sys.displayList?.length ?? 0;
    }, scene);
    await page.screenshot({ path: path.join(OUT, `withdata-${scene}.png`) });
    rows.push({ scene, objects: count });

    // Put GameScene back so the next iteration has a live store to read.
    await page.evaluate(() => {
      const g = (window as unknown as { __PHASER_GAME__?: { scene: { start: (k: string) => void } } }).__PHASER_GAME__;
      g?.scene.start('GameScene');
    });
    await page.waitForTimeout(1200);
  }

  console.log('\nWith real game state:');
  for (const r of rows) {
    console.log(
      `  ${r.scene.padEnd(22)} ${String(r.objects).padStart(4)} objects  ` +
      `${r.objects > 0 ? 'renders' : 'STILL BLANK'}`,
    );
  }

  const fatal = errors.filter((e) => !isNoise(e));
  console.log(`\nnon-network errors during the run: ${fatal.length}`);
  for (const f of fatal.slice(0, 5)) console.log(`  ${f.slice(0, 120)}`);
});
