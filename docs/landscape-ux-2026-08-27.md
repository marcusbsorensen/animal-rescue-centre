# Landscape UX pass — 27 August 2026

The UX harness had been measuring portrait (375×812, 768×1024) since it was
written, and the iOS build is orientation-locked to landscape on both phone
and iPad. Every number it produced described a layout no child will see.

Turned to landscape (812×375, 1024×768, 1280×800) and worked the list that
came back.

## Result

33 FAIL → 10 FAIL across 24 scene/viewport combinations. Every font-size and
safe-margin failure is closed. What remains is three judgement calls, listed
at the bottom.

| Rule | Was | Now |
|---|---|---|
| T1-T3 touch target size | 12 | 3 |
| F1-F5 font size | 9 | 0 |
| T4 spacing between targets | 6 | 2 |
| L6 interactive count | 5 | 5 |
| L3 safe margin | 1 | 0 |

## What changed

### Two new constants

`MIN_TAP = 48` and `MIN_TAP_GAP = 12` in `ui/constants.ts`, plus
`bottomAnchorY(height)` for controls anchored to the bottom edge. The
codebase had the *idea* of a 48px floor — `HUDView` had been flooring orb hit
radii at 24 since the August pass — but no name for it, so every other call
site invented its own number.

`MIN_TAP` applies to the hit area, not the art. A 30px pill can stay 30px and
still be tappable; growing the drawn button instead would nudge every layout
in the game for the sake of two pixels.

### Shared controls

- `createTextButton` — hit area floored at `MIN_TAP`. This is the "← Back to
  centre" button on half the scenes in the game, and at 17px text plus 12px
  padding it measured 31px everywhere.
- `createButton` — same, for the same reason: its default height is
  `text.height + 28`, which lands at 44–46px for the font sizes in use.
- `createPillTitle` — now calls `setSize` with what it actually drew. The
  pill is a Graphics object and Graphics contributes nothing to
  `getBounds()`, so anything measuring the container to lay out the row
  beneath it got the height of the *text*, about 10px short, and put its next
  row inside the pill.

### Scenes

- **SocialScene** — the four tabs were 30px bars with 4px between them.
  Now 48px with 12px gaps, and the tab row and the content below it are both
  measured off the title rather than hard-coded, because a 48px tab bar
  collides with a fixed title above and a fixed content block below.
- **NavBarView** — the bar was budgeted at exactly four 74px tabs, so the
  tabs ended up 2px apart. Each tab now gets `tabW + MIN_TAP_GAP`. There is
  width to spare in landscape.
- **CorridorView** — an arriving animal's sprite is clamped out of the bottom
  safe margin. Anchors are authored in the editor against a roomier canvas;
  on a landscape phone the same fractional y put a scaled-up arrival's lower
  edge inside the home-gesture strip, where iOS takes the touch and tapping
  the animal does nothing. Measured from the sprite's own bounds, because
  `createAnimalSprite` renders a few pixels taller than the size it is given.
- **PtvDriveScene** — the unlock chip sat 7px below the vehicle name and the
  two overlapped: "Big Tilly" read as "B____ly". Moved to the top of the bay.
- **Bottom-anchored buttons** across Social, Depot, SupplyRun, Vet, Grooming
  and Walk were `height - 25`, `height - 30`, `height - 35` and
  `height * 0.94`. All now `bottomAnchorY(height)`.

### Type

Every font size below 14px — 36 sites across 13 files — raised to
`MIN_FONT.small`. 14 is the pass threshold in the checklist for a 7–11 year
old reader. The literal is gone; the sites say `MIN_FONT.small` so the floor
is visible at the point of use.

### Harness

Four changes, all of which make findings traceable or stop false ones:

- The report now persists the failing elements with their geometry.
  "Rectangle:30" tells you something is wrong and nothing about where; Phaser
  display objects are mostly anonymous, so a size and a position is what
  makes a finding findable.
- T4 names the pair, not just the gap.
- Hidden objects are skipped. Scenes keep pools of pre-built labels toggled
  with `setVisible` — the obstacle markers in SupplyRunScene are built once
  and shown on collision — and measuring those reported font sizes for text
  nobody can read.
- Empty text is skipped, which the DOM branch already did and the Phaser
  branch did not.

## What is left, and why

Three findings survive. None is a case of "we ran out of time".

**GameScene, 28px phase pill.** Its handler is a placeholder that logs a task
count. Enlarging it would grow a dead zone, not a target. Decided in the
August session and still right.

**GameScene, 3px between an arriving animal and a nav tab.** T4 exists so
that two small targets aren't confusable. One of these is a 148×148 painted
animal; a 3px miss aimed at it lands on the animal, not the wrong control.
The rule as written doesn't distinguish a control from a character, and
tuning it to make the finding disappear would be tuning the rule to the
answer.

**L6, interactive count: GameScene 13, AccountScene 21.** The rule wants ≤8.
GameScene is the hub — nav bar, HUD orbs, the rail, the animals themselves.
AccountScene's 21 are badge tiles in a scrolling wall, each tappable for its
description; that is one control repeated 21 times, not 21 controls. Both are
design questions, not defects to be fixed by deleting things.

## Found, not fixed

Two scenes overflow in landscape in a way the harness cannot see, because it
measures sizes and margins rather than overlap:

- **DepotScene** — four mode cards at `y = 140 + i * 105` need 555px of
  height. A landscape phone has 375. The third and fourth cards run under the
  "← Back to centre" button.
- **SupplyRunScene** — the same, for its destination list.

Both are structural: the lists were laid out for portrait. Compressing the
rows is not available — four cards in the space between the header and the
back button gives a 38px row, below the target floor and too short for a
20px title over a 14px description. The real options are a scrolling list or
a two-column grid, which in landscape is the natural shape. That is a design
decision, not a fix.

## Verified

Typecheck clean, lint 0 errors, 941 unit tests, production build, and the e2e scene
walk (19 scenes, 0 failed to start, 0 errors) — all unchanged by this pass.

`e2e/visual.spec.ts`'s `main-menu.png` baseline fails, and did before this work: it
was committed on 2026-04-18 and is 438 commits stale. Confirmed by stashing these
changes and re-running against HEAD. It needs regenerating once the landscape layout
has settled, which is a reason to leave it until the two overflow scenes above are
decided.
