# One world: outdoor scenes obey the season, the weather and the time of day

> Status: **Standing rule**, 2026-10-11. Stated by Marcus; written down
> here because it existed nowhere in the repo. It binds every outdoor
> scene, present and future. The season clock was decided the same day
> (section 7). Line numbers in sections 7 to 9 are at commit `21595fe`.
>
> `docs/map-seasonal-changes-2026-05-19.md` is one instance of this rule
> (the map). It is not duplicated here; see section 10.

## 1. The rule

Marcus, 2026-10-11:

> The map and every screen in the game respond seasonally and to the
> weather. Tractors on the fields at certain points of the year, snow
> piles at others. Every outdoor scene must obey this: the world is
> coherent, and synchronised.

The tractors and the snow piles are Marcus's own examples, and they are
the standard to hold other cases to: a field has a tractor on it in some
months and snow piled at its edge in others, and a child who has seen
both knows what month the world is in.

As a constraint:

**No outdoor scene may show anything that contradicts the world's
current season, weather or time of day. Every outdoor scene shows the
same world.**

Two clauses make that checkable.

- **Silence is allowed; contradiction is not.** A scene may carry no
  season or weather cue at all (a close-up of tarmac, a plain panel). It
  may not carry a cue for the wrong state: green leaves in December, a
  bright sky while the HUD says heavy rain, a bee in January.
- **The nearest art is not the nearest truth.** A missing season is never
  filled with another season's art. Autumn drawn as winter is a
  contradiction that merely looks like a fallback (section 8 records the
  one place this happens today).

## 2. Why this is a rule and not a feature

The audience is autistic children aged 3 to 8. For a child who relies on
a world behaving the same way each time, the world's rules are what make
it safe to be in. Rain on one screen and sun on the next, or a snowy map
behind a summer garden, is not a cosmetic bug for this audience. It
breaks trust in the rules of the world.

The game also tells the child the world's state on every screen. The HUD
carries a phase pill and a weather pill (`HUDView.ts:245-257`,
`365-410`, `550-575`), and the weather is mechanical: it decides whether
a cat may be let out and whether a coat is needed
(`garden.ts:157-165`, `wardrobe.ts:149-175`). So every outdoor scene is
being checked, by the child, against a statement the game has already
made. The HUD pill is the test oracle: if a scene disagrees with the
pill, the scene is wrong.

## 3. What counts as an outdoor scene

A scene is outdoor if it shows sky, open ground, planting, water, weather
or a road, **or** shows the outside through a window or a door. It does
not matter whether it is a Phaser scene, an HTML overlay in an iframe, a
raster of an SVG, a loading frame or a thumbnail.

Outdoor today (the register in section 9 lists each with its status):

- the garden, lawn and quiet nook (`GardenView`);
- the map and the A.R.C. site stage inside it (`map.html`,
  `birchie-roads.svg`);
- the garden tunnel's above-ground overlay and its soil (`tunnel.html`);
- the drive: the road, verges, trees, hedges, traffic, the GPS minimap
  (`PtvDriveScene`, `drive-render.ts`);
- the supply run (`SupplyRunScene`) and the walk (`WalkScene`);
- the play screen (`PlayScene`, a garden);
- the A.R.C. forecourt, the vehicle picker, the car park and crate
  loading (`forecourt.ts`, `car-park.ts`), and every destination's
  arrival forecourt (`renderArrival`);
- the HTML screens drawn over a garden or the town (welcome, login,
  sign-up, forgot-PIN, menu, news, friends, badge, adoption, rewilding,
  play-dog, intro);
- indoor scenes that show a window (the rooms, the kitchen).

Not outdoor: pure chrome (buttons, plates, the HUD itself) and indoor
views with no window (the corridor). A board mini-game whose tiles are UI,
such as the depot's match-3, is not an outdoor scene. If its content names
a season (decoration themes) it must still read the season from the same
source as everything else, or it will contradict the world by label.

The tunnel is outdoor even though it is a dig: the soil is ground, and
the overlay above it is the garden.

## 4. What must agree

