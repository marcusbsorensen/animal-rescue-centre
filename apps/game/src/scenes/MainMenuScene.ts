import Phaser from 'phaser';

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainMenuScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    // Title
    this.add
      .text(width / 2, height / 3, '🐾 A.R.C. 🐾', {
        fontSize: '64px',
        fontFamily: 'Georgia, serif',
        color: '#4a9c5d',
      })
      .setOrigin(0.5);

    // Subtitle
    this.add
      .text(width / 2, height / 3 + 80, 'Animal Rescue Centre', {
        fontSize: '28px',
        fontFamily: 'Georgia, serif',
        color: '#7c6b5a',
      })
      .setOrigin(0.5);

    // Play button
    const playBtn = this.add
      .text(width / 2, height / 2 + 60, '▶  Play', {
        fontSize: '36px',
        fontFamily: 'Georgia, serif',
        color: '#ffffff',
        backgroundColor: '#4a9c5d',
        padding: { x: 32, y: 16 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    playBtn.on('pointerover', () => playBtn.setStyle({ backgroundColor: '#3d8a4e' }));
    playBtn.on('pointerout', () => playBtn.setStyle({ backgroundColor: '#4a9c5d' }));
    playBtn.on('pointerdown', () => {
      // Future: transition to signup/login or game scene
      console.log('Play clicked — game scenes coming in Phase 2');
    });
  }
}
