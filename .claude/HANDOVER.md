# A.R.C. — handover 2026-08-29 (evening)

Previous session finished the 512px sprites and a 913-line UI review, all of it
measured rather than seen. This session put the game on a device and looked at
it, then fixed what looking found, and collapsed the rail on phones.

## Goal
Ship A.R.C. as an iPad/iPhone app plus web fallback. Current arc: make the
interface fit an audience of 7–10 year olds, animals first.

## Decisions Marcus made this session
- **Verify before redesigning.** See it running before more layout work.
- **Rail: tab on phone, open on iPad.** Collapse below 1024px to a 56px
  pull-tab; keep the full 280px rail where there is room.
- **The per-pet panel is deferred.** No new `AnimalCard` yet. The existing
  `AnimalDetailsPopup` stays as it is.
- **1024px sprite masters archived outside the repo** — moved to
  `~/Dropbox/ARC-sprite-masters/regen-v3-2026-08-29/` (24 files, 40MB). No
  longer in `asset-drafts/`.

## State
**Uncommitted** — 8 modified files, on top of the 20 commits that are still
unpushed. Typecheck clean, lint 0 errors / 38 warnings (unchanged baseline),
1013 tests green (2 new).

### Seen running, on an iPad Air 11-inch (M4) simulator
Signed up, welcomed two animals, entered both rooms, opened the details popup,
resolved a conflict. The Welcome-button fix holds on a real device.

### Found by looking, and fixed
1. **The HUD never refreshed.** `renderView()` re-rendered the rail but not the
   HUD, and only 4 of 41 paths called `renderHUD()` by hand. `welcomeArrivals`
   was one of the misses, so the rail said "In care 2" while the HUD said
   "1 in care" — on the same screen, right after the one action the game asks
   for. `renderView()` now draws both.
2. **The shelter pill sat on the room title.** The HUD centred on the screen
   while the views centred their titles on the play area — a disagreement of
   half the rail's width. `renderHUD` now centres on the play area too, which
   leaves a gap in the middle that the title sits in at every viewport.
3. **The conflict popup ran off the bottom of a phone.** It laid out top-down
   from y=80 in one column: the title landed inside the HUD's second row and
   was printed over by the weather pills (seen on the iPad), and the fourth
   resolution card reached y=611 against a 375-tall screen (computed) — on a
   screen a child cannot leave until she picks one. Now play-area wide, cards
   in a row of four anchored to the bottom, animals in whatever band is left.
4. **The arrival card printed its story under the Welcome button.** Fixed 112px
   card, story pinned at y+30, button top at y+60, two lines of story reaching
   y+68. The card now measures its own text.

### Built
**The rail collapses to a tab below 1024px.** `RAIL_COLLAPSE_BREAKPOINT` splits
the fleet cleanly — the widest iPhone in landscape is 956, the narrowest iPad
1133. The tab is 56x150 at the left edge carrying the arrivals count; tapping it
slides the full rail in *over* the scene, so the play area does not reflow and
the animals do not jump. Closes via the ✕ in its header, a tap on the scene, or
navigating away. The dead bottom-drawer path is gone (112 lines) — it was
unreachable, documented as such, and this is the "or delete it" branch.

On a landscape phone this hands the animals back 224px, 27% of the width.

## Not verified
- **Nothing has run on a physical device.**
- **The phone case has not run on a simulator.** An iPhone 13 mini (812x375,
  the review's worst case) is created and booted as `ARC-13mini`
  (`843BA3D1-3343-475F-95B7-AD3DFAC452C6`) but needs Marcus to grant device
  access in the simulator panel. Everything phone-sized here was verified in
  real Chrome via Playwright at 812x375 instead — screenshots plus scene-graph
  measurement, not the simulator.
- Safe-area insets untested. `e2e/visual.spec.ts` still red on a stale baseline.
- `paths.html` still has no real eligibility logic; `friends.html` still never
  renders friends.

## Still open, seen but not fixed
- **Room animals are placed off the play area.** In the Cat Room the cat was
  clipped by the right edge of the screen and overlapped the nav band. Room
  anchors resolve into the play area, but something in `RoomView` is putting
  sprites outside it. Not chased.
- **The HUD still prints "N in care" next to an XP bar measuring
  `totalRescued`** — two different quantities in one pill, and the rail already
  says "In care N" beside it. `LeftRailView` has a comment claiming the badges
  moved out of the top strip; they did not. Probably the HUD label should go.
- The corridor arrival sprite is ~135pt tall on an 820pt screen. The review's
  target is 140pt minimum and largest-object-on-screen. Untouched — that is
  Phase 2, and it needs the `* 2` in `ui/sprites.ts:120` removing first.

## Files
- `.claude/TRAPS.md` — accumulated gotchas. **Read before anything else.**
- `docs/ux-review-2026-08-29.md` — the review, 913 lines. Sections "Making the
  animals the visual focus" and "Per-pet information panel" are the unstarted
  work; Phase 1 is now partly done.
- `apps/game/src/ui/layout.ts` — rail modes, breakpoint, play area. Pure.
- `apps/game/src/game-views/LeftRailView.ts` — tab, overlay, side rail.
- `apps/game/src/game-views/ConflictView.ts` — rewritten layout.

## Next step
Either (a) grant the `ARC-13mini` simulator access and re-walk the game on a
phone, which is the one thing this session could not do; or (b) start Phase 2 —
remove the `* 2` from `ui/sprites.ts`, re-scale the ~12 call sites, and set a
stated minimum animal size. `ConflictView` already halves its boxes to
compensate and has a comment saying so, so it is one of the call sites.
