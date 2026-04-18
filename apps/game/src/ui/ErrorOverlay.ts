import Phaser from 'phaser';
import { COLOURS, FONTS, TEXT_RESOLUTION } from './constants';

/**
 * ErrorOverlay — centralised error UI for the game.
 *
 * Two flavours:
 * - `showToast(scene, message)`  — small non-blocking banner that
 *   auto-dismisses after 5s. For transient failures (e.g. save
 *   write didn't land) where the game can continue.
 * - `showBlocking(scene, message, retryFn)` — full-screen modal with
 *   a Retry button. For fatal errors (e.g. load failed, so we can't
 *   start the scene). The modal is dismissed when retryFn succeeds.
 *
 * Both flavours are rate-limited — calling showToast in a tight loop
 * will only render one toast at a time (subsequent calls update the
 * message rather than stacking).
 */

const TOAST_KEY = '__arc_error_toast';
const MODAL_KEY = '__arc_error_modal';

// ── Toast ────────────────────────────────────────────────────────

export function showToast(scene: Phaser.Scene, message: string): void {
  // Reuse existing toast if one is already showing (prevents stacking)
  const existing = (scene as unknown as Record<string, unknown>)[TOAST_KEY] as
    | { container: Phaser.GameObjects.Container; text: Phaser.GameObjects.Text; timer: Phaser.Time.TimerEvent }
    | undefined;

  if (existing) {
    existing.text.setText(message);
    existing.timer.reset({ delay: 5000, callback: () => dismissToast(scene) });
    return;
  }

  const cam = scene.cameras.main;
  const W = cam.width;
  const container = scene.add.container(W / 2, 80);
  container.setScrollFactor(0).setDepth(9999);

  const bg = scene.add.rectangle(0, 0, 420, 54, 0x8a4a3a, 0.94)
    .setStrokeStyle(2, 0xffffff, 0.3);

  const icon = scene.add.text(-185, 0, '⚠️', { fontSize: '24px' })
    .setOrigin(0, 0.5)
    .setResolution(TEXT_RESOLUTION);

  const text = scene.add.text(-150, 0, message, {
    fontSize: '14px',
    fontFamily: FONTS.body,
    color: '#ffffff',
    wordWrap: { width: 320 },
  }).setOrigin(0, 0.5)
    .setResolution(TEXT_RESOLUTION);

  container.add([bg, icon, text]);

  // Slide in from above
  container.setY(-60);
  scene.tweens.add({
    targets: container,
    y: 80,
    duration: 250,
    ease: 'Back.easeOut',
  });

  const timer = scene.time.delayedCall(5000, () => dismissToast(scene));

  (scene as unknown as Record<string, unknown>)[TOAST_KEY] = { container, text, timer };

  // Clean up on scene shutdown so we don't leak tweens/timers
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => dismissToast(scene));
}

function dismissToast(scene: Phaser.Scene): void {
  const existing = (scene as unknown as Record<string, unknown>)[TOAST_KEY] as
    | { container: Phaser.GameObjects.Container; timer: Phaser.Time.TimerEvent }
    | undefined;
  if (!existing) return;

  existing.timer.remove();
  scene.tweens.add({
    targets: existing.container,
    y: -60,
    alpha: 0,
    duration: 200,
    ease: 'Back.easeIn',
    onComplete: () => existing.container.destroy(),
  });
  (scene as unknown as Record<string, unknown>)[TOAST_KEY] = undefined;
}

// ── Blocking modal ───────────────────────────────────────────────

/**
 * Show a blocking modal with a message and a Retry button. The modal
 * stays up until `retryFn()` returns truthy (or throws — in which case
 * the message is updated and the user can try again).
 *
 * Use this when the game genuinely can't continue without the operation
 * succeeding (e.g. failed to load save on scene entry).
 */
export function showBlocking(
  scene: Phaser.Scene,
  message: string,
  retryFn: () => Promise<boolean>,
): void {
  // Dismiss any existing modal first
  dismissBlocking(scene);

  const cam = scene.cameras.main;
  const W = cam.width;
  const H = cam.height;

  const container = scene.add.container(W / 2, H / 2);
  container.setScrollFactor(0).setDepth(10000);

  const veil = scene.add.rectangle(0, 0, W, H, 0x000000, 0.55);
  veil.setInteractive();  // swallow clicks beneath

  const panel = scene.add.rectangle(0, 0, 460, 260, 0xfef9ef)
    .setStrokeStyle(3, 0xd4783c);

  const title = scene.add.text(0, -90, 'Connection hiccup', {
    fontSize: '22px',
    fontFamily: FONTS.title,
    color: COLOURS.text,
    fontStyle: 'bold',
  }).setOrigin(0.5).setResolution(TEXT_RESOLUTION);

  const text = scene.add.text(0, -20, message, {
    fontSize: '15px',
    fontFamily: FONTS.body,
    color: COLOURS.text,
    wordWrap: { width: 410 },
    align: 'center',
  }).setOrigin(0.5).setResolution(TEXT_RESOLUTION);

  const btnBg = scene.add.rectangle(0, 70, 180, 48, 0x5aae4a)
    .setStrokeStyle(2, 0x3d8a2e)
    .setInteractive({ useHandCursor: true });

  const btnText = scene.add.text(0, 70, 'Try again', {
    fontSize: '18px',
    fontFamily: FONTS.title,
    color: '#ffffff',
    fontStyle: 'bold',
  }).setOrigin(0.5).setResolution(TEXT_RESOLUTION);

  container.add([veil, panel, title, text, btnBg, btnText]);

  let retrying = false;
  const onRetry = async () => {
    if (retrying) return;
    retrying = true;
    btnText.setText('Retrying...');
    btnBg.disableInteractive();
    try {
      const ok = await retryFn();
      if (ok) {
        dismissBlocking(scene);
        return;
      }
      text.setText(message + '\n\n(Still no luck — try once more?)');
    } catch (e) {
      text.setText(message + '\n\n(' + (e instanceof Error ? e.message : 'Still failing') + ')');
    }
    retrying = false;
    btnText.setText('Try again');
    btnBg.setInteractive({ useHandCursor: true });
  };

  btnBg.on('pointerdown', onRetry);

  (scene as unknown as Record<string, unknown>)[MODAL_KEY] = { container };

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => dismissBlocking(scene));
}

function dismissBlocking(scene: Phaser.Scene): void {
  const existing = (scene as unknown as Record<string, unknown>)[MODAL_KEY] as
    | { container: Phaser.GameObjects.Container }
    | undefined;
  if (!existing) return;
  existing.container.destroy();
  (scene as unknown as Record<string, unknown>)[MODAL_KEY] = undefined;
}
