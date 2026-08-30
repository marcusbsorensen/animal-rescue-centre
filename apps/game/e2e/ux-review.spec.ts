import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForGameReady, seedFakeSession } from './helpers';
import {
  reachability, overlappingControls, textCutByControls, gapBetween,
  groupRepeatedTiles, type UxRect,
} from '../src/ui/ux-geometry';

/**
 * UX review — the machine-measurable part of .claude/commands/ux-review.md.
 *
 * That checklist has ~50 criteria across eight groups. Roughly a third can
 * be measured from the running game; the rest ("is the primary action
 * obvious within two seconds", "is the error feedback gentle") are
 * judgement calls that need eyes. This measures the third, so the eyes can
 * be spent on the two-thirds that need them.
 *
 * Measured here:
 *   T1-T3, T6  touch target sizes for interactive elements
 *   T4         spacing between adjacent targets
 *   F1-F5      font sizes by role
 *   F6         rounded sans-serif font family
 *   F7         ALL-CAPS body text
 *   F10        text resolution set for retina
 *   L3         safe margins from screen edges
 *   L6         distinct controls per screen (a repeated tile counts once)
 *   L7         every control's centre is inside the viewport
 *   L8         no two controls overlap
 *   L9         no control is printed across text it does not own
 *
 * L7-L9 are review phase 5. The review found seventeen things by hand and
 * this harness had caught none of them, because it measured every element
 * against a rule about *itself* and never against the element beside it.
 * Nine of the seventeen were one element on top of another; two were an
 * exit off the bottom of the screen. Those are relations, so they need a
 * pairwise pass.
 *
 * NOT measured — still needs a human:
 *   C1-C3 contrast (canvas pixel sampling is too noisy to trust)
 *   C4, C7, C8 colour semantics
 *   E1-E7 feedback and animation
 *   B1-B4 button affordance
 *   L5, N2-N6 hierarchy and navigation flow
 *
 * The game is Phaser-on-canvas, so most UI has no DOM. Measurements come
 * from walking the scene graph. The auth and intro scenes mount HTML
 * overlays instead, and those are measured through the DOM.
 *
 *   pnpm --filter @arc/game exec playwright test e2e/ux-review.spec.ts
 *
 * Output: e2e/__ux__/ux-report.json plus a table in the test log.
 */

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '__ux__');

/**
 * Landscape, all of them. The iOS build is orientation-locked to landscape
 * on both phone and iPad (UISupportedInterfaceOrientations in
 * ios/App/App/Info.plist), so a portrait measurement describes a layout no
 * child will ever see. The first pass of this harness ran at 375x812 and
 * 768x1024 and produced a fix list for exactly that layout.
 *
 * Sizes are the CSS-pixel viewports of the smallest devices that matter:
 * iPhone SE/X-class in landscape, and iPad in landscape. Desktop is the web
 * fallback and was already landscape.
 */
const VIEWPORTS = [
  { name: 'mobile', width: 812, height: 375 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'desktop', width: 1280, height: 800 },
];

/** Scenes worth measuring — the ones a child actually spends time on. */
const SCENES = [
  'MainMenuScene',
  'GameScene',
  'KitchenMinigameScene',
  'DepotScene',
  'SupplyRunScene',
  'SocialScene',
  'AccountScene',
  'PtvDriveScene',
];

/**
 * The states of GameScene that are not the corridor.
 *
 * Everything the review found in findings 1, 2 and 4 was behind one of
 * these, and the harness measured none of them: it started a scene, waited
 * two seconds and read whatever was on screen. The card is the biggest
 * piece of UI in the game and the overlays are where a child gets stuck, so
 * a pass that never opens either is measuring the easy two thirds.
 *
 * Each opens through GameScene's own method, so the state is the one the
 * game actually produces rather than one the harness has posed.
 */
const GAME_SCENE_STATES = [
  'default',
  'animal-card',
  'paths',
  'adoption-office',
  'rewilding',
  'tunnel',
  'map',
] as const;

/** An animal complete enough for the card and the overlays to render. */
const MEASURE_ANIMAL = {
  id: 'ux-1', name: 'Luna', species: 'cat', variant: 'ginger',
  state: 'bonding', arrivalStory: 'Found under a hedge in the rain.',
  hunger: 55, tiredness: 30, happiness: 70, health: 85,
  bondLevel: 60, cleanliness: 80, roomId: 'room-cat',
};

type Verdict = 'PASS' | 'WARN' | 'FAIL';

interface Measurement {
  id: string;
  rule: string;
  verdict: Verdict;
  detail: string;
}

