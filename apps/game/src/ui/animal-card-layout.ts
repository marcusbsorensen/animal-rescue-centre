/**
 * Pure geometry for the animal card — no Phaser, so it can be unit-tested
 * the way ui/layout.ts is.
 *
 * The card it describes replaces AnimalDetailsPopup, whose height was an
 * arithmetic sum over however many actions the animal happened to qualify
 * for:
 *
 *     const panelH = 44 + 44 + speechH + 5 * statRowH + actionRows * 46 + 28;
 *
 * A shelter animal that was sick AND walkable AND outside AND needed a coat
 * reached five action rows and 466px, on a screen 375px tall, with no
 * scrolling anywhere in GameScene to rescue it. Capping the sum only moved
 * the overflow inside the panel.
 *
 * So the card is a *fixed* size and the action count no longer touches it.
 * Two primary actions and a More button are always in the same three
 * places; everything conditional lives on the More face, laid out as a
 * grid computed from the box rather than a box computed from the grid.
 * `animalCardLayout` therefore takes only the viewport — pass it an animal
 * with one action or with six and you get identical numbers back.
 */
import { MIN_TAP, MIN_TAP_GAP, SAFE_MARGIN } from './constants';
import { viewportIsShort } from './layout';

export interface Rect { x: number; y: number; w: number; h: number }

/**
 * Card size. Compact is the landscape-phone size and is what has to fit:
 * 560x300 leaves a margin inside 812x375, and inside the 812x325 a Home
 * Screen web clip gives us the height clamp below takes it to 293.
 * Regular is the iPad size — the same layout with more air, not a
 * different one.
 */
export const CARD_W_COMPACT = 560;
export const CARD_H_COMPACT = 300;
export const CARD_W_REGULAR = 620;
export const CARD_H_REGULAR = 360;

/** Inner padding. Everything is inset from the card edge by this. */
export const CARD_PAD = 16;

/** Row heights of the fixed content. Named so the sum is readable. */
const NAME_H = 28;      // 24px bold
const SPECIES_H = 20;   // 16px
const CHIP_H = 36;      // one state sentence, 19px
const BOND_H = 24;      // five hearts + "3 of 5"
const DOTS_H = 42;      // icon + word over a row of five dots
const FACT_H = 20;      // "Did you know?" line, 15px
const GAP_S = 6;
const GAP_M = 10;

/** Primary action buttons. Above MIN_TAP with room for an 18px label. */
export const ACTION_H = 56;

/** How many primary actions there are. Fixed: Feed, Play, More. */
export const ACTION_COUNT = 3;

const PORTRAIT_COMPACT = 124;
const PORTRAIT_REGULAR = 150;

/** Gap between the portrait column and the text column beside it. */
const COLUMN_GAP = 16;

/**
 * Height of the right-hand column's stacked rows. The portrait is sized
 * against this so neither column decides where the dots strip starts on
 * its own.
 */
const INFO_H = NAME_H + SPECIES_H + GAP_S + CHIP_H + GAP_M + BOND_H;

export interface AnimalCardLayout {
  card: Rect;
  /** Circular close target, top right. Radius is half MIN_TAP. */
  close: { cx: number; cy: number; r: number };
  /** Square box the portrait fills. Also the tap target for the story face. */
  portrait: { cx: number; cy: number; size: number };
  name: { x: number; y: number; w: number };
  species: { x: number; y: number; w: number };
  /** "Luna is hungry" — one line, one state, with its icon. */
  chip: Rect;
  /** Hearts row: bond, counted rather than given as a percentage. */
  bond: Rect;
  /** Full-width strip of four need groups. */
  dots: Rect;
  /** Primary row. `xs` are button centres; the row never changes length. */
  actions: { y: number; h: number; w: number; gap: number; xs: number[] };
  fact: { x: number; y: number; w: number };
}

/**
 * The card is centred on the viewport rather than on the play area: it is
 * a modal at depth 800, above the HUD and the nav bar rather than beside
 * them, and it dims both. The old popup rendered into gameContainer at
 * depth 0, so the chrome stayed lit and stayed tappable underneath it.
 */
