import Phaser from 'phaser';
import type { DialogueBeat, DialogueSequence, DialogueChoice } from '@arc/game-logic';
import { COLOURS, FONTS, TEXT_RESOLUTION } from './constants';

/**
 * DialogueRunner — a staged cutscene-dialogue overlay.
 *
 * Matches the reference (docs/adoption-dialogue-presentation-2026-05-19.md):
 * a dimmed world, a large waist-up portrait anchored to the speaker's edge,
 * a dashed name pill on the dialogue box, short body copy with referenced
 * names highlighted, a down-chevron / tap-to-advance, and a SKIP pill.
 *
 * Generic on purpose: beats carry their own `side`, `speaker` and
 * `expression`, so a two-speaker conversation alternates edges naturally and
 * the same runner can drive apprentice / return-visit / vet dialogues later.
 *
 * The runner never throws into the caller's flow — `onComplete` fires exactly
 * once on finish OR skip OR an empty sequence, so a dialogue can never strand
 * whatever comes next (e.g. an adoption).
 */

// Pale-blue dialogue palette (from the reference), tuned to the A.R.C. brand.
const BOX_FILL = 0xdbeef7;
const BOX_STROKE = 0x8fbcd6;
const PILL_FILL = 0x2e6b8a;      // COLOURS.info
const PILL_TEXT = '#ffffff';
const NAVY = '#173a4d';
const HIGHLIGHT = '#3D8A2E';     // COLOURS.primary — referenced names in green
const CHEVRON = 0x2e6b8a;

export interface DialoguePortrait {
  /** Texture cache key to draw if present. */
  key: string;
  /** Optional URL to lazily load when `key` isn't cached yet. */
  url?: string;
  /** Secondary cached key to draw if `key` fails to load (e.g. neutral behind an expression). */
  altKey?: string;
  /** Fallback display name for the painted-initials chip if no image is available. */
  fallbackName: string;
}

export interface RunDialogueOptions {
  onComplete: () => void;
  /** Resolve the portrait (key + optional url) for a beat. */
  resolvePortrait: (beat: DialogueBeat) => DialoguePortrait;
  /** Optional: resolve a Phaser audio-cache key to play on a beat. */
  resolveVoice?: (beat: DialogueBeat) => string | undefined;
  /** Optional: called with the chosen id when the player picks a choice pill. */
  onChoice?: (choiceId: string, beat: DialogueBeat) => void;
}

/**
 * Mount the dialogue overlay on `scene` (already visible). Returns a
 * `destroy()` in case the caller needs to tear it down early.
 */
