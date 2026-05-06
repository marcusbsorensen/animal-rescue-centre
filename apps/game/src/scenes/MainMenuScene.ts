import Phaser from 'phaser';
import { getSession, logout } from '../lib/auth';
import { AudioManager } from '../audio/AudioManager';
import { AssetLoader } from '../lib/AssetLoader';
import { GameStateStore } from '../game-state/GameStateStore';
import { loadGameState, saveGameState } from '../game-state/loadSaveState';
import { mountAuth, unmountAuth, type MenuStats } from '../auth-overlay/AuthOverlay';
import { canRecruit, recruitApprentice, APPRENTICE_DEFS } from '@arc/game-logic';
import { showToast } from '../ui/ErrorOverlay';

/**
 * MainMenuScene — lightweight router between the three HTML auth overlays.
 *
 * Not logged in → welcome overlay (PLAY → startGame via session check,
 *                 login/signup → their respective scenes).
 * Logged in     → menu overlay (CONTINUE → startGame, Friends, Log out).
 *
 * The actual painted UI lives in the iframe screens — this scene just
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
          // PLAY without a session → assume the player is new and route
          // to signup. Returning users would tap "I already have an
          // account" instead. Without this, PLAY would call startGame()
          // and fail because there's no user to attach progress to.
          if (action === 'play')   { unmount(); this.scene.start('SignupScene'); return; }
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
          if (action === 'friends') { menuUnmount(); this.openFriendsOverlay(store, session); return; }
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
   * Open the HTML Friends screen as an iframe overlay. The page sends
   * back 'back-to-menu' and 'recruit-apprentice' postMessages; we bridge
   * the recruit one into game-logic, persist, then re-render the overlay
   * on success so the apprentice-able badges update in place.
   */
  private openFriendsOverlay(store: GameStateStore, session: ReturnType<typeof getSession>): void {
    const mount = (): void => {
      const friendsUnmount = mountAuth('friends', {
        onAction: (action, _session, payload) => {
          if (action === 'back-to-menu') {
            friendsUnmount();
            this.scene.restart();
            return;
          }
          if (action === 'recruit-apprentice') {
            const id = typeof payload?.id === 'string' ? payload.id : '';
            const check = canRecruit(id, store);
            if (!check.ok) {
              showToast(this, check.reason ?? 'Not ready to recruit them yet.');
              return;
            }
            try {
              recruitApprentice(id, store);
            } catch (err) {
              showToast(this, err instanceof Error ? err.message : 'Could not recruit.');
              return;
            }
            const def = APPRENTICE_DEFS[id as keyof typeof APPRENTICE_DEFS];
            showToast(this, `⭐ ${def?.name ?? 'Apprentice'} is now a volunteer apprentice!`);
            saveGameState(this, store);
            // Re-mount so the screen re-renders with the new state.
            friendsUnmount();
            mount();
          }
        },
      }, {
        session: session ?? undefined,
        recruited: store.apprentices.map((a) => a.id),
      });
      this.events.once('shutdown', unmountAuth);
      this.events.once('destroy', unmountAuth);
    };
    mount();
  }

  /**
   * Route to game — fade out, then go to IntroScene which plays the
   * 4-panel walk-in (or only panel 4 if skip is on) before passing
   * to GameScene/LoadingScene. The asset-loading gate moves into
   * IntroScene's startGameWithPreselect.
   *
   * Bug history: previously used a `tweens.add({ targets:
   * cameras.main, alpha: 0, onComplete: scene.start })` pattern.
   * In some flows (notably brand-new signup) the tween's onComplete
   * never fired, leaving the kid stuck on the menu screen. The
   * built-in `cameras.main.fadeOut` + `time.delayedCall` is more
   * robust because the delayed call is owned by the scene's own
   * timer rather than the tween manager (which can be paused or
   * confused by iframe-unmount side-effects).
   */
  private startGame(): void {
    this.cameras.main.fadeOut(300);
    this.time.delayedCall(320, () => {
      this.scene.start('IntroScene');
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