export function animalCardLayout(width: number, height: number): AnimalCardLayout {
  const short = viewportIsShort(height);
  const w = Math.min(short ? CARD_W_COMPACT : CARD_W_REGULAR, width - SAFE_MARGIN * 2);
  const h = Math.min(short ? CARD_H_COMPACT : CARD_H_REGULAR, height - SAFE_MARGIN * 2);
  const x = Math.round((width - w) / 2);
  const y = Math.round((height - h) / 2);
  const card: Rect = { x, y, w, h };

  const innerL = x + CARD_PAD;
  const innerR = x + w - CARD_PAD;
  const top = y + CARD_PAD;

  const close = { cx: innerR - MIN_TAP / 2, cy: top + MIN_TAP / 2, r: MIN_TAP / 2 };

  const portraitSize = Math.min(short ? PORTRAIT_COMPACT : PORTRAIT_REGULAR, INFO_H);
  const portrait = {
    cx: innerL + portraitSize / 2,
    cy: top + portraitSize / 2,
    size: portraitSize,
  };

  const infoX = innerL + portraitSize + COLUMN_GAP;
  const infoW = innerR - infoX;
  // The name shares its row with the close button; everything below it has
  // the full column. A name running under the X is the sort of thing that
  // only shows up on the one animal with a long name.
  const name = { x: infoX, y: top, w: Math.max(0, infoW - MIN_TAP - MIN_TAP_GAP) };
  const species = { x: infoX, y: top + NAME_H, w: infoW };
  const chipY = species.y + SPECIES_H + GAP_S;
  const chip: Rect = { x: infoX, y: chipY, w: infoW, h: CHIP_H };
  const bond: Rect = { x: infoX, y: chipY + CHIP_H + GAP_M, w: infoW, h: BOND_H };

  // Bottom block, measured up from the card's bottom edge so the action
  // row sits in the same place whatever is above it.
  const factY = y + h - CARD_PAD - FACT_H;
  const fact = { x: innerL, y: factY, w: innerR - innerL };
  const actionsY = factY - GAP_S - ACTION_H;
  const actionW = (innerR - innerL - MIN_TAP_GAP * (ACTION_COUNT - 1)) / ACTION_COUNT;
  const xs: number[] = [];
  for (let i = 0; i < ACTION_COUNT; i++) {
    xs.push(innerL + actionW / 2 + i * (actionW + MIN_TAP_GAP));
  }
  const actions = { y: actionsY, h: ACTION_H, w: actionW, gap: MIN_TAP_GAP, xs };

  // The dots strip takes the space left between the two blocks. On a web
  // clip that is 55px for a 42px strip; on an iPad it is far more, and the
  // strip centres in it rather than leaving all the air at the bottom.
  const headBottom = top + Math.max(portraitSize, INFO_H);
  const slack = actionsY - headBottom - DOTS_H;
  const dots: Rect = {
    x: innerL,
    y: headBottom + Math.max(0, Math.round(slack / 2)),
    w: innerR - innerL,
    h: DOTS_H,
  };

  return { card, close, portrait, name, species, chip, bond, dots, actions, fact };
}

/**
 * The More face: every conditional action, in a grid sized from the card.
 *
 * Three columns rather than a column of full-width rows because six rows
 * of 48 plus their gaps is 328px against the 261 a compact card has for
 * them. Three columns give each cell room for a two-line label *and* the
 * reason it is unavailable, which is the point of the face — a greyed
 * button that says why teaches the rule; one that vanishes teaches
 * nothing.
 *
 * Cells never grow past `MORE_CELL_MAX_H`, so a pet with two actions gets
 * two normal-sized buttons rather than two enormous ones.
 */
export const MORE_COLS = 3;
export const MORE_GAP = 12;
export const MORE_CELL_MAX_H = 112;
/** Room under each button for its reason line. */
export const MORE_REASON_H = 40;

export interface MoreGrid {
  cols: number;
  rows: number;
  cells: Rect[];
  /** Height of the button inside each cell; the rest is the reason line. */
  buttonH: number;
  title: { x: number; y: number; w: number };
  back: { cx: number; cy: number; r: number };
  close: { cx: number; cy: number; r: number };
}

const MORE_TITLE_H = 30;

export function moreGridLayout(card: Rect, count: number): MoreGrid {
  const innerL = card.x + CARD_PAD;
  const innerR = card.x + card.w - CARD_PAD;
  const top = card.y + CARD_PAD;

  const back = { cx: innerL + MIN_TAP / 2, cy: top + MIN_TAP / 2, r: MIN_TAP / 2 };
  const close = { cx: innerR - MIN_TAP / 2, cy: top + MIN_TAP / 2, r: MIN_TAP / 2 };
  const titleX = back.cx + MIN_TAP / 2 + MIN_TAP_GAP;
  const title = {
    x: titleX,
    y: top + (MIN_TAP - MORE_TITLE_H) / 2,
    w: Math.max(0, close.cx - MIN_TAP / 2 - MIN_TAP_GAP - titleX),
  };

  const gridTop = top + MIN_TAP + MORE_GAP;
  const gridBottom = card.y + card.h - CARD_PAD;
  const cols = Math.min(MORE_COLS, Math.max(1, count));
  const rows = Math.max(1, Math.ceil(count / MORE_COLS));
  const cellW = (innerR - innerL - MORE_GAP * (MORE_COLS - 1)) / MORE_COLS;
  const cellH = Math.min(
    MORE_CELL_MAX_H,
    (gridBottom - gridTop - MORE_GAP * (rows - 1)) / rows,
  );
  const buttonH = Math.max(MIN_TAP, Math.min(ACTION_H, cellH - MORE_REASON_H));

  const cells: Rect[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / MORE_COLS);
    const col = i % MORE_COLS;
    // A short last row centres, so four actions do not leave a hole beside
    // the fourth.
    const inRow = Math.min(MORE_COLS, count - row * MORE_COLS);
    const rowW = inRow * cellW + (inRow - 1) * MORE_GAP;
    const rowL = innerL + (innerR - innerL - rowW) / 2;
    cells.push({
      x: rowL + col * (cellW + MORE_GAP),
      y: gridTop + row * (cellH + MORE_GAP),
      w: cellW,
      h: cellH,
    });
  }

  return { cols, rows, cells, buttonH, title, back, close };
}
