/**
 * Where everything on the adoption match picker goes, as plain numbers.
 *
 * Kept out of AdoptionMatchScene so the geometry can be unit-tested without a
 * canvas, in the way `dialogue-layout.ts` is for the conversation.
 *
 * The picker used to be one fixed column of header, polaroid, three cards and a
 * button, sized for a tablet. On a phone held sideways (844x390) that column
 * is 700px tall: the cards were left 28px of height and were squashed to a
 * strip with their text printed across each other. Three arrangements, chosen
 * by what the screen can hold:
 *
 *   columns  a tablet held sideways (1024x768, 1180x820). The header, the
 *            animal's polaroid, three tall cards side by side, a button.
 *   rows     a phone held sideways (667x375 to 932x430). A rail down the left
 *            (the question, the animal, the way out) and the three families as
 *            wide rows on the right. Width is plentiful on a sideways phone and
 *            height is not, so the cards spend width.
 *   stack    a narrow window (a portrait phone, the desktop game in a thin
 *            window). Header, animal, then the families one under the other.
 *
 * Nothing here may overlap anything else, nothing may leave the screen's safe
 * area, and everything a child taps is at least `MIN_TAP` square. The scene
 * draws inside these boxes and fits every piece of text to its box (it shrinks
 * the type towards `MIN_TEXT`, then trims), so a long name or blurb cannot spill.
 * `e2e/adoption-handover.spec.ts` measures the real result at six screen sizes.
 */
import { MIN_TAP, MIN_TAP_GAP, SAFE_MARGIN, PAGE_MARGIN } from './constants';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PickerMode = 'columns' | 'rows' | 'stack';

export interface PickerInput {
  width: number;
  height: number;
  /** How many families are on offer (the game offers three). */
  count: number;
  /** Notch / Dynamic Island / home-bar insets, in CSS pixels. */
  safeLeft?: number;
  safeRight?: number;
  safeTop?: number;
  safeBottom?: number;
}

/** One family's card: the whole card is the tap target; everything else is drawn inside it. */
export interface CardPlan {
  rect: Rect;
  /**
   * `stacked`: portrait on top, name and blurb below (a tall card).
   * `side`: portrait on the left, text on the right (a wide, short row).
   */
  style: 'stacked' | 'side';
  portrait: Rect;
  /** The "Great match" pill. */
  sticker: Rect;
  /** The sticker shares the name's line (there is room beside it), or sits above it. */
  stickerInline: boolean;
  /** Where the name starts, how wide it may be, and how many lines it may take. */
  name: Rect;
  nameFont: number;
  nameLines: number;
  align: 'left' | 'center';
  /** The text column. Name, blurb and reasons flow down it; `y + h` is the bottom they may reach. */
  text: Rect;
  blurbFont: number;
  /** There is room for the "• Loves cats" reasons under the blurb. */
  reasons: boolean;
  reasonFont: number;
}

export interface PickerLayout {
  mode: PickerMode;
  header: Rect;
  titleFont: number;
  titleLines: number;
  subtitleFont: number;
  subtitleLines: number;
  polaroid: Rect;
  /** `wide`: the animal beside its words. `tall`: the animal above its words (the rail). */
  polaroidStyle: 'wide' | 'tall';
  cards: CardPlan[];
  /** The way out: a visible pill at least MIN_TAP tall. Its whole rect is the tap target. */
  notYet: Rect;
  /** The label: the whole sentence where there is room, just "Not yet" in the narrow rail of a phone. */
  notYetLabel: string;
  notYetFont: number;
  notYetLines: number;
  /** Where the "no families this week" message goes when no one is on offer. */
  empty: Rect;
}

/** The smallest the scene will shrink a child's text to, when a box is too tight for the size it asked for. */
export const MIN_TEXT = 14;

export const NOT_YET_FULL = '← Not yet, let me hug them first';
export const NOT_YET_SHORT = '← Not yet';

export const STICKER_W = 116;
export const STICKER_H = 26;

/** The tallest a card gets, however tall the screen. */
const CARD_MAX_H = 400;
const ROW_MAX_H = 150;
const COLUMN_MAX_W = 340;
/** The least height a `columns` card needs to hold a two-line name, a four-line blurb and two reasons. */
const COLUMNS_CARD_MIN_H = 380;
const COLUMNS_HEADER_H = 88;
const COLUMNS_POLAROID_H = 132;
const COLUMNS_MIN_W = 900;
const ROWS_MIN_W = 560;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** True when `inner` lies wholly inside `outer`. */
export function rectInside(inner: Rect, outer: Rect, tolerance = 0): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.w <= outer.x + outer.w + tolerance &&
    inner.y + inner.h <= outer.y + outer.h + tolerance
  );
}

