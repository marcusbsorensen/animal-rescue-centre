import Phaser from 'phaser';

/**
 * AssetLoader — tiered asset loading from the build-time manifest.
 *
 * Three tiers keep the "time-to-play" fast even on older iPads while
 * still surfacing per-variant sprite art as it lands:
 *
 *   1. **Boot**       — logo + HUD / nav icons. Loaded by BootScene
 *                      before MainMenu shows. ~60 files, <1 s target.
 *   2. **Essential**  — everything needed for the game to render
 *                      correctly with species-level fallback art:
 *                      backgrounds, UI, audio, signs, food, tiles,
 *                      and the per-species "fallback" animal sprites
 *                      ({species}-{state}.png). Loading-screen gates
 *                      on this tier. ~180 files.
 *   3. **Variant**    — per-variant animal sprites
 *                      ({species}-{variant}-{state}.png). ~380 files.
 *                      Loads silently in the background once the game
 *                      is running; createAnimalSprite falls back to
 *                      the species-level art until a variant lands,
 *                      so the player sees improving visuals over time
 *                      rather than being gated on all of them.
 *
 * Falls back gracefully when the manifest isn't reachable (dev HMR
 * blip, offline mode) — we log and ship what we have.
 */

type AssetCategory = 'logo' | 'animals' | 'food' | 'bg' | 'ui' | 'icons' | 'audio';
type AssetTier = 'boot' | 'essential' | 'variant';

interface ManifestEntry {
  key: string;
  path: string;
  category: AssetCategory;
  type: 'image' | 'audio';
  tier: AssetTier;
}

// Used to classify animal filenames: a 2-token name like `cat-sheltered`
// is a species-level fallback; a 3-token name like `cat-ginger-sleeping`
// is a per-variant sprite.
const ANIMAL_STATES = new Set([
  'arriving', 'sheltered', 'eating', 'sleeping', 'walking',
  'growling', 'grumpy', 'scared', 'sick', 'playing',
]);

export class AssetLoader {
  private static instance: AssetLoader;
  private manifest: string[] = [];
  private parsedEntries: ManifestEntry[] = [];

  // Essential-tier progress (the one surfaced on the loading screen)
  private _essentialComplete = false;
  private _progress = 0;

  // Variant-tier bookkeeping (silent, no UI)
  private variantLoadStarted = false;
  private _variantComplete = false;

  private onProgressCallbacks: ((pct: number) => void)[] = [];
  private onCompleteCallbacks: (() => void)[] = [];

  static getInstance(): AssetLoader {
    if (!AssetLoader.instance) {
      AssetLoader.instance = new AssetLoader();
    }
    return AssetLoader.instance;
  }

  /** True once the essential tier is in cache — game is safe to show. */
  get isFullyLoaded(): boolean {
    return this._essentialComplete;
  }

  /** True once both essential and variant tiers are fully cached. */
  get isVariantComplete(): boolean {
    return this._variantComplete;
  }

  get progress(): number {
    return this._progress;
  }

  /** Fetch the asset manifest (list of real files on disk). */
  async fetchManifest(): Promise<void> {
    try {
      const resp = await fetch('/asset-manifest.json');
      this.manifest = await resp.json();
      this.parsedEntries = this.manifest.map((filePath) => this.parseEntry(filePath));
    } catch {
      console.warn('[AssetLoader] Could not load asset manifest — falling back to empty');
      this.manifest = [];
      this.parsedEntries = [];
    }
  }

  /** Tier 1: Load logo + icon assets (fast — small PNGs). */
  loadBootAssets(scene: Phaser.Scene): void {
    const bootAssets = this.parsedEntries.filter((e) => e.tier === 'boot');
    for (const entry of bootAssets) {
      if (!scene.textures.exists(entry.key)) {
        scene.load.image(entry.key, entry.path);
      }
    }
  }

