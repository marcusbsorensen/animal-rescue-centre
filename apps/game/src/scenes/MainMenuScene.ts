import Phaser from 'phaser';
import { getSession, logout } from '../lib/auth';
import { AudioManager } from '../audio/AudioManager';
import { AssetLoader } from '../lib/AssetLoader';
import { GameStateStore } from '../game-state/GameStateStore';
import { loadGameState } from '../game-state/loadSaveState';
import { mountAuth, unmountAuth, type MenuStats } from '../auth-overlay/AuthOverlay';

/**
 * MainMenuScene — lightweight router between the three HTML auth overlays.
 *
 * Not logged in → welcome overlay (PLAY → startGame via session check,
 *                 login/signup → their respective scenes).
 * Logged in     → menu overlay (CONTINUE → startGame, Friends, Log out).
 *
 * The actual painted UI lives in the iframe mockups — this scene just
 * mounts one and forwards its postMessage actions.
 */
export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainMenuScene' });
  }

  create(): void {
    const session = getSession();

    // Start menu music
    const audio = AudioManager.getInstance();
    audio.setScene(this);
    audio.playSceneMusic('menu');

    // Not logged in → welcome overlay.
    if (!session) {
      const unmount = mountAuth('welcome', {
        onAction: (action) => {
          if (action === 'play')   { unmount(); this.startGame(); return; }
          if (action === 'login')  { unmount(); this.scene.start('LoginScene'); return; }
          if (action === 'signup') { unmount(); this.scene.start('SignupScene'); return; }
        },
      });
      this.events.once('shutdown', unmountAuth);
      this.events.once('destroy', unmountAuth);
      return;
    }

    // Logged in → painted main-menu overlay with stats loaded from the store.
    const store = new GameStateStore();
    loadGameState(this, store).then(() => {
      const stats = computeMenuStats(store);
      const menuUnmount = mountAuth('menu', {
        onAction: (action) => {
          if (action === 'play')    { menuUnmount(); this.startGame(); return; }
          if (action === 'friends') { menuUnmount(); this.scene.start('FriendsScene'); return; }
          if (action === 'logout')  {
            menuUnmount();
            logout();
            this.scene.start('MainMenuScene');
            return;
          }
        },
      }, { session, stats });
      this.events.once('shutdown', unmountAuth);
      this.events.once('destroy', unmountAuth);
      // Hand the freshly-loaded store to GameScene via the registry so
      // CONTINUE doesn't pay the load cost twice.
      this.registry.set('gameStore', store);
    });

    // Kick off asset prefetch in parallel so CONTINUE is instant.
    AssetLoader.getInstance().startBackgroundLoad(this);
  }

  /**
   * Route to game — fade out, then go to GameScene or LoadingScene.
   */
  private startGame(): void {
    const loader = AssetLoader.getInstance();
    this.tweens.add({
      targets: this.cameras.main,
      alpha: 0,
      duration: 300,
      ease: 'Sine.easeIn',
      onComplete: () => {
        if (loader.isFullyLoaded) {
          this.scene.start('GameScene');
        } else {
          this.scene.start('LoadingScene');
        }
      },
    });
  }

}

/**
 * Summarise the store for the main-menu activity card. Hunger > 60 reads
 * as "needs feeding" in the same way RoomView flags it; happiness >= 70
 * is the game-logic threshold for a "happy" state.
 */
function computeMenuStats(store: GameStateStore): MenuStats {
  const animals = store.animals ?? [];
  return {
    totalAnimals: animals.length,
    happyToday: animals.filter((a) => (a.happiness ?? 0) >= 70).length,
    needFeeding: animals.filter((a) => (a.hunger ?? 0) > 60).length,
  };
}
