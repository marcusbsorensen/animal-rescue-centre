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
