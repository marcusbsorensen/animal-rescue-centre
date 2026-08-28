import Phaser from 'phaser';

/**
 * CharmSelectScene — convenience launcher for the dangly-charm picker.
 *
 * The actual UI is an HTML iframe mounted by GameScene via
 * `openCharmSelectOverlay()`. This scene exists so callers anywhere in the
 * game can do `scene.start('CharmSelectScene')` without having to know
 * about GameScene internals — it bounces to GameScene, opens the overlay,
 * then stops itself.
 *
 * Deliberately kept even though nothing calls it yet. It is the intended
 * public entry point for the charm picker, and the indirection is the
 * point: callers should not have to reach into GameScene. TunnelScene was
 * the same pattern and was removed because the tunnel already had a route
 * in from the map overlay, making it a genuinely redundant second door.
 * This one has no other door.
 *
 * Note for anyone reading a scene-walk report: "did not activate" is this
 * scene succeeding. It stops itself in the same frame it starts, by design
 * — see e2e/scene-walk.spec.ts, which special-cases the pattern.
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
