/**
 * crate-loading-view.ts
 *
 * The loading screen — where the child decides who travels and who
 * sits next to whom, between picking a vehicle and pulling out of the
 * bay.
 *
 * **The animals go into the actual vehicle.** The grid is not a grid: it
 * is the load bed of the van she just chose, drawn at the size the van
 * is, with a cutaway panel over it so she can see inside. That is why
 * Trikey holds two and Big Tilly holds nine — a fact the screen used to
 * state in a sentence under an abstract slab and never show. The bays
 * are laid on the painting; `fleet-art.ts` says where each vehicle's bed
 * is and how big to draw the vehicle so the bays stay tappable.
 *
 * **It is also a place.** The vehicle stands whole in a painted bay on
 * the A.R.C. tarmac, zoomed in on that one bay with an arrow either
 * side to move to the next — because this is the picker's car park one
 * moment later, with the camera moved in. Her neighbours, the far
 * kerb, the exit road and the rescue centre itself are all out of the
 * frame, and `car-park.ts` says which arithmetic took each of them out.
 *
 * **Nothing on it is shown cropped**, which is `docs/manus-sprite-rules.md`
 * Rule 8 and the reason the screen has two shapes: where the height
 * cannot hold a vehicle whole above the waiting animals, the animals
 * move to the side of her instead. See `loadingColumns`.
 *
 * **The big panel on the right is the teaching surface, and the screen
 * says so in colour.** It is not a status line, it is the point: it
 * answers in words a child can read whether these two animals may sit
 * together, and why. Its paper takes the colour of the feeling it is
 * reporting — the same four the glyphs use — so the answer arrives
 * before the sentence does, and the one colour that is not a feeling,
 * the brand orange, marks the one place a child starts. It has a fixed
 * home that never moves between renders. Nothing here is on a timer,
 * nothing flashes, and nothing a child taps can lose her work.
 *
 * The rules, the state machine and every sentence live in
 * `@arc/game-logic`'s `crate-loading` module — this file draws a
 * session and reports taps. It holds exactly one piece of state of its
 * own, the message panel's current text, because a pointer moving over
 * a slot should repaint two lines of type rather than the whole screen.
 *
 * Pattern follows the other view modules: a `render*` function taking
 * the scene, a container and a callbacks bag, with the owning scene
 * keeping the session and redrawing after every tap.
 */

import Phaser from 'phaser';
import type { Animal, Species } from '@arc/shared-types';
import {
  CRATE_DEFS,
  FEELING,
  REMEDY,
  SHELF_CRATES,
  VEHICLE_DEFS,
  animalById,
  crateDefFor,
  describeCrateChoice,
  heldAnimal,
  heldCrateType,
  isCrateSuitable,
  loadStage,
  settledNotes,
  slotNotes,
  slotOutlook,
  waitingToBoard,
  aboard,
  blockingNotes,
  canSetOff,
  crateAt,
  slotCount,
  type AdjacencyNote,
  type CompatibilityLevel,
  type CrateDef,
  type CrateType,
  type LoadableAnimal,
  type LoadingSession,
  type VehicleDef,
  type VehicleType,
} from '@arc/game-logic';
import { createAnimalSprite } from '../ui/sprites';
import { decorativeTween, stateTween } from '../ui/tween';
import { createChromeButton, createChromeTitle, createChromePlate } from '../ui/UIButton';
import {
  CHROME, COLOURS, FONTS, MIN_FONT, MIN_TAP, PAGE_MARGIN, SAFE_MARGIN, SPACE,
  TEXT_RESOLUTION, TITLE_CY, TYPE, bottomAnchorY, contentTopFor, hexNum,
} from '../ui/constants';
import { fitChipGrid } from '../ui/layout';
import {
  ARROW_GAP, ARROW_W, PARK_CEILING, carParkBackdropH, drawCarPark,
  type VehicleDirection,
} from './car-park';
import { drawVehicleShadow } from './forecourt';
import {
  BAY_GAP, BAY_MAX_H, BAY_MAX_W, BAY_MIN, BED_PAD, VEHICLE_BED, VEHICLE_BED_SOURCE,
  VEHICLE_SPRITE, VEHICLE_VISIBLE_FRAC, bedProbePoints, fitLoadBed, minScaleForBays,
  wholeVehicleHeight, type BedFit,
} from './fleet-art';

/**
 * The three feelings, as a surface each.
 *
 * Colour reinforces here, it never carries: every glyph has a silhouette
 * of its own, every badge draws its word, and the sentence in the panel
 * says the same thing a third time. A child who does not see red and
 * green apart reads the screen exactly as well as one who does.
 */
const FEELING_SKIN: Record<Mood, { fill: number; stroke: number; ink: string }> = {
  happy:    { fill: 0xd9efdd, stroke: hexNum(COLOURS.primaryDark), ink: COLOURS.primaryDark },
  stressed: { fill: 0xfdeec2, stroke: 0x8a6a1f,                    ink: '#6b5112' },
  blocked:  { fill: 0xf7dcd6, stroke: hexNum(COLOURS.accent),      ink: COLOURS.accent },
  // Cool and quiet, deliberately outside the warning family. Red and
  // amber are what this screen uses for friction, and an animal
  // needing a bit of peace is not friction — a child who has learned
  // that red means "two of these cannot sit together" should not read
  // the same alarm off somebody being unwell.
  quiet:    { fill: 0xdce8f4, stroke: 0x33566f,                    ink: '#2b4a5e' },
};

/**
 * The one colour on this screen that is not a feeling: the brand
 * orange, and it means *this is where you act*.
 *
 * **Every plate on this screen used to be the same cream rounded
 * rectangle** — the title, Back, the message panel, all six tray chips
 * and both buttons — which is precisely what "bland" names: nine
 * surfaces of equal weight and no way to tell the teaching surface
 * from the furniture. The screen already had a colour language in
 * `FEELING_SKIN`, four hues a child learns here and reads on the
 * glyphs, so the panel now takes the feeling's own colour as its
 * *surface* and says what it is before a word of it is read.
 *
 * That leaves the entry point with nothing, and Marcus's rule is that
 * a lead-in takes a colour no panel uses. Green, amber, red and blue
 * are spoken for; cream is paper. The brand's fifth hue is this
 * orange, which carries no meaning anywhere else on the screen, so it
 * carries the one thing the feelings cannot: the next thing to do.
 * It marks the two halves of the loading bay floor — the animals
 * waiting and the crates beside them, which are where a child starts
 * and what she does next — and the arrow in the panel that draws the
 * same instruction. Nowhere else.
 */
const ACT = hexNum(COLOURS.warm);

/**
 * What the screen shows about a pair.
 *
 * The *rules* keep three levels and that has not changed — happy,
 * stressed, blocked, with only blocked gating the drive. This is the
 * presentation layer's fourth reading of them: a `stressed` pair whose
 * stress is one animal being unwell is drawn and worded as a need
 * rather than as a falling-out.
 */
type Mood = CompatibilityLevel | 'quiet';

/**
 * The word under each mark.
 *
 * `FEELING` is the rules' own vocabulary and the three words a child
 * learns for how an animal feels. "Needs quiet" is a fourth thing
 * rather than a fourth synonym — it says what to do, not how somebody
 * feels — which is the test the comment on `FEELING` sets for adding
 * a word, and it passes.
 */
const MOOD_WORD: Record<Mood, string> = { ...FEELING, quiet: 'Needs Quiet' };

/**
 * The four words, as a set — so the panel can tell a heading that is
 * only a feeling from one that says something else.
 *
 * A heading of "Worried" is the panel naming a feeling, and where the
 * picture under it is already naming that feeling against the animal
 * who has it, the heading is the same word in the one place that caused
 * the attribution bug. "Nobody Is Worried" and "Henry Is Empty" are
 * sentences, not words, and are not in here.
 */
const MOOD_WORDS = new Set<string>(Object.values(MOOD_WORD));

/**
 * The two rows of type in the panel's picture band: the name above the
 * animal and the word for what she is feeling below her.
 *
 * One number each, because the band's height is divided once per render
 * and both the band and the heading above the sentences have to agree
 * about whether the lower row is being drawn at all.
 */
const NAME_ROW_H = MIN_FONT.small + SPACE.xs;
const REACTION_ROW_H = MIN_FONT.small + SPACE.xs;

/**
 * The words a heading never capitalises, unless it is the first word
 * or the last.
 *
 * Marcus's list, verbatim. Title case is his house rule for every
 * heading, and on this screen the headings are assembled from animal
 * names and species at run time — "Nutmeg the bunny", "Henry is
 * empty" — so a function is the only way to hold the rule. The
 * *sentences* are not touched: their wording was settled with him and
 * is pinned by tests, and this only ever sees a heading.
 */
const TITLE_SMALL = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet', 'as', 'at',
  'by', 'in', 'of', 'off', 'on', 'per', 'to', 'up', 'via', 'vs', 'from',
  'into', 'onto', 'with', 'upon',
]);

/**
 * The name of the activity this screen is, in capitals.
 *
 * **Marcus's own override of the title-case rule, for this one
 * element.** Title case is his house rule for every heading and he
 * asked for this one in capitals and larger: it is not a heading over
 * some text, it is the name of the thing the child is doing, and on a
 * screen of four surfaces it is the one that says which game this is.
 *
 * **Built from the vehicle's own name, always.** "LOAD HENRY" reads
 * like a string somebody typed, and the day somebody types it the trike
 * says Henry. The screen has shipped that bug once already, in the
 * sentence that called every vehicle "the van" — Trikey is a tricycle
 * and Big Tilly is a lorry.
 */
export function activityTitle(vehicleName: string): string {
  return `Load ${vehicleName}`.toUpperCase();
}