export function runDialogue(
  scene: Phaser.Scene,
  sequence: DialogueSequence,
  opts: RunDialogueOptions,
): { destroy: () => void } {
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    cleanup();
    opts.onComplete();
  };

  // Empty sequence → fall straight through (safety).
  if (!sequence.beats.length) {
    opts.onComplete();
    return { destroy: () => {} };
  }

  const root = scene.add.container(0, 0).setDepth(10_000).setScrollFactor(0);
  let index = 0;
  let onResize: (() => void) | null = null;

  function cleanup() {
    if (onResize) scene.scale.off('resize', onResize);
    root.destroy(true);
  }

  // Preload any portrait images not yet cached, then render the first beat.
  const toLoad = new Map<string, string>();
  for (const beat of sequence.beats) {
    const p = opts.resolvePortrait(beat);
    if (p.url && !scene.textures.exists(p.key)) toLoad.set(p.key, p.url);
  }

  const start = () => {
    onResize = () => render();
    scene.scale.on('resize', onResize);
    render();
  };

  if (toLoad.size > 0) {
    for (const [key, url] of toLoad) scene.load.image(key, url);
    // Non-fatal: a failed load just falls back to the initials chip.
    scene.load.once(Phaser.Loader.Events.COMPLETE, start);
    scene.load.start();
  } else {
    start();
  }

  function render() {
    root.removeAll(true);
    const W = scene.scale.width;
    const H = scene.scale.height;
    const beat = sequence.beats[index];
    const p = opts.resolvePortrait(beat);

    // ── Dimmed backdrop (swallows taps on the world behind) ──
    const backdrop = scene.add
      .rectangle(0, 0, W, H, 0x1b2a33, 0.5)
      .setOrigin(0, 0)
      .setInteractive();
    root.add(backdrop);

    // ── Dialogue box geometry ──
    const boxW = Math.min(W - 28, 560);
    const boxH = 128;
    const boxX = (W - boxW) / 2;
    const boxY = H - boxH - 22;
    const pad = 22;

    // ── Portrait (waist-up, anchored to the speaker's edge, above the box) ──
    const portraitH = Math.min(H * 0.52, 360);
    const portraitCx = beat.side === 'left' ? boxX + portraitH * 0.34 : boxX + boxW - portraitH * 0.34;
    const portraitBottom = boxY + 26; // slight overlap behind the box
    drawPortrait(scene, root, p, portraitCx, portraitBottom, portraitH);

    const hasChoices = !!beat.choices && beat.choices.length > 0;

    // ── Box ──
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.16);
    g.fillRoundedRect(boxX + 2, boxY + 4, boxW, boxH, 18);
    g.fillStyle(BOX_FILL, 1);
    g.fillRoundedRect(boxX, boxY, boxW, boxH, 18);
    g.lineStyle(2, BOX_STROKE, 1);
    g.strokeRoundedRect(boxX, boxY, boxW, boxH, 18);
    root.add(g);
    // A choice beat must be answered by picking a pill — the box itself only
    // advances on linear beats.
    if (!hasChoices) {
      g.setInteractive(
        new Phaser.Geom.Rectangle(boxX, boxY, boxW, boxH),
        Phaser.Geom.Rectangle.Contains,
      );
      g.on('pointerdown', advance);
    }

    // ── Name pill (dashed inner border, on the box top edge, speaker's side) ──
    drawNamePill(scene, root, beat.speaker, beat.side, boxX, boxY, boxW);

    // ── Body copy with highlighted names ──
    layoutRichText(scene, root, {
      x: boxX + pad,
      y: boxY + pad + 8,
      maxWidth: boxW - pad * 2,
      text: beat.text,
      highlights: beat.highlights ?? [],
    });

    if (hasChoices) {
      // ── Choice pills, stacked above the box (same visual language) ──
      drawChoices(scene, root, beat.choices!, boxX, boxY, boxW, (choiceId) => {
        opts.onChoice?.(choiceId, beat);
        advance();
      });
    } else {
      // ── Down-chevron (centre, box bottom edge) ──
      const chevron = scene.add.graphics();
      const ccx = boxX + boxW / 2;
      const ccy = boxY + boxH - 2;
      chevron.fillStyle(CHEVRON, 1);
      chevron.fillTriangle(ccx - 9, ccy - 5, ccx + 9, ccy - 5, ccx, ccy + 6);
      root.add(chevron);
    }

    // ── SKIP pill (bottom-right of the box) ──
    drawSkip(scene, root, boxX + boxW - 78, boxY + boxH - 26, finish);

    // ── Optional voice sting ──
    const voiceKey = opts.resolveVoice?.(beat);
    if (voiceKey && scene.cache.audio.exists(voiceKey)) {
      try { scene.sound.play(voiceKey, { volume: 0.9 }); } catch { /* non-fatal */ }
    }
  }

  function advance() {
    if (finished) return;
    if (index >= sequence.beats.length - 1) {
      finish();
    } else {
      index += 1;
      render();
    }
  }

  return { destroy: cleanup };
}

// ── Helpers ──────────────────────────────────────────────────────

