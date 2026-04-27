import Phaser from 'phaser';
import { mountAuth, unmountAuth, postToActiveFrame } from '../auth-overlay/AuthOverlay';
import { getPinHint } from '../lib/auth';

/**
 * ForgotPinScene — mounts the forgot-PIN recovery overlay over Phaser.
 * Listens for postMessages from the iframe and routes accordingly:
 *   recovery-pass            → user passed challenge, allow PIN reset
 *   recovery-hint-resolved   → kid remembered after seeing hint
 *   recovery-parent-help     → fall through to parent-help (parked)
 *   recovery-cancel          → back to login
 *
 * If the kid arrived here from a tapped chip on login, we get the
 * username via init data and pre-fetch their saved PIN-hint via the
 * get-pin-hint edge function so it's ready when the iframe asks.
 *
 * Most outcomes route back to LoginScene for now; the dedicated
 * PIN-reset + parent-help screens are TBD per
 * docs/forgot-pin-recovery.md.
 */
export class ForgotPinScene extends Phaser.Scene {
  private initData: { username?: string } = {};

  constructor() {
    super({ key: 'ForgotPinScene' });
  }

  init(data?: { username?: string }): void {
    this.initData = data ?? {};
  }

  create(): void {
    const unmount = mountAuth('forgot-pin', {
      onAction: (action) => {
        if (action === 'back-to-welcome') { unmount(); this.scene.start('MainMenuScene'); return; }
      },
    });

    // Pre-fetch the saved PIN-hint and post it to the iframe so it's
    // available the moment the kid lands on the "fall-through-to-hint"
    // verdict. Failures are silent — the iframe falls back to a
    // neutral message if no hint is available.
    const username = this.initData.username;
    if (username) {
      getPinHint(username)
        .then((hint) => {
          if (hint) postToActiveFrame('init', { username, hint });
        })
        .catch(() => { /* silent — hint stays empty */ });
    }
    // Custom message listener — the forgot-pin iframe posts custom
    // recovery-* events that aren't part of the AuthAction union.
    const listener = (e: MessageEvent): void => {
      const m = e.data;
      if (!m || m.source !== 'arc-auth' || typeof m.type !== 'string') return;
      if (m.type === 'recovery-cancel' || m.type === 'recovery-hint-resolved') {
        unmount();
        window.removeEventListener('message', listener);
        this.scene.start('LoginScene');
      }
      if (m.type === 'recovery-pass') {
        unmount();
        window.removeEventListener('message', listener);
        // TODO: route to a dedicated PIN-reset screen. For now drop
        // the kid back at login so they can retry with a fresh PIN.
        this.scene.start('LoginScene');
      }
      if (m.type === 'recovery-parent-help') {
        unmount();
        window.removeEventListener('message', listener);
        // TODO: parent-help flow (parked per docs/forgot-pin-recovery.md).
        this.scene.start('LoginScene');
      }
    };
    window.addEventListener('message', listener);
    this.events.once('shutdown', () => {
      unmountAuth();
      window.removeEventListener('message', listener);
    });
    this.events.once('destroy', unmountAuth);
  }
}