/** A heading in title case — see `TITLE_SMALL`. */
export function titleCase(heading: string): string {
  const words = heading.split(' ');
  return words
    .map((w, i) => {
      const bare = w.replace(/[^A-Za-z]/g, '');
      if (i > 0 && i < words.length - 1 && TITLE_SMALL.has(bare.toLowerCase())) {
        return w.toLowerCase();
      }
      // Only the *first character* is touched, never the first
      // lowercase one anywhere in the word — that is what turned
      // "Henry" into "HEnry". "A.R.C." and a name the rules already
      // capitalised come back unchanged.
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

/**
 * A line split into its first sentence and whatever follows it.
 *
 * The takeaway is one sentence, so a note carrying two gets the bold
 * on the first and plain on the rest. A line with one sentence comes
 * back whole, with nothing after it.
 */
export function splitTakeaway(line: string): [string[], string[]] {
  const m = /^(.+?[.!?])\s+(\S.*)$/.exec(line);
  return m ? [[m[1]], [m[2]]] : [[line], []];
}

/**
 * The lines a paragraph breaks into, set rather than wrapped.
 *
 * Phaser's `wordWrap` is greedy and stops there, which on a 374px
 * column gives "Animals only mind who is beside them, above / them or
 * below them." — a line starting on "them", and a last line that at
 * other widths comes out as a single stranded word. Marcus's rules
 * name four faults a greedy wrap produces and this fixes all four
 * against the measured width:
 *
 * - **No runts.** The last line of a paragraph never holds a single
 *   word; the word before it comes down to keep it company.
 * - **No one-letter word at a line end.** "a" and "I" go to the next
 *   line rather than hanging off the right edge.
 * - **No word stranded in front of punctuation.** A line never begins
 *   with a bare comma or full stop.
 * - **Roughly eight to ten words a line**, which at this column's
 *   width and 18px type is what the greedy pass already gives; the
 *   fixups only ever move words *down*, so they cannot overrun it.
 *
 * `measure` is the live Phaser text object's own width, so this is
 * measured in the face that will draw it rather than estimated.
 */
export function setLines(
  measure: (s: string) => number,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [];

  const lines: string[][] = [[]];
  for (const w of words) {
    const line = lines[lines.length - 1];
    if (line.length === 0) { line.push(w); continue; }
    if (measure([...line, w].join(' ')) <= maxWidth) line.push(w);
    else lines.push([w]);
  }

  const fits = (line: string[]): boolean => measure(line.join(' ')) <= maxWidth;

  /** No one-letter word at a line end: it goes to the next line. */
  const unstrandLetters = (): boolean => {
    let moved = false;
    for (let i = 0; i < lines.length - 1; i += 1) {
      const line = lines[i];
      const last = line[line.length - 1];
      if (line.length > 1 && last.replace(/[^A-Za-z]/g, '').length === 1) {
        const next = [last, ...lines[i + 1]];
        if (fits(next)) { line.pop(); lines[i + 1] = next; moved = true; }
      }
    }
    return moved;
  };

  /**
   * No runt: a last line holding one word takes the word above it.
   * Guarded so the line it takes from never drops below two words,
   * which would just move the runt up a line.
   */
  const unrunt = (): boolean => {
    let moved = false;
    for (let guard = 0; guard < words.length; guard += 1) {
      const last = lines[lines.length - 1];
      const prev = lines[lines.length - 2];
      if (!prev || last.length > 1 || prev.length < 2) break;
      const taken = [prev[prev.length - 1], ...last];
      if (!fits(taken)) break;
      prev.pop();
      lines[lines.length - 1] = taken;
      moved = true;
    }
    return moved;
  };

  /**
   * No line begins with bare punctuation — it belongs to the word it
   * follows, on that word's line.
   */
  const unorphanPunctuation = (): boolean => {
    let moved = false;
    for (let i = 1; i < lines.length; i += 1) {
      while (lines[i].length > 0 && /^[^A-Za-z0-9]+$/.test(lines[i][0])) {
        lines[i - 1].push(lines[i].shift() as string);
        moved = true;
      }
    }
    return moved;
  };

  // **The three fixups run until they stop changing anything**, because
  // each one can undo another. Fixing a runt pulls the last word of the
  // line above down onto the last line — and that word may leave a
  // one-letter word newly stranded at the end of the line it came
  // from, which the single pass that used to run first had already
  // gone past. "Smokey would be happier a space away." at the narrow
  // column is exactly that: greedy gives "…happier a space / away.",
  // the runt fix makes it "…happier a / space away.", and nothing was
  // left to move the "a". Three passes is the most any of these has
  // needed; the bound is there so a pathological measure cannot spin.
  for (let pass = 0; pass < 6; pass += 1) {
    const changed = [unstrandLetters(), unrunt(), unorphanPunctuation()].some(Boolean);
    if (!changed) break;
  }

  return lines.filter((l) => l.length > 0).map((l) => l.join(' '));
}

/** How a note reads on screen: its level, unless illness is the reason. */
function moodOf(note: { level: CompatibilityLevel; needsQuiet?: boolean }): Mood {
  return note.needsQuiet && note.level !== 'blocked' ? 'quiet' : note.level;
}

/**
 * The face an animal wears, per feeling.
 *
 * The expression art is complete — every species and every variant has
 * all ten states — so an animal who is frightened of her neighbour can
 * simply *look* frightened, which is the one thing on this screen a
 * child who cannot yet read can take in at full speed.
 *
 * **Only the animal who feels it wears a face.** The rules name a cause
 * and a sufferer — "Poppy the dog makes Smokey the cat worried" — and
 * drawing both of them frightened would teach a child that the dog is
 * frightened too, which is not what the sentence says and not what is
 * happening. The cause stays `sheltered`: calm, doing nothing wrong,
 * which is the truth about a dog who happens to alarm a cat.
 *
 * `playing` rather than `sheltered` for a happy pair, because the pair
 * is the point: `sheltered` is the state every settled animal is in
 * anyway, so it would say nothing, and `playing` is the one state where
 * all eight species read as pleased to be there.
 */
const FACE_AFFECTED: Record<CompatibilityLevel, string> = {
  happy: 'playing',
  stressed: 'grumpy',
  blocked: 'scared',
};

/**
 * The face of an animal who is only ever the cause — fine, doing
 * nothing, unaware that the hedgehog beside her minds.
 *
 * **`walking` rather than the obvious `sheltered`, and it was the art
 * that decided.** `sheltered` is each species at rest, and at rest
 * they are at rest in their own way: the cat sits on a cushion with a
 * pink love-heart over her head, the bat hangs upside down from a
 * branch, the parrot stands on a perch and the snake is a drab grey
 * coil where every other state paints her bright green. Drawn beside
 * a scowling hedgehog under the sentence "Tiger the cat makes Nettle
 * the hedgehog worried", the love-heart reads as smugness — and it is
 * a heart, which on this screen is already the mark meaning *these
 * two are glad of each other*, floating over one animal in a pair
 * that is not.
 *
 * `walking` is the one state where all eight are simply themselves:
 * upright, unbothered, no props, no weather. Neutral is what the
 * cause of somebody else's worry should look like.
 */
const FACE_CALM = 'walking';

/**
 * The face of an animal who is unwell.
 *
 * **Named and passed explicitly, not left to be derived.** The sprite
 * layer's `deriveVisualState` answers `arriving` before it answers
 * `sick`, so an animal who is both — which on a vet run is most of
 * them — would be drawn stepping out of her box with nothing about
 * her saying why the trip is happening. Saying `sick` outright is
 * also simply what this screen means: it is not asking for the
 * animal's general state, it is asking for the one fact the drive is
 * about.
 */
const FACE_SICK = 'sick';

/** Gap between crate bays, and between tray chips. */
const GAP = BAY_GAP;

/**
 * The cutaway floor the bays sit on — the inside of the vehicle, seen
 * with the roof lifted off.
 *
 * Four of the five vehicles are closed boxes, so there has to be a
 * convention for seeing in, and it has to be the same one every time or
 * the open trike and the closed lorry teach two different lessons. A
 * warm cream floor inset into the vehicle's own body, with a soft dark
 * rim where the walls would be, reads as a friendly cutaway in this
 * hand-drawn register. On Trikey, whose box really is open, the same
 * panel simply lands on the floor of the box, which is the honest case
 * the convention is built from.
 *
 * Duller than `CHROME.fill`, deliberately: the chrome plates floating
 * over this screen have to stay readable *as* chrome, and two creams a
 * shade apart is what keeps the paper above the world from dissolving
 * into it.
 */
const BED_FLOOR = 0xf0e4cc;
const BED_WALL = 0x3a3027;

/**
 * An empty bay: the well, the shade down its near wall, and the lip of
 * light on its far one.
 *
 * It used to be the cutaway floor with a wash of `BED_WALL` over it,
 * which came out at about (193,181,161) — four per cent darker than
 * the floor and a shade cooler. At Trikey's 130px bays the lip and the
 * inner stroke carried the depth anyway; at Big Tilly's 40px ones they
 * had nothing to work with, and nine cool grey rounded squares on warm
 * oak read as tiles laid on the lorry rather than holes cut in it.
 *
 * So the well now carries the depth on its own: a warm tan a full step
 * darker than the floor, which is the colour a shadowed cream floor
 * actually goes, and which keeps the whole vehicle on one side of the
 * warm/cool line. The strokes stay, and at Trikey's size they still do
 * what they always did.
 */
const BAY_WELL = 0xcdb792;
const BAY_WELL_SHADE = 0x6f5737;
const BAY_WELL_LIP = 0xfdf5e4;

/**
 * How far the well is cut outside the crate that stands in it.
 *
 * Two pixels, which is a ring of shadow round a crate rather than a
 * margin: the crate should look lowered into the hole, resting on the
 * lip, not placed on a mat that is bigger than it is.
 */
const WELL_LIP = 2;

/**
 * How big each animal is drawn, relative to the others.
 *
 * **The art is already normalised and that is the trap.** Every sprite
 * is painted to fill its own square — measured across the set, the
 * opaque part of a `sheltered` file runs 0.75 to 0.86 of the file on
 * its longest side, hedgehog and dog alike — so two animals drawn into
 * boxes of the same size come out the same size on screen. A hedgehog
 * the size of a dog is the mistake this table exists to stop, and it is
 * one the project has made before.
 *
 * So the loose animals waiting on the floor are drawn against these
 * instead: a share of the band's height, roughly as the real animals
 * compare. 1.0 is the dog, the largest thing this screen carries, and
 * the bat is a tenth of his length in life and a third of his height
 * here, because a bat drawn at a tenth of a dog would be four pixels.
 * The scale is honest about the order and the rough spacing rather than
 * to the centimetre, which is what a child reads off it.
 *
 * It is used in the one place on the screen where the animals are drawn
 * out of their crates and beside each other. A bay and a crate are a
 * fixed box and the animal fills it, which is right: a crate is a crate
 * whoever is in it.
 */
export const SPECIES_SIZE: Record<Species, number> = {
  dog: 1,
  fox: 0.88,
  cat: 0.74,
  bunny: 0.58,
  snake: 0.56,
  parrot: 0.5,
  hedgehog: 0.38,
  bat: 0.3,
};

/**
 * The crate shelf's biggest crate, and the floor under which the shelf
 * stops being worth the width.
 *
 * Six crates in a row at 76 is 496px, which is more shelf than any
 * viewport has to spare; the grid falls to two rows of three on the way
 * down and the crates stay square and tappable either way.
 */
const SHELF_CRATE_MAX = 76;

/**
 * How far back a crate that does not suit the animal in hand is drawn,
 * and how faint the ghost of her is in one that does.
 *
 * Weight rather than colour — see `ShelfPreview.show` for why there
 * was no colour left to use. Four tenths is far enough back to read as
 * a different state in greyscale and near enough to stay a crate a
 * child can see and tap; nothing on this shelf is ever disabled.
 */
const CRATE_DIMMED = 0.4;
const CRATE_GHOST = 0.42;
const SHELF_MIN_W = 3 * MIN_TAP + 2 * BAY_GAP;
const SHELF_MAX_W = 6 * SHELF_CRATE_MAX + 5 * BAY_GAP;

/**
 * How far a pointer may travel between going down and coming up and
 * still count as a tap rather than a drag.
 *
 * **Every drag on this screen is also a tap, and this number is the
 * whole of the arrangement.** A child who cannot drag accurately taps
 * the animal, then taps the crate, then taps the space, and gets
 * exactly what the drag would have given her. A child who drags gets
 * the same three answers in one gesture each. Nothing is reachable one
 * way and not the other.
 *
 * Ten pixels, because a finger on a touch screen moves a few by itself
 * and a tap that turned into a drag because the hand wobbled would
 * leave the animal in mid-air.
 */
export const DRAG_SLOP = 10;

/**
 * How far outside a space a drop may land and still count as landing in
 * it.
 *
 * The targets are already floored at `MIN_TAP`; this is on top of that,
 * and it is what "generous" means for a drag rather than for a tap. A
 * child aiming for Big Tilly's third bay and releasing twenty pixels
 * short has hit the third bay. Nothing overlaps badly enough for the
 * slack to pick the wrong one: `nearestDropZone` measures to the edge
 * of each space and takes the nearest, so a point inside one space is
 * always that space.
 */
export const DROP_SLACK = 28;

/**
 * The panel, as a height budget: the picture, then the words.
 *
 * `PANEL_TEXT_H` is a heading and four lines — the longest copy the
 * panel now carries, which is one sentence about the pair in the
 * picture plus the line telling the child what to do about it. It is
 * sized for that rather than for its contents, because a panel that
 * changed height would move the words a child is in the middle of
 * reading.
 *
 * **Four lines, where it used to be five and carry three sentences.**
 * The sentences are long: at the panel's width "Pumpkin the cat makes
 * Truffle the hedgehog worried. Truffle would be happier a space
 * away." is three lines on its own, so three of them was nine lines of
 * prose — a hundred and seventeen pixels more than the plate had,
 * which it simply ran off the bottom of onto the tray. It was over its
 * own paper before this change and nobody had measured it.
 *
 * So the panel says one thing now: *this* pair, in a picture and in
 * the sentence under it. The other pairs did not go anywhere — they
 * are on the grid, each wearing its own faces and its own glyph on the
 * edge the two of them share, which is where a fact about two
 * particular bays belongs and is the whole reason those exist.
 *
 * **Still four, after the vehicle arrows were wired, and that was
 * measured rather than assumed.** A vehicle change is the one event
 * whose sentence the rules write at full length — "Biscuit the dog
 * makes Daisy the bunny frightened. They cannot sit next to each other.
 * There is no other space in Henry for Biscuit, so Biscuit is waiting
 * to board again." — which is six lines at the 288px column. Budgeting
 * for six was tried and reverted: it leaves `facesH` at 58 against
 * `PANEL_FACES_MIN` of 62, so the panel loses its picture at 820x620
 * for every copy it writes, to carry one sentence of one event. **The
 * thing that sentence had to keep was the name**, and the name is in
 * the heading now (`PtvDriveScene.changeBay`), so the tail can go the
 * way any other overlong tail goes — see the drop in `drawPanel`.
 *
 * The band above the words is a name row, an animal, and the word for
 * what that animal is feeling — so the panel takes everything the
 * column has up to `PANEL_FACES_MAX` and the animal gets what is left
 * once the two rows of type are paid for. A panel too short for
 * `PANEL_FACES_MIN` — the landscape phone, where the whole column is
 * about 98px — draws no band at all and falls back to the carried
 * animal in the corner, as it did before; there the feeling's word
 * goes back into the heading, which is the only place left for it.
 */
const PANEL_TEXT_H = 34 + 4 * 27;
const PANEL_FACES_MIN = 62;
/**
 * How tall the band may grow when the column has height going spare.
 *
 * The animals waiting are a strip across the bottom at every viewport
 * now, so nothing sits under the panel and the reading column would
 * otherwise end level with its own copy — leaving a band of gravel
 * under a panel that stopped short, beside a vehicle that did not.
 * Marcus's rule for two columns of unequal height is that the shorter
 * one gets a purposeful element, not empty space, and the purposeful
 * element here is obvious: the animals the panel is talking about,
 * drawn bigger. Nothing else on this screen is a better use of the
 * height.
 */
const PANEL_FACES_MAX = 168;

/**
 * The panel's own two paddings, and why they are not the same number.
 *
 * **More space below the content than above it, always, or the panel
 * looks unfinished.** Marcus's rule, and the panel was failing it in
 * both of its shapes. On a roomy plate the heading sat `CHROME.padY`
 * plus four pixels from the top and the fourth line of copy ended
 * `CHROME.padY` less four from the bottom — 16 above against 8 below,
 * inverted by the stray four pixels nobody had written down a reason
 * for. On the landscape phone it was 8 above against 2.5 below, which
 * is the squeeze: the plate is 136.5 where its copy wants 134.
 *
 * So the budget names the two paddings separately and the lower one is
 * the larger, `drawPanel` lays the content out against them, and the
 * stray four pixels are gone rather than quietly inverting the rule.
 * `SPACE.s` is the step between them, which is the smallest difference
 * on the scale that reads as deliberate.
 */
const PANEL_PAD_TOP = CHROME.padY;
const PANEL_PAD_BOTTOM = CHROME.padY + SPACE.s;
/**
 * The same pair on a plate too short for its copy, where both of them
 * are one step down the scale — see `PANEL_TIGHT_H`.
 */
const PANEL_TIGHT_PAD_TOP = SPACE.s;
const PANEL_TIGHT_PAD_BOTTOM = SPACE.m;
/** The copy on a tight plate: a 26px heading and five closed-up lines. */
const PANEL_TIGHT_COPY_H = 26 + 5 * 20;

/**
 * The whole panel, as its longest copy wants it: a band of faces, then
 * the heading and four lines, with more paper under the words than over
 * them.
 */
const PANEL_WANTED_H = PANEL_PAD_TOP + PANEL_FACES_MAX + SPACE.s
  + PANEL_TEXT_H + PANEL_PAD_BOTTOM;

/**
 * The least paper that copy can be set on, measured rather than
 * guessed.
 *
 * `drawPanel` closes the leading and the padding up on a plate shorter
 * than `CHROME.padY * 2 + PANEL_TEXT_H` — the landscape phone, where
 * there is nothing to take the height from. The type size does not
 * move; that is the one thing on this screen that is not negotiable.
 *
 * **Five lines, not four.** `PANEL_TEXT_H` counts four because four is
 * what the longest copy takes at the desktop column; at the narrow one
 * the same words take five, and the panel has been running its last
 * line off the bottom of its own paper on the landscape phone ever
 * since. Measured in Chrome at 874x402: `SPACE.s` above the heading,
 * a 22px heading, the body starting 26px below the heading's top, and
 * 20px a line closed up.
 *
 * **And `SPACE.m` under it rather than `SPACE.s`**, which is the
 * more-space-below rule applied here as well: it was 8 and 8, and a
 * plate given exactly 8 and 8 and then squeezed to 136.5 spent the
 * shortfall on the bottom padding alone, which is where the 2.5px came
 * from. 146 is what the copy asks for; where the screen cannot give it,
 * `drawPanel` keeps the larger share underneath anyway.
 */
const PANEL_TIGHT_H = PANEL_TIGHT_PAD_TOP + PANEL_TIGHT_COPY_H + PANEL_TIGHT_PAD_BOTTOM;

/**
 * The air the panel leaves above its contents and below them, on a
 * plate of this height.
 *
 * **More space below than above, at every plate size** — Marcus's rule,
 * and the point of this being a function rather than two constants.
 * Where the plate has what the copy asks for, `above` is its own number
 * and `below` keeps the rest, which is larger. Where it has less — the
 * landscape phone, where neither the vehicle nor the tray has a pixel
 * to give — both come down in the same proportion and the larger is
 * still the one underneath. Where the plate is shorter than the copy
 * itself, `above` goes to nothing, so every pixel there is lands under
 * the words rather than over them; `below` is then negative, which is
 * the copy overrunning the paper and is reported as such rather than
 * hidden.
 *
 * `tight` is the same plate being too short for the leading as well as
 * the padding, which is what closes the lines up.
 *
 * Pure, and exported, so a test can hold the rule at every viewport.
 * The arrow plates in `car-park.ts` run the same arithmetic on their own
 * two numbers (`arrowPlatePadding`); the two plates share no code.
 */
export function panelPadding(boxH: number, bandH = 0): {
  above: number;
  below: number;
  tight: boolean;
  copyH: number;
} {
  const tight = boxH < PANEL_PAD_TOP + PANEL_PAD_BOTTOM + PANEL_TEXT_H;
  const wantTop = tight ? PANEL_TIGHT_PAD_TOP : PANEL_PAD_TOP;
  const wantBottom = tight ? PANEL_TIGHT_PAD_BOTTOM : PANEL_PAD_BOTTOM;
  const copyH = tight ? PANEL_TIGHT_COPY_H : PANEL_TEXT_H;
  const slack = boxH - bandH - copyH;
  const above = Math.max(0, Math.min(
    wantTop,
    Math.round((slack * wantTop) / (wantTop + wantBottom)),
  ));
  return { above, below: slack - above, tight, copyH };
}

/**
 * Whether the plate is shorter than the copy the panel would put on it,
 * and so shows the short form of its copy instead — see `CompactCopy`.
 *
 * **The same condition `panelPadding` reports as `below < 0`**: the plate
 * is shorter than the closed-up copy itself, `PANEL_TIGHT_COPY_H`. It is
 * derived rather than chosen, and it lands where the screen needs it to.
 * At 812pt the plate is 109.5 in the Capacitor app and 59.5 in the Home
 * Screen web clip, and the copy wants 126, so both are compact. The 874
 * wide phone's plate is 137 and holds the copy whole, so it keeps it,
 * and so does every taller screen.
 *
 * Measured on the plate and not on the width, because height is what
 * ran out: a plate that holds the copy is given the copy.
 */
export function panelIsCompact(boxH: number): boolean {
  return boxH < PANEL_TIGHT_COPY_H;
}

/**
 * What a compact plate holds: a heading's slot, and one closed-up line.
 *
 * The slot is there whether or not there is a line under it, so the
 * heading stands in one place on a plate and does not hop as a pointer
 * crosses from a pair with a remedy to a pair with none.
 */
const PANEL_COMPACT_COPY_H = 26 + 20;

/**
 * The air a compact plate leaves above its heading and below its line,
 * with the larger share underneath.
 *
 * The roomy plate's own two numbers, 12 above and 20 below, run as a
 * proportion and capped above at 12 — the rule `panelPadding` applies,
 * with the compact copy's height in place of the long copy's. On the
 * 59.5px web clip that is 5 above and 8.5 below; on the 109.5px app
 * plate it is 12 above and 51.5 below, which is the plate's own height
 * given to it and not a gap to fill. Pure, so a test holds it at every
 * plate height.
 */
export function compactPanelPadding(boxH: number): {
  above: number;
  below: number;
  copyH: number;
} {
  const slack = boxH - PANEL_COMPACT_COPY_H;
  const above = Math.max(0, Math.min(
    PANEL_PAD_TOP,
    Math.round((slack * PANEL_PAD_TOP) / (PANEL_PAD_TOP + PANEL_PAD_BOTTOM)),
  ));
  return { above, below: slack - above, copyH: PANEL_COMPACT_COPY_H };
}

/**
 * What a plate of this height can hold above its words: whether it draws
 * the picture band at all, and whether the band has the room for the word
 * under each animal.
 *
 * **A compact plate never has a band, and a band never has a compact
 * plate.** That is the invariant the reaction word under each animal was
 * fixed to keep: the word belongs to the animal feeling it and is drawn
 * under her, and where there is no band to draw her in, the heading is
 * the only place the word can go and nobody is above it to be taken for
 * the one who feels it. The short form is therefore only ever shown
 * where no animal stands over the heading. A test holds it at every
 * plate height.
 */
export function panelBand(boxH: number): {
  tight: boolean;
  copyH: number;
  facesH: number;
  showFaces: boolean;
  showReactions: boolean;
} {
  const { tight, copyH } = panelPadding(boxH);
  const facesH = Math.min(
    PANEL_FACES_MAX,
    boxH - (tight ? PANEL_TIGHT_PAD_TOP : PANEL_PAD_TOP)
      - (tight ? PANEL_TIGHT_PAD_BOTTOM : PANEL_PAD_BOTTOM) - SPACE.s - copyH,
  );
  const showFaces = facesH >= PANEL_FACES_MIN;
  return {
    tight,
    copyH,
    facesH,
    showFaces,
    // Whether the band has room for the word under each animal as well
    // as the name above it. Decided once, from the geometry, so it is
    // the same answer for every copy the panel shows while it stands
    // there — the alternative is a band whose animals change size as a
    // pointer crosses the bays.
    showReactions: showFaces && facesH - NAME_ROW_H >= REACTION_ROW_H + 40,
  };
}

/**
 * Below this a bay cannot carry a name row without the name taking more
 * of the bay than the crate in it. Big Tilly's nine bays are the case —
 * 40 wide by 54 deep, where a 20px name row would leave a 34px crate
 * with a 19px animal inside it. Her names live in the panel instead.
 *
 * It was 46, measured when a bay held a bare animal sprite and the name
 * came off the sprite's own slack. A crate has no slack: what the name
 * takes, the animal loses twice over, once for the rim and once for the
 * floor inside it.
 */
const BAY_NAME_MIN_H = 60;
/**
 * Below this the animal is drawn on her own rather than in her crate.
 *
 * Under about 32px the rim is most of what is left and the animal on
 * the floor inside stops being anybody in particular — and who she is
 * is the thing a child is reading. One rule for both places, measured
 * on the drawn art rather than on the box it sits in, because the box
 * runs out on different axes in each: a bay is pinched for width, and
 * a tray chip in the landscape-phone strip is pinched for height.
 *
 * Every bay in the fleet clears it, Big Tilly's nine included — the
 * load where matching crates matters most. What does not clear it is
 * that bottom strip on a short viewport, and the no-texture fallback,
 * where bays are sized off the raw box.
 *
 * **It was 32 and came down to 24 when `CRATE_FLOOR` went up.** The
 * threshold is a statement about how much animal is left once the rim
 * has taken its share, and the rim's share just fell from 44% of the
 * crate to 22%: a 32px crate used to leave 18px of animal and now
 * leaves 25px, so the size at which the animal stops being anybody in
 * particular moved down with it. 24px of crate is 19px of animal,
 * which is about where the old number sat.
 */
const CRATE_ART_MIN = 24;

export interface CrateLoadingCallbacks {
  /** A loose animal was tapped, or dragged off the floor — pick it up. */
  onHoldFromTray: (animalId: string) => void;
  /** A loaded bay was tapped — lift that animal out into the child's hands. */
  onLiftFromSlot: (slotIndex: number) => void;
  /**
   * The held animal goes into this crate — the first of the two stages.
   *
   * Reached by dragging a loose animal onto a crate on the shelf, and
   * by tapping the crate while holding her. Any crate is accepted; the
   * screen says what would have suited.
   */
  onPutInCrate: (animalId: string, crateType: CrateType) => void;
  /** An empty bay was tapped or dropped into while holding a crate. */
  onPlaceInSlot: (slotIndex: number) => void;
  /**
   * A space was asked for before a crate was chosen.
   *
   * The second stage cannot happen before the first, and this is how
   * the screen says so — calmly, in the panel, naming the animal and
   * the crate she needs. It is the same shape as a refused bay: the
   * owner sets a notice and redraws, nothing is lost, and the next tap
   * can be anywhere.
   */
  onNeedCrate: () => void;
  /** The held animal goes back on the floor, out of her crate. */
  onPutBack: () => void;
  /**
   * An arrow beside the vehicle was pressed: load that vehicle instead.
   *
   * **Nothing has changed when this fires.** The owner runs
   * `changeVehicle(session, to)` from `@arc/game-logic` — which keeps
   * what fits in grid order, sends the rest back to the waiting area,
   * names them, and never seats anybody beside somebody who frightens
   * them — keeps its own record of the vehicle, and redraws. `direction`
   * is which arrow it was, for anything that wants to know; the loading
   * screen's own wiring does not.
   */
  onVehicleChange: (to: VehicleType, direction: VehicleDirection) => void;
  /**
   * Show another page of the animals waiting to board.
   *
   * Only ever fires where more are waiting than stand on one page — see
   * `drawWaitingPager`. The owner stores the number and redraws; the
   * view works out which page that is, and clamps it, so an owner that
   * simply increments can never land on a page that is not there.
   */
  onWaitingPage: (page: number) => void;
  /** Everything is loaded and the vehicle may set off. */
  onSetOff: () => void;
  onBack: () => void;
}

export interface CrateLoadingState {
  session: LoadingSession;
  vehicle: VehicleDef;
  /** Where the van is going, already in title case. */
  destinationName: string;
  /**
   * The full animal records, by id, for the painted sprites.
   *
   * `LoadableAnimal` is the three fields the rules need; drawing an
   * animal needs its variant and its state as well, and that is the
   * caller's record rather than something the rules should carry.
   */
  animalsById: Map<string, Animal>;
  /**
   * The player's level, so the vehicle arrows skip the vehicles she has
   * not unlocked. Omit to offer the whole fleet.
   */
  playerLevel?: number;
  /**
   * Which page of the animals waiting to board is showing.
   *
   * Zero, and absent, on every screen wide enough for all of them. See
   * `drawWaitingPager` for why there are pages at all and why they are
   * turned by a tap rather than by a drag.
   */
  waitingPage?: number;
  /**
   * What just happened, if the child needs telling — a refused bay, or
   * an empty van asked to set off. Shown instead of the standing
   * message until the next tap, and never on a timer.
   */
  notice?: {
    level: CompatibilityLevel | null;
    text: string;
    /**
     * The panel's heading for this notice, where the default is wrong
     * for the event.
     *
     * A notice with no feeling and no animal is headed "Wait a Moment",
     * which is right for an empty vehicle asked to set off and wrong for
     * a vehicle change — nobody is being asked to wait, the animals have
     * gone back to the floor and the heading should say so. Already in
     * title case: the panel does not touch it.
     */
    heading?: string;
    /** The refusal was about one of them being poorly. */
    needsQuiet?: boolean;
    /**
     * The two animals the refusal was about, so the panel can draw
     * them. Absent for a notice with no pair in it — an empty van
     * asked to set off.
     */
    pair?: { animalId: string; neighbourId: string };
    /**
     * One animal the notice is about, where it is not about a pairing
     * — a crate chosen for her, or a space asked for before one was.
     *
     * Ignored when `pair` is set; a notice is about two animals or
     * about one, never both.
     */
    animalId?: string;
  } | null;
}

/** Somebody the panel is drawing, and the face they are wearing. */
interface CastMember {
  id: string;
  name: string;
  /** Sprite state, or undefined to let the sprite layer derive it. */
  face?: string;
  /**
   * The word for what *this* animal is feeling, drawn under her.
   *
   * **The feeling belongs to the animal feeling it.** The panel used to
   * carry one word for the pair, set as its heading above the picture,
   * and the heading sits directly under the left-hand animal's name —
   * so a screen reading "Misty / [cat] [hedgehog] / Worried" said the
   * cat was worried when the sentence underneath said the hedgehog was.
   * Marcus caught it on 2026-10-09: "we have worried but oh Misty, but
   * in fact it's the hedgehog that is worried".
   *
   * So the word is per animal now and it sits under her, and the
   * heading drops it rather than saying it twice. Undefined for an
   * animal with nothing to report — the cause of somebody else's worry
   * is not worried, and labelling her "Calm" would be a word a child
   * has to read to learn nothing.
   */
  reaction?: Mood;
}

/**
 * Who the panel draws above its words.
 *
 * **The picture is the panel now, and the sentences sit under it.** It
 * was three lines of prose, which a child who cannot read fluently
 * cannot use and a child who is learning will not try: a block of text
 * is a wall before it is a sentence. So the two animals the sentence is
 * about are drawn large, side by side, wearing the faces the sentence
 * gives them, and the words say the same thing underneath for the
 * children who can read them and the ones who are getting there.
 *
 * An empty `members` is the empty van — there is nobody to draw, and
 * the panel shows the hole they would go in instead of dropping back
 * to a wall of text the moment it has no animals.
 */
interface PanelCast {
  members: CastMember[];
  /** The glyph between them, where the two are neighbours. */
  level?: Mood;
  /**
   * They are aboard but not beside each other — drawn with the van's
   * floor between them, which is the picture of "nobody has a
   * neighbour to mind".
   */
  apart?: boolean;
}

/** Lines the panel shows, and which feeling (if any) it is reporting. */
interface PanelCopy {
  heading: string;
  /**
   * The feeling this copy is about. It tints the heading's ink *and*
   * the panel's whole surface, so a child reading across the screen
   * sees the same four colours on the glyphs, on the bays and on the
   * paper the sentence is printed on.
   */
  tone: Mood | null;
  body: string[];
  /**
   * Which body line is the takeaway — the one sentence to leave with,
   * set bold.
   *
   * Zero by default, because in nearly every branch the first line is
   * the fact and the second is what to do about it. It is overridden
   * where line 0 is a *negation*: Marcus's rule is that the boldest
   * thing on a page says what something is, never what it is not, so
   * "Nobody is sitting next to anybody" is set plain and the line that
   * says what to do is bolded instead. `null` bolds nothing.
   */
  boldLine?: number | null;
  cast?: PanelCast;
  /**
   * What this copy says on a plate too short for it — see
   * `panelIsCompact`. Absent means the copy has no short form and is set
   * as it is, which is where it was before there was one.
   */
  compact?: CompactCopy;
}

/**
 * The short form of a piece of panel copy: the heading, and under it
 * either the one line that says what would help or nothing at all.
 *
 * **Never a sentence about who feels what.** On a plate this short the
 * panel has no picture band, so the faces on the animals in the vehicle
 * and the word in the heading carry that, and the one line says only
 * what would help. A pair with nothing to put right has an empty body:
 * its heading and its colour are the whole report.
 */
interface CompactCopy {
  heading: string;
  tone: Mood | null;
  /** Nothing, or exactly one line. */
  body: string[];
}

/**
 * One animal, for the panel.
 *
 * A patient looks like one wherever she is drawn — in your hands, on
 * the floor, under the pointer — unless the caller has a louder face
 * to give her, which only a blocked pair ever does. And she carries the
 * blue word with her: a poorly animal needs a quiet space whoever she
 * is sitting next to, which is the one thing a vet run is about.
 */
function castOne(animal: LoadableAnimal, face?: string, reaction?: Mood): CastMember {
  return {
    id: animal.id,
    name: animal.name,
    face: face ?? (animal.poorly ? FACE_SICK : undefined),
    reaction: reaction ?? (animal.poorly ? 'quiet' : undefined),
  };
}

/**
 * The two animals a note is about, each wearing what the note gives
 * them — the face, and the word under it.
 *
 * **Both come from `affectedBy`, which is the point.** The face and the
 * word are two readings of one fact, so they are taken from one
 * function: the animal drawn frightened is the animal the word
 * "Frightened" sits under, and neither can drift from the sentence
 * because `affectedBy` reads the direction off the sentence itself.
 *
 * A pair that is only stressed because one of them is unwell gives the
 * blue word to the patient and nothing to her neighbour — the need is
 * hers, and the animal beside her is being asked to give space rather
 * than being told she minds.
 */
function castPair(session: LoadingSession, note: AdjacencyNote): PanelCast | undefined {
  const pair = pairOf(session, note);
  if (!pair) return undefined;
  const [faceA, faceB] = pairFaces(note, pair);
  const [feelA, feelB] = pairReactions(note, pair);
  return {
    members: [castOne(pair[0], faceA, feelA), castOne(pair[1], faceB, feelB)],
    level: moodOf(note),
  };
}

/**
 * What the panel says about one pair on a plate with room for a heading
 * and one line: the feeling's word, and what would help.
 *
 * **Marcus's decision, 2026-10-09: at the narrowest plates the panel
 * says the remedy only.** The plate is 109.5px in the Capacitor app and
 * 59.5 in the Home Screen web clip against copy that wants 126, and
 * every other lever was already down. Who feels what is carried by the
 * faces on the animals in the vehicle and by the word in the heading;
 * the line says what would help and nothing else. His reason is his own
 * rule: people look at the picture before the caption and often never
 * read it, and the expression system was built so that a child who
 * cannot read never needs the sentence.
 *
 * - **A pair with something to put right** — one-sided friction, mutual
 *   friction, a patient beside a well animal, a pair the rules refuse —
 *   gets its feeling's word and the pair's `remedy`.
 * - **A pair with nothing to put right** gets its heading and nothing
 *   under it. A remedy invented for a happy pair would send a child to
 *   rearrange something the rules are satisfied with, and a line that
 *   repeated the heading would be a caption restating its title.
 * - **Two patients side by side** read "Needs Quiet", in blue. The
 *   engine calls them happy because neither minds the other, but both
 *   are drawn looking poorly, and with no band to put a word under each
 *   of them the heading is the only place the word can go — "Happy" on
 *   a green plate above two poorly animals is the fault `pairReactions`
 *   was written to remove. They are not told to separate: the rules
 *   have no objection to them and nor does this.
 *
 * Plain rather than bold. The bold weight is 7% wider, and the longest
 * remedy is 208px against the 216 the narrowest column has: set bold it
 * would take a second line the plate does not have. The heading above it
 * is already bold, and one line is not dense text.
 */
export function compactCopyFor(
  note: AdjacencyNote,
  pair: [LoadableAnimal, LoadableAnimal] | null,
): CompactCopy {
  if (note.level === 'happy') {
    const patients = pair !== null && Boolean(pair[0].poorly) && Boolean(pair[1].poorly);
    const mood: Mood = patients ? 'quiet' : 'happy';
    return { heading: MOOD_WORD[mood], tone: mood, body: [] };
  }
  const mood = moodOf(note);
  return {
    heading: MOOD_WORD[mood],
    tone: mood,
    body: note.remedy ? [note.remedy] : [],
  };
}

/**
 * The word under each of a pair — who feels what, for this pair alone.
 *
 * The sibling of `pairFaces`, off the same `affectedBy`, so the picture
 * and the label can never disagree about who minds.
 *
 * - **A happy pair**: both, because being glad of each other is a thing
 *   both of them are doing.
 * - **A pair that needs quiet**: the patient alone, and the blue word,
 *   which says what she needs rather than what anybody minds.
 * - **Worried or frightened**: whoever the sentence says feels it,
 *   which is one of them or both.
 */
export function pairReactions(
  note: AdjacencyNote,
  pair: [LoadableAnimal, LoadableAnimal],
): [Mood | undefined, Mood | undefined] {
  if (note.needsQuiet && note.level !== 'blocked') {
    return [
      pair[0].poorly ? 'quiet' : undefined,
      pair[1].poorly ? 'quiet' : undefined,
    ];
  }
  if (note.level === 'happy') {
    // Two patients side by side mind each other not at all, which the
    // engine calls happy — but they are both drawn looking poorly, and
    // "Happy" under a poorly animal is the wrong word for the right
    // fact. Each keeps the word for what she needs.
    return [
      pair[0].poorly ? 'quiet' : 'happy',
      pair[1].poorly ? 'quiet' : 'happy',
    ];
  }
  const hit = affectedBy(note, pair);
  return [
    hit.has(pair[0].id) ? note.level : undefined,
    hit.has(pair[1].id) ? note.level : undefined,
  ];
}

interface Box { x: number; y: number; w: number; h: number }

/**
 * A label that always fits its box.
 *
 * Animal names run from "Pip" to "Clementine", and a name wider than
 * its bay would either overhang into the neighbour's or have to be
 * drawn below the 16px floor. Neither is acceptable, so an over-long
 * name is shortened — and the full name is still in the panel sentence
 * whenever that animal is part of one.
 */
function fitLabel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  name: string,
  maxWidth: number,
  style: Phaser.Types.GameObjects.Text.TextStyle,
): Phaser.GameObjects.Text {
  const text = scene.add.text(x, y, name, style).setOrigin(0.5);
  if (text.width <= maxWidth) return text;
  for (let keep = name.length - 1; keep >= 1; keep -= 1) {
    text.setText(`${name.slice(0, keep)}…`);
    if (text.width <= maxWidth) break;
  }
  return text;
}

// ── Who feels what ───────────────────────────────────────────

/**
 * The two names an `AdjacencyNote` is about, in the order the rules
 * wrote them.
 */
export function pairOf(
  session: LoadingSession,
  note: AdjacencyNote,
): [LoadableAnimal, LoadableAnimal] | null {
  const a = animalById(session, note.animalId);
  const b = animalById(session, note.neighbourId);
  return a && b ? [a, b] : null;
}

/**
 * Which of a pair the note says is the one who feels it.
 *
 * **Read off the sentence rather than worked out again here, and
 * deliberately.** `describePair` already decides the direction — it
 * ranks the species by how much they alarm the others and makes the
 * bolder one the subject — but the note it hands back carries only the
 * two ids and the level, so the view has to recover it somehow. The
 * two candidates were to re-rank the species in this file or to read
 * the sentence the child is being shown, and the sentence wins: a
 * second copy of the ranking could drift, and the day it drifted the
 * screen would show a frightened face beside a sentence naming the
 * other animal as the frightened one. Teaching a child the wrong
 * animal is afraid of the wrong animal is the one failure this whole
 * change exists to avoid.
 *
 * `describePair` writes exactly three shapes, and this reads all
 * three: "A and B are happy next to each other" (nobody feels
 * anything), "A makes B worried/frightened" (B feels it), and the
 * equal-rank "A and B make each other worried" / "frighten each other"
 * (both feel it). `crate-loading-view.test.ts` pins the reading
 * against the live `describePair` for every pair of species, so a
 * reworded sentence fails a test rather than mislabelling a face.
 */
export function affectedBy(
  note: AdjacencyNote,
  pair: [LoadableAnimal, LoadableAnimal],
): Set<string> {
  if (note.level === 'happy') return new Set();
  const [a, b] = pair;
  const named = (x: LoadableAnimal) => `${x.name} the ${x.species}`;
  if (note.text.startsWith(`${named(a)} makes `)) return new Set([b.id]);
  if (note.text.startsWith(`${named(b)} makes `)) return new Set([a.id]);
  // Equally alarming to each other — the sentence says "each other",
  // and so does the picture.
  return new Set([a.id, b.id]);
}

/**
 * How one animal feels about the neighbours she actually has — the
 * worst of it, and only where she is the one affected.
 *
 * **Worst wins, because `previewPlacement` already says so.** The
 * engine takes the worst level among a slot's neighbours when it
 * decides whether a placement is allowed, and a face that averaged its
 * neighbours instead would disagree with the rule the child is being
 * taught. Frightened beats worried beats happy.
 *
 * Null for an animal with nobody beside her, and for one who is only
 * ever the *cause* — a dog who alarms the cat next door is not himself
 * alarmed, and painting him worried would say he was.
 */
export function gridFeeling(session: LoadingSession, animalId: string): CompatibilityLevel | null {
  let worst: CompatibilityLevel | null = null;
  for (const note of settledNotes(session)) {
    if (note.animalId !== animalId && note.neighbourId !== animalId) continue;
    const pair = pairOf(session, note);
    if (!pair) continue;
    // A pair that is only stressed because one of them is unwell
    // gives neither of them a feeling: the patient shows sick and the
    // neighbour shows calm. Counting it as stress here would have put
    // a scowl on the well animal, which is the one face this change
    // exists to prevent.
    if (note.needsQuiet && note.level !== 'blocked') continue;
    if (note.level === 'happy') {
      worst ??= 'happy';
      continue;
    }
    if (!affectedBy(note, pair).has(animalId)) continue;
    if (note.level === 'blocked') return 'blocked';
    worst = 'stressed';
  }
  return worst;
}

/**
 * The sprite state an animal in the grid is drawn in.
 *
 * Undefined for an animal with nobody beside her, which leaves
 * `createAnimalSprite` to derive the state as it does everywhere else
 * — so an animal who is poorly still looks poorly right up until a
 * neighbour gives the screen something louder to report.
 *
 * An animal who *has* a neighbour always gets a face, even when that
 * face is "fine": she is in the picture the panel may be drawing of
 * this pair, and the two have to match.
 */
export function gridFace(session: LoadingSession, animalId: string): string | undefined {
  // **Poorly outranks everything, neighbours included.** The one
  // thing a vet run exists to show stays visible however the load is
  // arranged, and it is the only honest answer besides: an animal
  // that is unwell is not worried or frightened, it is unwell.
  if (animalById(session, animalId)?.poorly) return FACE_SICK;

  const mine = settledNotes(session).filter(
    (n) => n.animalId === animalId || n.neighbourId === animalId,
  );
  if (mine.length === 0) return undefined;

  const feeling = gridFeeling(session, animalId);
  if (feeling === 'blocked' || feeling === 'stressed') return FACE_AFFECTED[feeling];

  // Beside somebody who is unwell: calm, and never `playing`, even
  // with a friend of its own kind on the other side. A picture of fun
  // being had next to a patient is the wrong lesson at the moment the
  // screen is asking the child to give that patient some room.
  if (mine.some((n) => n.needsQuiet && n.level !== 'blocked')) return FACE_CALM;

  return feeling ? FACE_AFFECTED[feeling] : FACE_CALM;
}

/**
 * The two faces for one note — who looks how, for this pair alone.
 *
 * The panel illustrates one sentence, so it asks about one pair; the
 * bays illustrate the whole load, so they ask `gridFace` about every
 * neighbour at once. Both go through `affectedBy`, which is what keeps
 * the panel and the bay from ever disagreeing about who is frightened.
 */
export function pairFaces(
  note: AdjacencyNote,
  pair: [LoadableAnimal, LoadableAnimal],
): [string, string] {
  // Poorly beats every social face, here as in the bays — and the
  // well animal beside a patient is drawn *content*, not recoiling.
  // The screen says "this one needs a quiet space", and a neighbour
  // pulling a face would say the opposite thing about the same pair.
  const sickAware = (a: LoadableAnimal, face: string): string => (
    a.poorly ? FACE_SICK : face
  );

  if (note.needsQuiet && note.level !== 'blocked') {
    return [sickAware(pair[0], FACE_CALM), sickAware(pair[1], FACE_CALM)];
  }
  if (note.level === 'happy') {
    return [
      sickAware(pair[0], FACE_AFFECTED.happy),
      sickAware(pair[1], FACE_AFFECTED.happy),
    ];
  }
  const hit = affectedBy(note, pair);
  const face = FACE_AFFECTED[note.level];
  return [
    sickAware(pair[0], hit.has(pair[0].id) ? face : FACE_CALM),
    sickAware(pair[1], hit.has(pair[1].id) ? face : FACE_CALM),
  ];
}

/**
 * How much of a painted crate the animal is drawn across.
 *
 * **It was 0.56, the crate's clear floor, and that was the wrong
 * measurement.** The clear floor is real — measured off the files as
 * the largest centred square of unbroken cream, the warm vivarium has
 * 0.59, the secure crate 0.57, the standard 0.55, the quiet bed 0.53
 * and the round basket 0.47 — but it is the size of the *box*, not of
 * the animal in it, and the animal art carries a transparent margin of
 * its own. Measured across the eight species this screen loads, the
 * opaque part of a sprite runs 0.50 to 0.94 of its file: a bunny is
 * half her own picture. So a bunny drawn at 0.56 of her crate was
 * 0.28 of it, and in Big Tilly's 40px bays that is a ten-pixel bunny
 * inside a thirty-six-pixel box. Marcus is right that she is a speck,
 * and the arithmetic above is why.
 *
 * 0.78 sizes the *box* past the clear floor so the *animal* lands on
 * it. The species with tight art — the bunny at 0.50, the hedgehog at
 * 0.56 — come out comfortably inside the rim; the wide ones, the bat
 * at 0.92 and the snake at 0.92, now reach 0.72 of the crate against
 * an opening of 0.66 to 0.73 and tuck their edges a few pixels behind
 * the painted walls. That is not an overflow, it is an animal sitting
 * in a crate: the walls are nearer the camera than she is, so they are
 * in front of her, and the crate reads as holding her rather than as a
 * frame drawn round her.
 *
 * The perch carrier has no clear floor at all because its perch
 * crosses the middle, and a bird drawn over its perch is a bird
 * perching.
 */
const CRATE_FLOOR = 0.78;

/**
 * The crate an animal travels in, drawn — a painted crate when there is
 * one, the emoji on a cream disc when there is not.
 *
 * All six are installed in `assets/driving/crates/`, so the fallback is
 * now only reached if a file goes missing or a load fails: the full
 * game picks them up from the asset manifest by filename and the
 * `?ptvDemo=1` boot self-loads them. It stays because a crate is how a
 * child tells a snake's travel box from a bat's, and a screen that
 * drops that fact entirely on a failed fetch is worse than one that
 * falls back to a glyph.
 */
function makeCrateFace(
  scene: Phaser.Scene,
  x: number,
  y: number,
  crate: CrateDef,
  size: number,
): Phaser.GameObjects.Image | Phaser.GameObjects.Container {
  const key = `crate-${crate.id}`;
  if (scene.textures.exists(key)) {
    const img = scene.add.image(x, y, key).setOrigin(0.5);
    img.setScale(size / Math.max(img.width, img.height));
    return img;
  }

  const r = size / 2;
  const gfx = scene.add.graphics();
  gfx.fillStyle(CHROME.fill, CHROME.fillAlpha);
  gfx.fillCircle(0, 0, r);
  gfx.lineStyle(1.5, CHROME.stroke, CHROME.strokeAlpha);
  gfx.strokeCircle(0, 0, r);

  const glyph = scene.add.text(0, 0, crate.emoji, {
    fontSize: `${Math.round(size * 0.62)}px`,
    fontFamily: FONTS.body,
  }).setOrigin(0.5);

  return scene.add.container(x, y, [gfx, glyph]);
}

/**
 * An animal in the crate she travels in, drawn from above.
 *
 * One picture rather than two, and it is the picture the crates were
 * painted empty for: the animal sits *on the crate's floor*, inside the
 * rim, the way she will travel. It replaced an animal with a small
 * crate badge pinned to her shoulder, which said the same thing twice
 * and said neither of them at the size Big Tilly's bays run to.
 *
 * The same object in the tray and in the bay, so the thing a child taps
 * and the thing that lands in the van are visibly one object.
 *
 * Where there is no painted crate the badge comes back — the animal at
 * full size with the glyph in the corner, exactly as the screen drew it
 * before the art existed.
 */
function makeCratedAnimal(
  scene: Phaser.Scene,
  x: number,
  y: number,
  animal: Animal | undefined,
  crate: CrateDef,
  size: number,
  /** The face she wears, where her neighbours have given her one. */
  state?: string,
): Phaser.GameObjects.GameObject {
  const key = `crate-${crate.id}`;
  if (!scene.textures.exists(key)) {
    const fallback: Phaser.GameObjects.GameObject[] = [];
    if (animal) {
      fallback.push(createAnimalSprite(
        scene, 0, 0, animal, { width: size, height: size, stateOverride: state },
      ));
    }
    const badge = Math.round(size * 0.42);
    fallback.push(makeCrateFace(scene, -size / 2 + badge / 2, -size / 2 + badge / 2, crate, badge));
    return scene.add.container(x, y, fallback);
  }

  const children: Phaser.GameObjects.GameObject[] = [
    makeCrateFace(scene, 0, 0, crate, size),
  ];
  if (animal) {
    const inside = Math.round(size * CRATE_FLOOR);
    children.push(
      createAnimalSprite(
        scene, 0, 0, animal, { width: inside, height: inside, stateOverride: state },
      ),
    );
  }
  return scene.add.container(x, y, children);
}

// ── The vibe glyph ───────────────────────────────────────────

/**
 * One mark per feeling, and each one a different *shape*.
 *
 * A spiral for frightened — Marcus's "grrrr", a line winding tighter
 * and tighter — a zigzag for worried, and a heart for two animals who
 * are glad of each other. They were a tick, a bang and a cross in
 * three coloured discs, which was already shape-coded but read as
 * three buttons; these read as something somebody drew on the load
 * sheet, which is the register the rest of the screen is in.
 *
 * **Shape, not colour, carries it.** Roughly one boy in twelve cannot
 * tell the red from the green, and red/amber/green is the worst axis
 * in the world to hang a meaning on. Printed in grey these are still a
 * spiral, a zigzag and a heart.
 *
 * Ink and wash: the wash is a soft blob nudged down and right of the
 * line, the way a wet colour sits a little off its drawing, and the
 * line itself is drawn rather than set — no flat fills, no hard
 * geometric disc behind.
 */
function drawVibeGlyph(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  level: Mood,
  r: number,
): void {
  const skin = FEELING_SKIN[level];

  // The wash, off its line the way a wet colour is. Soft: it is there
  // to lift the line off whatever is behind it, not to be a disc.
  gfx.fillStyle(skin.fill, 0.72);
  gfx.fillCircle(x + r * 0.1, y + r * 0.12, r * 1.05);
  gfx.fillStyle(skin.fill, 0.45);
  gfx.fillCircle(x - r * 0.14, y - r * 0.12, r * 0.86);

  const w = Math.max(1.5, r * 0.22);
  gfx.lineStyle(w, skin.stroke, 1);

  if (level === 'blocked') {
    // A spiral, wound from the middle outwards — two and a bit turns,
    // which is enough to read as winding and few enough to stay open
    // at Big Tilly's size.
    const steps = 44;
    gfx.beginPath();
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const ang = t * 2.15 * Math.PI * 2;
      const rad = r * 0.78 * t;
      const px = x + Math.cos(ang) * rad;
      const py = y + Math.sin(ang) * rad;
      if (i === 0) gfx.moveTo(px, py);
      else gfx.lineTo(px, py);
    }
    gfx.strokePath();
    return;
  }

  if (level === 'quiet') {
    // A crescent moon: rest, and the one shape on this screen that
    // says it without saying anything is wrong. It is a closed curve
    // like the heart and a curve like the spiral, but nobody has ever
    // mistaken a crescent for either — cut one disc out of another
    // and the silhouette is unambiguous in grey, which is the test
    // all four of these have to pass.
    //
    // Drawn as one filled path rather than a disc with a disc punched
    // out of it, because the wash sits underneath and punching with a
    // background colour would punch through the wash too.
    //
    // The two arcs have to *meet*, which means solving for where the
    // circles cross rather than guessing the angles — the first
    // attempt swept both through the same angular range and came out
    // as a lopsided ring. `ix` is the radical line, `iy` the height
    // of the crossing, and the two arcs run from it in opposite
    // directions so the path closes on itself.
    const R = r * 0.86;
    const bite = R * 0.74;
    const d = R * 0.54;
    const ix = (d * d + R * R - bite * bite) / (2 * d);
    const iy = Math.sqrt(Math.max(0.0001, R * R - ix * ix));
    const outer = Math.atan2(iy, ix);
    const inner = Math.atan2(iy, ix - d);
    // Tilted, because an upright crescent reads as a bracket and a
    // tilted one reads as the moon.
    const tilt = -0.42;
    const cos = Math.cos(tilt);
    const sin = Math.sin(tilt);
    const put = (lx: number, ly: number, first = false) => {
      const px = x + lx * cos - ly * sin;
      const py = y + lx * sin + ly * cos;
      if (first) gfx.moveTo(px, py);
      else gfx.lineTo(px, py);
    };

    const steps = 26;
    gfx.beginPath();
    for (let i = 0; i <= steps; i += 1) {
      const a = outer + (i / steps) * (Math.PI * 2 - outer * 2);
      put(Math.cos(a) * R, Math.sin(a) * R, i === 0);
    }
    for (let i = 0; i <= steps; i += 1) {
      const a = (Math.PI * 2 - inner) - (i / steps) * (Math.PI * 2 - inner * 2);
      put(d + Math.cos(a) * bite, Math.sin(a) * bite);
    }
    gfx.closePath();
    gfx.fillStyle(skin.stroke, 0.26);
    gfx.fillPath();
    gfx.strokePath();
    return;
  }

  if (level === 'stressed') {
    // A zigzag: sharp where the spiral is round, so the two are still
    // apart with the colour taken away.
    const pts: Array<[number, number]> = [
      [-0.62, -0.62], [0.30, -0.26], [-0.30, 0.16], [0.62, 0.58],
    ];
    gfx.beginPath();
    pts.forEach(([ux, uy], i) => {
      const px = x + ux * r;
      const py = y + uy * r;
      if (i === 0) gfx.moveTo(px, py);
      else gfx.lineTo(px, py);
    });
    gfx.strokePath();
    return;
  }

  // Happy: a heart, drawn as a closed curve so it has a silhouette of
  // its own rather than being the third dot in a row of dots.
  const steps = 40;
  gfx.beginPath();
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * Math.PI * 2;
    const hx = 16 * Math.sin(t) ** 3;
    const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t)
      - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    const px = x + (hx / 17) * r * 0.82;
    const py = y + (hy / 17) * r * 0.82;
    if (i === 0) gfx.moveTo(px, py);
    else gfx.lineTo(px, py);
  }
  gfx.closePath();
  gfx.fillStyle(skin.stroke, 0.16);
  gfx.fillPath();
  gfx.strokePath();
}

