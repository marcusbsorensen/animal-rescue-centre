# Loading screen — the two-stage drag, and four smaller fixes

Opened 2026-10-09, from Marcus's notes on the crate-loading screen.
Branch `claude/crate-loading`. Nothing pushed.

Files: `apps/game/src/driving/crate-loading-view.ts` (the drawing),
`packages/game-logic/src/crate-loading.ts` (the rules and the words),
`apps/game/src/scenes/PtvDriveScene.ts` (the wiring).
`crate-stacking.ts` — the engine — is untouched.

## What changed

1. **Back has a drawn chevron.** `drawBackControl` in the view, not
   `createChromeButton`, because the button takes a texture key and this
   is two strokes in a Graphics object. Drawn rather than set: "‹" is a
   quotation mark and "❮" resolves to whatever the device has.
2. **LOAD HENRY**, at `TYPE.title` (28px, up from 20), all capitals,
   built by `activityTitle(vehicle.name)`. Marcus's explicit override of
   the title-case rule for this one element.
3. **The feeling is attributed to the animal feeling it.** See below.
4. **The animals waiting to board are loose on the floor** — no plates,
   no crates, sized against each other, breathing.
5. **Two-stage drag**: animal → crate → space.

## The two-stage state model

The stage is **derived, never stored twice**. `loadStage(session)` in
`crate-loading.ts` reads two fields and returns one of three:

| stage | session | what the screen asks |
|---|---|---|
| `pick-an-animal` | `heldId` null | which animal |
| `pick-a-crate` | `heldId` set, `heldCrate` null | which crate |
| `pick-a-space` | both set | which space in the vehicle |

`LoadingSession.heldCrate?: CrateType \| null` is the new field. It is
optional, so a session built before it existed — by a test, or by a
caller that only cares about adjacency — still means what it meant.

Mutators: `holdFromTray` clears it (a fact about the animal in your
hands, so the *pick-up* clears it, not only the put-down);
`putHeldInCrate` sets it; `liftFromSlot` carries the crate out of the
bed with her, so lifting lands at stage two; `putHeldBack` clears both.
`placeHeld` uses `session.heldCrate ?? bestCrateFor(species)` and
returns `crate: { type, suitable, text }`.

**`placeHeld` stays tolerant of no crate on purpose.** The sequencing is
one exported predicate (`loadStage`) that the view obeys, rather than a
refusal in the rules — which keeps the 884 existing game-logic tests
honest (they are about adjacency, not crates) and keeps the rules usable
from a script and from `createLoadingSession`'s preload path.

### In the view

- `DropTarget` is `crate` | `bay` | `floor`; `DropZone` is one of those
  with a rectangle. The zones array is built as the bays and the shelf
  are drawn and read when a pointer comes up, so draw order does not
  matter.
- `nearestDropZone(zones, x, y, slack)` — the zone the point is inside,
  else the nearest within `slack` of its edge. Distance is to the edge,
  so a point inside a zone is zero from it and the slack can never steal
  a drop from the zone it landed in. `DROP_SLACK` is 28 on top of hit
  boxes already floored at `MIN_TAP`.
- `dropTargetsFor('loose-animal' | 'crated-animal')` — what each kind of
  piece may be let go in. A loose animal takes crates only.
- `makeDraggable` — one handler for tap and drag, parted by
  `DRAG_SLOP` (10px). **Every drag is also a tap**, so the whole screen
  is operable without dragging: tap the animal, tap the crate, tap the
  space.
- `DragFlag` — one `{ active }` object per render, read by every hover
  handler on the screen. Without it the panel reported whichever animal
  the dragged one happened to pass over.
- `DragSpec.describe` — while dragging, the panel says what the space
  under the pointer would mean. That is the drag's own preview and it
  replaces hovering for the length of the drag.

## The crate choice, and its consequences

`SHELF_CRATES` is all six crates, always, in one order. A shelf that
offered only the crates that suit the animal would remove the choice;
one whose contents changed between animals would move what she was
reaching for.

**Scoring is flat and the words say so.** `isCrateSuitable` is true for
*any* crate in the species' list and arrival scores +3 for a suitable
crate against -10 for one not listed — the first entry earns nothing
extra (the comment at `CRATE_PREFERENCE` says so). So
`describeCrateChoice` has two sentences, not six:

- suitable → `"Echo the bat is happy in a quiet crate."`
- not → `"Echo the bat travels best in a quiet crate."`

The second **says what would suit and stops**: it does not name the
crate she is in, score the choice, or say she is wrong.

**An unsuitable crate is allowed.** A frightening neighbour is refused
because it is safety; a poor crate is a worse journey, which the panel
says in amber and the arrival scoring charges for. A child who may only
ever make the right choice is not making one.

