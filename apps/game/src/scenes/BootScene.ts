import Phaser from 'phaser';
import { AssetLoader } from '../lib/AssetLoader';
import { RoomAnchors } from '../lib/RoomAnchors';
import { CollarAnchors } from '../lib/CollarAnchors';

/**
 * BootScene — ultra-fast boot that gets kids to the menu in <1 second.
 *
 * Fetches the asset manifest, loads only the logo, waits for fonts,
 * then hands off to MainMenuScene. Everything else loads in the background.
 *
 * NOTE: Phaser's preload() is NOT async-aware, so we do the manifest
 * fetch + logo load in create() using manual load.start().
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    // Bouncing circle while we fetch manifest + logo
    const paw = this.add.circle(width / 2, height / 2, 24, 0x5AAE4A);
    this.tweens.add({
      targets: paw,
      y: height / 2 - 15,
      scale: 1.2,
      duration: 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Kick off room-anchors JSON fetch in parallel — non-blocking, used by GameScene
    RoomAnchors.getInstance().load();
    // Collar anchors JSON — hand-placed neck positions for the walking
    // player sprite in WalkScene.
    CollarAnchors.getInstance().load();

    // Fetch manifest, then load logo, then transition
    const loader = AssetLoader.getInstance();
    loader.fetchManifest().then(() => {
      // Queue boot-tier files (logo only — see AssetLoader.parseEntry).
      // Boot MUST stay under Phaser 3.90's maxParallelDownloads (32) or
      // the loader leaves overflow files in state=LOADING but never
      // queues them for XHR, freezing the boot splash forever. Icons
      // were removed from boot tier for this reason; apprentice poses
      // (9 files) stay because logo (5) + poses (9) = 14, well under 32.
      loader.loadBootAssets(this);

      // Apprentice action-pose sprites — small painted chibi decorations
      // shown in the rescue centre when an apprentice has been recruited.
      // They live outside the asset-manifest pipeline (served straight
      // from /admin/scene-assets/) so we register them by URL here.
      const APPRENTICE_POSES: string[] = [
        'rhubarb-feeding', 'rhubarb-cat-lap', 'rhubarb-skateboarding-garden',
        'amara-cat-shoulder', 'amara-treat', 'amara-climbing',
        'kofi-reading-aloud', 'kofi-parrot-arm', 'kofi-snake-nose',
      ];
      for (const pose of APPRENTICE_POSES) {
        const key = `apprentice-${pose}`;
        if (!this.textures.exists(key)) {
          this.load.image(key, `/admin/scene-assets/cast/apprentices/${pose}.png`);
        }
      }

      // Don't fail the whole boot if any file 404s — skip + continue.
      this.load.on('loaderror', (file: Phaser.Loader.File) => {
        if (file?.key) console.debug(`[BootScene] missing: ${file.key}`);
      });

      // Always start the loader — listen for complete event.
      // If nothing was queued, Phaser fires 'complete' immediately.
      this.load.once('complete', () => this.waitForFontsAndGo());
      this.load.start();
    });
  }

  private waitForFontsAndGo(): void {
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => this.scene.start('MainMenuScene'));
    } else {
      this.scene.start('MainMenuScene');
    }
  }
}