| Axis | Source of truth | Notes |
|---|---|---|
| **Season** | The real-world date: northern-hemisphere meteorological seasons. December to February winter, March to May spring, June to August summer, September to November autumn. | Decided 2026-10-11 (section 7). Whole months are the boundaries `map.html` already uses (`map.html:1243-1250`); Marcus has not chosen boundaries separately. |
| **Weather** | `store.gardenWeather.current`: the value the HUD pill shows and the let-outside gate reads. Rolled from the season's weights (`weather.ts:69-93`). | Simulated, not real weather. The rule is that scenes agree with the game's weather. Real weather is not assumed. |
| **Time of day** | `store.timeProgress.currentPhase`: morning, afternoon, evening, night. | The game's own task-driven clock (`time.ts`), not the sun. Marcus's wording names season and weather; time of day is in the rule because the garden already honours it and the HUD shows it. Marcus to confirm (section 12). |

How scenes agree:

1. **One snapshot, taken at scene entry.** Season, weather and phase are
   read once, in one place, and handed down. An embedded page (an iframe)
   receives them from its host in its init message and never infers them.
   A page that works out the season for itself is how the tunnel came to
   show two (section 7.3).
2. **One resolver per art family.** The choice of which painting to show
   for (zone, season, phase) lives in one function. No scene names a
   season-specific asset file directly.
3. **A scene that cannot draw weather draws no contradicting sky.** It
   either expresses the weather or stays silent. A bright painted sky over
   a "heavy rain" HUD is the contradiction; a close-up with no sky is not.
4. **Weather and season respect the motion preference.**
   `motion-preference.ts` exists for children who want animation reduced.
   A reduced-motion child still gets the weather, as a still expression
   (a grey wash, a settled drift), because removing it would contradict
   the pill. `WeatherParticles.ts` reads no motion preference today.
5. **Changes cross-fade; they do not snap in front of the child.** The map
   already eases its season over 1.1 seconds. A scene entered after a
   boundary is simply correct on entry.
6. **Consecutive scenes agree.** Garden, map, drive, arrival and the
   screen after: each is the same world seen again. Check the sequence,
   not just each scene alone.

## 5. What a new outdoor scene must do

1. Add a row to the register in section 9 in the same change.
2. Take the snapshot (season, weather, phase) from the shared source. Do
   not call `new Date()` for a season. Do not read the in-game month.
3. Resolve art through the family's resolver. If there is no family yet,
   write the resolver first and make it throw (or fail a test) for any
   (season, phase) with no art.
4. Ship all four seasons, or ship with no season cues. Do not ship three
   and substitute the fourth.
5. Draw weather from the shared weather layer, or draw no sky and no
   ground cover that could contradict it.
6. If it is an iframe, take the snapshot from the host's init message and
   forward it to any frame it embeds.
7. Add any new season fact to the ledger in section 6.
8. Check it with the HUD pill showing each weather and phase, in each
   season, and in the sequence of screens either side of it.

## 6. Season facts: what is true when

Every scene draws from this table. A scene that needs a fact not here adds
a row in the same change.

| Fact | Spring | Summer | Autumn | Winter | Source |
|---|---|---|---|---|---|
| Tractors working the fields | yes | yes | yes | no | Marcus's example; map doc (`.tractor-wrap`) |
| Snow piled, snow cover, ice on the pond | no | no | no | yes | Marcus's example; map doc (`#winter-*`) |
| Snow on rooftops | no | no | no | yes | map doc |
| Snowmen in the fields, Santa's grotto at Wyx Park | no | no | no | yes | map doc |
| Drifting blossom | yes | no | no | no | map doc |
| Drifting leaves | no | no | yes | no | map doc |
| Beach huts at Minnis Bay | yes | yes | yes | no | map doc |
| Cruise ship / ferry sailing | yes | yes | yes | no | map doc |
| Open-top seaside bus | yes | yes | no | no | `traffic.ts:101` (March to August) |
| Cargo ships | yes | yes | yes | yes | map doc |

Not yet decided, and needed by the first scene that draws them: bees and
flowers (seven HTML screens draw `bee-flying.png`), foliage state, lawn
colour, daylight length, and whether tractors travel the roads in winter
(the drive spawns them all year; the map says they are off).

## 7. The season clock: decision and what follows

### 7.1 Decision

**Marcus, 2026-10-11: the season follows the real-world date.** October
outside means autumn in the game. That is what "synchronised with the
outside world" means, and for this audience a world that agrees with the
window is worth more than seasonal variety.

**Accepted cost, stated so nobody removes it later:** a child who only
ever plays in summer never sees snow. The accelerated in-game calendar
must not be reintroduced to "let children see all four seasons". It
breaks the rule.

