# Art commission, 2026-10-09: repaint the three vans (Henry, Bea, Spark) as portraits

Sent to Manus on 2026-10-09 at 15:54 BST (epoch 1791557672) after Marcus approved it. Nothing retrieved this turn, and nothing polled. Source rules: `docs/manus-sprite-rules.md` (1, 2, 6, 7, 8), `.claude/notes/commissions-2026-10-09.md` (house style and recorded traps), `.claude/HANDOVER.md` (livery table, 2026-10-06).

## 1. What was sent

| | |
|---|---|
| Manus task | `bGGqbMdwhCvUVsTiKBnV4x` (new task) |
| URL | https://manus.im/app/bGGqbMdwhCvUVsTiKBnV4x |
| Title | A.R.C. van portraits: repaint Henry, Bea and Spark in saturated liveries (roof carries the colour) |
| Profile | manus-1.6-max (the project norm for continuity work) |
| Output expected | `vehicle-henry.png`, `vehicle-bea.png`, `vehicle-spark.png` (each 1024x512, transparent) plus `vans-livery-check.png`, plus a text reply with the measured median body RGB and lightness, roof RGB and body-colour share per van |
| Scope | PORTRAITS ONLY, all three. No top-downs (see section 8) |

Why a new task: the livery thread `JPi3P3qMaoYsZzFGJ2siXb` carries the reverted-round trap and 10,248 credits of context, and the Trikey portrait task `Ksj8meKU4PHq7raJ6rVmhA` is a different job still in flight. The brief below is the text submitted, copied from the file that was passed to the tool.

## 2. The palette (given, used exactly, not re-derived)

| vehicle | body RGB | hue | lightness | name |
|---|---|---|---|---|
| Henry (small van, 4 crates) | (142, 52, 54) | 359 | 79 | deep maroon |
| Bea (long van, 6 crates) | (74, 112, 164) | 215 | 107 | slate blue |
| Spark (electric minibus, 6 crates) | (116, 156, 102) | 104 | 138 | leaf green |

Not painted by this commission, given so the artist avoids them: Trikey soft lilac (180, 152, 196); Big Tilly warm tan (238, 183, 116) with coral accents and her open wooden bed.

Checked, not re-derived: all ten fleet pairs clear both tests. Smallest colour distance 86.9 (Bea to Spark; threshold 60). Smallest lightness gap 26.4 (Trikey to Big Tilly; threshold 20). One small mismatch to know about: with the formula that reproduces 79, 107, 138 and 192 (0.299 R + 0.587 G + 0.114 B), Trikey's lilac computes as 165, not the 162 in the ladder I was given. The brief says "about 165". Every pair still clears 20.

## 3. Credit position

The Manus API does not expose a balance; `manus_credit_usage` is a ledger only, so this is an estimate.

- Latest grant: +40,000 "Manus Pro" on 2026-09-29. Costs recorded since then, all on the first ledger page: **20,574**. So about **19,400 credits remain** (40,000 minus 20,574 = 19,426), ignoring any carry-over, daily credits or expiry, none of which the ledger shows.
- That is lower than the "roughly 21,000" in the commission. The difference is spend the ledger shows since: the crate thread stands at 1,596 in total (it was 613 before round 3, so round 3 has cost about 983 so far), Trikey's portrait at 390 so far, and two Pfish tasks (not this project) at 357 and 139. The crate and Trikey figures may still rise if those tasks are running; I did not check them.
- Comparators from the ledger: Trikey portrait (one image plus a check picture) 390 on the ledger so far; crate round 3 (six images plus two sheets) about 983 so far; nav badges 719; six monograms 2,594; the whole livery pass 10,248. Single concept images on other projects ran 340 to 436 each.
- **Estimate for this round: about 800 to 1,500** (three portraits at roughly 350 to 440 each, plus the check sheet). A full redo of all three after Manus's own self-check would roughly double it, to about 2,600 at worst. That is under the 3,000 stop line, so it was submitted. No cost is known yet; the task has only just started.
- Cost after submitting: not looked at. Check `credit_usage` once, on retrieval.

