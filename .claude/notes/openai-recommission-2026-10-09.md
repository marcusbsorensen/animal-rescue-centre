# Moving the three art commissions off Manus, 2026-10-09

Written after retrieving all three of the day's in-flight Manus commissions and testing the OpenAI route that Rule 6 prescribes. Source: `docs/manus-sprite-rules.md` (Rules 2, 6, 7, 8), `.claude/notes/commissions-2026-10-09.md`, `.claude/notes/van-repaint-2026-10-09.md`.

**The short version.** All three tasks had already finished on their own before this session opened them; nothing needed stopping and nothing was still burning credits. All three delivered their full file list, and **all three measure correct against their own briefs** — the drift Rule 6 guards against did not happen on any of them. The OpenAI re-commission was then tested rather than assumed, and cannot be carried out as planned: the endpoint has no 1024×512 canvas, so no portrait can go through it, and a single crate probe drifted further than Manus had. Nothing was re-commissioned. Total spent proving this: one probe, about $0.04.

---

## 1. Credit and cost position

**Manus.** The API exposes no balance, only a ledger. Latest grant +40,000 ("Manus Pro", 2026-09-29); costs recorded since total **20,810**, so about **19,190 credits remain** (19,426 before the van task started).

| Commission | Task | Status | Cost |
|---|---|---|---|
| Three van portraits | `bGGqbMdwhCvUVsTiKBnV4x` | stopped 15:04 UTC, no background jobs | **236** |
| Trikey portrait (both turns) | `Ksj8meKU4PHq7raJ6rVmhA` | stopped 14:16 UTC, no background jobs | **390** |
| Six crates, round 3 | `fC4SeHdgYgHYTMpGDFKyif` | stopped 14:43 UTC, no background jobs | **~983** (thread total 1,596 less 613 before round 3) |
| | | **Committed on these three** | **~1,609** |

Every one came in under its estimate. The vans were estimated at 800–1,500 and cost 236. Trikey was estimated at 200–700 and cost 390 for two turns. The crates were estimated at 300–700 and cost about 983, the only overrun, and that bought three internal correction passes.

**OpenAI.** `tools/gpt-image-regen.sh` documents low ≈ $0.011/image, medium ≈ $0.042/image (the project default, used by every `regen-*.sh`), high ≈ $0.167/image. The three rounds would be 10 images (3 vans + 1 Trikey + 6 crates): **$0.42 at medium, $1.67 at high.**

So **the money gate never triggers** — OpenAI is far cheaper in cash than 1,609 Manus credits are worth on any plausible conversion. What stopped the re-commission is capability, not cost. Spent today: one 1024×1024 medium probe, ~$0.042. The size probe cost nothing (HTTP 400 is returned before any image is generated).

---

## 2. Commission 1 — the three van portraits

**Delivered** (task `bGGqbMdwhCvUVsTiKBnV4x`, one turn): `vehicle-henry.png`, `vehicle-bea.png`, `vehicle-spark.png`, all 1024×512 transparent, plus `vans-livery-check.png`. Manus named all three reference URLs it opened, as the brief demanded.

**Downloaded to** `manus-output/van-portraits/`.

**Measured, not taken on trust** (body wash = opaque pixels within Euclidean distance 45 of the target mid-tone; lightness = 0.299R + 0.587G + 0.114B; roof = median of the top 18% of the silhouette bounding box with ink excluded):

| | body median | Δ worst channel (tol ~10) | body lightness | Δ (tol 6) | roof median | body share | margins | colours |
|---|---|---|---|---|---|---|---|---|
| Henry | (143, 53, 55) | **1** | 80.1 | **+1.1** | (142, 53, 55) | 47.0% | 65–128 | 180 |
| Bea | (74, 112, 164) | **0** | 106.6 | **−0.4** | (76, 113, 164) | 63.5% | 43–86 | 177 |
| Spark | (116, 156, 102) | **0** | 137.9 | **−0.1** | (116, 156, 102) | 64.8% | 66–162 | 186 |

Greyscale ladder: Henry–Bea **26.4**, Bea–Spark **31.3**, Henry–Spark **57.7**, all above the threshold of 20. The roof carries the colour on all three — the single thing the brief said mattered most. Spark's see-through body is fixed: semi-transparent pixels inside the silhouette fall from 21% on the old portrait to 4.5%, fully clear from 14% to 2.5%. Looked at as well as measured: line and wash throughout, no shine, no clay; Henry keeps his oak flower panel and cream A.R.C. oval, Bea her gold scrollwork and brass, Spark's bolt and lettering are cream on green. No paw-heart anywhere, as instructed.

**Verdict: keep all three. Nothing to redo.** The only soft number is Henry's body share at 47% of all opaque pixels against a brief asking for "about half or more" — and that is my denominator, not the brief's; on the brief's narrower denominator (excluding tyres and glass) Manus measured 54.1%, and both readings satisfy it.

