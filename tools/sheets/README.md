# Contact sheets

Four sheets that put the game's art next to itself, so a set can be judged
as a set rather than one render at a time.

```bash
python3 tools/sheets/build.py            # all four
python3 tools/sheets/build.py 2          # just the vehicles
python3 tools/sheets/build.py icons screens
```

They land in the repo root as `sheet-1-buildings-map.png` … `sheet-4-…png`.
`/*.png` is gitignored there, which is where `icon-sheet.png` already goes,
so a rebuild never dirties the tree. `ARC_SHEET_OUT=/some/dir` moves them.

Only dependency is Pillow (`python3 -c "import PIL"`). No headless browser
and no `rsvg-convert` — the icons are read as the PNGs `build-icons.mjs`
already wrote.

## What each sheet is for

| | Sheet | Answers |
|---|---|---|
| 1 | `s1_buildings_map.py` | Do the eleven destinations read as one set, and where is each on the map? |
| 2 | `s2_vehicles.py` | Which vehicles have which views, and which views are missing? |
| 3 | `s3_icons.py` | Does an icon that reads at 96px still work at 24, and what tints it in place? |
| 4 | `s4_screens_animals.py` | Which animals does each screen draw, in which pose? |

## What feeds which

Rebuild a sheet when its sources move.

**Sheet 1** — `apps/game/public/assets/driving/topdown/site-*.png` for the
art; `packages/game-logic/src/destinations.ts` for the table. The `DEST`
list at the top of the script is a **hand-transcribed copy** of
`DESTINATIONS` — id, label, kind, `unlockLevel`, `distance`, `fx/fy` and
the habitat's `suitableSpecies`. Change a destination and this list has to
follow; nothing checks it for you. Map captures come from
`apps/game/e2e/__ux__/tmp-map/` and `tmp-arrivals/`, which a throwaway spec
wrote — see "Re-capturing" below.

**Sheet 2** — `vehicle-topdown-*.png`. The script asks the filesystem which
views exist, so a newly rendered `-rear` or `-side` appears on the next run
with no edit, and a "not drawn" placeholder means the file is genuinely
absent. `FLEET`'s crate/fuel/level figures are transcribed from
`VEHICLE_DEFS` in `packages/game-logic/src/crate-stacking.ts`.

**Sheet 3** — `apps/game/public/assets/icons/*.png`, so run
`node tools/icons/build-icons.mjs` first if `icon-set.mjs` changed. Adding
an icon means adding it to a group in `GROUPS`; it will not appear on its
own. The nav hues in `sheet.py`'s `HUE` were **sampled off the shipped
rail**, not read from `NAV_COLOURS` — if `COLOURS.primary` and friends
change, re-sample rather than guessing.

**Sheet 4** — `apps/game/public/assets/animals/` and `assets/bg/`, plus the
`__ux__` captures. `REP` picks one variant per species to stand for it;
`ROWS` maps each screen to the pose it asks for. `sprite()` falls back the
way the game does, and a fallback is drawn in grey with its real key, so a
missing pose shows up as a fact rather than a silent substitution.

## Re-capturing the screens

`apps/game/e2e/__ux__/*-phone.png` are written by
`apps/game/e2e/ux-review.spec.ts` — 3.2 minutes for all fourteen at
874×402. The `tmp-map`, `tmp-arrivals` and `tmp-icons` folders are from
throwaway specs that have since been deleted; a single-scene spec runs in
about 7 seconds if one of those needs redoing. Reuse `waitForGameReady` /
`mintRealSession` / `installSession` from `e2e/helpers.ts` and the
scale-manager poll from `ux-review.spec.ts:resizeGameTo`.

**Do not launch the simulator to re-shoot a screen** — it starts the
scene's background music, and the captures are already geometrically
faithful.

## House style

`sheet.py` holds the palette, the fonts and the furniture. The sheets are
drawn in the game's own chrome — cream paper, ink type, a hairline and a
soft shadow — so that looking at a sheet and looking at the game are the
same act of looking. Three registers, matching the game's own rule:
`SFNSRounded` for titles and labels, `SFNS` for prose, `SFNSMono` for asset
keys and anything a person might type.

Art is always **contained, never stretched** (`fit`), because a sheet whose
whole job is judging proportion cannot distort it.

Each sheet ends with a findings panel. That is the point of the exercise —
a contact sheet is for the thing you only see when the set is side by side.
Rewrite the panel when the finding is fixed; a stale one is worse than none.