/**
 * The glyph on its own, for a shared edge — or with its word under it,
 * for the live preview inside an empty bay.
 *
 * One mark means one thing: the preview a child reads before she taps
 * and the mark she reads afterwards are the same drawing, so she only
 * ever learns it once.
 */
function makeFeelingBadge(
  scene: Phaser.Scene,
  x: number,
  y: number,
  level: Mood,
  options?: { withWord?: boolean; radius?: number },
): Phaser.GameObjects.Container {
  const withWord = options?.withWord ?? false;
  const r = options?.radius ?? (withWord ? 17 : 13);

  const gfx = scene.add.graphics();
  drawVibeGlyph(gfx, 0, withWord ? -6 : 0, level, r);

  const children: Phaser.GameObjects.GameObject[] = [gfx];
  if (withWord) {
    children.push(
      scene.add.text(0, r + 7, MOOD_WORD[level], {
        fontSize: `${MIN_FONT.small}px`,
        fontFamily: FONTS.ui,
        fontStyle: 'bold',
        color: FEELING_SKIN[level].ink,
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5),
    );
  }
  return scene.add.container(x, y, children);
}

/**
 * Whether a settled pair earns a glyph on the edge they share.
 *
 * **Not every pair.** Nine bays have twelve shared edges, and a mark
 * on all twelve is a grid of marks: the ones that matter stop being
 * visible precisely because nothing is quiet. So the glyph is spent on
 * the three cases that are worth a child's attention —
 *
 *   frightened  always. The strongest mark on the screen.
 *   worried     always.
 *   happy, and the same species. Two bunnies side by side is the
 *               pairing the engine actually pays a bonus for, and a
 *               small good thing is worth noticing.
 *
 * — and a happy pair of different species gets nothing at all, because
 * most of the load is that and unremarkable is unremarkable.
 */
export function glyphWorthDrawing(
  session: LoadingSession,
  note: AdjacencyNote,
): boolean {
  // A patient beside a well animal always gets the crescent. The
  // restraint above is about pairs with nothing to say; this one is
  // the screen asking for something.
  if (note.needsQuiet) return true;
  if (note.level !== 'happy') return true;
  const pair = pairOf(session, note);
  return pair !== null && pair[0].species === pair[1].species;
}

/** Up to `limit` sentences, worst first. */
function sentences(notes: AdjacencyNote[], limit: number): string[] {
  return notes.slice(0, limit).map((n) => n.text);
}

/**
 * What the panel says when nothing has just happened.
 *
 * Holding an animal, it says whose turn it is and what the bays will
 * do. Holding nothing, it reads out the grid as it stands — one
 * sentence per pair of animals who can see each other, which is the
 * thing being taught, rather than a score for the load.
 */
function standingCopy(state: CrateLoadingState): PanelCopy {
  const { session } = state;
  const held = heldAnimal(session);

  if (held) {
    const chosen = heldCrateType(session);
    if (!chosen) {
      // **Stage one, and the panel asks the question.** It used to say
      // what she travelled in, because the screen had already decided;
      // now the child decides, so the line is the fact she decides on
      // — which crate suits this animal — and the next line is where
      // to do it.
      const best = crateDefFor(held.species).label.toLowerCase();
      return {
        heading: titleCase(`In your hands: ${held.name} the ${held.species}`),
        tone: null,
        body: [
          `${held.name} travels best in a ${best}.`,
          `Drag ${held.name} to a crate, or tap one.`,
        ],
        // No face forced on her: she is not next to anybody yet, and
        // if she is the poorly one on a vet run that is the thing to
        // show.
        cast: { members: [castOne(held)] },
      };
    }
    // Cream here too: a crate is not a neighbour. See `crateCopy`.
    const choice = describeCrateChoice(held, chosen);
    return {
      heading: titleCase(`In your hands: ${held.name} the ${held.species}`),
      tone: null,
      body: [
        choice.text,
        `Drag the crate to a space in ${state.vehicle.name}, or tap one.`,
      ],
      cast: { members: [castOne(held)] },
    };
  }

  const blockers = blockingNotes(session);
  if (blockers.length > 0) {
    return {
      heading: FEELING.blocked,
      tone: 'blocked',
      body: [...sentences(blockers, 1), 'Tap one of them to move them somewhere else.'],
      cast: castPair(session, blockers[0]),
      compact: compactCopyFor(blockers[0], pairOf(session, blockers[0])),
    };
  }

  const settled = settledNotes(session);
  if (settled.length > 0) {
    // `settledNotes` is sorted worst first, so the pair drawn is the
    // pair the first sentence is about — and because it is the worst
    // on the grid, nobody in it can be wearing a face the bays would
    // contradict.
    return {
      heading: MOOD_WORD[moodOf(settled[0])],
      tone: moodOf(settled[0]),
      body: sentences(settled, 1),
      cast: castPair(session, settled[0]),
      compact: compactCopyFor(settled[0], pairOf(session, settled[0])),
    };
  }

  if (aboard(session).length === 0) {
    return {
      heading: titleCase(`${state.vehicle.name} is empty`),
      tone: null,
      // The lesson, not the instruction: the arrow in the picture
      // above already says tap-then-tap, and the sentence a child
      // should leave this screen with is the one about neighbours.
      boldLine: 1,
      body: [
        // **No vehicle name in this line, and it is a line-break
        // decision.** "…then a space in Henry." is 52 characters and
        // breaks after "space", which splits "a space in Henry" across
        // two lines — a break inside a phrase, which is the fault
        // Marcus's typesetting rules name. Without it the sentence
        // fits the column whole, and which vehicle is in front of her
        // is not in doubt: the title says so and the vehicle is drawn
        // beside the words.
        'Pick an animal, then a crate, then a space.',
        'Animals only mind who is beside them, above them or below them.',
      ],
      // Nobody to draw, so the panel draws the hole they go in — the
      // same well the bays draw, which is the shape a child has just
      // been looking at nine of.
      cast: { members: [] },
    };
  }

  // "Nobody is worried", not "everyone is comfortable": the screen has
  // three words for how an animal feels and this is one of them. A
  // fourth would be a synonym a child has to learn on top of the thing
  // the screen is teaching.
  //
  // Drawn as two of the animals aboard with the floor between them,
  // which is the sentence: there is nobody beside anybody.
  return {
    heading: titleCase('Nobody is worried'),
    tone: null,
    // Line 0 is a negation twice over and may not be the bold one.
    boldLine: 1,
    body: [
      'Nobody is sitting next to anybody, so nobody has a neighbour to mind.',
      'Load another animal, or set off.',
    ],
    cast: { members: aboard(session).slice(0, 2).map((a) => castOne(a)), apart: true },
    // Nothing to report and so nothing to put right: the heading says
    // it, and a next step is not a remedy.
    compact: { heading: titleCase('Nobody is worried'), tone: null, body: [] },
  };
}

function panelCopy(state: CrateLoadingState): PanelCopy {
  if (state.notice) {
    const { notice } = state;
    const mood = notice.level
      ? moodOf({ level: notice.level, needsQuiet: notice.needsQuiet })
      : null;
    // A refusal is the moment a child most needs the picture, so the
    // notice carries who it was about and the two of them are drawn
    // exactly as any other pair.
    const pairNote: AdjacencyNote | undefined = notice.level && notice.pair
      ? {
        level: notice.level,
        slotIndex: -1,
        neighbourSlotIndex: -1,
        animalId: notice.pair.animalId,
        neighbourId: notice.pair.neighbourId,
        text: notice.text,
        // A refusal is the rules turning a pair down, which is the one
        // notice about a pair there is.
        remedy: notice.level === 'blocked' ? REMEDY.elsewhere : undefined,
      }
      : undefined;
    const pairCast = pairNote ? castPair(state.session, pairNote) : undefined;
    // A notice about one animal — a crate chosen for her, or a space
    // asked for before one was. She is drawn alone, wearing the word
    // the notice is reporting, because the news is about her and not
    // about a pairing.
    const solo = !notice.pair && notice.animalId
      ? animalById(state.session, notice.animalId)
      : undefined;
    return {
      // A notice about one animal and no feeling is a crate fact, and
      // it is named for her rather than headed "Wait a moment" — that
      // heading is for the two states with nobody in them, an empty
      // vehicle asked to set off and nothing to report.
      heading: notice.heading
        ?? (mood
          ? MOOD_WORD[mood]
          : titleCase(solo ? `${solo.name} the ${solo.species}` : 'Wait a moment')),
      tone: mood,
      body: [
        notice.text,
        notice.level === 'blocked' ? 'Try another space.' : nextStep(state),
      ].filter((l) => l.length > 0),
      cast: pairCast ?? (solo ? { members: [castOne(solo, undefined, mood ?? undefined)] } : undefined),
      compact: pairNote ? compactCopyFor(pairNote, pairOf(state.session, pairNote)) : undefined,
    };
  }
  return standingCopy(state);
}

/**
 * What to do next, in one line, for a notice that has just answered
 * something.
 *
 * Read off the stage rather than written into each notice: the sentence
 * after "Echo the bat travels best in a quiet crate." is the same
 * sentence whether a child got there by dragging, by tapping, or by
 * asking for a space too early, and it is the standing copy's own
 * instruction for the stage she is now in.
 */
function nextStep(state: CrateLoadingState): string {
  const held = heldAnimal(state.session);
  if (!held) return '';
  return loadStage(state.session) === 'pick-a-crate'
    ? `Tap a crate for ${held.name}.`
    : `Tap a space in ${state.vehicle.name} to put ${held.name} down.`;
}

// ── The page grid, and the two shapes it takes ───────────────

/**
 * The least height any vehicle in the fleet needs to stand whole with
 * her bays at the tap floor, and the most width any of them needs for
 * the same.
 *
 * **Both are facts about the fleet and not about the screen**, which is
 * what makes them usable as breakpoints: the layout must not change
 * shape when the arrows change the vehicle, or a child pressing one
 * would have the whole screen re-flow under her hand. So the decision
 * is taken once, against the whole fleet.
 *
 * The height is Henry's 255 — he is the shortest requirement, so a
 * column that cannot hold him cannot hold anybody. The width is Bea's
 * 132: her bed is the narrowest share of her body in the fleet (0.58),
 * so two 40px bays across cost her more drawn width than they cost
 * anyone else, and a column that gives her 132 gives every vehicle her
 * bays. Measured off `minScaleForBays`, the same formula `fitLoadBed`
 * grows an under-boxed vehicle with, so the three cannot disagree.
 */
const FLEET_MIN_WHOLE_H = Math.min(
  ...Object.values(VEHICLE_DEFS).map((v) => wholeVehicleHeight(v.id, v.cols, v.rows)),
);
const FLEET_WHOLE_W = Math.max(
  ...Object.values(VEHICLE_DEFS).map((v) => {
    const sprite = VEHICLE_BED_SOURCE[v.id];
    return sprite.w * minScaleForBays(sprite, VEHICLE_BED[v.id], v.cols, v.rows);
  }),
);

/**
 * How wide the car park's column is on a short viewport: the widest any
 * vehicle has to be drawn, with room for an arrow either side of her.
 *
 * On a short viewport every pixel of width that is not the vehicle or
 * her arrows is worth more to the reading column and the crates, so the
 * vehicle is drawn at the smallest size her bays allow and no larger.
 * That is the opposite of the tall layout, where she is fitted to
 * whatever the column has and her bays grow with it.
 */
const PARK_SHORT_W = Math.round(FLEET_WHOLE_W + 2 * (ARROW_W + ARROW_GAP));

/**
 * The crate rack's width on a short viewport: two crates at the tap
 * floor with a gap between them.
 *
 * **The crates are the reason the short layout has a third column.**
 * Six of them need either 328px of width in one row or 160x104 in two,
 * and on a landscape phone the reading column's own band has neither —
 * a shelf squeezed into it comes out at 27px a crate, which is under
 * the tap floor twice over: the drawn crate is smaller than a finger
 * and the 48px hit boxes of two neighbours overlap by 13px, so a tap
 * near the edge of one answers for the next. Standing them up in a
 * column of their own is what keeps all six at the floor.
 *
 * 104 is two crates and a gap — enough for `fitChipGrid` to choose two
 * across by three down, which is the arrangement that keeps the drawn
 * crate largest, and enough for the "Crates" lead-in block above it
 * (93px) to stand on the rack's own left edge.
 */
const RACK_W = 2 * MIN_TAP + BAY_GAP;

/** The narrowest the reading column may be, as the tall layout has it. */
const READ_MIN_W = 236;

/**
 * The smallest a drop bay may be drawn on a screen with no room for
 * `BAY_MIN`, and the concession this number is.
 *
 * **`BAY_MIN` (40) is the drawn size at which two bays' hit areas stop
 * overlapping**, because a bay's hit area is `bayHitSize` — floored at
 * `MIN_TAP` but never past its neighbour — so at a drawn 40 and a
 * `BAY_GAP` of 8 the pitch is exactly `MIN_TAP`. Below 40 the hit areas
 * are the pitch rather than 48: still touching, never overlapping, so a
 * tap never answers for the bay next door. What is lost is *size*, not
 * separation, and the loss is the reason this exists at all.
 *
 * **Marcus's decision, 9 October 2026: the drop bays may go under 40 on
 * a screen with no room for them, and nothing else may.** The 48px floor
 * on every control — the buttons, the vehicle arrows, Back, the crates,
 * the waiting animals — does not move. The arithmetic that forced the
 * choice: the short layout hands the car park `height - 2 * SAFE_MARGIN`
 * of ground, which is 343px in the Capacitor app (812x375) and 293px in
 * the Home Screen web clip (812x325), and Spark's six bays at 40 need
 * her drawn 361px tall. 361 does not go into 343, so either a vehicle is
 * cropped — against Rule 8, and the fault this whole screen was rebuilt
 * to fix — or the bays come down. They come down.
 *
 * **31 is derived and it is the smallest viewport's own number.**
 * `wholeVehicleHeight` is affine in the floor, so solving
 * `wholeVehicleHeight('electric-minibus', 2, 3) = 293` gives 31.75: 31
 * is the largest whole pixel at which Spark stands whole in the web
 * clip's 293px, and therefore the lowest any screen the game ships to
 * ever asks for. It is a clamp and not a target — `bayFloorFor` hands
 * back the *largest* floor the ground can hold, so 31 is reached only at
 * 812x325 and only by Spark.
 */
export const BAY_FLOOR_MIN = 31;

/**
 * The largest bay floor this vehicle can have and still stand whole in
 * the ground the screen has for her.
 *
 * `BAY_MIN` wherever `BAY_MIN` fits, which is every viewport the screen
 * was composed for and every vehicle in the fleet at four of the six
 * sizes the game ships to. Where it does not fit, the floor comes down
 * one pixel at a time until she stands whole, and no further — a bay
 * never gives up a pixel that was not needed to keep a bumper on the
 * screen. `BAY_FLOOR_MIN` is the clamp under it.
 *
 * **Per vehicle, because the floor only ever binds on the vehicle who
 * needs it.** Relaxing it cannot shrink a bay that already clears
 * `BAY_MIN`: the floor is the size `fitLoadBed` *grows* a vehicle to
 * reach, so a vehicle fitted comfortably inside her box never consults
 * it. At 812x325 Spark takes 31 and Bea 35 and Big Tilly 37, while Henry
 * and Trikey keep 40 — and an arrow press changes nothing but the
 * vehicle's own bays, which were already a different size in every
 * vehicle.
 *
 * **It must not decide the page grid's shape.** `FLEET_MIN_WHOLE_H`
 * stays measured at `BAY_MIN`, so the stacked/short breakpoint is
 * exactly where it was: the shape may not change when an arrow changes
 * the vehicle, and a floor that moved the breakpoint would move it.
 */
export function bayFloorFor(
  id: VehicleType,
  cols: number,
  rows: number,
  /** The ground she has, top of her rise to the bottom of the tarmac. */
  groundH: number,
): number {
  if (wholeVehicleHeight(id, cols, rows) <= groundH) return BAY_MIN;
  const sprite = VEHICLE_BED_SOURCE[id];
  const bed = VEHICLE_BED[id];
  // Walked rather than inverted. The height is affine in the floor, but
  // through a `Math.max` of two axes, and one of the two is the binding
  // one for some vehicles and not for others — so solving it means
  // solving both and taking the smaller answer, which is the same forty
  // evaluations this loop makes and harder to read.
  for (let floor = BAY_MIN - 1; floor > BAY_FLOOR_MIN; floor -= 1) {
    const h = sprite.h * minScaleForBays(sprite, bed, cols, rows, { minSlot: floor });
    if (h <= groundH) return floor;
  }
  return BAY_FLOOR_MIN;
}

/**
 * Where everything on the loading screen goes.
 *
 * Pure arithmetic, so a test can hold every promise on it at every
 * viewport: that the vehicle stands whole, that nothing a child taps is
 * under the floor, and that the reading column keeps a width the
 * sentences can be set at. The drawing functions take their boxes from
 * here and work none of it out for themselves.
 *
 * ## The two shapes
 *
 * **Stacked** — two columns, the car park and the reading panel, over a
 * full-width floor carrying the waiting animals and the crates. This is
 * the screen Marcus signed off and it is what every viewport tall
 * enough gets.
 *
 * **Short** — three columns: the car park down the left with the whole
 * height of the screen, the reading panel over the waiting animals in
 * the middle, and the crates standing in a rack on the right. The car
 * park's column is `SAFE_MARGIN` to `SAFE_MARGIN`, not `contentTop` to
 * the floor, because on a landscape phone the vehicle needs 393 of the
 * 402 pixels there are and everything else has to be beside her rather
 * than above or below her. The title plate and Back float over the
 * tarmac either side of her, which is what they already do to the
 * risen rear in the tall layout.
 *
 * ## The breakpoint, and where it comes from
 *
 * The stacked layout hands the car park
 *
 *     contentBottom - bandH(height) - SPACE.m - contentTop
 *
 * and a vehicle stands whole in a column when the column, less the
 * ground she is owed fore and aft (`carParkBackdropH`), is at least
 * `wholeVehicleHeight` tall. The short layout takes over at the height
 * where that fails for `FLEET_MIN_WHOLE_H` — the *smallest* requirement
 * in the fleet, because below it no vehicle stands whole stacked and
 * there is nothing left to weigh.
 *
 * **At the title plate this screen draws, that height is 599px.**
 * 620 - 80 - 136 - 12 - 97 = 295 of column, less 24 of ground, is 271
 * against Henry's 255, so 820x620 stays stacked with 16px to spare; at
 * 598 the column is 276, less 22, is 254 and he no longer fits. It is
 * computed here rather than written down because `contentTop` is read
 * off the drawn title, and a longer vehicle name moves it.
 *
 * The short layout also needs width: two page margins, `PARK_SHORT_W`,
 * two gutters, the rack and `READ_MIN_W` come to 796px, and below that
 * it falls back to stacked rather than drawing three columns that do
 * not fit. Every viewport this game is composed for is wider — the
 * narrowest is the 812pt phone.
 */
export interface LoadingColumns {
  kind: 'stacked' | 'short';
  /** The car park's column, which the bay is centred in. */
  park: Box;
  /** How wide the vehicle herself may be drawn inside it. */
  vehicleW: number;
  /**
   * How tall the ground is — which is not the column's height.
   *
   * The vehicle's rear may rise above the column, as far as
   * `PARK_CEILING`, and her nose may stand on the column's own bottom
   * edge, so the room she has is from the ceiling to the foot of the
   * tarmac. In the short shape the column already starts at the ceiling
   * and the two are the same number; in the stacked shape the ground is
   * the taller of the two, which is how Spark stands whole at 820x620
   * in a 295px column. `bayFloorFor` is asked this and not `park.h`.
   */
  groundH: number;
  /** The reading panel. */
  panel: Box;
  /** The floor the animals wait on, its lead-in row included. */
  loose: Box;
  /** Where the crates stand, its lead-in row included. */
  shelf: Box;
  /** The lead-in row's height, which both of those start with. */
  labelH: number;
}

export function loadingColumns(options: {
  width: number;
  height: number;
  /** The first y the screen's own content may occupy, below the title. */
  contentTop: number;
  /** The last y it may occupy, above the bottom row of buttons. */
  contentBottom: number;
  /** Half the drawn title plate, so a column can tell whether it is under it. */
  titleHalfW: number;
  /** The waiting animals' sizes relative to each other, for their row. */
  units: readonly number[];
}): LoadingColumns {
  const { width, height, contentTop, contentBottom, titleHalfW, units } = options;
  const usable = width - PAGE_MARGIN * 2;
  const gutter = SPACE.xl;
  const labelH = MIN_FONT.small + SPACE.xs;
  const bandFloorH = labelH + SPACE.s + MIN_TAP;

  // What the stacked layout would give the car park, which is the
  // question the breakpoint asks.
  const bandH = Math.round(Math.min(142, Math.max(bandFloorH, height * 0.22)));
  const stackedParkH = contentBottom - bandH - SPACE.m - contentTop;
  const readShortW = usable - 2 * gutter - PARK_SHORT_W - RACK_W;
  const short = stackedParkH - carParkBackdropH(stackedParkH) < FLEET_MIN_WHOLE_H
    && readShortW >= READ_MIN_W;

  if (short) {
    const readX = PAGE_MARGIN + PARK_SHORT_W + gutter;
    const rackX = readX + readShortW + gutter;
    // The rack takes the screen's height as well, where the title plate
    // does not reach it. The reading column never can: the plate is
    // centred on the screen and the middle column is what is under it.
    const rackTop = width / 2 + titleHalfW <= rackX ? SAFE_MARGIN : contentTop;
    const readH = contentBottom - contentTop;
    // The animals' row is sized by the width it has — eight animals on
    // one ground line run out of floor long before they run out of
    // height — so height given to the band beyond that is empty floor.
    const rowWanted = looseRowScale(units, readShortW, BAY_GAP);
    const bandWanted = labelH + SPACE.s + Math.max(MIN_TAP, Math.round(rowWanted));
    const panelFloor = Math.min(PANEL_TIGHT_H, readH - SPACE.m - bandFloorH);
    const panelH = Math.max(panelFloor, Math.min(PANEL_WANTED_H, readH - SPACE.m - bandWanted));
    const looseH = Math.max(bandFloorH, readH - SPACE.m - panelH);
    const park: Box = {
      x: PAGE_MARGIN, y: SAFE_MARGIN, w: PARK_SHORT_W, h: height - 2 * SAFE_MARGIN,
    };
    return {
      kind: 'short',
      park,
      vehicleW: PARK_SHORT_W - 2 * (ARROW_W + ARROW_GAP),
      groundH: park.y + park.h - PARK_CEILING,
      panel: { x: readX, y: contentTop, w: readShortW, h: panelH },
      loose: { x: readX, y: contentBottom - looseH, w: readShortW, h: looseH },
      shelf: { x: rackX, y: rackTop, w: RACK_W, h: contentBottom - rackTop },
      labelH,
    };
  }

  // The reading column is sized first and the car park takes what is
  // left: the panel is type, and type has a width below which it stops
  // being readable, while a vehicle simply draws smaller.
  const readW = Math.round(Math.max(READ_MIN_W, Math.min(usable * 0.42, 420)));
  const parkW = Math.max(160, usable - gutter - readW);
  const readX = PAGE_MARGIN + parkW + gutter;
  const bayFloor: Box = {
    x: PAGE_MARGIN, y: contentBottom - bandH, w: usable, h: bandH,
  };
  const columnsBottom = bayFloor.y - SPACE.m;
  const park: Box = {
    x: PAGE_MARGIN, y: contentTop, w: parkW, h: Math.max(100, columnsBottom - contentTop),
  };
  // Nothing sits under the panel, so it runs to the foot of the column
  // and the extra goes to the picture — see `PANEL_FACES_MAX`.
  const panelH = Math.max(MIN_TAP, Math.min(columnsBottom - contentTop, PANEL_WANTED_H));
  const { loose, shelf } = splitLoadingBay(bayFloor);
  return {
    kind: 'stacked',
    park,
    vehicleW: park.w,
    groundH: park.y + park.h - PARK_CEILING,
    panel: { x: readX, y: contentTop, w: readW, h: panelH },
    loose,
    shelf,
    labelH,
  };
}

/**
 * Draw the whole loading screen into `container`.
 *
 * The owning scene keeps the session and calls this again after every
 * tap, exactly as `PtvDriveScene` redraws its other phases.
 */
export function renderCrateLoading(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  state: CrateLoadingState,
  callbacks: CrateLoadingCallbacks,
): void {
  const { width, height } = scene.scale;
  const { session, vehicle } = state;
  const held = heldAnimal(session);

  // The title carries what used to be a floating line of ink on the
  // gravel — "Trikey has 2 spaces". The van on screen now shows its own
  // capacity, so the words belong with the other fact about this trip
  // rather than hovering over the tarmac looking for a home.
  const spaces = `${vehicle.slots} ${vehicle.slots === 1 ? 'space' : 'spaces'}`;
  const title = createChromeTitle(scene, width / 2, TITLE_CY, activityTitle(vehicle.name), {
    // The largest step the game has below its end-of-game banners, and
    // up two from the 20px this was. See `activityTitle` for why the
    // capitals, which are Marcus's instruction rather than the rule.
    fontSize: TYPE.title,
    subtitle: `${spaces} — off to ${state.destinationName}`,
  });

  // ── The page grid ──
  //
  // **One margin, two columns, one gutter, one top line and one bottom
  // line.** The screen had none of that: the title floated on `width /
  // 2`, Back sat on `SAFE_MARGIN`, the panel began 44px below the top
  // of the content on `PAGE_MARGIN`, the tarmac began 12px outside it
  // on `PAGE_MARGIN - SPACE.m`, and the bottom buttons were on
  // `SAFE_MARGIN` again — four different left edges and nothing lining
  // up with anything.
  //
  // So: everything the screen *composes* sits on `PAGE_MARGIN` and in
  // one of two columns, and the two things that are the game's own
  // chrome — the title on `TITLE_CY` and Back on `SAFE_MARGIN` — stay
  // where every other screen puts them. That distinction is the one
  // `constants.ts` already draws: `SAFE_MARGIN` is the floor a control
  // may not cross, `PAGE_MARGIN` is where content begins.
  const contentTop = contentTopFor(title);
  const buttonCy = bottomAnchorY(height);
  const contentBottom = buttonCy - MIN_TAP / 2 - SPACE.l;

  // Which of the two shapes the screen is in, and where everything goes
  // in it. All of it is in `loadingColumns`, which is arithmetic a test
  // can hold at every viewport — nothing here works a box out for
  // itself. The short shape, and the height it takes over at, are in
  // that function's own doc.
  const cols = loadingColumns({
    width,
    height,
    contentTop,
    contentBottom,
    titleHalfW: title.width / 2,
    units: session.offered.map((a) => SPECIES_SIZE[a.species]),
  });

  // Where a dragged animal or crate may be let go. Filled by the bays
  // and by the shelf as they are drawn, and read when a pointer comes
  // up — so the order the three are built in does not matter.
  const zones: DropZone[] = [];
  // And whether one of them is in the air, which every hover on the
  // screen has to know. See `DragFlag`.
  const drag: DragFlag = { active: false };

  // ── The car park ──
  //
  // The left column is a place, not a slab: one marked bay on the
  // A.R.C. tarmac with the vehicle standing whole in it, the arrows
  // either side, and the site's gravel showing past the edge of the
  // lot. No neighbours, no far kerb, no exit road and no building —
  // each of those is arithmetic rather than taste, and `car-park.ts`
  // says which arithmetic.
  //
  // **The ground may be taller than the column.** The vehicle is fitted
  // to the column less the ground she is owed fore and aft, and where
  // the column cannot hold her at the tap floor her rear rises above it
  // into the band beside the title, with the tarmac beginning just above
  // her head line. At 820x620 Spark is 361px tall against a 295px column
  // and that is the only way she stands whole; the ledger is in
  // `loadingColumns`.
  //
  // **And where even the risen rear is not enough, the bays come down
  // rather than the vehicle being cropped.** That is the two phone
  // viewports and nowhere else; `bayFloorFor` is the whole of it, and
  // the 48px floor on every *control* on this screen is untouched.
  const column = cols.park;
  const backdropH = carParkBackdropH(column.h);
  const bayFloor = bayFloorFor(
    vehicle.id, session.grid.cols, session.grid.rows, cols.groundH,
  );
  const fit = vehicleFit(
    scene, vehicle.id,
    {
      ...column,
      // The vehicle's own box is the width she may be drawn in — the
      // whole column in the tall layout, the part between the arrows in
      // the short one.
      w: cols.vehicleW,
      h: backdropH > 0
        ? (column.h - backdropH) / VEHICLE_VISIBLE_FRAC
        : column.h,
    },
    session.grid.cols, session.grid.rows,
    bayFloor,
  );
  const park = drawCarPark(scene, container, {
    width,
    height,
    column,
    chosen: vehicle.id,
    spriteW: fit ? fit.spriteW : cols.vehicleW * 0.42,
    // Passing this is what draws the arrows. They report the choice and
    // change nothing themselves: `changeVehicle` decides what becomes of
    // the animals aboard and the owning scene redraws.
    onVehicleChange: callbacks.onVehicleChange,
    playerLevel: state.playerLevel,
  });
  container.add(title);

  // The panel is sized for its longest copy — a heading and four lines
  // — rather than for the band, and pinned to the top line. A panel
  // that changed height with its contents would move the words a child
  // is reading; one that started below the top of the content made the
  // column look dropped.
  const setMessage = drawPanel(scene, container, state, {
    ...cols.panel, h: Math.max(MIN_TAP, cols.panel.h),
  });

  // She stands in her bay, reversed in with her rear against the head
  // of it and her nose toward the exit. A bay is where a loaded van is;
  // the old inset rectangle was a van hanging off a panel.
  drawVehicle(scene, container, state, callbacks, setMessage, zones, drag, {
    x: park.bay.x,
    y: park.parkTop,
    w: park.bay.w,
    h: fit ? fit.spriteH : Math.max(100, park.kerbY - park.parkTop),
  }, bayFloor, park.kerbY - 2, fit);
  drawLoadingBay(scene, container, state, callbacks, setMessage, zones, drag, cols);

  // ── Bottom row ──
  container.add(drawBackControl(scene, SAFE_MARGIN, SAFE_MARGIN, () => callbacks.onBack())
    .setDepth(45));

  const ready = canSetOff(session) && aboard(session).length > 0;
  container.add(
    createChromeButton(scene, width / 2, buttonCy, "Let's go!", () => callbacks.onSetOff(), {
      width: 190,
      // Filled only when the van really may leave. The unready button is
      // not dead and not greyed out — it answers with the reason, in the
      // panel, which is the same calm refusal a frightening bay gives.
      variant: ready ? 'filled' : 'plate',
    }).setDepth(45),
  );

  if (held) {
    container.add(
      // On `PAGE_MARGIN`, so its right edge is the reading column's
      // right edge rather than eight pixels past it.
      createChromeButton(
        scene, width - PAGE_MARGIN, buttonCy, `Put ${held.name} back`,
        () => callbacks.onPutBack(),
        { width: 180, fontSize: TYPE.button, anchor: { x: 'right' } },
      ).setDepth(45),
    );
  }
}

// ── Back ─────────────────────────────────────────────────────

/**
 * Back, with a chevron pointing left.
 *
 * **Drawn, not set.** "‹" and "❮" are a quotation mark and a dingbat:
 * the first is too light to read at 18px beside bold type and the
 * second resolves to whatever the device has, which on iOS is not the
 * weight it is on a Mac. Two strokes in a Graphics object are the same
 * mark at every size, in the same ink as the word beside them, and the
 * screen already draws its arrows that way — the lead-in over the
 * crates and the one in the empty-vehicle panel.
 *
 * **One block, one left edge.** The chevron and the word sit in one
 * plate with the chevron at its left padding, and the plate's hit box
 * is anchored on `SAFE_MARGIN` — the edge every other screen in the
 * game puts Back on. Marcus's note was "the chevron and the word align
 * on one left edge"; read as stacking the chevron above the word it
 * would make Back the only vertical control in the game, so it is read
 * here as the two of them forming a single block on a single edge. See
 * `.claude/notes/loading-screen-drag.md`.
 */
export function drawBackControl(
  scene: Phaser.Scene,
  x: number,
  y: number,
  onClick: () => void,
): Phaser.GameObjects.Container {
  const label = scene.add.text(0, 0, 'Back', {
    fontSize: TYPE.button,
    fontFamily: FONTS.ui,
    fontStyle: 'bold',
    color: CHROME.ink,
    resolution: TEXT_RESOLUTION,
  }).setOrigin(0, 0.5);

  const chevW = 9;
  const chevH = 16;
  const padX = 18;
  const gap = SPACE.s;
  const w = Math.max(96, padX * 2 + chevW + gap + label.width);
  const h = Math.max(MIN_TAP, label.height + 24);

  const gfx = scene.add.graphics();
  gfx.fillStyle(CHROME.shadowColour, CHROME.shadowAlpha);
  gfx.fillRoundedRect(
    -w / 2 + CHROME.shadowX - 1, -h / 2 + CHROME.shadowY - 1, w, h, CHROME.radius,
  );
  gfx.fillStyle(CHROME.fill, CHROME.fillAlpha);
  gfx.fillRoundedRect(-w / 2, -h / 2, w, h, CHROME.radius);
  gfx.lineStyle(CHROME.strokeWidth, CHROME.stroke, CHROME.strokeAlpha);
  gfx.strokeRoundedRect(-w / 2, -h / 2, w, h, CHROME.radius);

  // The chevron: two strokes meeting at a point on the left, as tall as
  // the capital it stands beside, in the label's own ink.
  const cx = -w / 2 + padX + chevW / 2;
  gfx.lineStyle(3, hexNum(CHROME.ink), 1);
  gfx.beginPath();
  gfx.moveTo(cx + chevW / 2, -chevH / 2);
  gfx.lineTo(cx - chevW / 2, 0);
  gfx.lineTo(cx + chevW / 2, chevH / 2);
  gfx.strokePath();

  label.setPosition(-w / 2 + padX + chevW + gap, 0);

  const hit = scene.add.rectangle(0, 0, Math.max(w, MIN_TAP), Math.max(h, MIN_TAP), 0x000000, 0)
    .setInteractive({ useHandCursor: true });

  const container = scene.add.container(
    x + Math.max(w, MIN_TAP) / 2, y + Math.max(h, MIN_TAP) / 2, [gfx, label, hit],
  );
  container.setSize(w, h + CHROME.shadowY);
  hit.on('pointerover', () => container.setScale(1.03));
  hit.on('pointerout', () => container.setScale(1));
  hit.on('pointerdown', () => {
    // State, not decoration: the press carries the tap. Reduced
    // motion skips the flex and still goes Back — `stateTween` runs
    // `onComplete` either way, and a yoyo ends where it started so
    // nothing is left shrunk.
    stateTween(scene, {
      targets: container,
      scaleX: 0.96,
      scaleY: 0.96,
      duration: 60,
      yoyo: true,
      onComplete: onClick,
    });
  });
  return container;
}

// ── Dragging, in two stages ──────────────────────────────────

/**
 * Where a dragged thing may be let go.
 *
 * Three kinds, and they are the two stages plus the way back:
 *
 *   crate  — a crate on the shelf. A loose animal dropped here goes
 *            into it, which is stage one. A crate already holding her
 *            dropped on a different one moves her across.
 *   bay    — a space in the vehicle, which is stage two.
 *   floor  — the floor the loose animals stand on. Dropping a crated
 *            animal back here puts her down, out of the crate, which
 *            is how a child undoes a choice by dragging rather than by
 *            finding the button.
 */
export type DropTarget =
  | { kind: 'crate'; crate: CrateType }
  | { kind: 'bay'; slotIndex: number }
  | { kind: 'floor' };

export interface DropZone {
  rect: Box;
  target: DropTarget;
}

/**
 * Which space a drop landed in — the one it is inside, or the nearest
 * one within `slack` of its edge.
 *
 * **Nearest by edge distance, which is what makes the slack safe.** A
 * point inside a space is zero from it and no other space can beat
 * that, so widening the slack can never steal a drop from the space it
 * actually landed in; all it does is catch the ones that landed just
 * outside. Pure arithmetic, so the generosity is a number a test can
 * hold rather than a feeling.
 */
export function nearestDropZone(
  zones: readonly DropZone[],
  x: number,
  y: number,
  slack: number,
): DropTarget | null {
  let best: { target: DropTarget; d: number } | null = null;
  for (const zone of zones) {
    const dx = Math.max(zone.rect.x - x, 0, x - (zone.rect.x + zone.rect.w));
    const dy = Math.max(zone.rect.y - y, 0, y - (zone.rect.y + zone.rect.h));
    const d = Math.hypot(dx, dy);
    if (d > slack) continue;
    if (!best || d < best.d) best = { target: zone.target, d };
  }
  return best ? best.target : null;
}

/**
 * The two things that get dragged on this screen.
 *
 * Named, because what a piece may be let go in is a fact about the
 * piece rather than about the stage the session is in: a child may
 * pick up a second animal off the floor while the first is in a crate
 * in her hands, and the loose one still has only crates to go to.
 */
export type DragKind = 'loose-animal' | 'crated-animal';

/**
 * Which spaces each kind of piece may be let go in.
 *
 * **A loose animal takes crates and nothing else.** The second stage
 * cannot happen before the first, and it is better that the bays are
 * not targets for her at all than that a drop which landed squarely on
 * one is refused: a drag that goes home is a drag that missed, and a
 * child learns from it that the bays are not where animals go yet.
 * Tapping a bay too early is answered in words instead — see
 * `CrateLoadingCallbacks.onNeedCrate` — because a tap cannot miss.
 *
 * **A crated animal takes everything**: a space in the vehicle, which
 * is the move; another crate, which changes her mind about the crate;
 * and the floor, which puts her down.
 */
export function dropTargetsFor(kind: DragKind): (target: DropTarget) => boolean {
  return kind === 'loose-animal' ? (t) => t.kind === 'crate' : () => true;
}

/** A rectangle at least `MIN_TAP` each way, centred where it was. */
function generous(cx: number, cy: number, w: number, h: number): Box {
  const gw = Math.max(w, MIN_TAP);
  const gh = Math.max(h, MIN_TAP);
  return { x: cx - gw / 2, y: cy - gh / 2, w: gw, h: gh };
}

interface DragSpec {
  /** Where the piece sits when nothing is happening. */
  home: { x: number; y: number };
  /** The same thing a tap does. Every drag has one. */
  onTap: () => void;
  /** It landed somewhere. */
  onDrop: (target: DropTarget) => void;
  /**
   * Which spaces this piece may be let go in. Everything, by default.
   *
   * A loose animal takes only crates, because stage two cannot happen
   * before stage one — and it is better that the bays are not targets
   * for her at all than that a drop which landed on one is refused.
   * Anything not accepted is a miss: she goes home, and the panel says
   * what she needs.
   */
  accepts?: (target: DropTarget) => boolean;
  /**
   * What the space under the pointer would mean, as the piece passes
   * over it. Called only when the answer changes.
   *
   * This is the drag's own preview, and it replaces every hover on the
   * screen for as long as the drag lasts — a child dragging a crate
   * over Big Tilly's bays reads what each one would do to the animal
   * in it, which is the same thing she would read by hovering if she
   * were not already holding something.
   */
  describe?: (target: DropTarget | null) => void;
  /** It landed nowhere, and has gone home. */
  onMiss?: () => void;
  /** Called when the piece is picked up, to stop it breathing. */
  onLift?: () => void;
  /** Called when it goes home without having been dropped anywhere. */
  onSettle?: () => void;
}

/**
 * The invisible rectangle a finger has to land in to take hold of a
 * piece — at least `MIN_TAP` each way, whatever the piece is drawn at.
 *
 * One rectangle per piece, and every pointer event on that piece comes
 * through it: hovering, tapping and dragging are three readings of one
 * target, so they can never disagree about where the thing is. Phaser
 * reports over and out for the topmost hit object only, so a second
 * rectangle under this one would simply never be hovered.
 */
function grabHandle(
  scene: Phaser.Scene,
  piece: Phaser.GameObjects.Container,
  w: number,
  h: number,
): Phaser.GameObjects.Rectangle {
  const hit = scene.add.rectangle(
    0, 0, Math.max(w, MIN_TAP), Math.max(h, MIN_TAP), 0x000000, 0,
  ).setInteractive({ useHandCursor: true });
  piece.add(hit);
  return hit;
}

/**
 * Make a piece draggable, and tappable, with one handler.
 *
 * **A tap is a drag that did not move.** The two gestures share
 * everything up to `pointerup`, and which of them happened is one
 * comparison against `DRAG_SLOP` — so there is no mode, no long-press,
 * and nothing a child can do halfway. That is what keeps the screen
 * operable for a child who cannot drag accurately: she taps, and the
 * same callback runs.
 *
 * The pointer listeners are the scene's, added on the way down and
 * removed on the way up, because the view is redrawn from scratch after
 * every move and a listener left on the scene would outlive the piece
 * it was moving. Everything checks `piece.scene` before touching the
 * piece for the same reason.
 */
function makeDraggable(
  scene: Phaser.Scene,
  piece: Phaser.GameObjects.Container,
  hit: Phaser.GameObjects.Rectangle,
  zones: readonly DropZone[],
  drag: DragFlag,
  spec: DragSpec,
): void {
  let from: { x: number; y: number } | null = null;
  let moved = false;
  let done = false;
  let over = '\u0000';

  const alive = (): boolean => Boolean(piece.scene) && !done;

  const allowed = (): readonly DropZone[] => (
    spec.accepts ? zones.filter((z) => spec.accepts?.(z.target)) : zones
  );

  const end = (): void => {
    scene.input.off('pointermove', onMove);
    scene.input.off('pointerup', onUp);
    scene.input.off('pointerupoutside', onUp);
    from = null;
    drag.active = false;
  };

  const goHome = (): void => {
    if (!alive()) return;
    // State: the journey back is what says the drop landed nowhere.
    // Reduced motion puts the piece home at once — which still says
    // it, because it is somewhere other than where the hand let go —
    // and the panel's sentence says the rest.
    stateTween(scene, {
      targets: piece,
      x: spec.home.x,
      y: spec.home.y,
      scaleX: 1,
      scaleY: 1,
      duration: 180,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        if (!alive()) return;
        piece.setDepth(0);
        spec.onSettle?.();
      },
    });
  };

  function onMove(pointer: Phaser.Input.Pointer): void {
    if (!from || !alive()) { end(); return; }
    const dx = pointer.x - from.x;
    const dy = pointer.y - from.y;
    if (!moved && Math.hypot(dx, dy) > DRAG_SLOP) {
      moved = true;
      // Picked up: above everything, and a little larger, which is the
      // only feedback a drag needs. No tilt and no shadow that grows —
      // the piece is the same object it was, held.
      piece.setDepth(80);
      piece.setScale(1.08);
      // **Nothing else may speak while a piece is in the air.** A
      // dragged animal passes over the other animals on the floor, and
      // Phaser hands each of them a pointerover as she goes — so the
      // panel was reporting whichever animal happened to be under the
      // one the child was carrying, and then clearing itself when she
      // left. For the length of a drag the panel belongs to the drag:
      // every hover handler on this screen reads this flag.
      drag.active = true;
      spec.onLift?.();
    }
    if (!moved) return;
    piece.setPosition(spec.home.x + dx, spec.home.y + dy);

    // What the space under the pointer would mean, as she passes over
    // it — the same answer the drop will give, before she commits to
    // it. Only when it changes, so the panel is not rebuilt per frame.
    if (!spec.describe) return;
    const target = nearestDropZone(allowed(), pointer.x, pointer.y, DROP_SLACK);
    const key = targetKey(target);
    if (key === over) return;
    over = key;
    spec.describe(target);
  }

  function onUp(pointer: Phaser.Input.Pointer): void {
    const wasDragging = moved;
    end();
    if (!alive()) return;
    if (!wasDragging) {
      done = true;
      spec.onTap();
      return;
    }
    const target = nearestDropZone(allowed(), pointer.x, pointer.y, DROP_SLACK);
    if (!target) {
      moved = false;
      goHome();
      spec.onMiss?.();
      return;
    }
    // The snap: the piece goes to the middle of the space it landed in
    // before anything else happens, so a child sees where it went
    // rather than seeing it vanish and the screen change.
    done = true;
    const to = zoneCentre(zones, target);
    // State, and the most load-bearing of the four: the snap is how a
    // child sees *which* space took the thing she let go of. Reduced
    // motion puts it in the middle of that space at once and then
    // redraws, so she sees the animal in the crate rather than the
    // animal travelling to it — the same answer, delivered as a cut.
    stateTween(scene, {
      targets: piece,
      x: to ? to.x : piece.x,
      y: to ? to.y : piece.y,
      scaleX: 1,
      scaleY: 1,
      duration: 110,
      ease: 'Quad.easeOut',
      onComplete: () => spec.onDrop(target),
    });
  }

  hit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    if (done) return;
    from = { x: pointer.x, y: pointer.y };
    moved = false;
    over = '\u0000';
    scene.input.on('pointermove', onMove);
    scene.input.on('pointerup', onUp);
    scene.input.on('pointerupoutside', onUp);
  });
}

