# Implementation plan — Adoption dialogue presentation layer

> Status: Implementation plan, 2026-07-04. Scopes the *dialogue
> presentation layer* proposed in
> [`adoption-dialogue-presentation-2026-05-19.md`](adoption-dialogue-presentation-2026-05-19.md).
> The adoption *mechanic* already shipped — this plan adds the staged
> conversation around a match, and a reusable runner for cast dialogue
> elsewhere. Grounded in the current code, not the older status docs.

## Where things actually stand (verified 2026-07-04)

The proposal doc's "build order" assumes the adoption picker is still an
HTML iframe (`adoption-office.html`). That is stale. The current reality:

- **The picker is a native Phaser scene**:
  `apps/game/src/scenes/AdoptionMatchScene.ts` (581 lines). It scores
  applicants, renders painted cards, and resolves via an
  `onComplete(householdId | null)` callback. No dialogue anywhere in it.
- **GameScene wiring** (`apps/game/src/scenes/GameScene.ts`):
  - `openAdoptionMatchOverlay(animal)` at **line 1133** — pauses
    GameScene, launches `AdoptionMatchScene`.
  - On confirm, `onComplete` calls `openAdoptionOverlay(animal,
    householdId)` at **line 1146**, which mounts the **`adoption`**
    HTML overlay (the painted ceremony) via `mountInGame(...)`.
  - `commitAdoption(...)` at **line 1499** runs the game-logic commit.
  - So the flow is: eligible-animal tap → `AdoptionMatchScene` (pick a
    family) → `adoption` ceremony iframe → `commitAdoption`.
- **There is no dialogue runner, no `DialogueBeat`/`DialogueSequence`
  type, no typewriter helper anywhere in the codebase.** The nearest
  primitives are:
  - `apps/game/src/ui/SpeechBubble.ts` — `createSpeechBubble(...)`, a
    static tail-down bubble with title/body/action button. Not a
    sequence runner; no expression/portrait/side logic.
  - `IntroScene.ts` — narration is an **HTML iframe** driven by
    `postMessage`, not native text. Not reusable as a Phaser runner.
- **Applicant data** (`packages/game-logic/src/adoption.ts`): the
  `Applicant` interface carries `householdId`, `name`, `avatarSrc`,
  `blurb`, `capacity`, `speciesPreferences`. **Only a single
  `avatarSrc` per household** — no expression field. The curtailed L1
  roster (`L1_CURTAILED_HOUSEHOLD_DEFS`) has 5 households wired:
  Priya, Nova, Babcia, Hiro, Patel-Greens.
- **Portrait assets already on disk** under
  `apps/game/public/admin/scene-assets/cast/`:
  - 32 neutral portraits (`01-priya.png` … `32-simeon-karo.png`).
    Note: filenames use **names**, but `avatarSrc` in adoption.ts
    points at `cast/01-pri-kaur.png` etc. — **the paths in adoption.ts
    do not match the files on disk** (see Risks). The scene already
    has a painted-initials fallback for this, so cards still render.
  - `variants/` holds **31 `*-greeting.png`** (arms-out-happy) plus a
    scattering of `*-with-<pet>.png` — a second, "happy/greeting"
    expression already exists for nearly the whole cast, for free.
- **Voice audio**: loose clips exist under
  `apps/game/public/assets/audio/voice-*.ogg` (e.g.
  `voice-hello-friend.ogg`). They are **not** in the `SoundEffect`
  union (`packages/game-logic/src/audio.ts`); they're played directly
  via `this.sound.play('voice-hello-friend', …)` from the Phaser audio
  cache (see `IntroScene.ts:148`), and loaded through the generic
  manifest in `apps/game/src/lib/AssetLoader.ts` (`load.audio(key,
  path)`). So dialogue can trigger existing voice stings without
  touching the `SoundEffect` type; new named clips just get added to
  the manifest.

**Consequence for this plan:** Tier 1 can ship a real, voiced,
expression-switching hand-over conversation using assets that *already
exist* (neutral + greeting portraits), with **zero art commissions**.
Bespoke worried/pleading expressions become a Tier 2 polish pass.

## Deliverables at a glance

