import Phaser from 'phaser';
import { roleOf } from '@arc/game-logic';
import type { DialogueBeat, DialogueSequence, DialogueChoice } from '@arc/game-logic';
import { FONTS, TEXT_RESOLUTION } from './constants';
import { DIALOGUE_COLOURS, pillStyleFor, type PillStyle } from './dialogue-style';
import { computeLayout, type DialogueLayout, type Rect } from './dialogue-layout';
import { ensureMistTexture } from './dialogue-mist';
import type { PortraitCrop } from './dialogue-framing';
import { readSafeAreaInsets } from './safe-area';
import { getSafeAreaLeft } from './layout';

/**
 * DialogueRunner — a staged cutscene-dialogue overlay.
 *
 * Matches the reference (docs/adoption-dialogue-presentation-2026-05-19.md):
 * a pale mist over the world, a large waist-up portrait standing at the
 * speaker's edge, a dashed name pill on the dialogue box, short body copy with
 * referenced names coloured, a down-chevron / tap-to-advance, and a SKIP pill.
 *
 * Generic on purpose: beats carry their own `side`, `speaker` and
 * `expression`, so a two-speaker conversation alternates edges naturally and
 * the same runner can drive apprentice / return-visit / vet dialogues later.
 *
 * The runner never throws into the caller's flow — `onComplete` fires exactly
 * once on finish OR skip OR an empty sequence, so a dialogue can never strand
 * whatever comes next (e.g. an adoption).
 *
 * Voice: a beat whose `resolveVoice` answers with a sound plays it, and one
 * that answers with nothing stays silent. Advancing, SKIP and tearing the
 * overlay down all stop whatever is playing.
 */

const NAVY = DIALOGUE_COLOURS.navy;

export interface DialoguePortrait {
  /** Texture cache key to draw if present. */
  key: string;
  /** Optional URL to lazily load when `key` isn't cached yet. */
  url?: string;
  /** Secondary cached key to draw if `key` fails to load (e.g. neutral behind an expression). */
  altKey?: string;
  /** Fallback display name for the painted-initials chip if no image is available. */
  fallbackName: string;
  /**
   * The waist-up part of the picture to show, as fractions of it. Full-figure
   * catalogue shots are cropped to this; without one the whole picture shows.
   */
  crop?: PortraitCrop;
}

/** A recorded line. `url` is loaded on demand when `key` is not in the audio cache yet. */
export interface DialogueVoice {
  key: string;
  url?: string;
  volume?: number;
}

export interface RunDialogueOptions {
  onComplete: () => void;
  /** Resolve the portrait (key + optional url) for a beat. */
  resolvePortrait: (beat: DialogueBeat) => DialoguePortrait;
  /**
   * Optional: the recorded line for a beat. A bare string is an audio-cache
   * key that is already loaded. Answer `undefined` for a beat with no
   * recording and it stays silent.
   */
  resolveVoice?: (beat: DialogueBeat) => string | DialogueVoice | undefined;
  /** Optional: called with the chosen id when the player picks a choice pill. */
  onChoice?: (choiceId: string, beat: DialogueBeat) => void;
}

/** What is on screen, as numbers. Read by the Playwright checks. */
export interface DialogueSnapshot {
  beat: number;
  beatCount: number;
  viewport: { w: number; h: number };
  side: 'left' | 'right';
  role: 'warden' | 'guest';
  speakerId: string;
  lineId: string | null;
  text: string;
  portrait: Rect;
  portraitIsImage: boolean;
  box: Rect;
  namePill: Rect & { fill: number; dashed: number; ink: string };
  skip: Rect;
  choices: Rect[];
  words: Array<{ text: string; kind: 'animal' | 'person' | null; colour: string; rect: Rect }>;
  voice: string | null;
}

export interface DialogueHandle {
  destroy: () => void;
  /** Move on one beat, as a tap on the box does. */
  advance: () => void;
  /** Jump to the end, as SKIP does. */
  skip: () => void;
}

/** The name the runner's root container carries, for tests that look it up. */
export const DIALOGUE_ROOT_NAME = 'dialogue-root';

function normaliseVoice(v: string | DialogueVoice | undefined): DialogueVoice | undefined {
  if (!v) return undefined;
  return typeof v === 'string' ? { key: v } : v;
}

/**
 * Mount the dialogue overlay on `scene` (already visible). Returns a handle
 * with `destroy()` for tearing it down early.
 */
