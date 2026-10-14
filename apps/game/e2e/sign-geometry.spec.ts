import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The sign screens hold together as one signpost, at every size we ship (130A).
 *
 * welcome-new, login, signup, menu, friends, forgot-PIN and news are a board on
 * two posts, small signs on the posts, a cat and a parrot on the board and a
 * rabbit in the grass. Marcus, 2026-10-14: Next and "I already have an account"
 * on one row as two small signs on the two posts, the room given to bigger
 * animals, each outlined in its own darkest colour and touching the scene, and
 * the titles white on a dark plank. This measures each of those, on each screen
 * and stage, at the five sizes, so a later change to one shared sheet cannot
 * quietly undo them on a screen nobody looked at:
 *
 *   - the screen does not scroll, and nothing a child reads or taps leaves it;
 *   - no two controls overlap, no text runs under a control or other text, and
 *     no animal covers either (the bee, which flies in front of everything, is
 *     left out);
 *   - every small sign is across a post, and a sign alone in its row is across
 *     both;
 *   - the cat and the parrot are on their board (a child of it, wholly within
 *     its width) with the painting's feet on the edge, not above it; the rabbit
 *     is on the ground the tuft draws;
 *   - each animal's outline is its own colour from the ink table in
 *     `_signpost-physics.css`, never black;
 *   - each title is Fredoka, white, 26px or more, on a plank.
 *
 * The screens are opened directly with `?embed=1`, as AuthOverlay mounts them,
 * and the host's messages (the names on offer, the saved clue) are posted from
 * the page itself, so nothing here reaches a server.
 */

const ADMIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'admin');

/** `--animal-ink` per painting, read from the generated table. */
function inkTable(): Record<string, string> {
  const css = fs.readFileSync(path.join(ADMIN, '_signpost-physics.css'), 'utf8');
  const body = css.slice(css.indexOf('/* ink-table:begin */'), css.indexOf('/* ink-table:end */'));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/\[src\$="\/([^"]+)"\]\s*\{\s*--animal-ink:\s*(#[0-9a-f]{6})/gi)) {
    out[m[1]] = m[2].toLowerCase();
  }
  return out;
}

const SIZES = [
  { width: 780, height: 360 },
  { width: 667, height: 375 },
  { width: 874, height: 402 },
  { width: 390, height: 844 },
  { width: 1024, height: 768 },
] as const;

const NAMES = { source: 'arc-auth-host', type: 'sign-in-names', payload: { names: ['PebbleKite', 'AcornDrum', 'MoonSock'] } };

interface Screen { id: string; page: string; setup?: string }
const SCREENS: Screen[] = [
  { id: 'welcome-new', page: 'welcome-new' },
  // The four placeholder names in the markup: the most a device keeps.
  { id: 'login', page: 'login' },
  { id: 'login, no saved names', page: 'login', setup: `window.postMessage({source:'arc-auth-host',type:'init',payload:{usernames:[]}}, '*')` },
  { id: 'login, typing a name', page: 'login', setup: `setStage('type')` },
  { id: 'login, secret number', page: 'login', setup: `setStage('pin')` },
  { id: 'signup', page: 'signup', setup: `window.postMessage(${JSON.stringify(NAMES)}, '*')` },
  { id: 'signup, secret number', page: 'signup', setup: `window.postMessage(${JSON.stringify(NAMES)}, '*'); setTimeout(() => setStage('pin'), 50)` },
  { id: 'signup, clue', page: 'signup', setup: `window.postMessage(${JSON.stringify(NAMES)}, '*'); setTimeout(() => setStage('hint'), 50)` },
  { id: 'signup, friends see this name', page: 'signup', setup: `window.postMessage(${JSON.stringify(NAMES)}, '*'); setTimeout(() => setStage('name'), 50)` },
  { id: 'menu', page: 'menu' },
  { id: 'friends', page: 'friends' },
  { id: 'forgot-pin', page: 'forgot-pin', setup: `window.postMessage({source:'arc-auth-host',type:'init',payload:{hint:'A birthday'}}, '*')` },
  { id: 'news', page: 'news' },
];