| File | Action | Tier |
|---|---|---|
| `apps/game/src/ui/DialogueRunner.ts` | **create** — reusable Phaser dialogue overlay + runner | 1 |
| `apps/game/src/ui/dialogue-types.ts` | **create** — `DialogueBeat`, `DialogueSequence`, expression enum | 1 |
| `packages/game-logic/src/adoption-dialogue.ts` | **create** — pure beat-builder `buildHandoverDialogue(animal, applicant)` | 1 |
| `packages/game-logic/src/index.ts` | **modify** — export the new builder + types | 1 |
| `apps/game/src/scenes/GameScene.ts` | **modify** — insert runner between match-pick and ceremony | 1 |
| `packages/game-logic/src/adoption.ts` | **modify** — add optional `portrait` expression map to `Applicant` | 2 |
| `apps/game/src/lib/AssetLoader.ts` (or its manifest) | **modify** — register any new voice clips | 2 |
| `packages/game-logic/src/__tests__/adoption-dialogue.test.ts` | **create** — unit tests for the beat builder | 1 |

No changes to `AdoptionMatchScene.ts` itself in Tier 1 (see hook
section — we splice in GameScene, not inside the picker).

## Data model (concrete, aligned to existing types)

Put in `apps/game/src/ui/dialogue-types.ts`:

```ts
export type DialogueExpression =
  | 'neutral' | 'happy' | 'greeting' | 'worried' | 'pleading';

export interface DialogueBeat {
  speaker: string;                 // display name shown in the pill
  side: 'left' | 'right';          // left = warden/us, right = guest/them
  expression: DialogueExpression;  // maps to a portrait texture key
  portraitKey: string;             // resolved Phaser texture key (already loaded)
  text: string;                    // body; {name} tokens get coloured
  nameTokens?: {                   // optional explicit token→colour overrides
    animal?: string[];             // rendered ARC green
    person?: string[];             // rendered amber
  };
  voiceKey?: string;               // optional Phaser audio cache key to play
}

export interface DialogueSequence {
  id: string;
  beats: DialogueBeat[];
}
```

The runner takes a `DialogueSequence` + an `onComplete()` and is
scene-agnostic (an overlay container, like `SpeechBubble`, not a Scene)
so it can be dropped into `AdoptionMatchScene`, `WalkScene`, apprentice
recruitment, etc. later.

## Tiered build order

### Tier 1 — Minimal runner on existing portraits (no new art)
**Effort: ~1.5–2 dev days.**

Ships a fully working, voiced, side-switching hand-over conversation
using neutral + greeting portraits already on disk.

1. **`dialogue-types.ts`** — the types above.
2. **`DialogueRunner.ts`** — a self-contained overlay built the way
   `SpeechBubble.ts` builds containers (no new Scene):
   - Dimmed backdrop (semi-transparent rect over the current camera).
   - Waist-up portrait anchored left or right (~55–65% viewport
     height), swapped per beat by texture key. Falls back to the
     painted-initials treatment already in `AdoptionMatchScene`
     (`renderPortrait`) if a key is missing — reuse that logic.
   - Cream rounded dialogue box (reuse `SpeechBubble` styling / the
     `PAPER`/`CREAM`/`HONEY` palette constants from the adoption scene).
   - Dashed name pill on the speaker's side (honey-amber for warden,
     soft-blue for guest).
   - `{name}` token highlighting: parse body text, render animal names
     in ARC green (`SAGE_GREEN`), person names in amber (`HONEY`),
     using multiple `add.text` spans laid out inline (Phaser has no
     rich text — measure-and-position spans, as the cards already do).
   - Down-chevron advance affordance; tap-anywhere-on-box advances.
   - SKIP pill bottom-right → jumps to `onComplete`.
   - Optional per-beat `voiceKey` → `scene.sound.play(voiceKey)` if the
     key exists in `cache.audio` (guarded, like `IntroScene:148`).
