# Animal-flow throughput analysis — A.R.C.

> Written 2026-05-03 by an analysis pass over the live codebase.
> Audience: Marcus, overnight reading. Goal: surface the
> sustainability risks in the arrivals → shelter → exits loop
> *before* we wire up the four exit paths in code, so we don't
> have to retrofit them later.

Sources read for this pass:

- `packages/game-logic/src/progression.ts` (caps + arrival queue)
- `packages/game-logic/src/animals.ts` (spawn rules)
- `packages/game-logic/src/destinations.ts` (rewilding habitats)
- `packages/game-logic/src/apprentices.ts` (Rhubarb L2, Amara L4, Kofi L6)
- `packages/game-logic/src/charity.ts` (only 2 of the 4 exits are
  actually counted today: `rewilded` and `rehomed`)
- `apps/game/src/scenes/GameScene.ts` lines 245–273 (the live arrival
  cadence — 45s real-time, NOT per in-game day)
- `docs/animal-exits.md`, `docs/rehoming-cast.md`, `docs/adoption-matching.md`,
  `docs/level-progression-overview-2026-05-03.md`

---

## 1. Executive summary — the three biggest sustainability risks

1. **Three of four exit paths are spec only.** Today, every animal
   that arrives sits in the shelter forever. Adoption-matching
   (`docs/adoption-matching.md`), permanent vet care
   (`docs/animal-exits.md` §4), and the "becomes the kid's pet"
   path all exist on paper. The only counters in code are
   `store.rewilded` and `store.rehomed` (`charity.ts:65–66`) and
   neither is incremented by anything. Net effect: **the centre is
   currently a one-way pipe** — arrivals fill it to cap, the cap
   stops new arrivals, the player stalls. This is the dominant
   bottleneck right now and dwarfs everything else in this doc.

2. **The arrival cadence is real-time, not gameplay-time.** A new
   animal spawns every 45 seconds of wall-clock play
   (`GameScene.ts:246–250`). At L1 (cap = 2) the centre is full
   inside 90 seconds. At L10 (cap = 18) it fills in ~13 minutes of
   continuous play. There is no per-day budget, no "we get one
   today" cadence, and no cool-down after a busy spell. This
   collides badly with the missing exit paths above and also makes
   the cap feel like a punishment rather than a pacing tool.

3. **The infinite-pet path is unbounded.** The "becomes the kid's
   pet" exit is documented but has no implementation and no cap.
   Once we ship it, a kid who bonds well will trivially convert
   every animal to a pet (bond ≥ 0.9 is reachable in normal play),
   pets escape the shelter cap, and the cap stops being a limit on
   anything. Marcus already flagged this; it needs a hard mechanic
   on day one of the implementation, not later.

---

## 2. Per-level throughput model

Caveats up-front: arrival rate today is **real-time-driven** (45s
between spawns when below cap — `GameScene.ts:246–250`), and three of
the four exit paths are not yet implemented. The numbers below
**model what the design *intends***, assuming we wire everything per
the specs in `animal-exits.md` and `adoption-matching.md`, plus a
notional in-game-day length of ~3 minutes wall-clock (rough — the
phase-budget drop from 12 → 6 tasks/phase across L1–L9 implies a day
contracts roughly 50% as the kid levels up). Assumed exit rates use
the bond and eligibility rules from `adoption-matching.md`
(`bond ≥ 0.6` for adoption, ≥ 0.9 for pet) plus a back-of-napkin
"how many can the player physically attend to per day" cap.

| Lvl | Cap | Queue | Arrivals/day | Adopt/day | Rewild/day | Pet/day | VetCare/day | Net flow | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| 1  | 2  | 1 | ~2 | 0 (gated L4) | 0 (gated L3) | 0 (gated TBD)  | 0 | +2 | **Jams immediately.** L1 has no exits. Within 90s of play the centre is at cap and the kid is locked out of the only loop the game offers. |
| 3  | 6  | 2 | ~3 | 0 (still L4) | 0–1 (Moorland + Woodland just opened, fox/bunny only) | 0 | 0 | +2 to +3 | Still jams, slower. Fills inside the first session. |
| 5  | 10 | 2 | ~3 | 1–2 (office active L4+) | 1 (Cove Harbour is supply, not rewilding — only Moorland/Woodland/Sea Cliffs work for rewilding here) | 0–1 | 0 (gated L4 per spec but no chronic flag yet) | ~0 to +1 | First level the loop *could* close. Tight. |
| 7  | 14 | 3 | ~4 | 2 | 1 (Sea Cliffs adds parrot rewilding) | 1 | 0 | 0 | Equilibrium possible if the player is engaged. |
| 10 | 18 | 3 | ~4–5 | 2–3 | 1–2 (all wild habitats now open) | 1 | 0–1 | -1 to +1 | Sustainable IF all exits ship. Snake rewilding (Wetlands, L9) is the last piece that lets all 7 species exit cleanly. |
| 15 | 28 | 3 | ~5 | 3 | 2 | 1 | 1 | -2 to 0 | Player is now a "manager", not a carer. Risk: feels like an inbox. |
| 20 | 30 (hard cap) | 3 | ~5 | 3 | 2 | 1 | 1 | -2 to 0 | Same as L15 with no new content. **L20+ has nothing fresh to chase.** |

