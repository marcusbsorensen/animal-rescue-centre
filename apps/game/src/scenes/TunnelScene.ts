import Phaser from 'phaser';

/**
 * TunnelScene — convenience launcher for the garden-tunnel mini-game.
 *
 * The actual mounting happens inside GameScene via `openTunnelOverlay()`
 * (mirroring the rewilding/adoption pattern: HTML iframe overlays are
 * children of GameScene's lifecycle, not standalone Phaser scenes).
 *
 * This scene exists so any caller that wants to "open the tunnel
 * minigame" can do `this.scene.run('TunnelScene')` from anywhere
 * without having to know about GameScene internals. We bounce back
 * to GameScene immediately and tell it to mount the overlay.
 */
export class TunnelScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TunnelScene' });
  }

  create(): void {
    // Find the running GameScene and ask it to open the overlay.
    type WithTunnel = Phaser.Scene & { openTunnelOverlay?: () => void };
    const game = this.scene.get('GameScene') as WithTunnel;
    if (game?.openTunnelOverlay) {
      // Make sure GameScene is the active visible scene.
      if (!this.scene.isActive('GameScene')) this.scene.start('GameScene');
      game.openTunnelOverlay();
    } else {
      // Fallback — switch to GameScene; user can re-open from the map.
      this.scene.start('GameScene');
    }
    // We're done — let GameScene own the lifecycle from here.
    this.scene.stop('TunnelScene');
  }
}
