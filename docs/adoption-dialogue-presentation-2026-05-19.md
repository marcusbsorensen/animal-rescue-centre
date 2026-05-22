# Adoption dialogue presentation — design notes

> Status: Design capture, 2026-05-19. Reference-driven (Marcus shared
> five screenshots from another mobile game). Extends
> [`adoption-matching.md`](adoption-matching.md) — that doc covers the
> *mechanic* (matching animals to households); this doc covers how the
> *conversation* around an adoption (and other cast dialogues) is
> staged on screen.

## Reference observations

From the screenshots (a story-driven mobile game's cutscene dialogue):

1. **Speaker portrait, waist-up.** The talking character is drawn from
   roughly the waist up, large, occupying the lower third of the
   screen. Painted, full-colour, expressive.
2. **Alternating sides.** The portrait sits at the **left or right edge**
   depending on who is speaking — when the conversation passes back and
   forth, the portrait hops sides. Two people talking = a visible
   left/right rhythm.
3. **Expression changes per line.** The same character is redrawn with
   a different pose/expression to match the emotional beat of each
   line — Logan with both hands up, panicked ("take me with you!");
   Sarge gesturing uncertainly ("doesn't look too sturdy"), then arms
   folded and confident ("we'll do it together"); Lucky with a worried
   raised fist; Vicky hand-to-chest, anxious.
4. **Name pill.** A rounded, dashed-border name tab sits on the dialogue
   box, on the **same side as the speaker's portrait**.
5. **Dialogue box.** Pale-blue rounded panel across the bottom, large
   dark-navy text, comfortably short lines (2 lines typical).
6. **Advance affordance.** A small down-chevron centred on the bottom
   edge of the box = "tap to continue".
7. **SKIP button.** Bottom-right, pill-shaped, skips the whole sequence.
8. **In-text name highlighting.** Names of people referenced in the
   body text are coloured (e.g. "Maddie" in green) so the player can
   track who's who.
9. The world behind is dimmed / soft-focused so the portrait + box
   read clearly.

## How this maps onto A.R.C.

A.R.C. already has the painted-overlay-iframe pattern (welcome, menu,
arrival, conflict, etc). An adoption conversation is a natural fit for
a new `dialogue` overlay page. It would be used for:

- **Adoption hand-overs** — the adopter household + the player's
  warden character discussing the animal before/after a match.
- Potentially also: apprentice recruitment chats, visitor events, the
  intro, vet conversations — anywhere two cast members talk.

### Visual spec (matches the reference, ARC-styled)

- **Portrait**: waist-up painted character, ~55–65% of viewport height,
  anchored to the left or right edge. Painted in the ARC storybook
  watercolour style (NOT the reference game's 3D-render look).
- **Side rule**: the *player's warden* always on one side (say left),
  the *guest/adopter* always on the other (right) — so the kid learns
  "left = us, right = them". Simpler than free-alternating and still
  gives the back-and-forth rhythm.
- **Name pill**: rounded tab, dashed inner border, ARC honey-amber for
  the warden / soft-blue for guests, sat on the dialogue box on the
  speaker's side.
- **Dialogue box**: cream rounded panel (reuse the existing speech-
  bubble styling), Fredoka body text, max ~2 lines per beat.
- **Advance**: down-chevron, tap anywhere on the box to advance.
- **SKIP**: bottom-right pill, skips to the end of the sequence.
- **Name highlight**: animal names in ARC green, person names in amber.
- **Backdrop**: the current scene, dimmed ~40%.

### Data model (a dialogue is a sequence of beats)

```ts
interface DialogueBeat {
  speaker: string;            // 'warden' | household id | apprentice id
  side: 'left' | 'right';     // usually derived from speaker role
  expression: string;         // 'neutral'|'happy'|'worried'|'pleading'|…
  text: string;               // body copy; {name} tokens get highlighted
}
interface DialogueSequence {
  id: string;
  beats: DialogueBeat[];
  onComplete?: () => void;    // award fee, advance the match, etc.
}
```

The runner walks `beats`, swaps the portrait + expression + side, and
renders the box. `{Maddie}` style tokens in `text` render as coloured
spans.

### Asset implication

Each cast member used in dialogue needs **multiple expression
portraits**, waist-up, painted. That's the big cost. Options:

- **Tier 1 (MVP)**: a small core cast (the warden + ~4 recurring
  adopters) with 3 expressions each: neutral / happy / concerned.
- Generated via Manus — add to the landmark-asset prompt sheet as its
  own batch once the dialogue runner exists.
- The 32 painted households can keep their current single static
  portrait as a fallback (one expression) so adoption still works for
  the long tail without a full expression set each.

### Build order

1. Build the `dialogue` overlay page + runner (works with placeholder
   portraits / single expression).
2. Wire it into the adoption-matching flow (a short pre-match chat +
   a post-match hand-over vignette).
3. Commission the core-cast expression portraits from Manus.
4. Expand to apprentice-recruitment + visitor dialogues later.

## Open questions for Marcus / Lily

- Does the warden have a fixed name + look, or is it the kid's avatar?
- Should adoption dialogue offer **player choices** (pick a reply) or
  stay linear (just SKIP / advance)? The reference is linear. Choices
  would make matching feel more like a decision; linear is simpler and
  faster to ship.
- How long should a hand-over conversation be? Reference beats are
  ~4–6 lines. Suggest 3–4 for ARC to keep it snappy for an 8-year-old.
