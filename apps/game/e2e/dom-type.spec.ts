import { test, expect } from '@playwright/test';

/**
 * The type floor, held on every DOM screen.
 *
 * `ux-review.spec.ts` measures what `GameScene` can open — twelve of these
 * screens and none of the rest. So charm-select shipped at a flat 14px,
 * pre-drive's vehicle locks at 11px and its stat chips at 13px, and nothing
 * in the harness could ever have said so: the screens are reachable only
 * through PtvDriveScene, which the review does not drive that far. The
 * numbers were not disputed, they were unmeasured.
 *
 * This walks each page directly instead. It is a *floor* test, not a
 * layout one — the only claim is that no child is asked to read anything
 * under `MIN_FONT.small`. Where those screens sit and what they look like
 * is the review's job.
 *
 * Deliberately not scored:
 *   - the `.vp-bar` design-preview toolbar, which every mock page carries
 *     and `body.embed` hides in game. Measuring the element's own computed
 *     style sees 11px there and buries the real findings under it — the
 *     same trap `ux-review.spec.ts` documents.
 *   - text with no letters. A confetti emoji and a sparkle are sized with
 *     `font-size` because that is how you size an emoji; there is no reader
 *     to serve.
 *   - the `.zz` sleep marks that drift off a sleeping animal. They are the
 *     one letter in the game that is a picture: a "Z" here says asleep the
 *     way the emoji beside it does, and it grows and fades on a loop rather
 *     than sitting still to be read. Named rather than caught by the
 *     letterless rule, because "Z" is a letter and the rule should stay
 *     honest about that.
 */

const FLOOR = 16;

/**
 * The screens `src/` actually mounts — every `*.html` a TypeScript file
 * names. Mockups and review pages are not shipped and are not scored.
 *
 * `news`, `pre-drive` and `play-dog` were on this list and are referenced by
 * nothing in `src/`. They also do not honour `?embed=1`, so they failed on
 * their own design-preview toolbar: "Viewport:", "iPhone", "iPad P" at 11px,
 * which is a mock chrome finding rather than a game one. Keeping them here
 * would have meant either a permanently red test or exempting the toolbar
 * again — both worse than saying plainly what ships.
 *
 * If one of them is ever mounted, add it here *and* give it the
 * `?embed=1` handling the other 22 have.
 */
const SCREENS = [
  'adopters', 'adoption-office', 'adoption', 'arrival', 'badge', 'charm-select',
  'conflict', 'drive-overlay', 'forgot-pin', 'friends', 'intro', 'login', 'map',
  'menu', 'paths', 'rewilding', 'signup', 'tunnel', 'vet', 'visitor',
  'welcome-new', 'welcome',
] as const;

interface SmallRun { sel: string; size: number; text: string }

/**
 * What the game sends a screen before a child sees it, where the screen is
 * empty without it. The friends screen waits for its list (146A); this one
 * has two friends and the card asking "Remove … from your friends?" open,
 * so the cards, the Remove plank and the question are all measured. The game
 * sends no `lastVisit` or `bond` yet, and a card without them shows neither;
 * the first friend carries both, so the line and the medal's label, which
 * appear the day the game sends them, are held to the floor too.
 */
const SETUP: Partial<Record<(typeof SCREENS)[number], string>> = {
  friends: `window.postMessage({ source: 'arc-auth-host', type: 'friends', payload: { friends: [
    { id: '00000000-0000-4000-8000-000000000001', displayName: 'MossyOtter', emoji: '🦦', bg: '#d0f0c0', lastVisit: 'Yesterday', bond: 5 },
    { id: '00000000-0000-4000-8000-000000000002', displayName: 'CuriousDormouse99', emoji: '🐭', bg: '#ffd0a0' },
  ] } }, '*');
  setTimeout(() => document.querySelectorAll('.friend-card .remove-btn')[1].click(), 50);`,
};

/**
 * The app's real WKWebView viewport on an iPhone 17 Pro, measured inside the
 * shipped app — and the short-landscape branch these screens' `@container`
 * rules key on, which is where the low floors actually bite. See TRAPS.md.
 */
const VIEWPORT = { width: 874, height: 402 };

