/**
 * CollarAnchors — loads hand-placed collar positions from
 * /data/collar-anchors.json (produced by the admin collar anchor editor)
 * and exposes a lookup API used by WalkScene when drawing the walking
 * player's collar overlay.
 *
 * JSON shape — a flat map keyed by either `species` or `species-variant`:
 *
 *   {
 *     "cat":          { dx, dy, widthFrac, heightFrac },
 *     "cat-ginger":   { dx, dy, widthFrac, heightFrac },  // optional override
 *     "dog":          { dx, dy, widthFrac, heightFrac },
 *     ...
 *   }
 *
 * - `dx`, `dy`        — offset from the sprite centre as a fraction of the
 *                       sprite display width / height. Positive x = toward
 *                       the front of the animal, positive y = downward.
 * - `widthFrac`       — collar ellipse width as a fraction of sprite width.
 * - `heightFrac`      — (optional) collar ellipse height as a fraction of
 *                       sprite height. Defaults to 0.09.
 *
 * Lookup order: `species-variant` → `species` → built-in default.
 */

export interface CollarAnchor {
  dx: number;
  dy: number;
  widthFrac: number;
  heightFrac?: number;
  // Optional tilt of the collar in degrees, rotated around the collar
  // centre. Positive = clockwise. Lets animals whose heads dip forward
  // (sniffing dogs, crouching cats) wear a collar that follows the
  // slope of the neck rather than sitting perfectly horizontal.
  rotation?: number;
  // Optional neck mask — if all four are present, the portion of the collar
  // inside this ellipse is hidden (represents the occluding neck mass).
  maskDx?: number;
  maskDy?: number;
  maskWidthFrac?: number;
  maskHeightFrac?: number;
}

const DEFAULT_ANCHOR: CollarAnchor = {
  dx: 0.15,
  dy: -0.10,
  widthFrac: 0.40,
  heightFrac: 0.09,
};

export class CollarAnchors {
  private static instance: CollarAnchors;
  private data: Record<string, CollarAnchor> = {};
  private loaded = false;
  private loadPromise: Promise<void> | null = null;

  static getInstance(): CollarAnchors {
    if (!CollarAnchors.instance) CollarAnchors.instance = new CollarAnchors();
    return CollarAnchors.instance;
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = fetch('/data/collar-anchors.json')
      .then((r) => (r.ok ? r.json() : {}))
      .then((j) => { this.data = j as Record<string, CollarAnchor>; this.loaded = true; })
      .catch(() => { this.data = {}; this.loaded = true; });
    return this.loadPromise;
  }

  isLoaded(): boolean { return this.loaded; }

  /**
   * Return the anchor for a given species + optional variant. Falls back
   * through: species-variant entry → species entry → built-in default.
   */
  get(species: string, variant?: string | null): CollarAnchor {
    if (variant) {
      const specific = this.data[`${species}-${variant}`];
      if (specific) return { heightFrac: 0.09, ...specific };
    }
    const speciesEntry = this.data[species];
    if (speciesEntry) return { heightFrac: 0.09, ...speciesEntry };
    return DEFAULT_ANCHOR;
  }
}
