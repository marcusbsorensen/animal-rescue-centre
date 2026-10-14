/**
 * Where everything in the dialogue overlay goes, as plain numbers.
 *
 * Kept out of DialogueRunner so the geometry can be unit-tested without a
 * canvas, and so the Playwright checks and the runner share one source for
 * "is the speaker covered".
 *
 * The scene it draws: the speaker stands at their own end of the dialogue box,
 * waist-up, 55-65% of the viewport's height, with their lower edge tucked just
 * behind the box's top edge (so there is never a cut edge hanging in the open).
 * The box sits along the bottom. When a beat asks the
 * player to choose, the reply pills go on the far side of the speaker, above the
 * box, so the speaker stays in clear view (a stack down the middle used to hide
 * Marnie on a sideways phone).
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutInput {
  width: number;
  height: number;
  side: 'left' | 'right';
  /** Width over height of the portrait as it will be shown (after cropping). */
  portraitAspect: number;
  choiceCount: number;
  /** Notch / Dynamic Island insets, in CSS pixels. */
  safeLeft?: number;
  safeRight?: number;
}

export interface DialogueLayout {
  /** A screen at least 600px tall gets a larger box and type. */
  tall: boolean;
  margin: number;
  box: Rect;
  boxPad: number;
  bodyFont: number;
  bodyLine: number;
  /** Where the body copy starts, and how wide it may run. */
  body: { x: number; y: number; w: number };
  /** The visible part of the portrait, on screen. */
  portrait: Rect;
  skip: Rect;
  namePillH: number;
  /** One rect per choice, first choice on top. Empty when there are none. */
  choices: Rect[];
  choiceFont: number;
}

/** The share of the viewport's height the speaker should stand. */
export const PORTRAIT_SHARE = 0.6;
/**
 * The speaker is never allowed to be wider than this share of the usable width.
 * A single figure never gets near it; a household with its arms out (the
 * "greeting" pictures run up to twice as wide as tall) or a crowd of children
 * does, and gives up a little height rather than fill the screen.
 */
export const PORTRAIT_MAX_WIDTH_SHARE = 0.75;
/** The least height and width of the SKIP pill, which is also its tap target. */
export const SKIP_MIN = 44;

const MARGIN = 14;
/** How far the portrait runs behind the top of the box, hiding the cut edge. */
const OVERLAP = 10;
const TOP_MARGIN = 8;
const BOX_MAX_W = 760;
/** The speaker stands this far in from the end of the box, so no cut edge is left in the open. */
const STAND_INSET = 4;
const CHOICE_GAP = 10;
const CHOICE_MAX_W = 420;
const CHOICE_MIN_W = 240;
/** Clear air between the speaker and the pills that sit beside them. */
const FAR_SIDE_GAP = 16;

export function computeLayout(i: LayoutInput): DialogueLayout {
  const { width: W, height: H } = i;
  const tall = H >= 600;
  const margin = MARGIN;
  const left = margin + (i.safeLeft ?? 0);
  const right = W - margin - (i.safeRight ?? 0);
  const usable = right - left;

  // ── Box ──
  // A phone's box is 120 tall so that two lines of copy end above the SKIP pill, which is 44px tall.
  const boxH = tall ? 136 : 120;
  const bottomGap = tall ? 24 : 16;
  const boxW = Math.min(usable, BOX_MAX_W);
  const box: Rect = {
    x: left + (usable - boxW) / 2,
    y: H - bottomGap - boxH,
    w: boxW,
    h: boxH,
  };
  const boxPad = 22;
  const bodyFont = tall ? 21 : 19;
  const bodyLine = tall ? 28 : 25;
  const body = { x: box.x + boxPad, y: box.y + (tall ? 24 : 20), w: box.w - boxPad * 2 };

  // ── SKIP, bottom-right inside the box ──
  // Still a small pill, as in the reference, but never under SKIP_MIN: a seven-year-old's thumb
  // has to find it, and it is the only way out of a conversation. The pill is its own tap target.
  const skipW = tall ? 96 : 88;
  const skipH = SKIP_MIN;
  const skip: Rect = {
    x: box.x + box.w - 14 - skipW,
    y: box.y + box.h - 8 - skipH,
    w: skipW,
    h: skipH,
  };

  // ── Portrait ──
  const portraitBottom = box.y + OVERLAP;
  const wanted = Math.round(H * PORTRAIT_SHARE);
  const roomAbove = portraitBottom - TOP_MARGIN;
  const widthCap = (usable * PORTRAIT_MAX_WIDTH_SHARE) / Math.max(0.2, i.portraitAspect);
  const ph = Math.max(1, Math.floor(Math.min(wanted, roomAbove, widthCap)));
  const pw = Math.round(ph * i.portraitAspect);
  const portrait: Rect = {
    x: i.side === 'left' ? box.x + STAND_INSET : box.x + box.w - STAND_INSET - pw,
    y: portraitBottom - ph,
    w: pw,
    h: ph,
  };

  // ── Choices: on the far side of the speaker, stacked above the box ──
  const choices: Rect[] = [];
  // 48 on a phone: three of them still fit above the 120px box on a 325px-tall screen, and 48 is MIN_TAP.
  const choiceH = tall ? 58 : 48;
  if (i.choiceCount > 0) {
    // The pills line up with the box's far end. If the speaker is big enough
    // to leave less than a readable pill's width there, they run out past the
    // box's end instead, up to the screen's usable edge.
    let farStart: number;
    let farEnd: number;
    if (i.side === 'left') {
      farStart = portrait.x + portrait.w + FAR_SIDE_GAP;
      farEnd = Math.min(right, Math.max(box.x + box.w, farStart + CHOICE_MIN_W));
    } else {
      farEnd = portrait.x - FAR_SIDE_GAP;
      farStart = Math.max(left, Math.min(box.x, farEnd - CHOICE_MIN_W));
    }
    const free = Math.max(0, farEnd - farStart);
    const w = Math.floor(Math.min(free, CHOICE_MAX_W));
    const x = i.side === 'left' ? farEnd - w : farStart;
    const stack = i.choiceCount * choiceH + (i.choiceCount - 1) * CHOICE_GAP;
    const top = box.y - 16 - stack;
    for (let n = 0; n < i.choiceCount; n++) {
      choices.push({ x, y: top + n * (choiceH + CHOICE_GAP), w, h: choiceH });
    }
  }

  return {
    tall,
    margin,
    box,
    boxPad,
    bodyFont,
    bodyLine,
    body,
    portrait,
    skip,
    namePillH: tall ? 40 : 36,
    choices,
    choiceFont: bodyFont - 1,
  };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