Not chosen: keeping the accelerated calendar (a child sees four seasons in
a few weeks, and the world disagrees with the window); and any hybrid.

### 7.2 What the code did, and the measurements

- `calendar.ts:144-149` derives the season from the **in-game month**:
  months 1 to 3 spring, 4 to 6 summer, 7 to 9 autumn, 10 to 12 winter.
- The in-game calendar runs at **one real week to one 30-day month**
  (`calendar.ts:92-97`, `docs/original-depot-supply-spec.md` section 3.5).
  A game year is 84 real days. A season lasts 21 real days.
- **Drift.** The game's seasons turn about 4.35 times a real year against
  the real one. Over a year the world agrees with the window roughly a
  quarter of the time, and never for more than three weeks at a stretch.
- **Offset.** Even at one-to-one, months 1 to 3 as spring is two months
  out against a British spring of March to May, and 10 to 12 as winter is
  two months out against December to February. The mapping must be
  corrected at the same time as the clock is changed, or the game is a
  season out even after the switch.
- **Start.** `createCalendarState` (`calendar.ts:214-224`) starts every
  account at month 1, so every child's first season is spring whatever the
  real date. A child who starts on 11 October meets spring bloom.
- **Refresh.** `advanceCalendar` runs only at load
  (`loadSaveState.ts:428`). A long session that crosses a boundary does
  not change season until the next load.

### 7.3 Several answers to "what season is it?", today

On 11 October 2026 (real autumn), in the live game:

| Reader | Source | Answer |
|---|---|---|
| Garden, weather rolls | in-game month | whichever of the four the account's age lands on |
| Tunnel soil | in-game season (`GameScene.ts:2011`) | the same |
| Map | real month, UK meteorological, because the host never posts a season (`map.html:1243-1250`, `1315`; the init payload at `GameScene.ts:1804-1830` carries none) | autumn |
| Tunnel's above-ground overlay | the same map page, in an iframe sent no season (`tunnel.html:723-727`) | autumn |
| Depot decoration tiles | real month passed through the in-game table (`DepotScene.ts:362-364`) | **winter**: month 10 is winter in the in-game table. Wrong against both clocks |
| Drive bus | real month, March to August (`PtvDriveScene.ts:2660`) | out of season |

So the map is already on the real date, by accident, and the doc that
specified it says otherwise. The tunnel is the sharpest case: soil and
overlay are one screen and two seasons.

### 7.4 What else the in-game calendar drives

Nothing non-seasonal reads the season label. What depends on the fast
clock depends on its **rate** or its **dates**, and none of it stalls if
the season stops reading the clock and the clock keeps running.

| Dependent | Where | Depends on | After the switch |
|---|---|---|---|
| Charity grants, once per week | `charity.ts:102` (`MS_PER_GRANT_MONTH`) | its own hard-coded 7-day constant. It does not import `calendar.ts` | untouched, as long as the constant is left alone |
| Adoption cooldown, 21 in-game days (about 5 real days) | `adoption.ts:132` via `inGameDaysBetween` (`calendar.ts:137-141`) | the rate, as a pure epoch-ms conversion. No `CalendarState` | keep the function and its rate. Rename it so it is not read as a season clock |
| Weather: a new day's forecast, rolled at load once the in-game date has changed, about every 5.6 real hours | `loadSaveState.ts:442-447`; seed in `weather.ts:103` | in-game date as the day key | keep. Keying weather to the real date would make one forecast last a whole real day, so a rainy day would keep cats in all day. A gameplay change, to be decided separately |
| Calendar events (adoption week, winter giving, anniversary, birthday) | `calendar.ts:47-88`, `getActiveEvents` | in-game months | **dormant**: `activeEvents` is computed on every load and read by no game code. Before it is wired, events need real-date anchors, or "Winter Giving" appears in real July. The spec already says "real-world anchored where it makes sense" |
| Depot Decorations Workshop theme rotation, 3 weeks per season | spec section 3.5; `DepotScene.ts:362-364` | the spec assumes the fast clock. The code already reads the real month | follows the real season. The spec's `seasonal_completionist` badge ("a complete decoration set from every season", no code yet) becomes a year-long goal. Open point (section 12) |
| Daily depot reset | `loadSaveState.ts:427-431`, `isDailyReset` | the real day (`lastRealDayChecked`) | see the bug below |

