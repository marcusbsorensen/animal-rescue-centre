import { test, expect, type Page } from '@playwright/test';

/**
 * The adoption dialogue, judged on the dev demo (`?dialogueDemo=1`) at the two
 * sizes that matter: a phone held sideways (844x390) and an iPad (1024x768).
 *
 * What it checks, against the reference (docs/adoption-dialogue-presentation-
 * 2026-05-19.md) and Marcus's 2026-10-14 polish decisions:
 *   - the speaker is 55-65% of the screen's height and is never covered, not by
 *     the box, and not by the reply pills on a choice beat;
 *   - the warden's name pill is honey-amber and a guest's is soft blue, and the
 *     colours are what is actually painted, not only what the code says;
 *   - animal names in the text are green and person names are amber, in the
 *     pixels;
 *   - the world sits behind a pale mist, not a dark dim.
 *
 * The runner publishes what it drew as numbers on its root container
 * (`dialogue-root`, data `snapshot`); the rects and colours below come from
 * there, and the pixel checks look at a real screenshot at those places.
 *
 *   ARC_E2E_BASE_URL=http://localhost:5173 ARC_BROWSER_CHANNEL=chrome \
 *     pnpm --filter @arc/game exec playwright test e2e/dialogue-demo.spec.ts
 */

interface Rect { x: number; y: number; w: number; h: number }
interface Snapshot {
  beat: number;
  beatCount: number;
  viewport: { w: number; h: number };
  side: 'left' | 'right';
  role: 'warden' | 'guest';
  text: string;
  portrait: Rect;
  portraitIsImage: boolean;
  box: Rect;
  namePill: Rect & { fill: number; dashed: number; ink: string };
  skip: Rect;
  choices: Rect[];
  words: Array<{ text: string; kind: 'animal' | 'person' | null; colour: string; rect: Rect }>;
  voice: string | null;
}

// The dev server reloads the page whenever any file it serves changes (other
// sessions edit public/ while this runs), which restarts the demo mid-test.
// A reload is not a failure of the dialogue; run the test again.
test.describe.configure({ retries: 2 });

const VIEWPORTS = [
  { name: 'phone 844x390', width: 844, height: 390 },
  { name: 'tablet 1024x768', width: 1024, height: 768 },
];

const AMBER = 0xe3b04b;     // the warden's pill
const SOFT_BLUE = 0xa9d3ea; // a guest's pill
const GREEN = 0x2d6b1f;     // animal names
const DEEP_AMBER = 0x8f5a00; // person names

async function openDemo(page: Page, query = ''): Promise<void> {
  await page.goto(`/?dialogueDemo=1${query}`);
  await page.waitForFunction(
    () => {
      const g = (window as unknown as { __PHASER_GAME__?: { scene: { getScene: (k: string) => { children?: { getByName: (n: string) => { getData: (k: string) => unknown } | null } } | null } } }).__PHASER_GAME__;
      return !!g?.scene.getScene('DialogueDemoScene')?.children?.getByName('dialogue-root')?.getData('snapshot');
    },
    null,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(500);
}

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const g = (window as unknown as { __PHASER_GAME__: { scene: { getScene: (k: string) => { children: { getByName: (n: string) => { getData: (k: string) => unknown } } } } } }).__PHASER_GAME__;
    return g.scene.getScene('DialogueDemoScene').children.getByName('dialogue-root').getData('snapshot') as never;
  });
}

/** Tap the box (a linear beat) or the first reply (a choice beat), then wait for the next beat. */
async function advance(page: Page): Promise<void> {
  const s = await snapshot(page);
  if (s.choices.length) {
    const c = s.choices[0];
    await page.mouse.click(c.x + c.w / 2, c.y + c.h / 2);
  } else {
    await page.mouse.click(s.box.x + s.box.w / 2, s.box.y + 30);
  }
  await page.waitForFunction(
    (was) => {
      const g = (window as unknown as { __PHASER_GAME__: { scene: { getScene: (k: string) => { children: { getByName: (n: string) => { getData: (k: string) => { beat: number } } | null } } } } }).__PHASER_GAME__;
      const root = g.scene.getScene('DialogueDemoScene').children.getByName('dialogue-root');
      return !root || root.getData('snapshot').beat !== was;
    },
    s.beat,
    { timeout: 5_000 },
  );
  await page.waitForTimeout(250);
}