export function runDialogue(
  scene: Phaser.Scene,
  sequence: DialogueSequence,
  opts: RunDialogueOptions,
): DialogueHandle {
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
    return { destroy: () => {}, advance: () => {}, skip: () => {} };
  }

  const root = scene.add
    .container(0, 0)
    .setDepth(10_000)
    .setScrollFactor(0)
    .setName(DIALOGUE_ROOT_NAME);
  let index = 0;
  let onResize: (() => void) | null = null;
  let currentVoice: Phaser.Sound.BaseSound | null = null;
  let currentVoiceKey: string | null = null;

  function stopVoice() {
    if (!currentVoice) return;
    try {
      currentVoice.stop();
      currentVoice.destroy();
    } catch { /* non-fatal */ }
    currentVoice = null;
    currentVoiceKey = null;
  }

  function cleanup() {
    stopVoice();
    if (onResize) scene.scale.off('resize', onResize);
    onResize = null;
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
    root.destroy(true);
  }

  // If the scene itself goes away mid-conversation, stop the audio and let go
  // of the listeners. Nothing proceeds: whoever started the dialogue left too.
  function onShutdown() {
    finished = true;
    stopVoice();
    if (onResize) scene.scale.off('resize', onResize);
    onResize = null;
  }
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, onShutdown);

  // Preload anything not yet cached (portraits and recorded lines), then show
  // the first beat. A file that fails to load is not fatal: a portrait falls
  // back to the initials chip, a line stays silent.
  let queued = 0;
  for (const beat of sequence.beats) {
    const p = opts.resolvePortrait(beat);
    if (p.url && !scene.textures.exists(p.key)) {
      scene.load.image(p.key, p.url);
      queued += 1;
    }
    const v = normaliseVoice(opts.resolveVoice?.(beat));
    if (v?.url && !scene.cache.audio.exists(v.key)) {
      scene.load.audio(v.key, v.url);
      queued += 1;
    }
  }

  const start = () => {
    if (finished) return;
    onResize = () => render();
    scene.scale.on('resize', onResize);
    enterBeat();
  };

  if (queued > 0) {
    scene.load.once(Phaser.Loader.Events.COMPLETE, start);
    scene.load.start();
  } else {
    start();
  }

  /** Show the current beat and play its line. A resize only redraws. */
  function enterBeat() {
    render();
    playVoice(sequence.beats[index]);
  }

  function playVoice(beat: DialogueBeat) {
    stopVoice();
    const v = normaliseVoice(opts.resolveVoice?.(beat));
    if (v && scene.cache.audio.exists(v.key)) {
      try {
        const sound = scene.sound.add(v.key, { volume: v.volume ?? 0.9 });
        sound.once(Phaser.Sound.Events.COMPLETE, () => {
          if (currentVoice !== sound) return;
          sound.destroy();
          currentVoice = null;
          currentVoiceKey = null;
          const snap = root.getData('snapshot') as DialogueSnapshot | undefined;
          if (snap) snap.voice = null;
        });
        sound.play();
        currentVoice = sound;
        currentVoiceKey = v.key;
      } catch { /* playback blocked or failed: stay silent */ }
    }
    const snap = root.getData('snapshot') as DialogueSnapshot | undefined;
    if (snap) snap.voice = currentVoiceKey;
  }

  function render() {
    if (finished) return;
    root.removeAll(true);
    const W = scene.scale.width;
    const H = scene.scale.height;
    const beat = sequence.beats[index];
    const p = opts.resolvePortrait(beat);
    const role = roleOf(beat);
    const hasChoices = !!beat.choices && beat.choices.length > 0;

    const art = pickPortraitArt(scene, p);
    const insets = readInsets();
    const layout = computeLayout({
      width: W,
      height: H,
      side: beat.side,
      portraitAspect: art.aspect,
      choiceCount: hasChoices ? beat.choices!.length : 0,
      safeLeft: insets.left,
      safeRight: insets.right,
    });

    // ── Pale mist over the world (swallows taps on what is behind) ──
    const mist = scene.add
      .image(0, 0, ensureMistTexture(scene))
      .setOrigin(0, 0)
      .setDisplaySize(W, H)
      .setName('dialogue-mist')
      .setInteractive();
    root.add(mist);

    // ── Portrait, standing at the speaker's edge ──
    drawPortrait(scene, root, art, p.fallbackName, layout.portrait);

    // ── Box ──
    const { box } = layout;
    const g = scene.add.graphics().setName('dialogue-box');
    g.fillStyle(0x000000, 0.16);
    g.fillRoundedRect(box.x + 2, box.y + 4, box.w, box.h, 18);
    g.fillStyle(DIALOGUE_COLOURS.boxFill, 1);
    g.fillRoundedRect(box.x, box.y, box.w, box.h, 18);
    g.lineStyle(2, DIALOGUE_COLOURS.boxStroke, 1);
    g.strokeRoundedRect(box.x, box.y, box.w, box.h, 18);
    root.add(g);
    // A choice beat must be answered by picking a pill — the box itself only
    // advances on linear beats.
    if (!hasChoices) {
      g.setInteractive(
        new Phaser.Geom.Rectangle(box.x, box.y, box.w, box.h),
        Phaser.Geom.Rectangle.Contains,
      );
      g.on('pointerdown', advance);
    }

    // ── Name pill (dashed inner border, on the box top edge, speaker's side) ──
    const pill = drawNamePill(scene, root, beat.speaker, beat.side, role, layout);

    // ── Body copy with coloured names ──
    const words = layoutRichText(scene, root, layout, beat);

    if (hasChoices) {
      drawChoices(scene, root, beat.choices!, layout, (choiceId) => {
        opts.onChoice?.(choiceId, beat);
        advance();
      });
    } else {
      // ── Down-chevron (centre, box bottom edge) ──
      const chevron = scene.add.graphics().setName('dialogue-chevron');
      const ccx = box.x + box.w / 2;
      const ccy = box.y + box.h - 2;
      chevron.fillStyle(DIALOGUE_COLOURS.chevron, 1);
      chevron.fillTriangle(ccx - 9, ccy - 5, ccx + 9, ccy - 5, ccx, ccy + 6);
      root.add(chevron);
    }

    // ── SKIP pill (bottom-right of the box) ──
    drawSkip(scene, root, layout.skip, skip);

    const snapshot: DialogueSnapshot = {
      beat: index,
      beatCount: sequence.beats.length,
      viewport: { w: W, h: H },
      side: beat.side,
      role,
      speakerId: beat.speakerId,
      lineId: beat.lineId ?? null,
      text: beat.text,
      portrait: layout.portrait,
      portraitIsImage: art.key !== null,
      box: layout.box,
      namePill: pill,
      skip: layout.skip,
      choices: layout.choices,
      words,
      voice: currentVoiceKey,
    };
    root.setData('snapshot', snapshot);
  }

  function advance() {
    if (finished) return;
    if (index >= sequence.beats.length - 1) {
      finish();
    } else {
      index += 1;
      enterBeat();
    }
  }

  function skip() {
    finish();
  }

  return {
    destroy: () => {
      if (finished) return;
      finished = true;
      cleanup();
    },
    advance,
    skip,
  };
}

