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
 * **It is also a place.** The vehicle stands in a painted bay on the
 * A.R.C. tarmac, the building behind it and the exit road along the
 * bottom — the same forecourt the picker draws, through the same
 * `drawForecourt`, because this is that car park one moment later.
 *
 * **The big panel on the right is the teaching surface.** It is not a
 * status line, it is the point of the screen: it answers in words a
 * child can read whether these two animals may sit together, and why.
 * It has a fixed home that never moves between renders. Nothing here is
 * on a timer, nothing flashes, and nothing a child taps can lose her
 * work.
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
import type { Animal } from '@arc/shared-types';
import {
  FEELING,
  animalById,
  crateDefFor,
  heldAnimal,
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
  type LoadableAnimal,
  type LoadingSession,
  type VehicleDef,
  type VehicleType,
} from '@arc/game-logic';
import { createAnimalSprite } from '../ui/sprites';
import { createChromeButton, createChromeTitle, createChromePlate } from '../ui/UIButton';
import {
  CHROME, COLOURS, FONTS, MIN_FONT, MIN_TAP, PAGE_MARGIN, SAFE_MARGIN, SPACE,
  TEXT_RESOLUTION, TITLE_CY, TYPE, bottomAnchorY, contentTopFor, hexNum,
} from '../ui/constants';
import { fitChipGrid } from '../ui/layout';
import { drawForecourt, drawVehicleShadow } from './forecourt';
import {
  BAY_GAP, BAY_MAX_H, BAY_MAX_W, BED_PAD, VEHICLE_BED, VEHICLE_BED_SOURCE,
  VEHICLE_SPRITE, bedProbePoints, fitLoadBed, type BedFit,
} from './fleet-art';

/**
 * The three feelings, as a surface each.
 *
 * Colour reinforces here, it never carries: every glyph has a silhouette
 * of its own, every badge draws its word, and the sentence in the panel
 * says the same thing a third time. A child who does not see red and
 * green apart reads the screen exactly as well as one who does.
 */
const FEELING_SKIN: Record<CompatibilityLevel, { fill: number; stroke: number; ink: string }> = {
  happy:    { fill: 0xd9efdd, stroke: hexNum(COLOURS.primaryDark), ink: COLOURS.primaryDark },
  stressed: { fill: 0xfdeec2, stroke: 0x8a6a1f,                    ink: '#6b5112' },
  blocked:  { fill: 0xf7dcd6, stroke: hexNum(COLOURS.accent),      ink: COLOURS.accent },
};

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
 * The tray is a grid of chips in whatever room the right-hand column
 * has left. A chip is as big as that allows, within these.
 */
const CHIP_MAX_W = 128;
const CHIP_MAX_H = 104;
/**
 * Narrower than this and a chip shows "Wh…" where it meant "Whiskers",
 * which is the tray's whole job. A column that can only manage it goes
 * to the full-width strip instead, where six chips have the room.
 */
const CHIP_NAME_MIN_W = 76;

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
 * Truffle the hedgehog worried. They can sit next to each other, but
 * Truffle will not enjoy the journey." is three lines on its own, so
 * three of them was nine lines of prose — a hundred and seventeen
 * pixels more than the plate had, which it simply ran off the bottom
 * of onto the tray. It was over its own paper before this change and
 * nobody had measured it.
 *
 * So the panel says one thing now: *this* pair, in a picture and in
 * the sentence under it. The other pairs did not go anywhere — they
 * are on the grid, each wearing its own faces and its own glyph on the
 * edge the two of them share, which is where a fact about two
 * particular bays belongs and is the whole reason those exist.
 *
 * `PANEL_FACES_H` is the band above the words: a name row and an
 * animal about eighty pixels tall, which is nearly three times the
 * size the same animal is in one of Big Tilly's bays. That is the
 * point of it. A panel too short for the full band draws a smaller
 * one, and a panel too short for `PANEL_FACES_MIN` — the landscape
 * phone, where the whole band is about 98px — draws none and falls
 * back to the carried animal in the corner, as it did before.
 */
const PANEL_TEXT_H = 34 + 4 * 27;
const PANEL_FACES_H = 104;
const PANEL_FACES_MIN = 62;