type RGB = [number, number, number];

/** Read pixels from a screenshot, in the page, so no image library is needed. */
async function pixelsAt(page: Page, png: Buffer, pts: Array<[number, number]>): Promise<RGB[]> {
  return page.evaluate(
    async ([b64, points]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      return (points as Array<[number, number]>).map(([x, y]) => {
        const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
        return [d[0], d[1], d[2]] as [number, number, number];
      });
    },
    [png.toString('base64'), pts] as const,
  );
}

/** How many pixels in a rect are within `tol` (per channel) of a colour. */
async function countNear(page: Page, png: Buffer, r: Rect, colour: number, tol: number): Promise<number> {
  return page.evaluate(
    async ([b64, rect, rgb, t]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const rr = rect as { x: number; y: number; w: number; h: number };
      const d = ctx.getImageData(Math.floor(rr.x), Math.floor(rr.y), Math.ceil(rr.w), Math.ceil(rr.h)).data;
      const [R, G, B] = rgb as [number, number, number];
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (Math.abs(d[i] - R) <= (t as number) && Math.abs(d[i + 1] - G) <= (t as number) && Math.abs(d[i + 2] - B) <= (t as number)) n++;
      }
      return n;
    },
    [png.toString('base64'), r, [(colour >> 16) & 255, (colour >> 8) & 255, colour & 255], tol] as const,
  );
}

const near = (rgb: RGB, colour: number, tol: number): boolean =>
  Math.abs(rgb[0] - ((colour >> 16) & 255)) <= tol &&
  Math.abs(rgb[1] - ((colour >> 8) & 255)) <= tol &&
  Math.abs(rgb[2] - (colour & 255)) <= tol;

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