// ── Helpers ──────────────────────────────────────────────────────

function readInsets(): { left: number; right: number } {
  try {
    const i = readSafeAreaInsets();
    return { left: Math.max(i.left, getSafeAreaLeft()), right: i.right };
  } catch {
    return { left: 0, right: 0 };
  }
}

interface PortraitArt {
  /** The texture to draw, or null for the initials chip. */
  key: string | null;
  /** Source pixels to show: the crop, or the whole picture. */
  src: { x: number; y: number; w: number; h: number };
  /** Width over height of what is shown. */
  aspect: number;
}

function pickPortraitArt(scene: Phaser.Scene, p: DialoguePortrait): PortraitArt {
  const key = scene.textures.exists(p.key)
    ? p.key
    : p.altKey && scene.textures.exists(p.altKey)
      ? p.altKey
      : null;
  if (!key) return { key: null, src: { x: 0, y: 0, w: 1, h: 1 }, aspect: 1 };
  const img = scene.textures.get(key).getSourceImage() as { width?: number; height?: number };
  const sw = img?.width ?? 512;
  const sh = img?.height ?? 512;
  // The crop belongs to the picture it was measured for. If the neutral
  // picture is standing in for a missing expression, its crop is not the
  // greeting's crop, so only apply ours when we are drawing our own key.
  const crop = key === p.key ? p.crop : undefined;
  const src = crop
    ? { x: crop[0] * sw, y: crop[1] * sh, w: crop[2] * sw, h: crop[3] * sh }
    : { x: 0, y: 0, w: sw, h: sh };
  return { key, src, aspect: src.w / src.h };
}

