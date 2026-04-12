import Phaser from 'phaser';
import { SPECIES_VARIANTS } from '@arc/game-logic';
import type { Species } from '@arc/shared-types';
import { COLOURS, FONTS } from '../ui/constants';

/**
 * BootScene — preloads all game assets with a loading bar.
 * Silently skips missing files so variant art is opt-in.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    const { width, height } = this.scale;

    // Loading bar
    const barBg = this.add.rectangle(width / 2, height / 2 + 40, 300, 20, 0xdddddd);
    const barFill = this.add.rectangle(width / 2 - 150, height / 2 + 40, 0, 20, 0x4a9c5d)
      .setOrigin(0, 0.5);

    const loadText = this.add.text(width / 2, height / 2 - 20, 'Loading A.R.C...', {
      fontSize: '20px', fontFamily: 'Georgia, serif', color: '#3a2e22',
    }).setOrigin(0.5);

    this.load.on('progress', (value: number) => {
      barFill.width = 300 * value;
    });

    // Don't fail on missing files — variant art is gradually added
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      // Silently skip missing assets
      console.debug(`[BootScene] Optional asset not found: ${file.key}`);
    });

    // ── Logo ──────────────────────────────────────────────────
    this.load.image('logo-full', 'assets/logo/arc-logo-full.png');
    this.load.image('logo-icon', 'assets/logo/arc-logo-icon.png');
    this.load.image('logo-landscape', 'assets/logo/arc-logo-landscape.png');

    // ── Animal Sprites ────────────────────────────────────────
    const states = ['arriving', 'sheltered', 'eating', 'sleeping'];

    // Load generic species sprites (all 7 species × 4 states)
    const allSpecies: Species[] = ['cat', 'dog', 'fox', 'bunny', 'bat', 'parrot', 'snake'];
    for (const sp of allSpecies) {
      for (const st of states) {
        const key = `${sp}-${st}`;
        this.load.image(key, `assets/animals/${key}.png`);
      }
    }

    // Load ALL variant sprites for every species
    for (const [species, variants] of Object.entries(SPECIES_VARIANTS)) {
      for (const variant of variants) {
        for (const st of states) {
          const key = `${species}-${variant}-${st}`;
          this.load.image(key, `assets/animals/${key}.png`);
        }
      }
    }

    // ── Food Icons ────────────────────────────────────────────
    const foods = [
      'tuna', 'fish', 'bone', 'kibble', 'chicken', 'carrot',
      'berries', 'egg', 'fruit', 'hay', 'insects', 'lettuce', 'mouse', 'nuts', 'seeds',
    ];
    for (const f of foods) {
      this.load.image(`food-${f}`, `assets/food/food-${f}.png`);
    }

    // ── Backgrounds ───────────────────────────────────────────
    this.load.image('bg-corridor', 'assets/bg/bg-corridor.png');
    this.load.image('bg-kitchen', 'assets/bg/bg-kitchen.png');
    this.load.image('bg-garden', 'assets/bg/bg-garden.png');
    this.load.image('bg-room-cat', 'assets/bg/bg-room-cat.png');
    this.load.image('bg-room-dog', 'assets/bg/bg-room-dog.png');
    this.load.image('bg-room-generic', 'assets/bg/bg-room-generic.png');

    // ── UI Elements ───────────────────────────────────────────
    this.load.image('ui-feed-button', 'assets/ui/ui-feed-button.png');
    this.load.image('ui-play-button', 'assets/ui/ui-play-button.png');
    this.load.image('ui-accept-button', 'assets/ui/ui-accept-button.png');
    this.load.image('ui-back-arrow', 'assets/ui/ui-back-arrow.png');
    this.load.image('ui-bowl-icon', 'assets/ui/ui-bowl-icon.png');
    this.load.image('ui-hunger-icon', 'assets/ui/ui-hunger-icon.png');
    this.load.image('ui-sleep-icon', 'assets/ui/ui-sleep-icon.png');
    this.load.image('ui-happy-icon', 'assets/ui/ui-happy-icon.png');
    this.load.image('ui-health-icon', 'assets/ui/ui-health-icon.png');
    this.load.image('ui-star', 'assets/ui/ui-star.png');
    this.load.image('ui-crown', 'assets/ui/ui-crown.png');
    this.load.image('ui-badge-frame', 'assets/ui/ui-badge-frame.png');
    this.load.image('ui-bond-icon', 'assets/ui/ui-bond-icon.png');

    // Collar colour icons
    const collarColours = ['red', 'blue', 'green', 'purple', 'orange', 'pink', 'gold', 'teal'];
    for (const c of collarColours) {
      this.load.image(`ui-collar-${c}`, `assets/ui/ui-collar-${c}.png`);
    }

    // ── Audio ─────────────────────────────────────────────────
    // Music tracks (loopable MP3s)
    const musicTracks = ['menu', 'corridor', 'room', 'kitchen', 'walk', 'vet', 'garden', 'social', 'conflict'];
    for (const t of musicTracks) {
      this.load.audio(`music-${t}`, `assets/audio/music-${t}.mp3`);
    }

    // Sound effects
    const sfxFiles = [
      'feed', 'play', 'pet', 'sleep', 'arrive', 'bond-up', 'bond-complete',
      'collar', 'badge', 'level-up', 'correct', 'wrong', 'heal',
      'conflict', 'resolved', 'gift', 'button', 'walk-road',
    ];
    for (const s of sfxFiles) {
      this.load.audio(`sfx-${s}`, `assets/audio/sfx-${s}.mp3`);
    }
  }

  create(): void {
    this.scene.start('MainMenuScene');
  }
}
