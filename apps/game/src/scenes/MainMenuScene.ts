import Phaser from 'phaser';
import { getSession, logout, getRememberedUsernames } from '../lib/auth';
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

  /** Cached store for the logged-in session. We load it once and reuse it
   *  across overlay swaps (menu ↔ friends) so we don't have to scene.restart
   *  the entire scene — restart-during-iframe-handoff was causing blank
   *  screens / stuck loaders. */
  private store: GameStateStore | null = null;

  create(): void {
    const session = getSession();

    // Start menu music
    const audio = AudioManager.getInstance();
    audio.setScene(this);
    audio.playSceneMusic('menu');

    // Not logged in → welcome overlay.
    if (!session) {
      this.showWelcome();
      this.events.once('shutdown', unmountAuth);
      this.events.once('destroy', unmountAuth);
      return;
    }

    // Logged in → load store once, then show menu overlay.
    const store = new GameStateStore();
    this.store = store;
    loadGameState(this, store).then(() => {
      // Hand the freshly-loaded store to GameScene via the registry so
      // CONTINUE doesn't pay the load cost twice. Worth doing even if this
      // scene is on its way out — the store is loaded either way.
      this.registry.set('gameStore', store);
      // The load can outlive the scene: the resize handler restarts scenes,
      // and `shutdown` has already run its unmountAuth by the time this
      // resolves. Mounting the menu from here then puts the overlay over
      // whatever replaced this scene, with no shutdown left to take it
      // down — a full-screen iframe over the corridor that only its own
      // buttons can dismiss.
      if (!this.scene.isActive()) return;
      this.showMenu(session);
    });
    this.events.once('shutdown', unmountAuth);
    this.events.once('destroy', unmountAuth);

    // Kick off asset prefetch in parallel so CONTINUE is instant.
    AssetLoader.getInstance().startBackgroundLoad(this);
  }

  /** Mount the welcome (logged-out) overlay. */
  private showWelcome(): void {
    mountAuth('welcome', {
      onAction: (action) => {
        // PLAY without a session → if this device has previously-used
        // accounts, route to login (kid is almost certainly returning).
        // Only assume "new player → signup" when no remembered username
        // exists. Without this, returning kids whose session has expired
        // get dumped into the PIN-creation flow and can't get back in.
        if (action === 'play')   {
          unmountAuth();
          const remembered = getRememberedUsernames();
          this.scene.start(remembered.length > 0 ? 'LoginScene' : 'SignupScene');
          return;
        }
        if (action === 'login')  { unmountAuth(); this.scene.start('LoginScene'); return; }
        if (action === 'signup') { unmountAuth(); this.scene.start('SignupScene'); return; }
      },
    });
  }

  /** Mount the main-menu overlay (logged-in). Uses this.store. */
  private showMenu(session: NonNullable<ReturnType<typeof getSession>>): void {
    if (!this.store) return;
    const stats = computeMenuStats(this.store);
    mountAuth('menu', {
      onAction: (action) => {
        if (action === 'play')    { unmountAuth(); this.startGame(); return; }
        if (action === 'friends') { unmountAuth(); this.openFriendsOverlay(session); return; }
        if (action === 'logout')  {
          // Don't scene.start('MainMenuScene') — that races with the
          // iframe unmount and leaves the kid staring at a half-torn-down
          // screen. Just clear the session, swap overlays in place.
          unmountAuth();
          logout();
          this.store = null;
          this.showWelcome();
          return;
        }
      },
    }, { session, stats });
  }

  /**
   * Open the HTML Friends screen as an iframe overlay. The page sends
   * back 'back-to-menu' and 'recruit-apprentice' postMessages; we bridge
   * the recruit one into game-logic, persist, then re-render the overlay
   * on success so the apprentice-able badges update in place.
   */
  private openFriendsOverlay(session: NonNullable<ReturnType<typeof getSession>>): void {
    if (!this.store) return;
    const store = this.store;
    const mount = (): void => {
      mountAuth('friends', {
        onAction: (action, _session, payload) => {
          if (action === 'back-to-menu') {
            // Swap overlays in place — DO NOT scene.restart() here. Restart
            // re-runs loadGameState and momentarily unmounts the iframe,
            // which on slower connections leaves a blank canvas.
            unmountAuth();
            this.showMenu(session);
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
            mount();
          }
        },
      }, {
        session,
        recruited: store.apprentices.map((a) => a.id),
      });
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