function drawPortrait(
  scene: Phaser.Scene,
  root: Phaser.GameObjects.Container,
  art: PortraitArt,
  fallbackName: string,
  rect: Rect,
): void {
  if (art.key) {
    // setCrop keeps the picture's own coordinates: the cropped region is drawn
    // where it sits in the full frame, so the frame is placed to put the
    // crop's top-left at the rect's top-left.
    const s = rect.h / art.src.h;
    const img = scene.add
      .image(rect.x - art.src.x * s, rect.y - art.src.y * s, art.key)
      .setOrigin(0, 0)
      .setScale(s)
      .setCrop(art.src.x, art.src.y, art.src.w, art.src.h)
      .setName('dialogue-portrait');
    root.add(img);
    return;
  }
  // Painted-initials chip fallback (mirrors AdoptionMatchScene).
  const size = Math.min(rect.w, rect.h);
  const cx = rect.x + rect.w / 2;
  const bottomY = rect.y + rect.h;
  const frame = scene.add.graphics().setName('dialogue-portrait');
  frame.fillStyle(0xb88a37, 1);
  frame.fillRoundedRect(cx - size / 2, bottomY - size, size, size, 12);
  frame.fillStyle(0xfff3d8, 1);
  frame.fillRoundedRect(cx - size / 2 + 4, bottomY - size + 4, size - 8, size - 8, 10);
  root.add(frame);
  const initials = fallbackName
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
  role: 'warden' | 'guest',
  layout: DialogueLayout,
): Rect & PillStyle {
  const style = pillStyleFor(role);
  const { box } = layout;
  const label = scene.add
    .text(0, 0, name, {
      fontSize: `${layout.tall ? 20 : 18}px`,
      fontFamily: FONTS.title,
      fontStyle: 'bold',
      color: style.ink,
      resolution: TEXT_RESOLUTION,
    })
    .setOrigin(0.5)
    .setName('dialogue-name');
  const pillH = layout.namePillH;
  const pillW = Math.min(Math.max(96, label.width + 40), box.w - 40);
  const pillX = side === 'left' ? box.x + 20 : box.x + box.w - 20 - pillW;
  const pillY = box.y - pillH / 2;

  const g = scene.add.graphics().setName('dialogue-name-pill');
  g.fillStyle(0x000000, 0.15);
  g.fillRoundedRect(pillX + 1, pillY + 2, pillW, pillH, pillH / 2);
  g.fillStyle(style.fill, 1);
  g.fillRoundedRect(pillX, pillY, pillW, pillH, pillH / 2);
  // Dashed inner border, in the pill's own darker tone so it shows on a pale fill.
  g.lineStyle(2, style.dashed, 1);
  drawDashedRoundedRect(g, pillX + 5, pillY + 5, pillW - 10, pillH - 10, (pillH - 10) / 2);
  root.add(g);

  label.setPosition(pillX + pillW / 2, pillY + pillH / 2);
  root.add(label);
  return { x: pillX, y: pillY, w: pillW, h: pillH, ...style };
}

function drawSkip(
  scene: Phaser.Scene,
  root: Phaser.GameObjects.Container,
  r: Rect,
  onSkip: () => void,
): void {
  const g = scene.add.graphics().setName('dialogue-skip');
  g.fillStyle(0x000000, 0.15);
  g.fillRoundedRect(r.x + 1, r.y + 2, r.w, r.h, r.h / 2);
  g.fillStyle(DIALOGUE_COLOURS.skipFill, 1);
  g.fillRoundedRect(r.x, r.y, r.w, r.h, r.h / 2);
  root.add(g);
  const label = scene.add
    .text(r.x + r.w / 2, r.y + r.h / 2, 'SKIP ›', {
      fontSize: '16px',
      fontFamily: FONTS.title,
      fontStyle: 'bold',
      color: DIALOGUE_COLOURS.skipInk,
      resolution: TEXT_RESOLUTION,
    })
    .setOrigin(0.5);
  root.add(label);
  g.setInteractive(new Phaser.Geom.Rectangle(r.x, r.y, r.w, r.h), Phaser.Geom.Rectangle.Contains);
  g.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
    ev?.stopPropagation?.();
    onSkip();
  });
}