---

## 3. Commission 2 — Trikey's portrait

**Delivered** (task `Ksj8meKU4PHq7raJ6rVmhA`, two turns): turn 1 the rack and three-wheel repaint, turn 2 the duck-egg-to-lilac frame change. Both turns attached `vehicle-trikey.png` + `vehicle-trikey-check.png`, **with the same filenames**, so the rounds were pulled by their own signed URLs into separate directories rather than by name.

**Downloaded to** `manus-output/trikey-portrait/round1-duckegg/` and `manus-output/trikey-portrait/round2-lilac/`. **Round 2 is the one to use.**

**Measured** (hue-banded, on opaque pixels):

| | canon | round 2 (lilac) |
|---|---|---|
| lilac, hue 255–320 | 0.00% | **12.23%**, median (192, 162, 204), L 174.6 |
| duck-egg, hue 165–215 | 10.50%, median (144, 171, 175) | **0.00%** |
| wicker, hue 25–55 | 74.01%, median (195, 148, 92) | 74.13%, median (191, 148, 91) |

- **The repaint is total and the materials rule was respected.** Duck-egg is entirely gone; wicker is untouched to within quantisation noise; the saddle is byte-identical between rounds.
- **Geometry untouched.** Silhouette IoU round 1 vs round 2 is 1.0000 — only colour changed. Against the canon portrait, left/top/bottom margins are identical (238 / 30 / 24); only the right margin moves, 180 → 47, because the rack and pennant extend right as the brief said they would. She was not re-centred or rescaled.
- **Three wheels read at 128 px.** Verified by downscaling and inspecting: front wheel plus two rear wheels with a clear gap. The rack sits behind the saddle with a wooden-slat deck, lilac rail, and the GO pennant restood at the rack's rear corner.
- Canvas 1024×512, 190 colours, margin 47 px at the tightest.

**One measurable miss.** The lilac came back lighter than specified: **L 174.6 against the target's 165.4**, median (192, 162, 204) against (180, 152, 196). That narrows the Trikey→Big Tilly gap in the fleet lightness ladder to **17.4, below the stated threshold of 20** (the ladder reads Henry 79, Bea 107, Spark 138, Trikey ~165, Big Tilly 192). Everything else on the ladder still clears.

**Verdict: keep round 2.** The miss is a ~9-point lightness overshoot on one colour, correctable by a palette shift on the lilac pixels alone without regenerating anything — the frame is cleanly separable by hue, as the table above shows. Worth Marcus's call whether that is worth doing before install or at all.

---

## 4. Commission 3 — the six crates, round 3

**Delivered** (thread `fC4SeHdgYgHYTMpGDFKyif`, round 3 as a message): all six `crate-<type>-v2.png` at 1024×1024 plus `crate-sheet-72px-v2.png` and `crate-sheet-68px-v2.png`. Manus confirmed it opened all six previous crates and all six public references, and that the withdrawn top-down was not used.

**Downloaded to** `manus-output/crates-v2/`, pulled by the round-3 signed URLs only (timestamp 1791553429, path `/animal-rescue-round3/final/`), so none of the thread's three earlier rounds of the same filenames came with them.

**Measured:**

- **One footprint, exactly.** All six bounding boxes are **932×932 at 46 px margins on all four sides — zero spread.** This is the test `tools/install-crates.py` depends on, and it is the one Manus had most room to fail.
- **Clear centre, all six.** Central 60%: mean luminance 220–235, **standard deviation ≤ 0.3, ink 0.000%** in five of six. The basket measures 2.9% ink on a square region and **0.010% on its circle** — the brief specifies a 60%-diameter circle for the round crate, so the square reading was my error, not Manus's; on the specified region it passes.
- **Six distinct outlines, with the required feature depths.** Corner fill at 14%: standard 0.89 (plain square), secure 0.10 (octagon), quiet 0.23 (squircle), basket 0.00 (circle), vivarium TR 0.47 against 0.90 elsewhere (one round corner), perch carrier 0.89 with a gate dip. The two features the brief put a minimum on both clear it: **vivarium corner inset 15.9 px at 72** and **perch-carrier gate dip 5.5 px at 72**, against a 4 px floor.
- Palettes 110–187 colours, all under the ~200 target.
- Looked at the greyscale row of the 72 px sheet: all six are nameable from outline and fittings without labels.

**Weakest point, named honestly.** Standard and vivarium are the closest pair, silhouette IoU 0.966 at 72 px — both are squares, separated by one rounded corner and by their fittings (slats and rope loops against vent slots and a lamp). They are tellable in the greyscale row, but they are the pair to watch if a seventh square crate is ever added.

**Verdict: keep all six. They pass every acceptance test in the brief.**

---

## 5. What was sent to OpenAI, and what came back

Rule 6 prescribes `/v1/images/edits` via `tools/gpt-image-regen.sh` with references attached as files. Two tests, both run rather than assumed:

