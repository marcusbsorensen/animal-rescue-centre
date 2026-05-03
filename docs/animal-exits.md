# Animal exit points

> Marcus 2026-05-03 — every animal that arrives at A.R.C. eventually
> leaves through one of FOUR exit paths. Captures the design intent
> so the gameplay loop always has a way out for every animal.

## The four exits

Every shelter animal eventually leaves via one of:

### 1. Adoption (rehoming)

The animal goes to one of the 32 adopter households. Mechanic: the
**adoption-matching mini-game** spec'd in [`adoption-matching.md`](adoption-matching.md).
Most common exit. Bond-required. Counts toward `rehomed` total
(feeds the Community Foundation grant).

### 2. Rewilding

The animal returns to a habitat suited to its species. Triggered when
the animal is well enough + bond ≥ threshold + species supports
rewilding (fox → moorland, bunny → woodland, hedgehog → woodland,
parrot → sea cliffs, bat → deep forest, snake → wetlands). Counts
toward `rewilded` total (feeds the Wildlife Trust grant). Highest-XP
exit per animal — the kid earns recognition for restoring a wild
animal to its proper place.

### 3. Becoming the player's pet

The kid forms an exceptionally strong bond (≥ 0.9). The animal joins
their `playerFavourites` list and stops counting against shelter
capacity. Capped at a small number of pets per kid (suggested: 3) so
the kid can't simply hoard every animal as a pet and never adopt.

### 4. Pet Retirement Home **(NEW — to be built)**

Some animals can't be adopted, rewilded, or kept. Old animals.
Chronically sick animals. Animals whose temperament makes any
home placement impossible. For these animals, the kindest option is
the **Pet Retirement Home** — a warm, caring building staffed by
vets and nurses, with special diets, gentle music, soft beds and
massages. Not clinical. Not a hospice. A place where well-loved
old animals go to be properly looked after for the rest of their
lives.

#### Why this matters

Without a fourth exit, every animal MUST end up adopted / rewilded /
kept. That breaks the realism for older + sicker animals and quietly
rewards the kid for ignoring difficult cases. With the Pet Retirement
Home as an option:

- The kid learns that "happy ending" can mean different things for
  different animals
- The most vulnerable animals don't get stuck at A.R.C. forever
- The shelter cap doesn't permanently fill with animals nobody can
  place
- It's emotionally honest without being grim — the animal goes on
  living, just somewhere it'll be properly looked after

#### Trigger conditions

The Pet Retirement Home is OFFERED (not forced) when:

- Animal age ≥ "elderly" (species-dependent — e.g. dog ≥ 12 yrs, cat
  ≥ 14 yrs)
- AND animal has a chronic illness flag (currently a single sickness
  field; this needs extension to support a `chronic: true` flag)
- AND bond level is below the pet threshold (if bond is high, the
  kid might choose to make them a pet instead)

When all three are met, the next time the kid visits the vet for that
animal, an additional option appears alongside "treat" and "discharge":

> **"Move to the Pet Retirement Home"** — explanation: "{Name} has
> earned a quieter life. At the Pet Retirement Home there are vets
> and nurses, soft beds, special meals, gentle music and someone to
> stroke them every day. They'll be looked after properly, for as
> long as they need."

The kid taps it. Animation: gentle painted scene of the animal being
settled into a sunlit room with a soft cushion, a bowl of nice food,
and a nurse stroking them. Quiet music. No text about death. Then
back to the corridor, with the animal removed from the shelter and
added to a new `petRetirementHome` count.

#### Mechanical effects

- Animal removed from `store.animals` (no longer in shelter or
  arrival queue)
- Counts toward a new `petRetirementHome` total (separate from
  `rehomed` and `rewilded`)
- Counts as a successful rescue (still adds to `totalRescued` — the
  rescue itself was successful even if the outcome was retirement)
- Generates a small painted "retirement polaroid" on the kid's wall:
  the animal curled on a soft cushion with the Pet Retirement Home
  silhouetted behind, dated, with a kind sentence like "{Name}
  retired in comfort."
- Triggers a charm unlock condition: "Compassionate Carer" charm —
  unlocks at first Pet Retirement Home decision

#### What this is NOT

- NOT euthanasia. The animal is alive, comfortable, well-fed, looked
  after every day.
- NOT clinical or grim. It's a warm caring building, not a hospice.
- NOT a punishment. The kid is making the kind choice for an animal
  who needs more than home care can offer.
- NOT a way to dump animals. Trigger conditions ensure it only
  applies to animals genuinely past the realistic placement threshold.
- NOT permanent UI clutter. The animal is gone from the shelter; the
  retirement polaroid sits on the photo wall like other rehoming
  polaroids.

## Implementation backlog

Not implemented yet. The design above is the spec. Implementation
needs:

- [ ] `Animal.chronicIllness?: boolean` field (or similar) on the
      Animal type
- [ ] Age threshold per species (`isElderly(species, ageDays)` helper)
- [ ] Vet popup — new "Move to the Pet Retirement Home" option
      (gated by the three conditions above)
- [ ] `store.petRetirementHome: PetRetirementEntry[]` array
- [ ] Painted scene for the "settled into a soft cushion" moment
      (one Manus task — small painted scene + a retirement polaroid
      template)
- [ ] Charm unlock condition + sprite: Compassionate Carer
- [ ] Photo wall surface — extend the existing photo-to-wall
      arrival-flow rendering to also include retirement polaroids

## Open questions

1. **Per-species age threshold** — what counts as "elderly" for each
   species? Could just use a single high-age constant, or per-species
   defaults (mice age fast, parrots live decades).
2. **Bond threshold for the option** — at what bond level does the
   "Stay here for full-time care" option HIDE in favour of "make
   them your pet"? Suggested: bond ≥ 0.9 hides the vet option
   (kid is clearly attached, let them keep).
3. **Charity grant tie-in** — does the Pet Retirement Home qualify
   for the Wildlife Trust or a new charity (e.g. "Senior Animal Care
   Foundation" — donates £50/month if `petRetirementHome.length >= 3`)?
4. **Should the vet itself have a level gate for offering this
   option?** Suggested: L4+ (kid has had time to bond with multiple
   animals + understand the full range of outcomes before being
   asked to make this choice).
