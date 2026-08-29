# A.R.C. multi-platform — handover 2026-08-29

## Goal
Ship A.R.C. as an iPad/iPhone app plus a web fallback: one account, progress
synced across all three. Immediate job: commission the 21 remaining low-res
sprite poses from Manus (credits now topped up).

## State
**Done and verified**, merged to `main` (`9891849`, `f789d01`), 11 commits
ahead of `origin/main` — **not pushed**. Typecheck, lint, 983 tests, build all
green; working tree clean.
- Rewilding portrait collapse (iOS WebKit) — fixed, verified in Mobile Safari.
- Hedgehog set 128px → 512px — every hedgehog fell through to base sprites
  because no hedgehog variant art exists. Sources were already in the repo.
- Welcome buttons — fired all along, wrote into an orphaned Animal copy.
  Verified on device: two arrivals welcomed, "2 In care / 0 Waiting".
- Grooming, garden shake-off, doWalk/doGroom — same stale-capture class,
  silently reverting needs ticks. Fixed; **not exercised on device**.
- Signup server 400s now land on stage A. The bounce is screenshot-verified
  against the live endpoint; the error sticker itself is **inferred** (its 4 s
  auto-hide beat the capture).

**Outstanding backlog** (unchanged, none started): `paths.html` has no real
eligibility logic; `friends.html` never renders friends (`AuthOverlay` never
sends `friends`); nothing has run on a *physical* device; safe-area insets
untested (needs an iPhone sim); Depot/SupplyRun landscape overflow is a design
call; three UX findings parked. `e2e/visual.spec.ts` is red and was before —
`main-menu.png` baseline is 438 commits stale.

## Files
- `.claude/TRAPS.md` — accumulated gotchas. **Read this before anything else.**
- `docs/manus-sprite-rules.md` — briefing rules; Manus cannot read local files,
  so briefs must carry public URLs.
- `tools/sim-band.mjs` — simulator screenshot → tap coordinates.
- `tools/optimise-sprites.ts` — run on any new art drop; 512px cap, palette q90.
- `apps/game/src/scenes/GameScene.ts` — `welcomeArrivals()` docstring explains
  the stale-capture rule; `tickAllNeeds` (~475) is what causes it.

## Decisions made
- Resolve an `Animal` against `store.animals` by id at callback time. Never act
  on one captured in a closure — `tickNeeds` returns a new object every 2 s.
- Sprites ship at 512px, palette-quantised q90, via `tools/optimise-sprites.ts`.
- New sprite art is commissioned at 1024px and downsampled, not drawn at 512.
- Long-lived traps live in `.claude/TRAPS.md` so this note stays cheap to re-read.

## Next step
Draft the Manus brief for the 21 missing poses, for Marcus to approve before
spending credits. There is **no unshipped source** — `regen-v3-sprites` covers
exactly the poses already at 512, so these must be generated:
- `dog-dalmatian`: arriving, eating, growling, grumpy, scared, sheltered, sick, sleeping
- `dog-beagle`: eating, grumpy, sheltered, sleeping, walking
- `bunny-spotted`: arriving, eating, grumpy, scared, sheltered, sick
- `bunny-dutch`: eating, sleeping

**Reference images are the whole job — without them the characters drift.**
Rule 1 of `docs/manus-sprite-rules.md`: 2–3 publicly reachable URLs per
character, plus the safeguard line *"If you cannot fetch these URLs, STOP and
report back — do not generate sprites from description alone."*

The best anchors are the **already-shipped 512px poses in the same set**, which
are public, are the exact art the new poses must sit beside, and are what a
mismatch would be judged against. Use
`https://animal-rescue-centre.vercel.app/assets/animals/<file>.png`:
- `dog-dalmatian` — only `playing`, `walking` exist. Thin; add
  `/assets/reference/dog-dalmatian-reference.png` (256px sheet) as a third.
- `dog-beagle` — `arriving`, `growling`, `playing`, `scared`, `sick`.
- `bunny-spotted` — `growling`, `playing`, `sleeping`, `walking`.
- `bunny-dutch` — `arriving`, `growling`, `grumpy`, `playing`, `scared`,
  `sheltered`, `sick`, `walking`.

Do **not** cite the 2752px `*-reference.png` files under `manus-variants/` —
they are the best art but that folder is not served, so Manus cannot fetch them.
Only `apps/game/public/` is public.

Match the existing poses for framing as well as identity — alpha bounding boxes
must line up or sprites will jump between states (the hedgehog set matched to
within 0.4%, which is the bar).

## Traps
See `.claude/TRAPS.md`. The three that bite this task specifically:
- `tools/optimise-sprites.ts` used to degrade art on every re-run. Fixed, but a
  dry run should report "already quantised, 0 oversized" and no size change.
- Manus has no filesystem access, and only `apps/game/public/` is served. A
  brief citing a `manus-variants/` or `asset-drafts/` path silently gets no
  reference at all, and the character drifts. Public URLs only, 2–3 per
  character, with the "STOP if you cannot fetch these" safeguard line.
- A scripted whole-file rewrite ate eleven files on 27 Aug by dropping the
  buffer tail. Assert on length after any such edit.
