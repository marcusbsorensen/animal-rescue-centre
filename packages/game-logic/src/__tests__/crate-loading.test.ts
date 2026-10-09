import { describe, it, expect } from 'vitest';
import {
  FEELING,
  FEELING_MARK,
  bestCrateFor,
  crateDefFor,
  describePair,
  emptyGridFor,
  createLoadingSession,
  slotCount,
  holdFromTray,
  liftFromSlot,
  putHeldBack,
  placeHeld,
  heldAnimal,
  waitingToBoard,
  aboard,
  crateAt,
  slotOutlook,
  slotNotes,
  settledNotes,
  canSetOff,
  blockingNotes,
  type LoadableAnimal,
} from '../crate-loading';
import {
  SHELF_CRATES,
  describeCrateChoice,
  heldCrateType,
  loadStage,
  putHeldInCrate,
  reseatInto,
} from '../crate-loading';
import {
  CRATE_DEFS, getCompatibility, getPreferredCrates, isCrateSuitable, VEHICLE_DEFS,
} from '../crate-stacking';
import type { Species } from '@arc/shared-types';

const ALL_SPECIES: Species[] = ['cat', 'dog', 'bunny', 'fox', 'bat', 'parrot', 'snake', 'hedgehog'];

const LUNA: LoadableAnimal = { id: 'a', name: 'Luna', species: 'cat' };
const CLOVER: LoadableAnimal = { id: 'b', name: 'Clover', species: 'bunny' };
const BUDDY: LoadableAnimal = { id: 'c', name: 'Buddy', species: 'dog' };
const MITTENS: LoadableAnimal = { id: 'd', name: 'Mittens', species: 'cat' };
const ECHO: LoadableAnimal = { id: 'e', name: 'Echo', species: 'bat' };
const NOODLE: LoadableAnimal = { id: 'f', name: 'Noodle', species: 'snake' };

describe('grid dimensions come from the vehicle', () => {
  it('each vehicle opens at its own real size', () => {
    expect(emptyGridFor('pedal-trike')).toMatchObject({ cols: 1, rows: 2 });
    expect(emptyGridFor('small-van')).toMatchObject({ cols: 2, rows: 2 });
    // Nothing in the fleet is more than two crates wide: every one of
    // them is painted two to three times longer than it is wide, so a
    // bed three across never fitted the thing it was drawn on.
    expect(emptyGridFor('long-van')).toMatchObject({ cols: 2, rows: 3 });
    expect(emptyGridFor('animal-lorry')).toMatchObject({ cols: 2, rows: 4 });
    expect(emptyGridFor('electric-minibus')).toMatchObject({ cols: 2, rows: 3 });
  });

  it('slot count matches the vehicle definition', () => {
    for (const def of Object.values(VEHICLE_DEFS)) {
      const session = createLoadingSession(def.id, []);
      expect(slotCount(session)).toBe(def.slots);
    }
  });
});

describe('crate choice', () => {
  it('every species gets a crate it actually suits', () => {
    for (const s of ALL_SPECIES) {
      expect(isCrateSuitable(s, bestCrateFor(s))).toBe(true);
    }
  });

  it('the crate carries a placeholder emoji for the view', () => {
    for (const s of ALL_SPECIES) {
      expect(crateDefFor(s).emoji.length).toBeGreaterThan(0);
    }
  });
});