**One bug, reported not fixed.** `advanceCalendar` stamps
`lastRealDayChecked` with today, and `loadSaveState.ts:429` then asks
`isDailyReset` whether the real day has changed since that value. It is
always false. `resetDailySessions` has no other caller, and
`DepotScene.ts:807` only counts sessions down. By reading, the depot's
daily sessions are never refilled from here. Not run. Whoever changes
`advanceCalendar` for the season switch will be in this function and
should check it first.

So the switch is small if the clock is left alone and only the season is
decoupled from it. It becomes tangled only if the clock is "simplified"
at the same time. Do not.

### 7.5 Save compatibility: options, none implemented

`CalendarState` stores `currentSeason`, `lastRealDayChecked`,
`currentInGameDate`, `dayOfYear`, `activeEvents` and `gameStartedAt`.

- **`currentSeason` in an existing save.** `advanceCalendar` recomputes it
  from `gameStartedAt` at every load, so a stale value never survives a
  load today. After the change the same recompute reads the real date.
  Options: keep it as a stored cache that load always overwrites (nothing
  to migrate); or drop it from the state and compute on read (it cannot
  go stale mid-session; changes the saved shape). Keeping the cache for
  now is the smaller step.
- **`gardenWeather` rolled under the old season.** It carries `forDay` in
  in-game date and no season, so a saved snow forecast can sit under a
  real-autumn day for up to about 5.6 hours. Options: accept it; stamp the
  season on `GardenWeather` and re-roll when it differs (old saves lack
  the field, so they re-roll once); or change the `forDay` key format so
  the first load after the switch mismatches and re-rolls.
- **`currentInGameDate`, `dayOfYear`, `gameStartedAt`.** Keep. The weather
  seed, the cooldown and the dormant events read them. Only `.month` stops
  being read for season.
- **A device on an older build.** `merge-save` treats `calendar` and
  `gardenWeather` as newest-wins (`merge-save.ts:100`). Both are
  recomputed on load, so nothing sticks, but an old build shows the old
  season until it updates.
- **A session that crosses a boundary.** Options: sample the season at
  every scene entry (consistent with section 4, point 1); or on a daily
  timer. Scene entry is the simpler one.

### 7.6 Not decided here

- **Which real date.** The device's local date is the obvious reading. The
  world is Birchington, so seasons are northern-hemisphere. A child in the
  southern hemisphere would see a world that disagrees with their window.
  A locale setting would be a new decision.
- **Weather and time of day stay the game's own.** The decision covers the
  season. Real weather would need a location and a weather service, which
  is a separate and privacy-sensitive question for a children's game.

## 8. How the rule is checked

A rule with no check is a wish. Proposed, none built:

1. **The register (section 9).** A new outdoor scene adds a row. A row
   with a contradiction is recorded debt, not a quiet exception.
2. **A completeness test per art family.** For every (zone, season,
   phase) the resolver can be asked for, the file exists. It fails today
   for the garden: spring and autumn are missing (16 images).
3. **A static test.** No source or HTML file outside a resolver names a
   season-specific asset (`-summer-`, `-winter-` and so on) or calls
   `new Date().getMonth()` for a season. It would have caught the 11
   hard-coded summer lawns and the depot's real-month read.
4. **A snapshot contract for embedded pages.** The host's init message to
   an iframe carries season, weather and phase. A test asserts the map and
   tunnel mounts include them and that the tunnel forwards to its overlay.

**The one standing violation of "no substitution":**
`GardenView.ts:103-129` has art for summer and winter only. Spring falls
back to summer art (a green lawn with flowers: close, no blossom).
**Autumn falls back to winter art, which is fully snow-covered**, under
autumn weather: cloud, rain, wind and leaves over snow. Under the real
date, autumn is September to November, so this is the garden for a
quarter of the year, including today.

## 9. Surface register

Audited 2026-10-11 by reading the source. Nothing was run and no scene was
screenshotted (Phaser cannot run in the in-app browser); garden and room
art was checked as thumbnails. S = season, W = weather, T = time of day.

