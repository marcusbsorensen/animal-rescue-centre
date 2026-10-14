import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForGameReady, waitForScene } from './helpers';

/**
 * One real adoption, played end to end: the picker, the hand-over
 * conversation, the ceremony, the commit. It is played once at a sideways
 * phone (844x390) and once at an iPad (1024x768), each at its own size from
 * the first frame (a window resized mid-game is a different, stale layout, and
 * restarts the scene), and every beat is photographed.
 *
 * Nothing leaves the machine. The session is a fake one (the same shape
 * helpers.seedFakeSession writes), the shelter is a first-time player's with
 * one seeded animal, and every request to Supabase is answered here: the load
 * says "no save yet", and anything else is refused. The test fails if the page
 * tried to reach any other service.
 *
 * Why a fake session and not mintRealSession: minting logs a real account in
 * against the live project. The price is that nothing here exercises the
 * server; the adoption itself is local game logic, so nothing is lost.
 *
 *   ARC_E2E_BASE_URL=http://localhost:5173 ARC_BROWSER_CHANNEL=chrome \
 *   ARC_SHOTS_DIR=/some/folder \
 *     pnpm --filter @arc/game exec playwright test e2e/adoption-handover.spec.ts
 */

const PHONE = { width: 844, height: 390 };
const TABLET = { width: 1024, height: 768 };

const ANIMAL = {
  id: 'e2e-pumpkin', name: 'Pumpkin', species: 'cat', variant: 'ginger',
  state: 'bonding', arrivalStory: 'Found under a hedge in the rain.',
  hunger: 30, tiredness: 20, happiness: 85, health: 95,
  bondLevel: 70, cleanliness: 80, roomId: 'room-cat',
};

interface Rect { x: number; y: number; w: number; h: number }
interface Snapshot {
  beat: number; beatCount: number; viewport: { w: number; h: number }; side: 'left' | 'right'; role: 'warden' | 'guest';
  speakerId: string; lineId: string | null; text: string; portrait: Rect; box: Rect; skip: Rect; choices: Rect[];
  words: Array<{ text: string; kind: 'animal' | 'person' | null }>;
}

type PhaserGame = {
  scene: {
    getScene: (k: string) => Record<string, unknown> | null;
    scenes: Array<{ sys: { settings: { key: string; active: boolean } } }>;
    start: (k: string) => void;
    stop: (k: string) => void;
  };
};