/**
 * Below this a bay cannot carry a name row without the name taking more
 * of the bay than the crate in it. Big Tilly's nine bays are the case —
 * 40 wide by 54 deep, where a 20px name row would leave a 34px crate
 * with a 19px animal inside it. Her names live in the panel and on the
 * tray chips instead.
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
  /** An animal in the tray was tapped — pick it up. */
  onHoldFromTray: (animalId: string) => void;
  /** A loaded bay was tapped — lift that animal out into the child's hands. */
  onLiftFromSlot: (slotIndex: number) => void;
  /** An empty bay was tapped while holding an animal. */
  onPlaceInSlot: (slotIndex: number) => void;
  /** The held animal goes back on the pavement. */
  onPutBack: () => void;
  /** Everything is loaded and the van may set off. */
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
   * What just happened, if the child needs telling — a refused bay, or
   * an empty van asked to set off. Shown instead of the standing
   * message until the next tap, and never on a timer.
   */
  notice?: {
    level: CompatibilityLevel | null;
    text: string;
    /**
     * The two animals the refusal was about, so the panel can draw
     * them. Absent for a notice with no pair in it — an empty van
     * asked to set off.
     */
    pair?: { animalId: string; neighbourId: string };
  } | null;
}

/** Somebody the panel is drawing, and the face they are wearing. */
interface CastMember {
  id: string;
  name: string;
  /** Sprite state, or undefined to let the sprite layer derive it. */
  face?: string;
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
  level?: CompatibilityLevel;
  /**
   * They are aboard but not beside each other — drawn with the van's
   * floor between them, which is the picture of "nobody has a
   * neighbour to mind".
   */
  apart?: boolean;
}

/** Lines the panel shows, and which feeling (if any) tints its heading. */
interface PanelCopy {
  heading: string;
  tone: CompatibilityLevel | null;
  body: string[];
  cast?: PanelCast;
}

/** One animal, for the panel. */
function castOne(animal: LoadableAnimal, face?: string): CastMember {
  return { id: animal.id, name: animal.name, face };
}