/**
 * One flag for the whole screen: a piece is in the air.
 *
 * Shared by every hover handler, because the question "should the
 * panel change?" is about the screen rather than about the object the
 * pointer happens to be over. One object per render, handed down.
 */
interface DragFlag { active: boolean }

/** A target as a string, so a move can tell when it has changed. */
function targetKey(target: DropTarget | null): string {
  if (!target) return '-';
  if (target.kind === 'crate') return `c:${target.crate}`;
  if (target.kind === 'bay') return `b:${target.slotIndex}`;
  return 'f';
}

/** The middle of a zone, for the snap. */
function zoneCentre(
  zones: readonly DropZone[],
  target: DropTarget,
): { x: number; y: number } | null {
  const same = (a: DropTarget): boolean => {
    if (a.kind !== target.kind) return false;
    if (a.kind === 'crate' && target.kind === 'crate') return a.crate === target.crate;
    if (a.kind === 'bay' && target.kind === 'bay') return a.slotIndex === target.slotIndex;
    return true;
  };
  const zone = zones.find((z) => same(z.target));
  return zone
    ? { x: zone.rect.x + zone.rect.w / 2, y: zone.rect.y + zone.rect.h / 2 }
    : null;
}

/**
 * A gentle breath, so the loose animals are alive without anything
 * happening.
 *
 * **Slow, small, and out of step with each other.** Two and a bit
 * seconds for a full breath, three and a half per cent of scale and a
 * pixel and a half of rise — at a hedgehog's size that is under half a
 * pixel of movement. The phase is taken from the animal's own place in
 * the row, so six of them do not pulse in unison, which is the thing
 * that would read as a machine rather than as animals waiting. Nothing
 * flashes, nothing changes colour and nothing moves suddenly: this is a
 * screen for autistic children and the motion budget is small on
 * purpose.
 */