const shotsDir = (): string => {
  const dir = process.env.ARC_SHOTS_DIR ?? test.info().outputPath('shots');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

/** Photograph the current screen. */
async function shoot(page: Page, name: string, size: { width: number; height: number }): Promise<void> {
  await page.screenshot({ path: path.join(shotsDir(), `${name}-${size.width}x${size.height}.png`) });
}

async function dialogueSnapshot(page: Page): Promise<Snapshot | null> {
  return page.evaluate(() => {
    const g = (window as unknown as { __PHASER_GAME__: PhaserGame }).__PHASER_GAME__;
    const gs = g.scene.getScene('GameScene') as { children: { getByName: (n: string) => { getData: (k: string) => unknown } | null } } | null;
    return (gs?.children.getByName('dialogue-root')?.getData('snapshot') as never) ?? null;
  });
}

async function waitForBeat(page: Page, beat: number): Promise<Snapshot> {
  await page.waitForFunction(
    (n) => {
      const g = (window as unknown as { __PHASER_GAME__: PhaserGame }).__PHASER_GAME__;
      const gs = g.scene.getScene('GameScene') as { children: { getByName: (n: string) => { getData: (k: string) => { beat: number } } | null } } | null;
      return gs?.children.getByName('dialogue-root')?.getData('snapshot')?.beat === n;
    },
    beat,
    { timeout: 10_000 },
  );
  await page.waitForTimeout(350);
  return (await dialogueSnapshot(page))!;
}

interface Booted {
  before: { coins: number };
  external: string[];
  supabaseSeen: string[];
}

/**
 * Boot the game into a first-time player's shelter at `size`, with one animal
 * in it and every Supabase request answered here.
 */
async function bootShelter(page: Page, size: { width: number; height: number }): Promise<Booted> {
  // ── Keep everything on the machine ──
  const external: string[] = [];
  const supabaseSeen: string[] = [];
  await page.route(
    (url) => url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in'),
    async (route) => {
      const url = route.request().url();
      supabaseSeen.push(`${route.request().method()} ${new URL(url).pathname}`);
      if (url.includes('/functions/v1/load-game')) {
        // A first-time player: no save, no stats.
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ save: null }) });
      } else {
        await route.abort('blockedbyclient');
      }
    },
  );
  // The game's music and effects are off for this run. The music tracks decode
  // to about half a gigabyte in the page, and nothing here listens to them.
  // (Recorded voice lines live under /assets/voice/ and are not touched.)
  await page.route(/\/assets\/audio\/.*\.(mp3|ogg|wav)(\?.*)?$/, (route) => route.abort());
  page.on('request', (req) => {
    const u = new URL(req.url());
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.protocol === 'data:' || u.protocol === 'blob:';
    // Web fonts carry no player data; everything else off the machine is reported.
    const font = u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com';
    if (!local && !font && !u.hostname.endsWith('.supabase.co')) external.push(req.url());
  });

  // ── A fake session, past the login gate and the intro ──
  await page.addInitScript(() => {
    localStorage.setItem('arc_session', JSON.stringify({
      userId: '00000000-0000-0000-0000-000000000001',
      username: 'TestKid',
      avatarEmoji: '🦊',
      avatarBgColour: '#BAE1FF',
      joinCode: 'TEST-0001',
      token: 'playwright-fake-token',
    }));
    localStorage.setItem('arc_skip_intro', 'true');
    localStorage.setItem('arc_intro_played', '1');
  });

  await page.setViewportSize(size);
  await page.goto('/');
  await waitForGameReady(page);
  await page.waitForTimeout(1500);

  // GameScene, the way ux-review gets there.
  await page.evaluate(() => {
    const g = (window as unknown as { __PHASER_GAME__: PhaserGame }).__PHASER_GAME__;
    for (const s of g.scene.scenes) {
      if (s.sys.settings.active) { try { g.scene.stop(s.sys.settings.key); } catch { /* ignore */ } }
    }
    g.scene.start('GameScene');
  });
  await waitForScene(page, 'GameScene');
  await page.waitForTimeout(2500);

  // A new shelter greets its player with an arrival popup. Dismiss it the way a
  // player would, so the adoption happens on a clear screen.
  const arrival = page.frameLocator('iframe[aria-label="A.R.C. arrival"]');
  const gentle = arrival.getByText('Give them space');
  if (await gentle.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true, () => false)) {
    await gentle.click();
    await page.waitForFunction(() => !document.querySelector('iframe[aria-label="A.R.C. arrival"]'), null, { timeout: 5_000 });
  }

  // A shelter with one animal in it, and no earlier adoptions.
  const before = await page.evaluate((animal) => {
    const g = (window as unknown as { __PHASER_GAME__: PhaserGame }).__PHASER_GAME__;
    const gs = g.scene.getScene('GameScene') as { store: { animals: unknown[]; rehomed: unknown[]; economy: { coins: number } } };
    gs.store.animals = [animal];
    gs.store.rehomed = [];
    return { coins: gs.store.economy.coins };
  }, ANIMAL);

  return { before, external, supabaseSeen };
}

/** Open the picker for the seeded animal and tap the first family card. */
async function pickFirstFamily(page: Page): Promise<void> {
  await page.evaluate((animal) => {
    const g = (window as unknown as { __PHASER_GAME__: PhaserGame }).__PHASER_GAME__;
    const gs = g.scene.getScene('GameScene') as { openAdoptionMatchOverlay: (a: unknown) => void; store: { animals: unknown[] } };
    gs.openAdoptionMatchOverlay(gs.store.animals[0] ?? animal);
  }, ANIMAL);
  await waitForScene(page, 'AdoptionMatchScene');
  await page.waitForTimeout(1200);
  await tapFirstCard(page);
}

async function tapFirstCard(page: Page): Promise<void> {
  // Each card is an invisible interactive rectangle added in order, and the
  // "not yet" button's is added last, so the cards are all but the last. (At
  // 844x390 the cards are squashed to a strip, so no size test finds them.)
  const card = await page.evaluate(() => {
    const g = (window as unknown as { __PHASER_GAME__: PhaserGame }).__PHASER_GAME__;
    const sc = g.scene.getScene('AdoptionMatchScene') as unknown as {
      container: { list: Array<{ type: string; input?: { enabled: boolean }; getBounds: () => { x: number; y: number; width: number; height: number } }> };
    };
    const hits = sc.container.list
      .filter((o) => o.type === 'Rectangle' && o.input?.enabled)
      .map((o) => o.getBounds());
    const cards = hits.slice(0, -1);
    return cards.length ? { x: cards[0].x + cards[0].width / 2, y: cards[0].y + cards[0].height / 2, n: cards.length } : null;
  });
  expect(card, 'the picker offers family cards').not.toBeNull();
  expect(card!.n).toBe(3);
  await page.mouse.click(card!.x, card!.y);
}

test.use({ deviceScaleFactor: 1 });