| Surface | S | W | T | What is wrong, and where |
|---|---|---|---|---|
| **Garden** (`GardenView.ts`) | reads in-game season, art for 2 of 4 | particles only | reads phase, art per phase | `103-129`: autumn is drawn as snow, spring as summer. The painted sky never changes with weather: summer is 55% sunny, so on the other 45% of rolls (cloud, rain, wind) the same bright painted sky sits under the weather. `WeatherParticles.ts:64-73`, `220-`: the wind emitter's leaf is autumn-coloured in every season (spring and summer both roll `windy`). Winter rolls `light_rain` over settled snow |
| **Map** (`map.html`, `birchie-roads.svg`) | reads season, 4 full palettes and layers (`svg:1850-1901`) | none | none | Source is the real UK month, not the host (`map.html:1243-1250`, `1315`). No weather layer, no night. A bare SVG is a summer fallback |
| **A.R.C. site stage in the map** | 4 textures, 4 tree sets, 4 garden plates (`map.html:1236-1290`) | none | none | same source problem |
| **Tunnel** (`tunnel.html`) | soil reads the in-game season (`1375-1393`) | none | none | `723-727` and `1634-1637`: the overlay iframe is sent only a tile size. The comment at `718-722` says season is forwarded, and no `applySeason` exists in the file. Soil and overlay disagree |
| **Depot** (`DepotScene.ts`) | real month through the in-game table (`362-364`) | n/a | n/a | wrong clock and wrong table. Not an outdoor scene, but it names seasons |
| **Drive** (`PtvDriveScene.ts`, `drive-render.ts`) | none | received, never read | none | `drive-render.ts:19-30` constant greens for verge, trees, hedges; drawn at `117-121`, `186-188`, `275-292`, `360`, `515-537`. Weather arrives (`GameScene.ts:1895`, `1964` to `PtvDriveScene.ts:221`, `560`, then `drive-state.ts:101`, `131`, default `'clear'`) and nothing reads it. Tractors spawn year-round (`traffic.ts:51`, `67`; `PtvDriveScene.ts:2662-2663`) against the map's "off in winter" |
| **GPS minimap in the drive** | none | none | none | `PtvDriveScene.ts:546-547`, `855`: the SVG is rasterised bare, so it is the summer fallback with no snow and no seasonal layers |
| **Arrival forecourts** (`renderArrival`, `PtvDriveScene.ts:1841-`) | none | none | none | gravel plus painted sprites (`492-497`). The habitat places carry fixed foliage: woodland in bluebell, moorland in heather and gorse, wetlands in gold reed, green deep forest, sea cliffs in flower. No snow, no wet ground |
| **A.R.C. forecourt, picker, car park, crate loading** (`forecourt.ts`, `car-park.ts`) | none | none | none | gravel (`84-95`), tarmac and kerb (`142-146`), a season-neutral building cut-out. No foliage, so no contradiction in the art. No snow or wet ground, and the fixed-offset vehicle shadow implies sun |
| **Supply run** (`SupplyRunScene.ts`) | none | none | none | `69-73` "a clear day over Birchington", `449-` sky, `620-624` grass: one daylight, one green |
| **Walk** (`WalkScene.ts`) | none | none | none | one tile set: grass, tree, flower, bush, water. `180` background, `1104-1135`. Walks read no weather either, though the garden gate does |
| **Play** (`PlayScene.ts`) | none | none | none | `245-250`: hard-codes `garden-lawn-summer-morning` |
| **HTML screens over a garden** | none | none | none | `garden-lawn-summer-morning` at `adoption.html:88`, `badge.html:82`, `forgot-pin.html:75`, `friends.html:80`, `login.html:78`, `news.html:80`, `play-dog.html:78`, `signup.html:80`, `welcome-new.html:80`, `welcome.html:80`; `rewilding.html:90` is the summer **evening** lawn. Seven screens draw a flying bee (friends, login, menu, news, sign-up, welcome, welcome-new). The pre-login pages run before any save exists, so only the real-date source can serve them |
| **Intro** (`intro.html:216-217`) | none | none | none | the world SVG, embedded bare: summer palette, tractors working |
| **Indoor windows** | none | none | none | by thumbnail: `bg-room-generic` shows green foliage through its window, `bg-room-cat` a bright daylight window, the kitchen a window. The rooms read no phase, so the night phase shows a sunlit room |
| `drive-overlay.html` | none | none | none | sky and grass constants (`17-24`, `206`). Unreachable: `openDriveOverlay` (`GameScene.ts:2165`) has no callers |

