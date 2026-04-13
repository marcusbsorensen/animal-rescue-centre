import Phaser from 'phaser';

/**
 * AssetLoader — staged asset loading with manifest support.
 *
 * Stage 1 (boot): Logo only → MainMenu in <1s
 * Stage 2 (background): Load all game assets while kid browses menus
 * Stage 3 (gate): If Play is clicked before loading finishes, show fun loader
 *
 * Uses the build-time asset manifest to avoid any 404 requests.
 */

type AssetCategory = 'logo' | 'animals' | 'food' | 'bg' | 'ui' | 'icons' | 'audio';

interface ManifestEntry {
  key: string;
  path: string;
  category: AssetCategory;
  type: 'image' | 'audio';
}

export class AssetLoader {
  private static instance: AssetLoader;
  private manifest: string[] = [];
  private parsedEntries: ManifestEntry[] = [];
  private loadedKeys = new Set<string>();
  private backgroundLoadStarted = false;
  private _backgroundLoadComplete = false;
  private _progress = 0;
  private onProgressCallbacks: ((pct: number) => void)[] = [];
  private onCompleteCallbacks: (() => void)[] = [];

  static getInstance(): AssetLoader {
    if (!AssetLoader.instance) {
      AssetLoader.instance = new AssetLoader();
    }
    return AssetLoader.instance;
  }

  get isFullyLoaded(): boolean {
    return this._backgroundLoadComplete;
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

  /** Stage 1: Load logo + icon assets (fast — small PNGs). */
  loadBootAssets(scene: Phaser.Scene): void {
    const bootAssets = this.parsedEntries.filter(
      (e) => e.category === 'logo' || e.category === 'icons'
    );
    for (const entry of bootAssets) {
      if (!scene.textures.exists(entry.key)) {
        scene.load.image(entry.key, entry.path);
      }
    }
  }

  /** Stage 2: Start background loading of ALL remaining assets. */
  startBackgroundLoad(scene: Phaser.Scene): void {
    if (this.backgroundLoadStarted) return;
    this.backgroundLoadStarted = true;

    // Queue everything not yet loaded
    const toLoad = this.parsedEntries.filter(
      (e) => e.category !== 'logo' && e.category !== 'icons' && !this.isLoaded(e.key, e.type, scene)
    );

    if (toLoad.length === 0) {
      this._backgroundLoadComplete = true;
      this._progress = 1;
      this.fireComplete();
      return;
    }

    // Don't fail on missing files (belt + suspenders with manifest)
    scene.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.debug(`[AssetLoader] Skipping: ${file.key}`);
    });

    scene.load.on('progress', (value: number) => {
      this._progress = value;
      for (const cb of this.onProgressCallbacks) cb(value);
    });

    scene.load.on('complete', () => {
      this._backgroundLoadComplete = true;
      this._progress = 1;
      this.fireComplete();
    });

    for (const entry of toLoad) {
      if (entry.type === 'image') {
        scene.load.image(entry.key, entry.path);
      } else if (entry.type === 'audio') {
        scene.load.audio(entry.key, entry.path);
      }
    }

    scene.load.start();
  }

  /** Register a progress callback (for the fun loading screen). */
  onProgress(cb: (pct: number) => void): void {
    this.onProgressCallbacks.push(cb);
  }

  /** Register a completion callback. */
  onComplete(cb: () => void): void {
    if (this._backgroundLoadComplete) {
      cb();
    } else {
      this.onCompleteCallbacks.push(cb);
    }
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
    // Audio/image keys: use filename without extension
    let key = name;
    if (category === 'logo' && key.startsWith('arc-')) {
      key = key.slice(4); // "arc-logo-full" → "logo-full"
    }

    return { key, path: filePath, category, type };
  }
}
