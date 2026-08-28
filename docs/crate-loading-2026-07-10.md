# Crate loading — stack the ARC van (animal compatibility)

_2026-07-10. Captured for later — not yet built. Marcus's idea._

## Concept

Before a vet run, the player **loads animal crates into the ARC vehicle** through
its open loading door(s), stacking them into the cargo bay — while paying
attention to **which animals can safely be next to one another**. A packing
puzzle that feeds the driving mini-game (load up → drive to the vet).

## Core loop

1. A set of animals **need the vet** (surfaced from the rescue roster / a
   needs-vet flag).
2. The player sees the chosen vehicle from a **loading angle** (side or rear ¾,
   **door(s) open**), showing the cargo bay as a grid of crate slots.
3. **Drag each animal's crate** from a staging shelf into a bay slot, stacking
   them to fit.
4. **Compatibility rules** constrain placement — some animals can't be adjacent.
   A bad placement is refused gently (a wobble + "they wouldn't like that"),
   never a punishing fail: consistent with the no-harm-to-animals ethos in the
   driving game.
5. Once everything's loaded safely, the van is ready → hand off to the drive to
   the vet (the `pinebark-medical` destination).

## Mechanics to design

- **Compatibility matrix** — pure, data-driven, unit-testable (like
  `road-router` / `traffic`). Axes:
  - predator/prey (cat↔mouse/bird, dog↔cat, fox↔rabbit),
  - size / crush (a big crate can't sit on a tiny one),
  - temperament (a nervous animal away from a loud/boisterous one),
  - "must travel alone" species.
- **Adjacency** — define what counts as "next to": orthogonal neighbours in the
  grid, plus stacked above/below.
- **Stacking** — ties to the existing UX principle of **gravity-aware placement**
  ([[feedback_ux_principles]]): crates settle/stack under gravity; a crate needs
  support beneath it.
- **Capacity per vehicle** — Henry (van) holds few; bigger fleet vehicles hold
  more. Ties the loading game to the vehicle fleet.
- **Difficulty by level** — level-based limits (fewer animals / looser rules
  early), per [[feedback_ux_principles]].
- **Drag-drop UI** — staging shelf → cargo grid, Phaser draggable (reuse the
  patterns from the draggable GPS panel).

## Art needed (claymation, OpenAI pipeline — [[feedback_openai_only_sprites]])

- A per-vehicle **loading view**: side or rear ¾ with the loading door(s) open,
  showing the cargo bay/shelves. New art, distinct from the top-down driving
  sprites.
- **Crate sprites** with the animal visible/peeking, per animal in the roster.

## Connections

- Feeds the **driving mini-game**: load → drive to the vet (`pinebark-medical`).
- Uses the existing **animal roster** and the claymation **vehicle fleet**.
- "Animals that need the vet" needs a **source list** (rescue intake / a
  needs-vet flag on animals).

## Open questions (resolve in a brainstorm before building)

- Grid/shelf model vs true gravity stacking with weight?
- Puzzle (find any valid arrangement) or real-time/timed?
- How are the compatibility rules **taught to an 8-year-old** — icons/colours on
  the crates, a "these two don't mix" preview?
- The actual animal set and the compatibility matrix (needs the roster).
- Loading-view art: side vs rear vs ¾; one per vehicle, or a generic shared bay?
- Does vehicle choice matter (capacity trade-offs across the fleet)?
