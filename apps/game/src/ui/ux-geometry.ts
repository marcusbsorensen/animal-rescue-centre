/**
 * Pairwise layout checks — pure, no Phaser, so they can be unit-tested.
 *
 * The UX harness measured every element against a rule about *itself*:
 * how big it is, what font it uses, how far it sits from an edge. The
 * review of 29 August found seventeen things by hand and the harness had
 * caught none of them, because nine were one element on top of another
 * and two were a control off the bottom of the screen. Those are
 * relations between elements, and nothing was looking at relations.
 *
 * The predicates live here rather than inside `e2e/ux-review.spec.ts` for
 * one reason: a check that quietly stops catching anything is worse than
 * no check, and the only way to know it still bites is to hand it the
 * geometry of a defect and watch it fire. `__tests__/ux-geometry.test.ts`
 * does that with the numbers from the review itself.
 */

export interface UxRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Human-readable, so a finding points at something. */
  label: string;
  /**
   * Lives in something that scrolls or is masked. Off the viewport then
   * means "below the fold", not "cannot be reached" — AccountScene's badge
   * wall masks forty-odd tiles that way and every one of them is fine.
   */
  clipped?: boolean;
  /**
   * `position: sticky` or `fixed`. Sitting over scrolling content is what
   * such a control is *for*: the exit rows on paths, adoption and friends
   * are pinned deliberately, and scoring them as collisions would report
   * the fix as the bug.
   */
  pinned?: boolean;
  /**
   * Position in the tree it was drawn from — child indices joined with
   * dots, e.g. `"3.1.4"`. Containment means two different things and this
   * is what tells them apart: a button *inside* the card that owns it is
   * a descendant of it and fine, while a Back button that happens to land
   * inside an unrelated card's hit rectangle is a sibling, and whichever
   * was added last silently takes the tap.
   *
   * Without it the second case reads as the first and is excused. That is
   * how DepotScene's "← Back to centre" hid inside the Decorations card
   * on a landscape phone.
   */
  path?: string;
  /**
   * The element's four real corners, in draw order, when it sits under a
   * transform. `x/y/w/h` is the axis-aligned bounding box, which for a
   * rotated element is bigger than the element: a 300x48 pill tilted 0.8
   * degrees reports 52.2px tall, because the box has to contain the corners.
   *
   * That phantom height is charged to both neighbours in a stack, so a real
   * 12px gap measured 7.8px and T4 failed a layout that was correct.
   * Undefined when the element is untransformed, in which case the bounding
   * box IS the element and `quadOf` derives the corners from it.
   */
  quad?: readonly (readonly [number, number])[];
}

/** True when `a` is an ancestor of `b` in the tree they were drawn from. */
export function isAncestorOf(a: UxRect, b: UxRect): boolean {
  if (a.path === undefined || b.path === undefined) return false;
  return b.path.startsWith(`${a.path}.`);
}



/** Area the two rects share. 0 when they miss or merely touch. */
export function intersectionArea(a: UxRect, b: UxRect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export const areaOf = (r: UxRect): number => Math.max(0, r.w) * Math.max(0, r.h);

/** The rect's four corners: its own when it is transformed, else its box. */
export function quadOf(r: UxRect): readonly (readonly [number, number])[] {
  if (r.quad && r.quad.length === 4) return r.quad;
  return [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
}

/** Shortest distance between two line segments, 0 if they cross. */
function segmentDistance(
  p1: readonly [number, number], p2: readonly [number, number],
  q1: readonly [number, number], q2: readonly [number, number],
): number {
  const d1x = p2[0] - p1[0], d1y = p2[1] - p1[1];
  const d2x = q2[0] - q1[0], d2y = q2[1] - q1[1];
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) > 1e-12) {
    const t = ((q1[0] - p1[0]) * d2y - (q1[1] - p1[1]) * d2x) / denom;
    const u = ((q1[0] - p1[0]) * d1y - (q1[1] - p1[1]) * d1x) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  const pointToSegment = (
    p: readonly [number, number],
    a: readonly [number, number],
    b: readonly [number, number],
  ): number => {
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const len2 = vx * vx + vy * vy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2));
    return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
  };
  return Math.min(
    pointToSegment(p1, q1, q2), pointToSegment(p2, q1, q2),
    pointToSegment(q1, p1, p2), pointToSegment(q2, p1, p2),
  );
}

