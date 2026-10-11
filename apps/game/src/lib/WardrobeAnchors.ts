/**
 * WardrobeAnchors — where each animal wears its garment.
 *
 * Loads `/data/wardrobe-anchors.json` (written by
 * `tools/measure-wardrobe-anchors.py`) and answers for the texture the game
 * is about to draw. The file is a flat map keyed by texture:
 *
 *   {
 *     "dog-husky-sheltered": { dx, dy, widthFrac, heightFrac, rotation, ... },
 *     "dog-sheltered":       { ... },     // the species-level fallback sprite
 *     ...
 *   }
 *
 * and the lookup itself — most specific entry wins, then the built-in
 * default — lives in `getWardrobeAnchor` (`@arc/game-logic`), where it is
 * tested without a browser. This class only holds the data and keeps the
 * same load-once shape as `CollarAnchors` and `RoomAnchors`.
 *
 * A failed or missing fetch is not an error: the table stays empty and
 * `getWardrobeAnchor` answers from its defaults, which put the garment
 * somewhere plausible on the animal rather than nowhere.
 */

import { getWardrobeAnchor, type WardrobeAnchor } from '@arc/game-logic';
import type { Species } from '@arc/shared-types';

export class WardrobeAnchors {
  private static instance: WardrobeAnchors;
  private data: Record<string, WardrobeAnchor> = {};
  private loaded = false;
  private loadPromise: Promise<void> | null = null;

  static getInstance(): WardrobeAnchors {
    if (!WardrobeAnchors.instance) WardrobeAnchors.instance = new WardrobeAnchors();
    return WardrobeAnchors.instance;
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = fetch('/data/wardrobe-anchors.json')
      .then((r) => (r.ok ? r.json() : {}))
      .then((j) => { this.data = j as Record<string, WardrobeAnchor>; this.loaded = true; })
      .catch(() => { this.data = {}; this.loaded = true; });
    return this.loadPromise;
  }

  isLoaded(): boolean { return this.loaded; }

  /** Replace the table. For tests and the dev review page. */
  setData(data: Record<string, WardrobeAnchor>): void {
    this.data = data;
    this.loaded = true;
  }

  /**
   * The anchor for the texture `textureKey` — `cat-ginger-sheltered` or
   * `cat-sheltered` — as worn by `species`.
   */
  get(species: Species, textureKey: string): WardrobeAnchor {
    const { variant, pose } = splitTextureKey(species, textureKey);
    return getWardrobeAnchor(species, variant, this.data, pose);
  }
}

/** The ten poses a sprite can be drawn in. */
const POSES = new Set([
  'arriving', 'sheltered', 'eating', 'sleeping', 'walking',
  'growling', 'grumpy', 'scared', 'sick', 'playing',
]);

/**
 * Take a texture key apart: `dog-husky-sheltered` is the variant `husky` in
 * the pose `sheltered`, `dog-sheltered` is the species-level sprite in that
 * pose and has no variant. A key that does not end in a pose has neither.
 */
export function splitTextureKey(
  species: Species,
  textureKey: string,
): { variant?: string; pose?: string } {
  if (!textureKey.startsWith(`${species}-`)) return {};
  const rest = textureKey.slice(species.length + 1);
  const dash = rest.lastIndexOf('-');
  const pose = dash === -1 ? rest : rest.slice(dash + 1);
  if (!POSES.has(pose)) return {};
  return dash === -1 ? { pose } : { variant: rest.slice(0, dash), pose };
}
