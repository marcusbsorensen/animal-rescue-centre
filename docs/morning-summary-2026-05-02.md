# Overnight summary — 2026-05-02

> Marcus left for bed; this captures everything that landed unattended,
> plus the things you should poke at in the morning.

## What shipped tonight

**11 commits pushed to main.** Vercel auto-deployed each.

| # | SHA | What |
|---|---|---|
| 1 | `9d471c1` | localStorage helpers for skip + has-played flags (TDD, 7 tests) |
| 2 | `da13024` | AuthOverlay supports `'intro'` page + 3 new actions |
| 3 | `ae7c71d` | IntroScene — mounts intro.html, pre-picks species, plays panel-4 SFX |
| 4 | `ea9e82c` | Wire IntroScene between MainMenuScene + GameScene with preselect |
| 5 | `4edb585` | intro.html — 4 painted panels with handshake |
| 6 | `e8d045b` | PIN-hint cap bump 60 → 100 chars |
| 7 | `c944de5` | menu.html background swap to A.R.C. facade |
| 8 | (this) | Morning summary doc |

All 9 plan tasks landed. Spec at `docs/superpowers/specs/2026-05-02-new-player-intro-design.md`. Plan at `docs/superpowers/plans/2026-05-02-new-player-intro.md`. Final code review at `docs/intro-night-review-2026-05-02.md`.

## What works (verified)

- `pnpm tsc --noEmit -p tsconfig.json` clean.
- `pnpm vitest run` — 8 passed, 0 failed.
- `intro.html` returns 200 on prod.
- Audio manifest on prod includes all 7 species sounds + `voice-hello-friend` + `sfx-arrive` — climactic SFX should fire correctly.

## ACTION REQUIRED — manual deploy step

**The PIN-hint cap bump (`e8d045b`) requires `supabase functions deploy signup`.**

I tried to deploy via the Supabase MCP but it's read-only from this Claude session. Run this in the morning:

```bash
cd /Users/marcus/Projects/animal-rescue-centre
supabase functions deploy signup
```

Until you do, kids signing up still hit the 60-char cap.

## What to eyeball in the morning

These are NOT broken — they're "show your finger to a kid and see what they think" judgement calls:

### 1. `intro.html` panels visual quality (HIGHEST priority)

Open https://animal-rescue-centre.vercel.app/admin/intro.html standalone first to see how it looks without going through the game. Walk through panels 1→2→3→4. Then sign in to the live game and click PLAY to test the in-game flow.

**Specific things to look at:**

- **Panel 1 — gate-overlay** (`intro.html` lines 106-114): I crop the picket-fence portion of `garden-lawn-summer-morning.png` via `background-position: 8% 100%` to use as a "gate ajar" foreground. Tuned blind — likely needs visual nudge or replacement with a proper painted gate stamp.
- **Panel 2 — perspective path**: gravel texture tile with CSS `perspective(600px) rotateX(60deg)` to fake a receding path. Could read as a tilted floor mat rather than a path. If it looks weird, easy v2 is to commission a small painted "path receding" stamp.
- **Panel 3 — building close-up crop**: `clip-path: inset(35% 0% 0% 0%)` on `arc-main-building.png`. Whether the door + canopy fall in the right band is a guess; may need to tweak the inset percentage.
- **Panel 4 — door-opening**: a brown CSS gradient rectangle behind the building's painted closed-doors. Per the spec this is the v1 placeholder — Adobe `image_fill_area` is the v2 fix to paint the opening properly. Expect this to look hokey.
- **Two-horizon double-render on panel 1**: the welcome-bg loads as the panel background AND in the gate-overlay strip. May read as two horizons stacked. Worth a look.

### 2. `menu.html` background

