/**
 * RoomAnchors — loads hand-designed animal placement anchors from
 * /data/room-anchors.json (produced by the admin anchor editor) and
 * exposes a simple lookup API.
 *
 * JSON shape:
 *   { [roomKey]: { [species]: { [state]: Anchor[] } } }
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

type AnchorMap = Record<string, Record<string, Record<string, Anchor[]>>>;

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
    return this.data?.[roomKey]?.[species]?.[state] ?? [];
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
}
