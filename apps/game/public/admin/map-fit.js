/* map-fit.js: where an SVG's viewBox lands inside the box it is drawn in.
 *
 * This is the arithmetic of the `preserveAspectRatio` attribute (SVG 1.1 s7.8)
 * and nothing else. map.html and intro.html lay HTML over a drawing the SVG
 * places for itself: the pins, the A.R.C. stamp. They each used to assume how
 * it placed itself (`meet`, the whole map letterboxed) while the file said
 * `slice` (the map cropped to fill), and the two agreed only on a stage the
 * shape of the map. Now the page reads the viewBox and preserveAspectRatio off
 * the root of the SVG it has loaded and asks this file where that puts the map,
 * so the answer is the SVG's own and changes when the SVG does.
 *
 * Plain script, no imports: the pages load it with <script src>, and
 * map-fit.test.ts runs the same bytes in a vm. It sets `self.MapFit`.
 */
(function (root) {
  'use strict';

  // xMin / xMid / xMax and yMin / yMid / yMax: how much of the spare room sits
  // before the map rather than after it.
  const ALIGN = { Min: 0, Mid: 0.5, Max: 1 };

  /** "0 0 1800 1121" (or comma separated) -> {x, y, w, h}; null if it is not a viewBox. */
  function parseViewBox(text) {
    if (typeof text !== 'string') return null;
    const n = text.trim().split(/[\s,]+/).map(Number);
    if (n.length !== 4 || n.some((v) => !Number.isFinite(v)) || n[2] <= 0 || n[3] <= 0) return null;
    return { x: n[0], y: n[1], w: n[2], h: n[3] };
  }

  /**
   * "xMidYMid slice" -> {alignX, alignY, slice}. `alignX` and `alignY` are 0, .5 or 1;
   * both are null for "none", which stretches. A missing or unreadable value is the
   * SVG default, "xMidYMid meet".
   */
  function parsePreserveAspectRatio(text) {
    const fallback = { alignX: 0.5, alignY: 0.5, slice: false };
    if (typeof text !== 'string') return fallback;
    const words = text.trim().split(/\s+/).filter((w) => w !== 'defer');
    if (!words.length) return fallback;
    if (words[1] !== undefined && words[1] !== 'slice' && words[1] !== 'meet') return fallback;
    const slice = words[1] === 'slice';
    if (words[0] === 'none') return { alignX: null, alignY: null, slice: false };
    const m = words[0].match(/^x(Min|Mid|Max)Y(Min|Mid|Max)$/);
    if (!m) return fallback;
    return { alignX: ALIGN[m[1]], alignY: ALIGN[m[2]], slice };
  }

  /**
   * The rectangle the viewBox occupies inside a box of `box.w` x `box.h`, in the
   * box's own pixels, measured from the box's top-left.
   *
   *   meet   the whole viewBox fits inside the box; spare room is left over.
   *   slice  the viewBox covers the box; what does not fit is cropped, so
   *          the rectangle is larger than the box.
   *   none   stretched to the box on both axes.
   *
   * Returns {x, y, w, h, sx, sy}: the viewBox's left-top corner, its drawn size,
   * and pixels per user unit on each axis (equal unless "none").
   */
  function place(box, view, par) {
    if (par.alignX === null) {
      return { x: 0, y: 0, w: box.w, h: box.h, sx: box.w / view.w, sy: box.h / view.h };
    }
    const fit = box.w / view.w, fill = box.h / view.h;
    const s = par.slice ? Math.max(fit, fill) : Math.min(fit, fill);
    const w = view.w * s, h = view.h * s;
    return { x: (box.w - w) * par.alignX, y: (box.h - h) * par.alignY, w, h, sx: s, sy: s };
  }

  /** A user-space point of the SVG -> a point in the box, given `place`'s answer. */
  function toBox(placed, view, ux, uy) {
    return {
      x: placed.x + (ux - view.x) * placed.sx,
      y: placed.y + (uy - view.y) * placed.sy,
    };
  }

  /**
   * What an SVG root says about how it is drawn: {view, par}, or null when the
   * element is not an <svg> with a usable viewBox. `svgRoot` is anything with
   * getAttribute, which is what the page has (the loaded document's root).
   */
  function readRoot(svgRoot) {
    if (!svgRoot || typeof svgRoot.getAttribute !== 'function') return null;
    if (svgRoot.localName && svgRoot.localName !== 'svg') return null;
    const view = parseViewBox(svgRoot.getAttribute('viewBox'));
    if (!view) return null;
    return { view, par: parsePreserveAspectRatio(svgRoot.getAttribute('preserveAspectRatio')) };
  }

  root.MapFit = { parseViewBox, parsePreserveAspectRatio, place, toBox, readRoot };
})(typeof self !== 'undefined' ? self : this);