interface SceneReport {
  scene: string;
  /** Which state of the scene this is — 'default', or a card/overlay. */
  state: string;
  viewport: string;
  interactiveCount: number;
  /** What L6 scores — a scrolling grid of identical tiles counted once. */
  distinctControlCount: number;
  textCount: number;
  findings: Measurement[];
  /**
   * The elements that actually failed, with their geometry.
   *
   * The findings text names them — "Rectangle:30" — which is enough to know
   * something is wrong and not enough to find it. Phaser display objects are
   * mostly anonymous, so a size and a position is what makes a finding
   * traceable back to the line that drew it.
   */
  offenders: {
    smallTargets: { label: string; w: number; h: number; x: number; y: number; source: string }[];
    smallText: { text: string; size: number; source: string }[];
    offCentre: { label: string; cx: number; cy: number; w: number; h: number }[];
    overlaps: { a: string; b: string; share: number; rect: string }[];
    coveredText: { text: string; by: string; share: number; rect: string }[];
  };
}

/** Banded check: >= pass → PASS, >= warn → WARN, else FAIL. */
function band(value: number, warn: number, pass: number): Verdict {
  if (value >= pass) return 'PASS';
  if (value >= warn) return 'WARN';
  return 'FAIL';
}

const at = (r: UxRect) => `${r.w.toFixed(0)}x${r.h.toFixed(0)}@${r.x.toFixed(0)},${r.y.toFixed(0)}`;

// Retina, because half of what this measures only means anything on a
// retina screen — F10 in particular. Scoped to this file so the committed
// visual baselines, shot at scale 1, are unaffected.
test.use({ deviceScaleFactor: 2 });

