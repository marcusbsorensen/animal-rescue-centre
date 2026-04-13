import Phaser from 'phaser';
import { AssetLoader } from '../lib/AssetLoader';

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

    // Cute bouncing paw while we fetch manifest + logo
    const paw = this.add.text(width / 2, height / 2, '🐾', {
      fontSize: '48px',
    }).setOrigin(0.5);
    this.tweens.add({
      targets: paw,
      y: height / 2 - 15,
      scale: 1.2,
      duration: 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Fetch manifest, then load logo, then transition
    const loader = AssetLoader.getInstance();
    loader.fetchManifest().then(() => {
      // Queue logo files
      loader.loadBootAssets(this);

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
