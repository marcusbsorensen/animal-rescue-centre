# Save sync, phase 2 — merging two shelters, 28 August 2026

Phase 1 made a collision between two devices *visible*: `save-game` answers
409, and the losing copy stays on the device instead of vanishing. It did not
decide what the shelter then becomes — the newest write won whole, and the
losing afternoon sat on disk unread. This is that decision.

## Why a two-way merge cannot work

Animals leave the shelter by being removed from `store.animals`. All four
exits do it — adoption, rewilding, a working role, passing — and none of them
leaves anything behind in the array (`docs/animal-exits.md`).

So with only the two divergent copies in hand, "in mine and not in theirs" has
two readings and no way to tell them apart:

- *I rescued this animal since we last agreed.* Keep it.
- *They adopted it out since we last agreed.* Drop it.

A union does the first to both and resurrects adopted animals. A pick does the
second to both and deletes the ones a child rescued this afternoon. Neither is
a rounding error; both are the shelter visibly lying to a seven-year-old.

## The ancestor

The common ancestor settles it. Against a base, presence has a direction:

|  | in base | not in base |
|---|---|---|
| **on one side only** | removed there — drop it | added there — keep it |
| **on both sides** | edited — pick a winner | edited — pick a winner |

`localSave` now keeps three records per player rather than two: the live
snapshot, the `::rejected` copy a 409 handed back, and `::base` — the last
state this device knew the server held. The base is written at the only two
moments the two provably agree: a save the server has just accepted, and a
cloud load that has just been adopted. The live record cannot serve as the
base, because the next save overwrites it before posting.

A device with no base — an older build, or IndexedDB cleared between the load
and the conflict — merges as a union and says so in the notes. Keeping an
adopted animal a little too long is a smaller harm than deleting a rescued one.

## The rules, by kind of field

`mergeSaveState(base, mine, theirs)` in `packages/game-logic/src/merge-save.ts`.
Pure, and it does not mutate its inputs.

| Kind | Fields | Rule |
|---|---|---|
| Entities by id | animals, placedDecorations, visitors, apprentices, gardenReturns, grantsReceived | three-way by id; on a double edit, this device wins |
| Append-only history | rehomed, rewilded | union — an exit recorded anywhere really happened |
| Sets | earnedBadges, houseUpgrades, unlockedCharms | three-way set; removals honoured |
| Lifetime counters | totalRescued, totalBonded, eventCounters | base + both deltas |
| Economy | economy.coins, lifetimeEarnings | base + both deltas, floored at zero |
| One-way flags | wildVisitsUnlocked, hasCompletedFirstDrive | OR |
| Session state | timeProgress, gardenWeather, calendar, equippedCharm | the server's copy — the later write |
| Depot | its own | daily budget takes both deductions; counters and inventory add |
| Anything else | — | the side that moved away from the base, else this device |

Two of these earned their exceptions.

**Animals keep the furthest-along `state` and the higher `bondLevel`, even
when the other device wins the animal.** Care stats churn by the minute; a
bond is something a child worked at for days. `state` only ever advances, so
the further of two values is never the wrong answer, and without this a merge
could quietly un-adopt a pet.

**Two sides holding the same counter is not a reason to return it.** Base 5
with both devices on 7 means each rescued two animals, not that they are
looking at the same two — had the +2 come from one write, this device would
have recorded the confirmation and its base would read 7 as well. Equality
with the *base* is what makes a delta vanish, not equality with each other.
This was wrong in the first draft and the client tests caught it.

**Coins are floored at zero.** Two devices can each spend most of the same
balance offline. A child looking at minus forty coins is a bug report; a child
who got away with a few extra is not.

## Where it runs

Both places the client can discover a divergence, and it is the same
divergence either way:

- **A rejected save.** The 409 body is `theirs`, the store is `mine`. The
  merged shelter is applied to the live store and re-sent. Applying it matters
  — leaving it out would mean the child keeps playing their own copy while the
  server holds the merged one, and their next save would overwrite the merge
  and lose the other device all over again.
- **A launch that finds an unsynced local save against a cloud copy that has
  moved on.** Phase 1 opened the cloud copy and left the local one on disk,
  which was honest about not having decided and no use to the child whose
  afternoon it was. It now merges, and deliberately does *not* record that
  cloud copy as the new base: the merged state is neither copy and the server
  has not seen it.

`save-game` is untouched. The server detects; the client decides.

## The child is told nothing

If the merge is right there is nothing for them to do, and "your shelter looks
different on this iPad" is true and useless. `mergeSaveState` returns `notes`
describing what it did; those go to the console for whoever reads the bug
report.

## Verified

- 30 unit tests on the merge itself, 8 on the client wiring. Full suite 979
  passing, typecheck clean, lint 0 errors, production build.
- **Against the deployed backend**, two sessions on one account: each device
  rescued an animal, one spent 40 coins and the other earned 30, and the phone
  bought an upgrade. After the real 409 and the real merge the server held all
  three animals, `totalRescued` 3, 90 coins with lifetime earnings of 130, and
  both upgrades. Then the phone rehomed an animal while the iPad fed another:
  the rehoming stuck and the feeding survived. 13 assertions, 0 failures, test
  player deleted afterwards.

## Still open

- Nothing has run on iOS hardware.
- A third device saving in the gap still gives up after one retry, as in phase
  1. The merged snapshot is on the device and the next action merges again from
  a fresh version, so nothing is lost; it just takes another action to land.
- `applySavedState` replaces `store.animals` wholesale mid-session. Views
  re-read from the store on redraw and ids are stable, so nothing observed
  breaks, but a scene holding a direct reference to an `Animal` object across a
  merge would be looking at a detached copy.
