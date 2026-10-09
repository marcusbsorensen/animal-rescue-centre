# Collection drives — the PTV goes out to fetch

2026-10-09. Closes the loop Marcus asked for in
`docs/ptv-pet-transport-vehicle.md` §"Collection drives": *"we also need
the PTV to go collect animals later on in the game so they don't just
appear in the welcoming hallway."*

Before this, every one of the eleven destinations was outbound and the
only way into the shelter was `spawnNewAnimal`, on a 45-second timer.
The van could take an animal away and had nowhere to fetch one from.

## The shape

One new `ArrivalKind` (`'collection'`), two new `DESTINATIONS` rows, one
rules module, one `case` in `handleArrival`, and a branch at each end of
the drive. The audit's guess was right: the expensive parts —
`createLoadingSession`, `driveTo`, `PtvDriveScene`, `finishArrival`,
`openArrivalOverlay`, the map's pin layer — all existed and are reused
unchanged.

The loop, end to end:

1. **The phone rings.** `spawnNewAnimal` asks `maybeRingInstead` first.
   Once the PTV is in service, about half of what used to knock at the
   gate rings instead: a `CollectionCall` lands on the save and a toast
   says who rang about what.
2. **The pin wears the species.** The map is sent the calls the shelter
   can still answer. A collection pin with a call gets a dark badge
   carrying the animal's glyph and a card line — "🐶 A dog is waiting".
   One with no call offers no drive.
3. **The drive out is empty.** `driveToCollect` spawns the animal, sends
   her to the drive as `collect`, and passes `cargo: []`.
4. **The pickup.** The forecourt draws her standing in the pull-in,
   the message names her — "We've found Biscuit at Goose End Farm!" —
   and the one control says `Lift Biscuit in`.
5. **The crate choice, where she is.** The loading screen opens on that
   forecourt with her in the tray and nobody seated. "Let's go!" is the
   journey home.
6. **Home.** `finishArrival` carries the grid and the animal back;
   `handleArrival` admits her, hangs up the call, saves, scores the
   journey and opens the arrival plaque.

## The three design points

### 1. The loading screen on an outbound collection leg

**Established first.** `pickAndDepart` only opens the loading screen
when `cargo.length > 0`, and `setOffFromLoading` refuses to depart with
an empty bed: *"Nobody is in Henry yet. Pick an animal, then a crate,
then a space."* So a collection handed the shelter's animals as cargo
would ask a child to load the cat she already has into a van driving
away from her — and then refuse to leave until she did.

**Decided: the drive out carries no cargo and opens no loading screen;
the crate choice happens at the pickup.** `driveToCollect` passes
`cargo: []` and `collect: <animal>`; `showArrivalPrompt` offers "Lift
her in" instead of "Go inside"; `beginCollectionLoad` builds the session
from her alone with an empty preload list; `setOffFromLoading` calls
`finishArrival` instead of moving to the departure forecourt.

Why this and not a second drive home: **the game already elides every
return leg.** A vet run ends at the vet's door and the next thing the
child sees is her own corridor. A collection that drove both ways would
be the only round trip in the game, and it would need an `originId`
through the GPS router, the departure forecourt and the route
instructions — a large change to the most delicate file in the
codebase for a leg no other destination has.

What this buys, beyond saving that work:

- The crate choice is made **where the animal is**, in front of her, at
  the moment the child has just met her. That is the version of the
  choice that means something.
- The empty-bed refusal becomes an honest sentence rather than an
  obstacle. On a collection it reads *"Biscuit is still outside. Pick
  her up, then a crate, then a space in Henry."*
- The grid rides home in `finishArrival` and is scored by
  `applyArrivalComfort` exactly as an outbound load is. Nothing new.

Two smaller consequences, both deliberate:

- **No vehicle arrows on a collection load.** They swap the vehicle
  being loaded, which only means something in the depot with the fleet
  parked either side. On a farmyard there is one vehicle and it is the
  one she drove. `CrateLoadingCallbacks.onVehicleChange` is now
  optional, on the same terms `drawCarPark` already had.
- **Back goes to the forecourt, not to the picker.** The picker is at
  the other end of a drive she has already made. Back steps out to the
  gravel she is parked on, where "Lift her in" is waiting.

### 2. Where the collected animal comes from

**Decided: the species is known before she drives; the individual is the
surprise on the forecourt.**

A `CollectionCall` holds a place, a species and a coat. The pin wears
the species glyph and the card says "A dog is waiting". The name, the
face and her story are met at the pickup.

For this audience that split is the whole point. A pre-reader choosing
between pins cannot read "Goose End Farm", and a trip whose purpose is
invisible until she arrives is a trip she has no reason to choose. A
species glyph at 14px is the one thing on that map she *can* read. The
rest is worth keeping back: meeting Biscuit is a beat, and a beat spent
in advance is spent.

Which species each place rings about is the destination's own
`suitableSpecies`, reused from the rewilding habitats because it means
the same thing — the farm rings about strays in its fields (dog, cat,
bunny, hedgehog), the churchyard about the cast in Marcus's note (the
cat in the bell tower, the parrot in the rafters, the grass snake on a
gravestone, the bat in the porch). It is then intersected with the
species this child has actually met, so a call never names an animal
she has never seen.