Notes on the verdicts:

- **L1–L3 is the worst jam zone today.** Adoption is gated to L4
  (`adoption-matching.md:46`), the first rewilding habitats unlock at
  L3, the apprentice system unlocks at L2 — so the kid spends the
  formative first session watching the centre fill up with no way to
  empty it. **This is the urgent fix.** Concrete suggestion: open a
  *single, tutorial-friendly* exit at L1 — either a "Granny Babcia
  comes by looking for a lap cat" hand-authored adoption, or a
  reduced-scope adoption office that runs from L1 with only the
  4–5 first-tier safe households (Babcia, Pri, Hiro, Nova,
  Anjali+Sam — the calm-cat / first-time profiles).
- **Bunny rewilding** has a quiet asymmetry: Woodland opens at L3 and
  takes bunny + hedgehog + squirrel, but neither hedgehog nor squirrel
  are in `SPECIES_VARIANTS` (`animals.ts:84–92`) — so Woodland is
  effectively just a bunny outlet until those species ship. Worth a
  visible note in the level-progression overview.
- **Snake** is unlocked at L4 but Wetlands doesn't open until L9. So
  for five whole levels, snakes have *no rewilding exit*. They have
  to go to specialist adopters (Odenkirks #12, Popescu's class #28,
  Estrada Train #31) or sit in the shelter. Given how few specialist
  households fit snakes (~3 of 32), this is a bottleneck to watch.

---

## 3. The infinite-pet problem — recommendation

Marcus's framing is right: without a cap, "becomes the kid's pet"
breaks the cap on everything. Of the four mechanics on the table, my
ranking:

1. **Hard cap of 3 + Marcus's "on loan to other A.R.C.s" overflow** —
   *the recommended combination.* The cap teaches the kid that "love"
   and "keep" are not the same thing (a real lesson for an 8-year-old
   playing this with their dad). The on-loan mechanic preserves the
   feel-good of "I bonded so deeply with this one" without letting the
   roster grow forever — the pet doesn't disappear, they just go to
   help train new arrivals at a sister centre and come back to visit
   in the friends-screen. Implementation is small: a `loaned` flag on
   the favourite entry, a periodic rotation, and a return-visit hook
   that already exists for the Khan / Benji / Simeon-Karo cast.
2. **Pet rotation ("on holiday")** — a softer version of the same
   thing. Good as a *secondary* mechanic on top of the cap, not as a
   replacement. Lets pets temporarily clear a slot for a new bond
   without permanent loss.
3. **Promotion to apprentice-helper** — clever but conflicts with the
   existing apprentice system, which is human-only by design
   (Rhubarb / Amara / Kofi are kids, not animals). Could exist as a
   parallel "animal apprentice" track but adds scope.
4. **Time-cycle / natural ageing** — emotionally heavy in a kid game.
   The permanent vet-care path already covers this in a kinder way
   for genuinely elderly animals; we don't need a second clock.

**Suggested numbers:**

- `MAX_PETS = 3` for L1–L9.
- `MAX_PETS = 4` from L10+ (rewards long-term play with one extra
  forever-friend without breaking the math).
- Pets count as 0 against shelter cap but 1 against a separate
  "household roster" cap that the friends-screen surfaces.
- "On loan" overflow: from the moment the player tries to bond a 4th
  (5th at L10+) animal past the threshold, the game offers a choice:
  *swap an existing pet onto a sister-centre loan*, or *hold off on
  the bond*. No animals get "lost" — they show up in the friends
  screen with a postcard from their training role.

---

## 4. Adopter-household refresh — recommendation

Math from the brief: 32 households × 1–2 animals each = 32–64
adoption slots. At L10+ steady state of ~2 adoptions/day that runs
out in 16–32 in-game days — possibly inside a single weekend of play.

**Recommended mechanic: layered refresh, all already half-implied
by the existing `rehoming-cast.md` design.**

1. **Return-adopters (existing rhythm #3 in cast doc, line 137).**
   The Khan family, Tata Silva, Benji are already designed as repeat
   visitors. Generalise: every adopter household has a `nextEligible`
   timestamp, set 14–30 in-game days after their adoption. After that
   window they're back in the applicant pool, with a small "trusted
   adopter" boost on match scores (matches `adoption-matching.md`
   §"Second adoption"). This alone roughly doubles the effective
   roster.
2. **New families move in.** Tie a single new household to each
   "quiet" level (L4, L6, L8 — the levels Marcus already flagged in
   `level-progression-overview-2026-05-03.md` line 146 as needing more
   content). One painted-storybook reveal scene per level, household
   joins the roster permanently. This both refreshes the adopter pool
   AND fills the quiet-level content gap — two birds, one painted bird.
3. **Failed adoptions return.** From `adoption-matching.md` lines 199–203,
   "bad" matches already return the animal. Make sure these returned
   animals are tagged so the *household* who failed them is locked out
   of that animal's species for ~2 weeks (an apology mechanic). Doesn't
   shrink the roster but creates churn that feels honest.
4. **Institutional households (Sunnybrook #26, Oak Lodge #27,
   Popescu's class #28) stay perpetually open.** They serve a rolling
   community of recipients (kids in care, elderly residents, school
   classes), so they're always taking on a "next" animal. Use these
   as the safety valve — they never go to `nextEligible` cooldown.

Net effect: from L10 on, the roster cycles indefinitely without ever
feeling like the same family adopted twice in a row.

---

## 5. Rewilding habitat saturation — recommendation

**Recommendation: leave habitats infinite, but add a soft "season"
gate.**

A literal capacity model ("Moorland is full, no more foxes") plays
badly emotionally — wild ecosystems aren't shoeboxes, and a kid who
just got a fox well enough to release shouldn't be told no. But pure
infinity removes the ecosystem-thinking that's a real teaching
opportunity here.

The middle ground: **rewilding seasons.** Each habitat has 1–2 months
of the in-game year where it's the *right* time to release (foxes in
spring, bats in early summer, parrots in late summer for the Sea
Cliffs nesting window, snakes in mid-summer when wetlands are warm).
Releasing in-season:

- Full XP, full Wildlife Trust grant credit.
- The animal "joins the local population" — a small painted scene,
  Benji-style return-visit unlocked.

Releasing out-of-season:

- Half XP, no grant credit, gentle apprentice line: "we *can* let
  them go now, but if we wait until {month} they'll have a much
  better start."
- The kid can still do it. No animal is trapped.

This is a teaching layer, not a cap. It also gives the calendar
system (`calendar.ts` — already in the codebase) a real game-systems
purpose beyond cosmetic dates.

---

## 6. Bottleneck map by level

| Level | Hot-spot | Severity | Fix |
|---|---|---|---|
| L1–L3 | **No exits at all.** Adoption gated L4, rewilding gated L3, pet/vet not implemented. | **Critical** | Open a curtailed adoption office at L1 (4–5 safe households only). |
| L4–L5 | First adoptions live, but only 4–5 species unlocked and the office is freshly introduced. Risk: choice paralysis with `bad`-cards switched on. | Medium | `adoption-matching.md:124` already gates `bad` cards to L6+ — confirm in code and add a "this is your first match" tutorial line from Rhubarb. |
| L6 | Currently empty unlock-wise (Marcus already flagged in level-progression doc). Throughput is healthy here. | Low | Use this level for the "new family moves in" beat (see §4). |
| L7–L9 | Snake has nowhere to rewild yet (Wetlands waits till L9). Snake adoption pool is small (~3 households). Snake animals will stack. | Medium | Either move Wetlands to L7, or add a "snake sanctuary" specialist household that opens at L7. |
| L10–L15 | Sustainable if §3 + §4 ship. Risk: feels like inbox-management because there's a lot of *parallel* care. | Medium | Apprentice automation: at L10+, an apprentice takes one full care task autonomously per phase. |
| L20+ | No new content. The kid's done. | High (long-term) | Future: pet-show events (per `docs/ptv-pet-transport-vehicle.md`), late-game species (hedgehog, squirrel, raccoon per `future-features-lily.md`). Defer until we have data on actual play depth. |

---

## 7. Special-case animals — priority order

Top of the list is the variety that *fixes* a sustainability gap, not
just adds spice.

1. **Bonded pairs / sibling pairs (already in code, half-used).**
   `shouldSpawnSiblings()` returns true 20% of the time
   (`animals.ts:205–207`) but there's no adoption logic that requires
   siblings to be rehomed together. Wire that up first — it's already
   half-built and it teaches the kid about thinking-about-pairs.
2. **Returns from failed adoptions.** Lines 199–203 of
   `adoption-matching.md` already spec this. Implement next — it's
   the educational-loop that turns a failure into a teaching moment,
   and it makes the adoption office feel real instead of one-shot.
3. **Pregnant / nursing animals** (Marcus's "temporary cap explosion").
   Genuinely interesting because it inverts the cap pressure for a
   short window — the kid suddenly has 5 cats where they had 1, and
   then over a few weeks the kittens become adoptable. Pairs nicely
   with the Estrada Train (#31) household, who *love* boisterous
   exotics — perfect adopter for a kitten or two when ready.
4. **Behavioural-issue animals.** Use sparingly — they're the natural
   pairing for the experienced-handler households (Chris+Jamie #8 has
   service-dog training; Wiri+Harper #23 are conservation people).
   Adds depth without breaking the throughput math: ~1 in every 10
   arrivals.
5. **Bonded cross-species pairs** (dog + cat raised together). Lovely
   but low priority — niche and hard to spawn organically.
6. **"On loan" pets** — the mechanic itself is in §3. Treat the
   resulting pet-postcards as a special-case content type, not a
   special-case animal type.

---

## 8. Concrete code-change proposals (top 3)

All three are self-contained, testable, and unblock the loop. Each
sketch is rough — playtesting will move the numbers.

### 8.1 `getMaxPets(level)` + `tryAddFavourite()` with on-loan overflow

Lives in a new `packages/game-logic/src/favourites.ts` (no such file
today; `playerFavourites` is referenced only in
`docs/animal-exits.md:31`). Pairs with a new
`store.playerFavourites: FavouriteEntry[]` slice and a
`store.loanedFavourites: FavouriteEntry[]` slice.

```ts
// favourites.ts — pet cap + Marcus's on-loan overflow
export interface FavouriteEntry {
  animalId: string;
  bondedAt: number;
  // when set, this favourite is currently away helping at a
  // sister-centre. The animal still belongs to the kid, just not
  // counted against the active pet cap.
  loanedToCentreId?: string;
  loanedSince?: number;
}

/**
 * Hard cap on active pets a kid can keep. Cap grows by 1 at L10 to
 * reward long-term play without breaking the shelter math.
 *
 * Why a cap at all? Without one, every well-bonded animal gets
 * "kept" instead of adopted, and the rescue centre drifts into a
 * hoarding sim. The cap forces the kid to feel the difference
 * between "I love you" and "you need a forever home with someone
 * who can give you their full attention".
 */
export function getMaxActivePets(level: number): number {
  return level >= 10 ? 4 : 3;
}

export interface AddFavouriteResult {
  ok: boolean;
  needsLoanChoice?: boolean;       // true → kid must pick an existing
  candidatesForLoan?: string[];    //        favourite to send on loan
  reason?: string;
}

/**
 * Attempt to add an animal to the kid's pet roster. If the active
 * cap is full, returns `needsLoanChoice` so the UI can offer the
 * "send {Pet} to help train animals at a sister centre" choice.
 * Never silently fails — the kid always sees the trade-off.
 */
export function tryAddFavourite(
  animalId: string,
  store: { level: number; playerFavourites: FavouriteEntry[] },
): AddFavouriteResult {
  const active = store.playerFavourites.filter((f) => !f.loanedToCentreId);
  const max = getMaxActivePets(store.level);
  if (active.length < max) return { ok: true };
  return {
    ok: false,
    needsLoanChoice: true,
    candidatesForLoan: active.map((f) => f.animalId),
    reason: `Your home is full of love already. Pick a pet to help out at another A.R.C. for a while.`,
  };
}
```

### 8.2 `householdRefresh(store, today)` — adopter pool replenishment

Lives in `packages/game-logic/src/adoption.ts` (new file — see
`adoption-matching.md` §"Implementation order" item 1). Called on day
boundaries from the existing day-tick path.

```ts
// adoption.ts — pool refresh so the centre doesn't run out of homes
const COOLDOWN_DAYS_MIN = 14;
const COOLDOWN_DAYS_MAX = 30;
const PERPETUALLY_OPEN: ReadonlySet<string> = new Set([
  '26-sunnybrook-childrens-home',
  '27-oak-lodge-care-home',
  '28-popescu-class',
]);

export interface HouseholdState {
  id: string;
  lastAdoptedAt?: number;       // in-game day count
  nextEligibleAt?: number;      // when this household is open again
  trustedAdopter?: boolean;     // set true after a successful adoption
}

/**
 * Daily tick: walk the roster, mark cooldown'd households back as
 * eligible, and (every ~5 levels) bring in a fresh family to refill
 * the pool. Idempotent — safe to call many times per day.
 */
export function householdRefresh(
  store: { level: number; today: number; households: HouseholdState[] },
): void {
  for (const h of store.households) {
    // Institutional households are always open.
    if (PERPETUALLY_OPEN.has(h.id)) {
      h.nextEligibleAt = store.today;
      continue;
    }
    if (h.nextEligibleAt && store.today >= h.nextEligibleAt) {
      h.nextEligibleAt = undefined; // back in the pool
    }
  }
  // New-family-move-in beat: tied to "quiet levels" so it doubles as
  // content. Triggered by `level-just-reached`, not by `today`, so
  // do this in a separate `onLevelUp(level)` hook in practice.
}

/** Called after a successful adoption — sets the cooldown window. */
export function markAdopted(
  household: HouseholdState,
  today: number,
  rng: () => number = Math.random,
): void {
  household.lastAdoptedAt = today;
  household.trustedAdopter = true;
  if (PERPETUALLY_OPEN.has(household.id)) return;
  const cooldown = COOLDOWN_DAYS_MIN
    + Math.floor(rng() * (COOLDOWN_DAYS_MAX - COOLDOWN_DAYS_MIN + 1));
  household.nextEligibleAt = today + cooldown;
}
```

### 8.3 Open the adoption office at L1 with a curtailed roster

Smallest possible change with the largest impact on the L1–L3 jam.
Edit `adoption-matching.md` §"Eligibility check" item 4 from
`level >= 4` → `level >= 1`, and gate the *applicant pool* by level
instead. New helper:

```ts
// adoption.ts (continued)
const EARLY_GAME_HOUSEHOLDS: readonly string[] = [
  '04-babcia-basia',     // senior lap cat
  '01-pri-kaur',         // calm cat / small flat dog
  '06-hiro-nakamura',    // sweet older cat
  '03-nova-adebayo',     // playful first-time cat
  '07-anjali-sam',       // calm senior cat
];

/**
 * Which households are visible in the adoption office at this level.
 * Early game uses a hand-picked safe-roster (calm cats, first-time
 * adopters) so the kid's first matching attempts can't go badly. The
 * full roster opens up gradually so each level introduces a new face
 * or two.
 */
export function getEligibleHouseholds(level: number): readonly string[] {
  if (level <= 3) return EARLY_GAME_HOUSEHOLDS;
  if (level <= 6) return [...EARLY_GAME_HOUSEHOLDS, /* +mid-tier ids */];
  return /* full 32 */;
}
```

Rationale: the L1 jam is the single biggest sustainability problem
in the game today. Three weeks of brilliant cap-pacing math doesn't
matter if the kid quits in session 1 because the centre is full and
they can't do anything about it. A 5-household calm-cat roster at L1
is more important than the entire L20+ end-game.

---

## Closing thought — what would benefit from playtesting

Two specific things this analysis can't settle from code-reading
alone:

- **The real-time arrival cadence** (45s) might be fine for a kid
  who plays in 20-minute bursts and merely wrong for the cap math.
  The fix might be "leave the cadence, ship the exits", not "slow
  the cadence". A 30-minute Lily session would tell us in one sitting.
- **The L20+ end-game.** Everything in this doc assumes the player
  reaches L10 and then plays the loop indefinitely. If kids actually
  hit L10 and drift away, none of the §3–§5 fixes matter and we
  should put the energy into the late-game content instead. Worth
  watching the level-distribution telemetry once the four exits
  are wired up.