function breathe(scene: Phaser.Scene, piece: Phaser.GameObjects.Container, seed: number): void {
  // Decoration, and the clearest case of it on the screen: it says
  // nothing, it never ends, and a child who has asked for less
  // movement has asked for exactly this to stop. `decorativeTween`
  // does not start it under reduced motion and stops it mid-breath if
  // the setting changes, putting the animal back at rest.
  decorativeTween(scene, {
    targets: piece,
    scaleX: 1.035,
    scaleY: 1.035,
    y: piece.y - 1.5,
    duration: 2300 + (seed % 5) * 190,
    delay: (seed % 7) * 280,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
}

// ── The vehicle, and the bays in it ──────────────────────────

/**
 * What an empty bay would be, read as a mood — the engine's level,
 * except that stress caused by illness is a need rather than a
 * falling-out and is marked as one. Null where there is nothing to
 * preview.
 */
function slotMood(session: LoadingSession, slotIndex: number): Mood | null {
  // **One stage lit at a time.** The engine previews a slot for
  // whoever is in the child's hands, crate or no crate — but an animal
  // without a crate is not going into the vehicle yet, and a bed full
  // of green hearts while the screen is asking her to pick a crate
  // invites the one tap it is about to refuse.
  if (loadStage(session) !== 'pick-a-space') return null;
  const outlook = slotOutlook(session, slotIndex);
  if (!outlook) return null;
  const worst = slotNotes(session, slotIndex)[0];
  return worst ? moodOf(worst) : outlook;
}

/**
 * The live notes for one bay, as panel copy — what a pointer resting on
 * an empty bay reads out while an animal is held.
 */
function bayHoverCopy(session: LoadingSession, slotIndex: number): PanelCopy | null {
  const outlook = slotMood(session, slotIndex);
  if (!outlook) return null;
  const notes = slotNotes(session, slotIndex);
  const held = heldAnimal(session);
  return {
    heading: MOOD_WORD[outlook],
    tone: outlook,
    body: notes.length > 0
      ? sentences(notes, 2)
      : [`Nobody is beside this space, so ${held?.name ?? 'they'} would travel on their own.`],
    // One line, and it opens on a negation, so nothing in it is set
    // bold: the boldest thing on a page says what something is.
    boldLine: notes.length > 0 ? 0 : null,
    // The hypothetical, drawn: this is who she would be sitting next
    // to and how the two of them would take it. The neighbour's face
    // here is the face of a placement that has not happened, which is
    // the one place the panel is allowed to differ from her bay — it
    // is the whole point of a preview.
    cast: notes.length > 0
      ? castPair(session, notes[0])
      : held ? { members: [castOne(held)] } : undefined,
    // No neighbour is nothing to put right, the same as a happy one.
    compact: notes.length > 0
      ? compactCopyFor(notes[0], pairOf(session, notes[0]))
      : { heading: MOOD_WORD[outlook], tone: outlook, body: [] },
  };
}

/**
 * How big this vehicle wants to be drawn in the room it has — worked
 * out before anything is drawn, so the tarmac can be laid as a bay
 * round it rather than as a slab it sits somewhere on.
 *
 * Undefined where the painted vehicle has not loaded; the caller then
 * falls back to the whole column, which is what the screen did before
 * there was any art to measure.
 */
function vehicleFit(
  scene: Phaser.Scene,
  id: VehicleType,
  box: Box,
  cols: number,
  rows: number,
  /** The bay floor this screen can afford her — see `bayFloorFor`. */
  minSlot: number,
): BedFit | undefined {
  const key = VEHICLE_SPRITE[id];
  if (!scene.textures.exists(key)) return undefined;
  const source = scene.textures.get(key).getSourceImage();
  return fitLoadBed(
    { w: box.w, h: box.h },
    { w: source.width, h: source.height },
    VEHICLE_BED[id],
    cols, rows,
    { minSlot },
  );
}

/**
 * The chosen vehicle, parked in a bay on the tarmac, with its load bed
 * cut away and the crate grid laid in it.
 *
 * The bays lead: `fitLoadBed` sizes them for the room there is and then
 * says how big the vehicle has to be drawn for its bed to hold them,
 * which is why Spark draws taller than her column and a trike does not.
 * Where she does, `vehicleParkTop` has already decided where she
 * stands — her nose keeps the tarmac it is owed and her rear rises —
 * and this draws her there.
 */
function drawVehicle(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  state: CrateLoadingState,
  callbacks: CrateLoadingCallbacks,
  setMessage: (copy: PanelCopy | null) => void,
  zones: DropZone[],
  drag: DragFlag,
  box: Box,
  /** The bay floor this screen can afford her — see `bayFloorFor`. */
  minSlot: number,
  /**
   * The y the vehicle is cut off at — the tarmac's own bottom edge.
   *
   * **Nothing reaches it at any size the game ships to.** `drawCarPark`
   * puts it two lines past her nose when she fits, and since the bay
   * floor relaxes on a screen with no room for 40 (`bayFloorFor`) she
   * fits everywhere: the two phone viewports that used to cut Spark and
   * Bea and Big Tilly now stand all five whole. It is kept because a
   * ground shorter than the vehicle is still arithmetic somebody could
   * reintroduce, and cutting at the edge of the ground at least means
   * she ends where the car park does.
   */
  clipAt?: number,
  /**
   * The fit the caller already worked out to lay the tarmac round.
   * Recomputing it here would risk the bay and the vehicle in it
   * disagreeing by a pixel over which of them is 169 wide.
   */
  measured?: BedFit,
): void {
  const { session, vehicle } = state;
  const { cols, rows } = session.grid;

  const key = VEHICLE_SPRITE[vehicle.id];
  let slotW: number;
  let slotH: number;
  let floor: Box;
  let originX: number;
  let originY: number;

  if (scene.textures.exists(key)) {
    const sprite = scene.add.image(0, 0, key).setOrigin(0.5);
    warnOnStaleBed(scene, key, vehicle.id, sprite.width, sprite.height);

    const fit = measured ?? fitLoadBed(
      { w: box.w, h: box.h },
      { w: sprite.width, h: sprite.height },
      VEHICLE_BED[vehicle.id],
      cols, rows,
      { minSlot },
    );
    const left = box.x + (box.w - fit.spriteW) / 2;
    const top = fit.overflows ? box.y : box.y + (box.h - fit.spriteH) / 2;
    // Where the vehicle actually ends on screen: its own bottom edge, or
    // the kerb if it runs past it. The shadow is a pool on the
    // ground under it, so it has to stop where the vehicle stops —
    // otherwise a lorry running off the slab casts an ellipse across the
    // exit road and out under the buttons.
    //
    // Measured against `clipAt` rather than against `overflows`, which
    // only ever asked whether the sprite was taller than the box it was
    // *sized* in. The box and the cut line are now two different
    // questions: the vehicle is sized against the whole column so her
    // bays stay as big as they were, and then parked lower down it with
    // the car park behind her, so she reaches the kerb without ever
    // having overflowed anything.
    const bottom = clipAt !== undefined
      ? Math.min(clipAt, top + fit.spriteH)
      : top + fit.spriteH;

    drawVehicleShadow(scene, container, {
      cx: left + fit.spriteW / 2,
      cy: (top + bottom) / 2,
      w: fit.spriteW,
      h: bottom - top,
    });

    sprite.setPosition(left + fit.spriteW / 2, top + fit.spriteH / 2);
    sprite.setDisplaySize(fit.spriteW, fit.spriteH);
    if (clipAt !== undefined && bottom < top + fit.spriteH) {
      // `setCrop` is in the texture's own pixels and draws the kept part
      // where it already was, so the bed does not move.
      const keep = (clipAt - top) / fit.spriteH;
      sprite.setCrop(0, 0, sprite.width, sprite.height * Math.max(0, Math.min(1, keep)));
    }
    container.add(sprite);

    slotW = fit.slotW;
    slotH = fit.slotH;
    // The cutaway ends where the vehicle does. Spark's cabin is 0.63 of
    // a sprite drawn taller than the band, so at 820x620 the last strip
    // of her floor is past the kerb — and a cream panel carrying on
    // over the exit road is the one thing worse than a bumper that
    // does. The bays are centred in the floor and well inside it, so
    // nothing tappable is ever what gets cut.
    const floorY = top + fit.floor.y;
    floor = {
      x: left + fit.floor.x,
      y: floorY,
      w: fit.floor.w,
      h: clipAt === undefined ? fit.floor.h : Math.min(fit.floor.h, clipAt - floorY),
    };
    originX = left + fit.grid.x;
    originY = top + fit.grid.y;
  } else {
    // No painted vehicle loaded. The bed is still a bed — the cutaway
    // panel, the bays and every sentence behave identically, so a
    // missing texture costs the picture and nothing else.
    slotW = Math.max(1, Math.min(
      BAY_MAX_W, Math.floor((box.w - BED_PAD * 2 - GAP * (cols - 1)) / cols),
    ));
    slotH = Math.max(1, Math.min(
      BAY_MAX_H, Math.floor((box.h - BED_PAD * 2 - GAP * (rows - 1)) / rows),
    ));
    const w = slotW * cols + GAP * (cols - 1) + BED_PAD * 2;
    const h = slotH * rows + GAP * (rows - 1) + BED_PAD * 2;
    floor = { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
    originX = floor.x + BED_PAD;
    originY = floor.y + BED_PAD;
  }

  drawBedFloor(scene, container, floor);

  drawBays(scene, container, state, callbacks, setMessage, zones, drag, {
    originX,
    originY,
    slotW,
    slotH,
    cols,
  });
}

/** Texture keys already checked, so the sampling happens once a session. */
const bedChecked = new Set<string>();

/**
 * Say so, in dev, when a vehicle's load bed no longer matches its art.
 *
 * `VEHICLE_BED` is nine numbers measured by eye off a painting, and the
 * paintings are being redrawn. Re-measuring them is expected work; what
 * would be bad is the bays quietly drifting onto a lorry's bonnet with
 * nothing to say they had. So this compares the texture against the
 * size it was measured at, and samples the painting at nine points on
 * the bed — a bed that has slid off the body finds transparency, and
 * the console says which vehicle and how far off it is.
 *
 * Dev only, once per texture, and it never changes what is drawn.
 */
function warnOnStaleBed(
  scene: Phaser.Scene,
  key: string,
  id: VehicleType,
  w: number,
  h: number,
): void {
  if (!import.meta.env?.DEV || bedChecked.has(key)) return;
  bedChecked.add(key);

  const source = VEHICLE_BED_SOURCE[id];
  if (source && (source.w !== w || source.h !== h)) {
    console.warn(
      `[crate loading] ${key} is ${w}x${h}; VEHICLE_BED['${id}'] was measured on `
      + `${source.w}x${source.h}. The art has been redrawn — re-measure the bed `
      + 'in apps/game/src/driving/fleet-art.ts.',
    );
  }

  const missed = bedProbePoints(VEHICLE_BED[id]).filter(({ u, v }) => {
    const px = Math.min(w - 1, Math.max(0, Math.round(u * w)));
    const py = Math.min(h - 1, Math.max(0, Math.round(v * h)));
    const colour = scene.textures.getPixel(px, py, key);
    return !colour || colour.alpha < 8;
  });
  if (missed.length > 0) {
    console.warn(
      `[crate loading] VEHICLE_BED['${id}'] falls off the painted vehicle at `
      + `${missed.length} of 9 sample points — the bays are being drawn where `
      + `${key} has no paint. Re-measure it in apps/game/src/driving/fleet-art.ts.`,
    );
  }
}

/**
 * The cutaway — a cream floor inset into the vehicle's body with a dark
 * rim where its walls are, so the bays read as being inside the van
 * rather than painted on its roof.
 */
function drawBedFloor(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  bed: Box,
): void {
  const gfx = scene.add.graphics();
  gfx.fillStyle(BED_WALL, 0.38);
  gfx.fillRoundedRect(bed.x - 4, bed.y - 4, bed.w + 8, bed.h + 8, 14);
  gfx.fillStyle(BED_FLOOR, 0.97);
  gfx.fillRoundedRect(bed.x, bed.y, bed.w, bed.h, 11);
  gfx.lineStyle(2, 0x8a7a60, 0.5);
  gfx.strokeRoundedRect(bed.x, bed.y, bed.w, bed.h, 11);
  container.add(gfx);
}

/**
 * A bay's tap target along one axis, given the drawn cell on that axis.
 *
 * Its own function because it is now the *only* thing tying the tap
 * floor to the layout: the painted well shrank to the crate it holds
 * and this did not move with it, which is the whole of "a smaller
 * picture with a full-size hit area". Exported so a test can ask it of
 * every vehicle at every viewport rather than trusting a comment.
 */
export function bayHitSize(cell: number): number {
  return Math.max(cell, Math.min(MIN_TAP, cell + GAP));
}

interface GridGeometry {
  originX: number;
  originY: number;
  slotW: number;
  slotH: number;
  cols: number;
}

interface BayGeometry {
  left: number;
  top: number;
  cx: number;
  cy: number;
  slotW: number;
  slotH: number;
  withName: boolean;
  /**
   * Let a wide shallow box lay itself out as a row. Default true.
   *
   * False for the tray, and the difference is what the name is for in
   * each place. In a bay the animal is already placed and her name is a
   * reminder, so trading three letters for a sprite twice the size is a
   * good trade. In the tray the name is how a child decides who to pick
   * up next, and a 108px chip that reads "Sniffl…" has given away the
   * thing it was there to say.
   */
  rowWhenWide?: boolean;
}

/**
 * An animal in her crate, with her name, in a box — a loaded bay in the
 * vehicle, or a chip in the tray waiting to board.
 *
 * Two arrangements, because neither box gets to choose its own shape: a
 * bay is the vehicle's, and a tray chip is whatever the column it wraps
 * into leaves. Roughly square takes a card — the crate above, her name
 * under it. Wide and shallow takes a row — the crate at the left, her
 * name beside it — because a card in a 55px-deep box draws a 17px
 * animal over a 20px name, which is two things neither of which can be
 * read. The same two facts, using the axis that has room.
 *
 * **The crate is the picture now, not a badge beside it.** Where the
 * art comes out under `CRATE_ART_MIN` the animal is drawn on her own,
 * because a crate rim round a 30px sprite leaves 17px of animal and
 * the animal is who the child is choosing.
 */
interface TileArt {
  /** The crate square, drawn. */
  size: number;
  /** Where the crate's centre goes. */
  cx: number;
  cy: number;
  /** The name: its centre, and the room it has. */
  nameX: number;
  nameY: number;
  nameW: number;
  hasName: boolean;
  /**
   * The name sits over the crate rather than beside it — which is
   * what decides whether the strip between two stacked crates is
   * clear floor or somebody's name.
   */
  nameAbove: boolean;
}

/**
 * Where the crate and the name go in a box — worked out on its own, so
 * the painted well and the thing standing in it are measured once.
 *
 * It used to be arithmetic inside the drawing, which was fine while the
 * well *was* the box; now the well is cut to the crate it holds, two
 * callers need the same answer and only one of them draws an animal.
 *
 * **The name sits above.** It used to sit under the animal in both
 * arrangements, which puts the thing a child is looking at above the
 * thing she is reading and makes her eye travel down and back. Above
 * the picture the name is read on the way in — and in the card
 * arrangement it also stops the name row competing with the crate for
 * the bottom of the bay, which is where the pair glyphs now live.
 */
export function tileArt(g: BayGeometry): TileArt {
  if ((g.rowWhenWide ?? true) && g.slotW >= g.slotH * 1.6) {
    // Wide and shallow: the crate takes the depth, the name takes the
    // width beside it. Here the name is *beside* rather than under, so
    // it was never the thing change 2 was about, and it stays put: a
    // name above in a 53px-deep bay would cost the crate a third of
    // its height to save a journey the eye is not making.
    //
    // Half the width rather than a third: the crate is square and the
    // depth is what limits it, so the old 0.34 was spending width the
    // name did not need. A 49px crate leaves 75px of name, which is
    // "Clementine" with room over.
    const size = Math.max(1, Math.min(g.slotH - 4, g.slotW * 0.5));
    const left = g.left + 2 + size;
    const right = g.left + g.slotW - 4;
    return {
      size,
      cx: g.left + 2 + size / 2,
      cy: g.cy,
      nameX: (left + SPACE.xs + right) / 2,
      nameY: g.cy,
      nameW: Math.max(0, right - left - SPACE.xs),
      hasName: right - left - SPACE.xs >= 36,
      nameAbove: false,
    };
  }

  // Roughly square: the name above, the crate under it, the pair
  // centred in the bay. The inset is 2 rather than the 4 it was, and
  // the 4 was already down from 10 — a crate painted edge to edge of
  // its file has no margin of its own to give, and every pixel taken
  // off the rim comes off the animal inside twice over.
  const nameRow = g.withName ? MIN_FONT.small + 4 : 0;
  const size = Math.max(1, Math.min(g.slotW - 2, g.slotH - nameRow - 2));
  const top = g.cy - (size + nameRow) / 2;
  return {
    size,
    cx: g.cx,
    cy: top + nameRow + size / 2,
    nameX: g.cx,
    nameY: top + nameRow / 2,
    // Out to within 2px of the gap, not 8 inside it. "Thistle" is
    // 55px at the name size and Henry's bays are 58, so the old
    // margin was the difference between a name and "Thi…"; two
    // adjacent names still keep 6px of air between them.
    nameW: g.slotW - 4,
    hasName: g.withName,
    nameAbove: g.withName,
  };
}

function drawAnimalTile(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  animal: Animal | undefined,
  name: string,
  crate: CrateDef,
  g: BayGeometry,
  /** The face she wears, where her neighbours have given her one. */
  state?: string,
): void {
  const nameStyle: Phaser.Types.GameObjects.Text.TextStyle = {
    fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.ui, fontStyle: 'bold',
    color: CHROME.ink, resolution: TEXT_RESOLUTION,
  };

  const a = tileArt(g);

  /** The animal in her crate, or — too small for a rim — just her. */
  const piece = a.size >= CRATE_ART_MIN
    ? makeCratedAnimal(scene, a.cx, a.cy, animal, crate, a.size, state)
    : animal
      ? createAnimalSprite(
        scene, a.cx, a.cy, animal,
        { width: a.size, height: a.size, stateOverride: state },
      )
      : undefined;
  if (piece) container.add(piece);

  if (a.hasName) {
    container.add(fitLabel(scene, a.nameX, a.nameY, name, a.nameW, nameStyle));
  }
}

/**
 * The vehicle's bays, drawn — the holes, what is standing in them, and
 * the mark on the edge between any two animals who mind each other.
 *
 * **Exported for its test, which is about which crate it draws.** The
 * rest of the drawing is checked by eye and by screenshot, as the test
 * file's own header says; this one fact is not visible in a test that
 * cannot see a canvas and is exactly the one that went wrong — the bed
 * drew the species default rather than the child's choice from the day
 * crate choice shipped until it was found the same evening. A stub
 * scene that records the texture keys is enough to pin it, so it is
 * pinned.
 */
export function drawBays(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  state: CrateLoadingState,
  callbacks: CrateLoadingCallbacks,
  setMessage: (copy: PanelCopy | null) => void,
  zones: DropZone[],
  drag: DragFlag,
  geom: GridGeometry,
): void {
  const { session } = state;
  const { originX, originY, slotW, slotH, cols } = geom;

  const slotCentre = (slot: number) => ({
    x: originX + (slot % cols) * (slotW + GAP) + slotW / 2,
    y: originY + Math.floor(slot / cols) * (slotH + GAP) + slotH / 2,
  });

  const withName = slotH >= BAY_NAME_MIN_H;

  for (let slot = 0; slot < slotCount(session); slot += 1) {
    const { x: cx, y: cy } = slotCentre(slot);
    const crate = crateAt(session, slot);
    const outlook = slotMood(session, slot);
    const left = cx - slotW / 2;
    const top = cy - slotH / 2;

    // **The painted well is cut to the crate, not to the tap cell.**
    // A bay used to be the whole cell: at Big Tilly that is 40x54
    // holding a 36px crate, so a third of the hole was empty floor
    // painted as hole, and the bays read as the subject with the
    // animals rattling about inside them. The well is now the crate's
    // own square plus a lip for it to stand on, which is what "make
    // the spots smaller" is: the hole is the size of the thing that
    // goes in it, and the rest of the cell goes back to being the
    // vehicle's floor.
    //
    // The cell itself does not move. It is still what the hit area is
    // measured from, so a smaller picture costs nothing a finger can
    // feel — see the hit rectangle below.
    const well = tileArt({ left, top, cx, cy, slotW, slotH, withName });
    const wellW = Math.min(slotW, well.size + WELL_LIP * 2);
    const wellH = Math.min(slotH, well.size + WELL_LIP * 2);
    const wellX = well.cx - wellW / 2;
    const wellY = well.cy - wellH / 2;

    const bay = scene.add.graphics();
    if (outlook) {
      // Holding an animal lights every empty bay with what it would do
      // to her — the one moment this screen uses colour at full
      // strength, and it still carries the mark and the word on top.
      const skin = FEELING_SKIN[outlook];
      bay.fillStyle(skin.fill, 0.95);
      bay.fillRoundedRect(wellX, wellY, wellW, wellH, 10);
      bay.lineStyle(3, skin.stroke, 1);
      bay.strokeRoundedRect(wellX, wellY, wellW, wellH, 10);
    } else {
      // A bay is a recess *in* the vehicle's floor, not a tile *on*
      // it — darker than the floor rather than a paler crate, so "there
      // is nobody here" never has to be read as "there is something
      // here". Four passes make it a hole: a lip of light peeking out
      // below, where the near edge catches the sun; the well; a shaded
      // wall round it; and a second stroke nudged down and right, which
      // reads as depth without a gradient.
      //
      // The same well under a loaded bay, with the crate standing in
      // it. A loaded bay used to be a chrome plate instead, which was
      // right when a bay held an animal and a badge and wrong the
      // moment it held a painted crate: a cream card with a small
      // wooden box on it reads as two objects, and the second one is
      // not a thing in the van.
      bay.fillStyle(BAY_WELL_LIP, 0.85);
      bay.fillRoundedRect(wellX, wellY + 2, wellW, wellH, 10);
      bay.fillStyle(BAY_WELL, 1);
      bay.fillRoundedRect(wellX, wellY, wellW, wellH, 10);
      bay.lineStyle(2.5, BAY_WELL_SHADE, 0.55);
      bay.strokeRoundedRect(wellX, wellY, wellW, wellH, 10);
      bay.lineStyle(2, BAY_WELL_SHADE, 0.3);
      bay.strokeRoundedRect(wellX + 1.5, wellY + 1.5, wellW - 3, wellH - 3, 9);
    }
    container.add(bay);

    if (crate) {
      const record = state.animalsById.get(crate.animalId);
      drawAnimalTile(
        // **The crate she is in, not the crate she ought to be in.**
        // `crate.crateType` is the child's own choice, carried from
        // `putHeldInCrate` through `placeHeld` onto the `LoadedCrate`;
        // this drew `crateDefFor(crate.species)` until 2026-10-09, which
        // is the species default and therefore one design per species
        // however the child chose. A dog put in the secure crate was
        // drawn in a standard one, so the six crate designs could never
        // show on the bed and the choice had no visible consequence —
        // the one thing a screen built around a choice may not do.
        scene, container, record, record?.name ?? '', CRATE_DEFS[crate.crateType],
        { left, top, cx, cy, slotW, slotH, withName },
        // **The animals in the bays wear their feelings too**, so the
        // whole load can be read without tapping anything: a child
        // scanning Big Tilly's nine sees where the trouble is from the
        // faces, and the glyph on the edge between two of them says
        // which pair it is. Same `affectedBy` the panel uses, so the
        // bay and the sentence can never disagree about who minds.
        gridFace(session, crate.animalId),
      );
    } else if (outlook) {
      // The word comes off the *cell*, not the well: the well shrank
      // and the room under it did not, so "Happy" still has somewhere
      // to go on every bay that could carry it before. A mark without
      // its word is a colour a child has to have been taught.
      container.add(makeFeelingBadge(scene, well.cx, well.cy, outlook, {
        withWord: slotH >= 62,
        radius: Math.max(9, Math.min(15, Math.min(wellW, wellH) * 0.28)),
      }));
    }

    // Hit area floored at MIN_TAP, per the idiom on that constant —
    // but never past its neighbour. `BAY_MIN` keeps the drawn pitch at
    // or above MIN_TAP so the floor is normally free, and the pitch is
    // the ceiling for the window where it is not: a hit box 4px short
    // of the floor is a smaller target, while one that overlaps the bay
    // next door picks up the wrong animal.
    //
    // **Measured off the cell, not off the painted well.** The well
    // shrank to the crate it holds and the cell did not move, so this
    // is the one place on the screen where the picture is deliberately
    // smaller than the target: Big Tilly's hole is 40 across and her
    // tap is still 48. Nothing a finger can feel changed. Growing the
    // *rectangle* past the cell would buy nothing either — two
    // overlapping hit boxes hand the overlap to whichever was added
    // last, so the usable target is the pitch however big the
    // rectangle is drawn.
    // An empty bay is where stage two lands, so it is a drop zone as
    // well as a tap target — the same rectangle, so a drag and a tap
    // aim at exactly the same thing.
    if (!crate) {
      zones.push({
        rect: generous(cx, cy, bayHitSize(slotW), bayHitSize(slotH)),
        target: { kind: 'bay', slotIndex: slot },
      });
    }

    const hit = scene.add.rectangle(
      cx, cy, bayHitSize(slotW), bayHitSize(slotH), 0x000000, 0,
    ).setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => {
      if (drag.active) return;
      if (crate) {
        const animal = state.animalsById.get(crate.animalId);
        setMessage(animal ? {
          heading: `${animal.name} the ${animal.species}`,
          tone: null,
          body: [
            // The crate she is in, from the same field the bay draws
            // from, so the picture and the sentence cannot disagree
            // about which crate a child is looking at.
            `${animal.name} is in a ${CRATE_DEFS[crate.crateType].label.toLowerCase()}.`,
            'Tap to lift them out again.',
          ],
          // The same face she is wearing in the bay under the pointer,
          // from the same function, so looking closer never changes
          // the answer.
          cast: {
            members: [{
              id: crate.animalId,
              name: animal.name,
              face: gridFace(session, crate.animalId),
            }],
          },
        } : null);
      } else {
        setMessage(bayHoverCopy(session, slot));
      }
    });
    hit.on('pointerout', () => { if (!drag.active) setMessage(null); });
    hit.on('pointerdown', () => {
      if (crate) {
        callbacks.onLiftFromSlot(slot);
        return;
      }
      // **The second stage cannot happen before the first.** A space
      // asked for while the animal is still loose is answered with the
      // crate she needs rather than with a silent nothing — and never
      // by quietly choosing a crate for her, which would make the
      // choice the screen is now about skippable.
      if (loadStage(session) === 'pick-a-crate') callbacks.onNeedCrate();
      else callbacks.onPlaceInSlot(slot);
    });
    container.add(hit);
  }

  // The vibe glyph, on the edge two bays share — the same drawing the
  // live preview uses, so one mark means one thing.
  //
  // **On the edge, because the feeling belongs to the pair.** Neither
  // animal owns it: a spiral drawn inside the cat's bay would say the
  // cat is a frightening thing to be near, and a spiral between the cat
  // and the dog says what is true, which is that those two together are
  // the problem. Adjacency is north/south/east/west only, so every
  // shared edge between two occupied bays is a candidate and
  // `glyphWorthDrawing` decides which of them is worth the ink.
  //
  // Pushed off the middle of that edge, because the middle is where the
  // animal's name is — and the name moved to the top of the bay, so the
  // push moved with it. A pair above and below each other takes the
  // glyph to one side; a pair beside each other takes it *down*, clear
  // of both name rows, where it used to go up into them.
  //
  // **Halfway between the two crates, which is not halfway between
  // the two bays.** The name row sits at the top of a bay now, so the
  // crate rides low in its cell and the gap between two crates is not
  // where the gap between two cells is. Measuring off the crates puts
  // the mark in the clear strip the two of them leave — 24px between
  // Tilly's rows, 10px between her columns — rather than across the
  // bottom third of both of them, which is where a fixed fraction of
  // the bay put it on the first pass. A glyph arguing with the animal
  // it annotates is the one thing it must not do.
  //
  // It also keeps the marks off each other: the two families sit on
  // perpendicular edges half a cell apart, so a pair-above-below mark
  // and a pair-beside mark can no longer land in the same place, which
  // on nine bays they were doing three times over.
  //
  // Sized off the bay rather than fixed, so nine bays on a lorry get a
  // smaller mark than two on a trike, and small: sixteen pixels on
  // Tilly against a thirty-pixel animal.
  const nudge = tileArt({
    left: -slotW / 2, top: -slotH / 2, cx: 0, cy: 0, slotW, slotH, withName,
  });
  const crateCentre = (slot: number) => {
    const c = slotCentre(slot);
    return { x: c.x + nudge.cx, y: c.y + nudge.cy };
  };
  const glyphR = Math.max(7, Math.min(11, Math.min(slotW, slotH) * 0.2));
  for (const note of settledNotes(session)) {
    if (!glyphWorthDrawing(session, note)) continue;
    const a = crateCentre(note.slotIndex);
    const b = crateCentre(note.neighbourSlotIndex);
    // One above the other, in a bay that carries a name: the name is
    // *in* the strip between the two crates, because it sits at the
    // top of the lower one. So the mark rides up onto the bottom rim
    // of the upper crate instead — the least-telling pixels in either
    // bay, and certainly better than sitting on top of a word. Where
    // there is no name, as on all nine of Big Tilly's, the strip is
    // clear floor and the mark goes in the middle of it.
    const y = a.x === b.x && nudge.nameAbove
      ? Math.min(a.y, b.y) + nudge.size / 2
      : (a.y + b.y) / 2;
    const gfx = scene.add.graphics();
    drawVibeGlyph(gfx, (a.x + b.x) / 2, y, moodOf(note), glyphR);
    container.add(gfx.setDepth(6));
  }
}

// ── The panel ────────────────────────────────────────────────

/**
 * The fixed message panel. Returns a setter the tray and the bays use
 * to repaint it on hover without redrawing the screen.
 *
 * While an animal is held, her painting sits in the panel's bottom
 * corner. "In your hands" is a sentence a seven-year-old has to read
 * and believe; a picture of the animal she is carrying is the same fact
 * at a glance, and it is the one thing on this screen that changes with
 * no visible cause otherwise.
 */
function drawPanel(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  state: CrateLoadingState,
  box: Box,
): (copy: PanelCopy | null) => void {
  // Its own layer. The plate is repainted when the feeling changes —
  // a pointer crossing the bays can take the panel from cream to amber
  // to red — and a plate added straight to the view's container would
  // land on top of the car park every time it was rebuilt.
  const layer = scene.add.container(0, 0);
  container.add(layer);

  let painted: Mood | null | undefined;
  let plate: Phaser.GameObjects.Container | undefined;
  const setPlate = (tone: Mood | null): void => {
    if (plate && painted === tone) return;
    painted = tone;
    plate?.destroy();
    plate = createChromePlate(scene, box.x + box.w / 2, box.y + box.h / 2, box.w, box.h, {
      // **The panel carries the news, not just its heading.** The four
      // feelings already have a colour each, drawn on the glyph between
      // two bays; the paper the sentence is printed on is now the same
      // colour, so the answer arrives before the words are read. Cream
      // is kept for the states that are not a feeling — an empty van,
      // an animal in your hands — and so stays one meaning: paper with
      // nothing to report.
      tint: tone
        ? { fill: FEELING_SKIN[tone].fill, stroke: FEELING_SKIN[tone].stroke }
        : undefined,
    });
    layer.addAt(plate, 0);
  };

  // The sentences keep the full width; the faces sit above them, which
  // is the change — the picture is read first because it is first.
  const innerW = box.w - CHROME.padX * 2;

  // On a landscape phone the plate gets about two-thirds the height its
  // longest copy wants, and there is nothing to take it from — the tray
  // and the vehicle are already at their floors. So the padding and the
  // leading close up rather than the words running off the bottom of
  // the paper onto the gravel. The type size does not move; that floor
  // is not negotiable, and it is the only thing here that is not.
  const { tight, facesH, showFaces, showReactions } = panelBand(box.h);
  // On a plate shorter than the copy, a copy with a short form sets the
  // short form — see `panelIsCompact`. Decided here from the plate and
  // applied below copy by copy, because only some copies have one.
  const compactPlate = panelIsCompact(box.h);
  const compactPad = compactPanelPadding(box.h);
  const leading = tight ? 0 : 6;
  const bandH = showFaces ? facesH + SPACE.s : 0;

  // More space below the content than above it, at every plate size —
  // `panelPadding` is the whole of the rule and why.
  const { above: padTop, below: bottomPad } = panelPadding(box.h, bandH);
  const headingY = box.y + padTop + bandH;

  const facesBox: Box = {
    x: box.x + CHROME.padX, y: box.y + padTop, w: innerW, h: facesH,
  };
  // Its own container, because a pointer moving across the bays
  // repaints this and nothing else: the faces are rebuilt, the plate
  // and the type under them are not, and the panel never moves.
  const faces = scene.add.container(0, 0);
  layer.add(faces);

  const heading = scene.add.text(box.x + CHROME.padX, headingY, '', {
    fontSize: TYPE.lead, fontFamily: FONTS.ui, fontStyle: 'bold',
    color: CHROME.ink, wordWrap: { width: innerW }, resolution: TEXT_RESOLUTION,
  }).setOrigin(0, 0);
  layer.add(heading);

  // Three blocks rather than one, so the takeaway can be set bold while
  // the rest of the paragraph is not. They share one left edge, which
  // is the heading's — the whole panel has exactly one.
  const bodyStyle: Phaser.Types.GameObjects.Text.TextStyle = {
    fontSize: TYPE.body, fontFamily: FONTS.ui, color: CHROME.ink,
    lineSpacing: leading, resolution: TEXT_RESOLUTION,
  };
  const blocks = [0, 1, 2].map(() => {
    const t = scene.add.text(box.x + CHROME.padX, headingY, '', bodyStyle).setOrigin(0, 0);
    layer.add(t);
    return t;
  });
  blocks[1].setFontStyle('bold');

  // One hidden text object in each weight, so the line breaks are
  // measured in the face that will draw them rather than estimated.
  const rulers = [0, 1].map((i) => {
    const t = scene.add.text(0, 0, '', bodyStyle).setVisible(false);
    if (i === 1) t.setFontStyle('bold');
    layer.add(t);
    return t;
  });
  const measurer = (bold: boolean) => (line: string): number => {
    const r = rulers[bold ? 1 : 0];
    r.setText(line);
    return r.width;
  };

  // The carried animal's corner picture, when there is one — kept so the
  // short form can stand it down. A corner animal is 56px wide against a
  // one-line remedy that runs to 208 of the 216 there are, and the two
  // would be drawn over one another.
  let carried: Phaser.GameObjects.GameObject & { setVisible(v: boolean): unknown } | undefined;
  if (!showFaces) {
    // No room for the band. The carried animal goes back in the corner,
    // which is where she lived before there was one — a small picture
    // beats no picture, and on this viewport it is a small picture or
    // the fifth line of a refusal.
    const held = heldAnimal(state.session);
    const heldRecord = held ? state.animalsById.get(held.id) : undefined;
    const carrySize = Math.min(56, box.h - CHROME.padY * 2);
    if (heldRecord && carrySize > 24) {
      carried = createAnimalSprite(
        scene,
        box.x + box.w - CHROME.padX - carrySize / 2,
        box.y + box.h - CHROME.padY - carrySize / 2,
        heldRecord,
        { width: carrySize, height: carrySize },
      ).setDepth(4);
      layer.add(carried);
    }
  }

  const standing = panelCopy(state);
  const apply = (copy: PanelCopy | null): void => {
    const full = copy ?? standing;
    // **The short form where the plate is shorter than the copy, and
    // only for a copy that has one.** The rest are set as they were: a
    // copy with no short form on a short plate is the containment's
    // business, below, and was before this existed.
    const short = compactPlate ? full.compact : undefined;
    const c: PanelCopy = short
      // Plain, whatever the full copy bolds: see `compactCopyFor`.
      ? { ...full, heading: short.heading, tone: short.tone, body: short.body, boldLine: null }
      : full;
    carried?.setVisible(!short);
    // Where the heading stands, how much of the plate is held back
    // under the words, and how far down the first line starts. The short
    // form is laid out on its own two numbers; everything else keeps the
    // plate's own, which is what it has always had.
    const lay = short
      ? { top: box.y + compactPad.above, slot: 26, below: compactPad.below }
      : { top: headingY, slot: tight ? 26 : 34, below: bottomPad };
    heading.setY(lay.top);
    setPlate(c.tone);
    // **The feeling is said once.** Where the band under the animals
    // carries the word — "Worried" under the hedgehog who is worried —
    // the heading would be the same word a second time, and a heading
    // sits directly under the left-hand animal, which is how the word
    // came to be read as belonging to the wrong animal in the first
    // place. So the heading drops a bare mood word whenever the picture
    // is attributing it, and keeps it on the viewport too short to draw
    // the band, where it is the only place the word can go.
    const attributed = showReactions
      && (c.cast?.members ?? []).some((m) => m.reaction !== undefined);
    const headingText = attributed && MOOD_WORDS.has(c.heading) ? '' : c.heading;
    heading.setText(headingText);
    heading.setVisible(headingText.length > 0);
    heading.setColor(c.tone ? FEELING_SKIN[c.tone].ink : CHROME.ink);

    // The takeaway, and the lines either side of it.
    //
    // **One sentence, not one line.** The rules write two sentences in
    // a single note — "Pepper the cat makes Bracken the hedgehog
    // worried. Bracken would be happier a space away." — and setting
    // the whole note bold is three bold lines, which is a paragraph in
    // bold rather than a takeaway. The first sentence is the fact; what follows it is the
    // consequence, and it is set plain. No word changes: only where
    // the weight stops.
    const bold = c.boldLine === undefined ? 0 : c.boldLine;
    const lines = c.body.filter((l) => l.length > 0);
    let parts: string[][] = [lines, [], []];
    if (bold !== null && bold < lines.length) {
      const [key, rest] = splitTakeaway(lines[bold]);
      parts = [lines.slice(0, bold), key, [...rest, ...lines.slice(bold + 1)]];
    }

    // Never above the heading's last line, and never at a fixed offset
    // that a two-line heading would run through. With no heading the
    // words start where it would have been, so the type does not move
    // up and down as a pointer crosses the bays.
    let y = headingText.length === 0
      ? lay.top
      : Math.max(lay.top + lay.slot, heading.y + heading.height + SPACE.xs);
    // **A sentence that will not fit is left out whole, and only after
    // one has been set.** On the 812pt phone the plate is shorter than
    // its copy — see `panelPadding`, and the escalation it is pinned by
    // — and what it did about it was run the last lines off the bottom
    // of the paper and across the orange lead-in on the floor below,
    // which reads as a fault rather than as a short panel. What goes is
    // the last sentence, which on every copy this panel writes is the
    // explanation; the heading and the first sentence, which is what to
    // do next, stay. Marcus's own rule for a highlighted line is that
    // it must make sense if it is the only one read, and these do.
    //
    // Never a part sentence and never the only one: a sentence cut in
    // the middle is worse than a sentence that is not there, and a
    // panel with nothing on it is worse than either.
    const limit = box.y + box.h - Math.max(0, lay.below);
    let drawn = 0;
    parts.forEach((part, i) => {
      const block = blocks[i];
      const set = part.flatMap((line) => setLines(measurer(i === 1), line, innerW));
      block.setText(set.join('\n'));
      block.setY(y);
      const dropped = drawn > 0 && set.length > 0 && y + block.height > limit;
      if (dropped) block.setText('');
      block.setVisible(set.length > 0 && !dropped);
      if (set.length > 0 && !dropped) {
        y += block.height + leading;
        drawn += 1;
      }
    });

    if (!showFaces) return;
    faces.removeAll(true);
    drawCast(scene, faces, state, c.cast, facesBox, showReactions);
  };
  apply(null);
  return apply;
}

/**
 * The faces band — the two animals the panel is talking about, large,
 * side by side, with their names above them and the pair's glyph
 * between.
 *
 * Side by side because that is how they would be sitting: the sentence
 * is about two animals next to each other in a van, and the picture of
 * it is two animals next to each other. One animal centres; two with
 * `apart` set are pushed to the ends with the van's floor showing
 * between them, which is what "nobody is sitting next to anybody"
 * looks like; nobody at all draws the empty well.
 *
 * Drawn out of their crates here, and that is deliberate: the crate is
 * already on the bay and on the shelf, and a rim round a face in the
 * one place the face is the whole point would be the same mistake at a
 * larger size.
 *
 * **The name above, the feeling below.** Three rows, and which row a
 * word is in is what says who it belongs to: the name is a label on the
 * animal, and so is the word for what she is feeling. Marcus, on the
 * panel that put one feeling above a pair of animals: "the name of the
 * emotion or reaction needs to be below the animal that is displaying
 * it... in fact it's the hedgehog that is worried". Two animals with
 * two different feelings therefore wear one word each, and an animal
 * with nothing to report wears none.
 */
function drawCast(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  state: CrateLoadingState,
  cast: PanelCast | undefined,
  box: Box,
  /** The band is tall enough for the word under each animal. */
  showReactions = false,
): void {
  const nameH = NAME_ROW_H;
  const reactionH = showReactions ? REACTION_ROW_H : 0;
  const artH = Math.max(16, box.h - nameH - reactionH);
  const cy = box.y + nameH + artH / 2;
  const reactionY = box.y + nameH + artH + reactionH / 2;

  /** The word for what this animal is feeling, under this animal. */
  const drawReaction = (x: number, mood: Mood | undefined, maxW: number): void => {
    if (!showReactions || !mood) return;
    container.add(fitLabel(scene, x, reactionY, MOOD_WORD[mood], maxW, {
      fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.ui, fontStyle: 'bold',
      color: FEELING_SKIN[mood].ink, resolution: TEXT_RESOLUTION,
    }));
  };

  // The hole an animal goes in, drawn exactly as the bays draw theirs.
  const drawWell = (x: number, y: number, s: number): void => {
    const gfx = scene.add.graphics();
    gfx.fillStyle(BAY_WELL_LIP, 0.85);
    gfx.fillRoundedRect(x, y + 2, s, s, 10);
    gfx.fillStyle(BAY_WELL, 1);
    gfx.fillRoundedRect(x, y, s, s, 10);
    gfx.lineStyle(2.5, BAY_WELL_SHADE, 0.55);
    gfx.strokeRoundedRect(x, y, s, s, 10);
    container.add(gfx);
  };

  if (!cast || cast.members.length === 0) {
    // **The empty van, and it is the one state with no pair to draw.**
    // A single well centred in a 370px band left a void either side of
    // it that was the largest empty area on the screen — and a band
    // that wide holding one small square says nothing a child can use.
    //
    // So the band draws the instruction instead of illustrating its
    // absence: the first animal waiting, an arrow, and the crate she
    // goes in. That is the sentence underneath it as a picture, which
    // is the order a child reads the panel in, and everything needed to
    // read it is on the drawing. With nobody waiting there is no
    // instruction to give and the empty well stands on its own.
    //
    // **The animal is loose and the crate is empty, because that is the
    // first move now.** It used to draw her already in her crate with
    // an empty bay beside her, which was the whole of the old
    // interaction; a child shown that picture would be looking for the
    // step the screen has just stopped doing for her.
    const next = waitingToBoard(state.session)[0];
    const record = next ? state.animalsById.get(next.id) : undefined;
    const s = Math.min(artH, box.h, 112);
    if (!next) {
      drawWell(box.x + box.w / 2 - s / 2, cy - s / 2, s);
      return;
    }

    const step = Math.min(s, box.w * 0.3);
    const fromX = box.x + box.w / 2 - box.w * 0.24;
    const toX = box.x + box.w / 2 + box.w * 0.24;
    if (record) {
      container.add(createAnimalSprite(
        scene, fromX, cy, record, { width: step, height: step },
      ));
    }
    container.add(fitLabel(
      scene, fromX, box.y + nameH / 2, next.name, box.w * 0.42, {
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.ui, fontStyle: 'bold',
        color: CHROME.ink, resolution: TEXT_RESOLUTION,
      },
    ));
    container.add(makeCrateFace(
      scene, toX, cy, crateDefFor(next.species), step,
    ));
    // The arrow is the screen's one "do this" colour, the same orange
    // as the block over the animals waiting — and it is level with the
    // middle of what it joins, which is the picture, not the names.
    const arrow = scene.add.graphics();
    const half = Math.min(22, box.w * 0.07);
    arrow.lineStyle(3.5, ACT, 0.9);
    arrow.beginPath();
    arrow.moveTo(box.x + box.w / 2 - half, cy);
    arrow.lineTo(box.x + box.w / 2 + half, cy);
    arrow.moveTo(box.x + box.w / 2 + half - 7, cy - 6);
    arrow.lineTo(box.x + box.w / 2 + half, cy);
    arrow.lineTo(box.x + box.w / 2 + half - 7, cy + 6);
    arrow.strokePath();
    container.add(arrow);
    return;
  }

  const nameStyle: Phaser.Types.GameObjects.Text.TextStyle = {
    fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.ui, fontStyle: 'bold',
    color: CHROME.ink, resolution: TEXT_RESOLUTION,
  };

  if (cast.members.length === 1) {
    const m = cast.members[0];
    const record = state.animalsById.get(m.id);
    const size = Math.min(artH, box.w * 0.6);
    const cx = box.x + box.w / 2;
    if (record) {
      container.add(createAnimalSprite(
        scene, cx, cy, record,
        { width: size, height: size, stateOverride: m.face },
      ));
    }
    container.add(fitLabel(
      scene, cx, box.y + nameH / 2, m.name, box.w - SPACE.m, nameStyle,
    ));
    drawReaction(cx, m.reaction, box.w - SPACE.m);
    return;
  }

  // Two of them. `apart` pushes them to the ends and draws nothing
  // between; a pair sits close with the glyph on the gap they share,
  // which is the same place it sits between two bays.
  const spread = cast.apart ? 0.29 : 0.25;
  const size = Math.min(artH, box.w * (cast.apart ? 0.34 : 0.4));
  // Larger here than it is on a shared bay edge, and the panel's own
  // colour is why: the glyph's wash is the feeling's pale fill, which
  // is now also the paper it is drawn on, so the wash does no lifting
  // and the drawn line is the whole mark. A line carrying it alone has
  // to be big enough to read as a spiral, a zigzag, a heart or a moon.
  const glyphR = Math.max(11, Math.min(22, size * 0.3));
  cast.members.slice(0, 2).forEach((m, i) => {
    const cx = box.x + box.w / 2 + (i === 0 ? -spread : spread) * box.w;
    const record = state.animalsById.get(m.id);
    if (record) {
      container.add(createAnimalSprite(
        scene, cx, cy, record,
        { width: size, height: size, stateOverride: m.face },
      ));
    }
    container.add(fitLabel(
      scene, cx, box.y + nameH / 2, m.name, box.w * 0.46, nameStyle,
    ));
    drawReaction(cx, m.reaction, box.w * 0.46);
  });

  if (cast.level) {
    const gfx = scene.add.graphics();
    drawVibeGlyph(gfx, box.x + box.w / 2, cy, cast.level, glyphR);
    container.add(gfx);
  }
}


// ── The loading bay floor ────────────────────────────────────

/**
 * How the floor divides: the animals on the left, the crates on the
 * right.
 *
 * **Left to right is the order the child works in.** She takes an
 * animal off the floor and puts her in a crate, so the animals are on
 * the side she reads from and the crates are the next thing along. The
 * whole of stage one is then a short sideways drag rather than a reach
 * across the screen.
 *
 * The shelf is sized first and the animals take what is left, for the
 * same reason the reading column is sized before the car park: there
 * are always exactly six crates and they have a width below which they
 * stop being tappable, while animals simply draw smaller.
 */
export function splitLoadingBay(box: Box): { loose: Box; shelf: Box } {
  const gutter = SPACE.xl;
  // **The shelf gets the wider share of what is spare, and the animals
  // are still the larger half.** The row of animals is bounded by its
  // own height — a dog is as tall as the band and no wider than a dog —
  // so width given to it beyond what the row needs is floor nobody
  // stands on, while every pixel given to the shelf is a bigger crate.
  // At 0.42 the crates came out at 59px on a desktop; at 0.46 they are
  // 68, and the animals' row still has room to spare.
  const shelfW = Math.round(Math.max(
    Math.min(SHELF_MIN_W, box.w * 0.45),
    Math.min(box.w * 0.46, SHELF_MAX_W),
  ));
  const looseW = Math.max(MIN_TAP, box.w - gutter - shelfW);
  return {
    loose: { x: box.x, y: box.y, w: looseW, h: box.h },
    shelf: { x: box.x + box.w - shelfW, y: box.y, w: shelfW, h: box.h },
  };
}

/**
 * How big the loose animals want to be, given the width of floor they
 * have — the dog's drawn height, and every other animal's share of it.
 *
 * Width is what bounds this row almost everywhere: eight animals on one
 * ground line run out of floor long before they run out of height. So
 * the layout asks this *before* it decides how tall the band is, and
 * gives the band the height the row asks for rather than a share of the
 * viewport — height beyond it is floor nobody stands on, and on a short
 * viewport that floor is the car park's column.
 */
export function looseRowScale(
  units: readonly number[],
  width: number,
  gap: number,
): number {
  if (units.length === 0) return 0;
  const sum = units.reduce((a, b) => a + b, 0);
  if (sum <= 0) return 0;
  return (width - gap * (units.length - 1)) / sum;
}

/**
 * The width the pager takes off the end of the animals' row, when there
 * is a pager. One tap target, and no wider.
 */
export const WAITING_PAGER_W = MIN_TAP;

/** Where every waiting animal stands, how big, and on which page. */
export interface LooseRowPlan {
  /** The box each animal is drawn inside. */
  size: number[];
  /** Where her middle goes, from the left edge of the row. */
  cx: number[];
  /** Which page she stands on. */
  page: number[];
  /** How many pages the queue takes. One means no pager. */
  pages: number;
  /** The width the animals have — `box.w` less the pager, if there is one. */
  rowW: number;
}

/**
 * Where each loose animal stands, how big she is drawn, and which page
 * of the queue she is on.
 *
 * **Sized against each other, never against a cell.** Each animal gets
 * a share of the band's height from `SPECIES_SIZE`, so a hedgehog is a
 * third of a dog and reads as one. If the row of them is wider than the
 * floor, every one of them comes down by the same factor — the row
 * shrinks, the proportions do not, which is the one thing that has to
 * survive a narrow window.
 *
 * The row starts on the floor's own left edge rather than being centred
 * in it: a centred row re-centres itself every time somebody boards,
 * which would move the animal a child was reaching for.
 *
 * ## The pitch is a tap target, so it is the pitch that decides how many
 * stand in view
 *
 * **Marcus's decision, 9 October 2026: no two animals' tap targets may
 * overlap.** The pitch was the drawn size plus `GAP`, and a grab handle
 * is floored at `MIN_TAP` whatever is drawn — so two 30px animals 38px
 * apart shared 14px of target, and a child aiming at the hedgehog picked
 * up the rabbit. The pitch is now the larger of the drawn gap and the
 * two handles' own half-widths, which is `MIN_TAP` between two animals
 * drawn smaller than one and the drawn gap between two drawn larger.
 * The first animal's handle is kept inside the row for the same reason.
 *
 * **The row comes down as far as `CRATE_ART_MIN` and then pages rather
 * than shrinking further.** Floored pitches make the row a little wider
 * than its drawn edges do, so the scale the width allows is now slightly
 * too large: at 820x620 the six-animal row wanted 403px of a 393px
 * floor. Three per cent off the scale recovers that, and keeps the
 * screen Marcus signed off showing all six, so the scale is solved
 * against the laid-out row rather than against the sum of the drawn
 * widths.
 *
 * **What stops it there is the smallest animal, not the largest.** A
 * full lorry's eight share the same floor, so the width already has the
 * dog at 68 and the bat at 20; staying on one page would mean coming
 * down another fifth, to a 54px dog and a 16px bat — and the bat is
 * already the hard one to recognise at 0.3 of a dog. So the search will
 * not take the smallest animal below `CRATE_ART_MIN`, the size this file
 * already holds as small enough to stop being anybody in particular.
 * **This is where Marcus's instruction that the animals stay large is
 * spent: it buys a page turn instead of another fifth off every animal.**
 *
 * Where the floor is so short that the width has already taken the
 * animals under that size — the landscape phone, where the band is 48px
 * and the bat is 14 — no shrinking is allowed at all and the queue pages
 * straight away.
 *
 * **And once it is paging, they grow.** A page is not the queue: each
 * one has the floor to itself, and the scale solved for all eight
 * standing together is drawing them for a row that is not there. So the
 * scale goes back up as far as the band's height allows, stopping
 * before it would cost another page turn — which at 820x620 takes a
 * lorry's load from a 68px dog to a 108px one. Paging makes the animals
 * larger here, not smaller.
 *
 * **The pages are measured off everybody offered, so they do not move.**
 * Which page an animal is on is decided once, from the whole cargo, and
 * never from whoever is still waiting — a queue re-partitioned on every
 * tap would move the animal a child was reaching for, which is the fault
 * the row's left-hand anchoring exists to avoid. Boarded animals leave
 * their gap, exactly as they did on a single page.
 */
export function looseRow(
  units: readonly number[],
  box: { w: number; h: number },
  gap: number,
): LooseRowPlan {
  if (units.length === 0) {
    return { size: [], cx: [], page: [], pages: 0, rowW: box.w };
  }

  /**
   * Walk the queue at this scale, starting a new page where the next
   * animal's grab handle would not fit in `rowW`.
   */
  const lay = (scale: number, rowW: number): LooseRowPlan => {
    const size = units.map((u) => Math.max(1, Math.round(u * scale)));
    const cx: number[] = [];
    const page: number[] = [];
    let at = 0;
    let prev = -1;
    let p = 0;
    for (let i = 0; i < size.length; i += 1) {
      const half = Math.max(size[i], MIN_TAP) / 2;
      let centre = prev < 0
        ? half
        : at + Math.max(
          (size[prev] + size[i]) / 2 + gap,
          Math.max(size[prev], MIN_TAP) / 2 + half,
        );
      // The first animal on a page never turns the page, however wide
      // she is: a page with nobody on it is not a page.
      if (prev >= 0 && centre + half > rowW) {
        p += 1;
        centre = half;
      }
      cx.push(centre);
      page.push(p);
      at = centre;
      prev = i;
    }
    return { size, cx, page, pages: p + 1, rowW };
  };

  const wanted = looseRowScale(units, box.w, gap);
  const want = Math.max(2, Math.min(box.h, wanted > 0 ? wanted : box.h));
  const whole = lay(want, box.w);
  if (whole.pages === 1) return whole;

  // The smallest scale the search may take: the one that puts the
  // smallest animal in the cargo on `CRATE_ART_MIN`, or `want` itself
  // where the floor is so short that she is already under it.
  const least = Math.min(want, CRATE_ART_MIN / Math.min(...units));
  const scale = least;
  if (least < want && lay(least, box.w).pages === 1) {
    // Twenty halvings settle a range of a few hundred pixels to well
    // under a pixel of scale.
    let lo = least;
    let hi = want;
    for (let i = 0; i < 20; i += 1) {
      const mid = (lo + hi) / 2;
      if (lay(mid, box.w).pages === 1) lo = mid; else hi = mid;
    }
    return lay(lo, box.w);
  }

  // They do not all fit at any size the smallest of them survives, so
  // the queue pages. The pager stands at the end of the row and its own
  // width comes off before the pages are worked out, or the last animal
  // on each page would stand under it.
  const paged = Math.max(MIN_TAP, box.w - WAITING_PAGER_W - gap);
  const start = lay(scale, paged);

  // **And then they grow, because a page is not the queue.** The scale
  // above was solved for the whole queue standing on one floor; once it
  // is in pages, each page has the floor to itself and the animals were
  // being drawn for a row that is not there — page two of a lorry's
  // eight came out as four 12-to-22px animals on an empty strip of
  // gravel. So the scale goes back up as far as the band's height
  // allows, stopping before it would cost another page turn. The page
  // count is monotone in the scale, so this is a search and not a
  // guess, and the sizes it settles on are the same on every page.
  if (scale < box.h) {
    let lo = scale;
    let hi = box.h;
    let best = start;
    for (let i = 0; i < 20; i += 1) {
      const mid = (lo + hi) / 2;
      const tried = lay(mid, paged);
      if (tried.pages <= start.pages) { lo = mid; best = tried; } else hi = mid;
    }
    return best;
  }
  return start;
}

/**
 * An inverse block naming a place a child acts, with a white arrow
 * aligned on the text's own centre line.
 *
 * Marcus's lead-in: the words reversed out of a solid colour, in a
 * colour no panel uses. `ACT` is that colour, the brand orange, and it
 * now marks both halves of the loading bay floor — the animals and the
 * crates — because both are places the child acts and the two of them
 * are one band. It is still the only orange on the screen, so it still
 * means exactly one thing.
 *
 * **The arrow points at the thing it names.** In the tall layout both
 * sets of pieces run off to the right of their lead-in, so both arrows
 * point right; on a short viewport the crates stand in a rack *under*
 * theirs, and an arrow pointing right would be pointing at the edge of
 * the screen. An arrow that leads nowhere is the fault Marcus's rule
 * names — every arrow says what it is — so the rack's turns down.
 */
function drawLeadIn(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  x: number,
  y: number,
  words: string,
  points: 'right' | 'down' = 'right',
): void {
  const label = scene.add.text(0, 0, words, {
    fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.ui, fontStyle: 'bold',
    color: COLOURS.white, resolution: TEXT_RESOLUTION,
  }).setOrigin(0, 0.5);
  const arrowW = 14;
  const blockH = label.height + SPACE.s;
  const blockW = label.width + SPACE.l + arrowW + SPACE.s;
  const blockCy = y + blockH / 2;
  const block = scene.add.graphics();
  block.fillStyle(ACT, 1);
  block.fillRoundedRect(x, y, blockW, blockH, 7);
  label.setPosition(x + SPACE.s + SPACE.xs, blockCy);
  const ax = x + blockW - SPACE.s - arrowW;
  block.lineStyle(2.5, 0xffffff, 1);
  block.beginPath();
  if (points === 'down') {
    // The same shaft and head, turned a quarter: it starts on the
    // label's centre line, as the right-pointing one does, and runs to
    // the foot of the block.
    const cx = ax + arrowW / 2;
    const tip = y + blockH - SPACE.xs;
    block.moveTo(cx, label.y - arrowW / 2);
    block.lineTo(cx, tip);
    block.moveTo(cx - 4.5, tip - 5);
    block.lineTo(cx, tip);
    block.lineTo(cx + 4.5, tip - 5);
  } else {
    block.moveTo(ax, label.y);
    block.lineTo(ax + arrowW, label.y);
    block.moveTo(ax + arrowW - 5, label.y - 4.5);
    block.lineTo(ax + arrowW, label.y);
    block.lineTo(ax + arrowW - 5, label.y + 4.5);
  }
  block.strokePath();
  container.add(block);
  container.add(label);
}

/**
 * The floor of the loading bay: the animals waiting on it, and the
 * crates standing beside them.
 *
 * **The animals are loose on the floor and the crates stand beside
 * them.** They used to be chips in the right-hand column under the
 * panel, each one a rounded plate holding a crate holding an animal —
 * three frames round every animal. Marcus, 2026-10-09: "The waiting to
 * board area is crowded and there's no reason for the animals to be
 * showing inside those rounded corner rectangles and then the crates
 * and then the animal inside. Get rid of the outlines and just show the
 * animals that are waiting to board."
 *
 * It is where both halves of the mechanic start, and the animals are
 * always on the side the child reads from with the crates the next
 * thing along, so the first drag is a short sideways one. In the tall
 * layout the two of them share one full-width strip across the bottom
 * (`splitLoadingBay`); on a short viewport the crates stand up in a
 * rack of their own beside the reading column, because six crates at
 * the tap floor will not fit in a strip a landscape phone can spare.
 * Either way the pieces are never resized by what the child has done,
 * so nothing she is reaching for moves.
 *
 * Both halves' lead-in rows are the same height and both sets of pieces
 * end on the same line — `contentBottom` — so the animals' feet and the
 * bottom crate stand on one ground line in both shapes.
 */
function drawLoadingBay(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  state: CrateLoadingState,
  callbacks: CrateLoadingCallbacks,
  setMessage: (copy: PanelCopy | null) => void,
  zones: DropZone[],
  drag: DragFlag,
  cols: LoadingColumns,
): void {
  const { loose, shelf, labelH } = cols;
  drawLeadIn(scene, container, loose.x, loose.y, titleCase('Waiting to board'));
  drawLeadIn(
    scene, container, shelf.x, shelf.y, titleCase('Crates'),
    cols.kind === 'short' ? 'down' : 'right',
  );

  const below = (box: Box): Box => ({
    x: box.x,
    y: box.y + labelH + SPACE.s,
    w: box.w,
    h: Math.max(MIN_TAP, box.h - labelH - SPACE.s),
  });
  // The shelf first, so the animals can be handed the thing that
  // lights it up while one of them is being dragged across it.
  const preview = drawCrateShelf(
    scene, container, state, callbacks, setMessage, zones, drag, below(shelf),
  );
  drawLooseAnimals(
    scene, container, state, callbacks, setMessage, zones, drag, preview, below(loose),
  );
}

/**
 * A handle on the shelf's marks, so the animals can light it up while
 * one of them is being dragged across it.
 *
 * `show(animal)` draws what every crate would mean for her;
 * `show(null)` puts the shelf back to rest. Nothing in the session
 * changes — this is a preview, and the same preview a tap gives.
 */
interface ShelfPreview {
  show: (animal: LoadableAnimal | null) => void;
}

/**
 * What the panel says about one crate and one animal: whether it suits
 * her, and what to do next.
 *
 * `inIt` is true when she is already sitting in this crate, which
 * changes only the second line — the next move is the vehicle rather
 * than the crate.
 */
function crateCopy(
  state: CrateLoadingState,
  animal: LoadableAnimal,
  crate: CrateType,
  inIt: boolean,
): PanelCopy {
  const verdict = describeCrateChoice(animal, crate);
  return {
    heading: titleCase(`${animal.name} the ${animal.species}`),
    // **Cream, whichever crate it is.** The four colours on this
    // screen say how an animal feels about the animal beside her;
    // a crate is not a neighbour, and amber on a crate would have
    // taught a child that the two facts are the same fact. What
    // answers here is the sentence, set bold, and the shelf behind
    // it, which shows in weight and shape which crates suit her —
    // see `ShelfPreview.show`.
    tone: null,
    body: [
      verdict.text,
      inIt
        ? `Drag ${animal.name} to a space in ${state.vehicle.name}.`
        : `Put ${animal.name} in to travel.`,
    ],
    cast: { members: [castOne(animal)] },
  };
}

/** What the panel says about a loose animal: the crate she needs. */
function looseCopy(animal: LoadableAnimal, lifted: boolean): PanelCopy {
  const crate = crateDefFor(animal.species).label.toLowerCase();
  return {
    heading: titleCase(`${animal.name} the ${animal.species}`),
    tone: null,
    body: [
      `${animal.name} travels best in a ${crate}.`,
      lifted
        ? 'Drag them to a crate, or tap the crate.'
        : 'Drag them to a crate, or tap them to pick them up.',
    ],
    cast: { members: [castOne(animal)] },
  };
}

/**
 * The animals waiting to board — loose on the floor, nothing round
 * them, at their sizes relative to each other.
 *
 * **Nothing round them, and that is the instruction.** Each one used to
 * be a rounded plate holding a painted crate holding the animal: three
 * frames, of which the outer two said nothing a child needed on the way
 * in. What is left is the animal, standing on the floor, which is what
 * she is.
 *
 * **No names here either**, and that is a departure from the rule that
 * names sit above the animals. The rule was settled for the vehicle bed
 * and for the panel, where an animal is placed and her name is a label
 * on her; on the floor the names were the last furniture left, and six
 * of them on one baseline above animals of six different heights reads
 * as a row of captions floating over a row of animals. Whoever is under
 * the pointer or in the child's hands is named in the panel, large,
 * with the sentence about her. Recorded in
 * `.claude/notes/loading-screen-drag.md`, and cheap to put back.
 *
 * The animal in the child's hands who has not been put in a crate yet
 * keeps her place in the row, raised off the floor with her shadow
 * under her. She is still the thing to drag, so she has to still be
 * there to drag — and her place not changing is what stops the row
 * shuffling under a child's hand.
 */
function drawLooseAnimals(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  state: CrateLoadingState,
  callbacks: CrateLoadingCallbacks,
  setMessage: (copy: PanelCopy | null) => void,
  zones: DropZone[],
  drag: DragFlag,
  preview: ShelfPreview,
  box: Box,
): void {
  const { session } = state;
  const held = heldAnimal(session);
  const heldLoose = held && !heldCrateType(session) ? held : null;

  // On the floor: everybody not aboard, and the animal in your hands
  // only while she is still loose — once she is in a crate she is on
  // the shelf, in it.
  const order = (a: LoadableAnimal): number => session.offered.indexOf(a);
  const onFloor = heldLoose
    ? [...waitingToBoard(session), heldLoose].sort((a, b) => order(a) - order(b))
    : waitingToBoard(session);

  if (onFloor.length === 0) {
    zones.push({ rect: { ...box }, target: { kind: 'floor' } });
    container.add(
      scene.add.text(
        box.x + SPACE.s, box.y + Math.min(box.h, MIN_TAP) / 2,
        held
          ? `Everybody else is already in ${state.vehicle.name}.`
          : `Everybody is in ${state.vehicle.name}.`,
        {
          fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.ui,
          color: CHROME.inkMuted, wordWrap: { width: box.w - SPACE.m },
          resolution: TEXT_RESOLUTION,
        },
      ).setOrigin(0, 0.5),
    );
    return;
  }

  // **Measured off everybody offered, not off whoever is still
  // waiting.** A row re-measured on every tap gives the remaining
  // animals a new size and a new place each time, so the picture jumps
  // because of something the child did somewhere else. Measured once,
  // the row simply shortens from the right — and which page each animal
  // is on is settled the same way, once.
  const plan = looseRow(
    session.offered.map((a) => SPECIES_SIZE[a.species]),
    { w: box.w, h: box.h },
    GAP,
  );
  const { size, cx } = plan;

  // The floor is a space of its own: a crated animal dragged back down
  // here is put down, out of her crate. It stops where the animals do,
  // so the pager is a control and not somewhere to drop an animal.
  zones.push({ rect: { ...box, w: plan.rowW }, target: { kind: 'floor' } });

  // Which page is showing. Clamped here rather than trusted, so an
  // owner that simply stores a number — and a cargo that shrank since
  // it did — can never leave the floor empty.
  const page = plan.pages > 0
    ? ((state.waitingPage ?? 0) % plan.pages + plan.pages) % plan.pages
    : 0;
  const pageOf = (a: LoadableAnimal): number => plan.page[order(a)] ?? 0;
  const here = onFloor.filter((a) => pageOf(a) === page);
  const elsewhere = onFloor.length - here.length;
  if (elsewhere > 0) {
    // The next page with somebody still waiting on it, coming round.
    // Skipping the pages whose animals have all boarded is what keeps
    // the control honest: it says how many are waiting out of view and
    // every press brings some of them into it.
    const next = Array.from({ length: plan.pages }, (_, i) => (page + 1 + i) % plan.pages)
      .find((p) => p !== page && onFloor.some((a) => pageOf(a) === p)) ?? page;
    drawWaitingPager(
      scene, container, box, elsewhere, () => callbacks.onWaitingPage(next),
    );
  }

  const ground = box.y + box.h;

  for (const animal of here) {
    const place = order(animal);
    const s = size[place] ?? MIN_TAP;
    const x = box.x + (cx[place] ?? s / 2);
    const lifted = animal === heldLoose;
    const y = ground - s / 2 - (lifted ? 8 : 0);

    if (lifted) {
      // A pool of shadow on the floor where she was standing: she is
      // off the ground, in the child's hands. Not an outline — the one
      // thing this area may not grow again.
      const shadow = scene.add.graphics();
      shadow.fillStyle(BED_WALL, 0.22);
      shadow.fillEllipse(x, ground - 2, s * 0.62, Math.max(5, s * 0.16));
      container.add(shadow);
    }

    const piece = scene.add.container(x, y);
    const record = state.animalsById.get(animal.id);
    if (record) {
      piece.add(createAnimalSprite(scene, 0, 0, record, { width: s, height: s }));
    }
    container.add(piece);

    const hit = grabHandle(scene, piece, s, s);
    hit.on('pointerover', () => { if (!drag.active) setMessage(looseCopy(animal, lifted)); });
    hit.on('pointerout', () => { if (!drag.active) setMessage(null); });

    makeDraggable(scene, piece, hit, zones, drag, {
      home: { x, y },
      accepts: dropTargetsFor('loose-animal'),
      // Over a crate, the panel says what that crate would mean for
      // her — the same sentence the drop will give, one moment early.
      describe: (t) => setMessage(
        t && t.kind === 'crate' ? crateCopy(state, animal, t.crate, false) : looseCopy(animal, true),
      ),
      onTap: () => {
        if (lifted) callbacks.onPutBack();
        else callbacks.onHoldFromTray(animal.id);
      },
      onDrop: (t) => {
        // One gesture, one answer: she is picked up and put in the
        // crate she was dragged to, in a single move, so the screen
        // repaints once and the sound plays once.
        if (t.kind === 'crate') callbacks.onPutInCrate(animal.id, t.crate);
      },
      onMiss: () => setMessage(looseCopy(animal, lifted)),
      onLift: () => {
        scene.tweens.killTweensOf(piece);
        // **A drag gets the same preview a tap does.** Picking her up
        // by tapping lights every crate with what it would mean for
        // her; dragging her would have crossed an unlit shelf, so the
        // lift does it too. Nothing in the session has changed yet —
        // this is the screen answering a question that has been asked
        // and not yet committed to, which is what every preview on it
        // is.
        preview.show(animal);
        setMessage(looseCopy(animal, true));
      },
      onSettle: () => {
        preview.show(heldLoose);
        setMessage(null);
        if (!lifted) breathe(scene, piece, place);
      },
    });

    // The animal in your hands is held still; the ones waiting breathe.
    if (!lifted) breathe(scene, piece, place);
  }
}

/**
 * The control at the end of the queue that brings the next animals
 * round, with the number still waiting out of view printed on it.
 *
 * ## Why there is a control here at all
 *
 * Adjacent animals' tap targets may not overlap (`looseRow`), so the
 * floor holds `floor(width / MIN_TAP)` of them however large they are
 * drawn — five on an 812pt phone, six on an 874, eight or more on
 * anything the screen is stacked on. Up to eight animals can be offered,
 * so on a phone some of them are out of view and the screen has to say
 * so and give the child a way to reach them.
 *
 * ## Why a pager and not a scroller
 *
 * **It is operable by single taps, which a scroller is not.** The child
 * this game is for may not drag or swipe accurately — it is the reason
 * every drag on this screen is also a tap — and a row that answers only
 * to a swipe would be the one part of the mechanic she could not use.
 * A momentum scroller is worse again: a flick that overshoots moves the
 * animal she was reaching for, and nothing on this floor is allowed to
 * move for a reason she did not intend.
 *
 * **And the queue is not hidden.** The plate prints how many animals are
 * waiting where she cannot see them — a numeral, not a word, because the
 * child cannot read — so "there are three more" is on the screen at all
 * times, which is the thing a silently truncated row did not say. The
 * pages themselves are fixed off the whole cargo, so an animal is always
 * on the same page and always in the same place on it.
 *
 * **It comes round rather than stopping.** The vehicle arrows are dimmed
 * at the ends and do not wrap, because a size order has ends and a child
 * can lose her place in it; a queue of animals has no wrong end, and one
 * control that always brings somebody is better for a pre-reader than
 * two that are sometimes dead. The numeral says how many are not in
 * front of her, so it is never a lie about where she is.
 */
function drawWaitingPager(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  /** The animals' own box: the pager stands at the right-hand end of it. */
  box: Box,
  /** How many animals are waiting on the pages she cannot see. */
  waiting: number,
  onPress: () => void,
): void {
  const w = WAITING_PAGER_W;
  // As tall as the row has room for, up to a comfortable plate. It
  // stands on the same ground line as the animals, so it is a thing at
  // the end of the queue rather than a button floating over the floor.
  const h = Math.max(MIN_TAP, Math.min(box.h, 64));
  const cx = box.x + box.w - w / 2;
  const cy = box.y + box.h - h / 2;

  const plate = createChromePlate(scene, 0, 0, w, h, { radius: 14 });

  // **The number beside the chevron, not above it.** A tap target is
  // 48px square and a 16px numeral stacked over a chevron fills it
  // corner to corner, which at the size it is actually drawn reads as
  // one squiggle rather than as a number and an arrow. Side by side
  // they are two marks with air round each: how many are waiting, and
  // which way they are.
  const count = scene.add.text(-9, 0, `${waiting}`, {
    fontSize: `${MIN_FONT.small}px`,
    fontFamily: FONTS.title,
    fontStyle: 'bold',
    color: CHROME.ink,
    resolution: TEXT_RESOLUTION,
  }).setOrigin(0.5);

  // The chevron, drawn rather than set, for the reason `drawBackControl`
  // gives: a glyph resolves to whatever the device has.
  const chevron = scene.add.graphics();
  chevron.fillStyle(hexNum(CHROME.ink), 1);
  const barL = 13;
  const barT = 4.5;
  for (const turn of [-1, 1]) {
    chevron.save();
    chevron.translateCanvas(10, turn * 4.5);
    chevron.rotateCanvas(turn * -Math.PI / 4);
    chevron.fillRoundedRect(-barL / 2, -barT / 2, barL, barT, barT / 2);
    chevron.restore();
  }

  const piece = scene.add.container(cx, cy, [plate, count, chevron]);
  piece.setSize(w, h);
  piece.setName('waiting-more');

  let done = false;
  const hit = scene.add.rectangle(0, 0, Math.max(w, MIN_TAP), Math.max(h, MIN_TAP), 0x000000, 0)
    .setInteractive({ useHandCursor: true })
    .setName('waiting-more-hit');
  hit.on('pointerover', () => piece.setScale(1.05));
  hit.on('pointerout', () => piece.setScale(1));
  hit.on('pointerdown', () => {
    // A state tween, as every other press in the game is: the page turn
    // hangs off `onComplete`, and a yoyo ends where it started, so with
    // motion reduced this moves nothing and still turns the page.
    // Absolute numbers only — a relative string is silently skipped.
    stateTween(scene, {
      targets: piece, scaleX: 0.94, scaleY: 0.94, duration: 60, yoyo: true,
      onComplete: () => { if (!done) { done = true; onPress(); } },
    });
  });
  piece.add(hit);
  container.add(piece);
}

/**
 * The crate shelf — all six crates, standing on the floor beside the
 * animals.
 *
 * **Choosing the crate is the child's now, and this is where she does
 * it.** It used to be `bestCrateFor`, decided for her, on the grounds
 * that one screen should teach one thing. Marcus, 2026-10-09: "that
 * makes for another fun round of choosing how that animal might like to
 * travel and that could help with alleviating some of the issues with
 * other animals on board or their health condition."
 *
 * All six, always, in `SHELF_CRATES` order — a shelf that offered only
 * the crates that suit the animal in hand would take away the choice,
 * and one whose contents changed between animals would move the thing
 * she was reaching for.
 *
 * **While she is holding an animal, every crate says what it would mean
 * for her** — the same marks and the same words the bays use for a
 * neighbour, because it is the same question asked about a different
 * thing. A child can read the answer before she commits, which is how
 * this screen has always worked and is why nothing here has to punish a
 * poor choice.
 */
function drawCrateShelf(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  state: CrateLoadingState,
  callbacks: CrateLoadingCallbacks,
  setMessage: (copy: PanelCopy | null) => void,
  zones: DropZone[],
  drag: DragFlag,
  box: Box,
): ShelfPreview {
  const { session } = state;
  const held = heldAnimal(session);
  const inCrate = heldCrateType(session);

  // The ghosts live in a layer of their own, so lighting the shelf up
  // and letting it go again costs one container; the crates' own
  // weight is set on the crate objects, which are kept here with them.
  const marks = scene.add.container(0, 0);
  const lamps: Array<{
    type: CrateType;
    cx: number;
    cy: number;
    size: number;
    face: Phaser.GameObjects.Image | Phaser.GameObjects.Container;
    /** True when the animal in hand is really sitting in this one. */
    occupied: boolean;
  }> = [];

  const { rows, perRow, chipW, chipH } = fitChipGrid(
    SHELF_CRATES.length, { w: box.w, h: box.h },
    { gap: GAP, maxW: SHELF_CRATE_MAX, maxH: SHELF_CRATE_MAX },
  );
  // **The crates stand on the same ground line as the animals.** The
  // whole band is one floor, and a shelf centred in its half of it had
  // the crates floating twenty pixels above the feet of the animals
  // beside them — two ground lines in one picture, which is the fault
  // Marcus's shared-edges rule names.
  const gridH = rows * chipH + (rows - 1) * GAP;
  const top = box.y + Math.max(0, box.h - gridH);

  SHELF_CRATES.forEach((type, i) => {
    const def = CRATE_DEFS[type];
    const cx = box.x + (i % perRow) * (chipW + GAP) + chipW / 2;
    const cy = top + Math.floor(i / perRow) * (chipH + GAP) + chipH / 2;
    const size = Math.max(1, Math.min(chipW, chipH) - 2);

    // Always a space, whatever is happening: an animal may be dropped
    // in, and a crate already holding her may be dropped on another one
    // to move her across.
    zones.push({
      rect: generous(cx, cy, chipW, chipH),
      target: { kind: 'crate', crate: type },
    });

    const holding = held && inCrate === type ? held : null;
    const record = holding ? state.animalsById.get(holding.id) : undefined;

    // The crate and the animal in it are drawn separately here, where
    // the bays use `makeCratedAnimal` for the pair — because the shelf
    // changes the crate's own weight to say whether it suits the
    // animal in hand, and the animal inside must not fade with it.
    const piece = scene.add.container(cx, cy);
    const face = makeCrateFace(scene, 0, 0, def, size);
    piece.add(face);
    if (record) {
      const inside = Math.round(size * CRATE_FLOOR);
      piece.add(createAnimalSprite(scene, 0, 0, record, {
        width: inside,
        height: inside,
        stateOverride: holding?.poorly ? FACE_SICK : undefined,
      }));
    }
    container.add(piece);

    lamps.push({ type, cx, cy, size, face, occupied: Boolean(holding) });

    const copy = (): PanelCopy => (held
      ? crateCopy(state, held, type, Boolean(holding))
      : { heading: titleCase(def.label), tone: null, body: [whoTravelsIn(type)] });

    const hit = grabHandle(scene, piece, chipW, chipH);
    hit.on('pointerover', () => { if (!drag.active) setMessage(copy()); });
    hit.on('pointerout', () => { if (!drag.active) setMessage(null); });

    if (holding) {
      // Stage two: this crate holds her, so this crate is the thing
      // that goes into the vehicle.
      makeDraggable(scene, piece, hit, zones, drag, {
        home: { x: cx, y: cy },
        // Everywhere a crated animal may go, except the crate she is
        // already in — dropping her back where she started is a miss,
        // not a move.
        accepts: (t) => dropTargetsFor('crated-animal')(t)
          && (t.kind !== 'crate' || t.crate !== type),
        // Over a bay, what that bay would do to her; over another
        // crate, what that crate would mean; over the floor, that she
        // would be put down. The drag reads the screen out loud.
        describe: (t) => {
          if (t?.kind === 'bay') { setMessage(bayHoverCopy(session, t.slotIndex)); return; }
          if (t?.kind === 'crate') { setMessage(crateCopy(state, holding, t.crate, false)); return; }
          if (t?.kind === 'floor') {
            setMessage({
              heading: titleCase(`${holding.name} the ${holding.species}`),
              tone: null,
              body: [`${holding.name} would wait on the floor again.`],
              cast: { members: [castOne(holding)] },
            });
            return;
          }
          setMessage(copy());
        },
        onTap: () => setMessage(copy()),
        onDrop: (t) => {
          if (t.kind === 'bay') callbacks.onPlaceInSlot(t.slotIndex);
          else if (t.kind === 'crate') callbacks.onPutInCrate(holding.id, t.crate);
          else callbacks.onPutBack();
        },
        onMiss: () => setMessage(copy()),
      });
      return;
    }

    hit.on('pointerdown', () => {
      if (held) callbacks.onPutInCrate(held.id, type);
      else setMessage(copy());
    });
  });

  container.add(marks.setDepth(7));

  /**
   * Show which crates suit the animal in hand — **in shape and weight,
   * with no colour in it at all.**
   *
   * The first version marked them with the feeling glyphs: a green
   * heart on the ones that suit, an amber zigzag on the ones that do
   * not. That broke the one rule this screen's colour language rests
   * on. Amber means *a neighbour minds* — a fact about two animals and
   * a relationship — and a crate that does not suit is a fact about
   * one animal's own comfort. Two meanings on one colour, on the
   * screen where a child is learning what the colours mean, and the
   * green was the same error the other way up. Red is refusal and blue
   * is needing quiet, so there was no fourth hue to move to either.
   *
   * So the crates say it the way a shelf says it:
   *
   *   suits her — the crate at full weight, with a **ghost of the
   *               animal sitting in it**. Not a symbol standing for
   *               her: her, in that crate, at the size she would be.
   *   does not  — the crate drawn back to four tenths, empty.
   *
   * Both differences survive the colour being taken away, which is the
   * test: one is dark and has a shape inside it, the other is pale and
   * has nothing. It is positive in construction — the mark says where
   * she fits, and the crates that do not suit are simply not marked.
   *
   * **The crate she is actually in keeps its animal at full strength**
   * whatever its weight, so a poor choice reads as exactly what it is:
   * her, solid, sitting in a faded crate, with the crate that suits
   * her lit two along.
   */
  const show = (animal: LoadableAnimal | null): void => {
    marks.removeAll(true);
    for (const lamp of lamps) {
      if (!animal) { lamp.face.setAlpha(1); continue; }
      const suits = describeCrateChoice(animal, lamp.type).suitable;
      lamp.face.setAlpha(suits ? 1 : CRATE_DIMMED);
      if (!suits || lamp.occupied) continue;
      const record = state.animalsById.get(animal.id);
      if (!record) continue;
      const inside = Math.round(lamp.size * CRATE_FLOOR);
      marks.add(createAnimalSprite(scene, lamp.cx, lamp.cy, record, {
        width: inside, height: inside,
      }).setAlpha(CRATE_GHOST));
    }
  };

  // Tapping an animal to pick her up lights the shelf straight away,
  // and dragging her lights it on the way (see `onLift`). It stays lit
  // once she is in a crate, because that is when a child most needs to
  // see which one she should have picked.
  if (held) show(held);
  return { show };
}

/**
 * More than one of a species.
 *
 * Eight words, and the two that are not "add an s" are the two the
 * first version got wrong: a fox is a fox**es** and a bunny is a
 * bunn**ies**. Rules rather than a table, because the three endings
 * cover every species the game has and any it gains.
 */
export function plural(species: Species): string {
  if (/[sxz]$|[cs]h$/.test(species)) return `${species}es`;
  if (/[^aeiou]y$/.test(species)) return `${species.slice(0, -1)}ies`;
  return `${species}s`;
}

/**
 * Who a crate is for, in one line — what the panel says about a crate
 * when nobody is in the child's hands.
 *
 * Read off the engine rather than written out, so the sentence cannot
 * drift from the scoring: `isCrateSuitable` already knows, and it is
 * the same function the +3 and the -10 come from.
 */
export function whoTravelsIn(crate: CrateType): string {
  const species = (Object.keys(SPECIES_SIZE) as Species[])
    .filter((s) => isCrateSuitable(s, crate))
    .sort();
  if (species.length === 0) return 'This crate is spare.';
  const names = species.map(plural);
  const list = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `For ${list}.`;
}