**Test 1 — can the endpoint make the portrait canvas?** No.

```
GPT_IMAGE_SIZE=1024x512 tools/gpt-image-regen.sh ...
ERROR: HTTP 400 from OpenAI
  message: Invalid size '1024x512'. Supported sizes are 1024x1024, 1024x1536, 1536x1024, and auto.
```

Every vehicle portrait is 1024×512. **All four portraits (3 vans + Trikey) are therefore impossible through this route** without changing the canvas, which would break both briefs' "same canvas" instruction and the hand-install path, and would put Rule 8's "nothing is shown cropped" in play. Cost: nothing; the 400 precedes generation.

**Test 2 — one crate at 1024×1024, the supported size.** Run: `crate-standard-v2`'s brief text verbatim from `commissions-2026-10-09.md` section 8, including the clear-centre rule, the one-footprint rule, the style blocklist and Rule 6's mandatory line — *"IF YOU CANNOT LOAD THE REFERENCE IMAGES, STOP AND REPORT BACK — DO NOT GENERATE FROM DESCRIPTION ALONE."* References attached as multipart files, not linked: `manus-output/crates-v2/crate-standard-v2.png` and `apps/game/public/assets/driving/vehicles/vehicle-bea.png`. Model gpt-image-1.5, medium, ~$0.042.

**Output: `manus-output/openai-probe/crate-standard-openai-probe.png`.** It fails the same three tests the Manus crate passes:

| | Manus round 3 | OpenAI probe | brief |
|---|---|---|---|
| bounding box | **932×932**, margins 46/46/46/46 | 885×955, margins 25/44/69/70 | 932×932 at 46 |
| centre 60%, std / ink | **0.1 / 0.00%** | 34.8 / 1.85% | flat cream, no ink |
| distinct colours | **145** | 69,394 | under ~200 |

And it drifted on content in a way Manus did not: it invented **a cartoon dog and a cat peeking over the rim and a "RESCUE ANIMALS" sign across the opening** — big-eyed kawaii faces and flat cel-shading, both explicitly on Rule 4's blocklist — in a brief whose single hardest rule is that the crate is drawn empty because the animal is composited on top at run time.

The footprint failure is structural, not bad luck: each image is an independent call with no knowledge of its five siblings, so six calls give six footprints, and `install-crates.py` crops to the drawing's bounding box before scaling. Six crates would install at six different scales.

**Nothing further was sent to OpenAI, and no re-commission was placed.** Spending ~$0.38 more to replace a set that passes every test with one that fails three of them is not a trade worth making, and the four portraits cannot be sent at all.

---

## 6. What remains to be installed, and by which script

Nothing has been installed. Everything below is still only in `manus-output/`.

| Art | Where it is | Installer |
|---|---|---|
| Six crates round 3 | `manus-output/crates-v2/` | **`tools/install-crates.py`** — but it reads `manus-output/crates/<name>.png` with the plain names, so first `cp -R manus-output/crates manus-output/crates-round2`, then copy each `-v2` file over the plain name. Round-2 originals are committed in `7e2a5c8`. |
| Three van portraits | `manus-output/van-portraits/` | **No installer exists.** `install-vehicles.py` is for `assets/driving/topdown/` only; `install-restyled.py` is for animals. Install by hand: back up `apps/game/public/assets/driving/vehicles/vehicle-{henry,bea,spark}.png`, quantise to 8-bit keeping the 1024×512 canvas, and force near-opaque palette entries fully opaque as `install-crates.py` does (the quantiser otherwise leaves bodies at alpha 252–254). |
| Trikey portrait | `manus-output/trikey-portrait/round2-lilac/` | Same hand install as the vans. Decide the lilac lightness question (section 3) first. |

**Then, and only then:** commit and **deploy**, because Rule 1 needs these at public URLs before any later brief can anchor to them — and because the unpushed top-downs (`b829999`, `a08ab96`) are still serving plasticine to anything that asks. Re-run the `shasum`-against-URL check in `van-repaint-2026-10-09.md` section 4 before sending the top-down briefs; it fails today.

Code follow-ups this note does not touch: `CRATE_FLOOR` and its doc comment in `apps/game/src/driving/crate-loading-view.ts` go stale when the perch carrier lands (its perch no longer crosses the middle), and `VEHICLE_BED['pedal-trike']` needs re-measuring against Trikey's painted deck.

---

## 7. Open questions for Marcus

1. **Does Rule 6 still route portrait work to OpenAI, given there is no 1024×512 canvas?** Either portraits stay with Manus under an attach-and-verify discipline, or the portrait canvas changes to 1024×1024 / 1536×1024 and Rule 8 rules on the reframing. Recorded in `docs/manus-sprite-rules.md` under Rule 6; not decided here.
2. **Trikey's lilac is 9 points light** (L 174.6 against 165.4), which puts her 17.4 from Big Tilly against a threshold of 20. Fix by shifting the lilac pixels only — they separate cleanly by hue — or accept it?
3. **The crates are ready to install now.** They pass everything. Worth installing before the Trikey and van questions are settled, since they are independent.

