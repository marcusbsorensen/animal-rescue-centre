import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Future: load essential assets here
  }

  create(): void {
    this.scene.start('MainMenuScene');
  }
}
