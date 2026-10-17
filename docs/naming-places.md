# Naming places: allude, never name

> Marcus 2026-10-11. The convention was already in use across the map
> and its art and was written down nowhere. This is the record, so
> nobody "corrects" an allusive name back to the real one.

## The rule

The game alludes to real local places so that anyone who knows the area
recognises them, and never names them. The name a player sees is a near
miss: close enough that a local grins, far enough that the game implies
no real place, business or charity.

This covers everything a player sees or hears: labels, copy, ids that
reach the screen, text painted into map art. It does not cover tools
that read OpenStreetMap, or the briefs behind the art; those use the
real names because they are source material, and they do not ship.

## Where this came from

`docs/ptv-pet-transport-vehicle.md` (the Setting section) left naming
open: the real name in full, or a light fictionalisation, "Marcus to
pick". The map answered it by being drawn with the second, and this is
the rule that follows from it.

## Why

- **A local recognises it.** That is the point. The map is a stylised
  Birchington and the game is better for being somewhere.
- **The game implies no real place, business or charity.** A published
  children's app that names a registered charity or a trading business
  implies an endorsement or an association that does not exist.
- **The allusion has to survive.** A name that looks like a typo of the
  real one will be tidied by the next person unless this says it is
  deliberate. It is. Do not change `Wyx` to `Quex`.

## Worked examples

| Real | In the game | Where |
|---|---|---|
| Quex Park | **Wyx Park** | `destinations.ts` ("the Wyx Park greens"), the map SVG, the landmark prompts |
| the farm shop at Quex | **Wyx Farm Shop** | the map and `docs/map-seasonal-changes-2026-05-19.md` |
| Thanet Earth, the large commercial glasshouse complex outside Birchington | **Glasshouse Acres** | `docs/manus-prompts-birchie-map-landmarks-2026-05-19.md`: `glasshouse-acres-topdown.png`, SVG group `#glasshouse-acres` |
| Birchington | **Birchie** | everywhere: Birchie Station, `apps/game/src/driving/road-config.ts` |

**Jolly Jim's** is also on the map (`docs/map-seasonal-changes-2026-05-19.md`).
What it stands for is not recorded here; add it if you know.

Three ways to make a near miss, all in the table: change a letter (Quex
to Wyx), say what it is in other words (Thanet Earth to Glasshouse
Acres), or clip it (Birchington to Birchie).

### Placeholders awaiting Marcus

Two places on the south-west of the map stand for two real ones a few
miles apart, and are named to match. They are **placeholders until
Marcus confirms them**. Each is a named constant in
`packages/game-logic/src/destinations.ts` and is written nowhere else
(a test fails if it is), so a rename is one line.

| Stands for | In the game | Constant |
|---|---|---|
| a hedgehog rescue, run as a hospital: it takes garden injuries, rehabilitates over a long time, releases those that recover and keeps those that cannot be released | **Freckle's Little Hog Hospital** | `HOG_HOSPITAL_NAME` |
| a wildlife park with keepers, educators, school visits and a small reptile collection | **Wilderwood** | `WILDLIFE_PARK_NAME` |

The road the hospital stands on is **Bullstone Road** where a road is
needed at all. Both sit inland of the seafront.

What is true of how such places work in general may be used. Nothing
else about the real ones is to be written down: no staff, hours or
detail, and nothing a visitor could take for a claim about them.

## Naming a new place

1. Pick the near miss, not the name. If the real name would be
   recognised on sight, it is still too close to a name.
2. Write it once, as a named constant or a single data field, and let
   labels, copy and tests read that. Nothing else spells it.
3. Comment the real-world anchor in the game's own words, as
   `destinations.ts` does ("the Wyx Park greens"), so the next person
   sees the place without being given the real name.
4. Add a row above.

## Not followed, for Marcus to decide

`apps/game/src/driving/road-config.ts` (lines 32-33) uses **Thanet Way**
verbatim, as a road id and a label. It is a real road. A road name is
far less sensitive than a charity or a business, so it may well be
deliberate, but it is the one place a player sees where this convention
is not followed.