---

## 8. Installed: the six crates and Trikey's portrait (2026-10-09, later)

Answers questions 2 and 3 above, and supersedes section 6's "nothing has been installed" for those two. The three van portraits are **not** installed and no top-down has been commissioned; both are the next steps. Nothing deployed. Branch `claude/crate-loading`.

### 8.1 The crates

**Re-measured before installing, and the note held.** All six `-v2` sources: bounding box **932x932 at 46 px on all four sides**, spread 0 at alpha > 0, > 16 and > 128. (At alpha > 240 the spread is 1 px, which is the soft edge and not the footprint; the installer crops at > 16.) The round-2 originals, measured the same way, had a 45 px spread, which is why round 3 was commissioned.

**Installed with** `python3 tools/install-crates.py --src manus-output/crates-v2 --suffix=-v2`. The tool gained `--src` and `--suffix` (defaults unchanged), so the `cp -R` staging step in section 6 was not needed and `manus-output/crates/` is untouched. Note `--suffix=-v2`, with the equals sign: argparse reads `-v2` as a flag.

| | footprint at 256 px (alpha > 16) |
|---|---|
| **Replaced** (round 2, `7e2a5c8`) | standard 246x256, secure 256x251, quiet 256x241, basket 256x255, vivarium 256x256, perch 256x250 — six different shapes, 342,719 bytes |
| **Installed** (round 3) | all six **256x256, margins 0/0/0/0, spread 0**, 263,050 bytes |