for (const vp of VIEWPORTS) {
  test.describe(`dialogue demo at ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });

    test('stands the speaker 55-65% tall and never covers them, on any beat', async ({ page }) => {
      await openDemo(page);
      for (let beat = 0; beat < 4; beat++) {
        const s = await snapshot(page);
        const share = s.portrait.h / vp.height;
        expect(share, `beat ${beat} portrait share`).toBeGreaterThanOrEqual(0.55);
        expect(share, `beat ${beat} portrait share`).toBeLessThanOrEqual(0.65);
        expect(s.portrait.x, `beat ${beat}`).toBeGreaterThanOrEqual(0);
        expect(s.portrait.x + s.portrait.w, `beat ${beat}`).toBeLessThanOrEqual(vp.width);
        expect(s.portrait.y, `beat ${beat}`).toBeGreaterThanOrEqual(0);
        expect(s.portraitIsImage, `beat ${beat} shows a picture, not initials`).toBe(true);
        // Nothing the runner drew over the speaker, apart from the name pill
        // and the box's top edge (which the speaker stands behind).
        for (const c of s.choices) expect(overlaps(c, s.portrait), `beat ${beat} reply pill over the speaker`).toBe(false);
        // The speaker is on the side the beat says.
        const mid = vp.width / 2;
        const cx = s.portrait.x + s.portrait.w / 2;
        if (s.side === 'left') expect(cx).toBeLessThan(mid);
        else expect(cx).toBeGreaterThan(mid);
        await page.screenshot({ path: test.info().outputPath(`beat-${beat + 1}.png`) });
        if (beat < 3) await advance(page);
      }
    });

    test('the choice pills sit on the far side, and the speaker is still visible under them', async ({ page }) => {
      await openDemo(page);
      await advance(page); // beat 2
      await advance(page); // beat 3: Marnie asks, two replies
      const s = await snapshot(page);
      expect(s.choices).toHaveLength(2);
      expect(s.side).toBe('left');
      for (const c of s.choices) {
        expect(overlaps(c, s.portrait)).toBe(false);
        expect(overlaps(c, s.box)).toBe(false);
        expect(c.x).toBeGreaterThanOrEqual(s.portrait.x + s.portrait.w);
      }
      // In the pixels: the part of the screen where Marnie's face is carries no
      // white reply pill. A pill is pure white; her picture and the mist are not.
      const png = await page.screenshot();
      const face: Rect = {
        x: s.portrait.x + s.portrait.w * 0.2,
        y: s.portrait.y + s.portrait.h * 0.05,
        w: s.portrait.w * 0.6,
        h: s.portrait.h * 0.4,
      };
      const white = await countNear(page, png, face, 0xffffff, 0);
      expect(white, 'pure-white pixels where the speaker\'s face is').toBeLessThan(face.w * face.h * 0.01);
    });

    test('the choice beat works from the guest side too, with the pills on the left', async ({ page }) => {
      await openDemo(page, '&choiceSide=right');
      await advance(page);
      await advance(page);
      const s = await snapshot(page);
      expect(s.side).toBe('right');
      expect(s.choices).toHaveLength(2);
      for (const c of s.choices) {
        expect(overlaps(c, s.portrait)).toBe(false);
        expect(c.x + c.w).toBeLessThanOrEqual(s.portrait.x);
      }
    });

    test('paints the warden amber and a guest soft blue, with the dashed border kept', async ({ page }) => {
      await openDemo(page);
      const warden = await snapshot(page);
      expect(warden.role).toBe('warden');
      expect(warden.namePill.fill).toBe(AMBER);
      let png = await page.screenshot();
      // Left of the name, inside the pill, clear of the dashes (which sit 5px in).
      const wp = warden.namePill;
      let [px] = await pixelsAt(page, png, [[wp.x + 11, wp.y + wp.h / 2]]);
      expect(near(px, AMBER, 12), `warden pill painted ${px}`).toBe(true);
      // The dashed border is drawn in a different, darker tone, along the top edge.
      const dashes = await countNear(page, png, { x: wp.x + 14, y: wp.y + 4, w: wp.w - 28, h: 3 }, warden.namePill.dashed, 40);
      expect(dashes, 'dashed border pixels along the top').toBeGreaterThan(8);

      await advance(page);
      const guest = await snapshot(page);
      expect(guest.role).toBe('guest');
      expect(guest.namePill.fill).toBe(SOFT_BLUE);
      png = await page.screenshot();
      const gp = guest.namePill;
      [px] = await pixelsAt(page, png, [[gp.x + 11, gp.y + gp.h / 2]]);
      expect(near(px, SOFT_BLUE, 12), `guest pill painted ${px}`).toBe(true);
      const guestDashes = await countNear(page, png, { x: gp.x + 14, y: gp.y + 4, w: gp.w - 28, h: 3 }, guest.namePill.dashed, 40);
      expect(guestDashes).toBeGreaterThan(8);
    });

    test('colours animal names green and person names amber, in the pixels', async ({ page }) => {
      await openDemo(page);
      // The hand-over's own lines say no animal's name (121A), so nothing in
      // them is green: beat 1 has no animal word at all.
      let s = await snapshot(page);
      expect(s.words.filter((w) => w.kind === 'animal'), 'beat 1 has no animal name').toEqual([]);
      expect(s.words.filter((w) => w.kind === 'person'), 'beat 1 names no person').toEqual([]);
      await advance(page);
      s = await snapshot(page);
      expect(s.words.filter((w) => w.kind !== null), 'beat 2 has no name at all').toEqual([]);

      // Beat 3 is the demo's own choice beat, which does name the animal, so the
      // runner's green is still judged where it is used.
      await advance(page);
      s = await snapshot(page);
      expect(s.beat).toBe(2);
      let png = await page.screenshot();
      const animals = s.words.filter((w) => w.kind === 'animal');
      expect(animals.map((w) => w.text.replace(/[^A-Za-z]/g, ''))).toEqual(['Pumpkin']);
      for (const w of animals) {
        expect(w.colour).toBe('#2d6b1f');
        expect(await countNear(page, png, w.rect, GREEN, 30), `"${w.text}" green pixels`).toBeGreaterThan(40);
      }
      // Plain words are navy, not green.
      const plain = s.words.find((w) => w.kind === null)!;
      expect(await countNear(page, png, plain.rect, GREEN, 30), 'a plain word has no green').toBeLessThan(6);

      // Beat 4: a person (Marnie, thanked by the guest), amber, and no animal.
      await advance(page);
      s = await snapshot(page);
      expect(s.beat).toBe(3);
      png = await page.screenshot();
      const person = s.words.find((w) => w.kind === 'person')!;
      expect(person.text).toContain('Marnie');
      expect(person.colour).toBe('#8f5a00');
      expect(await countNear(page, png, person.rect, DEEP_AMBER, 30), 'Marnie in amber').toBeGreaterThan(40);
      expect(await countNear(page, png, person.rect, GREEN, 30), 'Marnie is not green').toBeLessThan(6);
      expect(s.words.filter((w) => w.kind === 'animal'), 'beat 4 has no animal name').toEqual([]);
    });

    test('lays a pale mist over the world, not a dark dim', async ({ page }) => {
      await openDemo(page);
      const s = await snapshot(page);
      const png = await page.screenshot();
      // A strip across the top of the screen, well clear of the speaker and the box.
      const pts: Array<[number, number]> = [];
      for (let i = 1; i <= 12; i++) pts.push([vp.width * (0.3 + 0.4 * (i / 12)), 12 + (i % 3) * 8]);
      const px = await pixelsAt(page, png, pts);
      const lum = px.map(([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b);
      const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
      // The old dim put a dark 50% veil here (about 100); the mist leaves it pale.
      expect(mean, 'mean luminance of the sky strip').toBeGreaterThan(185);
      // And the real scene is still readable through it: not a flat white sheet.
      const spread = Math.max(...lum) - Math.min(...lum);
      expect(spread).toBeGreaterThan(0);
      expect(s.viewport).toEqual({ w: vp.width, h: vp.height });
    });

    test('tap advances, SKIP finishes, and nothing is left on screen', async ({ page }) => {
      await openDemo(page);
      await advance(page);
      const s = await snapshot(page);
      expect(s.beat).toBe(1);
      await page.mouse.click(s.skip.x + s.skip.w / 2, s.skip.y + s.skip.h / 2);
      await page.waitForFunction(() => {
        const g = (window as unknown as { __PHASER_GAME__: { scene: { getScene: (k: string) => { children: { getByName: (n: string) => unknown } } } } }).__PHASER_GAME__;
        const sc = g.scene.getScene('DialogueDemoScene');
        return !sc.children.getByName('dialogue-root') && !!sc.children.getByName('demo-complete');
      }, null, { timeout: 5_000 });
    });
  });
}

test.describe('dialogue portraits at 1024x768', () => {
  test.use({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 });

  test('crops a full-figure adopter to waist-up, and holds a crowd inside the screen', async ({ page }) => {
    // Priya, in her chair: the crop ends at the arm rests, not through the wheels.
    await openDemo(page);
    await advance(page);
    let s = await snapshot(page);
    expect(s.role).toBe('guest');
    const cropped = await page.evaluate(() => {
      type Img = { isCropped?: boolean };
      type Root = { getByName: (n: string) => Img | null };
      const g = (window as unknown as { __PHASER_GAME__: { scene: { getScene: (k: string) => { children: { getByName: (n: string) => Root } } } } }).__PHASER_GAME__;
      const root = g.scene.getScene('DialogueDemoScene').children.getByName('dialogue-root');
      const img = root.getByName('dialogue-portrait');
      return { found: !!img, isCropped: !!img?.isCropped };
    });
    expect(cropped.found).toBe(true);
    expect(cropped.isCropped).toBe(true);

    // A whole train of children: the picture is wide, so it is capped.
    await openDemo(page, '&household=31-estrada-train');
    await advance(page);
    s = await snapshot(page);
    expect(s.portrait.w).toBeLessThanOrEqual(1024 * 0.75 + 1);
    expect(s.portrait.y).toBeGreaterThanOrEqual(0);
    expect(s.portraitIsImage).toBe(true);
  });
});