3. **`adoption-dialogue.ts`** (game-logic, pure, no Phaser import) —
   `buildHandoverDialogue(animal, applicant): DialogueSequence`.
   Produces a **3–4 beat** linear script (per the proposal's "snappy
   for an 8-year-old" note):
   - Beat 1 (warden, left, neutral): "This is {animal}. {trait line}."
   - Beat 2 (guest, right, greeting): "{applicant reason} — they're
     perfect for us!" (reuse the applicant's `blurb`/reasons).
   - Beat 3 (warden, left, happy): "Look after {animal} for us."
   - Beat 4 (guest, right, greeting): warm sign-off.
   Text is data only — the runner resolves portrait keys and highlight
   tokens. Warden portrait: use an apprentice portrait (Rhubarb / Amara
   / Kofi by species, per `adoption-matching.md` §Apprentice
   involvement) — those PNGs exist under `cast/apprentices/`.
4. **GameScene hook** — see next section.
5. **Unit tests** for the beat builder (beat count, side alternation,
   token tagging, species→apprentice selection).

### Tier 2 — Commission expression portraits
**Effort: ~0.5 day dev + art-generation turnaround (external).**

Only *after* Tier 1 proves the runner under play.

1. Extend `Applicant` in `adoption.ts` with an optional
   `portrait?: Partial<Record<DialogueExpression, string>>` map
   (neutral stays `avatarSrc` for back-compat). Runner prefers the map,
   falls back to `avatarSrc`, then to painted initials.
2. **Commission** the missing expressions (see Assets section) via the
   OpenAI GPT-Image pipeline (`tools/gpt-image-regen.sh` /
   `regen-play-poses.sh`) — continuity-critical cast work goes through
   OpenAI, never Manus (per project memory). Batch: core L1 cast (the
   5 wired households + the 3 apprentice wardens) × {worried, pleading}
   — the neutral + greeting states already exist.
3. Register new files; no code change beyond the portrait map lookup.

### Tier 3 — Reuse the runner elsewhere
**Effort: ~0.5–1 day per new context, incremental.**

The runner is context-free, so:
- **Apprentice recruitment** chats.
- **Return-visit** vignettes (donation drop-off, photo-letter, wild
  visit) — cast already have `-donation` / `-return` / `-wild-visit`
  variants on disk.
- **Bad-match "didn't settle"** return message (ties into the
  educational-sticker layer in `adoption-matching.md`).
- Vet / intro conversations.
Each is just a new `buildX Dialogue()` in game-logic + a call site.

## How it hooks into the existing flow without breaking it

The current chain (GameScene) is:

```
openAdoptionMatchOverlay(animal)
  → scene.pause(); scene.launch('AdoptionMatchScene', { onComplete })
  → onComplete(householdId):
      scene.resume()
      if (householdId) openAdoptionOverlay(animal, householdId)   // ceremony iframe → commitAdoption
```

**Tier 1 splices the runner in `onComplete`, before the ceremony —**
leaving `AdoptionMatchScene`, the ceremony overlay, and `commitAdoption`
untouched:

```ts
onComplete: (householdId) => {
  this.scene.resume();
  if (!householdId) return;
  const applicant = getEligibleApplicants(animal, this.store)
    .find(a => a.householdId === householdId);
  const seq = buildHandoverDialogue(animal, applicant);
  runDialogue(this, seq, () => this.openAdoptionOverlay(animal, householdId));
}
```

`runDialogue` mounts the overlay on **GameScene itself** (already
resumed and visible behind the dim), then calls the existing
`openAdoptionOverlay` on complete/skip. If the builder returns an empty
sequence (missing applicant, feature-flag off), fall through directly to
`openAdoptionOverlay` — so a bug in the dialogue layer can never block
an adoption from completing.

Why splice in GameScene rather than inside `AdoptionMatchScene`:
- Keeps the picker a pure "choose a family" screen (single
  responsibility; its resize-restart logic stays simple).
- The runner overlays the live GameScene, matching the reference's
  "dimmed world behind the portrait".
- Zero edits to the shipped scene = lowest regression risk.

**Feature flag:** gate the runner behind a constant
(`ADOPTION_DIALOGUE_ENABLED`) so it can be toggled off instantly if it
misbehaves in front of Lily, reverting to today's picker→ceremony flow.

## Assets to commission (be specific)

**Tier 1: none.** Uses neutral (`cast/NN-name.png`) + greeting
(`cast/variants/NN-name-greeting.png`) + apprentice portraits
(`cast/apprentices/`) already on disk.

**Tier 2 (OpenAI GPT-Image pipeline, painted-watercolour style-anchor
per `rehoming-cast.md` blocklist rule):**
- **worried** and **pleading** waist-up expressions for the 5 wired L1
  households (Priya, Nova, Babcia, Hiro, Patel-Greens) = **10 sprites**.
- Same two expressions for the 3 apprentice wardens (Rhubarb, Amara,
  Kofi) = **6 sprites**.
- 512×512 (or waist-up portrait ratio matching existing variants),
  transparent PNG, 2–3 reference images of existing cast portraits to
  lock style. Total ~16 sprites.

**Audio (optional, Tier 2):** existing `voice-hello-friend.ogg` /
`voice-youre-amazing.ogg` cover warm sign-offs. If bespoke warden/guest
VO is wanted, add clips to the `AssetLoader` manifest — but the runner
works silently or with existing stings, so this is not blocking.

## Open questions requiring Marcus's decision

From the proposal, still open:
1. **Warden identity** — does the "us" side use a fixed warden, or the
   kid's avatar, or the species-matched apprentice (Rhubarb/Amara/Kofi)?
   *Lean: apprentice, since those portraits exist and it reuses the
   `adoption-matching.md` apprentice-narrator idea.*
2. **Linear vs player-choice** — stay linear (SKIP/advance, matches the
   reference), or offer reply choices? *Lean: linear for v1; choices are
   a Tier 3 upsell.*
3. **Length** — confirm 3–4 beats per hand-over.

New questions surfaced from the code:
4. **Where does the dialogue sit — before or after the ceremony
   iframe, or replacing it?** This plan puts it *before* the existing
   `adoption` ceremony overlay. Alternatively it could *replace* that
   iframe entirely (the runner does the whole hand-over natively). Which?
5. **Side convention** — proposal says "left = us, right = them" always.
   Confirm, vs. the reference's free-alternating.
6. **Name-highlight colours** — reuse `SAGE_GREEN` (animals) + `HONEY`
   (people) from `AdoptionMatchScene`? Or distinct dialogue palette?
7. **Voice-over scope** — silent, reuse existing stings, or commission
   per-beat VO? (Affects whether Tier 2 audio work is scheduled.)

## Risks / things that could go wrong

- **`avatarSrc` paths don't match files on disk.** `adoption.ts` uses
  `cast/01-pri-kaur.png`; the actual file is `cast/01-priya.png`. Cards
  currently survive via the painted-initials fallback, which means the
  neutral portraits **may not be loading at all today**. The dialogue
  runner will inherit this. *Mitigation:* fix the `avatarSrc` paths (or
  add a resolver) as a prerequisite; verify portraits actually render
  before building expression-switching on top of them. **Do this first
  or Tier 1 shows initials, not faces.**
- **No rich-text in Phaser.** Inline name-highlighting means
  measure-and-position multiple `Text` spans (as the cards already do
  for reasons) — fiddly with word-wrap. Budget time; consider a simple
  single-colour body for the very first cut if wrap proves painful.
- **Portrait aspect / cropping.** Existing portraits are near-square
  catalogue shots, not waist-up cinematic. Anchoring them at 55–65%
  viewport height may look like floating heads. *Mitigation:* mask +
  bottom-anchor, or accept a smaller portrait for Tier 1 and let the
  Tier 2 commissioned expressions be true waist-up.
- **Resize handling.** `AdoptionMatchScene` restarts on resize; the
  runner overlays live GameScene, which does not. Mid-conversation
  resize must reflow the overlay (reposition box/portrait) rather than
  restart, or the beat index is lost. Handle the `scale.on('resize')`
  explicitly in the runner.
- **Blocking the adoption on a dialogue bug.** Any throw in the runner
  must not strand the animal mid-adoption. *Mitigation:* the fall-
  through to `openAdoptionOverlay` on empty/failed sequence + the
  feature flag.
- **Curtailed roster.** Only 5 L1 households are wired. Expression sets
  and dialogue lines for the other 27 are dead until they're added to
  `L1_CURTAILED_HOUSEHOLD_DEFS` — keep Tier 2 art scoped to the wired 5
  + apprentices, not all 32.

## Recommended sequencing

1. **Prereq:** fix/verify `avatarSrc` paths so neutral portraits load.
2. **Tier 1:** types → runner → pure beat-builder + tests → GameScene
   splice behind a flag → play-test with Lily on existing art.
3. **Decide** open questions 1–7 with what the play-test reveals.
4. **Tier 2:** commission worried/pleading via OpenAI; extend
   `Applicant.portrait`; wire.
5. **Tier 3:** reuse runner for apprentice/return/vet dialogues.
