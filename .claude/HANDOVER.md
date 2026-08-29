# A.R.C. UI — handover 2026-08-29

## Goal
Ship A.R.C. as an iPad/iPhone app plus web fallback. Current arc: make the
interface fit 7–10 year olds, animals first, working through
`docs/ux-review-2026-08-29.md`.

## State
Clean tree, level with `origin/main` (22 commits pushed, incl. the 20 that had
been sitting unpushed). Typecheck clean, lint 0 errors / 38 warnings, 1013 tests.

**Verified on an iPad Air 11-inch simulator:** signup → welcome → both rooms →
details popup → conflict. Welcome-button fix holds on a real device. HUD count
now agrees with the rail; the shelter pill no longer sits on the room title.

**Verified in real Chrome at 812×375 only** (scene-graph measurement plus
screenshots — nothing off-screen, no pairwise overlap): the rail tab, the
overlay rail, the conflict screen.

**Not verified:** no physical device, ever. The phone has never run on a
simulator. Safe-area insets untested. `e2e/visual.spec.ts` red on a stale
baseline. `paths.html` has no eligibility logic; `friends.html` renders nothing.

**Seen, not fixed:**
- Room animals land outside the play area — the Cat Room cat was clipped by the
  right screen edge and overlapped the nav band. Anchors resolve correctly, so
  it is something in `RoomView`.
- HUD prints "N in care" beside an XP bar measuring `totalRescued` — two
  quantities in one pill, and the rail already says it. The label should
  probably go.
- Corridor arrival sprite is ~135pt on an 820pt screen; review target is 140pt
  minimum and largest-object-on-screen.

## Files
- `.claude/TRAPS.md` — gotchas. **Read first.**
- `docs/ux-review-2026-08-29.md` — the review. "Making the animals the visual
  focus" and "Per-pet information panel" are unstarted; Phase 1 partly done.
- `apps/game/src/ui/layout.ts` — rail modes, breakpoint, play area. Pure, no Phaser.
- `apps/game/src/game-views/LeftRailView.ts` — tab / overlay / side rail.
- `apps/game/src/game-views/ConflictView.ts` — rewritten layout.
- `apps/game/src/ui/sprites.ts:120` — the `* 2` that Phase 2 removes.

## Decisions made
- **Rail: tab below 1024px, full rail above.** 1024 splits the fleet — widest
  iPhone landscape is 956, narrowest iPad 1133.
- **An open rail overlays; the play area never moves with it.** Otherwise the
  room reflows under the child's finger and the animals jump.
- **The bottom drawer is deleted**, not woken. The tab was the "or delete it"
  branch of its own comment.
- **Per-pet panel deferred.** `AnimalDetailsPopup` stays as-is; no `AnimalCard`.
- **1024px masters live outside the repo** — `~/Dropbox/ARC-sprite-masters/
  regen-v3-2026-08-29/` (24 files, 40MB). `asset-drafts/` is gitignored.
- **Chrome and views share one centring origin** (`getPlayArea`). Anything new
  in the top strip must too.

## Next step
Ask Marcus to grant `ARC-13mini` (`843BA3D1-3343-475F-95B7-AD3DFAC452C6`, booted,
812×375) access in the simulator panel, then walk the game on it — the one thing
this session could not do. If he declines, start Phase 2 instead: remove the
`* 2` from `apps/game/src/ui/sprites.ts:120` and re-scale the ~12 call sites
(`ConflictView` already halves its boxes and says so in a comment).

## Traps
- A new simulator needs a per-device access grant only Marcus can give. Budget
  for it or use an already-granted device.
- `simctl` screenshots come back in the portrait buffer even in landscape; taps
  use that same rotated frame. On a landscape iPad: `screenX = deviceH − v`,
  `screenY = u`.
- Getting a headless browser into `GameScene` needs all three: an `arc_session`
  in localStorage, `arc_skip_intro`/`arc_intro_played` (not `arc_intro_seen`),
  and stopping every active scene before `scene.start('GameScene')`.
- Playwright scripts must live inside `apps/game/` to resolve `@playwright/test`.
- `renderView()` now draws the rail **and** the HUD. Do not call `renderHUD()`
  beside it.
