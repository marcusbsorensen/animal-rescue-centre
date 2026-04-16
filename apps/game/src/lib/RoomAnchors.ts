/**
 * RoomAnchors — loads hand-designed placement data from
 * /data/room-anchors.json (produced by the admin anchor editor) and
 * exposes a simple lookup API.
 *
 * JSON shape:
 *   {
 *     [roomKey]: {
 *       // animal anchors: species → state → Anchor[]
 *       [species]: { [state]: Anchor[] },
 *       // decor anchors (room signs, food props, …): propKey → Anchor[]
 *       __decor?: { [propKey]: Anchor[] }
 *     }
 *   }
 *
 * Rooms currently anchored: room-cat, corridor, kitchen, garden.
 * Unanchored rooms fall back to the existing procedural layout in GameScene.
 */

export interface Anchor {
  x: number;          // 0..1 fractional of background width
  y: number;          // 0..1 fractional of background height
  scale: number;      // size multiplier on the default sprite
  facing: 'left' | 'right';
}

// The room map is loose at the type level because it mixes species
// subtrees with the special __decor subtree. Callers use the typed
// accessors below rather than touching the raw shape.
type AnchorMap = Record<string, Record<string, unknown>>;

export class RoomAnchors {
  private static instance: RoomAnchors;
  private data: AnchorMap = {};
  private loaded = false;
  private loadPromise: Promise<void> | null = null;

  static getInstance(): RoomAnchors {
    if (!RoomAnchors.instance) RoomAnchors.instance = new RoomAnchors();
    return RoomAnchors.instance;
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = fetch('/data/room-anchors.json')
      .then((r) => (r.ok ? r.json() : {}))
      .then((j) => { this.data = j as AnchorMap; this.loaded = true; })
      .catch(() => { this.data = {}; this.loaded = true; });
    return this.loadPromise;
  }

  isLoaded(): boolean { return this.loaded; }

  /** Return all anchors for a given room + species + state, or []. */
  get(roomKey: string, species: string, state: string): Anchor[] {
    const room = this.data?.[roomKey];
    if (!room) return [];
    const speciesTree = room[species] as Record<string, Anchor[]> | undefined;
    return speciesTree?.[state] ?? [];
  }

  /**
   * Pick the i-th anchor for (room, species, state), trying progressively
   * softer fallbacks: exact state → 'sheltered' → 'sleeping' → any state
   * that has anchors. Returns null if nothing found — caller should
   * fall back to its procedural layout.
   */
  pick(roomKey: string, species: string, state: string, index: number): Anchor | null {
    const exact = this.get(roomKey, species, state);
    if (exact.length > 0) return exact[index % exact.length];

    for (const fallbackState of ['sheltered', 'sleeping', 'eating', 'arriving']) {
      if (fallbackState === state) continue;
      const fb = this.get(roomKey, species, fallbackState);
      if (fb.length > 0) return fb[index % fb.length];
    }
    return null;
  }

  /**
   * Return the decor anchors for a room as { [propKey]: Anchor[] }.
   * Empty object if the room has no decor. Scenes that want to use
   * placed room signs / food props can iterate this and draw the
   * matching texture at each anchor.
   */
  getDecor(roomKey: string): Record<string, Anchor[]> {
    const room = this.data?.[roomKey];
    if (!room) return {};
    const decor = room.__decor as Record<string, Anchor[]> | undefined;
    return decor ?? {};
  }
}