for (const size of [PHONE, TABLET]) {
test(`plays one real adoption at ${size.width}x${size.height}: match, hand-over, ceremony, commit`, async ({ page }) => {
  test.setTimeout(180_000);

  const { before, external, supabaseSeen } = await bootShelter(page, size);
  await shoot(page, '00-shelter', size);

  // ── Match: the picker ──
  await page.evaluate((animal) => {
    const g = (window as unknown as { __PHASER_GAME__: PhaserGame }).__PHASER_GAME__;
    const gs = g.scene.getScene('GameScene') as { openAdoptionMatchOverlay: (a: unknown) => void; store: { animals: unknown[] } };
    gs.openAdoptionMatchOverlay(gs.store.animals[0] ?? animal);
  }, ANIMAL);
  await waitForScene(page, 'AdoptionMatchScene');
  await page.waitForTimeout(1200);
  await shoot(page, '01-match', size);
  await tapFirstCard(page);

  // ── Hand-over: four beats ──
  const seen: Snapshot[] = [];
  for (let beat = 0; beat < 4; beat++) {
    const s = await waitForBeat(page, beat);
    seen.push(s);
    await shoot(page, `02-handover-beat${beat + 1}`, size);
    await page.mouse.click(s.box.x + s.box.w / 2, s.box.y + 30);
  }
  expect(seen.map((s) => s.side)).toEqual(['left', 'right', 'left', 'right']);
  expect(seen.map((s) => s.role)).toEqual(['warden', 'guest', 'warden', 'guest']);
  // The four lines of 121A: no animal's name anywhere in them, the same words
  // that are recorded, and Marnie, the one name, drawn as a person.
  expect(seen.map((s) => s.text)).toEqual([
    'Meet our little friend! This one has been hoping for the perfect home.',
    "Hello, little one! We've come all this way to meet you.",
    "Look after them for us, won't you?",
    'Thank you, Marnie! We promise to love them forever.',
  ]);
  expect(seen.some((s) => s.text.includes('Pumpkin'))).toBe(false);
  expect(seen.flatMap((s) => s.words).some((w) => w.kind === 'animal')).toBe(false);
  expect(seen[3].words.filter((w) => w.kind === 'person').map((w) => w.text.replace(/[^A-Za-z]/g, ''))).toEqual(['Marnie']);

  // ── Ceremony: the painted overlay ──
  const frame = page.frameLocator('iframe[aria-label="A.R.C. adoption"]');
  await expect(frame.locator('#wave-btn')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1200);
  expect(await dialogueSnapshot(page), 'the dialogue is gone once the ceremony is up').toBeNull();
  await shoot(page, '03-ceremony', size);

  // ── Commit ──
  await frame.locator('#wave-btn').click();
  await page.waitForFunction(() => !document.querySelector('iframe[aria-label="A.R.C. adoption"]'), null, { timeout: 10_000 });
  // Read the shelter before anything resizes: a restart of an empty shelter
  // welcomes a new arrival, which would muddy the count.
  const after = await page.evaluate(() => {
    const g = (window as unknown as { __PHASER_GAME__: PhaserGame }).__PHASER_GAME__;
    const gs = g.scene.getScene('GameScene') as { store: { animals: unknown[]; rehomed: Array<{ animalName: string; householdId: string }>; economy: { coins: number } } };
    return {
      animals: gs.store.animals.length,
      rehomed: gs.store.rehomed.map((r) => ({ name: r.animalName, household: r.householdId })),
      coins: gs.store.economy.coins,
    };
  });
  expect(after.animals).toBe(0);
  expect(after.rehomed).toHaveLength(1);
  expect(after.rehomed[0].name).toBe('Pumpkin');
  expect(after.coins).toBeGreaterThan(before.coins);

  await page.waitForTimeout(700);
  await shoot(page, '04-adopted', size);


  // Nothing went anywhere it should not have.
  expect(external, 'requests to anything but the machine and web fonts').toEqual([]);
  console.log(`[adoption-handover ${size.width}x${size.height}] Supabase requests answered here, none sent: ${supabaseSeen.join(', ') || 'none'}`);
});
}