## 4. Style anchors: what was verified, and how

Check run at 14:50 UTC on 2026-10-09: `curl` of each URL, `shasum -a 256` of the download against the local file (first 12 hex), plus HTTP status and content type.

| URL path under `https://animal-rescue-centre.vercel.app/assets/driving/` | HTTP | Matches local |
|---|---|---|
| `vehicles/vehicle-henry.png` | 200 image/png | **yes** (d330bf7c9399) |
| `vehicles/vehicle-bea.png` | 200 image/png | **yes** (3ae7a3291f9a) |
| `vehicles/vehicle-spark.png` | 200 image/png | **yes** (90df674a443c) |
| `vehicles/vehicle-big-tilly.png` | 200 | yes (362785b520ee), not used |
| `vehicles/vehicle-trikey.png` | 200 | yes (baf6517645cc), not used |
| `topdown/vehicle-topdown-henry.png` | 200 | **no** (live f55ac1bb2507, local 126c9c706732) |
| `topdown/vehicle-topdown-bea.png` | 200 | **no** (live 9f1ebf541d2e, local 53fc5a920e6c) |
| `topdown/vehicle-topdown-spark.png` | 200 | **no** (live 474d156521c3, local caf463ce47b6) |
| `topdown/vehicle-topdown-henry-rear.png` | 200 | **no** (live e3ffd7810448, local 831989d61617) |

- **The three anchors in the brief are the three van portraits.** They are the pictures being repainted and they serve identically, so nothing needed attaching. Big Tilly and Trikey were verified but left out: Trikey is itself being repainted (her live portrait is the pale-blue one), and Big Tilly's portrait sits on a visible paper panel and runs the full canvas height.
- **No top-down is used as an anchor or linked.** They still differ from local, as they did this morning. `git branch -r --contains b829999` and `git branch -r --contains a08ab96` both return nothing, so the repaint commits are still on no remote branch (and neither is an ancestor of the remote `main` at `8c47222`, checked with `git merge-base --is-ancestor`; only local branches contain them). The brief carries a line telling Manus not to take style from any `vehicle-topdown-*.png` at that address, because those are the old clay renders.
- Rule 1's stop line is in the brief, and it asks Manus to say in its first reply which URLs it opened (Rule 6's failure mode is silently proceeding without fetching).

## 5. Findings that qualified the brief (check these first)

1. **Henry's portrait already has a maroon roof.** The handover table (2026-10-06) says "cream body AND CREAM ROOF", and the old top-down is cream. The portrait itself shows a deep maroon roof panel from windscreen to tail. So the "palest surface over half the sprite" cause is true of Henry's body, not of his portrait roof; his top-down was simply painted cream against its own master. The brief says "keep the maroon roof" and makes the rest of the body match it.
2. **The portraits are three-quarter views of the front and side, not pure side views**, and they show no rear door. The paw-heart cannot be painted on any of them. The brief therefore forbids a paw anywhere in this task and records its colour for the later rear view: cream (about 250, 244, 215), rear door only, not repeated.
3. **There is no charging flap on Spark** in the portrait, the top-down views, or any doc in the repo. The brief says do not add one, and that if one is ever drawn it keeps its own material.
4. **Spark's portrait is partly see-through.** Measured on the local file inside the closed silhouette: 65% opaque, 21% semi-transparent, 14% fully clear (Henry and Bea are 93% opaque). Some of that is window glass, but the grey patches on his body are unpainted paper showing through. That is why he measured as neutral white at 63%. The brief asks for a solid opaque body wash.
5. **Big Tilly's portrait cab is red-coral, with an oak bed.** The commission's "warm tan with coral accents" is how she reads from above (the bed). The brief uses the commission's wording.
6. **The Trikey task (running at its last recorded look) keeps her duck-egg blue frame.** Its brief (commissions note, brief 2) says to keep the frame colour unchanged. The soft lilac named here is a separate change that is not in that task. Worth settling who sends it, because the whole lightness ladder (165 for Trikey) assumes the lilac.

## 6. Things I decided myself (not in the instructions)