**The bare middle, re-checked on the installed 256 px files** (middle 60% of the footprint: a square, and for the basket a circle of 60% diameter, as the brief specifies; ink = more than 24 RGB-distance from the region's median):

| | luminance mean | std | ink | alpha min |
|---|---|---|---|---|
| standard | 225.5 | 0.01 | 0.000% | 255 |
| secure | 228.1 | 0.00 | 0.000% | 255 |
| quiet | 227.5 | 0.00 | 0.000% | 255 |
| basket (circle) | 227.9 | 0.34 | 0.032% (6 px) | 255 |
| vivarium | 231.7 | 0.11 | 0.000% | 255 |
| perch carrier | 226.3 | 0.09 | 0.000% | 255 |

Two things this showed that the source measurement did not. The sources carry **alpha 252–253 across the whole centre**, so every crate was faintly see-through; the installer's force-to-255 fixes it, and the installed alpha minimum is 255 in all six. And the vivarium's 56 "ink" pixels at source are (233,218,202) on a (244,234,217) floor, a smudge a hair over the threshold and not ink; it is 0.000% after quantising.

**Closest outline pair depends on the threshold.** At alpha > 128 on the installed files, secure/quiet is 0.969 and standard/vivarium 0.956 (on the 1024 sources, 0.970 and 0.964, close to section 4's 0.966, whose exact method is not recorded); at alpha > 16 standard/vivarium is 0.992, because the vivarium's one round corner is mostly soft edge. Either way those are the pair and the trio to watch, and the installed set is no closer than the sources were.

**Live check, real Chrome, Phaser.** All six textures load at 256x256 in `PtvDriveScene`. On Big Tilly's bed at 812x375 each of the six types is visible and nameable with an animal seated on its cream floor (parrot in the green perch carrier, hedgehog in the basket, dog and cat in standard, fox in secure, bat in quiet, snake in the vivarium). The perch carrier's perch is a rail along the top with the gate at the bottom, so `CRATE_FLOOR`'s doc comment ("the perch crosses the middle") is stale, as section 6 predicted; the number itself looks right on screen. Code not touched.

**Found while looking, not fixed:** the loading screen's bays draw **`crateDefFor(crate.species)`**, the species default, instead of the crate the child chose (`crate.crateType`, `crate-loading-view.ts` ~3462). A dog placed in `secure` is drawn in `standard`. Reproduced through the scene's own handlers; the state is right and only the drawing ignores it. Flagged as a separate task.

### 8.2 Trikey's portrait

**What it overwrote.** `apps/game/public/assets/driving/vehicles/vehicle-trikey.png`, the only place her portrait lives (drawn by `public/admin/pre-drive.html`): mode P, 1024x512, 125,579 bytes, sha256 `baf6517645cc`, the duck-egg frame with no rear rack, margins L238 T30 R181 B24 (605x458 drawn). Tracked in git (`dd7d18d`, `9878422`), and a copy is at `manus-output/install-2026-10-09/vehicle-trikey-BEFORE-installed.png`. Now: 121,741 bytes, sha256 `9c826da3df9b`, margins L238 T30 **R48** B24 (738x458 drawn).

**The correction is a palette shift, and the lilac was its own island.** The portrait is 8-bit indexed. Its palette has the wicker/leather/wood (hue 25-55), the greys and ink, and the lilac (hue 277-324), with nothing between 324 and 25 and four pixels between 180 and 277. So the lilac is selected by palette entry and nothing else can be caught. One per-channel gain, (0.9375, 0.9383, 0.9608), chosen so that the measured lilac median lands on the target. A gain and not an offset, so the shading inside the lilac keeps its proportions. `tools/correct-trikey-lilac.py` does it, re-runnable from the round-2 file, with its own checks.

| lilac mid-tone | RGB | L | hue | sat |
|---|---|---|---|---|
| delivered (round 2) | (192, 162, 204) | 175.8 | 282.9 | 0.206 |
| **now** | **(180, 152, 196)** | **165.4** | **278.2** | **0.224** |
| target | (180, 152, 196) | 165.4 | 278 | 0.22 |

(Section 3's L 174.6 is presumably the median of per-pixel lightness; 175.8 is the lightness of the median colour. The target's 165.4 is the second kind, and the shifted file measures exactly it.)

**Verified a second way, not through the tool.** Pixel-by-pixel RGBA against round 2: **15,048 pixels changed, all of them in the lilac hue band, and none of the band's pixels missed.** Alpha channel identical. Wicker/leather/wood (113,551 px), the neutrals and ink, and the pennant, basket and rack-deck regions: **0 changed**. Geometry identical, since every pixel keeps its palette index. Reads correctly on the real vehicle-choice screen: she stands whole in her card, the rack and pennant inside it.

**The ten pairs.** Colour distance (Euclidean RGB) against a threshold of 60; greyscale gap (0.299R + 0.587G + 0.114B) against 20. Bodies: the brief's five, Trikey as measured from the corrected file.

| pair | colour distance | grey gap | |
|---|---|---|---|
| Henry / Bea | 142.6 | 27.4 | pass |
| Henry / Spark | 117.5 | 58.7 | pass |
| Henry / Trikey | 177.8 | 86.2 | pass |
| Henry / Big Tilly | 173.8 | 112.7 | pass |
| Bea / Spark | 86.9 | 31.3 | pass |
| Bea / Trikey | 117.7 | 58.8 | pass |
| Bea / Big Tilly | 185.0 | 85.2 | pass |
| Spark / Trikey | 113.8 | 27.5 | pass |
| Spark / Big Tilly | 125.7 | 53.9 | pass |
| **Trikey / Big Tilly** | **103.6** | **26.4** | pass (was 16.0 before the shift) |

All ten clear both. Tightest colour distance 86.9 (Bea/Spark), tightest grey gap 26.4 (Trikey/Big Tilly). The same ten measured from the files themselves, with the three new van portraits (not installed) and the installed Big Tilly, also all clear, with one narrower margin: **the installed Big Tilly's body measures (241, 175, 119), not (238, 183, 116), which makes Trikey/Big Tilly 23.0 and not 26.4.** Passing by 3 points, and worth knowing before anyone touches Big Tilly's colour.

**Not measured:** the fleet as it stands *installed* today. The old installed vans are not the brief's colours (a body-wash search around the new Bea target finds no pixels in the old Bea), and the fallback I tried picked up trim and highlights, not bodies, so its numbers would mislead. The ten pairs are the fleet as it will stand once the van portraits land.

**Left alone on purpose.** 43 palette entries (21,144 px) carry alpha 253-254, the quantiser's near-opaque. The brief was the lilac only and the instruction was that everything else stay untouched, so they stay; `install-crates.py` forces >= 240 to 255 if that is wanted, and it is a 1% effect. **Her right margin went from 181 to 48 px** (drawn width +22%, from the rack and pennant), so anything sized from her width needs the re-measure section 6 already listed (`VEHICLE_BED['pedal-trike']`).

### 8.3 Gate, and where the pictures are

`pnpm -r typecheck` clean. `pnpm -r lint` 0 errors (apps/game 34 warnings, game-logic 11, unchanged). Tests **946 game-logic, 623 apps/game** (and 7 in badges), unchanged. `pnpm check:sprites` 557/600 with the 43 known failures allowed.

Screenshots, real Chrome with Playwright, are in `manus-output/install-2026-10-09/` (gitignored): `loading-812x375.png`, `loading-820x620.png` (the screen as it opens, crates in the tray), `filled-812x375.png`, `filled-820x620.png` (Big Tilly loaded, all six crates on the bed), `loading-trikey-*.png`, `portraits-812x375.png`, `portraits-820x620.png` (the vehicle-choice screen), `trikey-before-after.png`.

---

## 9. Installed: the three van portraits (2026-10-09, later still)

Answers section 6's "no installer exists" for the vans, and supersedes section 8.2's "Not measured: the fleet as it stands *installed*". Henry, Bea and Spark are installed; the top-downs are **not** commissioned (they are painted from these, next); nothing deployed. Branch `claude/crate-loading`.

### 9.1 Re-measured before installing, and section 2 held

Same method as section 2 (body = opaque pixels within 45 of the target, median; roof = median of the top 18% of the silhouette box, ink excluded), run on `manus-output/van-portraits/` before anything was copied.

| | body median | worst channel off target | L | dL | roof median | body share | margins L/T/R/B | palette entries used |
|---|---|---|---|---|---|---|---|---|
| Henry | (143, 53, 55) | 1 | 80.1 | +1.0 | (142, 53, 55) | 46.9% | 128 / 66 / 128 / 65 | 188 |
| Bea | (74, 112, 164) | 0 | 106.6 | 0.0 | (76, 113, 164) | 63.4% | 82 / 86 / 86 / 43 | 187 |
| Spark | (116, 156, 102) | 0 | 137.9 | 0.0 | (116, 156, 102) | 64.2% | 161 / 73 / 162 / 66 | 190 |

Body medians, roofs, margins and the 1024x512 canvas are the note's, to the digit. Body share is within 0.6 of the note's 47.0 / 63.5 / 64.8 (the note does not record its opaque threshold; the figure moves by about a point across thresholds, 62.1 to 66.5 on Spark). **Spark's see-through fix reproduces: semi-transparent pixels (alpha 1 to 192) inside the closed silhouette 20.7% on the old portrait, 4.5% on the new; fully clear inside the silhouette 9.5% to 2.5%.** (Counting every alpha from 1 to 249 as semi-transparent, which includes the soft edge, gives 24.9% to 7.0%; the note's 4.5% is the 1-to-192 reading.) Henry's and Bea's are under 1.5%.

### 9.2 What was overwritten, and where the originals are

The portraits live in one place: `apps/game/public/assets/driving/vehicles/vehicle-{henry,bea,spark}.png`, tracked in git (HEAD blobs `eaa6eac`, `bf787da`, `3962668`). Originals are copied to **`manus-output/install-2026-10-09/vehicle-{henry,bea,spark}-BEFORE-installed.png`**, shasum-checked against the installed bytes before the overwrite.

| | | bytes | sha256 (12) | margins L/T/R/B | drawn | palette |
|---|---|---|---|---|---|
| Henry | before | 141,918 | d330bf7c9399 | 128 / 65 / 128 / 61 | 768x386 | 256 |
| | **after** | **127,733** | 0be54b120a82 | 128 / 66 / 128 / 65 | 768x381 | 188 |
| Bea | before | 162,652 | 3ae7a3291f9a | 82 / 86 / 86 / 40 | 856x386 | 256 |
| | **after** | **135,622** | 474dd39bb584 | 82 / 86 / 86 / 43 | 856x383 | 187 |
| Spark | before | 160,278 | 90df674a443c | 153 / 73 / 158 / 51 | 713x388 | 256 |
| | **after** | **114,402** | b5751830d7c4 | 161 / 73 / 162 / 66 | 701x373 | 190 |

All six are mode P, 1024x512. The three are 87,091 bytes lighter in all. The drawn box shrinks by 5, 3 and 15 px in height because the old portraits carried a ground smudge under the wheels and the brief said to leave it out; Spark is also 12 px narrower for the same reason. Left and right margins on Henry and Bea are unchanged.

**A fourth copy of Henry exists and was left alone.** `apps/game/public/assets/driving/vehicle-henry.png` (the old path, directly under `driving/`, tracked) is byte-identical to the old Henry (sha d330bf7c9399). Nothing in code names it. Only docs do (`docs/arc-site-tier1-brief.md` lines 101 and 247, `docs/plan-driving-engine-2026-07-04.md` line 101). So the repo now holds the new maroon Henry at `vehicles/` and the old cream Henry at the old path, and a URL to the old path serves cream. It is outside the three files this install was scoped to; delete it or sync it, Marcus's call. Bea and Spark have no second copy.

**How.** The sources are already 8-bit indexed PNGs (187 to 190 palette entries, 1024x512), so nothing was re-quantised; re-quantising would only add error. What section 6 asked for beyond that is the near-opaque fix, and it is a change to the palette's alpha table alone: entries at alpha 240 to 254 forced to 255 (6, 6 and 7 entries; 2,861, 1,825 and 3,440 px), as `install-crates.py` does. Verified on the decoded pixels, not the indices: the RGB of every visible pixel is identical to the source and no alpha moved except the forced ones. A throwaway script did it (not committed; the procedure is the paragraph above). `tools/install-vehicles.py` was not touched and does not need a flag: it is for top-downs.

### 9.3 Re-measured after installing: the numbers survived

| | body median | L | roof median | body share | margins | semi-transparent (alpha 1-192) | clear inside |
|---|---|---|---|---|---|---|---|
| Henry | (143, 53, 55) | 80.1 | (142, 53, 55) | 46.9% | 128 / 66 / 128 / 65 | 1.2% | 2.2% |
| Bea | (74, 112, 164) | 106.6 | (76, 113, 164) | 63.4% | 82 / 86 / 86 / 43 | 0.8% | 2.4% |
| Spark | (116, 156, 102) | 137.9 | (116, 156, 102) | 64.2% | 161 / 73 / 162 / 66 | 4.5% | 2.5% |

Identical to 9.1 on every colour and geometry figure. The only difference is the forced alpha: fully opaque pixels (alpha 250 or more) inside Spark's silhouette 90.5% to 91.3%, Henry 96.0% to 96.3%, Bea 96.4% to 96.5%. For contrast, what was installed before: Henry cream with a maroon roof edge and skirt, Bea ivory over a chocolate-brown lower half, Spark white with a thin green flash. A body-wash search around the new targets finds 7.7% of Henry's opaque pixels (the old maroon roof and skirt, median (134, 47, 64)), none of Bea's, and 10.1% of Spark's (a grey, median (128, 131, 116), which is the see-through patches).

### 9.4 The fleet, measured from the installed files

Method as `fleet.py` used earlier today: body = median of opaque (alpha 200 or more) pixels within 45 of the recorded palette colour. Colour distance is Euclidean RGB against 60; grey gap is 0.299R + 0.587G + 0.114B against 20.

| | recorded palette | measured, installed | L recorded | L measured |
|---|---|---|---|---|
| Henry | (142, 52, 54) | (143, 53, 55) | 79.1 | 80.1 |
| Bea | (74, 112, 164) | (74, 112, 164) | 106.6 | 106.6 |
| Spark | (116, 156, 102) | (116, 156, 102) | 137.9 | 137.9 |
| Trikey | (180, 152, 196) | (180, 152, 196), and the lilac hue-band median agrees | 165.4 | 165.4 |
| Big Tilly | (238, 183, 116) | **(241, 175, 119)** | 191.8 | **188.3** |

| pair | colour distance | grey gap | recorded palette gives | |
|---|---|---|---|---|
| Henry / Bea | 141.9 | 26.4 | 142.6 / 27.4 | pass |
| Henry / Spark | 116.4 | 57.7 | 117.5 / 58.7 | pass |
| Henry / Trikey | 176.2 | 85.2 | 177.8 / 86.2 | pass |
| Henry / Big Tilly | 169.1 | 108.2 | 173.8 / 112.7 | pass |
| Bea / Spark | 86.9 | 31.3 | 86.9 / 31.3 | pass |
| Bea / Trikey | 117.7 | 58.8 | 117.7 / 58.8 | pass |
| Bea / Big Tilly | 184.1 | 81.8 | 185.0 / 85.2 | pass |
| Spark / Trikey | 113.8 | 27.5 | 113.8 / 27.5 | pass |
| Spark / Big Tilly | 127.6 | 50.5 | 125.7 / 53.9 | pass |
| **Trikey / Big Tilly** | **100.9** | **23.0** | 103.6 / 26.4 | pass, by 3.0 |

All ten clear both thresholds. Tightest colour 86.9 (Bea / Spark), tightest grey 23.0 (Trikey / Big Tilly). The ladder as measured: Henry 80.1, Bea 106.6, Spark 137.9, Trikey 165.4, Big Tilly 188.3.

**Where this disagrees with the palette table.** Two places. Henry delivered one point above his target in each channel, which takes a point off the grey gap of every Henry pair (26.4 against 27.4 for Henry / Bea): inside the brief's tolerance, and the only change in the three vans. And **Big Tilly is not the colour the table records**: (241, 175, 119) against (238, 183, 116), 3.5 darker, which takes 3.5 off the grey gap of all four of her pairs and the Trikey / Big Tilly gap from the table's 26.4 to 23.0. This confirms the earlier agent's reading.

**The Trikey / Big Tilly figure is soft, and the reason is Tilly, not Trikey.** Her portrait has two large colour families, not one body: red-coral (the cab, 40% of her opaque pixels, median (223, 96, 72), L 131.2) and orange-tan (the bed and hull, 39%, median (220, 162, 112), L 173.6, with a lightness spread of 125 to 219 from the 10th to the 90th percentile). "Her body" is whichever you pick, and the 23.0 comes from the pale end of the tan, found by a ball around the table's (238, 183, 116). The radius moves it:

| ball around (238, 183, 116) | median | L | gap to Trikey |
|---|---|---|---|
| radius 30 | (244, 181, 107) | 191.4 | 26.0 |
| **radius 45** (the method used above) | (241, 175, 119) | 188.3 | **23.0** |
| radius 60 | (238, 167, 119) | 182.8 | 17.4 (fails) |
| the whole orange-tan family | (220, 162, 112) | 173.6 | 8.2 (fails) |
| the red-coral cab | (223, 96, 72) | 131.2 | 34.2 |

In the greyscale row of `vans-fleet-portraits.png` Tilly's cab reads darker than Trikey's lilac and her bed lighter, so a child who cannot tell colours apart is helped by the cab and the bed together, not by one wash. Nothing here fails on the method the earlier notes used, and nothing was adjusted. What is open is the question of what "Big Tilly's body" is for this test. It matters more once the top-downs exist, because from above the bed is most of what is seen.

### 9.5 Does anything in the game read these portraits?

**Nothing sizes from them, draws them or measures them.** Evidence:

- **The repo.** Searched everything outside `node_modules`, `dist`, `dist-ios`, `ios/App`, `manus-output` and `.git`. The three filenames appear in docs only (the three lines in 9.2 and `docs/briefs/vehicle-livery-pass.md` lines 20 to 23). The one page that builds the path is `apps/game/public/admin/pre-drive.html` line 703, `'/assets/driving/vehicles/vehicle-' + v.sprite + '.png'`, for `henry`, `bea`, `spark`, `trikey` and `big-tilly`.
- **`apps/game/src`.** No `driving/vehicles` path anywhere, no `vehicle-` template that could build one, no iteration over texture keys. Every `vehicle-` filename is `vehicle-topdown-*`. `VEHICLE_SPRITE` (`fleet-art.ts` 19 to 23) maps all five vehicles to top-downs, `PtvDriveScene.preload` loads from `/assets/driving/topdown/`, and the only tests that read pixels (`fleet-art.test.ts` 1058, 1216, 1224) read `topdown/`. `check:sprites` scans `assets/animals` only.
- **Live, in real Chrome.** `?ptvDemo=1`, the real `PtvDriveScene`: 76 requests under `/assets/driving/`, 69 of them top-downs, **none for a portrait or the old-path Henry**; the Phaser texture cache holds none of `vehicle-henry/bea/spark/big-tilly/trikey`; none is on any display list. `pre-drive.html`: five portrait requests, each shown at 151x76 from a natural 1024x512, the whole canvas fitted into the 150x84 `object-fit: contain` box. That is a function of the canvas, and the canvas is 1024x512 on all three, before and after.
- **The top-downs did not move.** `git status` shows no top-down changed by this install (the two modified PNGs in the tree are another agent's). The picker and the loading screen draw them unchanged; the picker's measured top-down sizes at 820x620 are Trikey 46x107, Henry 107x249, Bea 110x269, Spark 122x356, Big Tilly 140x393.

**One thing the earlier statement leaves out, and it is why this is not quite "nothing reads them".** The full game fetches them. `plugins/asset-manifest.ts` lists every file under `public/assets`; `AssetLoader.parseEntry` files `assets/driving/vehicles/vehicle-*.png` under category `ui`, tier `essential`, key `vehicle-henry` and so on (confirmed by asking the loader through the page: all five come back `[ui/essential]`); and `LoadingScene` (245), `MainMenuScene` (69) and `GameScene` (379) call `startBackgroundLoad`, which `load.image`s the lot. So in the full game the five portraits are downloaded and decoded into the texture cache as 1024x512 textures, and then nothing ever names them. (`?ptvDemo=1` has no manifest, which is why the live check above shows them absent.) I did not boot the full game, which needs a sign-in. It is a load cost, not a read: nothing is derived from them, and the only thing this install moved is their weight, 87,091 bytes less. If they should not be fetched at all, the manifest scan already skips underscore-prefixed files, and that is the lever. I read it as not the stop condition you described (a portrait that something is sized from) and installed.

### 9.6 Gate, and where the pictures are

`pnpm -r typecheck` clean. `pnpm -r lint` 0 errors (apps/game 34 warnings, game-logic 11, unchanged). Tests **946 game-logic, 633 apps/game, 7 badges**, unchanged. `pnpm check:sprites` 557/600 with the 43 known failures allowed.

Screenshots, real Chrome, in `manus-output/install-2026-10-09/` (gitignored): `vans-fleet-portraits.png` (the five installed portraits, colour above and greyscale below, on one scale), `vans-predrive-row-820x620.png` and `vans-predrive-row-812x375.png` (the vehicle cards, the only place the portraits are drawn), `vans-predrive-820x620.png` and `vans-predrive-812x375.png` (the whole page), `vans-picker-820x620.png` and `vans-picker-812x375.png` (the car park forecourt with all five, at true scale), `vans-henry-820x620.png`, `vans-bea-820x620.png`, `vans-spark-820x620.png` (the loading bays). **The car park still draws Henry and Bea cream and Spark white**, because it draws top-downs and the top-downs are not repainted. The new liveries reach a child only when they are. That is the next commission. It still needs these portraits deployed first (Rule 1). The repaint commits `b829999` and `a08ab96`, which section 6 called unpushed, are now ancestors of `origin/claude/crate-loading`, so they are pushed on this branch; what the live URLs serve I did not check (`van-repaint-2026-10-09.md` section 4 has the `shasum` check).
