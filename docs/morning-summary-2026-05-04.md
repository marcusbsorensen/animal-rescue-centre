# Morning summary — 2026-05-04

> Marcus went to bed; this is what shipped overnight.

## Live + working

### A.R.C. site map (`map.html`)
- **Glasshouse Acres** added (commit `9fd7428`) — fake stand-in for Thanet Earth, sitting in the open farmland south of the A28 west of Wyx Park. 6 stylised glass-blue greenhouse roof strips with ridge lines + service-road loading bay + soft cream boundary fence + Fredoka-700 painted label. Future supply-run destination.
- All previous map polish (gardens, trees, parking, building, paths, fine gravel) intact and working.
- **Tunnel-mouth entry-point** added to the bottom of the central path (commit `668901c`) — small inline-SVG paw-print hatch at stage (63.67%, 87%). Tap → opens the tunnel mini-game overlay. Manus can paint a proper hatch later (~50 credits if you want to commission).

### Town map (`birchie-roads.svg`)
- **5 painted town-map decorations** (commit `7c18d57`): 3 cargo ships (large + small + ferry) drift east-to-west across the Thames Estuary at varying speeds, 1 tractor east-to-west + 1 with a trailer west-to-east across the southern fields. Slow-moving (180-340s loops with offsets) so kids notice the motion without distraction. Replaced the emoji placeholders.
- Glasshouse Acres also visible.

### New intro sequence (`intro.html`)
- **4-panel zoom-in into the live town map** (commit `15129d7`) — wide town view → 2× seafront → 3.5× plot visible → 5× building close-up + tap-to-enter prompt.
- CSS `transform: scale(N)` with 1500ms ease transitions. `transform-origin` computed dynamically to glue every push toward the A.R.C. plot at SVG (326, 397), accounting for `preserveAspectRatio="meet"` letterbox.
- Painted speech-bubble captions (cream-wash + honey-amber + Kalam cursive, painted "tail").
- Same iframe handshake as before — IntroScene wiring needed no changes.

### Tunnel mini-game Phase 1 (live + playable)
- **Logic module** (`packages/game-logic/src/tunnel.ts`, 372 lines): TDD'd with 24 vitest tests. Mirrors `crate-stacking.ts` style — pure functions, no Phaser deps.
- **Iframe page** (`apps/game/public/admin/tunnel.html`, 619 lines): painted earth-tunnel grid with rotatable tiles, "Send the fox!" / Reset / "Make the tunnels" buttons. Background music wired (`tunnel-minigame-loop.mp3`).
- **Scene + overlay wiring**: `TunnelScene` thin Phaser scene, `GameScene.openTunnelOverlay()` the real workhorse following the existing iframe-overlay pattern (rewilding/adoption/vet). Map's tunnel-mouth click routes here.
- **Tier 1 only** (fox tunnel) playable end-to-end. Tiers 2-5 plumbed for but not yet generating puzzles.
- Tests: 758 passed / 0 failed. Typecheck + build clean.
- Commits: `d730a9c` (logic) + `668901c` (UI + scene + map entry).

### Audio
- `tunnel-minigame-loop.mp3` (4.1MB) + `.wav` (2.4MB) at `apps/game/public/assets/audio/music/`. Joyfully-mechanical-gnome-tinkering loop from Manus (116 credits). Loops on the tunnel page.

## Things to check / iterate this morning

### Tunnel mini-game (highest priority — first new mechanic in a while)
1. **Play it.** Open `/admin/tunnel.html?embed=0` in a browser, see if it feels right. The pathfinding has a known limitation for T-junctions and crosses (works perfectly for tier-1 since those tiles aren't on the active path). When you start tier 2, that needs revisiting.
2. **Override reward** is hardcoded `+10 coins`. Design doc said "TBD". Pick what feels right and tweak in `GameScene.openTunnelOverlay()`.
3. **Pre-fox-unlock behaviour**: completing a tunnel before the fox arrives in the shelter shows a "fox arrives soon!" toast and applies no state mutation (gentle no-op). Confirm that's the right vibe vs locking the entire tunnel feature behind the fox unlock.
4. **Logic duplication** — the iframe has a JS mirror of `tunnel.ts` for client-side win-checking. The host re-runs the canonical TS solver before granting rewards (so authoritative), but if either copy diverges it'll feel off. Flagged with a comment in the iframe; consider unifying via a shared module or just being disciplined about edits.
5. **Painted tunnel-mouth hatch** — currently inline SVG paw-print on the map. Manus can paint a proper one (~50 credits) when convenient.

### New intro sequence
1. **Try it cold** — sign out, sign back in, watch the 4-panel zoom land. The previous intro was the painted-walk-in-with-animals; this is purely the zoom. Confirm it feels right or if you want elements from the older intro mixed back in (e.g., animal sprites in panel 3).
2. **Skip-intro toggle** still respected — once Lily ticks "don't show again" she goes straight to GameScene next time.

### Glasshouse Acres
1. Look at it in the town map. The label position + greenhouse cluster size might need tweaking. Easy to nudge in the SVG.
2. Future: extend OSM bounds west to include the REAL Thanet Earth (lat 51.345, lon 1.21+). Would re-fetch + re-render. Not urgent.

### Tunnel mini-game tile inventory + level pack
- Sub-agent already wrote `docs/garden-tunnel-tile-inventory-2026-05-03.md` with the spec. Tier 1 implementation matches the spec. Tiers 2-5 stress-tested in the doc but NOT YET implemented in code. Pick from the doc when you're ready to add the next tier.

## Open / parked items

- **Heart-paw** building update — Marcus doing in Photoshop. Heart-paw asset is at `apps/game/public/assets/logo/arc-logo-icon.png`. When you have the new building PNG, drop in at `apps/game/public/admin/scene-assets/reference/arc-site-tier1-2026-04-29/arc-main-building.png` and bump the `?v=2` cache buster in `map.html` to `?v=3`.
- **Real Thanet Earth (OSM extension)** — see Glasshouse Acres above.
- **Tunnel mini-game music + SFX** — music is wired. Per-tile SFX (rotation click, gate latch, animal pop chime, etc.) brief is in `docs/garden-tunnel-minigame-2026-05-03.md` but NOT yet commissioned. Worth doing alongside tier-2.

## Costs spent overnight (Manus)

- 12 seasonal trees: 311 credits (delivered yesterday)
- 8 garden backgrounds: 257 credits
- 5 town-map sprites: 171 credits
- Tunnel music: 116 credits
- Garden tile placeholders (sunk): 163 credits
- **Total Manus today: ~1,018 credits**

## Commit log (all pushed to origin/main)

```
9fd7428 feat(town-map): Glasshouse Acres — fake stand-in for Thanet Earth
7c18d57 feat(map): painted ship + tractor sprites + tunnel-game music asset
eda7d65 feat(map): town-map animated decorations (emoji placeholders) + ARC site nudges
976717e feat(map): 8 painted seasonal garden backgrounds + wired seasonal swap
... (earlier today's work)
15129d7 feat(intro): town-map zoom-in intro sequence (4 panels)
ac2a9b3 docs(tunnel): tile inventory + level stress-test spec
015146a docs(tunnel): audio brief
a95b3a8 docs(tunnel): lock all 6 design decisions
ea11519 docs(tunnel): peg unlocks to habitat arrivals
8c12569 docs: garden tunnel mini-game design
d730a9c feat(tunnel): logic module + tier-1 puzzle generator (TDD)
668901c feat(tunnel): tier-1 mini-game UI + scene wiring + map entry-point
```

That's the lot. Coffee, then pick whichever of the above feels most fun.