- **New task**, not a message in an existing thread (reason in section 1).
- **Profile manus-1.6-max**, as the livery pass, crates and Trikey used.
- **What happens to the old livery's secondary colours.** Henry's maroon skirt and arches, and Bea's chocolate-brown lower half, become a slightly darker wash of the same body hue, so the vehicle stays one colour with a readable band. Bea's brown is dropped as a colour: leaving it would make her half brown and split the blue.
- **What stays.** Henry's oak flank panel with its flowers, the oak beltline strip and the cream A.R.C. oval badge; Bea's gold pinstripe, gold scrollwork with pink roses, gold "Bea" script, brass bumpers and hubcaps; Spark's black wheels and ink seams.
- **Spark's bolt and "Spark" lettering turn warm cream** (about 250, 244, 215), because green on green vanishes. Same cream as the paw-heart and Henry's old body.
- **No ground smudge.** The old portraits have a faint dry-brush ground smudge under the wheels (Henry olive, Spark green). The commission said transparent ground and no baked shadow, so the brief tells Manus to leave it out. This differs from Trikey's brief, which kept hers.
- **A check picture and a measurement report** (`vans-livery-check.png`: the three in colour and in greyscale; plus median body RGB, lightness, roof RGB and body share per van in the reply). Not asked for; added so we can compare Manus's numbers with ours.
- **Tolerances named in the brief are mine**: median body colour within about 10 per channel, lightness within 6, body colour about half or more of the opaque pixels outside tyres and glass. Lightness wins on conflict, as instructed.
- **Filenames match the installed ones** (`vehicle-henry.png` and so on, no `-v2`), as the Trikey brief did, because this is a new thread with no earlier rounds. Download to `manus-output/van-portraits/`, never into the repo.
- **The brief tells Manus the later top-down camera** (elevated bird's-eye, far end 88% of the near end) and that no child is using the game yet, so familiarity is not a constraint.

## 7. Provider and retrieval warnings

- **Rule 6 is Marcus's to settle.** It is dated 2026-04-24, says OpenAI `/v1/images/edits` ONLY for continuity work, and records no later choice. The Manus choice for fleet work is in the handover ("Manus, not OpenAI", 2026-09-06). This was sent to Manus as the project default. These three are edits of existing pictures, which is what `tools/gpt-image-regen.sh` is for; if Manus redraws the line work instead of repainting it, that is the fallback Rule 6 prescribes.
- Check the first assistant reply lists which of the three URLs it opened; do not trust "All references loaded".
- Download links are signed and expire; take fresh ones from `manus_list_output_messages` on the day.
- Retrieve with `manus_download_output` and an explicit `output_dir`. If the thread gains a second round, take only the latest round's three portraits and `vans-livery-check.png`, and compare against the first (the earlier crate and livery threads both returned stale or reverted attachments).

## 8. Next steps

1. **One** `manus_get_task bGGqbMdwhCvUVsTiKBnV4x` (status `stopped` means done). Note `credit_usage`. Do not poll.
2. Download to `manus-output/van-portraits/` (`file_filter` `.png`).
3. Run the tests ourselves, not on Manus's word: median body RGB and lightness per van against the table; roof pixels sampled; the three bodies in luminance only are clearly three greys; no see-through patches in the body; 1024x512 with at least 20 px clear margin; line work unchanged (overlay against the current portraits); no paw-heart anywhere; no ground; under about 200 colours after quantising.
4. **Install by hand.** There is no installer for portraits (`tools/install-vehicles.py` is for `assets/driving/topdown/` only; `install-restyled.py` is for animals; `install-crates.py` is for crates). Back up `apps/game/public/assets/driving/vehicles/vehicle-{henry,bea,spark}.png`, quantise to an 8-bit palette keeping the 1024x512 canvas, and force near-opaque palette entries fully opaque as `install-crates.py` does (the quantiser otherwise leaves bodies at alpha 252 to 254).
5. **Commit and DEPLOY the portraits before anything links them** (Rule 1). Until then the live portraits are the old pale ones.
6. **Then the top-downs, painted from the repainted portraits.** Not commissioned this turn. Per the handover table that is Henry's five files (`henry`, `henry-rear`, `henry-side-left`, `henry-side-right`, `henry-side`), Bea's two (`bea`, `bea-rear`) and Spark's two (`spark`, `spark-rear`). `tools/install-vehicles.py` exists for these (it gates on silhouette IoU, applies `skew-topdown.py` at taper 0.88 and quantises to 256 colours); the portraits are a hand install. Before that brief is sent:
   - The repainted portraits must be committed and deployed.
   - The repainted fleet top-downs (`b829999`, `a08ab96`) must be pushed and deployed too, or any anchor URL serves plasticine. Re-run section 4's check first: it fails today.
   - Carry forward: the roof carries the colour (with the measured reason), the lightness ladder and "keep the lightness", and Rule 8's camera and plasticine blocklist.
   - **Henry's rear brief carries the paw-heart: cream (about 250, 244, 215), rear door only.**
   - Spark's bolt and lettering are cream on the flanks only, not on the roof.

---

## 9. The brief as sent (new task `bGGqbMdwhCvUVsTiKBnV4x`)

```text
THREE images: a repaint of three existing portraits for a children's animal-rescue game. The players are autistic children, so clarity beats decoration. Read the whole brief before drawing.

=== WHAT THIS IS, AND WHY ===
The game's fleet has five vehicles; Henry, Bea and Spark are the three vans. Seen from above (the game's bird's-eye camera) the three are almost the SAME colour, so a child cannot tell them apart. Measured on the game's own top-down pictures, on a 0 to 441 colour-distance scale (under 60 reads as one colour to the eye):
- Henry to Bea: distance 3. Henry to Spark: 31. Bea to Spark: 30.
- In greyscale their lightness differs by only 2, 4 and 6 (out of 255), so a colour-blind child cannot tell them apart at all.
Henry measures cream (51% of his pixels), Bea cream (50%), Spark neutral white (63%). Two causes compound:
1. A bird's-eye camera sees mostly ROOF, and the roof is the least liveried part of a vehicle.
2. The portraits draw all three vans pale (cream, ivory, white), and the top-down views are painted from the portraits, so from above the palest surface covers half the picture or more.

THE DECISION: repaint the three vans properly, with saturated, genuinely different bodies. No child is using the game yet, so there is no familiar look to preserve: choose on merit and follow the palette below. The top-down views will be painted from YOUR portraits afterwards (an elevated bird's-eye camera, far end 88% of the near end), so what you paint here is what a child will see from above. Do NOT draw any top-down or plan view in this task. Portraits only.

=== STOP CONDITION: READ FIRST ===
Open these before drawing. They are the three portraits you are repainting, and each also shows you the hand of the other two:
HENRY https://animal-rescue-centre.vercel.app/assets/driving/vehicles/vehicle-henry.png
BEA https://animal-rescue-centre.vercel.app/assets/driving/vehicles/vehicle-bea.png
SPARK https://animal-rescue-centre.vercel.app/assets/driving/vehicles/vehicle-spark.png
If you cannot open any of these, STOP and tell me which. Do not draw from this description alone. In your first reply, say which of the three you opened.
Do not take style, colour or shape from any file named vehicle-topdown-*.png at that address: those are old clay renders and are NOT the style.

=== THE RULE THAT MATTERS MOST: THE ROOF CARRIES THE COLOUR ===
The body colour must be on the ROOF, not only on the flanks and skirt. A bird's-eye camera cannot see a flank flash or a lower skirt; it sees the roof. If you paint a beautiful liveried flank and leave a cream or white roof, nothing will have changed.
- Every part of the roof the portrait shows (Henry's roof panel; the thin top plane and gutter line on Bea and Spark) is painted in the body colour at its full mid-tone. Not a paler wash, not cream, not white, not a highlight "catching the light".
- Bonnet, upper body, doors, rear and flanks are the body colour too. The body is ONE colour, with the style's own lighter and darker washes around it.
- Spark's green today exists only as a flash along the flank, which from above is invisible. His whole body, roof included, becomes the green.
- Paint the body as a SOLID opaque wash. Spark's present portrait is partly see-through across the body (unpainted paper, which is why he reads as grey-white). No transparent holes or bare patches anywhere inside a vehicle's body.

=== THE PALETTE: USE THESE EXACTLY ===
Each RGB is the MID-TONE of the painted body: the colour of the middle of the wash, with the style's own lighter and darker washes around it.

| vehicle | body RGB | hue | lightness (0-255) | name |
| Henry (small van) | (142, 52, 54) | 359 | 79 | deep maroon |
| Bea (long van) | (74, 112, 164) | 215 | 107 | slate blue |
| Spark (electric minibus) | (116, 156, 102) | 104 | 138 | leaf green |

Lightness = 0.299 R + 0.587 G + 0.114 B.

THE VEHICLES MUST DIFFER IN LIGHTNESS AS WELL AS IN HUE. This is the test the old fleet fails hardest, and it is the one that serves a colour-blind child. The whole fleet's lightness ladder is deliberately even: Henry 79, Bea 107, Spark 138, Trikey about 165, Big Tilly 192. So if you must choose between matching an RGB exactly and keeping a vehicle clearly distinct in LIGHTNESS from its neighbours, KEEP THE LIGHTNESS. Do not lighten Henry toward Bea, do not darken Spark toward Bea, and do not wash a van out to a pastel.

Two fleet members are not yours to paint, and the vans must stay clear of them: Trikey is being repainted a soft lilac (180, 152, 196), and Big Tilly stays warm tan (238, 183, 116) with coral accents and her open wooden bed. No lilac, no tan and no coral-red bodies.

=== THE THREE, ONE BY ONE ===
Everything not named here stays as drawn in the portrait: same drawing, same position, same scale, new colour.

1. vehicle-henry.png : deep maroon (142, 52, 54)
   BODY: roof (his portrait already has a maroon roof panel: keep it), bonnet, upper body, door, rear flank and cab all in the maroon. The old cream body goes. The old maroon lower skirt and wheel arches become a slightly DARKER wash of the same maroon, so they still read as a band by their line and wash without becoming a different colour.
   KEEP IN THEIR OWN MATERIALS: the oak wood-grain panel on the rear flank with its painted pink and sage flowers, and the oak strip along the beltline of the bonnet and door; the cream oval badge on the door lettered A.R.C. in maroon serif (cream reads well on this maroon: same position, size and lettering); chrome grille, bumper and hubcaps; round headlamps; orange indicator lamps; windscreen and windows.
   THE PAW-HEART. Henry has a paw-heart on his REAR DOOR only. His portrait is a three-quarter view of his front and side and does not show the rear door, so DO NOT PAINT A PAW-HEART ANYWHERE in this task: not on the door, the flank, the bonnet or the badge. It is recorded here because his rear view will be painted from your portrait afterwards and must carry it. It used to be maroon ink on a cream body; a maroon paw would vanish on this maroon body, so it will be painted CREAM, about (250, 244, 215), on the rear door only, and not repeated anywhere else on the vehicle.

2. vehicle-bea.png : slate blue (74, 112, 164)
   BODY: roof, bonnet, upper body, door, flank and rear all in the slate blue. The old ivory upper goes. The old chocolate-brown lower half becomes a slightly DARKER wash of the same slate blue (same hue, a deeper wash), so the lower band still reads by its line and wash.
   KEEP IN THEIR OWN MATERIALS: the gold pinstripe along the waistline and the roof gutter; the gold scrollwork with dusky-pink roses on the flank (it will read well on blue); "Bea" in gold script on the door; chrome grille; brass bumpers and brass hubcaps; windscreen, windows and the red rear lamp.

3. vehicle-spark.png : leaf green (116, 156, 102)
   BODY: roof, bonnet, upper body, doors, flanks and rear in the leaf green. The old white goes.
   THE LIGHTNING-BOLT FLASH AND THE LETTERING: green on a green body would vanish, so the bolt and the word "Spark" become WARM CREAM, about (250, 244, 215), with a thin warm ink edge: same shape, same position, same size.
   KEEP IN THEIR OWN MATERIALS: black wheels; windscreen and windows; door seals and panel lines drawn in ink; headlamp and rear lamp. His portrait shows no charging-port flap: do not add one. (If one is ever drawn, it is its own material, pale grey plastic with a small inked plug symbol, never body green.)

=== NOT EVERYTHING TURNS ONE COLOUR ===
Only the BODY changes colour. Windows, tyres, lamps, bumpers, door seals, chrome, brass, wood, and the badge and lettering colours named above keep their own materials. If a vehicle becomes a single tint it stops reading as a real object, which is exactly what the line-and-wash style exists to prevent. Glass stays glass, tyres stay dark grey, chrome stays pale grey and cream, brass stays brass. Do not colour-grade the whole picture.

=== THE TESTS WE WILL RUN (run them yourself first) ===
1. BODY COLOUR. Take the opaque body-wash pixels (roof and flank washes; exclude ink outline, glass, tyres, lamps, bumpers, chrome, brass, wood, badge, lettering and decoration). Their MEDIAN colour is within about 10 per channel of the table's RGB, and it is the largest single colour on the vehicle: about half or more of its opaque pixels outside tyres and glass.
2. LIGHTNESS. The median body lightness is within 6 of the table (79, 107, 138). If tests 1 and 2 conflict, lightness wins.
3. ROOF. The roof pixels are the body colour. Sample the roof and report it.
4. GREYSCALE. With all colour removed (luminance only) the three bodies read as three clearly different greys: dark, middle, lighter.
5. WHOLE AND TRANSPARENT. See the frame section below.

=== STYLE ===
Line and wash, exactly as the three portraits already are: a hand-inked, slightly wobbly warm brown-black outline (keep the existing linework as drawn), muted watercolour washes with dry-brush streaks and visible paper grain, details DRAWN rather than modelled. A saturated body is still muted watercolour: a wash, not paint-pot colour. Warm, friendly, clear.
BLOCKLIST (will be rejected): plasticine, claymation, 3D render, glossy or specular highlights (no shine on roofs or bonnets), soft modelled shading, moulded rubber, baked or cast shadows, gradients, airbrush glow, anime, flat vector shading, photorealism, sci-fi.
Glass and chrome are shown with flat pale washes and ink lines, never with shine.
Keep the palette restrained: flat washes plus paper grain. The finished files are quantised to an 8-bit palette of under about 200 colours, so avoid noisy textures and soft gradients that would band.

=== VIEW, GROUND AND FRAME ===
Same canvas as the portraits: 1024 x 512 PNG, transparent background. Same camera (a three-quarter view of the front and side, facing LEFT, camera a little above), same position, same scale. This is a repaint of an existing drawing, not a redesign: the silhouette, windows, wheels, lamps and linework do not change.
Draw NO ground: no road, no kerb, no grass, no ground smudge, no cast shadow, no baked shadow. The old portraits carry a faint ground smudge under the wheels; leave it out, the game draws its own shadow. The wheels simply end on transparent.
Each van is drawn WHOLE: nothing cut off by the canvas edge, and at least 20 px of clear transparent margin all round.

=== DELIVERY ===
Exactly three files, 1024 x 512, transparent background, attached in the final message:
vehicle-henry.png, vehicle-bea.png, vehicle-spark.png
Plus one check picture named vans-livery-check.png: the three repainted vans side by side at the same scale, once in colour and once below it in luminance only (greyscale).
In your reply give, for each van: the median body RGB and lightness you measured, the roof RGB, and the share of its opaque pixels (outside tyres and glass) that the body colour covers.
Do not attach any other files. Tell me everything you decided that I did not specify.

=== SELF-CHECK BEFORE DELIVERY ===
For each van ask: "Is the ROOF the body colour, and not a paler one? Would a colour-blind child tell this van from the other two in greyscale? Is the colour the body itself, rather than a thin wash round a pale body? Have the windows, tyres, lamps, bumpers, chrome, brass, wood and badge kept their own colours? Is it the same drawing as the portrait? Is anything cut off, shiny or clay-like?" If any answer is wrong, redo that van before shipping.
```
