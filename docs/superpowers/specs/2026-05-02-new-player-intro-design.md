# A.R.C. new-player intro — design

**Status:** Brainstormed + approved by Marcus 2026-05-02. Ready for
implementation plan.

The moment between completing signup and the first animal arrival
needs a beat. Currently, clicking PLAY drops the kid straight into
the painted arrival overlay (an animal at the door choosing) with
no orientation to where they are or whose place this is. The intro
fills that gap with a 4-panel first-person walk-in to the painted
A.R.C. building — silent, paced, and reusing every painted asset
the kid will see for the rest of the game.

## Why

- The kid never sees the rescue centre before being asked to
  welcome an animal into it. They have no sense of place.
- The current arrival overlay can read as a "design mockup" because
  there's no narrative framing around it.
- The Tier 1 painted A.R.C. building stamp + ground textures + tree
  stamps already exist. The intro is the first thing in the live
  game that uses them at scale.
- A daily "I'm arriving" beat reinforces ownership ("this is MY
  place") without nagging the kid.

## What — at a glance

- **4 painted panels**, first-person POV, crossfade between.
- **Panels 1–3 auto-advance** at ~2.5s each (tap-to-skip-ahead allowed).
- **Panel 4 waits for tap** — it's the door-open + animal-revealed beat.
- **Climactic SFX only on panel 4** (silence runway across 1–3 lets
  the kid mute before any sound fires).
- **Persistent skip-future toggle** — kid can opt to jump straight to
  panel 4 on every future game-start. Door-tap is always preserved.
- **Default-muted** for accounts that have never played before.
- Plays on **every game-start** (panel 4 minimum).

## Trigger flow

```
MainMenuScene → click PLAY → IntroScene (renders intro.html iframe)
  ├─ if skipIntro=true: render panel 4 only, wait for tap
  └─ otherwise:        panels 1-3 auto-advance, then panel 4 waits for tap
on panel-4 tap →
  postMessage 'intro-complete' →
  IntroScene.scene.start('GameScene', { preSelectedSpecies, preSelectedVariant })
GameScene → no animals → spawnNewAnimal(preSelected*) → openArrivalOverlay (existing)
```

## The 4 panels

Every panel is **first-person POV**. Crossfades (~400ms) between
panels. Subtle CSS zoom-drift on each panel gives static composites
a sense of camera-pushes-in motion.

| # | Beat | Composition | Hold | Audio |
|---|---|---|---|---|
| 1 | Gate | Painted garden gate ajar in the foreground; the painted A.R.C. building visible in the distance behind. Painted Birchie sky background. | 2.5s auto | Silent |
| 2 | Path | Same scene, now halfway up the garden path. Path receding under our feet via CSS perspective. Building larger (~50% of canvas height). | 2.5s auto | Silent |
| 3 | Door close-up | Zoomed crop of the building — entrance canopy with "ANIMAL RESCUE CENTRE" lettering, paw-print emblem above, wooden double doors closed. | 2.5s auto | Silent |
| 4 | Door open + animal | Same crop as panel 3 but doors open + the painted arriving sprite for the species sits on the porch looking up at us. | Wait for tap | On tap: `sfx-arrive.mp3` + species-specific sound (`cat-meow` / `dog-bark` / etc.) + `voice-hello-friend.ogg` |

After panel 4 → crossfade into the existing `arrival.html?embed=1`
first-arrival mode (name the pet, recovery anchor, photo wall —
already built, unchanged).

## Asset reuse — consistency map

Every visible thing in the intro reappears later in the game in
the same painted form. The Birchie world feels like one place
from minute one.

| Slot | Asset | Where else in-game |
|---|---|---|
| Sky / atmosphere (panels 1–2 background) | `/assets/bg/garden-lawn-summer-morning.png` | Welcome / login / signup screens |
| A.R.C. building (all 4 panels) | `arc-main-building.png` (Tier 1) | World-map A.R.C. pin + A.R.C.-site detail view in `map.html` |
| Garden grass underfoot (panels 1–2) | `texture-grass.png` (Tier 1, seamless) | A.R.C.-site detail view in `map.html` |
| Garden path (panel 2) | `texture-gravel.png` (Tier 1, seamless) | A.R.C. parking forecourt + central path in `map.html` |
| Roadside trees (panels 1–2 framing) | `arc-tree-oak.png`, `arc-tree-ash.png`, `arc-tree-horse-chestnut.png` (Tier 1) | Hedgehog/squirrel zone in A.R.C.-site detail |
| First-arrival animal sprite (panel 4) | `/assets/animals/{species}-{variant}-arriving.png` | The actual sprite the existing arrival overlay would already show |
| Climactic audio (panel 4) | `sfx-arrive.mp3` + `{species}-{sound}.ogg` + `voice-hello-friend.ogg` | All from existing audio pack |
| Speaker icon (corner) | Same speaker emoji as menu | Visual continuity with menu / welcome |

### Two compositing workarounds (no new commissions)

1. **Garden gate prop (panels 1–2 foreground)** — no standalone
   painted gate stamp. **Crop the white picket fence + gate from
   the bottom-left of `garden-lawn-summer-morning.png`** and
   CSS-position it as the foreground frame. Painted by the same
   hand as the welcome scene, max consistency.

2. **"Door-open" variant of the building (panel 4)** — no painted
   doors-open version. **Position the species's `*-arriving.png`
   sprite over the closed-door area with a small CSS dark-rectangle
   behind them** suggesting an open doorway. If that doesn't land
   visually, use Adobe MCP `image_fill_area` later to paint the
   opening properly (~$0 / Adobe is included in the plan).

## Audio behaviour

Three rules, in priority order:

1. **Background menu music keeps playing** through the intro
   uninterrupted — existing `music-menu` behaviour, no transition.
   This is whatever the kid had on the welcome / menu screens
   immediately before tapping PLAY.

2. **Panel 4 climactic SFX (`sfx-arrive` + species sound +
   `voice-hello-friend`) only fire if** `AudioManager.isMusicOn()`
   returns `true` AT THE MOMENT panel 4 is tapped. This means:
   - If the kid muted on the welcome / menu screen, panel 4 is
     silent.
   - If the kid taps the intro's speaker icon to mute mid-walk,
     panel 4 is silent.
   - If the kid taps the intro's speaker icon to UN-mute mid-walk,
     panel 4 plays normally.

3. **Brand-new-account silent override**: on the very first play
   of an account (detected by absence of `localStorage['arc_intro_played']`),
   the intro forces `AudioManager` to muted state on mount,
   regardless of what the welcome / menu screens had it set to.
   After the kid taps the intro speaker icon (or the door-open on
   panel 4 — whichever comes first), `arc_intro_played` is set,
   and from then on rule #2 applies — the intro inherits the kid's
   actual menu state. This protects new kids from a surprise
   sound burst the first time they ever play.

The 7.5s silent runway across panels 1–3 gives the kid time to
mute if rule #2 needs to be acted on. The visible 🔊/🔇 toggle in
the top-right corner of the intro is the same icon style as the
menu speaker.

## Persistent corner controls (during walk-in)

Top-right corner, two small icons:

1. **🔊/🔇** — speaker (toggles mid-stream, syncs back to menu
   state via `toggle-music` postMessage)
2. **⏩** — skip-future toggle with a checkbox-style state showing
   "ON" or "OFF". When ON, future game-starts jump to panel 4.
   The toggle can be unticked any time mid-intro to restore the
   full walk.

Both toggles are visible from panel 1 onwards. They don't block the
auto-advance.

## Persistence: skip + mute flags

| Setting | v1 storage | v2 (later) |
|---|---|---|
| Skip-intro toggle | `localStorage['arc_skip_intro']` (per device) | `users.skip_intro_animation BOOLEAN` in Supabase (per account, follows across devices) |
| Mute toggle | existing `AudioManager.isMusicOn()` (already syncs across screens via the speaker bubble) | unchanged |

**v1 ships with localStorage** — fast to build, no migration needed,
adequate for test players who play on one device. **v2 migrates to
Supabase** if and when the cross-device need is real.

## Implementation architecture

### New files

- `apps/game/public/admin/intro.html` — single HTML page with all 4
  panels, the speaker + skip toggles in the corner, the post-message
  bridge to the host scene. Iframe-overlay pattern (matches
  `welcome.html`, `signup.html`, `arrival.html`).
- `apps/game/src/scenes/IntroScene.ts` — small scene that mounts
  the iframe and listens for `intro-complete` to advance to
  `GameScene`.

### Modified files

- `apps/game/src/auth-overlay/AuthOverlay.ts` — extend `AuthPage`
  union with `'intro'` and add `intro: '/admin/intro.html?embed=1'`
  to `PAGE_URLS`. Forward the new postMessage types
  (`intro-complete`, `set-skip-intro`).
- `apps/game/src/scenes/MainMenuScene.ts` — change `startGame()` to
  start `IntroScene` instead of `GameScene` / `LoadingScene`.
  IntroScene takes responsibility for the asset-loading gate that
  currently lives in `MainMenuScene.startGame()`.
- `apps/game/src/scenes/GameScene.ts` — accept optional init params
  `{ preSelectedSpecies, preSelectedVariant }` from IntroScene; if
  present, use them in the first call to `spawnNewAnimal()` instead
  of re-rolling.
- `apps/game/src/main.ts` — register `IntroScene` in the Phaser
  scene list.

### Pre-picking the first animal

Currently `GameScene.spawnNewAnimal()` picks the species when no
animals exist. We move this pick **earlier** — into `IntroScene` —
so the species is known before panel 4 renders its sprite. The
picked species + variant pass to `GameScene` via init params; the
existing first-spawn logic uses them if provided.

### postMessage protocol

Parent → iframe (on load):
```ts
{ source: 'arc-auth-host', type: 'init', payload: {
    skipIntro: boolean,           // localStorage['arc_skip_intro']
    speciesForArrival: string,    // 'cat' / 'dog' / etc.
    arrivingSpriteSrc: string,    // full path to /assets/animals/{species}-{variant}-arriving.png
    musicOn: boolean,             // AudioManager.isMusicOn()
} }
```

Iframe → parent:
```ts
{ source: 'arc-auth', type: 'intro-complete' }    // panel 4 tapped
{ source: 'arc-auth', type: 'toggle-music' }       // speaker tapped (existing pattern)
{ source: 'arc-auth', type: 'set-skip-intro', payload: { value: boolean } }   // checkbox toggled
```

## Edge cases

- **Returning player with animals already in their save** — still
  runs the intro by default unless skip-flag is on. If skip-flag is
  on, renders panel 4 only, requiring a tap. The door-tap is the
  daily arriving gesture, preserved.
- **Speaker off at panel 4** — nothing audible. The visual reveal
  still lands.
- **Tap during auto-advance** — panels 1–3 are tappable on the
  panel body to advance early. The corner controls (speaker, skip)
  use `event.stopPropagation()` so tapping them does NOT also
  advance the panel.
- **Browser back / refresh mid-intro** — refresh restarts the intro
  from panel 1 (no in-flight state to preserve).
- **Iframe fails to load** — IntroScene has a 5s safety timeout; if
  no intro-complete arrives, falls through to GameScene as if PLAY
  was tapped pre-intro. Ensures a kid never gets stuck on a black
  screen.

## What we do NOT build in v1 (deferred)

These become small upgrades if the design lands:

- Door-creak / footsteps / knock SFX (no commission)
- Bespoke painted panels for 1–3 (composited from existing assets)
- Cross-device skip-flag (localStorage only — Supabase later)
- A "play the intro again" link in the menu (only the in-intro
  skip toggle exists)
- Adobe `image_fill_area` painted door-open variant (only if the
  CSS workaround in panel 4 doesn't land)

## Success criteria

- A new player tapping PLAY for the first time sees the full
  walk-in with sound off by default, lands on the arrival overlay
  with the same painted A.R.C. they just walked into.
- A returning player with skip-on taps PLAY, sees panel 4 close-up
  of the door, taps to open, lands on the arrival overlay (or wherever
  GameScene takes them based on save state).
- The painted A.R.C. building, gate, grass, path, trees in the intro
  visibly match the same assets in the world map and the A.R.C.
  detail view.
- All 4 panels render in <300ms on the slowest device the game
  supports (iPad gen 6).
- localStorage skip-flag survives a page refresh and a browser
  restart.
- The mute / unmute on the intro speaker icon updates the same
  `AudioManager` state that the menu speaker uses (no divergent
  state).

## Open questions to revisit at implementation time

- Exact crop coordinates for the picket-fence-from-welcome-bg
  composite — needs a quick visual tune.
- Exact CSS zoom-drift values per panel (probably 1.0 → 1.05 over
  2.5s, easing in-out).
- Whether the door-open CSS workaround in panel 4 lands — only
  testable once we render it.

## References

- `apps/game/src/auth-overlay/AuthOverlay.ts` — iframe-overlay
  pattern to extend
- `apps/game/src/scenes/SignupScene.ts` — example of a scene that
  mounts an auth iframe and routes to a successor scene
- `apps/game/src/scenes/GameScene.ts` lines 230–340 — current
  first-arrival flow that the intro precedes
- `apps/game/public/admin/welcome.html` — reference for the painted
  garden bg + speaker bubble + iframe `?embed=1` handling
- `apps/game/public/admin/arrival.html` — first-arrival mode
  (unchanged downstream of the intro)
- `apps/game/public/admin/scene-assets/reference/arc-site-tier1-2026-04-29/`
  — Tier 1 painted assets the intro reuses
- `docs/manus-sprite-rules.md` Rule 7 — front-elevation-stamp
  convention (the building is rendered as a front-elevation in all 4
  panels)
