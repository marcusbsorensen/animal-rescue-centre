# Road-type transitions & single-track roads (backlog)

_2026-07-11. Marcus's design notes. NOT yet built — captured for a later slice._

## 1. Proper transitions between road types
Where the map route changes road class, the change should read as a real
**merge/split**, not the current flash-and-rebuild (`switchRoad` → `applyRoadSwitch`
masks a hard re-layout with a soft flash).

Key case: **Thanet Way (dual, 2+2 lanes) → country lane (single, 1+1)**. Want the
two lanes each way to visibly **narrow and merge to one**, with the real cues:
a "lanes merge" road marking / arrow, a give-way feel, oncoming reappearing across
a painted line instead of a grass reservation. And the reverse (single → dual) as
a lane **opening up**.

- Ties to: `road-config.ts` (lane counts, divider), `drive-render.ts` (lane
  geometry + markings), the road-profile follower (`roadProfile`, `profileRoadId`,
  `switchRoad`).
- Design: animate `roadGeometry` lane count over a short stretch rather than
  snapping; draw a merge zone (chevrons/arrow) during the change.

## 2. Single-track roads with passing places (lay-bys)
A NEW road type: **single-track** — literally ONE lane shared by BOTH directions
(not 1+1). Oncoming traffic comes **head-on in your lane**.

Passing works via **lay-bys / passing places** at intervals along the side
(alternating sides, UK-style):
- When you meet an oncoming vehicle, someone has to pull into a lay-by to let the
  other by.
- **Sometimes you must REVERSE back** to the last lay-by behind you (if the nearer
  passing place is behind you / by right-of-way).
- Right-of-way convention to teach: the vehicle **nearer a passing place** gives
  way — pulls in, or reverses to one. (Real single-track etiquette.)

Mechanics to design:
- **Lay-by placement** — spaced passing places on alternating sides (data-driven
  or procedural), drawn as a widened bit of road/verge.
- **Meeting logic** — detect an approaching oncoming vehicle; decide who gives way
  (nearest lay-by); the other waits.
- **Pull-in / reverse-to-lay-by** — reuse the existing steering + the reverse
  behaviour (reverse already stops rather than shunting traffic); add "reverse
  into the lay-by behind."
- **No-harm framing** (Lily): the meeting is a gentle puzzle — pull in / reverse
  and wave them past — never a crash; oncoming waits patiently.

- Ties to: `road-config.ts` (add `single-track`: playerLanes 1, oncomingLanes 0
  but shared — needs a new "shared" flag), the oncoming system, the overtake/
  reverse mechanics already built.

## Sequencing
Both are their own slices, after the current vehicle-view work. #2 (single-track +
lay-bys) is the bigger build (new road type + meeting/give-way logic + reversing to
lay-bys); #1 (merge transitions) is a polish pass on the existing road-switch.
