/**
 * measure-screens.mjs — audit the DOM screens under public/admin/ at real
 * device sizes, without a device.
 *
 * WHY
 * Those screens lay themselves out with @container queries keyed on WIDTH
 * only: a ">= 900px" wide branch and a "<= 420px" iPhone branch. A landscape
 * phone is 780x360 — wide and short — so it matches neither and falls through
 * to the base rules, whose clamp() minimums are sized for a tall viewport. On
 * 2026-08-29 that put the stack at 751px in a 360px box: PLAY! sat 27px below
 * the fold, CONTINUE! 77px, START PLAYING! 332px.
 *
 * The buttons were still *reachable* — the body.embed rule in each page makes
 * the screen scroll — so "does it overflow" is the wrong question and reports
 * nothing. What matters is whether the primary action is above the fold when
 * the screen loads, because a seven-year-old will not go looking. That is what
 * this measures.
 *
 * TWO THINGS THAT WILL MISLEAD YOU IF YOU CHANGE THIS
 *  - The scroll container is `.device > *`, NOT document.body. Measuring
 *    body.scrollHeight reports "content == viewport, no overflow" on a screen
 *    whose buttons are 391px below the fold.
 *  - Occlusion is tested with elementFromPoint, not bounding boxes. A bbox
 *    test reports the grass clump covering every pill it merely shares space
 *    with. elementFromPoint ignores pointer-events:none, which is exactly what
 *    the decorative art is, so the art is made hit-testable for the probe and
 *    restored afterwards.
 *    Known limitation: a control clipped by an ancestor's overflow (login's
 *    profile chips) reports the buttons underneath it as covering it. Those
 *    are false positives — check the render before believing one.
 *
 * USAGE — must run from inside apps/game, where @playwright/test resolves.
 *   ARC_BROWSER_CHANNEL=chrome node tools/measure-screens.mjs
 *   ARC_BROWSER_CHANNEL=chrome node tools/measure-screens.mjs --boxes welcome 780 360
 *
 * --boxes prints the box tree for one screen at one size: which element is
 * eating the height. That is how the 751px was traced to a 64px top padding,
 * a 70px decorative stake and a 103px credits row.
 *
 * Needs the dev server up on :5173.
 */
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5173/admin';
const PAGES = ['welcome', 'menu', 'login', 'signup', 'welcome-new', 'paths', 'friends', 'intro'];

/**
 * Screens with more than one stage behind a `hidden` class. Measuring the page
 * as it loads only ever sees the first, which is how signup's PIN keypad
 * shipped offering 1-6 with 7/8/9/0/delete/confirm below the fold on a phone.
 * Each entry swaps which stage is showing before the measurement runs.
 */
const VARIANTS = [
  { page: 'signup', label: 'signup(pin)', show: '#stage-pin', hide: '#stage-select' },
  { page: 'login', label: 'login(pin)', show: '#stage-pin', hide: '#stage-select' },
];
const SIZES = [
  // 312, not 360: in the standalone web clip the app is only given 312pt of
  // the 360pt screen — a 48pt strip along the bottom is never painted into.
  // Measured off a simulator screenshot on 2026-08-29; cause not yet found.
  // This is the real phone budget, so it is the one that must pass.
  { name: 'iphone-13mini-clip  780x312', w: 780, h: 312 },
  { name: 'iphone-13mini-land  780x360', w: 780, h: 360 },
  { name: 'iphone-17promax-land 956x440', w: 956, h: 440 },
  { name: 'ipad-mini-land     1133x744', w: 1133, h: 744 },
  { name: 'ipad-air11-land    1194x834', w: 1194, h: 834 },
];

const argv = process.argv.slice(2);
const boxesMode = argv[0] === '--boxes';

const browser = await chromium.launch({ channel: 'chrome' });

