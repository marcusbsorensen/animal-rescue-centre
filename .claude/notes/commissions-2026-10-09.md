# Art commissions, 2026-10-09: the six crates (round 3) and Trikey's portrait

Both sent to Manus on 2026-10-09 after Marcus approved them. Nothing retrieved this turn. Source rules: `docs/manus-sprite-rules.md` (1 to 8), `.claude/notes/car-park-one-world.md` section 8, `.claude/HANDOVER.md` (Crates; Vehicles).

## 1. What was sent

| | Commission 1: crates, empty-legibility pass | Commission 2: Trikey's portrait repaint |
|---|---|---|
| Manus task | `fC4SeHdgYgHYTMpGDFKyif` (the existing crate thread; this is a new MESSAGE in it, sent 2026-10-09 ~14:28 BST, epoch ms 1791552502013) | `Ksj8meKU4PHq7raJ6rVmhA` (new task) |
| URL | https://manus.im/app/fC4SeHdgYgHYTMpGDFKyif | https://manus.im/app/Ksj8meKU4PHq7raJ6rVmhA |
| Profile | manus-1.6-max (the thread's own) | manus-1.6-max (the project norm for continuity work) |
| Output expected | six `crate-<type>-v2.png`, 1024x1024, plus `crate-sheet-72px-v2.png`, `crate-sheet-68px-v2.png` | `vehicle-trikey.png` 1024x512, plus `vehicle-trikey-check.png` |
| Credits at last look | 668 on the thread, against 613 before this round: **+55 so far** (still running) | **19 so far** (still running) |

Why the crates went into the old thread and Trikey into a new one: `work-with-manus` says one thread per asset type and iterate with `manus_send_message`, so Manus keeps the six existing crates in view (the live site does not serve them, see section 3). Trikey is a different asset type, and the livery thread `JPi3P3qMaoYsZzFGJ2siXb` carries the reverted-round trap and 10,248 credits of context.

The briefs below are the text Manus holds, downloaded back from the two `pasted_content_*.txt` attachments Manus made of them, so they are exactly as sent.

## 2. Credit balance and cost

**The Manus API does not expose a balance** (`work-with-manus` says so; `manus_credit_usage` is a ledger only). What the ledger gives:

- Latest grant: **+40,000 "Manus Pro" on 2026-09-29**. Costs since then, before this round: **18,705**. So, if that grant is the only source since, about **21,295 credits remained before submitting** (an estimate; it ignores any carry-over, daily credits or expiry, none of which the ledger shows).
- After submitting: 55 + 19 = 74 credits committed at the moment of checking, both tasks still running. Final cost is not known until they stop. Check `credit_usage` on each task once, when you retrieve.
- Estimate to finish, from the ledger: the whole crate thread (two pilots, then six crates, then the contact sheet) cost **613**; the Trikey single image should land in the **200 to 700** range, and the crates round in the **300 to 700** range. For comparison, other art rounds: nav badges (5 pieces) 719, six 512px monograms 2,594, the 45-file livery pass 10,248. Neither commission is anywhere near the livery pass, so the stop condition (materially more than other rounds) was not met. The handover records no Manus credit figures, only OpenAI batch prices, so the ledger was the only comparison available.

## 3. Findings that changed the briefs (check these first)

1. **The six current crates are NOT on the live site.** `https://animal-rescue-centre.vercel.app/assets/driving/crates/crate-*.png` returns 404 for all six. The reference for them in the brief is "the six PNGs you delivered in your last message in this thread", which Manus holds.
2. **The four repainted top-downs are NOT on the live site, and what is there is plasticine.** `vehicle-topdown-{henry,bea,spark,big-tilly,car-red,henry-rear}.png` are served, but every shasum differs from the local file, and the live Henry top-down is a clay render (looked at, side by side with the local line-and-wash one). The repaint commits `b829999` and `a08ab96` are on no remote branch (`git branch -r --contains b829999` is empty), so they have never been pushed. Putting those URLs in a brief as "style anchors" would have anchored the new art to exactly the style it must not have.
   What I did instead: the style anchors are the five canon vehicle portraits (`vehicles/vehicle-{henry,bea,spark,big-tilly,trikey}.png`, all five served and shasum-identical to local) and the beagle sprite (identical). The top-downs were painted from those portraits, so the hand is the same. The crate brief also WITHDRAWS reference 3 of the first crate brief (`vehicle-topdown-henry.png`, the plasticine one, which the pilot was given) so Manus does not carry it forward.
3. **Rule 6 does not say what the commission assumed.** The text of Rule 6 (dated 2026-04-24) says OpenAI `/v1/images/edits` ONLY for anything needing character or style continuity, and it does not record any 2026-09-06 choice. The Manus choice is recorded in `.claude/HANDOVER.md` ("Manus, not OpenAI, chosen by Marcus after Rule 6 was put to him", 2026-09-06, for the fleet repaint) and `car-park-one-world.md` 8.5 says "which to use again is his decision". Both commissions are continuity work. Under the instructions I was given for an ambiguous case, both went to Manus as the project's default. **Flag for Marcus:** the Trikey repaint is an edit of one existing picture, which is what `/v1/images/edits` (`tools/gpt-image-regen.sh`) is for. If Manus drifts her identity, that is the fallback and the one Rule 6 prescribes. The briefs carry the Rule 1 stop line and ask Manus to say which URLs it opened, because Rule 6's failure mode is Manus silently proceeding without fetching references.
4. **The perch carrier's perch has moved out of the middle.** Round 2 put the perch bar across the opening, deliberately. Marcus's constraint now is that the middle stays clear, so the perch runs along the top rim and the floor is bare. `CRATE_FLOOR`'s doc comment in `apps/game/src/driving/crate-loading-view.ts` (around lines 1112 to 1139) says "The perch carrier has no clear floor at all because its perch crosses the middle". That goes stale when these land. I did not touch it.
5. **The deck figures in car-park notes 8.5 do not fit two crates in line.** 8.5 gives the deck as about 78% of her width and 28% of her length. With her at 0.75 m by 1.75 m that is a deck 0.585 m wide by 0.49 m long, wider than it is long, which holds one square crate, not a 1x2. The portrait brief therefore follows Marcus's words (one wide, two long) and makes the deck twice as long as wide, about 35 to 40% of her body length. **The top-down brief (8.5) must be reconciled before it is sent**, and `VEHICLE_BED['pedal-trike']` (`{ x: 0.11, y: 0.04, w: 0.78, h: 0.28 }`) will be re-measured against the painted deck regardless.
6. **`tools/install-crates.py` crops to the drawing's bounding box, then squares and scales.** That is right only if all six drawings have the same bounding square. The brief therefore forces one footprint (everything inside one centred 92% square, touching it on all four sides, nothing sticking out). If any crate comes back with a handle or lamp sticking out, its body will install smaller than its neighbours.

## 4. Things I had to decide myself (not in the instructions)

Crates:
- **Posted into the existing thread**, not a new task (reason in section 1).
- **Outline per type**, to meet the colour-removed rule: standard plain square; secure octagon (corners clipped 14%); quiet soft squircle (radius 25%); ventilated basket circle; warm vivarium square with ONE round corner (the lamp hood); perch carrier square with a dipped top edge between two tall posts (8% dip). All inside one footprint, so no sticking-out parts.
- **Rim fittings per type**: standard slats, rope-loop handles, straw tuft; secure grille bars and padlock; quiet quilted padded rim and rolled blanket; basket woven rim, strap and buckle, water bottle; vivarium glass panels, vent slots, big corner lamp; perch carrier perch bar along the top rim, seed cup. The water bottle went on the basket and straw on the standard: the instruction listed fittings as examples ("whatever distinguishes that type"), so the allocation is mine.
- **The clear centre**: the middle 60% by 60% of the crate square (a 60% circle for the basket) is bare floor; bold marks only in the outer 16%; the 16% to 20% strip is soft. Basis: `CRATE_FLOOR = 0.78` in `crate-loading-view.ts` draws the animal at 0.78 of the crate and the animal art fills 0.50 to 0.94 of its own file, so wide animals reach about 0.72 of the crate. The old crates measured 0.47 to 0.59 clear.
- **Filenames end `-v2`** so the new round cannot be confused with the three earlier rounds' files of the same name in the same thread.
- **Straight down** for the crates (Marcus's recorded decision), even though Rule 8 says one camera and the fleet top-downs are a bird's-eye view with the far end at 88%. Flagging the tension, not resolving it.
- **Acceptance tests named in the brief**: 72 px and 68 px sheets in colour, in luminance only and as silhouettes; centre clear; one footprint; whole and transparent; style. The 8-bit palette under about 200 colours is asked for as a restrained palette and measured by us after install, since Manus returns RGBA.

Trikey:
- **Rack details left as choices in car-park 8.5 are now decided**: wooden-slat deck (to match Big Tilly's oak bed), duck-egg blue frame, rail and two struts; the GO pennant's pole moves to the rack's rear corner (it stood at the rear mudguard, which the rack covers). Carry both into the top-down brief so the three views agree.
- **Rack proportions**: twice as long as wide, 35 to 40% of her body length, each crate about 60% of her basket's width (see item 5 above).
- **Wheels**: the far rear wheel gets its own full tyre ring, spokes and blue mudguard; chain guard, crank and pedal may move; a 128 px thumbnail test counts three wheels. Manus is allowed to shift the far wheel slightly.
- **Ground**: the portrait's faint dry-brush ground smudge is kept as drawn (it is canon and on-style) and nothing is added. Rule 2's small oval shadow is not requested.
- **Profile**: manus-1.6-max, as the livery pass and the crate thread used.

## 5. Retrieval warnings (read before pulling anything)

- **"Last attachment wins" has already returned a REVERTED round.** In `JPi3P3qMaoYsZzFGJ2siXb` (the livery thread) any attachment whose workspace path contains `animal_rescue_sprite_camera_fix` is to be SKIPPED; the good Bea, car-red, Henry, Henry-rear and tractor are from `animal_rescue_sprite_pilot`. Neither task here is that thread, and nothing is retrieved this turn. See `.claude/HANDOVER.md`, "TRAP: last attachment wins".
- **Crate thread `fC4SeHdgYgHYTMpGDFKyif` holds three earlier rounds of the same six filenames** (pilot, round 2, and the contact sheet). Round 3 is named `*-v2.png`, so only take attachments whose filename ends `-v2.png` or begins `crate-sheet-`, from the message after the user message at epoch ms 1791552502013. Do not take `crate-standard.png` and the rest. If the final message re-attaches the old files, ignore them.
- **Download links are signed and expire** (the policies on these tasks run to 2026-11-01). Get fresh ones from `manus_list_messages` / `manus_list_output_messages` on the day, and never reuse a saved URL.
- **Do not trust "All references loaded"**: check the first assistant reply of each task lists which URLs it opened (the briefs ask for that).
- Retrieve with `manus_download_output` and an explicit `output_dir`, as in `work-with-manus`, never with save-to-disk instructions in a prompt.

## 6. Next steps

### Commission 1: the six crates

1. One check of `manus_get_task fC4SeHdgYgHYTMpGDFKyif` (status `stopped` means round 3 is done; note `credit_usage`). Do not poll.
2. Download the `-v2` files and the two sheets to `manus-output/crates-v2/` with `manus_download_output` (`file_filter` `.png`, then discard anything not ending `-v2.png` or beginning `crate-sheet-`).
3. Look at the two sheets, then run the acceptance tests ourselves, not Manus's word:
   - All six bounding boxes the same square (so `install-crates.py` squares them identically).
   - The middle 60% by 60% is flat cream floor (low luminance variance, no ink).
   - The colour-removed sheet at 72 and 68 px; the six silhouettes differ.
   - After install: 8-bit palette, under about 200 colours; whole silhouette; transparent ground; no baked shadow.
4. Install, keeping the round-2 originals (`tools/install-crates.py` reads `manus-output/crates/<name>.png` with the plain names, and does not back up the installed 256 px files, though the round-2 ones are committed in `7e2a5c8`):

       cp -R manus-output/crates manus-output/crates-round2
       for f in manus-output/crates-v2/crate-*-v2.png; do b=$(basename "$f"); cp "$f" "manus-output/crates/${b/-v2/}"; done
       python3 tools/install-crates.py

5. Then, in code (someone else's job, not this note's): update `CRATE_FLOOR` and its comment for the perch carrier (finding 4), and re-measure the six clear floors it quotes.

### Commission 2: Trikey's portrait

1. One check of `manus_get_task Ksj8meKU4PHq7raJ6rVmhA`; note `credit_usage`.
2. Download `vehicle-trikey.png` and `vehicle-trikey-check.png` to `manus-output/trikey-portrait/`.
3. Check against the original: canvas 1024x512; front wheel, frame, basket, saddle and bell unchanged (overlay); rack deck about twice as long as wide; no crate or terracotta box; three wheels countable at 128 px; whole silhouette, 20 px margin; under about 200 colours after quantising.
4. **There is no installer for the portraits.** `tools/install-vehicles.py` is for `assets/driving/topdown/` only and `install-restyled.py` is for animals. Install by hand: back up `apps/game/public/assets/driving/vehicles/vehicle-trikey.png` first, then quantise to an 8-bit palette keeping the 1024x512 canvas, with near-opaque palette entries forced fully opaque as `install-crates.py` does (the quantiser leaves bodies at alpha 252 to 254 otherwise).
5. **Commit and DEPLOY it before anything refers to it**, because Rule 1 needs the portrait at a public URL.

### Trikey's two top-downs: the next step, and BLOCKED on commission 2

They are commissioned from the repainted portrait, afterwards. Not commissioned this turn. The brief is car-park notes section 8.5. Before it is sent:

- The repainted portrait must be committed and deployed (above).
- **The repainted fleet top-downs must be deployed too** (`b829999`, `a08ab96` are unpushed), or the 8.5 style-anchor URLs serve plasticine. Run 8.5's own check first: a `HEAD` over every URL and a `shasum` against the local file. Today it fails.
- Reconcile the deck figures (finding 5) and carry the decided rack details (section 4) into it.
- Rule 8 applies: the same camera as the fleet (bird's-eye, far end 88% of near end), whole silhouette, and the plasticine blocklist.
- Install with `tools/install-vehicles.py` (it gates on silhouette IoU, applies `skew-topdown.py`, quantises to 256 colours); then re-measure `VEHICLE_BED['pedal-trike']` and `VEHICLE_BED_SOURCE['pedal-trike']` in `apps/game/src/driving/fleet-art.ts`, update `PAINTED_BODY` in `fleet-art.test.ts`, and treat `warnOnStaleBed` as the check that nothing was missed.

## 7. Reference check (done before sending)

`curl` of each URL against the local file's shasum (first 12 hex):

| URL path under `/assets/driving/` | HTTP | Matches local |
|---|---|---|
| `vehicles/vehicle-trikey.png` | 200 | yes |
| `vehicles/vehicle-henry.png`, `-bea`, `-spark`, `-big-tilly` | 200 | yes, all four |
| `/assets/animals/dog-beagle-sheltered.png` | 200 | yes |
| `crates/crate-*.png` (all six) | **404** | not deployed |
| `topdown/vehicle-topdown-{henry,bea,spark,big-tilly,car-red,henry-rear}.png` | 200 | **no, all six differ** (live ones are the pre-repaint plasticine versions) |

---

## 8. Brief 1 in full, as sent: the six crates (message to thread `fC4SeHdgYgHYTMpGDFKyif`)

```text
Round 3 for the same six crates. The style is right and the family is right: keep both. This round changes WHAT IS DRAWN ROUND THE RIM, so that each crate reads as a crate, and as its own type, while it is empty.

=== WHY ===
The child now chooses the crate BEFORE the animal goes into it. At shelf size (68 pixels) and in the vehicle bay (72 pixels) the current six read as picture frames: a plain frame round a flat cream middle. A child has to see "this is the secure crate" or "this is the perch carrier" from the EMPTY crate alone.

The players are autistic children, and the rule is that SHAPE must differ between types, not only colour, so that colour-blind players can tell them apart. Today four of the six are plain squares that differ mainly by colour. That is the second thing to fix.

=== STOP CONDITION: READ FIRST ===
Before drawing, open:
(a) the six PNGs you delivered in your last message in this thread. They are the current set and the reference for each type's colour and character.
(b) these public URLs:
https://animal-rescue-centre.vercel.app/assets/driving/vehicles/vehicle-henry.png
https://animal-rescue-centre.vercel.app/assets/driving/vehicles/vehicle-bea.png
https://animal-rescue-centre.vercel.app/assets/driving/vehicles/vehicle-spark.png
https://animal-rescue-centre.vercel.app/assets/driving/vehicles/vehicle-big-tilly.png
https://animal-rescue-centre.vercel.app/assets/driving/vehicles/vehicle-trikey.png
https://animal-rescue-centre.vercel.app/assets/animals/dog-beagle-sheltered.png
If you cannot open any of these, STOP and tell me which. Do not draw from this description alone. In your first reply, say which of them you opened.

One withdrawal: in my first brief, reference 3 (vehicle-topdown-henry.png at that address) is the OLD plasticine version of that vehicle. It is withdrawn as a style reference. Do not take style, surface or lighting from any vehicle-topdown-*.png at that address. The style references are the five portraits above, the beagle, and your own six approved crates.

=== STYLE (unchanged from the approved round) ===
Line and wash: a hand-inked, slightly wobbly warm brown-black outline, muted watercolour washes with dry-brush streaks and visible paper grain, details DRAWN rather than modelled. Warm, friendly, clear. The same hand as the five vehicle portraits.
BLOCKLIST (will be rejected): plasticine, claymation, 3D render, glossy or specular highlights, soft modelled shading, baked or cast shadows, gradients, airbrush glow, anime, flat vector shading, photorealism, sci-fi.
Glass and metal are shown with flat pale washes and ink lines, never with shine.
Keep the palette restrained: flat washes plus paper grain. The finished files are quantised to an 8-bit palette of under about 200 colours, so avoid noisy textures and soft gradients that would band.

=== VIEWPOINT AND FRAME ===
Straight DOWN into an open-topped box: plan view, no perspective, no tilt, no visible front face. The vehicles in the game are drawn from a high bird's-eye angle, but the crates sit on a flat loading grid and are drawn straight down. Keep it straight down.
1024 x 1024 PNG, transparent background. No ground, no ground shadow, no cast shadow. Every crate is drawn WHOLE: nothing cut off by the canvas edge.

ALL SIX SHARE ONE FOOTPRINT. The whole drawing of every crate, with every handle, lamp, post, bar and fitting included, fits inside the same centred square of 92% of the canvas (46 px clear on every side) and touches that square on all four sides. NOTHING sticks out past it. The round basket's diameter is that same 92%. This matters: each file is cropped to its drawing and scaled to the same size as the others, so a crate with something sticking out would come out at a different scale from its neighbours. From here on, "the crate square" means this 92% square.

=== THE CLEAR CENTRE: THE ONE HARD RULE ===
Crates are drawn EMPTY. The game draws the animal on top of the crate at run time, and the same animal can go into any of the six crates (drawing the animals in would mean 54 pictures instead of 6). Anything you draw in the middle sits under the animal and spoils the crate. So FITTINGS GO ROUND THE RIM.

Measured inwards from each edge of the crate square:
- OUTER 16%, the RIM ZONE: everything bold lives here. Walls, rim, posts, bars, handles, lamp, perch, padding, straw, bedding, bottle, plates.
- NEXT 4% (16% to 20%): the inner face of the wall, in soft wash with at most a thin ink line. A soft fitting such as a wisp of straw or the edge of a blanket may reach into it in places. No dark or bold mark may.
- THE MIDDLE 60% by 60% (20% to 80% in each direction; for the round basket, a circle of 60% diameter): BARE FLOOR. Pale neutral cream, the same cream in all six, with paper grain and nothing else. No ink line, no shadow, no straw, no bedding, no bar, no shading, no glow.
The floor stays cream in all six, including the dark secure crate, so a black, white or ginger animal reads against it. The animal can cover up to about 72% of the crate's width, which is why the 16% to 20% strip must stay calm too.

=== THE SIX: OUTLINE FIRST, THEN COLOUR, THEN RIM FITTINGS ===
Outline is what a colour-blind child sees first, so each crate has its own OUTLINE as well as its own fittings. The colours are kept from the current set and become the second cue.

1. crate-standard-v2.png : the plain baseline
   OUTLINE: a plain square with sharp corners.
   COLOUR: pale honey wood, as now.
   RIM: four slatted walls, each plank visible with a dark gap between slats; four heavy square corner posts; a thick rope-loop handle on the left wall and one on the right wall (a dark tan ring drawn INSIDE the square, not sticking out); a loose tuft of golden straw spilling over the rim in the bottom-left corner.
   It stays the plainest of the six.

2. crate-secure-v2.png
   OUTLINE: an OCTAGON. All four corners are cut off at 45 degrees, each cut about 14% of the side, with a riveted steel plate across each cut.
   COLOUR: dark charcoal steel, clearly the darkest.
   RIM: each wall is a row of four or five thick steel bars with narrow light gaps, seen along the rim, so the rim reads as a heavy grille ring; a chunky padlock on a hasp at the middle of the top wall. The bars are in the rim zone only, never across the opening.

3. crate-quiet-v2.png
   OUTLINE: a very soft rounded square, corner radius about 25% of the side. The roundest and softest of the square-ish ones.
   COLOUR: deep muted plum, as now.
   RIM: a thick quilted, padded rim all the way round, puffy pillow sections divided by stitched seams; a rolled blanket (bedding) lying along the bottom wall, inside the rim zone.

4. crate-ventilated-basket-v2.png
   OUTLINE: a perfect CIRCLE. It is the only round crate of the set.
   COLOUR: warm golden wicker, as now.
   RIM: a thick, rolled, visibly woven two-strand rim all the way round, with a few open weave gaps showing dark; a leather strap with a small brass buckle on the rim at the top; a small water bottle (a clear tube with a metal spout) lying along the lower rim.
   It belongs with the wicker basket on Trikey's handlebars.

5. crate-warm-vivarium-v2.png
   OUTLINE: a square with sharp corners EXCEPT the top-right corner, which is rounded off by the lamp: a big round metal reflector hood fills that corner and gives it a bulging curve.
   COLOUR: cool pale blue-green glass, the coolest of the six.
   RIM: glass walls as pale translucent panels with thin dark frames and small metal clips on the other three corners; a row of five narrow vent slots in the bottom wall; the heat lamp in the top-right corner, with a soft amber glow. The hood and the glow stay inside the corner square (20% by 20%) and read as one clear spot of warm amber.

6. crate-perch-carrier-v2.png
   OUTLINE: a square whose TOP EDGE DIPS. Two tall square posts stand at the two top corners, and the top wall between them sits about 8% lower than the posts, like a gate. The other three edges are plain and sharp-cornered.
   COLOUR: soft sage green, as now.
   RIM: a dark wooden perch bar spanning between the two posts, running along the TOP rim zone, parallel to the top wall. The perch does NOT cross the middle any more: in round 2 it did, and that is withdrawn, because the middle must stay clear. A small round seed cup (cream dish, inked) in the bottom-right rim zone.

=== ACCEPTANCE TESTS (we will run them again ourselves) ===
1. COLOUR REMOVED. Build the sheets at exactly 72 px and at exactly 68 px per crate, not enlarged. Each sheet has three rows: (a) colour; (b) the same sprites with colour fully removed (luminance only); (c) silhouettes (the alpha only, solid black). Shuffle row (b) and check that you can name every crate from outline and fittings alone, without labels. If two get confused, redraw one of them. Row (c) must show six clearly different outlines: circle, octagon, soft square, plain square, square with one round corner, square with a dipped top. The dip and the round corner must each be at least 4 pixels deep at 72 px.
2. CLEAR CENTRE. In every file the middle 60% by 60% is flat pale cream floor with paper grain only. Look at each one.
3. ONE FOOTPRINT. Each drawing touches the same 92% square on all four sides and nothing sticks out past it.
4. WHOLE AND TRANSPARENT. Nothing cut off. Transparent outside the crate, in the cut corners of the octagon and above the dipped wall of the perch carrier. No ground, no shadow.
5. STYLE. The same hand as the portraits. No plasticine, no shine.

=== DELIVERY ===
Exactly these six filenames, 1024 x 1024, transparent, attached in the final message of this round:
crate-standard-v2.png, crate-secure-v2.png, crate-quiet-v2.png, crate-ventilated-basket-v2.png, crate-warm-vivarium-v2.png, crate-perch-carrier-v2.png
Plus two check sheets named crate-sheet-72px-v2.png and crate-sheet-68px-v2.png (three rows each, as above).
Do not re-attach the earlier rounds' files.
Tell me everything you decided that I did not specify.

=== SELF-CHECK BEFORE DELIVERY ===
For each crate ask: "would someone looking at this EMPTY crate at 72 pixels, in greyscale, know which of the six it is, see a crate rather than a picture frame, and find the middle clear?" If not, redo that crate before shipping.
```

## 9. Brief 2 in full, as sent: Trikey's portrait (new task `Ksj8meKU4PHq7raJ6rVmhA`, title "A.R.C. Trikey portrait: add a rear rack, make three wheels read (repaint)")

```text
ONE image: a minimal repaint of existing art for a children's animal-rescue game. The players are autistic children, so clarity beats decoration.

=== WHAT THIS IS ===
Trikey is the pedal tricycle a child meets first. Her master portrait is linked below and is CANON: it is already in the game's line-and-wash style, and every other view of her is painted from it. This task changes TWO things on that portrait and nothing else.

=== STOP CONDITION: READ FIRST ===
Open these before drawing.
THE PORTRAIT TO REPAINT (this is the vehicle, and the picture you are editing):
https://animal-rescue-centre.vercel.app/assets/driving/vehicles/vehicle-trikey.png
THE SAME HAND, four sibling portraits (for style and line weight only; do not copy their subjects):
https://animal-rescue-centre.vercel.app/assets/driving/vehicles/vehicle-henry.png
https://animal-rescue-centre.vercel.app/assets/driving/vehicles/vehicle-bea.png
https://animal-rescue-centre.vercel.app/assets/driving/vehicles/vehicle-spark.png
https://animal-rescue-centre.vercel.app/assets/driving/vehicles/vehicle-big-tilly.png
If you cannot open the Trikey portrait, STOP and tell me. Do not generate her from this description alone. In your first reply, say which of the five URLs you opened.

=== CHANGE 1: A REAR RACK ===
Today she has nowhere to carry crates. Add a flat REAR RACK behind the saddle, over the back axle, built to carry TWO CRATES IN LINE: one crate wide, two long, one behind the other along her length.
- Draw the rack EMPTY. The game puts the crates on it. Do not draw any crate, box, trailer or luggage. A terracotta rear box that appeared in earlier sprites of her is NOT part of her and must not appear.
- The deck is twice as long as it is wide: room for two square crates nose to tail, and no room for a third. In the picture it runs about 35 to 40% of her overall body length (about 190 to 210 px at the portrait's present scale), starting just behind the saddle and centred over the back axle, with a little more behind the axle than in front. Each crate would be about 60% of the width of her wicker basket.
- Deck: natural wooden slats, to match the oak bed in the Big Tilly portrait. Rack frame and uprights: the same duck-egg blue as her frame. A low blue rail round the deck, about a third of a crate high.
- Two slim blue struts run from the deck down to the rear axle, as on a real rear rack.
- Seen from the same angle as the rest of her: the near rail and a sliver of the deck top.
- Her cream GO pennant stays, same size and lettering. Its pole rose from the rear mudguard, which the rack now covers, so stand the pole at the rack's rear corner instead.

=== CHANGE 2: THREE WHEELS THAT READ AS THREE ===
She is a TRIKE: one wheel at the front and two side by side at the back. At thumbnail size she reads as a BICYCLE, because the far rear wheel is half hidden behind the chain guard, the crank and the pedal. Fix that and keep her three wheels.
- Show the far rear wheel as its own full wheel: its whole tyre ring, hub and spokes, with the same blue mudguard as the near rear wheel.
- Nothing may be drawn across its tyre ring. Move or shrink the chain guard, crank arm and pedal as much as needed. The chain guard can sit on the near side only.
- Leave a visible gap between neighbouring tyres so the three read as three separate rings.
- TEST: shrink the whole image to 128 px wide and count the wheels. It must be three, and she must not look like a bicycle with a spare wheel.
- You may shift the far rear wheel a little to make this work. The front wheel, the shape of her frame and everything else stay where they are.

=== KEEP, UNCHANGED: SAME COLOURS, SAME DRAWING, SAME POSITION ===
The duck-egg blue frame (about RGB 140, 169, 180); the wicker basket at the front with the folded map in it (it stays a BASKET and is not cargo); the brown saddle; the wooden spoked wheels with dark grey tyres; the brown handlebar grips and the brass bell; the brown pedals with orange reflectors; the GO pennant; THREE wheels.
Same canvas (1024 x 512), same camera, same position and scale for everything you do not change. This is a repaint of an existing on-style picture, not a new character. If something is not named above, copy it from the portrait.

=== STYLE ===
Line and wash, exactly as the portrait and its four siblings: a hand-inked, slightly wobbly warm brown-black outline, muted watercolour washes with dry-brush streaks and visible paper grain, details DRAWN rather than modelled.
BLOCKLIST (will be rejected): plasticine, claymation, 3D render, glossy or specular highlights, moulded rubber, soft modelled shading, baked or cast shadows, gradients, airbrush glow, anime, flat vector shading, photorealism, sci-fi.
Keep the palette restrained: flat washes plus paper grain. The finished file is quantised to an 8-bit palette of under about 200 colours, so avoid noisy textures and soft gradients that would band.

=== GROUND AND FRAME ===
Transparent background. Keep the faint dry-brush ground smudge under the wheels exactly as the portrait has it, and add nothing else: no road, no kerb, no grass, no pavement, no cast shadow.
Draw her WHOLE: nothing cut off by the canvas edge, and at least 20 px of clear transparent margin all round. The rack and pennant will push her silhouette a little to the right; there is room. The canvas stays 1024 x 512. Do not re-centre or rescale her: the front wheel stays where it is.

=== DELIVERY ===
ONE file named vehicle-trikey.png, 1024 x 512, transparent background.
Plus one check picture named vehicle-trikey-check.png: the original and your repaint side by side, with both again below at 128 px wide.
Tell me everything you decided that I did not specify.

=== SELF-CHECK BEFORE DELIVERY ===
Ask yourself: "would someone recognise this as the same Trikey as the portrait, in the same hand as the four sibling portraits? Can I count three wheels at 128 px? Is there room on the rack for exactly two crates in line? Is the wicker basket still a basket? Is anything cut off?" If any answer is wrong, redo the picture before shipping.
```
