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
 * label is a *sibling* of its hit rectangle — `createButton` adds both to
 * the same container — so the tree cannot tell a label from a control
 * dropped on top of unrelated words. Trying it turned this check into 140
 * findings of buttons wearing their own labels.
 *
 * What scores is text a control *cuts*: the rail's arrival card used to
 * run two lines of story to y+68 under a Welcome button whose top edge
 * was at y+60, so the second line — the only reason a child reads the
 * card — was printed underneath it. And a label wider than the cell that
 * holds it, which is what `createButton`'s 28px-a-side padding produces
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