if (boxesMode) {
  const [, page_ = 'welcome', w = '780', h = '360'] = argv;
  const ctx = await browser.newContext({ viewport: { width: Number(w), height: Number(h) } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${page_}.html?embed=1`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(400);
  const { vh, rows } = await p.evaluate(() => {
    const out = [];
    const walk = (el, depth) => {
      if (depth > 10) return;
      for (const c of el.children) {
        const r = c.getBoundingClientRect();
        if (r.height < 0.5 && r.width < 0.5) continue;
        const cs = getComputedStyle(c);
        out.push({
          depth,
          tag: c.tagName.toLowerCase(),
          cls: (c.className || '').toString().slice(0, 30),
          top: Math.round(r.top),
          h: Math.round(r.height),
          pt: cs.paddingTop,
          pb: cs.paddingBottom,
        });
        walk(c, depth + 1);
      }
    };
    walk(document.querySelector('.screen') || document.body, 0);
    return { vh: innerHeight, rows: out };
  });
  console.log(`${page_} at ${w}x${h}  vh=${vh}`);
  for (const r of rows) {
    console.log(
      `${'  '.repeat(r.depth)}${r.tag}.${r.cls}`.padEnd(46) +
        ` top=${String(r.top).padStart(4)} h=${String(r.h).padStart(4)} pad=${r.pt}/${r.pb}`,
    );
  }
  await browser.close();
  process.exit(0);
}

let problems = 0;
for (const s of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h } });
  const p = await ctx.newPage();
  console.log(`\n=== ${s.name} ===`);
  const targets = [
    ...PAGES.map((page) => ({ page, label: page })),
    ...VARIANTS,
  ];
  for (const { page, label, show, hide } of targets) {
    try {
      await p.goto(`${BASE}/${page}.html?embed=1`, { waitUntil: 'networkidle', timeout: 15000 });
      if (show) {
        await p.evaluate(([show, hide]) => {
          document.querySelector(show)?.classList.remove('hidden');
          document.querySelector(hide)?.classList.add('hidden');
        }, [show, hide]);
      }
      await p.waitForTimeout(350);
      const r = await p.evaluate(() => {
        const scroller = document.querySelector('.device > *') || document.scrollingElement;
        const vh = scroller.clientHeight;
        const sh = scroller.scrollHeight;

        const ctrls = [...document.querySelectorAll('button, [role=button], a, .btn, .link-btn, [data-action]')]
          .map((e) => {
            const b = e.getBoundingClientRect();
            if (b.width < 1 || b.height < 1) return null;
            const label = (e.textContent || e.getAttribute('aria-label') || e.className || e.tagName)
              .trim().replace(/\s+/g, ' ').slice(0, 30);
            return { el: e, label, top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height), w: Math.round(b.width) };
          })
          .filter(Boolean);

        const muted = [...document.querySelectorAll('img, div, span')]
          .filter((e) => getComputedStyle(e).pointerEvents === 'none');
        for (const e of muted) e.style.pointerEvents = 'auto';

        const overlaps = [];
        for (const c of ctrls) {
          const a = c.el.getBoundingClientRect();
          if (a.bottom < 0 || a.top > vh) continue;
          const covering = new Map();
          let samples = 0;
          for (let ix = 1; ix <= 5; ix++) {
            for (let iy = 1; iy <= 3; iy++) {
              const x = a.left + (a.width * ix) / 6;
              const y = a.top + (a.height * iy) / 4;
              if (y < 0 || y > vh || x < 0 || x > innerWidth) continue;
              samples++;
              const hit = document.elementFromPoint(x, y);
              if (!hit || hit === c.el || c.el.contains(hit) || hit.contains(c.el)) continue;
              const name = hit.className?.toString?.().trim() || hit.tagName.toLowerCase();
              covering.set(name, (covering.get(name) ?? 0) + 1);
            }
          }
          for (const [name, n] of covering) {
            const frac = Math.round((100 * n) / Math.max(samples, 1));
            if (frac >= 15) overlaps.push({ label: c.label, art: name, frac });
          }
        }
        for (const e of muted) e.style.pointerEvents = '';

        // A control inside its own scrolling list (signup's animal picker,
        // login's profile chips) is bounded by that list, not by the screen.
        // Reporting those as "clipped by the viewport" is a false finding.
        const inOwnScroller = (el) => {
          for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const cs = getComputedStyle(p);
            if (cs.overflowY !== 'visible' || cs.overflowX !== 'visible') {
              const pr = p.getBoundingClientRect();
              if (pr.height > 0 && pr.bottom <= vh + 1) return true;
            }
          }
          return false;
        };

        const strip = ({ el, ...rest }) => rest;
        return {
          vh, sh,
          belowFold: ctrls.filter((c) => c.top >= vh && !inOwnScroller(c.el)).map(strip),
          partly: ctrls.filter((c) => c.top < vh && c.bottom > vh + 1 && !inOwnScroller(c.el)).map(strip),
          tooSmall: ctrls.filter((c) => c.h < 44 || c.w < 44).map(strip),
          overlaps,
        };
      });

      const scrollBy = r.sh - r.vh;
      console.log(`${label.padEnd(13)} viewport=${r.vh} content=${r.sh}${scrollBy > 0 ? `  scrolls +${scrollBy}` : '  fits'}`);
      for (const c of r.belowFold) { problems++; console.log(`    BELOW FOLD   "${c.label}"  top=${c.top}`); }
      for (const c of r.partly) { problems++; console.log(`    CLIPPED      "${c.label}"  ${c.top}..${c.bottom} vs ${r.vh}`); }
      for (const c of r.tooSmall) { problems++; console.log(`    SMALL TAP    "${c.label}"  ${c.w}x${c.h}`); }
      for (const o of r.overlaps) console.log(`    ART OVER?    "${o.label}"  ${o.frac}% by ${o.art}`);
    } catch (e) {
      problems++;
      console.log(`${label.padEnd(13)} ERROR ${e.message.split('\n')[0]}`);
    }
  }
  await ctx.close();
}
await browser.close();

console.log(`\n${problems === 0 ? '✓ no unreachable, clipped or undersized controls' : `✖ ${problems} problems`}`);
process.exit(problems === 0 ? 0 : 1);