test('a window resize mid-conversation keeps the conversation, and the adoption goes on', async ({ page }) => {
  test.setTimeout(120_000);
  await bootShelter(page, PHONE);
  await pickFirstFamily(page);

  await waitForBeat(page, 0);
  let s = (await dialogueSnapshot(page))!;
  await page.mouse.click(s.box.x + s.box.w / 2, s.box.y + 30);
  s = await waitForBeat(page, 1);
  expect(s.viewport.w).toBe(PHONE.width);

  // Turn the "phone" into an iPad half way through a sentence. GameScene used
  // to restart on this, which destroyed the dialogue and dropped the adoption.
  await page.setViewportSize(TABLET);
  await page.waitForTimeout(1200);
  const after = await dialogueSnapshot(page);
  expect(after, 'the conversation survives the resize').not.toBeNull();
  expect(after!.beat).toBe(1);
  expect(after!.viewport).toEqual({ w: TABLET.width, h: TABLET.height });
  // And it laid itself out again for the new size: the speaker is 55-65% tall.
  expect(after!.portrait.h / TABLET.height).toBeGreaterThanOrEqual(0.55);
  expect(after!.portrait.h / TABLET.height).toBeLessThanOrEqual(0.65);

  // It still leads to the ceremony.
  for (let beat = 1; beat < 4; beat++) {
    const cur = (await dialogueSnapshot(page))!;
    await page.mouse.click(cur.box.x + cur.box.w / 2, cur.box.y + 30);
    if (beat < 3) await waitForBeat(page, beat + 1);
  }
  await expect(page.frameLocator('iframe[aria-label="A.R.C. adoption"]').locator('#wave-btn')).toBeVisible({ timeout: 15_000 });
});

