import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForGameReady, seedFakeSession } from './helpers';

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
 *   L6         interactive element count per screen
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

type Verdict = 'PASS' | 'WARN' | 'FAIL';

interface Measurement {
  id: string;
  rule: string;
  verdict: Verdict;
  detail: string;
}

interface SceneReport {
  scene: string;
  viewport: string;
  interactiveCount: number;
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
  };
}

/** Banded check: >= pass → PASS, >= warn → WARN, else FAIL. */
function band(value: number, warn: number, pass: number): Verdict {
  if (value >= pass) return 'PASS';
  if (value >= warn) return 'WARN';
  return 'FAIL';
}

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

      // Harvest every interactive element and every text run, from the
      // Phaser scene graph and from any HTML overlay that is mounted.
      const raw = await page.evaluate((key) => {
        interface Box { w: number; h: number; x: number; y: number; source: string; label: string }
        interface Txt { size: number; family: string; text: string; resolution: number; source: string; label: string }

        const boxes: Box[] = [];
        const texts: Txt[] = [];

        const g = (window as unknown as {
          __PHASER_GAME__?: {
            scene: { scenes: Array<{ sys: { settings: { key: string } }; children?: { list: unknown[] } }> };
          };
        }).__PHASER_GAME__;
        const scene = g?.scene.scenes.find((s) => s.sys.settings.key === key);

        // Phaser: recurse the display list, including into containers.
        const visit = (obj: Record<string, unknown>, depth = 0) => {
          if (!obj || depth > 12) return;
          // Hidden objects are not a UX problem. Scenes keep pools of
          // pre-built labels toggled with setVisible — the obstacle markers
          // in SupplyRunScene are built once and shown on collision — and
          // measuring those reported font sizes for text nobody can read.
          // A container that is hidden hides its children too, so this
          // prunes the whole branch.
          if (obj.visible === false || obj.alpha === 0) return;
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
                boxes.push({ w: b.width, h: b.height, x: b.x, y: b.y, source: 'phaser', label });
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
            if (size > 0 && content.length > 0) {
              texts.push({
                size,
                family: String(style?.fontFamily ?? ''),
                text: String(obj.text ?? '').slice(0, 60),
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
          if (Array.isArray(list)) for (const child of list) visit(child as Record<string, unknown>, depth + 1);
        };
        for (const child of scene?.children?.list ?? []) visit(child as Record<string, unknown>);

        // DOM overlays: buttons and text nodes rendered outside the canvas.
        for (const el of Array.from(document.querySelectorAll('button, [role="button"], a[href], input, select'))) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            boxes.push({
              w: r.width, h: r.height, x: r.x, y: r.y, source: 'dom',
              label: (el.textContent ?? el.tagName).trim().slice(0, 32) || el.tagName,
            });
          }
        }
        for (const el of Array.from(document.querySelectorAll('p, span, label, h1, h2, h3, button, li'))) {
          const cs = getComputedStyle(el);
          const size = parseFloat(cs.fontSize);
          const content = (el.textContent ?? '').trim();
          if (size > 0 && content.length > 0 && el.children.length === 0) {
            texts.push({
              size, family: cs.fontFamily, text: content.slice(0, 60),
              resolution: 1, source: 'dom', label: content.slice(0, 32),
            });
          }
        }

        return {
          boxes,
          texts,
          viewport: { w: window.innerWidth, h: window.innerHeight },
          dpr: window.devicePixelRatio || 1,
        };
      }, scene);

      await page.screenshot({ path: path.join(OUT, `${scene}-${vp.name}.png`) });

      const findings: Measurement[] = [];
      const { texts } = raw;
      // Phaser getBounds() reports world coordinates, and scenes park
      // containers off-camera for slide-in animations. Measuring those as
      // "outside the safe margin" produced negative margins and a fix list
      // full of elements no child can see. Keep only what is on screen.
      const boxes = raw.boxes.filter(
        (b) =>
          b.x + b.w > 0 &&
          b.y + b.h > 0 &&
          b.x < raw.viewport.w &&
          b.y < raw.viewport.h,
      );
      const offScreen = raw.boxes.length - boxes.length;
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
            const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
            const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
            // Only count pairs that actually sit beside each other.
            if (dx === 0 && dy === 0) continue;
            const gap = dx === 0 ? dy : dy === 0 ? dx : Math.hypot(dx, dy);
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

      // ── L6: interactive count ────────────────────────────────────
      findings.push({
        id: 'L6',
        rule: 'interactive elements on screen',
        verdict: boxes.length <= 8 ? 'PASS' : boxes.length <= 12 ? 'WARN' : 'FAIL',
        detail: `${boxes.length} interactive${offScreen > 0 ? ` (+${offScreen} parked off-screen)` : ''}`,
      });

      reports.push({
        scene,
        viewport: vp.name,
        interactiveCount: boxes.length,
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
        },
      });
    }
  }

  fs.writeFileSync(path.join(OUT, 'ux-report.json'), JSON.stringify(reports, null, 2));

  // ── Report ─────────────────────────────────────────────────────
  const fails = reports.flatMap((r) =>
    r.findings.filter((f) => f.verdict === 'FAIL').map((f) => ({ ...f, scene: r.scene, viewport: r.viewport })),
  );
  const warns = reports.flatMap((r) =>
    r.findings.filter((f) => f.verdict === 'WARN').map((f) => ({ ...f, scene: r.scene, viewport: r.viewport })),
  );

  const pad = (s: string, n: number) => s.padEnd(n);
  console.log(`\n${'='.repeat(88)}\nFAIL (${fails.length})\n${'='.repeat(88)}`);
  for (const f of fails) {
    console.log(`${pad(f.scene, 22)} ${pad(f.viewport, 8)} ${pad(f.id, 7)} ${pad(f.rule, 26)} ${f.detail}`);
  }

  console.log(`\n${'='.repeat(88)}\nWARN (${warns.length})\n${'='.repeat(88)}`);
  for (const f of warns) {
    console.log(`${pad(f.scene, 22)} ${pad(f.viewport, 8)} ${pad(f.id, 7)} ${pad(f.rule, 26)} ${f.detail}`);
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