/**
 * Do two convex polygons overlap? Separating-axis theorem: if any edge
 * normal separates them, they do not.
 */
function convexOverlap(
  a: readonly (readonly [number, number])[],
  b: readonly (readonly [number, number])[],
): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const nx = -(q[1] - p[1]), ny = q[0] - p[0];
      let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
      for (const v of a) { const d = v[0] * nx + v[1] * ny; aMin = Math.min(aMin, d); aMax = Math.max(aMax, d); }
      for (const v of b) { const d = v[0] * nx + v[1] * ny; bMin = Math.min(bMin, d); bMax = Math.max(bMax, d); }
      if (aMax < bMin || bMax < aMin) return false;
    }
  }
  return true;
}

/**
 * Clear space between two controls — what a finger has to land in.
 *
 * Measured between the shapes themselves, not their bounding boxes. Those
 * are the same thing until something is rotated, and then they are not:
 * arrival's choice pills hang on a plaque tilted 0.8 degrees, and their
 * boxes overlap while the pills are a comfortable 12px apart. Scoring the
 * boxes reported a defect in a layout that was right, and the error grows
 * with the control's width — a 300px pill loses 4.2px to the tilt where a
 * 265px one loses 3.7px, which was enough to move the same screen across
 * the FAIL boundary between runs.
 *
 * 0 when they touch or overlap; whether that is a defect is L8's question,
 * not this one.
 */
export function gapBetween(a: UxRect, b: UxRect): number {
  const pa = quadOf(a), pb = quadOf(b);
  if (convexOverlap(pa, pb)) return 0;
  let best = Infinity;
  for (let i = 0; i < pa.length; i++) {
    for (let j = 0; j < pb.length; j++) {
      best = Math.min(best, segmentDistance(
        pa[i], pa[(i + 1) % pa.length], pb[j], pb[(j + 1) % pb.length],
      ));
    }
  }
  return best;
}

/** True when the rect's centre falls outside the viewport. */
export function centreOffScreen(r: UxRect, vw: number, vh: number): boolean {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  return cx < 0 || cy < 0 || cx > vw || cy > vh;
}

/** True when any part of the rect falls outside the viewport. */
export function spillsOffScreen(r: UxRect, vw: number, vh: number): boolean {
  return r.x < 0 || r.y < 0 || r.x + r.w > vw || r.y + r.h > vh;
}

export interface ReachVerdict {
  /** Centre is off screen. Gone — a dead end if the screen demands it. */
  unreachable: UxRect[];
  /** Part of the target is off screen. Half a control is a defect too. */
  spilling: UxRect[];
  /** Off screen, but inside something that scrolls. Reachable. */
  belowFold: UxRect[];
}

/**
 * Split the controls that leave the viewport into the ones a child cannot
 * get to, the ones she can only partly hit, and the ones she can scroll to.
 *
 * Findings 1 and 2 are why this exists: the Paths screen's only way out
 * and adoption's only way to decline both left the bottom of the screen,
 * on screens a child cannot leave without them, and every other rule in
 * the harness passed them — right size, right spacing, right font.
 *
 * **The centre test alone would not have caught either.** The review
 * proposed "nothing interactive has its centre outside the viewport", and
 * the Paths exit hung *8px* off the bottom: its centre was comfortably on
 * screen and the check would have said so. Spilling is the rule that
 * bites, and on iOS it bites for a second reason — the bottom strip is
 * the home-gesture area, so the OS takes the touch before the game does.
 */
export function reachability(controls: UxRect[], vw: number, vh: number): ReachVerdict {
  const out = controls.filter((c) => spillsOffScreen(c, vw, vh));
  const visible = out.filter((c) => !c.clipped);
  return {
    unreachable: visible.filter((c) => centreOffScreen(c, vw, vh)),
    spilling: visible.filter((c) => !centreOffScreen(c, vw, vh)),
    belowFold: out.filter((c) => c.clipped),
  };
}

