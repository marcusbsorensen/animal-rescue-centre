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