/**
 * Choice pills — tappable options on the far side of the speaker, above the
 * box, in the same rounded language as the rest of the overlay. Picking one
 * calls `onPick(choiceId)`.
 */
function drawChoices(
  scene: Phaser.Scene,
  root: Phaser.GameObjects.Container,
  choices: DialogueChoice[],
  layout: DialogueLayout,
  onPick: (choiceId: string) => void,
): void {
  choices.forEach((choice, i) => {
    const r = layout.choices[i];
    if (!r) return;
    const g = scene.add.graphics().setName(`dialogue-choice-${i}`);
    g.fillStyle(0x000000, 0.15);
    g.fillRoundedRect(r.x + 1, r.y + 3, r.w, r.h, r.h / 2);
    g.fillStyle(DIALOGUE_COLOURS.choiceFill, 1);
    g.fillRoundedRect(r.x, r.y, r.w, r.h, r.h / 2);
    g.lineStyle(2, DIALOGUE_COLOURS.boxStroke, 1);
    g.strokeRoundedRect(r.x, r.y, r.w, r.h, r.h / 2);
    root.add(g);

    const label = scene.add
      .text(r.x + r.w / 2, r.y + r.h / 2, choice.label, {
        fontSize: `${layout.choiceFont}px`,
        fontFamily: FONTS.title,
        fontStyle: 'bold',
        color: NAVY,
        resolution: TEXT_RESOLUTION,
        wordWrap: { width: r.w - 36 },
        align: 'center',
      })
      .setOrigin(0.5);
    root.add(label);

    g.setInteractive(new Phaser.Geom.Rectangle(r.x, r.y, r.w, r.h), Phaser.Geom.Rectangle.Contains);
    g.on('pointerover', () => g.setAlpha(0.85));
    g.on('pointerout', () => g.setAlpha(1));
    g.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
      ev?.stopPropagation?.();
      onPick(choice.id);
    });
  });
}

const bareWord = (w: string): string => w.toLowerCase().replace(/[^a-z0-9]/gi, '');

/** The set of bare words a list of (possibly multi-word) names is made of. */
function wordSet(names: string[] | undefined): Set<string> {
  const out = new Set<string>();
  for (const n of names ?? []) {
    for (const w of n.split(/\s+/)) {
      const b = bareWord(w);
      if (b) out.add(b);
    }
  }
  return out;
}

/**
 * Lay out body copy word-by-word so referenced names can be a different
 * colour (Phaser has no inline rich text). Animal names are green, person names
 * amber; a word is coloured when its letters match a name (case-insensitive).
 * Returns every word with its colour and where it landed.
 */
function layoutRichText(
  scene: Phaser.Scene,
  root: Phaser.GameObjects.Container,
  layout: DialogueLayout,
  beat: DialogueBeat,
): DialogueSnapshot['words'] {
  const size = layout.bodyFont;
  const lineH = layout.bodyLine;
  const spaceW = Math.round(size * 0.27);
  const animals = wordSet(beat.highlights);
  const people = wordSet(beat.people);
  const words = beat.text.split(/\s+/).filter((w) => w.length > 0);

  const placed: DialogueSnapshot['words'] = [];
  let cursorX = layout.body.x;
  let cursorY = layout.body.y;
  for (const word of words) {
    const bare = bareWord(word);
    // A name that is both (it should not be) reads as a person.
    const kind: 'animal' | 'person' | null = people.has(bare) ? 'person' : animals.has(bare) ? 'animal' : null;
    const colour =
      kind === 'person' ? DIALOGUE_COLOURS.personName
        : kind === 'animal' ? DIALOGUE_COLOURS.animalName
          : NAVY;
    const t = scene.add.text(0, 0, word, {
      fontSize: `${size}px`,
      fontFamily: FONTS.title,
      fontStyle: 'bold',
      color: colour,
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0, 0).setName('dialogue-word');
    if (cursorX + t.width > layout.body.x + layout.body.w && cursorX > layout.body.x) {
      cursorX = layout.body.x;
      cursorY += lineH;
    }
    t.setPosition(cursorX, cursorY);
    root.add(t);
    placed.push({
      text: word,
      kind,
      colour,
      rect: { x: cursorX, y: cursorY, w: t.width, h: t.height },
    });
    cursorX += t.width + spaceW;
  }
  return placed;
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