  /**
   * Tier 2: Start (or resume) loading the essential tier.
   *
   * Idempotent — safe to call from multiple scenes. Phaser kills the
   * previous scene's loader on `scene.start`, so when LoadingScene takes
   * over from MainMenuScene mid-load, the re-queue through the new
   * scene's loader keeps the progress flowing.
   *
   * Progress is weighted by already-loaded files so the bar doesn't
   * snap back to 0 on scene handoff.
   *
   * (Kept under the historical name `startBackgroundLoad` so existing
   * MainMenuScene / LoadingScene callsites don't need editing.)
   */
  startBackgroundLoad(scene: Phaser.Scene): void {
    const toLoad = this.parsedEntries.filter(
      (e) => e.tier === 'essential' && !this.isLoaded(e.key, e.type, scene),
    );
    const totalEssential = this.parsedEntries.filter((e) => e.tier === 'essential').length;

    if (toLoad.length === 0) {
      this._essentialComplete = true;
      this._progress = 1;
      this.fireComplete();
      return;
    }

    // Don't fail on missing files (belt + suspenders with manifest)
    scene.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.debug(`[AssetLoader] Skipping: ${file.key}`);
    });

    const alreadyLoaded = totalEssential - toLoad.length;
    scene.load.on('progress', (value: number) => {
      const overallPct = totalEssential > 0
        ? (alreadyLoaded + value * toLoad.length) / totalEssential
        : value;
      this._progress = overallPct;
      for (const cb of this.onProgressCallbacks) cb(overallPct);
    });

    scene.load.on('complete', () => {
      this._essentialComplete = true;
      this._progress = 1;
      this.fireComplete();
    });

    for (const entry of toLoad) {
      if (entry.type === 'image') scene.load.image(entry.key, entry.path);
      else if (entry.type === 'audio') scene.load.audio(entry.key, entry.path);
    }

    scene.load.start();
  }

  /**
   * Tier 3: Silently load per-variant sprites in the background once
   * the game is running.
   *
   * No UI, no player-facing events — the player sees gradually
   * improving sprites as variant textures land. Missing variants fall
   * back to the species-level sprite (via sprites.ts getAnimalTextureKey),
   * so this is purely progressive enhancement.
   *
   * Batched to stay under Phaser 3.x's maxParallelDownloads (32). The
   * variant tier has ~440 files; queueing them all at once leaves the
   * overflow in state=LOADING but never queued for XHR — so most
   * variant sprites would never land and CorridorView would forever
   * fall back to the generic species art (e.g. two dogs both rendering
   * as `dog-arriving` regardless of breed). Same class of bug that
   * froze BootScene before the icons split — see parseEntry comment.
   *
   * Idempotent. First call after essentials complete kicks it off; any
   * later call is a no-op.
   */
  startVariantLoad(scene: Phaser.Scene): void {
    if (this.variantLoadStarted) return;
    this.variantLoadStarted = true;

    const toLoad = this.parsedEntries.filter(
      (e) => e.tier === 'variant' && !this.isLoaded(e.key, e.type, scene),
    );

    if (toLoad.length === 0) {
      this._variantComplete = true;
      return;
    }

    scene.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.debug(`[AssetLoader] Variant skip: ${file.key}`);
    });

    // Batch size kept well under Phaser's 32-file parallel cap, leaving
    // headroom for any concurrent essential-tier stragglers also using
    // the same loader.
    const BATCH_SIZE = 24;
    let cursor = 0;

    const loadNextBatch = () => {
      if (cursor >= toLoad.length) {
        this._variantComplete = true;
        return;
      }
      const batch = toLoad.slice(cursor, cursor + BATCH_SIZE);
      cursor += BATCH_SIZE;

      // One-shot listener for this batch's completion — re-arms on the
      // next batch so we don't pile up handlers.
      scene.load.once('complete', () => {
        loadNextBatch();
      });

      for (const entry of batch) {
        // All variants are images — no per-variant audio — but keep the
        // branch for future-proofing.
        if (entry.type === 'image') scene.load.image(entry.key, entry.path);
        else if (entry.type === 'audio') scene.load.audio(entry.key, entry.path);
      }

      scene.load.start();
    };

    loadNextBatch();
  }

  /** Register a progress callback (for the fun loading screen). */
  onProgress(cb: (pct: number) => void): void {
    this.onProgressCallbacks.push(cb);
  }

  /** Register a completion callback (fires when essentials are ready). */
  onComplete(cb: () => void): void {
    if (this._essentialComplete) cb();
    else this.onCompleteCallbacks.push(cb);
  }

  /** Clear callbacks (when leaving a scene). */
  clearCallbacks(): void {
    this.onProgressCallbacks = [];
    this.onCompleteCallbacks = [];
  }

  // ── Internal helpers ────────────────────────────────────

  private isLoaded(key: string, type: 'image' | 'audio', scene: Phaser.Scene): boolean {
    if (type === 'image') return scene.textures.exists(key);
    if (type === 'audio') return scene.cache.audio.exists(key);
    return false;
  }

  private fireComplete(): void {
    for (const cb of this.onCompleteCallbacks) cb();
    this.onCompleteCallbacks = [];
  }

  private parseEntry(filePath: string): ManifestEntry {
    // filePath looks like "assets/animals/cat-tabby-arriving.png"
    const parts = filePath.split('/');
    const dir = parts[1]; // "animals", "audio", "logo", etc.
    const filename = parts[parts.length - 1];
    const name = filename.replace(/\.[^.]+$/, ''); // strip extension

    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    const type: 'image' | 'audio' = ['mp3', 'ogg', 'wav', 'webm'].includes(ext) ? 'audio' : 'image';

    let category: AssetCategory = 'ui';
    if (dir === 'logo') category = 'logo';
    else if (dir === 'animals') category = 'animals';
    else if (dir === 'food') category = 'food';
    else if (dir === 'bg') category = 'bg';
    else if (dir === 'icons') category = 'icons';
    else if (dir === 'ui' || dir === 'l1') category = 'ui';
    else if (dir === 'audio') category = 'audio';

    // Logo keys: strip "arc-" prefix → "logo-full", "logo-icon" etc.
    // (matches the texture keys used in scenes)
    let key = name;
    if (category === 'logo' && key.startsWith('arc-')) {
      key = key.slice(4); // "arc-logo-full" → "logo-full"
    }

    // Tier assignment
    //   - logo → boot (BootScene loads these eagerly; ~5 files)
    //   - icons → essential (was boot, but the icons folder grew to 64
    //     files which when combined with apprentice poses pushed the
    //     boot queue over Phaser 3.90's maxParallelDownloads (32). Files
    //     beyond the 32-cap got marked LOADING but never queued for XHR
    //     and BootScene hung forever on the bouncing-paw splash.)
    //   - animals: split fallback vs variant by filename-token count
    //   - everything else → essential
    let tier: AssetTier = 'essential';
    if (category === 'logo') {
      tier = 'boot';
    } else if (category === 'animals') {
      // {species}-{state}.png → 2 tokens → fallback (essential)
      // {species}-{variant}-{state}.png → 3 tokens → variant
      const tokens = name.split('-');
      if (tokens.length === 2 && ANIMAL_STATES.has(tokens[1])) {
        tier = 'essential';  // species fallback
      } else {
        tier = 'variant';    // per-variant sprite
      }
    }

    return { key, path: filePath, category, type, tier };
  }
}