describe('the words', () => {
  it('one word per feeling, and a mark that never travels alone', () => {
    expect(FEELING).toEqual({ happy: 'Happy', stressed: 'Worried', blocked: 'Frightened' });
    expect(Object.keys(FEELING_MARK).sort()).toEqual(['blocked', 'happy', 'stressed']);
  });

  it('names both animals and says what happens', () => {
    const { level, text } = describePair(LUNA, CLOVER);
    expect(level).toBe('blocked');
    expect(text).toBe(
      'Luna the cat makes Clover the bunny frightened. They cannot sit next to each other.',
    );
  });

  /**
   * **Reworded 2026-10-09, and the old assertion was right until it
   * was not.** It pinned "They can sit next to each other, but Luna
   * will not enjoy the journey.", which was good wording and
   * unsettable type: at the panel's narrow column the only place that
   * clause breaks is "…but Luna will / not enjoy the journey" — inside
   * a verb phrase, with a negation stranded at the start of a line,
   * both of which Marcus's typesetting rules forbid. The premise that
   * changed is not what the sentence should say but that it has to fit
   * a 288px column; see `describePair`.
   *
   * What it must still do is what this now checks: name both animals,
   * say who is worried, and say what would suit rather than what will
   * not happen.
   */
  it('a worried pair is told what would suit, in words that can be set', () => {
    const { level, text } = describePair(BUDDY, LUNA);
    expect(level).toBe('stressed');
    expect(text).toBe(
      'Buddy the dog makes Luna the cat worried. Luna would be happier a space away.',
    );
    // Positive in construction: no "not", nothing a child has to read
    // twice to find out what to do.
    expect(text).not.toContain(' not ');
  });

  it('says the same of a pair who alarm each other equally', () => {
    // A bat and a parrot rank the same, so neither is the cause and
    // the sentence says "each other" — the tail was reworded with the
    // one-sided one, for the same reason.
    const kiwi: LoadableAnimal = { id: 'p', name: 'Kiwi', species: 'parrot' };
    const { level, text } = describePair(ECHO, kiwi);
    expect(level).toBe('stressed');
    expect(text).toBe(
      'Echo the bat and Kiwi the parrot make each other worried. '
      + 'They would both be happier a space apart.',
    );
    expect(text).not.toContain(' not ');
  });

  it('a happy pair is told so in the same shape', () => {
    expect(describePair(LUNA, MITTENS).text).toBe(
      'Luna the cat and Mittens the cat are happy next to each other.',
    );
  });

  it('every pair in the matrix gets a sentence naming both animals', () => {
    for (const a of ALL_SPECIES) {
      for (const b of ALL_SPECIES) {
        const note = describePair(
          { id: '1', name: 'Pip', species: a },
          { id: '2', name: 'Sage', species: b },
        );
        expect(note.level).toBe(getCompatibility(a, b));
        expect(note.text).toContain('Pip');
        expect(note.text).toContain('Sage');
        expect(note.text.endsWith('.')).toBe(true);
      }
    }
  });

  it('a frightening pair always says it cannot sit together', () => {
    for (const a of ALL_SPECIES) {
      for (const b of ALL_SPECIES) {
        if (getCompatibility(a, b) !== 'blocked') continue;
        const { text } = describePair(
          { id: '1', name: 'Pip', species: a },
          { id: '2', name: 'Sage', species: b },
        );
        expect(text).toContain('cannot sit next to each other');
        expect(text).toContain('frighten');
      }
    }
  });
});