**The `Animal` record is spawned when the van sets off, not when the
phone rings.** An id on the save for somebody who has not been collected
yet is an id `syncNextId` cannot see on the next load and could hand out
twice. She exists for the length of the journey, travels in the drive's
`returnData`, and joins `store.animals` at the gate.

### 3. The shelter's cap

**Decided: asked twice before the child drives, never at the gate.**

- **When a call would be issued.** `issueCollectionCall` answers `null`
  if the shelter or the welcoming hallway is full, so a full centre is
  never rung.
- **When the map is drawn.** `offerableCalls` holds back a call whose
  room has gone since it came in. The call stays on the save and comes
  back when a bed does; the pin simply loses its badge and its "Drive
  here!" until then.
- **And `driveToCollect` asks once more** before starting the scene, for
  the case where the map was open while the hallway filled.

It is deliberately **not** asked when the van gets home. An animal
already in a crate at the far end of a drive the child has just
completed cannot be turned away without stranding her, and that is the
one outcome a ceiling must not buy. `admitCollection` always admits.

The cap is both of `spawnNewAnimal`'s: the level's shelter ceiling and
the shorter queue of animals still waiting to be welcomed, whichever is
tighter. It is asked by level alone, exactly as the gate asks it — an
apprentice's `extraCatSlots` only applies to a named species, and a
call does not know yet whether a cat is what turns up.

## Where state is written

`GameStateStore.collectionCalls`, a persisted field:

- `loadSaveState.ts` hydrates it under an `Array.isArray` guard (absent
  on every save written before today) and `snapshot()` writes it.
- `merge-save.ts` lists it under `ID_LISTS`, so a call answered on the
  iPad stays answered when the phone's save merges in. That is why a
  call carries an `id`.
- Every mutation saves: `maybeRingInstead` after it adds one,
  `driveToCollect` before it starts the drive, `handleArrival` after
  `admitCollection`.

## What is provisional

- **The two pin positions.** `goose-end-farm` at (0.30, 0.72) and
  `bay-chapel` at (0.30, 0.36) were placed against the drawn map rather
  than converted from real latitudes. The farm's true plot is out on the
  west coast strip, which already carries Cove Harbour and Moorland; a
  third marker between them buried all three labels at both shipping
  viewports, so it was nudged east and south until every name could be
  read. Marcus's to move, like the rest of the table.
- **Neither place has a painted forecourt.** `site-goose-end-farm-building`
  and `site-bay-chapel-building` do not exist, so both arrivals draw the
  chrome signboard — the standing "one building per destination" art ask,
  now two longer.
- **The 50/50 share is flat.** Marcus's note asks for half and half at
  the unlock, then gradually favouring collection as the player levels
  up. `COLLECTION_CALL_SHARE` is the one number that curve would replace.

## What this does not do

- **No urgency, no weather, no expiry.** The spec's time-pressured calls
  and the "someone else took her in, she's safe" line for an ignored
  call are not here. A call waits indefinitely and nothing is lost.
- **No call on the rail or the HUD.** The toast says the phone rang and
  the map carries the pin; there is no standing badge anywhere else, so
  a child who misses the toast finds the call by opening the map. The
  left rail is the obvious home for one.
- **No sibling pairs and no multi-animal calls.** One animal per call,
  so the crate screen is one decision. "Three kittens dumped near
  Bramble Farm" wants a grid, and the grid already supports it.
- **The collie training arc is not wired.** Marcus's onboarding beat is
  a border collie from the farmer, assessed at Goose End. The farm rings
  about dogs and the coat is rolled, so the collie turns up; nothing
  yet makes her *the* first call or opens a training arc behind her.

## Tests

- `packages/game-logic/src/__tests__/collection-calls.test.ts` — 32
  tests over the rules: the inbound destinations exist and name
  plausible species, the cap is counted the way the gate counts it,
  calls are silent when the centre or the hallway is full, a place never
  rings twice over, a call only names a species the child has met *and*
  the place would have, offers are withheld without losing the call, and
  `admitCollection` admits once, drops the call, mutates nothing, and
  admits her even over a full shelter.
- `apps/game/src/game-state/__tests__/collection-calls-save.test.ts` —
  the call reaches the snapshot, comes back on load, a pre-feature save
  still loads, and the admitted animal and the answered call persist
  together.
- `apps/game/src/__tests__/collection-wiring.test.ts` — the scene wiring,
  read off the source the way `animal-scale-wiring` reads its own:
  every `ArrivalKind` has a `case` in `handleArrival`, the collection
  drive sets off with `cargo: []`, she is spawned at departure, she is
  admitted before the journey is scored, the pickup load seats nobody,
  and the homeward "Let's go!" ends the drive.
- `apps/game/e2e/collection-drive.spec.ts` — the whole loop in real
  Chrome at 812x375 and 820x620, plus the two refusals.
