import Phaser from 'phaser';
import { COLOURS, FONTS, TEXT_RESOLUTION, SAFE_MARGIN, SPACE, TYPE } from './constants';
import { createChromeButton, createChromePlate } from './UIButton';
import { AudioManager } from '../audio/AudioManager';
import { deleteAccount, type DeleteAccountOutcome } from '../lib/delete-account';

/**
 * The words on the delete panel, kept together so they can be read (and
 * tested) as one piece. Short sentences, words a seven-year-old reads, no
 * "data" or "permanently". The panel says what goes before it asks.
 */
export const DELETE_ACCOUNT_COPY = {
  explainTitle: 'Delete this account?',
  explainBody:
    'This takes away your shelter, all your animals, your badges and coins, ' +
    'your friends and gifts, and your name and secret number.\n\n' +
    'It cannot be undone. Ask a grown-up to help you.',
  keep: 'Keep my account',
  goOn: 'Delete it',
  pinTitle: 'Ask a grown-up',
  pinBody: 'To delete this account, type its secret number.',
  busy: 'Deleting...',
  doneTitle: 'Your account is deleted',
  doneBody: 'Everything in it has been taken away.\nThank you for looking after the animals!',
  doneButton: 'OK',
  outcome: {
    'wrong-pin': 'That number is not right. Try again.',
    'too-many-tries': 'Too many tries. Wait a little while, then try again.',
    'signed-out': 'Please sign in again first. Your account is still here.',
    failed: "That didn't work. Your account is still here. Try again later.",
  } satisfies Record<Exclude<DeleteAccountOutcome, 'deleted'>, string>,
} as const;

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'];

/**
 * Open the "Delete this account" panel over `scene`.
 *
 * Three steps, all inside the game: what will be taken away (with "Keep
 * my account" as the button the screen leads with), then the account's
 * secret number, which is the check the game already uses for an account
 * (login asks for it too), then a goodbye. Nothing is deleted until the
 * server has checked that number.
 *
 * `onDeleted` runs after the goodbye, once the account is gone from the
 * server and from this device.
 */
