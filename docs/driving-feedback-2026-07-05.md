# PTV driving — Slice 1 eyeball feedback (Marcus, 2026-07-05)

Marcus test-drove the Slice 1 travel view (`/?ptvDemo=1`) and gave detailed
notes. Captured here verbatim-in-spirit, then split into **this pass** (feel /
control / content polish, implementable now) and **the road-system slice**
(structural — variable carriageways, surfaces, oncoming traffic; its own build).

---

## Feedback → disposition

| # | Feedback | Disposition |
|---|---|---|
| 1 | **Speed:** all three steps too slow; make them faster on an *exponential* curve — slow a bit faster, medium somewhat faster, fast a lot faster. | **This pass.** New rates ~3.2 / 7.2 / 15. |
| 2 | **Lane lines** give the driving illusion but need to be **longer**. | **This pass.** |
| 3 | **Vehicles too small** relative to the lane they occupy. | **This pass.** Van + traffic sized to ~55–60% of lane width. |
| 4 | **Collision detection** not yet built (noted). | **Deferred** — comes with the obstacle/event pass; decorative traffic stays non-collidable until then. Reverse (below) is the negotiate-an-obstacle control it pairs with. |
| 5 | **Lane change too fast** — animals would fly around the back. Slow it, and **bank the van** toward the side it's moving to, resetting when settled. | **This pass.** Tween ~380 ms + a ±10° bank that returns to 0 on arrival. |
| 6 | **Palette fine**, but we need **scenery** to drive through. | **This pass** (first cut: roadside trees/hedges). Richer per-location scenery → road-system slice. |
| 7 | **Road types:** most Birchie roads are **1 lane each way**; the **Thanet Way** is a **dual carriageway, 2 lanes each way**. Need oncoming traffic + the right lane counts. | **Road-system slice.** Structural (oncoming lanes, central reservation, lane-count per route). |
| 8 | **Road surfaces:** tarmac (default), **gravel** (rural), **sandy/grass-tufty** (coastal / rewilding / stray collection / adoption drop-off). | **Road-system slice.** Surface tied to destination kind. |
| 9 | **Controls:** the horizontal **Slower/Faster** buttons imply left/right, but speed is up/down — confusing. Replace with a **vertical gear stick on the right**: select **1 – 2 – 3**, plus **Reverse** (press **R** or move the stick to R) for negotiating an obstacle/crash. | **This pass.** Vertical gearstick (R/1/2/3), click a notch or up/down arrows / R key. |
| 10 | **Vehicle variety** for Lily: very slow **tractors with hay bales** (summer/autumn), fast **emergency cars**, slow-ish **trucks** with various trailers/cargo, **pick-up trucks**, **motorbikes** zig-zagging between lanes. | **This pass** for a first catalogue (car / tractor / truck / pickup / motorbike / emergency, distinct sizes + relative speeds, motorbike weaves). Seasonal hay-bale variants + trailer variety → later. |

---

## The road-system slice (next focused visual build)

Structural work, best done when Marcus can re-test:

- **Carriageway config per route:** single-carriageway (1 lane each way, with
  **oncoming** traffic and a central line) and dual carriageway (Thanet Way —
  2 lanes each way, central reservation, same-direction only). The current
  3-same-direction-lane demo is a placeholder.
- **Oncoming traffic** in the opposing lane(s) — moves *up* the screen fast;
  never something to steer into.
- **Road surfaces** keyed to destination kind: tarmac (default), gravel
  (rural vet/training), sand-grass tufty (coastal rewilding, stray pickup,
  adoption drop-off). Surface affects tint/texture and possibly ride feel.
- **Collision + damage** with obstacles (feeds the existing shared vehicle-
  damage model), where reverse earns its keep.
- **Per-location scenery sets** (hedgerows inland, dunes/beach huts coastal,
  fields with the seasonal tractors, etc.).

---

## Round 2 (Lily loving it — 2026-07-05 later)

| Feedback | Disposition |
|---|---|
| Need a gear to bring the vehicle to a full stop — e.g. for a hedgehog crossing. | **Done, then refined.** First tried N + P (3/2/1/N/R/P); Marcus found moving *through* Reverse to reach Park odd, so **Neutral was dropped and Park moved between 1 and R** — stick is now **3 / 2 / 1 / P / R**. Dropping from first gear lands on Park directly. |
| **Emergency brake / handbrake** on **spacebar** — slams to a stop; jostles the animals in the cages (chaos), but better than an actual RTA. | **Done.** Spacebar now drops **straight into Park**, shakes the screen, judders the van, drops cargo comfort (−15), and pops a "Hold on!". Proper cage-bounce visuals land with the cargo/mirror slice; a screech SFX is a future audio commission (placeholder wobble for now). |
| *(side-fix)* Traffic used to freeze when we stopped. | **Fixed.** Traffic now has its own absolute speed, so cars keep flowing past while you wait at N/P for the hedgehog. |

---

## This pass — what's shipping now

Speed curve, longer lane lines, bigger vehicles, gentle banked lane change,
vertical gearstick with reverse, first-cut roadside scenery, and a
decorative-traffic **catalogue** (car / tractor / truck / pickup / motorbike /
emergency) with distinct sizes and relative speeds — motorbikes weave between
lanes, emergency cars overtake, tractors crawl. Logic (gears, traffic profiles)
is unit-tested; the visual feel needs a fresh eyeball at `/?ptvDemo=1`.