/** The two animals a note is about, each wearing what the note gives them. */
function castPair(session: LoadingSession, note: AdjacencyNote): PanelCast | undefined {
  const pair = pairOf(session, note);
  if (!pair) return undefined;
  const [faceA, faceB] = pairFaces(note, pair);
  return {
    members: [castOne(pair[0], faceA), castOne(pair[1], faceB)],
    level: note.level,
  };
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
  const alone = !settledNotes(session).some(
    (n) => n.animalId === animalId || n.neighbourId === animalId,
  );
  if (alone) return undefined;
  const feeling = gridFeeling(session, animalId);
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
  if (note.level === 'happy') return [FACE_AFFECTED.happy, FACE_AFFECTED.happy];
  const hit = affectedBy(note, pair);
  const face = FACE_AFFECTED[note.level];
  return [
    hit.has(pair[0].id) ? face : FACE_CALM,
    hit.has(pair[1].id) ? face : FACE_CALM,
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
): Phaser.GameObjects.GameObject {
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
  level: CompatibilityLevel,
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
  level: CompatibilityLevel,
  options?: { withWord?: boolean; radius?: number },
): Phaser.GameObjects.Container {
  const withWord = options?.withWord ?? false;
  const r = options?.radius ?? (withWord ? 17 : 13);

  const gfx = scene.add.graphics();
  drawVibeGlyph(gfx, 0, withWord ? -6 : 0, level, r);

  const children: Phaser.GameObjects.GameObject[] = [gfx];
  if (withWord) {
    children.push(
      scene.add.text(0, r + 7, FEELING[level], {
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
    const crate = crateDefFor(held.species);
    return {
      heading: `In your hands: ${held.name} the ${held.species}`,
      tone: null,
      body: [
        `${held.name} travels in a ${crate.label.toLowerCase()}.`,
        `Tap a space in ${state.vehicle.name} to put them down.`,
      ],
      // No face forced on her: she is not next to anybody yet, and if
      // she is the poorly one on a vet run that is the thing to show.
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
    };
  }

  const settled = settledNotes(session);
  if (settled.length > 0) {
    // `settledNotes` is sorted worst first, so the pair drawn is the
    // pair the first sentence is about — and because it is the worst
    // on the grid, nobody in it can be wearing a face the bays would
    // contradict.
    return {
      heading: FEELING[settled[0].level],
      tone: settled[0].level,
      body: sentences(settled, 1),
      cast: castPair(session, settled[0]),
    };
  }

  if (aboard(session).length === 0) {
    return {
      heading: `${state.vehicle.name} is empty`,
      tone: null,
      body: [
        `Tap an animal waiting to board, then tap a space in ${state.vehicle.name}.`,
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
    heading: 'Nobody is worried',
    tone: null,
    body: [
      'Nobody is sitting next to anybody, so nobody has a neighbour to mind.',
      'Load another animal, or set off.',
    ],
    cast: { members: aboard(session).slice(0, 2).map((a) => castOne(a)), apart: true },
  };
}

function panelCopy(state: CrateLoadingState): PanelCopy {
  if (state.notice) {
    const { notice } = state;
    // A refusal is the moment a child most needs the picture, so the
    // notice carries who it was about and the two of them are drawn
    // exactly as any other pair.
    const cast = notice.level && notice.pair
      ? castPair(state.session, {
        level: notice.level,
        slotIndex: -1,
        neighbourSlotIndex: -1,
        animalId: notice.pair.animalId,
        neighbourId: notice.pair.neighbourId,
        text: notice.text,
      })
      : undefined;
    return {
      heading: notice.level ? FEELING[notice.level] : 'Wait a moment',
      tone: notice.level,
      body: [
        notice.text,
        notice.level === 'blocked' ? 'Try another space.' : '',
      ].filter((l) => l.length > 0),
      cast,
    };
  }
  return standingCopy(state);
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
  const title = createChromeTitle(scene, width / 2, TITLE_CY, `Load ${vehicle.name}`, {
    fontSize: TYPE.lead,
    subtitle: `${spaces} — off to ${state.destinationName}`,
  });

  // ── The forecourt, and the bands on it ──
  const contentTop = contentTopFor(title);
  const buttonCy = bottomAnchorY(height);
  const bandBottom = buttonCy - MIN_TAP / 2 - SPACE.m;
  const roadTop = height * 0.93;

  // A strip of gravel above the tarmac, so the car park has a far edge
  // to stand on rather than butting the title. Every pixel of it comes
  // off the vehicle, so it is a fraction of what is going spare and
  // capped at one step of the scale.
  const apronTop = contentTop
    + Math.min(SPACE.xxl, Math.max(0, (bandBottom - contentTop) * 0.06));

  const usable = width - PAGE_MARGIN * 2;
  const colGap = SPACE.xl;
  // The panel is sized first and the vehicle takes what is left: the
  // panel is type, and type has a width below which it stops being
  // readable, while a vehicle simply draws smaller.
  const panelColW = Math.round(Math.max(236, Math.min(usable * 0.44, 420)));
  const vehicleColW = Math.max(160, usable - colGap - panelColW);
  const panelColX = PAGE_MARGIN + vehicleColW + colGap;

  const bandTop = apronTop + SPACE.m;
  const bandH = bandBottom - bandTop;

  // The animals waiting to board stand under the panel, in the same
  // column, which is what buys the vehicle the full height of the band.
  // Where that column cannot give them a chip wide enough to carry a
  // name — a narrow or a short window — they fall back to a strip
  // across the bottom, and the panel and the vehicle give up the height
  // instead. Decided before either is drawn, so the strip can never
  // land on the panel.
  const trayLabelH = MIN_FONT.small + SPACE.xs;
  const trayMinH = trayLabelH + SPACE.s + MIN_TAP;
  const panelWanted = CHROME.padY * 2 + PANEL_FACES_H + SPACE.s + PANEL_TEXT_H;
  const waiting = waitingToBoard(session).length;
  const columnTrayTop = bandTop + Math.min(bandH, panelWanted) + SPACE.l;
  const columnTrayH = bandBottom - columnTrayTop;
  const columnChip = trayGrid(
    Math.max(1, waiting), { w: panelColW, h: columnTrayH - trayLabelH - SPACE.s },
  );

  let trayBox: Box;
  let columnsBottom: number;
  if (columnTrayH >= trayMinH && columnChip.chipW >= CHIP_NAME_MIN_W) {
    trayBox = { x: panelColX, y: columnTrayTop, w: panelColW, h: columnTrayH };
    columnsBottom = bandBottom;
  } else {
    // The strip's whole height, label row included — on a landscape
    // phone every pixel it takes comes off the message panel, which is
    // the one thing on this screen that cannot be shortened.
    const trayH = Math.min(104, Math.max(trayLabelH + SPACE.s + MIN_TAP, height * 0.19));
    trayBox = { x: PAGE_MARGIN, y: bandBottom - trayH, w: usable, h: trayH };
    columnsBottom = trayBox.y - SPACE.s;
  }

  // The tarmac is the loading bay, not the whole screen. The picker
  // lays a wide shallow slab because it is showing a row of five bays;
  // here there is one vehicle, so the slab is its bay and the rest of
  // the forecourt stays gravel — which keeps the chrome column reading
  // as paper over a place rather than as a panel on a black field.
  //
  // It ends where the vehicle does rather than always at the road:
  // under the bottom tray strip the extra tarmac is empty, and empty
  // tarmac under a strip of chips reads as a hole rather than a car
  // park.
  //
  // **No building.** The height it would stand in is the height the
  // vehicle needs to sit on the tarmac whole; drawn in what was left it
  // measured about 130px against the picker's 370 and read as a sticker
  // pasted on the slab's top edge. Gravel, tarmac and the exit road
  // carry the place on their own.
  //
  // **And the bay is the vehicle's width, not the column's.** The
  // proportion pass turned every vehicle portrait: Big Tilly draws
  // 169px wide in a 524px column, and a slab filled to the column put
  // 350px of empty tarmac beside her — a car park with one lorry
  // marooned in it, which is the "UI panel with a van on it" reading
  // this slab was cut down to avoid in the first place. So the vehicle
  // is measured first and the tarmac laid round it, with the gravel it
  // no longer covers left as forecourt.
  const apronBottom = Math.min(roadTop - 8, columnsBottom + SPACE.s);
  const roomX = PAGE_MARGIN - SPACE.m;
  const roomW = vehicleColW + SPACE.xl;
  const roomBox = {
    x: roomX + SPACE.l,
    y: apronTop + SPACE.l,
    w: Math.max(120, roomW - SPACE.l * 2),
    h: Math.max(100, apronBottom - SPACE.l - (apronTop + SPACE.l)),
  };
  const fit = vehicleFit(scene, vehicle.id, roomBox, session.grid.cols, session.grid.rows);
  const bayW = fit
    ? Math.min(roomW, Math.max(160, fit.spriteW + SPACE.xxl * 2))
    : roomW;
  const { apron } = drawForecourt(scene, container, {
    width,
    height,
    contentTop,
    apronTop,
    apronH: Math.max(0, apronBottom - apronTop),
    apronX: roomX + (roomW - bayW) / 2,
    apronW: bayW,
    building: false,
  });
  container.add(title);

  // The panel is sized for its longest copy — a heading and five lines —
  // rather than for the band, and pinned to the top of it: a panel that
  // changed height with its contents would move the words a child is
  // reading. It takes the band's height when the band is the smaller.
  const panelH = Math.max(MIN_TAP, Math.min(columnsBottom - bandTop, panelWanted));
  const setMessage = drawPanel(scene, container, state, {
    x: panelColX, y: bandTop, w: panelColW, h: panelH,
  });

  // The vehicle stands *inside* the tarmac, inset far enough on every
  // side to have air round it. A van drawn to the slab's own edges is
  // a van hanging off a panel, which is what this looked like.
  drawVehicle(scene, container, state, callbacks, setMessage, {
    x: apron.x + SPACE.l,
    y: apron.y + SPACE.l,
    w: Math.max(120, apron.w - SPACE.l * 2),
    h: Math.max(100, apronBottom - SPACE.l - (apron.y + SPACE.l)),
  }, apronBottom - 3, fit);
  drawTray(scene, container, state, callbacks, setMessage, trayBox, trayLabelH);

  // ── Bottom row ──
  container.add(
    createChromeButton(scene, SAFE_MARGIN, SAFE_MARGIN, 'Back', () => callbacks.onBack(), {
      width: 88, anchor: { x: 'left', y: 'top' },
    }).setDepth(45),
  );

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
      createChromeButton(
        scene, width - SAFE_MARGIN, buttonCy, `Put ${held.name} back`,
        () => callbacks.onPutBack(),
        { width: 180, fontSize: TYPE.button, anchor: { x: 'right' } },
      ).setDepth(45),
    );
  }
}

// ── The vehicle, and the bays in it ──────────────────────────

/**
 * The live notes for one bay, as panel copy — what a pointer resting on
 * an empty bay reads out while an animal is held.
 */
function bayHoverCopy(session: LoadingSession, slotIndex: number): PanelCopy | null {
  const outlook = slotOutlook(session, slotIndex);
  if (!outlook) return null;
  const notes = slotNotes(session, slotIndex);
  const held = heldAnimal(session);
  return {
    heading: FEELING[outlook],
    tone: outlook,
    body: notes.length > 0
      ? sentences(notes, 2)
      : [`Nobody is beside this space, so ${held?.name ?? 'they'} would travel on their own.`],
    // The hypothetical, drawn: this is who she would be sitting next
    // to and how the two of them would take it. The neighbour's face
    // here is the face of a placement that has not happened, which is
    // the one place the panel is allowed to differ from her bay — it
    // is the whole point of a preview.
    cast: notes.length > 0
      ? castPair(session, notes[0])
      : held ? { members: [castOne(held)] } : undefined,
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
): BedFit | undefined {
  const key = VEHICLE_SPRITE[id];
  if (!scene.textures.exists(key)) return undefined;
  const source = scene.textures.get(key).getSourceImage();
  return fitLoadBed(
    { w: box.w, h: box.h },
    { w: source.width, h: source.height },
    VEHICLE_BED[id],
    cols, rows,
  );
}

/**
 * The chosen vehicle, parked in a bay on the tarmac, with its load bed
 * cut away and the crate grid laid in it.
 *
 * The bays lead: `fitLoadBed` sizes them for the room there is and then
 * says how big the vehicle has to be drawn for its bed to hold them,
 * which is why Big Tilly draws bigger than the band and a trike does
 * not. The vehicle is centred in its column; when it is bigger than the
 * band it is pinned to the top of it, so the bed is always fully on
 * screen and it is the bumper that runs out of the picture.
 */
function drawVehicle(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  state: CrateLoadingState,
  callbacks: CrateLoadingCallbacks,
  setMessage: (copy: PanelCopy | null) => void,
  box: Box,
  /**
   * The y the vehicle is cut off at — the tarmac's own bottom edge.
   *
   * Reached by the three-across vehicles at every viewport the screen
   * is checked at (see `fitLoadBed`). Cutting at the kerb rather than
   * at an arbitrary line means the vehicle ends where the ground does,
   * which reads as driving out of the picture.
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
    );
    const left = box.x + (box.w - fit.spriteW) / 2;
    const top = fit.overflows ? box.y : box.y + (box.h - fit.spriteH) / 2;
    // Where the vehicle actually ends on screen: its own bottom edge, or
    // the kerb if it is the bigger vehicle. The shadow is a pool on the
    // ground under it, so it has to stop where the vehicle stops —
    // otherwise a lorry running off the slab casts an ellipse across the
    // exit road and out under the buttons.
    const bottom = fit.overflows && clipAt !== undefined
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
    if (fit.overflows && clipAt !== undefined) {
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

  drawBays(scene, container, state, callbacks, setMessage, {
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

function drawBays(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  state: CrateLoadingState,
  callbacks: CrateLoadingCallbacks,
  setMessage: (copy: PanelCopy | null) => void,
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
    const outlook = slotOutlook(session, slot);
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
        scene, container, record, record?.name ?? '', crateDefFor(crate.species),
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
    const hit = scene.add.rectangle(
      cx, cy, bayHitSize(slotW), bayHitSize(slotH), 0x000000, 0,
    ).setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => {
      if (crate) {
        const animal = state.animalsById.get(crate.animalId);
        setMessage(animal ? {
          heading: `${animal.name} the ${animal.species}`,
          tone: null,
          body: [
            `${animal.name} is in a ${crateDefFor(crate.species).label.toLowerCase()}.`,
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
    hit.on('pointerout', () => setMessage(null));
    hit.on('pointerdown', () => {
      if (crate) callbacks.onLiftFromSlot(slot);
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
    drawVibeGlyph(gfx, (a.x + b.x) / 2, y, note.level, glyphR);
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
  const plate = createChromePlate(scene, box.x + box.w / 2, box.y + box.h / 2, box.w, box.h);
  container.add(plate);

  // The sentences keep the full width; the faces sit above them, which
  // is the change — the picture is read first because it is first.
  const innerW = box.w - CHROME.padX * 2;

  // On a landscape phone the plate gets about two-thirds the height its
  // longest copy wants, and there is nothing to take it from — the tray
  // and the vehicle are already at their floors. So the padding and the
  // leading close up rather than the words running off the bottom of
  // the paper onto the gravel. The type size does not move; that floor
  // is not negotiable, and it is the only thing here that is not.
  const facesH = Math.min(
    PANEL_FACES_H, box.h - CHROME.padY * 2 - SPACE.s - PANEL_TEXT_H,
  );
  const showFaces = facesH >= PANEL_FACES_MIN;
  const tight = box.h < CHROME.padY * 2 + PANEL_TEXT_H;
  const headingY = box.y
    + (tight ? SPACE.s : CHROME.padY + SPACE.xs)
    + (showFaces ? facesH + SPACE.s : 0);

  const facesBox: Box = {
    x: box.x + CHROME.padX, y: box.y + CHROME.padY, w: innerW, h: facesH,
  };
  // Its own container, because a pointer moving across the bays
  // repaints this and nothing else: the faces are rebuilt, the plate
  // and the type under them are not, and the panel never moves.
  const faces = scene.add.container(0, 0);
  container.add(faces);

  const heading = scene.add.text(box.x + CHROME.padX, headingY, '', {
    fontSize: TYPE.lead, fontFamily: FONTS.ui, fontStyle: 'bold',
    color: CHROME.ink, wordWrap: { width: innerW }, resolution: TEXT_RESOLUTION,
  }).setOrigin(0, 0);
  container.add(heading);

  const body = scene.add.text(box.x + CHROME.padX, headingY + (tight ? 26 : 34), '', {
    fontSize: TYPE.body, fontFamily: FONTS.ui, color: CHROME.ink,
    lineSpacing: tight ? 0 : 6, wordWrap: { width: innerW }, resolution: TEXT_RESOLUTION,
  }).setOrigin(0, 0);
  container.add(body);

  if (!showFaces) {
    // No room for the band. The carried animal goes back in the corner,
    // which is where she lived before there was one — a small picture
    // beats no picture, and on this viewport it is a small picture or
    // the fifth line of a refusal.
    const held = heldAnimal(state.session);
    const heldRecord = held ? state.animalsById.get(held.id) : undefined;
    const carrySize = Math.min(56, box.h - CHROME.padY * 2);
    if (heldRecord && carrySize > 24) {
      container.add(
        createAnimalSprite(
          scene,
          box.x + box.w - CHROME.padX - carrySize / 2,
          box.y + box.h - CHROME.padY - carrySize / 2,
          heldRecord,
          { width: carrySize, height: carrySize },
        ).setDepth(4),
      );
    }
  }

  const standing = panelCopy(state);
  const apply = (copy: PanelCopy | null): void => {
    const c = copy ?? standing;
    heading.setText(c.heading);
    heading.setColor(c.tone ? FEELING_SKIN[c.tone].ink : CHROME.ink);
    body.setText(c.body.join('\n'));
    if (!showFaces) return;
    faces.removeAll(true);
    drawCast(scene, faces, state, c.cast, facesBox);
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
 * already on the bay and on the tray chip, and a rim round a face in
 * the one place the face is the whole point would be the same mistake
 * at a larger size.
 */
function drawCast(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  state: CrateLoadingState,
  cast: PanelCast | undefined,
  box: Box,
): void {
  const nameH = MIN_FONT.small + SPACE.xs;
  const artH = Math.max(16, box.h - nameH);
  const cy = box.y + nameH + artH / 2;

  if (!cast || cast.members.length === 0) {
    // The empty van: the hole an animal goes in, at the size the panel
    // has, drawn exactly as the bays draw theirs.
    const s = Math.min(artH, box.h, 76);
    const x = box.x + box.w / 2 - s / 2;
    const y = cy - s / 2;
    const gfx = scene.add.graphics();
    gfx.fillStyle(BAY_WELL_LIP, 0.85);
    gfx.fillRoundedRect(x, y + 2, s, s, 10);
    gfx.fillStyle(BAY_WELL, 1);
    gfx.fillRoundedRect(x, y, s, s, 10);
    gfx.lineStyle(2.5, BAY_WELL_SHADE, 0.55);
    gfx.strokeRoundedRect(x, y, s, s, 10);
    container.add(gfx);
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
    return;
  }

  // Two of them. `apart` pushes them to the ends and draws nothing
  // between; a pair sits close with the glyph on the gap they share,
  // which is the same place it sits between two bays.
  const spread = cast.apart ? 0.29 : 0.25;
  const size = Math.min(artH, box.w * (cast.apart ? 0.34 : 0.4));
  const glyphR = Math.max(9, Math.min(15, size * 0.22));
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
  });

  if (cast.level) {
    const gfx = scene.add.graphics();
    drawVibeGlyph(gfx, box.x + box.w / 2, cy, cast.level, glyphR);
    container.add(gfx);
  }
}

// ── The tray ─────────────────────────────────────────────────

/**
 * How the waiting animals are arranged in whatever rectangle the tray
 * was given — `fitChipGrid` with this screen's chip sizes.
 */
function trayGrid(
  count: number,
  box: { w: number; h: number },
): { rows: number; perRow: number; chipW: number; chipH: number } {
  return fitChipGrid(count, box, { gap: GAP, maxW: CHIP_MAX_W, maxH: CHIP_MAX_H });
}

function drawTray(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  state: CrateLoadingState,
  callbacks: CrateLoadingCallbacks,
  setMessage: (copy: PanelCopy | null) => void,
  box: Box,
  labelH: number,
): void {
  const { session } = state;
  const waiting = waitingToBoard(session);

  const label = scene.add.text(box.x, box.y, 'Waiting to board', {
    fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.ui, fontStyle: 'bold',
    color: CHROME.ink, resolution: TEXT_RESOLUTION,
  }).setOrigin(0, 0);
  container.add(
    createChromePlate(
      scene, box.x + label.width / 2 + SPACE.s, box.y + label.height / 2,
      label.width + SPACE.l, label.height + SPACE.s, { radius: 8, shadow: false },
    ),
  );
  container.add(label);

  const rowTop = box.y + labelH + SPACE.s;
  const areaH = Math.max(MIN_TAP, box.h - labelH - SPACE.s);

  if (waiting.length === 0) {
    container.add(
      scene.add.text(
        box.x + SPACE.s, rowTop + Math.min(areaH, MIN_TAP) / 2,
        heldAnimal(session)
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

  const { perRow, chipW, chipH } = trayGrid(waiting.length, { w: box.w, h: areaH });

  waiting.forEach((animal, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const inRow = Math.min(perRow, waiting.length - row * perRow);
    const stripW = chipW * inRow + GAP * (inRow - 1);
    const startX = box.x + Math.max(0, (box.w - stripW) / 2);
    drawChip(scene, container, state, callbacks, setMessage, animal, {
      x: startX + col * (chipW + GAP),
      y: rowTop + row * (chipH + GAP),
      w: chipW,
      h: chipH,
    });
  });
}

function drawChip(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  state: CrateLoadingState,
  callbacks: CrateLoadingCallbacks,
  setMessage: (copy: PanelCopy | null) => void,
  animal: LoadableAnimal,
  box: Box,
): void {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;

  container.add(
    createChromePlate(scene, cx, cy, box.w, box.h, { radius: 10 }),
  );

  // The same tile a loaded bay draws, so a chip and the bay it lands in
  // are one object before and after the tap. The crate mark rides
  // along: a child can tell before she picks anybody up that the snake
  // wants the warm vivarium and the bat wants the quiet one.
  drawAnimalTile(
    scene, container, state.animalsById.get(animal.id), animal.name,
    crateDefFor(animal.species),
    {
      left: box.x,
      top: box.y,
      cx,
      cy,
      slotW: box.w,
      slotH: box.h,
      withName: true,
      rowWhenWide: false,
    },
  );

  const hit = scene.add.rectangle(
    cx, cy, Math.max(box.w, MIN_TAP), Math.max(box.h, MIN_TAP), 0x000000, 0,
  ).setInteractive({ useHandCursor: true });
  // Hovering a waiting animal reads out what it needs, before any tap.
  hit.on('pointerover', () => setMessage({
    heading: `${animal.name} the ${animal.species}`,
    tone: null,
    body: [
      `${animal.name} travels in a ${crateDefFor(animal.species).label.toLowerCase()}.`,
      'Tap to pick them up.',
    ],
    cast: { members: [castOne(animal)] },
  }));
  hit.on('pointerout', () => setMessage(null));
  hit.on('pointerdown', () => callbacks.onHoldFromTray(animal.id));
  container.add(hit);
}
