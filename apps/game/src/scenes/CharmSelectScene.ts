import Phaser from 'phaser';

/**
 * CharmSelectScene — convenience launcher for the dangly-charm picker.
 *
 * Mirrors the TunnelScene pattern: the actual UI is an HTML iframe
 * mounted by GameScene via `openCharmSelectOverlay()`. This scene
 * exists so callers anywhere in the game can do
 * `scene.start('CharmSelectScene')` without having to know about
 * GameScene internals — it bounces back to GameScene and opens the
 * overlay, then stops itself.
 */
export class CharmSelectScene extends Phaser.Scene {
  constructor() {
    super({ key: 'CharmSelectScene' });
  }

  create(): void {
    type WithCharmSelect = Phaser.Scene & { openCharmSelectOverlay?: () => void };
    const game = this.scene.get('GameScene') as WithCharmSelect;
    if (game?.openCharmSelectOverlay) {
      if (!this.scene.isActive('GameScene')) this.scene.start('GameScene');
      game.openCharmSelectOverlay();
    } else {
      this.scene.start('GameScene');
    }
    this.scene.stop('CharmSelectScene');
  }
}
