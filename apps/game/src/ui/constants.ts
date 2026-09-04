// Shared UI constants — colours derived from the A.R.C. logo
//
//   Logo palette:
//     🟢 Green lettering  → #5AAE4A (primary)
//     🔴 Red heart/paw    → #D44040 (accent)
//     🟠 Orange outlines  → #D4783C (warm)
//     🟤 Brown text        → #3a2e22 (text)
//     🟡 Cream background → #fef9ef (bg)

export const COLOURS = {
  // ── Brand greens (from "A.R.C." lettering) ──
  primary: '#3D8A2E',
  primaryDark: '#2D6B1F',
  primaryLight: '#7CC76E',

  // ── Brand reds (from heart/paw) ──
  accent: '#A82020',
  accentDark: '#B83030',
  accentLight: '#E06060',

  // ── Brand orange (from outlines/subtitle) ──
  warm: '#A85A28',
  warmDark: '#B86428',
  warmLight: '#E09050',

  // ── Calm blue (for secondary / info actions) ──
  info: '#2E6B8A',
  infoDark: '#1F5570',
  infoLight: '#5A9CB8',

  // ── Neutrals ──
  bg: '#fef9ef',
  bgDark: '#f5ebe0',
  text: '#3a2e22',
  textLight: '#6b5a4a',
  white: '#ffffff',
  error: '#c0392b',
  inputBg: '#f5efe4',
  inputBorder: '#d4c8b8',
} as const;

/**
 * One brand hue per navigation destination.
 *
 * The four painted nav icons share a single cream disc with a brown ring —
 * they read as a set, which is right, but it means the only thing telling
 * Home from Care at a glance is a 30px painting of a building against a
 * 30px painting of a bowl. A child learning the game has to read the label
 * every time.
 *
 * So the cell carries a colour and the icon does not have to. Nothing here
 * is invented: the brand has exactly four hues and each destination's
 * subject is already painted in its own one — the rescue centre's roof is
 * green, the food bowl is the brand orange, the gift box is the brand red.
 * Walk takes the blue, which is the one hue with no object of its own and
 * the right temperature for outdoors.
 *
 * **Colour reinforces here, it does not carry.** The labels stay — they
 * were set at the readability floor for a 7-11 year old and were not
 * traded for layout, so they are not traded for colour either. A child who
 * does not see red and green apart loses nothing they had before.
 */
export const NAV_COLOURS = {
  home: COLOURS.primary,
  care: COLOURS.warm,
  walk: COLOURS.info,
  social: COLOURS.accent,
  /** Back is not a destination; it stays neutral so the four keep meaning. */
  back: COLOURS.textLight,
} as const;