test('measure the automatable UX criteria across scenes and viewports', async ({ page }) => {
  test.setTimeout(300_000);
  fs.mkdirSync(OUT, { recursive: true });

  await page.goto('/');
  await seedFakeSession(page);
  await page.reload();
  await waitForGameReady(page);
  await page.waitForTimeout(1500);

  const reports: SceneReport[] = [];

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(600);

    for (const scene of SCENES) {
      const states: readonly string[] = scene === 'GameScene' ? GAME_SCENE_STATES : ['default'];
      for (const state of states) {
      await page.evaluate((key) => {
        const g = (window as unknown as {
          __PHASER_GAME__?: {
            scene: {
              scenes: Array<{ sys: { settings: { key: string; active: boolean } } }>;
              start: (k: string) => void;
              stop: (k: string) => void;
            };
          };
        }).__PHASER_GAME__;
        if (!g) return;
        for (const s of g.scene.scenes) {
          if (s.sys.settings.active) {
            try { g.scene.stop(s.sys.settings.key); } catch { /* ignore */ }
          }
        }
        try { g.scene.start(key); } catch { /* ignore */ }
      }, scene);

      await page.waitForTimeout(2000);

      // Put the scene into the state we are measuring. Opened through
      // GameScene's own methods, so this is the state the game produces
      // rather than one the harness has posed — if a method is renamed
      // this reports the error instead of quietly measuring the corridor
      // and calling it the card.
      const stateResult = await page.evaluate(([key, st, seed]) => {
        if (st === 'default') return 'default';
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const g = (window as any).__PHASER_GAME__;
        const gs = g?.scene.scenes.find((s: any) => s.sys.settings.key === key);
        if (!gs) return 'no scene';
        try {
          gs.store.animals = [seed];
          const a = gs.store.animals[0];
          if (st === 'animal-card') gs.showAnimalDetails(a);
          else if (st === 'paths') gs.openPathsOverlay(a);
          else if (st === 'adoption-office') gs.openAdoptionOfficeOverlay(a);
          else if (st === 'rewilding') gs.openRewildingOverlay(a);
          else if (st === 'tunnel') gs.openTunnelOverlay();
          else if (st === 'map') gs.openMapOverlay();
          else return `unknown state ${st}`;
        } catch (e) {
          return `error: ${String(e).slice(0, 90)}`;
        }
        return st;
      }, [scene, state, MEASURE_ANIMAL] as [string, string, typeof MEASURE_ANIMAL]);

      // An overlay is an iframe; give it time to load and post its init.
      if (state !== 'default') await page.waitForTimeout(state === 'animal-card' ? 500 : 2500);

      // Harvest every interactive element and every text run, from the
      // Phaser scene graph and from any HTML overlay that is mounted.
      const raw = await page.evaluate((key) => {
        /**
         * `clipped`  — the element lives in something that scrolls or is
         *              masked, so being outside the viewport means "below
         *              the fold", not "unreachable".
         * `pinned`   — sticky or fixed, so sitting over scrolling content
         *              is what it is for, not a collision.
         */
        interface Box { w: number; h: number; x: number; y: number; source: string; label: string; layer: number; clipped: boolean; pinned: boolean; path: string }
        interface Txt { size: number; family: string; text: string; resolution: number; source: string; label: string; layer: number; clipped: boolean; pinned: boolean; path: string; w: number; h: number; x: number; y: number }

        const boxes: Box[] = [];
        const texts: Txt[] = [];

        const g = (window as unknown as {
          __PHASER_GAME__?: {
            scene: { scenes: Array<{ sys: { settings: { key: string } }; children?: { list: unknown[] } }> };
          };
        }).__PHASER_GAME__;
        const scene = g?.scene.scenes.find((s) => s.sys.settings.key === key);

        // Phaser: recurse the display list, including into containers.
        //
        // `layer` is the depth of the top-level child this object descends
        // from, carried down the recursion. A modal draws into its own
        // container at depth 800 over a scene that is still in the display
        // list, so without it the card's buttons and the corridor's door
        // signs look like they overlap — and they do, in world coordinates,
        // with the whole card between them and the child.
        const visit = (obj: Record<string, unknown>, layer: number, path: string, depth = 0, masked = false) => {
          if (!obj || depth > 12) return;
          // Hidden objects are not a UX problem. Scenes keep pools of
          // pre-built labels toggled with setVisible — the obstacle markers
          // in SupplyRunScene are built once and shown on collision — and
          // measuring those reported font sizes for text nobody can read.
          // A container that is hidden hides its children too, so this
          // prunes the whole branch.
          if (obj.visible === false || obj.alpha === 0) return;
          // A mask is how a Phaser scene clips a scrolling region —
          // AccountScene's badge wall puts 40-odd tiles below the fold that
          // way. Their centres are off screen and they are perfectly
          // reachable, so the flag has to travel down to the children.
          const clipped = masked || obj.mask != null;
          const input = obj.input as { enabled?: boolean } | undefined;
          const getBounds = obj.getBounds as (() => { width: number; height: number; x: number; y: number }) | undefined;

          if (input?.enabled && typeof getBounds === 'function') {
            try {
              const b = getBounds.call(obj);
              if (b.width > 0 && b.height > 0) {
                // Name it however we can, so a failure points at something.
                const tex = obj.texture as { key?: string } | undefined;
                const label = String(
                  obj.name || tex?.key || obj.text || obj.type || 'unnamed',
                ).slice(0, 32);
                boxes.push({ w: b.width, h: b.height, x: b.x, y: b.y, source: 'phaser', label, layer, clipped, pinned: false, path });
              }
            } catch { /* some objects refuse bounds */ }
          }

          if (obj.type === 'Text') {
            const style = obj.style as { fontSize?: string; fontFamily?: string; resolution?: number } | undefined;
            const size = parseFloat(String(style?.fontSize ?? '0'));
            // Empty text has no legibility to measure. Scenes create labels
            // up front and fill them in later, and scoring those reported
            // font-size failures for strings nobody can read. The DOM branch
            // below already required non-empty content; this side did not.
            const content = String(obj.text ?? '').trim();
            const tb = typeof getBounds === 'function' ? getBounds.call(obj) : null;
            if (size > 0 && content.length > 0) {
              texts.push({
                size,
                family: String(style?.fontFamily ?? ''),
                text: String(obj.text ?? '').slice(0, 60),
                layer, clipped, pinned: false, path,
                w: tb?.width ?? 0, h: tb?.height ?? 0, x: tb?.x ?? 0, y: tb?.y ?? 0,
                // Phaser keeps this on the TextStyle, not the Text object.
                // Reading obj.resolution gives undefined and marks every
                // text as failing.
                resolution: Number(style?.resolution ?? obj.resolution ?? 1),
                source: 'phaser',
                label: String(obj.name || obj.text || 'text').slice(0, 32),
              });
            }
          }

          const list = obj.list as unknown[] | undefined;
          if (Array.isArray(list)) {
            list.forEach((child, i) => visit(child as Record<string, unknown>, layer, `${path}.${i}`, depth + 1, clipped));
          }
        };
        (scene?.children?.list ?? []).forEach((child, i) => {
          const c = child as Record<string, unknown>;
          visit(c, Number(c.depth ?? 0), `p${i}`);
        });

        // DOM overlays: buttons and text nodes rendered outside the canvas.
        //
        // Including inside the in-game overlay iframes. They are same-origin
        // (/admin/*.html) so their documents are reachable, and they are
        // where findings 1 and 2 lived — the Paths exit off the bottom of
        // the screen and the missing "not yet" on adoption. Measuring the
        // host page alone sees an iframe and nothing in it.
        const docs: { doc: Document; ox: number; oy: number; full: boolean }[] =
          [{ doc: document, ox: 0, oy: 0, full: false }];
        for (const f of Array.from(document.querySelectorAll('iframe'))) {
          try {
            const d = f.contentDocument;
            if (!d || !d.body) continue;
            const r = f.getBoundingClientRect();
            docs.push({
              doc: d, ox: r.x, oy: r.y,
              full: r.width >= window.innerWidth * 0.9 && r.height >= window.innerHeight * 0.9,
            });
          } catch { /* cross-origin — nothing to measure */ }
        }
        // A full-screen overlay is opaque and on top: the canvas behind it
        // is not something a child can see or tap, so measuring both
        // together invents overlaps between them.
        const overlayCovers = docs.some((d) => d.full);
        if (overlayCovers) { boxes.length = 0; texts.length = 0; }

        /**
         * Walk up for the two facts a pairwise check needs.
         *
         * `clipped` — an ancestor actually scrolls. Not "has overflow:auto":
         * every one of these pages sets it on a wrapper that never
         * overflows, and treating those as scrollable excuses a control
         * that really is off the bottom. That is the mistake
         * measure-screens.mjs makes, and it is why the Paths exit passed
         * while hanging 8px off the screen.
         *
         * `pinned` — sticky or fixed. The exit rows on paths, adoption and
         * friends are sticky by design (review phase 0), so they sit over
         * the scrolling list on purpose and are not a collision.
         */
        /**
         * Actually rendered, ancestors included.
         *
         * `getComputedStyle(el).display` is the element's *own* display: a
         * button inside a `display: none` parent still reports
         * `inline-block`. Every admin mock page carries a design-preview
         * bar — "📱 iPhone (390×844)", "🖥 Desktop (1280×800)" — which the
         * page hides in-game with `body.embed .vp-bar { display: none }`,
         * so checking the button itself let all of it through at 11px and
         * buried the real font-size findings under 54 of these. The box
         * branch escaped it only because a hidden element has a zero rect
         * and boxes were already gated on that.
         */
        const rendered = (el: Element) => {
          const anyEl = el as Element & { checkVisibility?: (o?: unknown) => boolean };
          if (typeof anyEl.checkVisibility === 'function') {
            return anyEl.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true });
          }
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        };

        const domPath = (el: Element) => {
          const parts: number[] = [];
          let node: Element | null = el;
          while (node && node.parentElement) {
            parts.unshift(Array.prototype.indexOf.call(node.parentElement.children, node));
            node = node.parentElement;
          }
          return `d.${parts.join('.')}`;
        };

        const ancestry = (el: Element) => {
          let clipped = false, pinned = false;
          let node: Element | null = el;
          for (let i = 0; node && i < 24; i++) {
            const cs = getComputedStyle(node);
            if (cs.position === 'sticky' || cs.position === 'fixed') pinned = true;
            const scrolls = /(auto|scroll)/.test(cs.overflowY) || /(auto|scroll)/.test(cs.overflowX);
            if (scrolls && (node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1)) {
              clipped = true;
            }
            node = node.parentElement;
          }
          return { clipped, pinned, path: domPath(el) };
        };

        /**
         * The element's four real corners.
         *
         * `getBoundingClientRect` is the axis-aligned box AROUND a rotated
         * element, not the element: arrival's 300x48 pills sit on a plaque
         * tilted 0.8 degrees and report 52.2px tall. T4 charged that surplus
         * to both neighbours and failed a 12px gap as 7.8px.
         *
         * `getBoxQuads` would answer this directly but is not implemented in
         * the Chrome this runs in (checked). So: under any affine transform
         * the bounding box's centre IS the element's transformed centre, and
         * `offsetWidth/offsetHeight` is the untransformed border box. Walk the
         * ancestors for the accumulated 2x2 linear part, apply it to the half
         * extents, and the corners fall out exactly — rotation, scale and skew
         * alike. Undefined when nothing is transformed, so untransformed
         * elements cost nothing and `quadOf` uses their box.
         */
        const quadFor = (el: Element, r: DOMRect, ox: number, oy: number) => {
          let a = 1, b = 0, c = 0, d = 1;
          for (let n: Element | null = el; n; n = n.parentElement) {
            const t = getComputedStyle(n).transform;
            if (!t || t === 'none') continue;
            const m = new DOMMatrixReadOnly(t);
            [a, b, c, d] = [
              m.a * a + m.c * b, m.b * a + m.d * b,
              m.a * c + m.c * d, m.b * c + m.d * d,
            ];
          }
          if (a === 1 && b === 0 && c === 0 && d === 1) return undefined;
          const w0 = (el as HTMLElement).offsetWidth;
          const h0 = (el as HTMLElement).offsetHeight;
          if (!w0 || !h0) return undefined;
          const cx = r.x + r.width / 2 + ox, cy = r.y + r.height / 2 + oy;
          const hw = w0 / 2, hh = h0 / 2;
          return ([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]] as const)
            .map(([dx, dy]) => [cx + a * dx + c * dy, cy + b * dx + d * dy] as [number, number]);
        };

        for (const { doc, ox, oy, full } of docs) {
          if (overlayCovers && !full) continue;
          for (const el of Array.from(doc.querySelectorAll('button, [role="button"], a[href], input, select'))) {
            if (!rendered(el)) continue;
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
              boxes.push({
                w: r.width, h: r.height, x: r.x + ox, y: r.y + oy, source: 'dom', layer: 9998,
                label: (el.textContent ?? el.tagName).trim().slice(0, 32) || el.tagName,
                quad: quadFor(el, r, ox, oy),
                ...ancestry(el),
              });
            }
          }
          for (const el of Array.from(doc.querySelectorAll('p, span, label, h1, h2, h3, button, li'))) {
            if (!rendered(el)) continue;
            const cs = getComputedStyle(el);
            const size = parseFloat(cs.fontSize);
            const content = (el.textContent ?? '').trim();
            const r = el.getBoundingClientRect();
            if (size > 0 && content.length > 0 && el.children.length === 0
                && r.width > 0 && r.height > 0) {
              texts.push({
                size, family: cs.fontFamily, text: content.slice(0, 60),
                resolution: 1, source: 'dom', label: content.slice(0, 32), layer: 9998,
                w: r.width, h: r.height, x: r.x + ox, y: r.y + oy,
                ...ancestry(el),
              });
            }
          }
        }

        return {
          boxes,
          texts,
          overlayCovers,
          viewport: { w: window.innerWidth, h: window.innerHeight },
          dpr: window.devicePixelRatio || 1,
        };
      }, scene);

      const shotName = state === 'default' ? `${scene}-${vp.name}` : `${scene}-${state}-${vp.name}`;
      await page.screenshot({ path: path.join(OUT, `${shotName}.png`) });

      const findings: Measurement[] = [];
      // A modal draws into its own container above the scene, and the scene
      // stays in the display list underneath it. Keep only the topmost
      // layer when there is one, so the card's buttons are not compared
      // against the corridor's door signs with the whole card in between.
      const topLayer = Math.max(0, ...raw.boxes.map((b) => b.layer), ...raw.texts.map((t) => t.layer));
      const isModal = topLayer >= 800;
      const texts = (isModal ? raw.texts.filter((t) => t.layer === topLayer) : raw.texts);
      // Phaser getBounds() reports world coordinates, and scenes park
      // containers off-camera for slide-in animations. Measuring those as
      // "outside the safe margin" produced negative margins and a fix list
      // full of elements no child can see. Keep only what is on screen.
      const boxes = raw.boxes
        .filter((b) => !isModal || b.layer === topLayer)
        .filter(
          (b) =>
            b.x + b.w > 0 &&
            b.y + b.h > 0 &&
            b.x < raw.viewport.w &&
            b.y < raw.viewport.h,
        );
      const onLayer = raw.boxes.filter((b) => !isModal || b.layer === topLayer);
      const offScreen = onLayer.length - boxes.length;
      // Full-bleed elements — modal scrims, tap-anywhere-to-dismiss
      // backdrops, the interactive background of a scene — are *meant* to
      // reach the edges. Measuring them against a safe margin says the
      // backdrop is 224px too wide, which is not a defect and not something
      // to "fix" by shrinking it. Anything covering most of an axis is
      // chrome, not a control.
      const isFullBleed = (b: { w: number; h: number }) =>
        b.w >= raw.viewport.w * 0.9 || b.h >= raw.viewport.h * 0.9;
      const controls = boxes.filter((b) => !isFullBleed(b));
      const backdrops = boxes.length - controls.length;

      // ── T1-T3, T6: touch target sizes ────────────────────────────
      if (boxes.length > 0) {
        const shortest = Math.min(...boxes.map((b) => Math.min(b.w, b.h)));
        const under40 = boxes.filter((b) => Math.min(b.w, b.h) < 40).length;
        const under48 = boxes.filter((b) => Math.min(b.w, b.h) < 48).length;
        findings.push({
          id: 'T1-T3',
          rule: 'touch target size',
          verdict: band(shortest, 40, 48),
          detail:
            `smallest ${shortest.toFixed(0)}px; ${under40}/${boxes.length} under 40px, ${under48} under 48px` +
            (under48 > 0
              ? ` — ${boxes.filter((b) => Math.min(b.w, b.h) < 48).slice(0, 4).map((b) => `${b.label}:${Math.min(b.w, b.h).toFixed(0)}`).join(', ')}`
              : ''),
        });
      }

      // ── T4: spacing between adjacent targets ─────────────────────
      if (boxes.length > 1) {
        let tightest = Infinity;
        // Naming the pair, not just the number — "tightest gap 2px" is not
        // something you can go and fix.
        let tightestPair = '';
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i], b = boxes[j];
            // Between the shapes, not their bounding boxes — see gapBetween.
            // A rotated control's box is bigger than the control, and the
            // surplus was charged to both neighbours at once.
            const gap = gapBetween(a, b);
            // Only count pairs that actually sit beside each other. Touching
            // or overlapping is L8's question, not this one.
            if (gap === 0) continue;
            if (gap < tightest) {
              tightest = gap;
              tightestPair =
                `${a.label} ${a.w.toFixed(0)}x${a.h.toFixed(0)}@${a.x.toFixed(0)},${a.y.toFixed(0)}` +
                ` ↔ ${b.label} ${b.w.toFixed(0)}x${b.h.toFixed(0)}@${b.x.toFixed(0)},${b.y.toFixed(0)}`;
            }
          }
        }
        if (Number.isFinite(tightest)) {
          findings.push({
            id: 'T4',
            rule: 'spacing between targets',
            verdict: band(tightest, 8, 12),
            detail: `tightest gap ${tightest.toFixed(0)}px — ${tightestPair}`,
          });
        }
      }

      // ── F1-F5: font sizes ────────────────────────────────────────
      if (texts.length > 0) {
        const smallest = Math.min(...texts.map((t) => t.size));
        const under14 = texts.filter((t) => t.size < 14).length;
        findings.push({
          id: 'F1-F5',
          rule: 'font size',
          verdict: band(smallest, 14, 16),
          detail:
            `smallest ${smallest}px; ${under14}/${texts.length} under 14px` +
            (under14 > 0
              ? ` — ${texts.filter((t) => t.size < 14).slice(0, 5).map((t) => `"${t.text.slice(0, 14)}":${t.size}`).join(', ')}`
              : ''),
        });

        // ── F6: rounded sans-serif ─────────────────────────────────
        const ROUNDED = ['nunito', 'baloo', 'fredoka', 'quicksand', 'comic', 'rounded'];
        const offBrand = texts.filter(
          (t) => !ROUNDED.some((f) => t.family.toLowerCase().includes(f)),
        );
        findings.push({
          id: 'F6',
          rule: 'rounded sans-serif',
          verdict: offBrand.length === 0 ? 'PASS' : offBrand.length < texts.length ? 'WARN' : 'FAIL',
          detail: offBrand.length === 0
            ? 'all text on brand font'
            : `${offBrand.length}/${texts.length} off-brand, e.g. ${offBrand[0].family.slice(0, 40)}`,
        });

        // ── F7: ALL-CAPS body text ─────────────────────────────────
        const caps = texts.filter(
          (t) => t.text.length > 8 && t.text === t.text.toUpperCase() && /[A-Z]{4,}/.test(t.text),
        );
        findings.push({
          id: 'F7',
          rule: 'no ALL-CAPS body text',
          verdict: caps.length === 0 ? 'PASS' : caps.length <= 2 ? 'WARN' : 'FAIL',
          detail: caps.length === 0 ? 'none' : `${caps.length}, e.g. "${caps[0].text.slice(0, 30)}"`,
        });

        // ── F10: retina text resolution ────────────────────────────
        //
        // The rule is "resolution is set to devicePixelRatio", not
        // "resolution > 1". TEXT_RESOLUTION is Math.min(devicePixelRatio, 3),
        // and the test browser runs at deviceScaleFactor 1 — so checking for
        // >1 marks every scene as failing while the code is correct. Compare
        // against the ratio this browser actually reports instead. The suite
        // runs at scale 2 (see the project config) so this has something to
        // catch.
        const phaserText = texts.filter((t) => t.source === 'phaser');
        if (phaserText.length > 0) {
          const expected = raw.dpr;
          const wrong = phaserText.filter((t) => t.resolution < Math.min(expected, 3)).length;
          findings.push({
            id: 'F10',
            rule: 'text resolution for retina',
            verdict: wrong === 0 ? 'PASS' : wrong < phaserText.length ? 'WARN' : 'FAIL',
            detail: `${wrong}/${phaserText.length} below devicePixelRatio (${expected})`,
          });
        }
      }

      // ── L3: safe margins ─────────────────────────────────────────
      if (controls.length > 0) {
        const withMargin = controls.map((b) => ({
          b,
          m: Math.min(b.x, b.y, raw.viewport.w - (b.x + b.w), raw.viewport.h - (b.y + b.h)),
        }));
        withMargin.sort((p, q) => p.m - q.m);
        // Two different things hide in one number. A negative margin means the
        // element extends past an edge — which is exactly what content inside a
        // masked scroll container is supposed to do (the badge wall on
        // AccountScene clips 40-odd tiles that way). A small positive margin
        // means a control is visible and sitting too close to the edge, which
        // is the actual L3 defect. Only the second is scored here; overflow is
        // reported separately so it can be judged on its own.
        const onScreen = withMargin.filter((w) => w.m >= 0);
        const overflowing = withMargin.filter((w) => w.m < 0);
        const margin = onScreen.length > 0 ? onScreen[0].m : 16;
        const tight = onScreen.filter((w) => w.m < 16);
        findings.push({
          id: 'L3',
          rule: 'safe margin from edges',
          verdict: band(margin, 12, 16),
          detail:
            `closest ${margin.toFixed(0)}px` +
            (backdrops > 0 ? ` (${backdrops} full-bleed ignored)` : '') +
            (overflowing.length > 0 ? ` [${overflowing.length} clipped/scrolled]` : '') +
            (tight.length > 0
              ? ` — ${tight.slice(0, 4).map((w) => `${w.b.label}[${w.b.source}] ${w.m.toFixed(0)}px @ ${w.b.x.toFixed(0)},${w.b.y.toFixed(0)} ${w.b.w.toFixed(0)}x${w.b.h.toFixed(0)}`).join('; ')}`
              : ''),
        });
      }

      // ── L7: nothing interactive has its centre off screen ────────
      //
      // The Paths "Back to Luna" and adoption's "Not yet" both hung below
      // the bottom edge, on screens a child cannot leave without them, and
      // every other rule here passed them: they were the right size, the
      // right distance apart and in the right font. A control the child
      // cannot reach is the most serious defect this harness can find, so
      // it is FAIL on one instance, not banded.
      // Three different problems, and only one of them is a dead end. A
      // tile in AccountScene's masked badge wall and a household card in
      // the adoption office's list are both below the fold and both
      // reachable by scrolling; the Paths exit was in nothing that
      // scrolled and hung 8px off the bottom, which is `spilling`.
      // `controls` has already dropped anything that misses the viewport
      // entirely, because scenes park containers off-camera for slide-in
      // animations and scoring those produced a fix list of things nobody
      // can see. But a control parked off-camera and a control that fell
      // off the bottom look identical from here, so the second set is
      // named rather than counted: DepotScene's fourth build-mode card is
      // in it, at y 412 on a 375px screen, and it is not parked.
      const strayed = raw.boxes
        .filter((b) => (!isModal || b.layer === topLayer) && !b.clipped && !isFullBleed(b))
        .filter((b) => b.x >= raw.viewport.w || b.y >= raw.viewport.h || b.x + b.w <= 0 || b.y + b.h <= 0);
      const reach = reachability(controls, raw.viewport.w, raw.viewport.h);
      const broken = [...reach.unreachable, ...reach.spilling];
      findings.push({
        id: 'L7',
        rule: 'control fully on screen',
        verdict: broken.length === 0 ? 'PASS' : 'FAIL',
        detail: (broken.length === 0
          ? `all ${controls.length} reachable`
          : `${reach.unreachable.length} unreachable, ${reach.spilling.length} part off, of ${controls.length} — ` +
            broken.slice(0, 4).map((b) => `${b.label} ${at(b)}`).join('; '))
          + (reach.belowFold.length > 0 ? ` [${reach.belowFold.length} below the fold, in something that scrolls]` : '')
          + (strayed.length > 0
            ? ` [${strayed.length} nowhere near the screen — parked for a slide-in, or lost: ${strayed.slice(0, 3).map((b) => `${b.label} ${at(b)}`).join('; ')}]`
            : ''),
      });

      // ── L8: two controls sharing a region ────────────────────────
      //
      // Findings 3, 7 and 8: the rail over the nav bar, Decorate over the
      // audio orb, the rail's Welcome over the corridor's. A child aiming
      // at one gets the other and has no model for why — pressing the
      // right half of Decorate turned the music off.
      //
      // Containment is not the same defect and is not scored: a button
      // sitting inside a tappable card is how cards work. Partial overlap
      // is the ambiguous case, and it is the one reported.
      const allPairs = overlappingControls(controls);
      const overlaps = allPairs.filter((o) => o.kind === 'partial').map((o) => ({
        a: `${o.a.label} ${at(o.a)}`, b: `${o.b.label} ${at(o.b)}`,
        share: Math.round(o.share * 100), rect: '',
      }));
      // Stacked pairs are reported and not scored: one control entirely
      // inside another is sometimes a card carrying a button and
      // sometimes a Back button that landed on one, and nothing here can
      // tell them apart. Draw order decides which gets the tap either way.
      const stacked = allPairs.filter((o) => o.kind === 'stacked');
      findings.push({
        id: 'L8',
        rule: 'controls do not overlap',
        verdict: overlaps.length === 0 ? 'PASS' : overlaps.length <= 2 ? 'WARN' : 'FAIL',
        detail: (overlaps.length === 0
          ? 'no overlapping pairs'
          : `${overlaps.length} pairs — ` +
            overlaps.slice(0, 3).map((o) => `${o.a} x ${o.b} (${o.share}%)`).join('; '))
          + (stacked.length > 0
            ? ` [${stacked.length} stacked, draw order decides: ${stacked.slice(0, 2).map((o) => `${o.a.label} ${at(o.a)} over ${o.b.label} ${at(o.b)}`).join('; ')}]`
            : ''),
      });

      // ── L9: a control printed across text it does not own ────────
      //
      // A label inside its own button is contained by it, so it scores
      // nothing here. What does score: text that a control covers only
      // part of. That is either the rail card's second story line printed
      // under its own Welcome button, or a label wider than the button
      // that grew to hold it — createButton adds 28px of padding a side
      // and silently widens past the width it was asked for.
      const coveredText = textCutByControls(
        texts.map((t) => ({ ...t, label: t.text.slice(0, 30) })), controls,
      ).map((o) => ({
        text: o.text.label, by: `${o.by.label} ${at(o.by)}`,
        share: Math.round(o.share * 100), rect: at(o.text),
      }));
      findings.push({
        id: 'L9',
        rule: 'text not cut by a control',
        verdict: coveredText.length === 0 ? 'PASS' : coveredText.length <= 2 ? 'WARN' : 'FAIL',
        detail: coveredText.length === 0
          ? `${texts.length} text runs clear`
          : `${coveredText.length} — ` +
            coveredText.slice(0, 3).map((o) => `"${o.text}" ${o.share}% under ${o.by}`).join('; '),
      });

      // ── L6: how many controls the screen is offering ─────────────
      //
      // Counted one interactive object at a time until 31 August, which
      // made AccountScene 21 and failing: a Back button and twenty
      // identical badge tiles in a scrolling wall, each tappable for its
      // description. Twenty instances of one choice is not twenty choices,
      // and counting them that way meant the rule got angrier the more
      // badges a child had earned. `groupRepeatedTiles` collapses a
      // scrolling grid of same-sized tiles and leaves everything else
      // alone — a nav bar of five tabs is still five. The raw count stays
      // in the detail so the collapse is visible rather than assumed.
      const groups = groupRepeatedTiles(boxes);
      const galleries = groups.filter((g) => g.gallery);
      const distinct = groups.length;
      findings.push({
        id: 'L6',
        rule: 'distinct controls on screen',
        verdict: distinct <= 8 ? 'PASS' : distinct <= 12 ? 'WARN' : 'FAIL',
        detail: (galleries.length === 0
          ? `${boxes.length} interactive`
          : `${distinct} controls — ${boxes.length} interactive, ` +
            galleries.map((g) => `${g.members.length} of them one repeated tile`).join('; '))
          + (offScreen > 0 ? ` (+${offScreen} parked off-screen)` : ''),
      });

      // A state that failed to open is not a passing state. Say so loudly
      // rather than reporting the corridor's numbers under the card's name.
      if (stateResult !== state) {
        findings.push({
          id: 'S0', rule: 'state opened', verdict: 'FAIL',
          detail: `asked for "${state}", got "${stateResult}" — the numbers below are of whatever was on screen`,
        });
      }

      reports.push({
        scene,
        state,
        viewport: vp.name,
        interactiveCount: boxes.length,
        // What L6 scores: a scrolling grid of identical tiles counted once.
        // Equal to interactiveCount on every screen that has no such grid.
        distinctControlCount: distinct,
        textCount: texts.length,
        findings,
        offenders: {
          smallTargets: boxes
            .filter((b) => Math.min(b.w, b.h) < 48)
            .map((b) => ({
              label: b.label,
              w: Math.round(b.w), h: Math.round(b.h),
              x: Math.round(b.x), y: Math.round(b.y),
              source: b.source,
            })),
          smallText: texts
            .filter((t) => t.size < 14)
            .map((t) => ({ text: t.text, size: t.size, source: t.source })),
          offCentre: broken.map((b) => ({
            label: b.label,
            cx: Math.round(b.x + b.w / 2), cy: Math.round(b.y + b.h / 2),
            w: Math.round(b.w), h: Math.round(b.h),
          })),
          overlaps,
          coveredText,
        },
      });

      // Put the scene back before the next state, so an overlay left
      // mounted is not measured as part of the one after it.
      if (state !== 'default') {
        await page.evaluate(() => {
          /* eslint-disable @typescript-eslint/no-explicit-any */
          const g = (window as any).__PHASER_GAME__;
          const gs = g?.scene.scenes.find((s: any) => s.sys.settings.key === 'GameScene');
          try { gs?.closePopup?.(); } catch { /* not open */ }
          for (const f of Array.from(document.querySelectorAll('iframe'))) f.remove();
        });
        await page.waitForTimeout(300);
      }
      }
    }
  }

  fs.writeFileSync(path.join(OUT, 'ux-report.json'), JSON.stringify(reports, null, 2));

  // ── Report ─────────────────────────────────────────────────────
  const named = (r: SceneReport) => (r.state === 'default' ? r.scene : `${r.scene}/${r.state}`);
  const fails = reports.flatMap((r) =>
    r.findings.filter((f) => f.verdict === 'FAIL').map((f) => ({ ...f, scene: named(r), viewport: r.viewport })),
  );
  const warns = reports.flatMap((r) =>
    r.findings.filter((f) => f.verdict === 'WARN').map((f) => ({ ...f, scene: named(r), viewport: r.viewport })),
  );

  const pad = (s: string, n: number) => s.padEnd(n);
  console.log(`\n${'='.repeat(88)}\nFAIL (${fails.length})\n${'='.repeat(88)}`);
  for (const f of fails) {
    console.log(`${pad(f.scene, 28)} ${pad(f.viewport, 8)} ${pad(f.id, 7)} ${pad(f.rule, 26)} ${f.detail}`);
  }

  console.log(`\n${'='.repeat(88)}\nWARN (${warns.length})\n${'='.repeat(88)}`);
  for (const f of warns) {
    console.log(`${pad(f.scene, 28)} ${pad(f.viewport, 8)} ${pad(f.id, 7)} ${pad(f.rule, 26)} ${f.detail}`);
  }

  // Which rules fail most often — that is the fix order.
  const byRule = new Map<string, number>();
  for (const f of fails) byRule.set(`${f.id} ${f.rule}`, (byRule.get(`${f.id} ${f.rule}`) ?? 0) + 1);
  console.log(`\n${'='.repeat(88)}\nFIX ORDER — rules by how many scene/viewport combinations fail\n${'='.repeat(88)}`);
  for (const [rule, n] of [...byRule].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)} x  ${rule}`);
  }
  console.log(
    `\n${reports.length} scene/viewport combinations measured. ` +
    `${fails.length} FAIL, ${warns.length} WARN.\n` +
    `Screenshots and ux-report.json in e2e/__ux__/\n`,
  );
});