function drawPortrait(
  scene: Phaser.Scene,
  root: Phaser.GameObjects.Container,
  p: DialoguePortrait,
  cx: number,
  bottomY: number,
  targetH: number,
): void {
  const drawKey = scene.textures.exists(p.key)
    ? p.key
    : p.altKey && scene.textures.exists(p.altKey)
      ? p.altKey
      : null;
  if (drawKey) {
    const img = scene.add.image(cx, bottomY, drawKey).setOrigin(0.5, 1);
    const src = scene.textures.get(drawKey).getSourceImage() as { width?: number; height?: number };
    const fit = targetH / (src?.height ?? targetH);
    img.setScale(fit);
    root.add(img);
    return;
  }
  // Painted-initials chip fallback (mirrors AdoptionMatchScene).
  const size = targetH * 0.5;
  const frame = scene.add.graphics();
  frame.fillStyle(0xb88a37, 1);
  frame.fillRoundedRect(cx - size / 2, bottomY - size, size, size, 12);
  frame.fillStyle(0xfff3d8, 1);
  frame.fillRoundedRect(cx - size / 2 + 4, bottomY - size + 4, size - 8, size - 8, 10);
  root.add(frame);
  const initials = p.fallbackName
    .split(/\s+/)
    .filter((s) => s.length > 0)
    .slice(0, 2)
    .map((s) => s.replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase())
    .join('');
  root.add(
    scene.add
      .text(cx, bottomY - size / 2, initials || '?', {
        fontSize: `${Math.round(size * 0.4)}px`,
        fontFamily: FONTS.title,
        fontStyle: 'bold',
        color: '#6b3a18',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5),
  );
}

function drawNamePill(
  scene: Phaser.Scene,
  root: Phaser.GameObjects.Container,
  name: string,
  side: 'left' | 'right',
  boxX: number,
  boxY: number,
  boxW: number,
): void {
  const label = scene.add
    .text(0, 0, name, {
      fontSize: '18px',
      fontFamily: FONTS.title,
      fontStyle: 'bold',
      color: PILL_TEXT,
      resolution: TEXT_RESOLUTION,
    })
    .setOrigin(0.5);
  const pillW = Math.max(96, label.width + 40);
  const pillH = 38;
  const pillX = side === 'left' ? boxX + 20 : boxX + boxW - 20 - pillW;
  const pillY = boxY - pillH / 2;

  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.15);
  g.fillRoundedRect(pillX + 1, pillY + 2, pillW, pillH, pillH / 2);
  g.fillStyle(PILL_FILL, 1);
  g.fillRoundedRect(pillX, pillY, pillW, pillH, pillH / 2);
  // Dashed inner border.
  g.lineStyle(1.5, 0xffffff, 0.85);
  drawDashedRoundedRect(g, pillX + 5, pillY + 5, pillW - 10, pillH - 10, (pillH - 10) / 2);
  root.add(g);

  label.setPosition(pillX + pillW / 2, pillY + pillH / 2);
  root.add(label);
}

function drawSkip(
  scene: Phaser.Scene,
  root: Phaser.GameObjects.Container,
  cx: number,
  cy: number,
  onSkip: () => void,
): void {
  const w = 76;
  const h = 34;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.15);
  g.fillRoundedRect(cx - w / 2 + 1, cy - h / 2 + 2, w, h, h / 2);
  g.fillStyle(PILL_FILL, 1);
  g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, h / 2);
  root.add(g);
  const label = scene.add
    .text(cx, cy, 'SKIP ›', {
      fontSize: '15px',
      fontFamily: FONTS.title,
      fontStyle: 'bold',
      color: PILL_TEXT,
      resolution: TEXT_RESOLUTION,
    })
    .setOrigin(0.5);
  root.add(label);
  g.setInteractive(
    new Phaser.Geom.Rectangle(cx - w / 2, cy - h / 2, w, h),
    Phaser.Geom.Rectangle.Contains,
  );
  g.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
    ev?.stopPropagation?.();
    onSkip();
  });
}

/**
 * Choice pills — a vertical stack of tappable option buttons above the box,
 * in the same rounded pale-blue language as the rest of the overlay. Picking
 * one calls `onPick(choiceId)`.
 */