/** Runs in the page. Returns one line per thing that is wrong. */
async function measure(ink: Record<string, string>): Promise<string[]> {
  const W = innerWidth;
  const H = innerHeight;
  const bad: string[] = [];
  type Box = { x: number; y: number; r: number; b: number };
  const name = (el: Element): string => {
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '';
    const t = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 24);
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls}${t ? ` "${t}"` : ''}`;
  };
  const f = (b: Box): string => `${Math.round(b.x)},${Math.round(b.y)}..${Math.round(b.r)},${Math.round(b.b)}`;
  const visible = (el: Element): boolean => {
    const e = el as Element & { checkVisibility?: (o?: unknown) => boolean };
    if (typeof e.checkVisibility === 'function' && !e.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const scroller = document.querySelector('.device > *') as HTMLElement;
  /** The part of an element not cut away by a list that scrolls inside the board. */
  const clipped = (el: Element): Box | null => {
    const r = el.getBoundingClientRect();
    let box: Box = { x: r.left, y: r.top, r: r.right, b: r.bottom };
    for (let p = el.parentElement; p && p !== scroller; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowY === 'visible' && cs.overflowX === 'visible') continue;
      const q = p.getBoundingClientRect();
      box = { x: Math.max(box.x, q.left), y: Math.max(box.y, q.top), r: Math.min(box.r, q.right), b: Math.min(box.b, q.bottom) };
    }
    return box.r - box.x > 1 && box.b - box.y > 1 ? box : null;
  };
  const overlap = (a: Box, b: Box): number => Math.max(0, Math.min(a.r, b.r) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.y, b.y));
  /** More than touching: over each other by more than 2px each way. */
  const overlapsBy = (a: Box, b: Box): boolean =>
    Math.min(a.r, b.r) - Math.max(a.x, b.x) > 2 && Math.min(a.b, b.b) - Math.max(a.y, b.y) > 2;
  const related = (a: Element, b: Element): boolean => a === b || a.contains(b) || b.contains(a);

  // 1. Nothing to scroll to.
  const over = scroller.scrollHeight - scroller.clientHeight;
  if (over > 1) bad.push(`the screen scrolls ${over}px`);

  // What a child reads and taps.
  const controls = Array.from(document.querySelectorAll('button, input, a[href], [role="button"]'))
    .filter((el) => visible(el) && !el.closest('.vp-bar'));
  const texts = Array.from(document.querySelectorAll('body *')).filter((el) => {
    if (el.closest('.vp-bar, .zzz-stack')) return false;
    if (Array.from(el.children).some((c) => (c.textContent ?? '').trim())) return false;
    const t = (el.textContent ?? '').trim();
    return !!t && /[\p{L}\p{N}]/u.test(t) && visible(el);
  });
  // The boards hang a degree or so off level, and the box the browser reports
  // for a tilted thing is the upright box round it: 1.2deg on a 540px line of
  // words adds 11px of height, and two lines a few pixels apart "overlap". Each
  // box is turned back to the thing's own size, about its centre, before it is
  // compared. Words are measured as words (the lines of their text), not as the
  // block they sit in, which may be the board's whole width.
  const tilt = (el: Element): number => {
    let a = 0;
    for (let p: Element | null = el; p && p !== scroller; p = p.parentElement) {
      const t = getComputedStyle(p).transform;
      if (t && t !== 'none') { const m = new DOMMatrix(t); a += Math.atan2(m.b, m.a); }
    }
    return Math.abs(a);
  };
  const upright = (b: Box, a: number): Box => {
    if (a < 0.002) return b;
    const W0 = b.r - b.x, H0 = b.b - b.y, c = Math.cos(a), s = Math.sin(a), k = Math.cos(2 * a);
    const w = Math.max(1, (W0 * c - H0 * s) / k), h = Math.max(1, (H0 * c - W0 * s) / k);
    const cx = (b.x + b.r) / 2, cy = (b.y + b.b) / 2;
    return { x: cx - w / 2, r: cx + w / 2, y: cy - h / 2, b: cy + h / 2 };
  };
  const words = (el: Element): Box | null => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rs = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
    if (!rs.length) return null;
    return { x: Math.min(...rs.map((r) => r.left)), y: Math.min(...rs.map((r) => r.top)), r: Math.max(...rs.map((r) => r.right)), b: Math.max(...rs.map((r) => r.bottom)) };
  };
  const boxes = new Map<Element, Box>();
  for (const el of [...controls, ...texts]) {
    const c = clipped(el);
    if (!c) continue;
    const own = controls.includes(el) ? c : words(el);
    if (!own) continue;
    const b = upright({ x: Math.max(own.x, c.x), y: Math.max(own.y, c.y), r: Math.min(own.r, c.r), b: Math.min(own.b, c.b) }, tilt(el));
    if (b.r - b.x > 1 && b.b - b.y > 1) boxes.set(el, b);
  }

  // 2. On the screen.
  for (const [el, b] of boxes) {
    if (b.x < -1 || b.y < -1 || b.r > W + 1 || b.b > H + 1) bad.push(`${name(el)} leaves the screen at ${f(b)}`);
  }

  // 3. No control on a control, no text under a control or other text.
  const items = [...boxes.entries()];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const [a, ab] = items[i];
      const [c, cb] = items[j];
      if (related(a, c)) continue;
      // Text inside a control belongs to that control.
      if (a.closest('button, a, [role="button"]') && a.closest('button, a, [role="button"]') === c.closest('button, a, [role="button"]')) continue;
      if (overlapsBy(ab, cb)) bad.push(`${name(a)} ${f(ab)} overlaps ${name(c)} ${f(cb)}`);
    }
  }

  // The painted part of an animal: its alpha box, mapped onto where it is drawn.
  const opaque = (img: HTMLImageElement): Box => {
    const r = img.getBoundingClientRect();
    const n = 128;
    const cv = document.createElement('canvas');
    cv.width = n; cv.height = n;
    const ctx = cv.getContext('2d')!;
    ctx.drawImage(img, 0, 0, n, n);
    const px = ctx.getImageData(0, 0, n, n).data;
    let x0 = n, y0 = n, x1 = 0, y1 = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (px[(y * n + x) * 4 + 3] > 40) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1); }
    }
    const flip = new DOMMatrix(getComputedStyle(img).transform === 'none' ? undefined : getComputedStyle(img).transform).a < 0;
    const fx0 = flip ? 1 - x1 / n : x0 / n;
    const fx1 = flip ? 1 - x0 / n : x1 / n;
    return { x: r.left + fx0 * r.width, r: r.left + fx1 * r.width, y: r.top + (y0 / n) * r.height, b: r.top + (y1 / n) * r.height };
  };
  const artBottom = (img: HTMLImageElement): number => {
    const n = 128;
    const cv = document.createElement('canvas');
    cv.width = n; cv.height = n;
    const ctx = cv.getContext('2d')!;
    ctx.drawImage(img, 0, 0, n, n);
    const px = ctx.getImageData(0, 0, n, n).data;
    let y1 = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (px[(y * n + x) * 4 + 3] > 40) y1 = y + 1;
    return y1 / n;
  };

  const animals = Array.from(document.querySelectorAll<HTMLImageElement>('.intro-cat, .play-parrot, .ground-bunny')).filter(visible);
  for (const img of animals) {
    const label = `${img.className} (${(img.getAttribute('src') ?? '').split('/').pop()})`;
    const art = opaque(img);
    // 4. Not over anything a child reads or taps.
    for (const [el, b] of boxes) {
      if (overlapsBy(art, b) && overlap(art, b) > 16) bad.push(`${label} ${f(art)} covers ${name(el)} ${f(b)}`);
    }
    // ... and on the screen.
    if (art.x < -1 || art.r > W + 1 || art.y < -1 || art.b > H + 1) bad.push(`${label} leaves the screen at ${f(art)}`);

    // 5. Outlined in its own colour, never black.
    const file = (img.getAttribute('src') ?? '').split('/').pop() ?? '';
    const want = ink[file];
    const got = getComputedStyle(img).getPropertyValue('--animal-ink').trim().toLowerCase();
    if (!want) bad.push(`${label} has no line in the ink table`);
    else if (got !== want) bad.push(`${label} is outlined in ${got || 'the fallback'}, not its own ${want}`);
    const filter = getComputedStyle(img).filter;
    if ((filter.match(/drop-shadow/g) ?? []).length < 4) bad.push(`${label} has no outline (${filter.slice(0, 60)})`);
    if (/rgb\(0, 0, 0\)\s+[-\d.]+px\s+[-\d.]+px\s+0px/.test(filter)) bad.push(`${label} is outlined in black`);

    // 6. Touching the scene.
    const edge = parseFloat(getComputedStyle(img).getPropertyValue('--edge-y'));
    const foot = artBottom(img);
    if (img.matches('.intro-cat, .play-parrot')) {
      const board = img.parentElement;
      if (!board?.matches('.intro')) { bad.push(`${label} is not on a board`); continue; }
      if (Math.abs(parseFloat(getComputedStyle(img).bottom) - board.clientHeight) > 1.5) bad.push(`${label} is not standing on its board's top edge (bottom ${getComputedStyle(img).bottom})`);
      // Below the edge is claws, a belly or a tail over the front of the wood;
      // what is over the board's words is caught by the covering check above.
      if (foot < edge - 0.01) bad.push(`${label}: the painting ends at ${foot.toFixed(3)}, above the edge it stands on (${edge}) — it floats`);
      const bb = board.getBoundingClientRect();
      if (art.x < bb.left - 2 || art.r > bb.right + 2) bad.push(`${label} ${f(art)} hangs off its board ${Math.round(bb.left)}..${Math.round(bb.right)}`);
    } else {
      const grass = img.parentElement?.querySelector('.grass-clump')?.getBoundingClientRect();
      if (!grass) { bad.push(`${label} has no grass`); continue; }
      if (Math.abs(art.b - grass.bottom) > 40) bad.push(`${label}'s feet at ${Math.round(art.b)} are not on the ground (the tuft ends at ${Math.round(grass.bottom)})`);
      if (art.x < grass.left - 2 || art.r > grass.right + 2) bad.push(`${label} ${f(art)} is not in the tuft ${Math.round(grass.left)}..${Math.round(grass.right)}`);
    }
  }

  // The bee flies in front of everything, so it is followed round its loop:
  // eight points of it, none over anything a child reads or taps.
  const bee = document.querySelector<HTMLImageElement>('.bee-flyer');
  const flight = bee && visible(bee) ? bee.getAnimations()[0] : undefined;
  if (bee && flight) {
    const total = Number(flight.effect?.getComputedTiming().duration) || 0;
    for (let k = 0; k < 8; k++) {
      flight.currentTime = (total * k) / 8;
      const art = opaque(bee);
      for (const [el, b] of boxes) {
        if (overlapsBy(art, b) && overlap(art, b) > 16) { bad.push(`the bee ${f(art)} flies over ${name(el)} ${f(b)}`); break; }
      }
    }
    flight.currentTime = 0;
  }

  // 7. Each small sign across a post, a sign alone across both.
  const stake = document.querySelector('.signs-on-stake') as HTMLElement | null;
  const cta = stake?.querySelector(':scope > .cta-stack');
  if (stake && cta) {
    const s = stake.getBoundingClientRect();
    const post = (which: '::before' | '::after'): [number, number] => {
      const cs = getComputedStyle(stake, which);
      const w = parseFloat(cs.width);
      const x = which === '::before' ? s.left + parseFloat(cs.left) : s.right - parseFloat(cs.right) - w;
      return [x, x + w];
    };
    const [L, R] = [post('::before'), post('::after')];
    const across = (el: Element, p: [number, number], which: string): void => {
      const b = el.getBoundingClientRect();
      if (b.left > p[0] - 8 || b.right < p[1] + 8) bad.push(`${name(el)} ${Math.round(b.left)}..${Math.round(b.right)} is not across the ${which} post ${Math.round(p[0])}..${Math.round(p[1])}`);
    };
    const primary = cta.querySelector(':scope > .btn-primary-wrap .btn-primary');
    const seconds = Array.from(cta.querySelectorAll(':scope > .secondary-row > *')).filter(visible);
    const primaryOn = primary && visible(primary) && !primary.matches('.demoted') ? primary : null;
    if (primaryOn && seconds.length === 1) {
      across(primaryOn, L, 'left');
      across(seconds[0], R, 'right');
    } else if (primaryOn) {
      across(primaryOn, L, 'left');
      across(primaryOn, R, 'right');
    }
    if (seconds.length === 2) {
      across(seconds[0], L, 'left');
      across(seconds[1], R, 'right');
    }
    const panel = cta.querySelector(':scope > .invite-share-panel');
    if (panel && visible(panel)) { across(panel, L, 'left'); across(panel, R, 'right'); }
  }

  // 8. The title: white, the display face, the larger size, on its plank.
  for (const t of Array.from(document.querySelectorAll('.sign-title')).filter(visible)) {
    const cs = getComputedStyle(t);
    if (!/^"?Fredoka/.test(cs.fontFamily)) bad.push(`${name(t)} is in ${cs.fontFamily.split(',')[0]}`);
    if (cs.color !== 'rgb(255, 255, 255)') bad.push(`${name(t)} is ${cs.color}, not white`);
    if (parseFloat(cs.fontSize) < 26) bad.push(`${name(t)} is ${cs.fontSize}`);
    if (!/gradient/.test(cs.backgroundImage) || cs.backgroundClip === 'text') bad.push(`${name(t)} has no plank behind it`);
  }
  return bad;
}

for (const size of SIZES) {
  test.describe(`the sign screens at ${size.width}x${size.height}`, () => {
    test.use({ viewport: size });
    for (const screen of SCREENS) {
      test(`${screen.id} is one signpost that fits`, async ({ page }) => {
        await page.goto(`/admin/${screen.page}.html?embed=1`);
        await page.evaluate(() => document.fonts.ready);
        if (screen.setup) await page.evaluate(screen.setup);
        await page.waitForTimeout(450);
        // Every image decoded (the outline and the feet are measured from the art).
        await page.evaluate(() => Promise.all(Array.from(document.images).map((i) => i.decode().catch(() => undefined))));
        // Loops at their first frame, entrances at their last, so the
        // measurements are of the picture a child sees standing still.
        await page.evaluate(() => {
          for (const a of document.getAnimations()) {
            const t = a.effect?.getComputedTiming();
            if (t && t.iterations !== Infinity) a.finish();
            else { a.pause(); a.currentTime = 0; }
          }
        });
        const bad = await page.evaluate(measure, inkTable());
        expect(bad, bad.join('\n')).toEqual([]);
      });
    }
  });
}