export interface OverlapPair {
  a: UxRect;
  b: UxRect;
  /** Share of the smaller rect that the two have in common, 0-1. */
  share: number;
  /**
   * `partial` — the two share a region and neither contains the other.
   *   Unambiguously wrong: there is a strip where the child cannot tell
   *   which control she is pressing.
   * `stacked` — one is entirely inside the other, and they are not the
   *   same thing. Sometimes the design (a tappable card carrying a
   *   Welcome button) and sometimes a bug (DepotScene's "← Back to
   *   centre" landing inside the Decorations card). Either way only draw
   *   order decides which one gets the tap, which is not something to
   *   leave to chance — but it is not a finding to fail a run on either,
   *   so the caller reports it and does not score it.
   */
  kind: 'partial' | 'stacked';
}

/**
 * Ignore a pinned control sitting over scrolling content — that is the
 * design — and pairs where the two are in different stacking layers.
 */
function pinnedOverScroll(a: UxRect, b: UxRect): boolean {
  return (!!a.pinned && !!b.clipped) || (!!b.pinned && !!a.clipped);
}

/**
 * Pairs of controls that share a region.
 *
 * The child aims at one control and gets the other, with no model for
 * why: pressing the right half of the room's Decorate button turned the
 * music off, because the HUD is drawn after the room and took the tap.
 *
 * A parent and its own child are excused — that is one control, measured
 * twice. Everything else is returned, tagged `partial` or `stacked` so
 * the caller can score the certain case and merely report the ambiguous
 * one. `minShare` keeps a one-pixel graze out; `nestedAt` is where
 * containment starts.
 */
export function overlappingControls(
  controls: UxRect[],
  { minShare = 0.2, nestedAt = 0.95 } = {},
): OverlapPair[] {
  const out: OverlapPair[] = [];
  for (let i = 0; i < controls.length; i++) {
    for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i];
      const b = controls[j];
      if (pinnedOverScroll(a, b)) continue;
      const inter = intersectionArea(a, b);
      if (inter <= 0) continue;
      const share = inter / Math.min(areaOf(a), areaOf(b));
      if (share < minShare) continue;
      if (isAncestorOf(a, b) || isAncestorOf(b, a)) continue;
      out.push({ a, b, share, kind: share >= nestedAt ? 'stacked' : 'partial' });
    }
  }
  return out;
}

export interface CutText {
  text: UxRect;
  by: UxRect;
  share: number;
}

/**
 * Text a control covers *part* of.
 *
 * Containment scores nothing, and cannot: in this codebase a button's
 * label is a *sibling* of its hit rectangle — `createChromeButton` adds both to
 * the same container — so the tree cannot tell a label from a control
 * dropped on top of unrelated words. Trying it turned this check into 140
 * findings of buttons wearing their own labels.
 *
 * What scores is text a control *cuts*: the rail's arrival card used to
 * run two lines of story to y+68 under a Welcome button whose top edge
 * was at y+60, so the second line — the only reason a child reads the
 * card — was printed underneath it. And a label wider than the cell that
 * holds it, which is what `createChromeButton`'s 28px-a-side padding produces
 * without saying so.
 */
export function textCutByControls(
  texts: UxRect[],
  controls: UxRect[],
  { minShare = 0.15, containedAt = 0.9 } = {},
): CutText[] {
  const out: CutText[] = [];
  for (const t of texts) {
    if (areaOf(t) <= 0) continue;
    for (const c of controls) {
      if (pinnedOverScroll(t, c)) continue;
      const inter = intersectionArea(t, c);
      if (inter <= 0) continue;
      const share = inter / areaOf(t);
      if (share < minShare || share >= containedAt) continue;
      out.push({ text: t, by: c, share });
    }
  }
  return out;
}