function drawChoices(
  scene: Phaser.Scene,
  root: Phaser.GameObjects.Container,
  choices: DialogueChoice[],
  boxX: number,
  boxY: number,
  boxW: number,
  onPick: (choiceId: string) => void,
): void {
  const pillH = 46;
  const gap = 9;
  const total = choices.length * pillH + (choices.length - 1) * gap;
  const topY = boxY - 12 - total;

  choices.forEach((choice, i) => {
    const y = topY + i * (pillH + gap);
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.15);
    g.fillRoundedRect(boxX + 1, y + 3, boxW, pillH, pillH / 2);
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(boxX, y, boxW, pillH, pillH / 2);
    g.lineStyle(2, BOX_STROKE, 1);
    g.strokeRoundedRect(boxX, y, boxW, pillH, pillH / 2);
    root.add(g);

    const label = scene.add
      .text(boxX + boxW / 2, y + pillH / 2, choice.label, {
        fontSize: '18px',
        fontFamily: FONTS.title,
        fontStyle: 'bold',
        color: NAVY,
        resolution: TEXT_RESOLUTION,
        wordWrap: { width: boxW - 40 },
        align: 'center',
      })
      .setOrigin(0.5);
    root.add(label);

    g.setInteractive(
      new Phaser.Geom.Rectangle(boxX, y, boxW, pillH),
      Phaser.Geom.Rectangle.Contains,
    );
    g.on('pointerover', () => g.setAlpha(0.85));
    g.on('pointerout', () => g.setAlpha(1));
    g.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
      ev?.stopPropagation?.();
      onPick(choice.id);
    });
  });
}

/**
 * Lay out body copy word-by-word so referenced names can be a different
 * colour (Phaser has no inline rich text). A word is highlighted when its
 * letters match any highlight token (case-insensitive). Returns total height.
 */
function layoutRichText(
  scene: Phaser.Scene,
  root: Phaser.GameObjects.Container,
  o: { x: number; y: number; maxWidth: number; text: string; highlights: string[] },
): number {
  const size = 19;
  const lineH = 26;
  const spaceW = 5;
  const hl = new Set(o.highlights.map((h) => h.toLowerCase().replace(/[^a-z0-9]/gi, '')));
  const words = o.text.split(/\s+/).filter((w) => w.length > 0);

  let cursorX = o.x;
  let cursorY = o.y;
  for (const word of words) {
    const bare = word.toLowerCase().replace(/[^a-z0-9]/gi, '');
    const isHl = hl.has(bare);
    const t = scene.add.text(0, 0, word, {
      fontSize: `${size}px`,
      fontFamily: FONTS.title,
      fontStyle: 'bold',
      color: isHl ? HIGHLIGHT : NAVY,
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0, 0);
    if (cursorX + t.width > o.x + o.maxWidth && cursorX > o.x) {
      cursorX = o.x;
      cursorY += lineH;
    }
    t.setPosition(cursorX, cursorY);
    root.add(t);
    cursorX += t.width + spaceW;
  }
  return cursorY + lineH - o.y;
}

/** Stroke a dashed rounded rectangle (approximate — good enough for a pill). */
function drawDashedRoundedRect(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const dash = 5;
  const gap = 4;
  const seg = (x1: number, y1: number, x2: number, y2: number) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(1, Math.floor(len / (dash + gap)));
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    for (let i = 0; i < steps; i++) {
      const s = i * (dash + gap);
      g.beginPath();
      g.moveTo(x1 + ux * s, y1 + uy * s);
      g.lineTo(x1 + ux * Math.min(s + dash, len), y1 + uy * Math.min(s + dash, len));
      g.strokePath();
    }
  };
  // Straight edges only (corners left rounded-but-solid — reads fine at pill size).
  seg(x + r, y, x + w - r, y);
  seg(x + w, y + r, x + w, y + h - r);
  seg(x + w - r, y + h, x + r, y + h);
  seg(x, y + h - r, x, y + r);
}