/** '#rrggbb' → 0xRRGGBB, so the Phaser side can draw straight from COLOURS. */
export function hexNum(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

export const FONTS = {
  title: '"Nunito", "Baloo 2", "Fredoka", system-ui, -apple-system, sans-serif',
  body: '"Nunito", system-ui, -apple-system, sans-serif',
  /**
   * Handwritten / chalk style — chalkboards, hand-hung notes, anywhere we
   * want marker or chalk rather than printed type.
   *
   * **Caveat does not honour the type scale, and it is the only face that
   * does not.** Measured 2026-09-03 with a warmed canvas probe, x-height at
   * 16px against Nunito's 7.89:
   *
   *   Quicksand   8.26   105%
   *   Kalam       8.18   104%
   *   Gochi Hand  7.84    99%
   *   Fredoka     7.72    98%
   *   Caveat      5.71    72%   ← needs 22.1px to read as 16px does
   *
   * So five of the six faces agree within 5% and `TYPE.caption` means the
   * same thing in all of them; in Caveat it means about 11.6px. F1-F5
   * cannot see this — it measures the number, not the face.
   *
   * `font-size-adjust: 0.49` is the fix on the DOM side and it works here
   * (tested: Caveat at 16px goes from 129.5px wide to 177.7 against
   * Nunito's 175.3, i.e. within 1.4%). It is **not applied yet**: Caveat is
   * on ~50 rules across 20 shipping screens and the correction widens every
   * one of them by 37%, which is a layout decision rather than a sweep.
   * Canvas text has no equivalent property, so the Phaser side would need
   * the multiplier written out.
   *
   * Note also that several DOM stacks read `'Caveat', 'Kalam', cursive` —
   * two faces 44% apart in apparent size, so which one loads decides how
   * big the text looks.
   */
  chalk: '"Caveat", "Patrick Hand", "Comic Sans MS", cursive',
  /**
   * Chrome type — everything non-diegetic: nav, HUD, view titles, panels,
   * buttons. Deliberately a *system* face rather than a webfont.
   *
   * The sign screens carry 500 `font-family` declarations resolving to 39
   * distinct stacks, reaching for Barlow Condensed, Oswald, DM Sans, Kalam
   * and more. With that many stacks and webfonts that may not all have
   * loaded, a fallback firing somewhere was inevitable — it is what renders
   * login's primary button in system sans today. A stack that starts at a
   * face iOS always has cannot fall through to something unintended, so the
   * chrome looks the same on the first frame as on the hundredth.
   *
   * `ui-rounded` is the WebKit generic that maps to SF Pro Rounded, which is
   * the friendly-but-plain register this game's chrome wants. Nunito is
   * deliberately absent: putting a webfont mid-stack would reintroduce the
   * load-order dependency this exists to remove.
   *
   * **Measured inside the shipped app**, 2026-09-02, iPhone 17 Pro
   * simulator at 874x402 — an on-page canvas probe, because you cannot run
   * JS in the app without Web Inspector (see TRAPS.md). Widths for
   * "Garden — Quiet nook" at 20px:
   *
   *   this whole stack   187.86   ← resolves
   *   ui-rounded         187.86   ← and this is the entry that wins
   *   "SF Pro Rounded"   178.29   ← identical to a nonexistent family
   *   system-ui          186.12
   *   -apple-system      186.12
   *   nonexistent        178.29
   *
   * So the chrome really does render in the rounded face on device, which
   * was the open question — and `"SF Pro Rounded"` by name does *not*
   * resolve on iOS. It is kept because it is a real family name that may
   * resolve on other platforms, but it is not what is holding this up:
   * `ui-rounded` is, and it is first for that reason.
   */
  ui: 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
} as const;

/**
 * The one non-diegetic surface.
 *
 * A.R.C. currently speaks three visual languages — hand-painted wood on the
 * sign screens, translucent white glass on the HUD and panels, and flat
 * vector/emoji in the rail — with no rule for which to use. The kitchen has
 * all three in one frame. A child crossing from a painted signpost yard into
 * a screen of white pills reads two products stitched together, and that
 * costs more than any individual screen's layout.
 *
 * The rule: **painted is diegetic only.** The hand-painted boards are
 * artwork — objects inside the world, which a child could believe someone
 * nailed up. Everything else is chrome: it sits *over* the world rather than
 * in it, and gets this surface instead. Warm cream paper with a hairline
 * border and a soft shadow — the same surface the left rail already draws,
 * promoted from one view's local styling to the thing every view uses.
 *
 * Cream rather than white glass on purpose. Non-diegetic does not have to
 * mean generic: the paper shares the painted world's warmth without
 * borrowing its grain, bolts or bevels.
 *
 * Drawn by `createChromePlate` in `ui/UIButton.ts`. Reach for that rather
 * than these numbers; they are exported so the geometry stays testable.
 */
export const CHROME = {
  /** COLOURS.bg — the cream the logo sits on. */
  fill: hexNum(COLOURS.bg),
  fillAlpha: 0.96,
  /**
   * The fill for a plate that sits in the *middle* of the painted world
   * rather than at its edge — an empty state, a "well-fed" panel, a toast.
   *
   * Those are the big ones. A title plate is a strip along the top and
   * costs the art almost nothing; a message panel is 300x70 in the centre
   * of a room a child is looking at, and at 0.96 it is a hole in the
   * painting. At 0.84 the room reads through it and the words still sit on
   * paper rather than on grass.
   *
   * Not lower, and this is the limit rather than a preference: the ink
   * contrast a test holds is measured against `fill`, and every point of
   * alpha given away is contrast handed to whatever happens to be painted
   * behind. 0.84 keeps `ink` above 4.5:1 on the darkest room art in the
   * game; a message that needs to be quieter than this wants to be smaller
   * instead.
   */
  fillAlphaOverArt: 0.84,
  /** COLOURS.inputBorder — the same hairline the inputs use. */
  stroke: hexNum(COLOURS.inputBorder),
  strokeAlpha: 0.9,
  strokeWidth: 1.5,
  radius: 16,
  shadowColour: 0x000000,
  shadowAlpha: 0.18,
  shadowX: 3,
  shadowY: 4,
  /** Breathing room between the plate's edge and whatever sits on it. */
  padX: 18,
  padY: 12,
  /**
   * The inks that may go on this plate. All three clear 4.5:1 against the
   * fill, which a test holds.
   *
   * `inkAccent` is `primaryDark`, not `primary`, and that is the whole
   * reason it exists: the brand green measures **4.11:1** on this cream
   * and does not pass. It is the green the kitchen sets "Everyone is
   * well-fed!" in, so the first panel converted onto this surface would
   * have carried a failing heading, and so would the fourteen after it.
   * Reach for these rather than picking from `COLOURS` at the call site.
   */
  ink: COLOURS.text,
  inkMuted: COLOURS.textLight,
  inkAccent: COLOURS.primaryDark,
  inkDanger: COLOURS.accent,
} as const;

/**
 * Collar colour palette — used when the player picks a collar for a pet
 * (the walk minigame's first phase) and when rendering a bonded animal's
 * collar in the room view. Shared so the picker and the renderer can't
 * drift out of sync.
 */
export const COLLAR_COLOURS = [
  { name: 'Red',    hex: '#e74c3c' },
  { name: 'Blue',   hex: '#3498db' },
  { name: 'Green',  hex: '#2ecc71' },
  { name: 'Purple', hex: '#9b59b6' },
  { name: 'Orange', hex: '#e67e22' },
  { name: 'Pink',   hex: '#ff6b9d' },
  { name: 'Gold',   hex: '#f1c40f' },
  { name: 'Teal',   hex: '#1abc9c' },
] as const;

export const AVATAR_EMOJIS = [
  '🐱', '🐶', '🐰', '🦊', '🐻', '🐼', '🐨', '🐸',
  '🦉', '🐝', '🐞', '🦋', '🐢', '🐙', '🐬', '🦩',
  '🐧', '🐴', '🦜', '🐿️', '🦇', '🐍', '🐠', '🦎',
  '🐾', '🦔', '🐳', '🦈', '🦆', '🐛',
] as const;

export const AVATAR_BG_COLOURS = [
  '#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9',
  '#BAE1FF', '#E8BAFF', '#FFB3E6', '#B3FFE6',
  '#FFD9B3', '#D9B3FF', '#B3D9FF', '#C9FFB3',
] as const;

/**
 * Pluralise a species name correctly.
 */
export function pluralSpecies(species: string, count: number): string {
  if (count === 1) return species;
  if (species === 'bunny') return 'bunnies';
  if (species === 'fox') return 'foxes';
  return species + 's';
}

/**
 * Device pixel ratio for crisp text on retina displays.
 * Cached once at startup so we don't read it every frame.
 */
export const TEXT_RESOLUTION = typeof window !== 'undefined'
  ? Math.min(window.devicePixelRatio || 1, 3)
  : 2;

/**
 * The spacing scale — every gap, inset and gutter in the game.
 *
 * `TYPE` names the sizes, `COLOURS` the inks and `CHROME` the surface.
 * Nothing named a *gap*, and it showed: **17 distinct outer page margins**
 * across 60 uses (`width - 40` nineteen times, `- 80` nine, `- 60` eight,
 * `- 70` five, and thirteen more), and 18 distinct corner radii across 89
 * hand-drawn boxes. `SAFE_MARGIN` was the outer margin in 3 places out of 60.
 *
 * The clearest illustration is Depot and SupplyRun: the same component,
 * written twice, one on a 40px margin with a 12px row gap and the other on
 * 30 with a pitch that let its cards overlap. Two adjacent screens copied
 * from each other, already disagreeing.
 *
 * A 4/8 grid, because that is what the values already cluster on and because
 * halves and doubles of it stay whole. Reach for a name; if none fits, the
 * layout wants rethinking rather than a seventeenth number.
 */
export const SPACE = {
  /** Hairline separation — a label from its icon. */
  xs: 4,
  /** Inside a chip or a pill. */
  s: 8,
  /** Between rows of the same thing. */
  m: 12,
  /** Between two different things. Equal to `SAFE_MARGIN`. */
  l: 16,
  /** Between groups. The page margin. */
  xl: 24,
  /** Between sections, and above a screen's first content. */
  xxl: 32,
} as const;

/**
 * Where a screen's content starts, measured in from the edge.
 *
 * Distinct from `SAFE_MARGIN`, which is the *floor* for an interactive
 * control's clearance — a hard minimum a hit area may not cross. This is a
 * composition choice about where a card grid or a panel begins, and it sits
 * one step outside the floor so a control at the content edge still has
 * somewhere to be.
 *
 * The game's own commonest value was 20 a side (`width - 40`, 19 uses); 24
 * is the nearest step of the scale and clears `SAFE_MARGIN` by 8.
 */
export const PAGE_MARGIN = SPACE.xl;

/**
 * Minimum clearance between any interactive element and the screen edge.
 *
 * 16px is the pass threshold in the children's UX checklist (L3). On a
 * phone the bottom edge is the home-gesture area and the top may hold a
 * notch, so a control sitting flush to the edge is either hard to hit or
 * intercepted by the OS before the game sees it.
 *
 * Use it for any row or control positioned relative to `scale.width` /
 * `scale.height` rather than inventing a local padding number.
 */
export const SAFE_MARGIN = 16;

/**
 * Minimum size, in px, of anything a child has to hit.
 *
 * 48 is the pass threshold in the checklist (T1-T3); 40 is the WARN band.
 * The evidence for 7-11 year-olds is that targeting accuracy is meaningfully
 * worse than an adult's, and a miss in this game is not a nuisance — it is
 * tapping the wrong animal.
 *
 * It applies to the *hit area*, not the art. The established pattern is a
 * transparent rectangle or circle sized to this and added on top, so a 30px
 * pill can stay 30px and still be comfortably tappable:
 *
 *   scene.add.rectangle(x, y, Math.max(w, MIN_TAP), Math.max(h, MIN_TAP), 0, 0)
 *     .setInteractive({ useHandCursor: true })
 *
 * Adjacent targets also need `MIN_TAP_GAP` between them, or two 48px buttons
 * flush against each other are one 96px button as far as a small hand is
 * concerned.
 */
export const MIN_TAP = 48;

/** Minimum clear space between two adjacent interactive elements (T4). */
export const MIN_TAP_GAP = 12;

/**
 * Centre-line for a view's title plate.
 *
 * The HUD constrains itself to the play area's origin and leaves a gap in
 * the middle for exactly this (see `HUDView`), and the gap is in the
 * *first* row — the second carries the phase and weather pills across
 * y 78..106 and is drawn after the view container, so it lands on top of
 * anything a view puts there.
 *
 * Corridor, room and garden each declared their own `const TITLE_CY = 45`,
 * which is three copies of one shared constraint and precisely how the
 * garden's title came to be centred on `width` while its siblings used the
 * play origin. One number, one place.
 *
 * **It now means every title plate, not only the ones inside GameScene.**
 * The constant said "one number, one place" and was used by four files while
 * 25 other `createChromeTitle` calls picked their own — 30, 34, 35, 40, 45,
 * 50, 55, 60, eight values with nothing choosing between them. The standalone
 * scenes have no HUD to dodge, so 45 is not derived from anything for them;
 * it is derived from *consistency*, which is the whole point. A child moving
 * from the corridor to the Depot to the vet should not see the title jump.
 *
 * The plate is about 46px tall, so a centre of 45 puts its top edge on 22 —
 * clear of `SAFE_MARGIN` and of the notch, and level with a top-left Back
 * button anchored at `EDGE_CONTROL_INSET`.
 */
export const TITLE_CY = 45;

/**
 * The drawn height of a one-line chrome title, and the y of the row that
 * sits under it in the side-nav header.
 *
 * A measured constant rather than a coupling: the title is drawn by the
 * room view and the status chips by `HUDView`, and the two never meet.
 * `createChromeTitle` builds a one-line plate at `TYPE.lead` as
 * `text.height + CHROME.padY * 2` — 27 + 24 — so the plate runs
 * `TITLE_CY ± 25.5`.
 *
 * **A two-line title under side-nav invalidates this**, and the subtitle
 * option is exactly how that would happen. No side-nav view uses one
 * today; if one does, this is the number that has to start being measured
 * rather than assumed.
 */
export const TITLE_PLATE_H = 51;

/**
 * Where a mid-room message panel's *bottom* sits, as a fraction of the
 * play box.
 *
 * Messages used to be centred on the band, which on a 402pt screen put
 * "No pets yet!" at y 96..170 — level with the status chips and close
 * enough to the header that any longer string would have met it. Sitting
 * them low removes the collision rather than tuning the gap.
 *
 * 0.65 is not arbitrary: on the garden it is the top of the painted bird
 * bath, which is the line Marcus picked by eye, and the number holds
 * across viewports because the art is drawn to the play box, so a fraction
 * of the box tracks a fraction of the painting. On the other rooms it is
 * the lower third, which is where the floor is — a panel there covers
 * scenery rather than subject.
 */
export const MESSAGE_BOTTOM_FRAC = 0.65;

/**
 * Centre-line of the icon-only status chips under the side-nav title.
 *
 * `SPACE.l`, not `SPACE.s`: the row below the header carries controls (the
 * two sound pills) and the row above carries controls (the level orb, the
 * arrivals badge), so what separates them is a tap gap rather than a
 * reading gap. At 8 the measured gap between the orb and the pill under it
 * was 8px against a `MIN_TAP_GAP` of 12.
 */
export function statusRowCy(chipRadius: number): number {
  return TITLE_CY + TITLE_PLATE_H / 2 + SPACE.l + chipRadius;
}

/**
 * The first y a screen's own content may occupy, below its title plate.
 *
 * Moving all 29 titles onto `TITLE_CY` broke two screens, and how it broke
 * them is the point. Social derived its tab row from `30 + title.height / 2
 * + ...` and the kitchen put its info panel at a bare `78` — both correct
 * arithmetic against a **copy** of the title's y, taken when that y was 30
 * and 34. Move the title and the copies stay where they were, so the plate
 * landed on the tabs and on the panel. Neither screen was wrong; each held
 * the same fact twice.
 *
 * Derived from the *drawn* title rather than an assumed plate height, so a
 * longer title, a bigger step of the scale or an icon all carry through.
 * `createChromeTitle` returns the object; hand it straight to this.
 */
export function contentTopFor(title: { height: number }): number {
  return TITLE_CY + title.height / 2 + SPACE.m;
}

/**
 * The vertical middle of a screen's content band — under the title, above
 * the bottom control.
 *
 * Content is stacked from offsets off `height / 2`, and there are **16
 * distinct ones** in use across the celebration, collar, play, vet, kitchen
 * and conflict views: -90, -68, -60, -40, -36, -30, -20, -15, -8, +10, +24,
 * +25, +40, +50, +90, +110. The horizontal band is honoured religiously and
 * the vertical was improvised.
 *
 * The clearest case is Social, which computes a proper content top and then
 * draws its empty state at `height / 2 - 30` — 62px above the middle of the
 * band it had just worked out, which is exactly what the screen looks like:
 * text crowded under the tabs, a void, then the back link.
 *
 * `contentTop` is what `contentTopFor` returned; the floor is the bottom
 * control's anchor.
 */
export function bandCentreY(height: number, contentTop: number): number {
  return (contentTop + bottomAnchorY(height) - MIN_TAP / 2) / 2;
}

/**
 * Distance from an edge to the *centre* of a control anchored against it.
 *
 * Controls at or past the screen edge is a recurring class, not an
 * incident: TRAPS.md already records the garden's upgrade button under the
 * nav bar and its left zone arrow inside the rail's reserved column, both
 * unreachable on every viewport for as long as they had existed, and the
 * audit found the right zone arrow flush to the screen edge on top of
 * that. What they share is a hand-picked gap — 25, 30, 35 — chosen against
 * the control's old drawn size and never revisited when the hit area was
 * floored at MIN_TAP.
 *
 * Half the tap floor plus the margin is the whole rule: it puts the
 * control's *outer* edge exactly SAFE_MARGIN clear, whatever is drawn
 * inside it. Anchor from this rather than inventing a local number.
 */
export const EDGE_CONTROL_INSET = SAFE_MARGIN + MIN_TAP / 2;

/**
 * Y for a control anchored to the bottom edge — the "← Back to centre"
 * button on most scenes.
 *
 * These were written as `height - 25`, `height - 30`, `height - 35` and
 * `height * 0.94`, all of which cleared the old 31px button. Once the hit
 * area was floored at 48 the bottom half of it ran into the safe margin,
 * and on a phone that margin is the home-gesture strip: the OS takes the
 * touch before the game ever sees it. Anchor from the edge instead of
 * guessing a gap.
 */
export function bottomAnchorY(height: number): number {
  return height - EDGE_CONTROL_INSET;
}

/**
 * Minimum font sizes for children's game UX (ages 7-11).
 * Based on: Hourcade 2015, British Dyslexia Association,
 * Sesame Workshop design guidelines, NNG children's UX studies.
 *
 * These are the **thresholds the checklist scores against**, not sizes to
 * draw at. Reach for `TYPE` for that; a test asserts every step of the scale
 * clears `small`.
 */
export const MIN_FONT = {
  body: 16,       // body text / descriptions
  button: 18,     // button labels
  heading: 24,    // scene titles / headings
  hud: 16,        // scores, timers, counters
  /**
   * The floor. Nothing a child has to read is drawn below this.
   *
   * It was 14, which is what the review's F1-F5 band calls a WARN — the
   * checklist passes at 16 — and it was the single most common finding in
   * the game: 41 of 84 warnings across all 42 scene/viewport pairs, every
   * one of them reading "smallest 14px". Not one screen was under it, and
   * not one was over it either. 104 call sites sat exactly on the old floor,
   * which is what a floor set too low does — it stops being a minimum and
   * becomes the default.
   *
   * 14px is about 3.7mm cap height on an iPad held at arm's length. The
   * evidence base above is consistent that 7-11 year-olds read meaningfully
   * slower below roughly 16, and that the cost lands hardest on the children
   * who are already finding reading hard — which in a game whose text is
   * mostly an animal telling you what it needs is the whole audience.
   */
  small: 16,
} as const;

/**
 * The type scale — the sizes the game is allowed to draw at.
 *
 * Before this existed the canvas used **22 distinct font sizes** across 329
 * call sites, every one a bare `'18px'` string chosen at the point of
 * writing. That is the same defect §2 of the audit found on the DOM screens
 * and mis-described as a font-*family* problem: the families were fine, and
 * it was the sizes that had no rule. A scale is what makes "declared once"
 * mean something — a new label picks a step by name, and the name says what
 * the label is for rather than how big it happens to be.
 *
 * Values are the px strings Phaser's `fontSize` takes, so a call site reads
 * `fontSize: TYPE.caption` with nothing to interpolate and nothing to get
 * wrong.
 *
 * **The steps are the game's own, not an imposed ratio.** Sorting the 173
 * type sites by size gave three clear peaks — 16, 18 and 20 — and a thinner
 * spread at 24, 28 and 32. Those six are where the design already lived;
 * everything else was a stray within 2px of one of them, except two
 * celebration banners at 36 and 38. So the collapse moved 169 sites and only
 * one of them by more than 2px. A prettier 1.25 ratio would have moved
 * nearly all of them, to buy an elegance no child can see.
 *
 * **Emoji are not on this scale.** A Phaser `Text` holding 🪨 or 🎾 is sized
 * with `font-size` because that is the only lever there is, and the number
 * answers "how big is this rock" rather than "how easily can this be read".
 * That is where 40, 44, 46, 48 and 72 came from — 52 sites, none of them
 * typography. They keep their literals and are sized to their box. If a
 * glyph ever gains a word beside it, that text is type and takes a step.
 */
export const TYPE = {
  /**
   * Captions, chips, counters, secondary labels — the smallest step.
   *
   * Equal to `MIN_FONT.small` by construction. If something genuinely does
   * not fit at this size, the box is too small; shrinking the type is how
   * the old 14px floor spread to a third of the game's text.
   */
  caption: '16px',
  /** Body copy, descriptions, list rows, an animal's own words. */
  body: '18px',
  /** Button labels — anything a child has to read *and* hit. */
  button: '18px',
  /** Card names, section leads, the line that names what you are looking at. */
  lead: '20px',
  /** Panel and card headings, and the overlay titles on the sign scenes. */
  heading: '24px',
  /** View titles — "Adoption Office", "Welcome back!", "Supply run". */
  title: '28px',
  /**
   * The largest type in the game: the banner at the end of a minigame.
   * "All clean!", "All Fed!", "All Better!", "Level Up!", "Good game!" —
   * five moments that were four different sizes.
   */
  display: '32px',
} as const;

export const GIFT_MESSAGES = [
  { code: 'hi', text: 'Hi from me!' },
  { code: 'cool_pets', text: 'Your pets are cool!' },
  { code: 'nice_day', text: 'Hope you\'re having a nice day!' },
  { code: 'well_done', text: 'Well done on your rescue centre!' },
  { code: 'thanks', text: 'Thanks for being my friend!' },
  { code: 'miss_you', text: 'Come play soon!' },
  { code: 'congrats', text: 'Congratulations!' },
  { code: 'good_job', text: 'Good job!' },
  { code: 'for_you', text: 'This is for you!' },
  { code: 'surprise', text: 'Surprise!' },
  { code: 'share', text: 'Wanted to share this with you!' },
  { code: 'happy', text: 'This made me think of you!' },
  { code: 'best_friend', text: 'You\'re my best friend!' },
  { code: 'keep_going', text: 'Keep going, you\'re doing great!' },
  { code: 'play_together', text: 'Let\'s keep rescuing animals!' },
] as const;
