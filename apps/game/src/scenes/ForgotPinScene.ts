import Phaser from 'phaser';
import { mountAuth, unmountAuth } from '../auth-overlay/AuthOverlay';

/**
 * ForgotPinScene — mounts the forgot-PIN recovery overlay over Phaser.
 * Listens for postMessages from the iframe and routes accordingly:
 *   recovery-pass            → user passed challenge, allow PIN reset
 *   recovery-hint-resolved   → kid remembered after seeing hint
 *   recovery-parent-help     → fall through to parent-help (parked)
 *   recovery-cancel          → back to login
 *
 * Most of those just route back to LoginScene for now; the actual
 * PIN-reset and parent-help screens are TBD per
 * docs/forgot-pin-recovery.md.
 */
export class ForgotPinScene extends Phaser.Scene {
  constructor() {
    super({ key: 'ForgotPinScene' });
  }

  create(): void {
    const unmount = mountAuth('forgot-pin', {
      onAction: (action) => {
        if (action === 'back-to-welcome') { unmount(); this.scene.start('MainMenuScene'); return; }
      },
    });
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
