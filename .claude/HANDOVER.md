# A.R.C. on TestFlight — handover 2026-10-11

## Goal
A.R.C. playable on Marcus's iPhone through TestFlight, with the Interfulgent
suite mark as the app icon and a real gameplay loop. Lily is not a tester yet.

## State
**Verified.** TestFlight build 2 uploaded 2026-10-11 06:15 (delivery UUID
`4a08a332`, 100.9 MB, `UPLOAD SUCCEEDED`). Five gates green at `91e3b53`:
game 910 tests, game-logic 1193, badges, typecheck, lint, `check:sprites`.
Branch `claude/crate-loading` pushed, 32 commits ahead of `main`, not merged.
The build-number lookup answers 2 against the live ASC API.

**Unverified.** Nobody has played build 2. The point of cutting it is the
collection loop — call in, drive out, choose a crate, bring her home — which
existed in code but had never run on a device. Garments on animals, the depot's
daily reset and the species exits are equally unplayed.

**Blocked.** Three edge functions (`load-game`, `send-gift`, `claim-gift`) are
undeployed. Gift badges need RLS policies that are keyed on `auth.uid()`.
Seasons cannot switch to the real date until the garden has autumn art — it
would draw snow in October.

## Files
- `docs/testflight-and-gap-plan-2026-10-10.md` — ASC ids, both audits, plan A–I.
- `docs/fleet-canon.md` — binds every view of every vehicle; §6 is the open list.
- `docs/naming-places.md` — allude to real places, never name them.
- `docs/world-coherence-rule-2026-10-11.md` — outdoor scenes track the real season.
- `docs/animal-exits.md` — seven routes; the caps are a teaching point, not a limit.
- `scripts/testflight.mjs` — one command to build and upload. Read its header.
- `.claude/notes/landmark-pilot-2026-10-11.md` — a three-asset Manus brief, unsent.
- `tools/*.py` — every image and map transform, recipe in each docstring.
- `.claude/handovers/2026-10-10-accumulated.md` — the old 615-line file. History, not state.

## Decisions made
- **The rear top-down is the camera reference**; the portrait is the master for
  livery *and* length. Realistic proportions lost to matching the portraits,
  because the portraits are chunky children's-book vans.
- **The animal space is tinted, the cab is clear** — privacy and heat for the
  animal, and the child still sees who is driving.
- **The painted April logo stays inside the game.** The suite mark is the icon only.
- **Seasons follow the real-world date**, once the art exists.
- **Tractors stay large**; reroute roads around them — their size is the seasonal cue.
- Spark's roof flash: the front comes down to the rear, never the rear up.

## Next step
Ask Marcus what build 2 played like and act on that. If he has nothing yet, the
next unblocked piece of work is Trikey's two top-downs — cobalt clay against a
lilac portrait, so a redraw rather than a recolour. Everything else needs either
his decision or Manus credit.

## Traps
- **Homebrew rsync 3.5.1 breaks `xcodebuild -exportArchive`** with "Copy failed".
  `scripts/testflight.mjs` runs Xcode with `/opt/homebrew/bin` off PATH. This
  will bite every other iOS project on this machine.
- **The ASC API key cannot mint certificates or create app records.** Signing is
  manual against the existing "ARC App Store" profile; app records need the web UI.
- **Never install the top-downs through `install-vehicles.py`** — its 0.88 taper
  would skew the roof motifs a second time. Re-run `tools/decorate-roof.py`.
- **`tools/osm-to-svg.py` is still live** and would regenerate the whole map,
  discarding the simplification and the hand-placed landmarks.
- **Manus is overdrawn** by roughly 7,500 credits. Read the real balance on the
  usage page before commissioning anything.
- **Give each agent its own files by path and its own scratchpad filenames.** One
  swept another's staged files into its commit; another overwrote a `compose.py`.
