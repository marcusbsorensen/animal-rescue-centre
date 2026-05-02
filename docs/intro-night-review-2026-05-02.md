# Intro night review — 2026-05-02

## Summary

**Minor fixes needed — not a blocker.** The intro mounts, the iframe handshake works, types compile, all 8 vitest tests pass, and the safety net is wired. One real spec gap (panel-4 species sound + greeting voice are silent because those audio keys aren't in the preload manifest), one minor singleton side-effect, plus the visual concerns the implementer already flagged.

## Spec coverage

**Implemented**
- 4 panels with crossfade + auto-advance (1-3 at 2.5s) and tap-wait on panel 4 — `intro.html` lines 278-294
- Tap-during-auto-advance to skip ahead — `intro.html` lines 297-312
- Skip-future toggle persisted in `localStorage` (`arc_skip_intro`) — `intro-state.ts`, 7 tests passing
- Brand-new-account silent override — `IntroScene.create()` lines 35-38, plus `markPlayed()` on `intro-complete`
- 30s safety timeout falling through to GameScene — `IntroScene.ts` lines 85-90 (gated on `scene.isActive` so post-completion fire is a no-op)
- Pre-pick species → panel 4 sprite + GameScene init params; `spawnNewAnimal` honours then clears the override — `IntroScene.ts` lines 100-107, `GameScene.ts` lines 326-345
- AuthOverlay extended with `intro` page + 3 new actions, message forwarding wired — verified in diff
- Speaker icon + skip-row in corner with `stopPropagation` — `intro.html` lines 315-324
- `intro-climactic-sfx` postMessage on panel 4 tap, with 100ms delay before `intro-complete`

**Gaps**
- **Climactic audio is mostly silent in production** — only `sfx-arrive` (mapped to `playSfx('animal_arrive')`) is in the build asset manifest at `apps/game/dist/asset-manifest.json`. The species sounds (`cat-meow`, `dog-bark`, `fox-yip`, `bunny-squeak`, `parrot-squawk`, `bat-chitter`, `snake-hiss`) and `voice-hello-friend` exist as files in `public/assets/audio/` and `audio/voice/` but are NOT registered in the loader manifest, so `cache.audio.exists()` returns false at panel-4 tap and they're skipped silently. The doorbell will ring; the meow / hello-friend will not. Spec calls for all three.
- **CSS zoom-drift on panels 1+2 only** — spec also says "subtle zoom-drift on each panel". Panels 3 + 4 have no `animation: zoom-drift` rule. Probably fine.

## Bugs / type errors / test failures

- TypeScript: `cd apps/game && npx tsc --noEmit -p tsconfig.json` → **clean, no errors**.
- Vitest: `pnpm vitest run` → **8 passed (2 files)** including all 7 intro-state tests.
- No broken imports, wrong event names, or missing handlers spotted.

Minor:
- `IntroScene.ts` line 9 imports `spawnAnimal` from `@arc/game-logic` and uses it in `preSelectFirstAnimal()` to derive the `variant` for the sprite path — but the result is then thrown away. Pure waste of a few CPU cycles per intro mount; not a bug. Plan called this out as accepted.
- `intro.html` line 244 sprite `<img src="">` — empty `src` triggers a "GET /admin/intro.html" double-request in some browsers when the page first loads (before the init message lands). Cosmetic; not user-visible. Could be a 1×1 transparent gif placeholder.

## Concerns to eyeball in the morning

1. **Visual concerns flagged by implementer (all legitimate)** —
   - **Gate-overlay crop** (`intro.html` lines 106-114): the picket fence is hand-cropped from `garden-lawn-summer-morning.png` via `background-position: 8% 100%` and `background-size: 200% auto`. Tuning blind without seeing the source bg — likely needs visual nudge.
   - **Path perspective on panel 2** (lines 117-128): `transform: perspective(600px) rotateX(60deg)` + clip-path trapezoid is a CSS hack to fake a vanishing path. Could read as a tilted floor mat rather than a path receding to the door.
   - **Building close-up clip-path** (line 83): `clip-path: inset(35% 0% 0% 0%)` crops the painted building to roughly its lower half. Will only land if the door + canopy fall in that band of the source PNG — depends on the painting's composition.
   - **Door-opening rectangle** (lines 131-140): brown gradient rect at `bottom: 14%; width: 12%; height: 30%` simulating an open door. Per spec, this is the "v1 workaround" — Adobe `image_fill_area` is the v2 fix. Expect this to look hokey behind the painted closed-door facade.

2. **Species sound + greeting voice are silent** (see Spec gaps). Add the 7 species `.ogg` keys + `voice-hello-friend` to whatever script generates `dist/asset-manifest.json` (or load them ad-hoc in IntroScene's preload).

3. **AudioManager singleton mutation in `IntroScene.create()`** — flips music OFF for brand-new accounts before mounting. If the player ever backs out of the intro through a path that doesn't tap panel 4 (refresh, browser back, the 30s safety fall-through), `markPlayed()` is also skipped, so on next PLAY the music is still ON for the welcome/menu but immediately flipped OFF again on intro mount. Minor but the override could "stick" silently across sessions if a kid never makes it past the iframe. Consider calling `markPlayed()` in the 30s safety fallthrough too.

4. **Welcome-bg as gate-overlay double-renders the same image at different crops** — both the panel-1 background AND the gate-overlay layer load `garden-lawn-summer-morning.png`. Browser cache makes this free, but the visual result will have two "horizons" on screen (full bg behind + cropped strip in front). Could read jarring.

5. **`menu.html` bg swap** — building PNG is `contain` over a cream gradient. On wide aspect ratios the building will sit centre-bottom with a lot of empty cream around it. Worth eyeballing on iPad-landscape.

6. **Sibling-spawn path in `spawnNewAnimal`** — when `shouldSpawnSiblings()` is true on the very first spawn, the pre-picked variant is silently ignored (line 343 only consumes `preSelectedVariant` in the non-sibling branch). Panel 4 sprite would then mismatch the actual sibling-pair the kid sees. Edge case (sibling chance is configurable + low) but worth flagging.

## Suggested follow-ups

- Register the 8 missing audio keys in the asset manifest so panel-4 audio actually fires.
- Replace empty-string `<img src="">` with a 1×1 transparent placeholder.
- Consider `markPlayed()` in the 30s safety fallthrough so the brand-new override doesn't permanently mute a player who never finishes the intro.
- Add `variant: this.preSelectedVariant ?? undefined` into the sibling branch of `spawnNewAnimal` for symmetry, and clear it there too.
- v2: Adobe `image_fill_area` painted door-open variant per the spec's deferred list.
- The plan's commit message says `pnpm tsc --noEmit -p tsconfig.json` works — there's no `tsc` script in any package.json. Either add one (`"tsc": "tsc --noEmit"`) or update the plan template.
- `feat(signup): bump PIN-hint cap` requires a manual `supabase functions deploy signup` — flagged in the commit body but easy to forget.
