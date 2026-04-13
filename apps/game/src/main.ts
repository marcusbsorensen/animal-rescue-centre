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
import { DepotScene } from './scenes/DepotScene';
import { SupplyRunScene } from './scenes/SupplyRunScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
  },
  backgroundColor: '#fef9ef',
  scene: [BootScene, LoadingScene, MainMenuScene, SignupScene, LoginScene, FriendsScene, GameScene, KitchenMinigameScene, SocialScene, WalkScene, VetScene, DepotScene, SupplyRunScene],
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