export function openDeleteAccountPanel(
  scene: Phaser.Scene,
  onDeleted: () => void,
): void {
  const { width, height } = scene.scale;
  const root = scene.add.container(0, 0).setDepth(9000).setScrollFactor(0);

  // Swallows every tap under the panel.
  const veil = scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.5)
    .setInteractive();
  root.add(veil);

  const panelW = Math.min(600, width - SAFE_MARGIN * 2);
  const panelH = Math.min(330, height - SAFE_MARGIN * 2);
  const cx = width / 2;
  const cy = height / 2;
  const top = cy - panelH / 2;
  const left = cx - panelW / 2;
  // Opaque: the account card behind showed through the plate's usual
  // translucency, and two layers of words read as one muddle.
  root.add(createChromePlate(scene, cx, cy, panelW, panelH, { fillAlpha: 1 }));

  const step = scene.add.container(0, 0);
  root.add(step);

  let keyHandler: ((e: KeyboardEvent) => void) | null = null;
  const setKeys = (handler: ((e: KeyboardEvent) => void) | null) => {
    if (keyHandler) scene.input.keyboard?.off('keydown', keyHandler);
    keyHandler = handler;
    if (handler) scene.input.keyboard?.on('keydown', handler);
  };

  const close = () => {
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, close);
    setKeys(null);
    root.destroy();
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, close);

  const click = () => AudioManager.getInstance().playSfx('button_click');

  const text = (x: number, y: number, s: string, size: string, wrap: number, bold = false) =>
    scene.add.text(x, y, s, {
      fontSize: size,
      fontFamily: bold ? FONTS.title : FONTS.body,
      fontStyle: bold ? 'bold' : 'normal',
      color: COLOURS.text,
      align: 'center',
      wordWrap: { width: wrap },
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5, 0);

  // ── 1. What goes ───────────────────────────────────────────

  const showExplain = () => {
    step.removeAll(true);
    setKeys((e) => { if (e.key === 'Escape') close(); });
    const wrap = panelW - SPACE.xl * 2;
    const title = text(cx, top + SPACE.l, DELETE_ACCOUNT_COPY.explainTitle, TYPE.lead, wrap, true);
    const body = text(cx, title.y + title.height + SPACE.m, DELETE_ACCOUNT_COPY.explainBody, TYPE.body, wrap);
    step.add([title, body]);

    const buttonY = top + panelH - SPACE.l;
    const gap = SPACE.l / 2;
    // Keeping is the one action the screen leads with, so it is the filled
    // button; deleting is the plate with the danger ink.
    step.add(createChromeButton(scene, cx - gap, buttonY, DELETE_ACCOUNT_COPY.keep, () => {
      click();
      close();
    }, {
      fontSize: TYPE.button, width: 0, variant: 'filled',
      anchor: { x: 'right', y: 'bottom' },
    }));
    step.add(createChromeButton(scene, cx + gap, buttonY, DELETE_ACCOUNT_COPY.goOn, () => {
      click();
      showPin();
    }, {
      fontSize: TYPE.button, width: 0, tone: 'danger',
      anchor: { x: 'left', y: 'bottom' },
    }));
  };

  // ── 2. The secret number ───────────────────────────────────

  const showPin = () => {
    step.removeAll(true);
    let pin = '';
    let busy = false;

    // Keypad on the right, words on the left: a landscape phone is 360
    // tall, and a keypad under the words would not fit. A chrome button
    // pads its label, so a key comes out wider than the 48 asked for;
    // lay the pad out from the width it actually drew.
    const key = 48;
    const keyGap = 8;
    const keys = KEYS.map((k) => createChromeButton(scene, 0, 0, k, () => press(k), {
      width: key, height: key, radius: 12,
      variant: k === '✓' ? 'filled' : 'plate',
      tone: k === '⌫' ? 'danger' : 'default',
      fontSize: '24px',
    }));
    const keyW = Math.max(...keys.map((b) => b.width));
    const padW = keyW * 3 + keyGap * 2;
    const padH = key * 4 + keyGap * 3;
    const padLeft = left + panelW - SPACE.xl - padW;
    const padTop = cy - padH / 2;
    keys.forEach((b, i) => {
      b.setPosition(
        padLeft + (i % 3) * (keyW + keyGap) + keyW / 2,
        padTop + Math.floor(i / 3) * (key + keyGap) + key / 2,
      );
    });
    const colW = padLeft - left - SPACE.xl * 2;
    const colX = left + SPACE.xl + colW / 2;

    const title = text(colX, top + SPACE.l, DELETE_ACCOUNT_COPY.pinTitle, TYPE.lead, colW, true);
    const body = text(colX, title.y + title.height + SPACE.s, DELETE_ACCOUNT_COPY.pinBody, TYPE.body, colW);
    const dots = text(colX, body.y + body.height + SPACE.m, '○ ○ ○ ○', '32px', colW);
    const status = text(colX, dots.y + dots.height + SPACE.s, '', TYPE.caption, colW)
      .setColor(COLOURS.error);
    step.add([title, body, dots, status]);

    const keep = createChromeButton(scene, colX, top + panelH - SPACE.l, DELETE_ACCOUNT_COPY.keep, () => {
      if (busy) return;
      click();
      close();
    }, { fontSize: TYPE.button, width: 0, variant: 'filled', anchor: { y: 'bottom' } });
    step.add(keep);

    const drawDots = () => dots.setText(
      Array.from({ length: 4 }, (_, i) => (i < pin.length ? '●' : '○')).join(' '),
    );

    const submit = async () => {
      busy = true;
      status.setColor(COLOURS.textLight).setText(DELETE_ACCOUNT_COPY.busy);
      const outcome = await deleteAccount(pin);
      if (!root.active) return;  // the scene went away while we waited
      if (outcome === 'deleted') {
        showDone();
        return;
      }
      busy = false;
      pin = '';
      drawDots();
      status.setColor(COLOURS.error).setText(DELETE_ACCOUNT_COPY.outcome[outcome]);
    };

    const press = (k: string) => {
      if (busy) return;
      if (k === '⌫') {
        pin = pin.slice(0, -1);
      } else if (k === '✓') {
        if (pin.length === 4) void submit();
        return;
      } else if (pin.length < 4) {
        pin += k;
        status.setText('');
      }
      drawDots();
    };

    step.add(keys);

    setKeys((e) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('⌫');
      else if (e.key === 'Enter') press('✓');
      else if (e.key === 'Escape' && !busy) close();
    });
  };

  // ── 3. Goodbye ─────────────────────────────────────────────

  const showDone = () => {
    step.removeAll(true);
    setKeys(null);
    const wrap = panelW - SPACE.xl * 2;
    const title = text(cx, top + SPACE.xl, DELETE_ACCOUNT_COPY.doneTitle, TYPE.lead, wrap, true);
    const body = text(cx, title.y + title.height + SPACE.m, DELETE_ACCOUNT_COPY.doneBody, TYPE.body, wrap);
    step.add([title, body]);
    step.add(createChromeButton(scene, cx, top + panelH - SPACE.l, DELETE_ACCOUNT_COPY.doneButton, () => {
      click();
      close();
      onDeleted();
    }, { fontSize: TYPE.button, variant: 'filled', anchor: { y: 'bottom' } }));
  };

  showExplain();
}
