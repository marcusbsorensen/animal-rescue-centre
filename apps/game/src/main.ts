import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { LoadingScene } from './scenes/LoadingScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { SignupScene } from './scenes/SignupScene';
import { LoginScene } from './scenes/LoginScene';
import { FriendsScene } from './scenes/FriendsScene';
import { GameScene } from './scenes/GameScene';
import { KitchenMinigameScene } from './scenes/KitchenMinigameScene';
import { SocialScene } from './scenes/SocialScene';
import { WalkScene } from './scenes/WalkScene';
import { VetScene } from './scenes/VetScene';
import { GroomingScene } from './scenes/GroomingScene';
import { DepotScene } from './scenes/DepotScene';
import { SupplyRunScene } from './scenes/SupplyRunScene';
import { AccountScene } from './scenes/AccountScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
    // autoRound keeps sprite positions on whole pixels, which noticeably
    // reduces the "blurry scaled icon" artifact on retina displays.
    autoRound: false,
  },
  backgroundColor: '#fef9ef',
  scene: [BootScene, LoadingScene, MainMenuScene, SignupScene, LoginScene, FriendsScene, GameScene, KitchenMinigameScene, SocialScene, WalkScene, VetScene, GroomingScene, DepotScene, SupplyRunScene, AccountScene],
  // Render config: antialias is ON by default but we set it explicitly so
  // downsampled icons (256-px source → 36-px display) stay smooth instead
  // of aliased. mipmapFilter enables trilinear-ish downscaling in WebGL
  // which is the big win for nav/HUD icons that sit at a small display
  // size relative to their 256-px source art.
  render: {
    antialias: true,
    antialiasGL: true,
    pixelArt: false,
    roundPixels: false,
    mipmapFilter: 'LINEAR_MIPMAP_LINEAR',
    powerPreference: 'high-performance',
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
};

const game = new Phaser.Game(config);

// Expose for dev tools / visual inspection
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__PHASER_GAME__ = game;
}