test.describe('DOM screens keep the type floor', () => {
  test.use({ viewport: VIEWPORT });

  for (const screen of SCREENS) {
    test(`${screen} draws nothing under ${FLOOR}px`, async ({ page }) => {
      // `?embed=1` is exactly how `InGameOverlay` mounts these, and it has
      // to be the query param rather than adding `body.embed` afterwards.
      // The mock's preview keeps a `data-size` on `.device` — tunnel.html
      // defaults to `ipad-p` — and setting the class post-load does not
      // undo it: the page laid out in a 768x1024 box inside a 402px
      // viewport, its container query saw a 1024px container, and the whole
      // short-landscape branch never applied. Every measurement taken that
      // way describes an iPad-portrait preview, not the phone.
      await page.goto(`/admin/${screen}.html?embed=1`);
      if (SETUP[screen]) await page.evaluate(SETUP[screen]!);
      await page.waitForTimeout(250);

      const small: SmallRun[] = await page.evaluate((floor) => {
        const out: SmallRun[] = [];
        for (const el of Array.from(document.querySelectorAll('body *'))) {
          if (el.children.length) continue;
          if (el.closest('.zzz-stack')) continue;
          const text = (el.textContent ?? '').trim();
          if (!text || !/\p{Letter}/u.test(text)) continue;
          const anyEl = el as Element & { checkVisibility?: (o?: unknown) => boolean };
          if (typeof anyEl.checkVisibility === 'function'
            && !anyEl.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) continue;
          const size = Number.parseFloat(getComputedStyle(el).fontSize);
          if (size >= floor) continue;
          const cls = typeof el.className === 'string' && el.className.trim()
            ? '.' + el.className.trim().split(/\s+/).join('.') : '';
          out.push({ sel: el.tagName.toLowerCase() + cls, size, text: text.slice(0, 30) });
        }
        return out;
      }, FLOOR);

      expect(
        small,
        small.map((s) => `${s.sel} at ${s.size}px — ${JSON.stringify(s.text)}`).join('\n'),
      ).toEqual([]);
    });
  }
});

/**
 * ONE DISPLAY FACE AND ONE BODY FACE, held on every DOM screen.
 *
 * Marcus, 2026-10-14, on the adoption panels: "too many mixed font faces ...
 * the calligraphic one will be almost impossible for kids to read". The
 * ceremony alone drew in five faces, and a brush-script for the whole letter
 * from the family. The two faces are declared once in `public/fonts/fonts.css`
 * (`--headline-font` Fredoka, for titles; `--body-font` Nunito, for everything
 * else a child reads). This is the half that stops them drifting back: it
 * resolves the face each visible text element actually draws in, the way the
 * browser does (the first family in its stack that is loaded), and fails on
 * any other, and on the display face anywhere a child has to press something
 * or read a sentence.
 *
 * Named exception: the friend code, which is monospace on purpose so that a
 * string a child copies to a friend is not misread (menu.html says why).
 */
const DISPLAY = 'Fredoka';
const BODY = 'Nunito';
/** The display face is for a title: a few words, never a control and never a paragraph. */
const TITLE_MAX_CHARS = 60;

interface FaceRun { sel: string; face: string; text: string; why: string }

test.describe('DOM screens draw in the display face and the body face, and no other', () => {
  test.use({ viewport: VIEWPORT });

  for (const screen of SCREENS) {
    test(`${screen} uses ${DISPLAY} for titles and ${BODY} for everything else`, async ({ page }) => {
      await page.goto(`/admin/${screen}.html?embed=1`);
      if (SETUP[screen]) await page.evaluate(SETUP[screen]!);
      await page.waitForTimeout(250);
      await page.evaluate(() => document.fonts.ready);

      const bad: FaceRun[] = await page.evaluate(({ display, body, titleMax }) => {
        const generic = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif',
          'ui-serif', 'ui-monospace', 'ui-rounded', '-apple-system', 'emoji', 'math']);
        const declared = new Set(Array.from(document.fonts).map((f) => f.family.replace(/["']/g, '')));
        const resolve = (el: Element, text: string): string => {
          const cs = getComputedStyle(el);
          const families = cs.fontFamily.split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
          for (const fam of families) {
            if (generic.has(fam)) return fam;
            if (!declared.has(fam)) return fam;
            if (document.fonts.check(`${cs.fontWeight} ${cs.fontSize} "${fam}"`, text.slice(0, 12))) return fam;
          }
          return families[families.length - 1] ?? '';
        };
        const out: FaceRun[] = [];
        for (const el of Array.from(document.querySelectorAll('body *'))) {
          if (el.children.length) continue;
          if (el.closest('.vp-bar')) continue;
          const text = (el.textContent ?? '').trim();
          if (!text || !/\p{Letter}/u.test(text)) continue;
          const anyEl = el as Element & { checkVisibility?: (o?: unknown) => boolean };
          if (typeof anyEl.checkVisibility === 'function'
            && !anyEl.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) continue;
          const face = resolve(el, text);
          const cls = typeof el.className === 'string' && el.className.trim()
            ? '.' + el.className.trim().split(/\s+/).join('.') : '';
          const entry = { sel: el.tagName.toLowerCase() + cls, face, text: text.slice(0, 30) };
          if (face === body) continue;
          if (face === display) {
            if (el.closest('button, a, input, select, textarea, [role="button"]')) out.push({ ...entry, why: 'the display face is for titles, and this is a control' });
            else if (text.length > titleMax) out.push({ ...entry, why: `the display face is for titles, and this is ${text.length} characters` });
            continue;
          }
          if (el.closest('.friend-code') && /monospace/.test(face)) continue;
          out.push({ ...entry, why: `${face} is neither ${display} nor ${body}` });
        }
        return out;
      }, { display: DISPLAY, body: BODY, titleMax: TITLE_MAX_CHARS });

      expect(
        bad,
        bad.map((b) => `${b.sel} draws in ${b.face}: ${b.why} — ${JSON.stringify(b.text)}`).join('\n'),
      ).toEqual([]);
    });
  }
});