Checked, no outdoor art, no season or weather reference: Grooming, Vet,
Kitchen minigame, Social, Friends, Account, Adoption match, Loading and
the main-menu and auth wrappers.

## 10. Relationship to the map doc

`docs/map-seasonal-changes-2026-05-19.md` stays as the map's spec: the
four palettes, the seasonal layers, the winter-only additions, the vehicle
table. It is the model for what a compliant scene looks like.

Two parts of it are superseded by this rule:

- Its premise that the map follows "the in-game season, which the game
  already tracks" (its first lines). The season is the real date, and in
  practice the map already reads it.
- Its "Default" paragraph, which treats the real month as a fallback. It
  is the source. The host must send it anyway (section 4, point 1), so the
  map does not infer it for itself in the live game.

Likewise `docs/original-depot-supply-spec.md` section 3.5 (seasons as three
real weeks each) no longer describes the world's seasons.

## 11. The backlog this rule generates

Sizes are estimates from reading the code, not measured. S under half a
day, M one to two days, L three to five. Art is counted in images.

### Foundation (must come first)

| # | Work | Size |
|---|---|---|
| F1 | One real-date season function; correct the month mapping (`calendar.ts:40-45`, `144-149`, tests `calendar.test.ts:96-128`, spec table); `advanceCalendar` reads it; depot reads it; rename or retire the in-game-month readers so they cannot be mistaken for the season | M |
| F2 | Save compatibility (section 7.5), weather re-roll on mismatch, sample season at scene entry | S to M |
| F3 | The snapshot to every iframe: season in the map's init payload (`GameScene.ts:1804-1830`), tunnel forwards it to its overlay, intro sets it on the SVG | M |
| F4 | The compliance tests in section 8 | S to M |

### A. Reads the season but has no art for it

| # | Work | Size | Art |
|---|---|---|---|
| A1 | Garden **autumn** backgrounds, then **spring** (zone x phase). Today is autumn, so autumn is first. Fix `pickBackgroundKey` | S code | 16 images (8 each) |
| A2 | Garden weather: a shared wash for cloud, overcast, rain and fog over the fixed sky; wind leaf colour by season; motion preference | M | none |
| A3 | Map weather layer (rain, snow, fog, grey) and a phase wash; the layers it needs mostly exist in the SVG | M | none |

### B. Does not read the season at all (by how often a child sees it)

| # | Work | Size | Art |
|---|---|---|---|
| B1 | The 11 hard-coded HTML screens: one shared helper taking season and phase (real date before login), bees by season. Needs A1 | M | reuses A1 |
| B2 | Drive: seasonal verge, canopy, bare winter trees, snow edge, weather read from `drive.weather`, seasonal GPS minimap, tractor policy | L | none |
| B3 | `PlayScene` through the garden resolver | S | reuses A1 |
| B4 | Supply run: sky and grass by season and weather, from B2's palette | M | none |
| B5 | Walk: seasonal tile set and weather | M to L | about 9 tiles (tree, flower, bush for spring, autumn, winter) |
| B6 | Forecourts and arrival places: ground cover and weather over the existing sprites, or repaint the five habitat places | M | 0, or 15 |
| B7 | Phase wash shared by every outdoor scene (needs Marcus's yes on time of day) | M | none |
| B8 | Indoor windows: neutral them or repaint | S | up to 3 |

**Total, rough:** about 4 weeks of one developer's work, plus 25 images at
the least (garden 16, walk 9) and up to 43 if the habitat places and the
windows are repainted. The art is the larger unknown.

**Order:** F1 to F3 together (the switch, with the tunnel and map fixed in
the same change); F4 straight after, so the debt is visible and held; A1
autumn art before anything is announced, because the switch makes autumn
live today; then A2, B1, B2, and the rest by exposure.

## 12. Open points for Marcus

1. **Time of day in the rule?** Recommended yes, as one shared phase wash
   (B7) rather than painted night variants.
2. **Weather stays simulated?** Recommended yes; the rule then means every
   scene agrees with the HUD pill.
3. **Decorations Workshop follows the world season?** Recommended yes; the
   "Four Seasons" badge then takes a year, and the badge wants rewording.
4. **Tractors on the drive's roads in winter?** The map has them off; the
   drive has them on. Field work stopping is not the same as roads empty.
5. **Missing art: never substitute?** Recommended yes (section 1). The cost
   is that the garden needs autumn art before the switch ships.