interface Frame {
  W: number;
  H: number;
  n: number;
  /** The safe area: where anything a child taps may sit. */
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function frameOf(i: PickerInput): Frame {
  const W = i.width;
  const H = i.height;
  return {
    W,
    H,
    n: Math.max(0, Math.floor(i.count)),
    left: SAFE_MARGIN + (i.safeLeft ?? 0),
    right: W - SAFE_MARGIN - (i.safeRight ?? 0),
    top: Math.max(SAFE_MARGIN, i.safeTop ?? 0),
    bottom: H - Math.max(SAFE_MARGIN, i.safeBottom ?? 0),
  };
}

/** How tall the cards can be in the `columns` arrangement, which decides whether it is chosen. */
function columnsRoom(f: Frame): number {
  const top = Math.max(PAGE_MARGIN, f.top);
  const polaroidBottom = top + COLUMNS_HEADER_H + MIN_TAP_GAP + COLUMNS_POLAROID_H;
  const notYetTop = f.bottom - 52;
  return notYetTop - 16 - (polaroidBottom + 16);
}

export function pickerMode(i: PickerInput): PickerMode {
  const f = frameOf(i);
  if (f.W >= COLUMNS_MIN_W && columnsRoom(f) >= COLUMNS_CARD_MIN_H) return 'columns';
  if (f.W >= ROWS_MIN_W) return 'rows';
  return 'stack';
}

export function computePickerLayout(input: PickerInput): PickerLayout {
  const f = frameOf(input);
  const mode = pickerMode(input);
  return mode === 'columns' ? columnsLayout(f) : mode === 'rows' ? rowsLayout(f) : stackLayout(f);
}

// ── columns: a tablet held sideways ─────────────────────────────

function columnsLayout(f: Frame): PickerLayout {
  const L = PAGE_MARGIN + (f.left - SAFE_MARGIN);
  const R = f.right + SAFE_MARGIN - PAGE_MARGIN;
  const mid = (L + R) / 2;
  const top = Math.max(PAGE_MARGIN, f.top);

  const headerW = Math.min(R - L, 640);
  const header: Rect = { x: mid - headerW / 2, y: top, w: headerW, h: COLUMNS_HEADER_H };
  const polaroid: Rect = { x: mid - 150, y: header.y + header.h + MIN_TAP_GAP, w: 300, h: COLUMNS_POLAROID_H };

  const notYetW = Math.min(R - L, 380);
  const notYet: Rect = { x: mid - notYetW / 2, y: f.bottom - 52, w: notYetW, h: 52 };

  const cardsTop = polaroid.y + polaroid.h + 16;
  const cardsBottom = notYet.y - 16;
  const room = cardsBottom - cardsTop;
  const gap = 16;
  const n = Math.max(1, f.n);
  const cw = Math.min(COLUMN_MAX_W, Math.floor((R - L - gap * (n - 1)) / n));
  const ch = Math.min(CARD_MAX_H, room);
  const total = n * cw + gap * (n - 1);
  const x0 = mid - total / 2;
  const y0 = cardsTop + (room - ch) / 2;

  const cards: CardPlan[] = [];
  for (let k = 0; k < f.n; k++) {
    cards.push(stackedCard({ x: x0 + k * (cw + gap), y: y0, w: cw, h: ch }));
  }
  return {
    mode: 'columns',
    header,
    titleFont: 28,
    titleLines: 1,
    subtitleFont: 16,
    subtitleLines: 1,
    polaroid,
    polaroidStyle: 'wide',
    cards,
    notYet,
    notYetLabel: NOT_YET_FULL,
    notYetFont: 18,
    notYetLines: 1,
    empty: { x: L, y: cardsTop, w: R - L, h: room },
  };
}

/** A tall card: the portrait on top, then the match pill, the name, the blurb and the reasons. */
function stackedCard(rect: Rect): CardPlan {
  const pad = 14;
  // A taller card gives the family a bigger face.
  const ps = Math.min(clamp(Math.round(rect.h * 0.3), 96, 130), rect.w - pad * 2);
  const portrait: Rect = { x: rect.x + (rect.w - ps) / 2, y: rect.y + pad, w: ps, h: ps };
  const sticker: Rect = {
    x: rect.x + (rect.w - STICKER_W) / 2,
    y: portrait.y + portrait.h + 8,
    w: STICKER_W,
    h: STICKER_H,
  };
  const textTop = sticker.y + sticker.h + 8;
  const text: Rect = { x: rect.x + pad, y: textTop, w: rect.w - pad * 2, h: rect.y + rect.h - pad - textTop };
  return {
    rect,
    style: 'stacked',
    portrait,
    sticker,
    stickerInline: false,
    name: { x: text.x, y: text.y, w: text.w, h: 52 },
    nameFont: 20,
    nameLines: 2,
    align: 'center',
    text,
    blurbFont: 16,
    reasons: true,
    reasonFont: 16,
  };
}

// ── rows: a phone held sideways ─────────────────────────────────

function rowsLayout(f: Frame): PickerLayout {
  const usable = f.right - f.left;
  const railW = clamp(Math.round(usable * 0.27), 168, 240);
  const railX = f.left;
  const gap = MIN_TAP_GAP;

  const header: Rect = { x: railX, y: f.top, w: railW, h: 124 };
  const notYet: Rect = { x: railX, y: f.bottom - 52, w: railW, h: 52 };
  const polaroidTop = header.y + header.h + 8;
  const polaroid: Rect = {
    x: railX,
    y: polaroidTop,
    w: railW,
    h: Math.max(0, Math.min(150, notYet.y - 8 - polaroidTop)),
  };

  const cardsX = railX + railW + gap;
  const cardsW = f.right - cardsX;
  const n = Math.max(1, f.n);
  const room = f.bottom - f.top;
  const ch = Math.floor(Math.min(ROW_MAX_H, (room - gap * (n - 1)) / n));
  const total = n * ch + gap * (n - 1);
  const y0 = f.top + (room - total) / 2;

  const cards: CardPlan[] = [];
  for (let k = 0; k < f.n; k++) {
    cards.push(sideCard({ x: cardsX, y: y0 + k * (ch + gap), w: cardsW, h: ch }, true));
  }
  return {
    mode: 'rows',
    header,
    titleFont: 20,
    titleLines: 1,
    subtitleFont: 16,
    subtitleLines: 3,
    polaroid,
    polaroidStyle: 'tall',
    cards,
    notYet,
    notYetLabel: NOT_YET_SHORT,
    notYetFont: 18,
    notYetLines: 1,
    empty: { x: cardsX, y: f.top, w: cardsW, h: room },
  };
}

/** A wide, short card: the portrait on the left, and on the right the name (with the pill beside it) over the blurb. */
function sideCard(rect: Rect, inline: boolean): CardPlan {
  const pad = 6;
  const ps = Math.min(rect.w < 500 ? 80 : 96, rect.h - pad * 2);
  const portrait: Rect = { x: rect.x + 10, y: rect.y + (rect.h - ps) / 2, w: ps, h: ps };
  const textX = portrait.x + portrait.w + 12;
  const textW = rect.x + rect.w - 12 - textX;
  const top = rect.y + pad;
  const sticker: Rect = { x: textX + textW - STICKER_W, y: top, w: STICKER_W, h: STICKER_H };

  let name: Rect;
  let flowTop: number;
  if (inline) {
    name = { x: textX, y: top, w: textW - STICKER_W - 8, h: STICKER_H };
    flowTop = top + STICKER_H + 2;
  } else {
    // No room for the pill beside the name: the pill takes the first line, left-aligned.
    sticker.x = textX;
    name = { x: textX, y: top + STICKER_H + 2, w: textW, h: 52 };
    flowTop = name.y;
  }
  const bottom = rect.y + rect.h - pad;
  const text: Rect = { x: textX, y: flowTop, w: textW, h: bottom - flowTop };
  // Three lines of blurb are the least a card is allowed; the reasons need two more below them.
  const reasons = text.h >= 104;
  return {
    rect,
    style: 'side',
    portrait,
    sticker,
    stickerInline: inline,
    name,
    nameFont: 18,
    nameLines: inline ? 1 : 2,
    align: 'left',
    text,
    blurbFont: 16,
    reasons,
    reasonFont: 16,
  };
}

// ── stack: a narrow window ──────────────────────────────────────

function stackLayout(f: Frame): PickerLayout {
  const L = f.left;
  const R = f.right;
  const mid = (L + R) / 2;
  const usable = R - L;
  const header: Rect = { x: mid - Math.min(usable, 420) / 2, y: f.top, w: Math.min(usable, 420), h: 64 };
  const polaroidW = Math.min(usable, 280);
  const polaroid: Rect = { x: mid - polaroidW / 2, y: header.y + header.h + 10, w: polaroidW, h: 96 };
  const notYetW = Math.min(usable, 360);
  const notYet: Rect = { x: mid - notYetW / 2, y: f.bottom - 52, w: notYetW, h: 52 };

  const cardsTop = polaroid.y + polaroid.h + 14;
  const cardsBottom = notYet.y - 14;
  const gap = MIN_TAP_GAP;
  const n = Math.max(1, f.n);
  const room = Math.max(0, cardsBottom - cardsTop);
  const ch = Math.floor(clamp((room - gap * (n - 1)) / n, MIN_TAP * 2, 170));
  const cw = Math.min(usable, 460);

  const cards: CardPlan[] = [];
  for (let k = 0; k < f.n; k++) {
    // The pill sits above the name: a narrow card has no room beside it.
    cards.push(sideCard({ x: mid - cw / 2, y: cardsTop + k * (ch + gap), w: cw, h: ch }, false));
  }
  return {
    mode: 'stack',
    header,
    titleFont: 24,
    titleLines: 1,
    subtitleFont: 16,
    subtitleLines: 2,
    polaroid,
    polaroidStyle: 'wide',
    cards,
    notYet,
    notYetLabel: NOT_YET_FULL,
    notYetFont: 16,
    notYetLines: 2,
    empty: { x: L, y: cardsTop, w: usable, h: room },
  };
}