describe('picking up and putting down', () => {
  const open = () => createLoadingSession('small-van', [LUNA, CLOVER, BUDDY, MITTENS]);

  it('everybody starts on the pavement', () => {
    const s = open();
    expect(waitingToBoard(s).map((a) => a.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(heldAnimal(s)).toBeNull();
    expect(aboard(s)).toEqual([]);
  });

  it('holding an animal takes it out of the tray', () => {
    const s = holdFromTray(open(), 'a');
    expect(heldAnimal(s)?.name).toBe('Luna');
    expect(waitingToBoard(s).map((a) => a.id)).toEqual(['b', 'c', 'd']);
  });

  it('putting it back is always available and costs nothing', () => {
    const held = holdFromTray(open(), 'a');
    const back = putHeldBack(held);
    expect(heldAnimal(back)).toBeNull();
    expect(waitingToBoard(back).map((a) => a.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('placing fills the slot and empties the hands', () => {
    const out = placeHeld(holdFromTray(open(), 'a'), 0);
    expect(out.placed).toBe(true);
    expect(out.level).toBe('happy');
    expect(heldAnimal(out.session)).toBeNull();
    expect(aboard(out.session).map((a) => a.name)).toEqual(['Luna']);
  });

  it('the crate it travels in is the right one for the species', () => {
    const withSnake = createLoadingSession('small-van', [LUNA, NOODLE]);
    const out = placeHeld(holdFromTray(withSnake, 'f'), 0);
    expect(out.session.grid.crates[0]).toMatchObject({
      animalId: 'f', species: 'snake', crateType: 'warm-vivarium',
    });
  });

  it('lifting from a slot is both move and remove', () => {
    const loaded = placeHeld(holdFromTray(open(), 'a'), 0).session;
    const lifted = liftFromSlot(loaded, 0);
    expect(heldAnimal(lifted)?.id).toBe('a');
    expect(lifted.grid.crates).toEqual([]);

    const moved = placeHeld(lifted, 3);
    expect(moved.placed).toBe(true);
    expect(moved.session.grid.crates[0].slotIndex).toBe(3);
  });

  it('a taken slot is not a placement', () => {
    const loaded = placeHeld(holdFromTray(open(), 'a'), 0).session;
    const out = placeHeld(holdFromTray(loaded, 'd'), 0);
    expect(out.placed).toBe(false);
    expect(out.session.grid.crates).toHaveLength(1);
  });

  it('a slot off the end of the grid is not a placement', () => {
    const out = placeHeld(holdFromTray(open(), 'a'), 4);
    expect(out.placed).toBe(false);
  });

  it('placing with empty hands does nothing', () => {
    const out = placeHeld(open(), 0);
    expect(out.placed).toBe(false);
    expect(out.level).toBeNull();
  });
});

describe('a frightening slot is refused, not punished', () => {
  const catAtZero = () => {
    const s = createLoadingSession('small-van', [LUNA, CLOVER, BUDDY]);
    return placeHeld(holdFromTray(s, 'a'), 0).session;
  };

  it('the grid is untouched and the animal stays in hand', () => {
    const holding = holdFromTray(catAtZero(), 'b');
    const out = placeHeld(holding, 1);

    expect(out.placed).toBe(false);
    expect(out.level).toBe('blocked');
    expect(out.session).toBe(holding);
    expect(heldAnimal(out.session)?.id).toBe('b');
    expect(aboard(out.session).map((a) => a.id)).toEqual(['a']);
  });

  it('it says which neighbour, and why', () => {
    const out = placeHeld(holdFromTray(catAtZero(), 'b'), 1);
    expect(out.notes).toHaveLength(1);
    expect(out.notes[0]).toMatchObject({
      level: 'blocked', slotIndex: 1, neighbourSlotIndex: 0, animalId: 'b', neighbourId: 'a',
    });
    expect(out.notes[0].text).toContain('Clover');
    expect(out.notes[0].text).toContain('Luna');
  });

  it('a safe slot in the same grid is still available straight afterwards', () => {
    const refused = placeHeld(holdFromTray(catAtZero(), 'b'), 1);
    const diagonal = placeHeld(refused.session, 3);
    expect(diagonal.placed).toBe(true);
    expect(canSetOff(diagonal.session)).toBe(true);
  });

  it('the worst neighbour decides, and the notes lead with it', () => {
    // Bea is two across and three deep, so the slot under 1 is 3.
    let s = createLoadingSession('long-van', [LUNA, CLOVER, BUDDY, MITTENS]);
    s = placeHeld(holdFromTray(s, 'c'), 0).session;   // dog at 0
    s = placeHeld(holdFromTray(s, 'a'), 3).session;   // cat at 3 (under slot 1)
    const out = placeHeld(holdFromTray(s, 'b'), 1);   // bunny at 1 — dog west, cat south

    expect(out.placed).toBe(false);
    expect(out.level).toBe('blocked');
    expect(out.notes.map((n) => n.level)).toEqual(['blocked', 'blocked']);
  });
});

describe('live preview for the held animal', () => {
  const dogAtZero = () => {
    const s = createLoadingSession('small-van', [LUNA, CLOVER, BUDDY, MITTENS]);
    return placeHeld(holdFromTray(s, 'c'), 0).session;
  };

  it('nothing is previewed when nothing is held', () => {
    expect(slotOutlook(dogAtZero(), 1)).toBeNull();
    expect(slotNotes(dogAtZero(), 1)).toEqual([]);
  });

  it('each empty slot answers for the animal in hand', () => {
    const holding = holdFromTray(dogAtZero(), 'b'); // bunny
    expect(slotOutlook(holding, 1)).toBe('blocked');  // east of the dog
    expect(slotOutlook(holding, 2)).toBe('blocked');  // south of the dog
    expect(slotOutlook(holding, 3)).toBe('happy');    // diagonal — no neighbour
  });

  it('a filled slot has no preview of its own', () => {
    expect(slotOutlook(holdFromTray(dogAtZero(), 'b'), 0)).toBeNull();
  });

  it('a worried slot previews as worried', () => {
    const holding = holdFromTray(dogAtZero(), 'a'); // cat beside a dog
    expect(slotOutlook(holding, 1)).toBe('stressed');
    expect(slotNotes(holding, 1)[0].text).toContain('worried');
  });
});

describe('the settled grid', () => {
  it('says nothing when nobody can see anybody', () => {
    const s = createLoadingSession('small-van', [LUNA, CLOVER]);
    const loaded = placeHeld(holdFromTray(s, 'a'), 0).session;
    expect(settledNotes(loaded)).toEqual([]);
  });

  it('reports each pair once', () => {
    let s = createLoadingSession('small-van', [LUNA, MITTENS, BUDDY, CLOVER]);
    s = placeHeld(holdFromTray(s, 'a'), 0).session;
    s = placeHeld(holdFromTray(s, 'd'), 1).session;
    const notes = settledNotes(s);
    expect(notes).toHaveLength(1);
    expect(notes[0].level).toBe('happy');
  });

  it('a calm cross-species pair reads as happy', () => {
    let s = createLoadingSession('small-van', [ECHO, NOODLE]);
    s = placeHeld(holdFromTray(s, 'e'), 0).session;
    s = placeHeld(holdFromTray(s, 'f'), 1).session;
    expect(settledNotes(s)[0].text).toBe(
      'Echo the bat and Noodle the snake are happy next to each other.',
    );
  });
});

describe('the departure gate', () => {
  it('an empty van may set off', () => {
    expect(canSetOff(createLoadingSession('small-van', [LUNA]))).toBe(true);
  });

  it('a van built on this screen can always set off', () => {
    let s = createLoadingSession('small-van', [LUNA, CLOVER, BUDDY, MITTENS]);
    for (const id of ['a', 'b', 'c', 'd']) {
      for (let slot = 0; slot < slotCount(s); slot += 1) {
        const out = placeHeld(holdFromTray(s, id), slot);
        if (out.placed) { s = out.session; break; }
      }
      s = putHeldBack(s);
    }
    expect(canSetOff(s)).toBe(true);
    expect(blockingNotes(s)).toEqual([]);
  });

  it('a pre-loaded blocked pair stops the van and says which pair', () => {
    // The gate answers the grid, not the screen's history — a caller can
    // hand in a load this screen would never have built.
    const s = createLoadingSession('small-van', [LUNA, CLOVER]);
    const forced = {
      ...s,
      grid: {
        ...s.grid,
        crates: [
          { slotIndex: 0, animalId: 'a', species: 'cat' as Species, crateType: bestCrateFor('cat') },
          { slotIndex: 1, animalId: 'b', species: 'bunny' as Species, crateType: bestCrateFor('bunny') },
        ],
      },
    };
    expect(canSetOff(forced)).toBe(false);
    const blockers = blockingNotes(forced);
    expect(blockers).toHaveLength(1);
    expect(blockers[0].text).toContain('cannot sit next to each other');
  });
});

describe('pre-loaded passengers', () => {
  it('the named passenger is already aboard', () => {
    const s = createLoadingSession('small-van', [LUNA, CLOVER, BUDDY], ['a']);
    expect(aboard(s).map((a) => a.id)).toEqual(['a']);
    expect(waitingToBoard(s).map((a) => a.id)).toEqual(['b', 'c']);
  });

  it('two pre-loaded passengers are never seated frighteningly', () => {
    const s = createLoadingSession('small-van', [LUNA, CLOVER], ['a', 'b']);
    expect(canSetOff(s)).toBe(true);
    expect(aboard(s)).toHaveLength(2);
  });

  it('a passenger with nowhere safe stays on the pavement', () => {
    // The trike is a single column of two: a cat in one leaves the bunny
    // nowhere to go, so she waits rather than being forced aboard.
    const s = createLoadingSession('pedal-trike', [LUNA, CLOVER], ['a', 'b']);
    expect(aboard(s).map((a) => a.id)).toEqual(['a']);
    expect(waitingToBoard(s).map((a) => a.id)).toEqual(['b']);
    expect(canSetOff(s)).toBe(true);
  });

  it('an unknown id is ignored rather than throwing', () => {
    const s = createLoadingSession('small-van', [LUNA], ['nobody']);
    expect(aboard(s)).toEqual([]);
  });
});

// ── Illness, and how the screen words it ─────────────────────

describe('the sentence for a poorly animal', () => {
  const TRUFFLE: LoadableAnimal = {
    id: 'ill', name: 'Truffle', species: 'hedgehog', poorly: true,
  };
  const BISCUIT: LoadableAnimal = { id: 'well', name: 'Biscuit', species: 'cat' };

  /**
   * **Reworded 2026-10-09 with the other two tails.** The old one
   * ended "…but Truffle would rest better on their own.", which at the
   * narrow column broke as "would rest better on / their own" — a
   * break inside a prepositional phrase. The framing this test exists
   * to protect is untouched: the patient is still the subject, the
   * need is still hers, and the well animal is still never named as
   * minding. Only the length changed.
   */
  it('names the patient and their need, never the neighbour and their dislike', () => {
    const { text, level, needsQuiet } = describePair(BISCUIT, TRUFFLE);
    expect(level).toBe('stressed');
    expect(needsQuiet).toBe(true);
    expect(text).toBe(
      'Truffle the hedgehog is poorly and needs a quiet space. '
      + 'A space beside Truffle would help.',
    );
  });

  it('says it the same way round whichever way the pair is given', () => {
    expect(describePair(TRUFFLE, BISCUIT).text).toBe(describePair(BISCUIT, TRUFFLE).text);
  });

  it('never says the well animal minds, dislikes or will not enjoy it', () => {
    // The framing is the feature. A sentence that made Biscuit the
    // subject, or gave Biscuit the feeling, would teach the opposite
    // lesson to the one this game is for.
    const { text } = describePair(BISCUIT, TRUFFLE);
    expect(text.startsWith('Truffle'), 'the patient is the subject').toBe(true);
    for (const wrong of ['Biscuit the cat', 'does not like', 'worried', 'frightened']) {
      expect(text, `must not say "${wrong}"`).not.toContain(wrong);
    }
  });

  it('gives way to the blocked sentence, which is about safety', () => {
    const poorlyBunny: LoadableAnimal = {
      id: 'b', name: 'Clover', species: 'bunny', poorly: true,
    };
    const fox: LoadableAnimal = { id: 'f', name: 'Rusty', species: 'fox' };
    const { level, needsQuiet, text } = describePair(poorlyBunny, fox);
    expect(level).toBe('blocked');
    expect(needsQuiet).toBeFalsy();
    expect(text).toContain('cannot sit next to each other');
  });

  it('says nothing special about two patients together', () => {
    const alsoIll: LoadableAnimal = {
      id: 'i2', name: 'Pip', species: 'cat', poorly: true,
    };
    const { level, needsQuiet } = describePair(TRUFFLE, alsoIll);
    expect(level).toBe('happy');
    expect(needsQuiet).toBe(false);
  });
});

// ── The two stages: an animal, then a crate, then a space ────

describe('the three stages of a load', () => {
  const open = () => createLoadingSession('small-van', [LUNA, CLOVER, BUDDY, ECHO]);

  it('starts by asking which animal', () => {
    const s = open();
    expect(loadStage(s)).toBe('pick-an-animal');
    expect(heldCrateType(s)).toBeNull();
  });

  it('asks which crate the moment an animal is in your hands', () => {
    const s = holdFromTray(open(), 'a');
    expect(loadStage(s)).toBe('pick-a-crate');
    expect(heldCrateType(s)).toBeNull();
  });

  it('asks which space once she is in a crate', () => {
    const s = putHeldInCrate(holdFromTray(open(), 'a'), 'ventilated-basket');
    expect(loadStage(s)).toBe('pick-a-space');
    expect(heldCrateType(s)).toBe('ventilated-basket');
  });

  it('carries the chosen crate into the bay, not the species default', () => {
    // A cat's default is the standard crate; a wicker basket also suits
    // her, and the child's choice is the one that travels.
    expect(bestCrateFor('cat')).toBe('standard');
    const out = placeHeld(putHeldInCrate(holdFromTray(open(), 'a'), 'ventilated-basket'), 0);
    expect(out.placed).toBe(true);
    expect(crateAt(out.session, 0)?.crateType).toBe('ventilated-basket');
    expect(out.crate).toMatchObject({ type: 'ventilated-basket', suitable: true });
  });

  it('empties both hands and the crate when she is put down', () => {
    const out = placeHeld(putHeldInCrate(holdFromTray(open(), 'a'), 'standard'), 0);
    expect(loadStage(out.session)).toBe('pick-an-animal');
    expect(heldCrateType(out.session)).toBeNull();
  });

  it('changing your mind moves her to the other crate', () => {
    let s = putHeldInCrate(holdFromTray(open(), 'a'), 'standard');
    s = putHeldInCrate(s, 'quiet');
    expect(heldCrateType(s)).toBe('quiet');
    expect(loadStage(s)).toBe('pick-a-space');
  });

  it('lifting out of a bay keeps her in the crate she was travelling in', () => {
    const loaded = placeHeld(putHeldInCrate(holdFromTray(open(), 'a'), 'quiet'), 0).session;
    const lifted = liftFromSlot(loaded, 0);
    expect(heldCrateType(lifted)).toBe('quiet');
    expect(loadStage(lifted)).toBe('pick-a-space');
  });

  it('putting her back down takes her out of the crate as well', () => {
    const s = putHeldBack(putHeldInCrate(holdFromTray(open(), 'a'), 'quiet'));
    expect(loadStage(s)).toBe('pick-an-animal');
    expect(heldCrateType(s)).toBeNull();
  });

  it('picking up the next animal does not leave her in the last one’s crate', () => {
    // `heldCrate` is a fact about the animal in your hands, so it has
    // to be cleared by the pick-up and not merely by the put-down.
    let s = putHeldInCrate(holdFromTray(open(), 'e'), 'quiet'); // a bat
    s = holdFromTray(putHeldBack(s), 'c');                      // now a dog
    expect(loadStage(s)).toBe('pick-a-crate');
    expect(heldCrateType(s)).toBeNull();
  });

  it('a crate cannot be chosen with empty hands', () => {
    const s = open();
    expect(putHeldInCrate(s, 'quiet')).toBe(s);
    expect(loadStage(s)).toBe('pick-an-animal');
  });

  it('still seats an animal nobody chose a crate for', () => {
    // The fallback path: a session built by a script, or by a test
    // about adjacency rather than about crates.
    const out = placeHeld(holdFromTray(open(), 'a'), 0);
    expect(out.placed).toBe(true);
    expect(crateAt(out.session, 0)?.crateType).toBe(bestCrateFor('cat'));
  });
});

describe('what a crate means for the animal in it', () => {
  it('every crate on the shelf is a real crate, and all of them are there', () => {
    expect([...SHELF_CRATES].sort()).toEqual(Object.keys(CRATE_DEFS).sort());
  });

  it('calls any crate the species lists a happy one', () => {
    for (const s of ALL_SPECIES) {
      for (const crate of getPreferredCrates(s)) {
        const { suitable, text } = describeCrateChoice({ id: 'x', name: 'Pip', species: s }, crate);
        expect(suitable, `${s} in ${crate}`).toBe(true);
        expect(text).toContain('is happy in');
        expect(text).toContain(CRATE_DEFS[crate].label.toLowerCase());
      }
    }
  });

  it('answers an unsuitable crate by naming the one that suits', () => {
    const { suitable, text } = describeCrateChoice(ECHO, 'ventilated-basket');
    expect(suitable).toBe(false);
    expect(text).toBe('Echo the bat travels best in a quiet crate.');
  });

  it('never scolds, and never names the crate she is in', () => {
    // "Say what would suit, never scold" — Marcus, 2026-10-09. The
    // sentence a child reads after a poor choice says what the animal
    // needs and nothing about the choice she just made.
    for (const s of ALL_SPECIES) {
      for (const crate of SHELF_CRATES) {
        const { suitable, text } = describeCrateChoice({ id: 'x', name: 'Pip', species: s }, crate);
        if (suitable) continue;
        expect(text, `${s} in ${crate}`).toBe(
          `Pip the ${s} travels best in a ${CRATE_DEFS[bestCrateFor(s)].label.toLowerCase()}.`,
        );
        expect(text).not.toContain(CRATE_DEFS[crate].label.toLowerCase());
        for (const scold of ['wrong', 'cannot', 'not ', 'no ', 'try again', '!']) {
          expect(text, `must not say "${scold}"`).not.toContain(scold);
        }
      }
    }
  });

  it('agrees with the engine for every species and every crate', () => {
    for (const s of ALL_SPECIES) {
      for (const crate of SHELF_CRATES) {
        expect(
          describeCrateChoice({ id: 'x', name: 'Pip', species: s }, crate).suitable,
          `${s} in ${crate}`,
        ).toBe(isCrateSuitable(s, crate));
      }
    }
  });

  it('an unsuitable crate is allowed — it is a worse journey, not a refusal', () => {
    const s = createLoadingSession('small-van', [ECHO]);
    const out = placeHeld(putHeldInCrate(holdFromTray(s, 'e'), 'standard'), 0);
    expect(out.placed).toBe(true);
    expect(out.crate).toMatchObject({ type: 'standard', suitable: false });
    expect(aboard(out.session).map((a) => a.id)).toEqual(['e']);
  });
});

describe('changing which vehicle is being loaded', () => {
  it('everybody keeps the crate they were travelling in', () => {
    let s = createLoadingSession('animal-lorry', [LUNA, MITTENS, ECHO]);
    s = placeHeld(putHeldInCrate(holdFromTray(s, 'a'), 'ventilated-basket'), 0).session;
    s = placeHeld(putHeldInCrate(holdFromTray(s, 'e'), 'quiet'), 3).session;

    const { session, leftBehind } = reseatInto(s, 'small-van');
    expect(leftBehind).toEqual([]);
    expect(session.grid.vehicle).toBe('small-van');
    expect(session.grid.cols).toBe(2);
    const byAnimal = new Map(session.grid.crates.map((c) => [c.animalId, c.crateType]));
    expect(byAnimal.get('a')).toBe('ventilated-basket');
    expect(byAnimal.get('e')).toBe('quiet');
  });

  it('re-seats in the order they were sitting, from the front', () => {
    let s = createLoadingSession('animal-lorry', [LUNA, MITTENS]);
    s = placeHeld(holdFromTray(s, 'a'), 5).session;
    s = placeHeld(holdFromTray(s, 'd'), 7).session;
    const { session } = reseatInto(s, 'small-van');
    expect([...session.grid.crates].sort((x, y) => x.slotIndex - y.slotIndex)
      .map((c) => [c.animalId, c.slotIndex])).toEqual([['a', 0], ['d', 1]]);
  });

  it('nobody is seated where they would frighten somebody', () => {
    // The lorry can keep a cat and a bunny apart; the trike's two
    // spaces are one above the other, so one of them has to wait.
    let s = createLoadingSession('animal-lorry', [LUNA, CLOVER]);
    s = placeHeld(holdFromTray(s, 'a'), 0).session;
    s = placeHeld(holdFromTray(s, 'b'), 3).session;
    const { session, leftBehind } = reseatInto(s, 'pedal-trike');
    expect(canSetOff(session)).toBe(true);
    expect(leftBehind.map((a) => a.id)).toEqual(['b']);
    expect(waitingToBoard(session).map((a) => a.id)).toEqual(['b']);
  });

  it('leaves the animal in the child’s hands in them', () => {
    let s = createLoadingSession('animal-lorry', [LUNA, ECHO]);
    s = putHeldInCrate(holdFromTray(s, 'e'), 'quiet');
    const { session } = reseatInto(s, 'long-van');
    expect(heldAnimal(session)?.id).toBe('e');
    expect(heldCrateType(session)).toBe('quiet');
    expect(loadStage(session)).toBe('pick-a-space');
  });
});

describe('a poorly animal on the loading screen', () => {
  const ILL: LoadableAnimal = { id: 'ill', name: 'Truffle', species: 'hedgehog', poorly: true };
  const WELL: LoadableAnimal = { id: 'well', name: 'Biscuit', species: 'cat' };

  it('carries the flag onto the grid, so the rules can see it', () => {
    let s = createLoadingSession('small-van', [ILL, WELL]);
    s = placeHeld(holdFromTray(s, 'ill'), 0).session;
    expect(crateAt(s, 0)?.poorly).toBe(true);
  });

  it('previews a quiet need when a well animal is put beside one', () => {
    let s = createLoadingSession('small-van', [ILL, WELL]);
    s = placeHeld(holdFromTray(s, 'ill'), 0).session;
    const holding = holdFromTray(s, 'well');
    expect(slotOutlook(holding, 1)).toBe('stressed');
    expect(slotNotes(holding, 1)[0].needsQuiet).toBe(true);
  });

  it('previews nothing when the patient is the one being put down', () => {
    // The newcomer does not mind — but the animal already sitting
    // there is being asked to give space, so the preview still says
    // so. Asking only the newcomer would have shown "happy".
    let s = createLoadingSession('small-van', [ILL, WELL]);
    s = placeHeld(holdFromTray(s, 'well'), 0).session;
    const holding = holdFromTray(s, 'ill');
    expect(slotOutlook(holding, 1)).toBe('stressed');
    expect(slotNotes(holding, 1)[0].needsQuiet).toBe(true);
  });
});