export interface ControlGroup {
  /** Every control in the group. Exactly one for anything not a gallery. */
  members: UxRect[];
  /** True when the members are one tile repeated, not N separate choices. */
  gallery: boolean;
}

/** True when two rects are the same size to within `tol` on both axes. */
function sameSize(a: UxRect, b: UxRect, tol: number): boolean {
  return Math.abs(a.w - b.w) <= tol && Math.abs(a.h - b.h) <= tol;
}

/** Distinct values, ascending, merging anything within `tol` of its neighbour. */
function lanes(values: number[], tol: number): number[] {
  const out: number[] = [];
  for (const v of [...values].sort((p, q) => p - q)) {
    if (out.length === 0 || Math.abs(v - out[out.length - 1]) > tol) out.push(v);
  }
  return out;
}

/** True when the gaps between successive lanes are all the same. */
function uniformPitch(lane: number[], tol: number): boolean {
  if (lane.length < 3) return true; // one gap cannot disagree with itself
  const gaps = lane.slice(1).map((v, i) => v - lane[i]);
  return Math.max(...gaps) - Math.min(...gaps) <= tol;
}

/**
 * Collapse a repeated tile into the one control it reads as.
 *
 * L6 asks how many things a screen puts in front of a child at once. It
 * counted every interactive object, and AccountScene answered 21 — one
 * Back button and twenty identical badge tiles, each tappable for its own
 * description. That is one choice ("which badge do I want to read about?")
 * offered twenty times, not twenty choices, and it fails harder the better
 * the child is doing: the count is the size of her collection.
 * `landscape-ux-2026-08-27.md` reached the same conclusion by eye.
 *
 * Deleting badges to satisfy an element count would be tuning the game to
 * the rule. Raising the threshold would stop the rule catching anything.
 * So count what a person counts — which needs three things true at once
 * before a run of controls collapses:
 *
 *   **They scroll.** `clipped` means the members live in something masked
 *   or scrolling: a browsable collection whose length is content, not
 *   chrome. This is the condition doing the real work. A nav bar of five
 *   tabs is five destinations and is not clipped, so it still counts as
 *   five; a wall of badges is one wall however many badges are in it.
 *
 *   **They are the same size.** A scrolling list of mixed cards and
 *   buttons is not one tile repeated, and does not collapse.
 *
 *   **They sit on a regular grid** — shared columns and rows at an even
 *   pitch, filled but for at most the last row. Controls that merely
 *   happen to share a size stay counted one by one.
 *
 * Returns every control, grouped; nothing is discarded, so the caller can
 * report the raw number alongside the count. Hiding it would make the
 * check unfalsifiable, which is the failure mode this file exists to
 * avoid.
 */
export function groupRepeatedTiles(
  controls: UxRect[],
  { minTiles = 4, sizeTolerance = 2, pitchTolerance = 2 } = {},
): ControlGroup[] {
  const groups: ControlGroup[] = [];
  const grouped = new Set<UxRect>();

  const buckets: UxRect[][] = [];
  for (const c of controls.filter((c) => c.clipped)) {
    const bucket = buckets.find((b) => sameSize(b[0], c, sizeTolerance));
    if (bucket) bucket.push(c);
    else buckets.push([c]);
  }

  for (const bucket of buckets) {
    if (bucket.length < minTiles) continue;
    const cols = lanes(bucket.map((b) => b.x + b.w / 2), sizeTolerance);
    const rows = lanes(bucket.map((b) => b.y + b.h / 2), sizeTolerance);
    // The lattice the lanes describe has to be the one the tiles fill.
    // Two dozen controls dropped at random share no columns, so their
    // lanes multiply out to hundreds of cells for twenty-odd members, and
    // that is what turns them away.
    if (cols.length * rows.length > bucket.length + cols.length) continue;
    if (!uniformPitch(cols, pitchTolerance) || !uniformPitch(rows, pitchTolerance)) continue;
    groups.push({ members: bucket, gallery: true });
    for (const m of bucket) grouped.add(m);
  }

  for (const c of controls) {
    if (!grouped.has(c)) groups.push({ members: [c], gallery: false });
  }
  return groups;
}