test.describe('recorded voice lines', () => {
  const TONE = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/tone-3s.mp3'));
  // Marnie's two lines are "recorded". The household's are not.
  const RECORDED = ['handover-warden-1', 'handover-warden-3'];

  async function playing(page: Page): Promise<string[]> {
    return page.evaluate(() => {
      const g = (window as unknown as { __PHASER_GAME__: { sound: { sounds: Array<{ key: string; isPlaying: boolean }> } } }).__PHASER_GAME__;
      return g.sound.sounds.filter((s) => s.key.startsWith('voice:') && s.isPlaying).map((s) => s.key);
    });
  }

  async function withRecordings(page: Page): Promise<void> {
    // The manifest says which lines have shipped; add two that "have".
    await page.route('**/asset-manifest.json', async (route) => {
      const res = await route.fetch();
      const list = (await res.json()) as string[];
      await route.fulfill({ response: res, json: [...list, ...RECORDED.map((id) => `assets/voice/${id}.mp3`)] });
    });
    await page.route('**/assets/voice/*.mp3', (route) =>
      route.fulfill({ status: 200, contentType: 'audio/mpeg', body: TONE }));
  }

  test('plays a line that has a recording, stays silent on one that has not, and moving on or SKIP stops it', async ({ page }) => {
    test.setTimeout(120_000);
    await withRecordings(page);
    await bootShelter(page, PHONE);
    await pickFirstFamily(page);

    // Beat 1: Marnie, recorded. It plays.
    let s = await waitForBeat(page, 0);
    expect(s.lineId).toBe('handover-warden-1');
    await expect.poll(() => playing(page), { timeout: 8_000 }).toEqual(['voice:handover-warden-1']);

    // Beat 2: the household, not recorded. Moving on stops Marnie, and nothing plays.
    await page.mouse.click(s.box.x + s.box.w / 2, s.box.y + 30);
    s = await waitForBeat(page, 1);
    expect(s.lineId).toMatch(/^handover-[a-z0-9-]+-2$/);
    expect(await playing(page)).toEqual([]);

    // Beat 3: Marnie again, recorded.
    await page.mouse.click(s.box.x + s.box.w / 2, s.box.y + 30);
    s = await waitForBeat(page, 2);
    expect(s.lineId).toBe('handover-warden-3');
    await expect.poll(() => playing(page), { timeout: 8_000 }).toEqual(['voice:handover-warden-3']);

    // SKIP ends the conversation and the line with it.
    await page.mouse.click(s.skip.x + s.skip.w / 2, s.skip.y + s.skip.h / 2);
    await expect(page.frameLocator('iframe[aria-label="A.R.C. adoption"]').locator('#wave-btn')).toBeVisible({ timeout: 15_000 });
    expect(await playing(page)).toEqual([]);
  });

  test('is silent, and the conversation still works, when the effects are turned off', async ({ page }) => {
    test.setTimeout(120_000);
    await withRecordings(page);
    await page.addInitScript(() => {
      localStorage.setItem('arc-audio-prefs', JSON.stringify({ sfxEnabled: false, musicEnabled: false }));
    });
    await bootShelter(page, PHONE);
    await pickFirstFamily(page);
    const s = await waitForBeat(page, 0);
    expect(s.lineId).toBe('handover-warden-1');
    await page.waitForTimeout(1500);
    expect(await playing(page)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The match picker and the ceremony on every landscape screen (124A)
//
// The picker was one column sized for a tablet: at 844x390 its cards collapsed
// to a strip with their text printed across each other, and the ceremony's two
// buttons were pinned over its scroll text. These checks are on what is drawn,
// read back from the running game: no two things overlap, nothing runs off the
// screen or is cut at its top, and every tap target is 44px or more.
//
// The sizes are the sideways phones the game ships on (667x375 iPhone SE,
// 844x390 iPhone 13, 852x393 iPhone 15, 932x430 iPhone Pro Max) and the two
// iPads it must keep right (1024x768, 1180x820).
// ─────────────────────────────────────────────────────────────────────────────

const LANDSCAPE_SIZES = [
  { width: 667, height: 375, mode: 'rows' },
  { width: 844, height: 390, mode: 'rows' },
  { width: 852, height: 393, mode: 'rows' },
  { width: 932, height: 430, mode: 'rows' },
  { width: 1024, height: 768, mode: 'columns' },
  { width: 1180, height: 820, mode: 'columns' },
] as const;

/** 44px: Apple's minimum for a touch target, and a little under the game's own MIN_TAP of 48. */
const MIN_TAP_PX = 44;

/** Animals whose offers differ (different species take different households, with different blurbs and names). */
const PICKER_ANIMALS = [
  { ...ANIMAL, id: 'e2e-barnaby', name: 'Barnaby', species: 'dog', variant: 'beagle' },
  { ...ANIMAL, id: 'e2e-clementine', name: 'Clementine', species: 'bunny', variant: 'lop' },
  { ...ANIMAL, id: 'e2e-kiwi', name: 'Kiwi', species: 'parrot', variant: 'budgie' },
  { ...ANIMAL, id: 'e2e-noodle', name: 'Noodle', species: 'snake', variant: 'corn' },
  // The seeded cat goes last and is left open: the test then picks a family from her offer and plays on to the ceremony.
  ANIMAL,
];

interface PickerSnapshot {
  viewport: { w: number; h: number };
  layout: {
    mode: string;
    header: Rect; polaroid: Rect; notYet: Rect;
    cards: Array<{ rect: Rect; portrait: Rect; sticker: Rect; name: Rect; text: Rect }>;
  };
  texts: Array<{ name: string; text: string; font: number; x: number; y: number; w: number; h: number }>;
  hits: Array<{ name: string; x: number; y: number; w: number; h: number }>;
}

/** What the picker actually drew: every Text's bounds and every tap target's, plus the layout it was drawn from. */
async function pickerSnapshot(page: Page): Promise<PickerSnapshot> {
  return page.evaluate(() => {
    const g = (window as unknown as { __PHASER_GAME__: PhaserGame }).__PHASER_GAME__;
    type Obj = {
      type: string; name: string; text?: string; style?: { fontSize: string };
      input?: { enabled: boolean };
      getBounds: () => { x: number; y: number; width: number; height: number };
    };
    const sc = g.scene.getScene('AdoptionMatchScene') as unknown as {
      scale: { width: number; height: number };
      container: { list: Obj[]; getData: (k: string) => unknown };
    };
    const list = sc.container.list;
    const texts = list.filter((o) => o.type === 'Text').map((o) => {
      const b = o.getBounds();
      return { name: o.name, text: o.text ?? '', font: Number.parseFloat(o.style?.fontSize ?? '0'), x: b.x, y: b.y, w: b.width, h: b.height };
    });
    const hits = list.filter((o) => o.type === 'Rectangle' && o.input?.enabled).map((o) => {
      const b = o.getBounds();
      return { name: o.name, x: b.x, y: b.y, w: b.width, h: b.height };
    });
    return { viewport: { w: sc.scale.width, h: sc.scale.height }, layout: sc.container.getData('layout') as never, texts, hits };
  });
}

const rectOf = (o: { x: number; y: number; w: number; h: number }): Rect => ({ x: o.x, y: o.y, w: o.w, h: o.h });
const overlapDepth = (a: Rect, b: Rect): number =>
  Math.min(a.x + a.w - b.x, b.x + b.w - a.x, a.y + a.h - b.y, b.y + b.h - a.y);
const inside = (inner: Rect, outer: Rect, tol: number): boolean =>
  inner.x >= outer.x - tol && inner.y >= outer.y - tol &&
  inner.x + inner.w <= outer.x + outer.w + tol && inner.y + inner.h <= outer.y + outer.h + tol;

/** Every check on one drawing of the picker. Returns the smallest type it used. */
function checkPicker(s: PickerSnapshot, size: { width: number; height: number }, label: string): number {
  const screen: Rect = { x: 0, y: 0, w: size.width, h: size.height };
  expect(s.viewport, `${label}: the scene is the size of the screen`).toEqual({ w: size.width, h: size.height });
  const L = s.layout;

  // ── Tap targets: the cards and the way out ──
  expect(s.hits.length, `${label}: one tap target per card, and the way out`).toBe(L.cards.length + 1);
  for (const h of s.hits) {
    expect(h.w, `${label}: ${h.name} is wide enough to tap`).toBeGreaterThanOrEqual(MIN_TAP_PX);
    expect(h.h, `${label}: ${h.name} is tall enough to tap`).toBeGreaterThanOrEqual(MIN_TAP_PX);
    expect(inside(rectOf(h), screen, 0.5), `${label}: ${h.name} is on the screen`).toBe(true);
  }
  for (let a = 0; a < s.hits.length; a++) {
    for (let b = a + 1; b < s.hits.length; b++) {
      expect(overlapDepth(rectOf(s.hits[a]), rectOf(s.hits[b])), `${label}: ${s.hits[a].name} and ${s.hits[b].name} are apart`).toBeLessThanOrEqual(-8);
    }
  }
  // What was drawn is what the layout said.
  L.cards.forEach((c, i) => {
    const hit = s.hits.find((h) => h.name === `picker-card-hit:${i}`)!;
    expect(hit, `${label}: card ${i} has a tap target`).toBeDefined();
    expect(Math.abs(hit.x - c.rect.x) + Math.abs(hit.y - c.rect.y) + Math.abs(hit.w - c.rect.w) + Math.abs(hit.h - c.rect.h)).toBeLessThan(2);
  });

  // ── The big blocks: header, animal, cards, the way out ──
  const blocks: Array<[string, Rect]> = [['header', L.header], ['animal', L.polaroid], ['way out', L.notYet], ...L.cards.map((c, i) => [`card ${i}`, c.rect] as [string, Rect])];
  for (const [n, r] of blocks) expect(inside(r, screen, 0.5), `${label}: ${n} is on the screen`).toBe(true);
  for (let a = 0; a < blocks.length; a++) {
    for (let b = a + 1; b < blocks.length; b++) {
      expect(overlapDepth(blocks[a][1], blocks[b][1]), `${label}: ${blocks[a][0]} and ${blocks[b][0]} do not touch`).toBeLessThanOrEqual(0);
    }
  }

  // ── Text: on the screen, in its own box, clear of every other piece ──
  const ownerOf = (name: string): Rect | null => {
    const card = name.match(/^picker-card-[a-z]+:(\d+)/);
    if (card) return L.cards[Number(card[1])].rect;
    if (name === 'picker-title' || name === 'picker-subtitle') return L.header;
    if (name.startsWith('picker-animal')) return L.polaroid;
    if (name === 'picker-notyet-label') return L.notYet;
    return null;
  };
  for (const t of s.texts) {
    expect(inside(rectOf(t), screen, 0.5), `${label}: "${t.text}" is on the screen`).toBe(true);
    const owner = ownerOf(t.name);
    if (owner) expect(inside(rectOf(t), owner, 1), `${label}: "${t.text}" stays inside its box`).toBe(true);
    expect(t.font, `${label}: "${t.text}" is not drawn below 14px`).toBeGreaterThanOrEqual(14);
  }
  for (let a = 0; a < s.texts.length; a++) {
    for (let b = a + 1; b < s.texts.length; b++) {
      expect(
        overlapDepth(rectOf(s.texts[a]), rectOf(s.texts[b])),
        `${label}: "${s.texts[a].text}" and "${s.texts[b].text}" do not run over each other`,
      ).toBeLessThanOrEqual(2);
    }
  }
  L.cards.forEach((c, i) => {
    for (const t of s.texts.filter((x) => new RegExp(`^picker-card-(name|blurb|reason):${i}`).test(x.name))) {
      expect(overlapDepth(rectOf(t), c.portrait), `${label}: card ${i}: "${t.text}" is clear of the portrait`).toBeLessThanOrEqual(0);
    }
    const pill = s.texts.find((x) => x.name === `picker-card-sticker:${i}`)!;
    expect(inside(rectOf(pill), c.sticker, 1), `${label}: card ${i}'s pill holds its words`).toBe(true);
    // A card says who they are and what they offer.
    expect(s.texts.some((x) => x.name === `picker-card-name:${i}`), `${label}: card ${i} has a name`).toBe(true);
    expect(s.texts.some((x) => x.name === `picker-card-blurb:${i}`), `${label}: card ${i} has a blurb`).toBe(true);
  });
  return Math.min(...s.texts.map((t) => t.font));
}

/** Everything the ceremony page is made of, measured in its own document. Run in the iframe. */
function ceremonyProbe() {
  const q = (sel: string) => document.querySelector<HTMLElement>(sel)!;
  const rect = (el: Element) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
  const parts = (): Record<string, HTMLElement> => ({
    title: q('#adopt-title'), subtitle: q('#adopt-subtitle'),
    animal: document.querySelectorAll<HTMLElement>('.portrait-frame')[0],
    connector: q('.meet-connector'),
    family: document.querySelectorAll<HTMLElement>('.portrait-frame')[1],
    scroll: q('.scroll-card'), gifts: q('.gifts-panel'), wave: q('#wave-btn'), notYet: q('#not-yet-btn'),
  });
  const measure = () => Object.fromEntries(Object.entries(parts()).map(([k, el]) => [k, rect(el)]));
  // The plaque, the scroll, the gifts and the button are each tilted a degree or two, which
  // swells their bounding boxes. Measure once as drawn, and once laid out flat.
  const tilted = measure();
  const flatten = document.createElement('style');
  flatten.textContent = '*{transform:none!important;animation:none!important}';
  document.head.appendChild(flatten);
  const flat = measure();
  const plaque = rect(q('.adopt-plaque'));
  flatten.remove();
  const adopt = q('.adopt');
  return {
    viewport: { w: innerWidth, h: innerHeight },
    tilted, flat, plaque,
    scrollable: adopt.scrollHeight - adopt.clientHeight,
    tapTargets: { wave: [q('#wave-btn').offsetWidth, q('#wave-btn').offsetHeight], notYet: [q('#not-yet-btn').offsetWidth, q('#not-yet-btn').offsetHeight] },
    // A label wider than its button is text running out of it.
    labelsFit: { wave: q('#wave-btn').scrollWidth <= q('#wave-btn').clientWidth + 1, notYet: q('#not-yet-btn').scrollWidth <= q('#not-yet-btn').clientWidth + 1 },
    scrollTextFits: q('.scroll-card').scrollHeight <= q('.scroll-card').clientHeight + 1,
    title: q('#adopt-title').textContent, subtitle: q('#adopt-subtitle').textContent,
  };
}

function checkCeremony(c: ReturnType<typeof ceremonyProbe>, size: { width: number; height: number }, label: string): void {
  const screen: Rect = { x: 0, y: 0, w: size.width, h: size.height };
  expect(c.viewport, `${label}: the page is the size of the screen`).toEqual({ w: size.width, h: size.height });

  // Nothing is cut off at the top, the sides or the bottom, and there is nothing to scroll to.
  for (const [name, r] of Object.entries(c.tilted)) {
    expect(inside(r, screen, 0.5), `${label}: ${name} is wholly on the screen (top ${r.y.toFixed(1)}, bottom ${(r.y + r.h).toFixed(1)} of ${size.height})`).toBe(true);
  }
  expect(inside(c.plaque, screen, 12), `${label}: the plaque is on the screen`).toBe(true);
  expect(c.scrollable, `${label}: the screen has nothing hidden below it`).toBeLessThanOrEqual(1);

  // Nothing overlaps anything: laid out flat, no two of its parts touch...
  const names = Object.keys(c.flat);
  for (let a = 0; a < names.length; a++) {
    for (let b = a + 1; b < names.length; b++) {
      expect(overlapDepth(c.flat[names[a]], c.flat[names[b]]), `${label}: ${names[a]} and ${names[b]} do not touch`).toBeLessThanOrEqual(0.5);
    }
  }
  // ...and with the tilts put back, none runs more than 4px into another.
  for (let a = 0; a < names.length; a++) {
    for (let b = a + 1; b < names.length; b++) {
      expect(overlapDepth(c.tilted[names[a]], c.tilted[names[b]]), `${label}: tilted, ${names[a]} and ${names[b]}`).toBeLessThanOrEqual(4);
    }
  }
  // The story is inside its plaque.
  for (const part of ['title', 'subtitle', 'animal', 'connector', 'family', 'scroll']) {
    expect(inside(c.flat[part], c.plaque, 14), `${label}: ${part} is inside the plaque`).toBe(true);
  }

  // The two buttons are big enough to tap, and say their words inside themselves.
  for (const [name, [w, h]] of Object.entries(c.tapTargets)) {
    expect(w, `${label}: ${name} is wide enough to tap`).toBeGreaterThanOrEqual(MIN_TAP_PX);
    expect(h, `${label}: ${name} is tall enough to tap`).toBeGreaterThanOrEqual(MIN_TAP_PX);
  }
  expect(c.labelsFit, `${label}: the labels stay inside their buttons`).toEqual({ wave: true, notYet: true });
  expect(c.scrollTextFits, `${label}: the scroll holds all its words`).toBe(true);
}

for (const size of LANDSCAPE_SIZES) {
  test(`the picker and the ceremony hold together at ${size.width}x${size.height}: nothing overlaps, nothing is cut off, every tap is 44px`, async ({ page }) => {
    test.setTimeout(240_000);
    await bootShelter(page, size);

    // ── The picker, for animals whose offers differ ──
    let smallest = Infinity;
    const offers: string[] = [];
    for (const [i, animal] of PICKER_ANIMALS.entries()) {
      await page.evaluate((a) => {
        const g = (window as unknown as { __PHASER_GAME__: PhaserGame }).__PHASER_GAME__;
        const gs = g.scene.getScene('GameScene') as { openAdoptionMatchOverlay: (a: unknown) => void; store: { animals: unknown[] } };
        gs.store.animals = [a];
        gs.openAdoptionMatchOverlay(a);
      }, animal);
      await waitForScene(page, 'AdoptionMatchScene');
      await page.waitForTimeout(1100);
      const snap = await pickerSnapshot(page);
      expect(snap.layout.mode, `${animal.species}: the arrangement for ${size.width}x${size.height}`).toBe(size.mode);
      // Three families on offer, or fewer when fewer households take that species (two take a bunny).
      expect(snap.layout.cards.length, `${animal.species}: families on offer`).toBeGreaterThanOrEqual(1);
      expect(snap.layout.cards.length, `${animal.species}: families on offer`).toBeLessThanOrEqual(3);
      offers.push(`${animal.species}:${snap.layout.cards.length}`);
      smallest = Math.min(smallest, checkPicker(snap, size, `${animal.species} at ${size.width}x${size.height}`));
      if (i === 1) await shoot(page, '01-picker-bunny', size);
      if (i === PICKER_ANIMALS.length - 1) await shoot(page, '01-picker', size);
      if (i < PICKER_ANIMALS.length - 1) {
        // Back out the way a child would: "Not yet".
        const way = snap.hits.find((h) => h.name === 'picker-notyet-hit')!;
        await page.mouse.click(way.x + way.w / 2, way.y + way.h / 2);
        await page.waitForFunction(() => {
          const g = (window as unknown as { __PHASER_GAME__: PhaserGame }).__PHASER_GAME__;
          return !g.scene.scenes.some((sc) => sc.sys.settings.active && sc.sys.settings.key === 'AdoptionMatchScene');
        }, null, { timeout: 5_000 });
        await page.waitForTimeout(300);
      }
    }
    console.log(`[picker ${size.width}x${size.height}] families offered ${offers.join(' ')}; smallest type on any card: ${smallest}px`);

    // ── Pick a family, listen to the conversation, and come to the ceremony ──
    await tapFirstCard(page);
    for (let beat = 0; beat < 4; beat++) {
      const s = await waitForBeat(page, beat);
      await page.mouse.click(s.box.x + s.box.w / 2, s.box.y + 30);
    }
    const frame = page.frameLocator('iframe[aria-label="A.R.C. adoption"]');
    await expect(frame.locator('#wave-btn')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1500);
    await shoot(page, '03-ceremony', size);

    const adoptionFrame = page.frames().find((f) => f.url().includes('/admin/adoption.html'))!;
    checkCeremony(await adoptionFrame.evaluate(ceremonyProbe), size, `the ceremony at ${size.width}x${size.height}`);

    // "WAVE THEM OFF!" is where the picture says it is: tapping its middle commits the adoption.
    const wave = await frame.locator('#wave-btn').boundingBox();
    await page.mouse.click(wave!.x + wave!.width / 2, wave!.y + wave!.height / 2);
    await page.waitForFunction(() => !document.querySelector('iframe[aria-label="A.R.C. adoption"]'), null, { timeout: 10_000 });
  });
}

test.describe('the ceremony with the longest words the game has', () => {
  // The longest household name (26 letters), the longest animal name (10), and a long child's name.
  const WORDS = {
    animalName: 'Clementine', animalSpriteSrc: '/assets/animals/bunny-sheltered.png',
    householdName: "Sunnybrook Children's Home", householdAvatarSrc: '/admin/scene-assets/cast/26-aisha-childrens-home.png',
    playerName: 'Maximilian-Alexander',
  };

  test('still fits, with nothing hidden, on every landscape screen', async ({ page }) => {
    test.setTimeout(120_000);
    for (const size of LANDSCAPE_SIZES) {
      await page.setViewportSize(size);
      await page.goto('/admin/adoption.html?embed=1');
      await page.evaluate((payload) => window.postMessage({ source: 'arc-game-host', type: 'init', payload }, '*'), WORDS);
      await expect(page.locator('#adopt-title')).toHaveText('A forever home for Clementine');
      await page.waitForTimeout(900);
      await shoot(page, '03-ceremony-longest', size);
      const probe = await page.evaluate(ceremonyProbe);
      expect(probe.subtitle).toContain("Sunnybrook Children's Home");
      checkCeremony(probe, size, `the ceremony, longest words, at ${size.width}x${size.height}`);
    }
  });
});