**A crate fact carries no colour, and that is the resolution of a
collision.** The first version marked the shelf with the feeling
glyphs — a green heart on the crates that suit, an amber zigzag on the
ones that do not — which put two meanings on one colour on the screen
where a child is learning what the colours mean. Amber means *a
neighbour minds*: a fact about two animals and a relationship. A crate
that does not suit is a fact about one animal's own comfort. Red is
refusal and blue is needing quiet, so there was no fourth hue to move
to.

So the four colours keep their single meanings and the shelf says it in
**weight and shape**:

| | crate | inside it |
|---|---|---|
| suits her | full weight | a ghost of her, at 0.42 |
| does not | 0.4 | nothing |

Both differences survive the colour being taken away — one is dark with
a shape in it, the other pale and empty — which is the test, and
`grey-08-shelf-lit.jpg` is it, run. The mark is positive in
construction: it says where she fits, and the crates that do not suit
are simply unmarked. The crate she is actually in keeps its animal at
full strength whatever its own weight, so a poor choice reads as her,
solid, in a faded crate, with the crate that suits her lit two along.

The panel follows: a crate verdict is cream paper with the sentence set
bold and no word under the animal. `ShelfPreview.show` and `crateCopy`
carry the reasoning.

**Asking for a space too early** is answered in words
(`onNeedCrate` → a notice: "Berry needs a crate to travel in. Tap a
crate for Berry."), never by quietly choosing a crate for her. The bays
do not light up at stage one either — one stage lit at a time, so the
screen never invites the tap it is about to refuse.

## The emotion label

`pairReactions(note, pair)` is the sibling of `pairFaces`, off the same
`affectedBy`, so the face and the word can never disagree about who
minds. The word is drawn **under** the animal by `drawCast`, in the
feeling's own ink; the name stays above. Where the picture carries the
word, the panel heading drops it (`MOOD_WORDS` tells a bare mood word
from a sentence) — the heading sits directly under the left-hand animal,
which is how "Worried" came to read as belonging to the wrong one.

- happy pair → both, because both are glad of each other
- one-sided → the sufferer only; the cause wears nothing
- needs quiet → the patient only, in blue
- two patients → both "Needs Quiet", never "Happy" under a sick face

On a viewport too short for the band (the landscape phone) no reactions
are drawn and the heading keeps the word, which is then the only place
for it.

## The sentences were rewritten so they could be set

Every pair that was allowed but unhappy used to end "They can sit next
to each other, but X will not enjoy the journey." — forty characters of
subordinate clause whose only break point at the panel's narrow column
is "…but Cleo will / not enjoy the journey": a break inside a verb
phrase with a negation stranded at a line start. No line-breaking
algorithm fixes a sentence whose break points are all bad ones.

| | now |
|---|---|
| one-sided | `Cleo would be happier a space away.` |
| mutual | `They would both be happier a space apart.` |
| needs quiet | `A space beside Truffle would help.` |

Short, positive, and they say what would suit rather than what will not
happen. What the lost clause carried — that the pairing is allowed — is
carried by the contrast with the blocked sentence, which still says
"cannot sit next to each other", and by the placement going through.
Two game-logic tests were rewritten to the new strings, each with a note
saying the premise that changed was the column width and not the
framing.

**`setLines` now runs its three fixups until they stop changing
anything.** They undo each other: fixing a runt pulls the last word of
the line above down, which can leave a one-letter word newly stranded at
the end of the line it came from — and the single one-letter pass ran
first and had already gone past. "Smokey would be happier a space away."
at the 820 column is exactly that case, and it is pinned by a test.

A new test sets **every sentence `describePair` can write**, for every
pair of species and both illness states, at all three column widths
(374, 311, 288), and asserts no runt, no one-letter line end, no leading
punctuation and no line opening on "not", "never" or "cannot". Its
measure is 8.6px a character — a shade wider than the real face, so it
breaks earlier than the screen does and is the stricter test.

## Judgement calls against a rule

- **No names on the loose animals.** The rule is names above the
  animals, settled for the vehicle bed and the panel. On the floor the
  names were the last furniture left, and six of them on one baseline
  above animals of six different heights reads as captions floating over
  a row of animals. Whoever is under the pointer is named in the panel.
  Cheap to put back: `drawLooseAnimals`.
- **A second orange lead-in.** `ACT` was "used exactly twice". There are
  now two lead-ins on the bay floor, "Waiting to Board" and "Crates",
  because both are places the child acts and they are one band.
- **Back's chevron sits beside the word, not above it.** Marcus wrote
  "the chevron and the word align on one left edge"; stacked, Back would
  be the only vertical control in the game, so it is read as the two of
  them forming one block on one edge.
- **Boarded animals leave a gap in the row** rather than the row
  re-packing. Nothing the child is reaching for ever moves; the cost is
  a hole where the dog was.

## When the vehicle changes

The other agent's prev/next arrows change which vehicle is being loaded.
**Nothing in the view caches anything across renders** — `renderCrateLoading`
reads every number off `state` and the drag state is per-render — so the
hook is:

```ts
const { session, leftBehind } = reseatInto(this.loadSession, nextVehicleId);
this.vehicleId = nextVehicleId;
this.loadSession = session;
this.loadNotice = leftBehind.length > 0 ? { … } : null;
this.renderView();
```

`reseatInto(session, vehicle)` is in `crate-loading.ts`: everybody keeps
the crate they were travelling in and is re-seated into the new bed in
the order they were sitting, into the first space that frightens nobody.
Anybody the new bed has no safe space for comes back in `leftBehind` and
goes back to waiting — **say so in the panel**, or a child pressing the
arrow loses a passenger silently. The animal in the child's hands stays
in them, crate and all.

The view takes the vehicle's bay rectangle from `drawCarPark`'s return
value (`park.bay`), so arrows that narrow the bay narrow the vehicle
without any change here.

## Reduced motion

Marcus's decision, 2026-10-09: honour the system setting **and** give a
manual override, then route every animation through it so it is settled
once. Built as two modules, not as a restraint applied by hand.

**`apps/game/src/lib/motion-preference.ts` — the one source of truth.**
`isMotionReduced()` is the only question anything asks. It reads the
player's choice and, where that is `system`, the live
`prefers-reduced-motion` media query — fresh every time, so a carer
turning the device setting on mid-session is answered by the very next
thing that asks. The setting is a three-way, because a boolean cannot
say "my system setting is wrong for me":

| | |
|---|---|
| `system` | follow the device. The default, and stored as nothing |
| `reduced` | the player asked for less, whatever the device says |
| `full` | the player asked for all of it, whatever the device says |

Persisted in `localStorage` under `arc_motion`, which is the mechanism
`lib/intro-state.ts` and the side rail already use for a per-device
player preference. `onMotionChange(cb)` is how an animation already
running gets told; it binds the media listener only while somebody is
subscribed.

**`apps/game/src/ui/tween.ts` — what a future author must use.** Two
functions, and no general one, because the author has to say which kind
of animation it is:

- `stateTween(scene, config)` — it says something happened. Under
  reduced motion the end state is applied at once and `onComplete`
  still runs. A yoyo ends where it started, so a reduced yoyo moves
  nothing and only runs the callback.
- `decorativeTween(scene, config)` — it is pleasant and says nothing.
  Under reduced motion it does not run, and one already running is
  stopped and its target put back the moment the setting changes.

**Never `scene.tweens.add` again.** `eslint.config.js` makes it an
error everywhere in `apps/game/src` except `ui/tween.ts` and a named
list of twenty-five files that predate the setting. That list is a
backlog, not a permission: clear a file by routing its tweens and
deleting it from the list. The rule was checked by writing a violation
and watching it fail.

### What was judged state, and what decoration

**State — kept, cut to the end state under reduced motion**

| | why |
|---|---|
| the snap into a dropped space | it is how a child sees *which* space took the thing she let go of |
| the journey home from a missed drop | it says the drop landed nowhere |
| `createChromeButton`'s press | every button in the game hangs its action off this tween's `onComplete` — skipping it naively would stop the game responding to taps |
| `createChromeCircleButton`'s press | the same |
| the loading screen's Back control | the same |

**Decoration — dropped entirely**

| | why |
|---|---|
| the loose animals' breathing | it never ends and says nothing, and a child who asked for less movement asked for exactly this |
| `createAmbientParticles` | the particles, not only the drift: stopping the drift would leave a scatter of faint emoji sitting still, which is clutter where there was an effect. The container comes back empty |

**Not animations, and therefore untouched** — the lift on picking a
piece up (`setDepth`, `setScale`) and a button's hover scale are
immediate sets, not tweens. That is why a child can still tell a piece
was picked up with motion fully reduced.

### Where the toggle lives — a question for Marcus

**Nowhere yet, deliberately.** The game has no settings screen: the two
audio toggles are HUD icons, and the side rail and skip-intro flags are
URL parameters. Inventing a third place was out of scope, so the
setting is exposed as `?motion=reduced|full|system`, which writes the
stored preference exactly as `?sideRail=` does — reachable by a carer,
and how the harness photographs the screen with motion off. Where a
player-facing switch belongs is the open question.

## Unresolved — for Marcus, not for the next agent

- **The crates read as picture frames at shelf size** (68px on a
  desktop, 52 at 820). The art is a top-down box and at that size the
  interior is a flat cream panel. It reads correctly once an animal is
  in one, and the ghost preview helps, but the art is the thing to
  change rather than the layout.
- **Where the motion toggle goes** (above).

## Smaller, open

- **The bat is a brown lump at 0.3 of a dog.** That is the honest
  relative size and the honest relative sizes were the instruction; a
  child may still not be able to tell what it is. The hit target is
  `MIN_TAP` whatever the drawn size.
- **The "Happy" word under a bay's preview badge overhangs the well** at
  Henry's bay size. Pre-existing, unchanged, visible in
  `04-crated-stage-two.png`.

## Screenshots

`/private/tmp/claude-501/-Users-marcus-Projects-animal-rescue-centre/cf0b1264-730a-4126-9f9f-22caf5987837/scratchpad/loading-2026-10-09/`
— `01-loading-whole`, `02-waiting-strip`, `03-mid-drag`,
`04-crated-stage-two`, `05-panel-two-feelings`, `06-panel-needs-quiet`,
`07-narrow-820-worried`, `08-shelf-lit`, `09-poor-crate`,
`10-narrow-820-quiet`, and `grey-08-shelf-lit.jpg` — the shelf with the
colour taken out, which is the check that a crate that does not suit is
still identifiable. With motion reduced: `11-reduced-motion`,
`12-reduced-mid-drag`, `13-reduced-crated`, `14-reduced-mid-session`. Shot in real Chrome through Playwright; the Claude
browser pane cannot initialise WebGL (`.claude/TRAPS.md`).

## Spark's column, and a second shape for a short screen

2026-10-09, later the same day, on `claude/crate-loading` after the
car-park branch merged. Files: `crate-loading-view.ts` (the layout),
`car-park.ts` (one export), and the two test files.

### The fixture was describing a layout that no longer existed

Before anything else: **`RAW_COLUMNS` in `fleet-art.test.ts` was wrong
by 40 to 158 pixels**, and so was every number quoted off it, including
the 335px column in `.claude/notes/car-park-one-world.md` and the 387px
Marcus was asked about. The car-park branch measured the columns on
`f835b2b`, where the loading bay floor was `min(104, max(76, h*0.19))`.
The crate-loading branch had already changed it to
`min(142, max(76, h*0.22))`. The merge took both, and nothing
re-measured. The real columns, read off the running screen in Chrome:

| | column the car park gets | was recorded as |
|---|---|---|
| 1024x768 | 437 | — |
| 1024x700 | 369 | 527 |
| 820x620 | 295 | 335 |
| 874x402 | 145 | 145 |

So the collision Marcus ruled on was worse than the question described:
Spark needs 361 drawn, and at 820x620 she had 295 of column, not 335.

### Job 1: Spark's 387px column cannot be given at 820x620

**Option A is 98px out of reach at that viewport, and 38px out of reach
even with the loading bay floor squeezed to the tap floor.** The whole
height ledger at 820x620:

| | px |
|---|---|
| title plate and the gap under it (`contentTopFor`) | 97 |
| the car park / reading column | 295 |
| `SPACE.m` | 12 |
| the loading bay floor | 136 |
| the "Let's go!" row (`EDGE_CONTROL_INSET` + `MIN_TAP`/2 + `SPACE.l`) | 80 |

620 in total, and only the middle three are the screen's own. The
column needs **393**, not 387: the 387 in the earlier note added Spark's
361 to the ground a *335px* column is owed (26), and `carParkBackdropH`
is 4% of the column, so a taller column is owed more. 393 is the least
column with `columnH - carParkBackdropH(columnH) >= 361`.

To find 98px the floor band would have to fall from 136 to 38. Its own
floor is 76 — a 20px lead-in row, `SPACE.s`, and `MIN_TAP` for the
animals and crates standing on it — and at 76 the column still only
reaches 355. **So the 40px bay floor and the 48px floor on the loading
bay cannot both hold at 820x620 in a stacked layout.** That is the
escalation, and it is the same shape as the one that produced the
question in the first place.

**The band has no slack to give, either.** It looks like it has: the
animals are drawn 99px tall in a 108px row. But `looseRow` sizes them
by the *width* of floor they have and caps at the row's height, and with
six animals offered at 820x620 the width allows 99 — so the band is
using what it has. With eight animals it would be 68 and 40px would come
free, which is a layout that depends on the cargo and therefore moves
the vehicle between trips. Not taken.

### So the rising rear stays, and here is exactly what it is doing

The previous note guessed the rise would become a no-op. It is the
opposite: with the real columns it is load-bearing at three of the four
viewports. Held by a test (`needs the rising rear at three of the four
viewports, and says which`), with the distances in the one above it:

| | who rises | by |
|---|---|---|
| 1024x768 | nobody | — |
| 1024x700 | Spark | 11px |
| 820x620 | Big Tilly 18, Bea 26, Spark 45 | (Trikey 1px, which is rounding) |
| 874x402 | Spark | 5px, clamped at `PARK_CEILING` |

**And it is the only shape the extra height can take.** The band beside
the title at 820x620 is 280px wide between Back and the title plate, and
a vehicle drawn tall enough to use all of it would be 164px wide and
run under the plate — Henry's painted body would reach x=302 against a
plate starting at 290. Only the narrow rear of a vehicle who needs it
can use that band, which is what `vehicleParkTop` does. Widening the
column for everybody would break the clearance the existing test holds.

What the layout gained instead: nothing at 820x620, and the honest
statement of why, in `loadingColumns`' own doc.

### Job 2: the short shape, and where it starts

Below **599px of viewport height** the screen lays itself out in three
columns instead of two over a floor. The number is derived in
`loadingColumns` and computed at render time, because `contentTop` is
read off the drawn title:

> the stacked column is `contentBottom - bandH(height) - SPACE.m -
> contentTop`; a vehicle stands whole in it when the column less
> `carParkBackdropH` is at least `wholeVehicleHeight`; the short shape
> takes over where that fails for the *smallest* requirement in the
> fleet, Henry's 255.

At 599 the column is 277 and 277 − 22 = 255; at 598 it is 276 and 254.
**The smallest, not the current vehicle** — the shape must not change
when an arrow changes the vehicle, or the screen re-flows under the
child's hand. 820x620 clears it by 16px of column and stays stacked.

It also needs width: two page margins, the car park's column, two
gutters, the rack and the narrowest reading column come to 796px. Below
that it falls back to stacked. The narrowest viewport in the game is
812.

### What the short shape is

```
  [ car park, SAFE_MARGIN to SAFE_MARGIN ] [ panel over the animals ] [ crate rack ]
```

- **The car park gets the whole height of the screen**, because at
  874x402 Spark needs 393 of the 402 there are. The title plate and Back
  float over the tarmac either side of her — which is what they already
  do to the risen rear in the tall shape — and the buttons sit on the
  tarmac to the right of her nose, clear of her at every vehicle.
- **The vehicle is drawn no wider than her bays need** (132, which is
  Bea — her bed is the narrowest share of her body in the fleet), with
  `ARROW_W + ARROW_GAP` reserved either side. In the tall shape she is
  fitted to the column and her bays grow with it; here every pixel of
  width that is not her or her arrows is worth more to the words.
- **The crates stand up in a rack of their own.** This is the part that
  decides the whole arrangement. Six crates at the tap floor need either
  328px of width in one row or 160x104 in two, and a landscape phone's
  reading column can give neither: squeezed in beside the animals they
  come out **27px across, so the 48px hit boxes of two neighbours
  overlap by 13px** and a tap near the edge of one answers for the next
  — the same failure `BAY_MIN` exists to stop in the vehicle. Two
  crates wide by three down, in 104px of width, keeps all six at the
  floor. A test holds the pitch on both axes at all five viewports.
- **The animals are still left of the crates**, so stage one is still a
  short sideways drag, and both end on one ground line at
  `contentBottom`, so the animals' feet and the bottom crate stand on
  the same floor.
- **The rack's lead-in arrow points down**, because the crates are under
  it rather than off to its right. An arrow pointing at the edge of the
  screen is the fault Marcus's rule names.

Measured at 874x402, against the same screen before:

| | before | after |
|---|---|---|
| Henry | 255 tall, **cropped** — 33px of his front gone | 308, whole |
| every other vehicle | cropped | whole |
| crates drawn | 54 | 46 |
| biggest animal drawn | 60 | 48 |
| reading column, inner | 311 | 278 |
| panel's longest copy | ran 8px off the bottom of its paper | on the paper |

### Two things fixed on the way

- **`PANEL_TEXT_H` counts four body lines and the narrow column takes
  five**, so the panel has been running its last line off its own plate
  on the landscape phone for as long as there has been one. `drawPanel`
  closes the leading up on a short plate; measured in Chrome that is
  8 + 26 + 5x20 + 8 = 142, which is now `PANEL_TIGHT_H` and the floor
  the layout reserves. It is what cost the animals 11px of their row.
- The stale comments in this file about the far kerb, the fleet in the
  bays either side and the bumper paid for the backdrop — the car-park
  note listed them — now describe the picture that is there.

### What is still not right, and the numbers

- **812x375 (the Capacitor app) and 812x325 (the Home Screen web clip)
  still crop.** The short shape gives the car park `height - 32`: 343
  and 293. Spark needs 361, so she is cut by 18px at 375 and Bea, Big
  Tilly and Spark are all cut at 325. Nothing in the layout can fix it —
  361px of vehicle does not go into 343px of screen — and the only lever
  left is the 40px bay floor, which Marcus has ruled out. Held by a test
  that names exactly which vehicles are cut at which size, so it cannot
  go quiet.
- **The reading column at 812 wide is 252px (216 inner), about five
  words a line** against the eight to ten the rule asks for. Every
  sentence `describePair` can write still sets cleanly there — the test
  now runs at 278 and 216 as well as 374, 311 and 288, and a sweep of
  every width from 180 to 400 came back clean — but five words a line is
  a thin column and it is the price of three columns on an 812pt phone.
- **The panel's bottom padding is 2.5px against 8 at the top** on the
  landscape phone, which is the wrong way round under the
  more-space-below rule. It is the squeeze: the panel is 136.5 where its
  copy wants 134 and the band below it is already at its floor.
- **Adjacent animals' hit boxes overlap on the floor**, in both shapes
  and before this work. The row's pitch is the drawn size plus 8, and
  the hit box is floored at 48, so two small animals 30px apart share
  14px of target. Pre-existing, unchanged, and worth a decision of its
  own: the honest fix is to space the row by the hit boxes, which makes
  every animal smaller.
- **The vehicle-change arrows are still not wired**, so the 228px the
  short shape reserves for them is bare tarmac today. It is a marked bay
  on a car park rather than an empty panel, so it reads as a place; but
  it is 228px, and wiring them (the recipe is in
  `.claude/notes/car-park-one-world.md` §5) is what it is for.

### Screenshots

`/private/tmp/claude-501/-Users-marcus-Projects-animal-rescue-centre/cf0b1264-730a-4126-9f9f-22caf5987837/scratchpad/loading-short-2026-10-09/`
— `spark-whole-820x620`, `tall-820x620-henry`, `short-874x402-henry`,
`short-874x402-spark`, `short-874x402-mid-drag` (a cat in the air with
the shelf lit for her), `short-874x402-reduced-motion` and
`short-874x402-reduced-mid-drag`. Real Chrome under Playwright;
`apps/game/tools/shoot-short-loading.mjs` takes them and
`apps/game/tools/measure-loading.mjs` prints the numbers the test
fixture is measured from. The Claude browser pane cannot run Phaser
(`.claude/TRAPS.md`).

## The bay floor, the queue's pitch, the panel's padding, and the arrows

2026-10-09, later again, on `claude/crate-loading`. Files:
`crate-loading-view.ts`, `car-park.ts`, `PtvDriveScene.ts`,
`crate-loading-view.test.ts`, `tools/shoot-short-loading.mjs`.

### The fixture was re-measured first, and this time it was right

`RAW_COLUMNS` in `fleet-art.test.ts` was read off the running screen in
Chrome again before anything was changed, and it agrees with what the
layout hands out at all four viewports it records — `24,97 542x437`,
`24,97 542x369`, `24,97 424x295`, and `24,16 360x370` with the vehicle
drawn no wider than 132. Nothing in this work moved the car park's
column, so it is still right afterwards. `measure-loading.mjs` is what
was run; it also reads the two 812pt sizes.

### Job 1: the bay floor relaxes, and the number is 31

**Marcus's decision: the drop bays may go under 40 where there is no
room for 40, and nothing else may.** The arithmetic, all of it derived
rather than chosen:

- The short layout hands the car park `height - 2 * SAFE_MARGIN` of
  ground: 370px at 874x402, **343 at 812x375** (the Capacitor app) and
  **293 at 812x325** (the Home Screen web clip).
- `wholeVehicleHeight` is affine in the bay floor. Spark's six bays at
  40 need her drawn 361. Solving `= 343` gives 37.85 and `= 293` gives
  31.75, so **37 and 31** are the largest whole pixels that stand her.
- **The threshold is 393px of viewport height**: Spark's 361 plus two
  safe margins. At 393 every vehicle keeps 40; at 392 she is the first
  to give a pixel up.
- `BAY_FLOOR_MIN` is **31** — the lowest number any screen the game
  ships to asks for, and therefore the clamp.

`bayFloorFor(id, cols, rows, groundH)` is the whole of it, and it is
**per vehicle**: relaxing the floor can never shrink a bay that already
clears 40, because the floor is only the size `fitLoadBed` *grows* a
vehicle to reach. So at 812x325 Spark takes 31, Bea 35 and Big Tilly
37, while Henry and Trikey keep 40, and an arrow press changes nothing
but that vehicle's own bays.

| | 1024x768 | 1024x700 | 820x620 | 874x402 | 812x375 | 812x325 |
|---|---|---|---|---|---|---|
| ground | 518.5 | 450 | 376 | 370 | 343 | 293 |
| bay floor | 40 | 40 | 40 | 40 | 40, Spark 37 | 40; Bea 35, Tilly 37, Spark 31 |
| anything cropped | no | no | no | no | **no** | **no** |

**What a relaxed bay costs is size, not separation.** `bayHitSize` is
floored at `MIN_TAP` *but never past its neighbour*, so a 31px bay has
a 39px target that still touches rather than overlaps the next one.
Said at the call site in `renderCrateLoading`, and a test holds that
the arrows, the crates' pitch and the animals' pitch all still clear 48
at 812x325 while the bays do not.

**`FLEET_MIN_WHOLE_H` stays measured at `BAY_MIN`.** A relaxed floor fed
back into the stacked/short breakpoint would move it, and the shape may
not change when an arrow changes the vehicle. 599/598 is where it was.

**A two-pixel crop nobody had found.** A test now walks every viewport
height from 325 to 768 rather than the six composed sizes. At 599 and
600 — stacked, just above the breakpoint — the ground is 359 against
Spark's 361, so she was cut by two pixels at heights no named viewport
sits on. The floor comes down to 39 there and she is whole.

### Job 2: a full hit box apart, and what that costs

**The pitch between two waiting animals is now the larger of the drawn
gap and the two grab handles' half-widths**, so no two targets overlap.
It is not simply `MIN_TAP`: an animal drawn 50px has a 25px half, so a
50 beside a 10 needs 49 of pitch, not 48.

**Drawing them smaller buys nothing past a tap target.** A row of `n`
animals needs at least `n * MIN_TAP` of floor however small they are
drawn, so the number in view is set by the pitch and not by the art.
That is the argument that Marcus's "the animals stay large" and "a full
hit box apart" do not trade against each other.

Two things follow, both in `looseRow`:

1. **A three per cent shrink, to keep the screen he signed off intact.**
   The floored pitches made the six-animal row 403px wide on 820x620's
   393px floor, so the scale is solved against the laid-out row rather
   than the sum of the drawn widths: the dog goes 99 to 96 and all six
   stay in view.
2. **It will not go below `CRATE_ART_MIN` for the smallest animal.** A
   full lorry's eight on that floor would need the dog at 54 and the bat
   at 16. That is the trade Marcus ruled out, so the queue pages instead.

**Paging, not scrolling, and the reason is the child.** A scroller
answers only to a drag or a swipe, which is the one gesture this screen
has been built not to require — every drag on it is also a tap. A
momentum flick is worse again: an overshoot moves the animal she was
reaching for, and nothing on this floor may move for a reason she did
not intend. So the queue pages, and the control is one plate at the end
of the row carrying **a numeral and a chevron**: how many animals are
waiting where she cannot see them, and which way they are. The numeral
is the answer to "a queue that silently truncates is worse than one
that is visibly longer than the screen" — it is on the screen at all
times, and it is a digit because the child cannot read.

- **It comes round rather than stopping.** The vehicle arrows are
  dimmed at the ends and do not wrap, because a size order has ends; a
  queue of animals has no wrong end, and one control that always brings
  somebody beats two that are sometimes dead. It skips pages whose
  animals have all boarded, so a press always brings animals.
- **The pages are fixed off the whole cargo**, so an animal is always on
  the same page and in the same place on it. Boarded animals leave their
  gap, as they did on a single row.
- **Once it pages, the animals grow.** Each page has the floor to
  itself, so the scale goes back up to what the band's height allows,
  stopping before it would cost another page turn. At 820x620 a lorry's
  load goes from a 68px dog to a 108px one. Paging makes them larger
  here, not smaller.
- The numeral sits **beside** the chevron, not above it: a 48px square
  with a 16px numeral over a chevron fills corner to corner and reads
  as one squiggle. Shot, looked at, and changed.

What it costs, as page counts (a test holds the table):

| | 1024x768 | 1024x700 | 820x620 | 874x402 | 812x375 | 812x325 |
|---|---|---|---|---|---|---|
| six animals | 1 | 1 | 1 | 1 | 2 | 2 |
| eight animals | 1 | 1 | 2 | 2 | 2 | 2 |

The page is the scene's (`waitingPage`, `onWaitingPage`); the view
clamps whatever it is handed, so an owner that only counts up can never
land on a page that is not there. A vehicle change puts it back to zero.

### Job 3: the panel's padding, and the panel it was not the only one in

`PANEL_PAD_TOP` and `PANEL_PAD_BOTTOM` are now two numbers, the lower
one larger, and `panelPadding(boxH, bandH)` is the rule: **where the
plate has the room, the top is its own number and the bottom keeps the
rest; where it has less, both come down in proportion and the larger is
still underneath; where the plate is shorter than the copy, the top goes
to nothing so every pixel there is lands under the words.** Measured on
the running screen afterwards:

| | above | below |
|---|---|---|
| 1024x768 | 12.6 | 90.7 |
| 820x620 | 12.6 | 64.5 |
| 874x402 | 3.5 | 27.3 (was 8 against 2.5) |
| 812x375 | 0 | 4.3 |

**Two more of the same inversion came out of looking for it elsewhere.**

- **The roomy panel was inverted too**, by four pixels nobody had
  written a reason for: `CHROME.padY + SPACE.xs` above against
  `CHROME.padY` below. The stray four are gone.
- **The vehicle arrow plates were inverted by 2.6px** — the chevron was
  pinned 36px from the top and the two lines fell where they fell.
  `arrowPlatePadding` runs the same proportional rule on its own pair,
  and a dimmed arrow's one word now sits on the name's line, so it reads
  as the same plate with one line instead of a different control.
- The lead-in blocks are a centred pill with equal air above and below,
  which is a different thing and was left alone.

**And a containment, which is not the same as a fix.** At 812pt the
reading column is 197.5px (app) and 147.5 (clip), the floor takes 76 of
it before the panel is given anything, and what is left is less than the
copy. It was running the last lines off the paper and across the orange
lead-in below. A sentence that will not fit is now **left out whole, and
only after one has been set** — never a part sentence, never the only
one. What goes is the explanation; the heading and the first sentence,
which is what to do next, stay.

### Job 4: the arrows are wired

`crate-loading-view.ts` passes `onVehicleChange` and `playerLevel` to
`drawCarPark` (which is what draws the arrows), and
`PtvDriveScene.changeBay` is the recipe from
`.claude/notes/car-park-one-world.md` section 5: `changeVehicle(session,
to)` from `@arc/game-logic`, then the vehicle id, the session and the
notice, then a redraw. Nothing is reimplemented and nothing is cached —
the title, the bed, the grid, the bays and the arrows' own neighbours
are all read off `state` every render.

**The notice type gained an optional `heading`**, because `level: null`
draws "Wait a Moment", which is right for an empty vehicle asked to set
off and wrong here. Two shapes:

- One animal came off: **"Milo Is Waiting Again"**. Not decoration — the
  rules' sentence for that case carries her name in its *last* clause,
  three sentences in, past what the plate can hold. A heading cannot be
  dropped, so the name cannot be.
- Two or more: **"Waiting to Board Again"**, because the rules' first
  sentence names them and that one is never dropped.

**A six-line copy budget was tried for this and reverted.** The longest
change message — "Biscuit the dog makes Daisy the bunny frightened. They
cannot sit next to each other. There is no other space in Henry for
Biscuit, so Biscuit is waiting to board again." — is six lines at the
288px column, and budgeting for six leaves `facesH` at 58 against a
`PANEL_FACES_MIN` of 62: the panel loses its picture at 820x620, for
every copy it writes, to carry one sentence of one event. The name went
into the heading instead and `PANEL_TEXT_H` stayed at four lines.

### Still not right, and for Marcus rather than the next agent

- **The panel's copy is longer than its plate at 812pt.** The plate is
  109.5px in the Capacitor app and **59.5 in the Home Screen web clip**,
  against a copy that wants 126. Every lever is already down: the type
  size does not move, the floor holds one row of tap targets, and the
  title plate takes 97.5 of a 325px screen because the all-caps title is
  his own decision. The containment above stops it drawing over the
  floor; what the panel should *say* on that viewport is a decision
  about words, not layout. Pinned by a test that states the numbers.
- **A relaxed bay's target is the pitch, not 48.** 39px at 812x325 for
  Spark's six. Nothing overlaps, but it is under the floor the rest of
  the game keeps, and it is worth his knowing in those words.
- **The queue pages at 812pt with the standard six animals.** Four then
  two. On a 325px-tall screen that may be the right answer anyway; it is
  the first screen in the game with a page turn on it.

### Screenshots

`/private/tmp/claude-501/-Users-marcus-Projects-animal-rescue-centre/cf0b1264-730a-4126-9f9f-22caf5987837/scratchpad/loading-floor-2026-10-09/`
— `app-812x375-trikey|henry|bea|spark|bigtilly` (all five whole in the
Capacitor app), `clip-812x325-spark` (whole in the web clip),
`queue-820x620-eight` and `queue-1024x768-eight` (the new spacing),
`queue-pager-812x375` and `queue-pager-turned-812x375` (the pager and
the page it turns to), `arrow-downsize-812x375` and
`arrow-downsize-820x620` (a press mid-change, with the animal back on
the floor and named), `arrow-upsize-820x620`, `panel-874x402` (the
padding), and the earlier set re-shot. Real Chrome under Playwright;
the Claude browser pane cannot run Phaser.

`pnpm -r typecheck` green, `pnpm -r lint` 0 errors, `pnpm -r test` 925
game-logic and 604 apps/game (592 at the branch point).