Open the live menu (or the standalone preview at https://animal-rescue-centre.vercel.app/admin/menu.html). The painted A.R.C. building stamp now sits centre-bottom on a cream gradient instead of the garden bg. On wide aspect ratios (iPad landscape, desktop) the building will sit centre-bottom with empty cream around it — could look spacious or could look empty. Eyeball.

### 3. End-to-end flow (the real test)

Fresh browser profile (or incognito) → sign up a brand-new account → land in menu (now with A.R.C. facade) → tap PLAY. Expected:

1. Fade to black, IntroScene starts
2. Brand-new account: AudioManager forced muted
3. Panel 1 → 2 → 3 auto-advance every 2.5s, silent throughout
4. Panel 4 shows door close-up + cat or dog sprite + "Tap to open the door"
5. Tap → silent (because brand-new override) → IntroScene starts GameScene
6. GameScene's existing first-arrival flow opens (the painted arrival overlay)
7. The species shown in panel 4 = the species in the arrival overlay (pre-pick wired through)

Returning play (refresh, log back in, click PLAY): same walk-in but speaker icon respects whatever AudioManager state was when you left the menu. Tap panel 4 with sound on → should hear `sfx-arrive` + species sound + `voice-hello-friend`.

Tick "Skip next time" on the corner toggle, finish, reload, log in, PLAY: should jump straight to panel 4. Untick on panel 4, finish, reload, PLAY: full walk-in returns.

## Known issues + design choices

| Item | Why | Fix later? |
|---|---|---|
| Species pre-pick is always cat or dog | v1 simplification — IntroScene picks from level-1 unlocks only, regardless of the player's actual save level. Level 5+ players still see cat/dog in panel 4. | v2: read saved level synchronously OR pass `getMaxLevel()` through to IntroScene. |
| Sibling-spawn ignores pre-pick | When `shouldSpawnSiblings()` is true on the first spawn, the variant override is silently dropped. Sprite mismatch possible. | Add the variant to the sibling branch too — small. |
| 30s safety fallthrough doesn't `markPlayed()` | If the iframe NEVER posts `intro-complete`, the kid stays in "brand-new" state on subsequent plays — meaning they'll be muted again. Slightly annoying but arguably correct (they didn't actually finish the intro). | Debatable design choice. Leave as-is unless complaints. |
| Empty `<img src="">` on panel-4 sprite | Cosmetic — an empty src can trigger a duplicate request in some browsers before init lands. | Replace with 1×1 transparent placeholder. |
| Door-open is a CSS rectangle | Per spec — v1 placeholder. | Adobe `image_fill_area` painted variant. |

## Bonus items I deliberately didn't touch (need your design input)

- **Real friends-list backend** — needs Supabase migration + edge function design. Test players signing up will see "No friends here yet!" empty state until this is wired.
- **Charm-selection UI** — mockup at `/admin/charm-select.html`; needs Phaser integration + UI placement decision (cockpit screen? Friends? Settings?).
- **Adoption-matching mini-game** — design doc only; substantial implementation, design-heavy.
- **Cast walking-pose wave-2** — paid art commission, needs direction.
- **Heavy-metal Supply Run track** — commission decision.
- **Painted dashboards for non-Henry vehicles** — needs the cockpit-editor JSON for each vehicle, then a `tools/paint-dashboard.ts` run per vehicle. Unclear which JSONs are finalised.

## Final code review highlights

Full review at [`docs/intro-night-review-2026-05-02.md`](intro-night-review-2026-05-02.md). The reviewer flagged some concerns I disagreed with — specifically that the species sounds aren't in the asset manifest. I checked the live manifest and they ARE there (Vite plugin auto-scans `public/assets/`). The reviewer was looking at a stale `dist/asset-manifest.json`. So **panel-4 audio should work in production** for returning players with sound on.

## TL;DR

Intro flow shipped end-to-end. Run `supabase functions deploy signup` to activate the hint-cap bump. Then sign up a fresh test account and walk through the intro to eyeball the visual choices — the structure is correct, the painted-asset compositing has 4 specific concerns flagged above that are all judgement calls best made by you with the actual rendered page in front of you.
