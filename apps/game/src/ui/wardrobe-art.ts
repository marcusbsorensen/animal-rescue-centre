import type Phaser from 'phaser';
import type { Animal } from '@arc/shared-types';
import {
  getWardrobeTextureKey,
  getGarmentForSpecies,
  parseWardrobe,
  wardrobeHex,
  canBeDressed,
  type Garment,
  type WardrobeAnchor,
} from '@arc/game-logic';
import { WardrobeAnchors, splitTextureKey } from '../lib/WardrobeAnchors';

/**
 * Drawing a garment onto an animal.
 *
 * `createAnimalSprite` hands back one game object, and every screen moves it:
 * it is tweened, flipped for the way it faces, faded, shaken. A garment drawn
 * as a second object has to follow all of that and does not. So the garment is
 * **baked into a texture** — the animal's own sprite with the garment painted
 * over it, same size as the file it came from — and the sprite is drawn from
 * that. Everything that was true of the animal's sprite stays true: the frame,
 * the bounds the scale system reads, `displayWidth`, the feet on the floor.
 * That is also why the garment is never allowed outside the animal's box (the
 * anchors are clamped there by `tools/measure-wardrobe-anchors.py`): a bigger
 * canvas would be contain-fitted smaller, which is the trap `sprite-pose-spec`
 * names for baked-in props.
 *
 * The garments are drawn in four tones and an ink line
 * (`tools/draw-garments.py`) and coloured here, at render time, with the colour
 * the child picked — the `:#hex` in `animal.wardrobe`. That is what the
 * suffix was always for.
 */

// ── The tint ─────────────────────────────────────────────────────

/**
 * The luminances the garment art is drawn in, and the ink. These pair with
 * `SHADE`, `BASE`, `LIGHT`, `CREAM` and `INK` in `tools/draw-garments.py`;
 * `__tests__/wardrobe-art.test.ts` pins the numbers.
 */
export const GARMENT_TONES = { shade: 0.62, base: 0.80, light: 0.92, cream: 0.98 } as const;
/** Cream trim is cream whatever colour was picked. */
export const CREAM_RGB: readonly [number, number, number] = [255, 246, 226];
/** The key-line, matched to the animals' own (about 8,6,6 to 28,17,10). */
export const INK_RGB: readonly [number, number, number] = [0x24, 0x18, 0x14];
const INK_LUMINANCE = 0.106;

export type Rgb = readonly [number, number, number];

/** `#rrggbb` to its three bytes. Anything unreadable is the default colour's. */
export function hexToRgb(hex: string): Rgb {
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return [0xc0, 0x39, 0x2b];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * The colour of one pixel of garment art, from the pixel's luminance (0 to 1)
 * and the colour the garment was picked in. Four fills are told apart — shade,
 * the colour itself, a lifted colour, cream — and anything darker than shade
 * is a blend towards the ink, which is what an anti-aliased edge is.
 */
export function tintGarmentLuminance(L: number, tint: Rgb): Rgb {
  const base = tint;
  const shade: Rgb = [tint[0] * 0.68, tint[1] * 0.68, tint[2] * 0.68];
  const light: Rgb = [
    tint[0] + (255 - tint[0]) * 0.32,
    tint[1] + (255 - tint[1]) * 0.32,
    tint[2] + (255 - tint[2]) * 0.32,
  ];
  const { shade: S, base: B, light: Li, cream: C } = GARMENT_TONES;
  if (L >= C) return CREAM_RGB;
  if (L >= Li) return mix(light, CREAM_RGB, (L - Li) / (1 - Li));
  if (L >= B) return mix(base, light, (L - B) / (Li - B));
  if (L >= S) return mix(shade, base, (L - S) / (B - S));
  return mix(INK_RGB, shade, Math.max(0, (L - INK_LUMINANCE) / (S - INK_LUMINANCE)));
}

/** The same, from an 8-bit pixel. */
export function tintGarmentRgb(r: number, g: number, b: number, tint: Rgb): Rgb {
  return tintGarmentLuminance((0.299 * r + 0.587 * g + 0.114 * b) / 255, tint);
}

/** A 256-entry table, so a 140,000 pixel garment costs 256 mixes and not 140,000. */
export function tintTable(tint: Rgb): Uint8ClampedArray {
  const table = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const c = tintGarmentLuminance(i / 255, tint);
    table[i * 3] = c[0];
    table[i * 3 + 1] = c[1];
    table[i * 3 + 2] = c[2];
  }
  return table;
}

// ── Where it goes ────────────────────────────────────────────────

export interface GarmentPlacement {
  /** Centre of the garment, in the sprite's own pixels. */
  cx: number;
  cy: number;
  /** Drawn size, in the sprite's own pixels. */
  w: number;
  h: number;
  /** Radians, clockwise, about the centre. */
  rotation: number;
  flip: boolean;
  /** The head, inside which the garment is erased. */
  mask?: { cx: number; cy: number; r: number };
}

/**
 * Turn an anchor — fractions of the sprite — into pixels on a sprite of
 * `sprite` size, for a garment drawing of `art` size. The drawing keeps its
 * own proportions inside the box the anchor gives.
 */
export function garmentPlacement(
  anchor: WardrobeAnchor,
  art: { width: number; height: number },
  sprite: { width: number; height: number },
): GarmentPlacement {
  const boxW = anchor.widthFrac * sprite.width;
  const boxH = anchor.heightFrac * sprite.height;
  const k = Math.min(boxW / art.width, boxH / art.height);
  const placement: GarmentPlacement = {
    cx: sprite.width / 2 + anchor.dx * sprite.width,
    cy: sprite.height / 2 + anchor.dy * sprite.height,
    w: art.width * k,
    h: art.height * k,
    rotation: (anchor.rotation * Math.PI) / 180,
    flip: !!anchor.flip,
  };
  if (
    anchor.maskDx !== undefined && anchor.maskDy !== undefined
    && anchor.maskRadiusFrac !== undefined
  ) {
    placement.mask = {
      cx: sprite.width / 2 + anchor.maskDx * sprite.width,
      cy: sprite.height / 2 + anchor.maskDy * sprite.height,
      r: anchor.maskRadiusFrac * sprite.width,
    };
  }
  return placement;
}

/**
 * Paint the garment over the animal on `ctx`, which is already the size of
 * `base`. The garment is laid on a layer of its own first, so the head can be
 * cut out of it and — for a coat — the whole thing clipped to the animal's
 * silhouette, so it lies on her instead of hanging in the air beside her.
 */
export function paintDressed(
  ctx: CanvasRenderingContext2D,
  layer: CanvasRenderingContext2D,
  base: CanvasImageSource,
  garment: CanvasImageSource,
  p: GarmentPlacement,
  kind: Garment,
  size: { width: number; height: number },
): void {
  const { width: W, height: H } = size;
  ctx.drawImage(base, 0, 0, W, H);

  layer.clearRect(0, 0, W, H);
  layer.save();
  layer.translate(p.cx, p.cy);
  layer.rotate(p.rotation);
  if (p.flip) layer.scale(-1, 1);
  layer.drawImage(garment, -p.w / 2, -p.h / 2, p.w, p.h);
  layer.restore();

  if (p.mask) {
    layer.globalCompositeOperation = 'destination-out';
    layer.beginPath();
    layer.arc(p.mask.cx, p.mask.cy, p.mask.r, 0, Math.PI * 2);
    layer.fill();
  }
  if (kind === 'coat') {
    layer.globalCompositeOperation = 'destination-in';
    layer.drawImage(base, 0, 0, W, H);
  }
  layer.globalCompositeOperation = 'source-over';

  ctx.drawImage(layer.canvas, 0, 0);
}

// ── Textures ─────────────────────────────────────────────────────

/** Texture key of a garment coloured `hex`: `dog-coat@c0392b`. */
export function tintedGarmentKey(garmentKey: string, hex: string): string {
  return `${garmentKey}@${hex.replace('#', '').toLowerCase()}`;
}

/** Texture key of an animal's sprite with her garment painted on. */
export function dressedKey(baseKey: string, garmentKey: string, hex: string): string {
  return `${baseKey}+${tintedGarmentKey(garmentKey, hex)}`;
}

/** Can this scene's texture manager make a canvas? A unit-test stand-in cannot. */
function canPaint(scene: Phaser.Scene): boolean {
  const t = scene.textures as unknown as { createCanvas?: unknown; get?: unknown } | undefined;
  return !!t && typeof t.createCanvas === 'function' && typeof t.get === 'function'
    && typeof document !== 'undefined';
}

function sourceOf(scene: Phaser.Scene, key: string): (CanvasImageSource & { width: number; height: number }) | null {
  const src = scene.textures.get(key)?.getSourceImage?.();
  if (!src) return null;
  return src as CanvasImageSource & { width: number; height: number };
}

/**
 * The garment art, coloured. Returns the key of a canvas texture the same
 * size as the art, or null when the art is not loaded — which is what a
 * species without garment art, or a garment still in flight, looks like to
 * the caller, who then draws no garment rather than an empty box.
 */
export function ensureTintedGarment(
  scene: Phaser.Scene,
  garmentKey: string,
  hex: string,
): string | null {
  if (!scene.textures.exists(garmentKey) || !canPaint(scene)) return null;
  const key = tintedGarmentKey(garmentKey, hex);
  if (scene.textures.exists(key)) return key;
  try {
    const src = sourceOf(scene, garmentKey);
    if (!src) return null;
    const w = src.width;
    const h = src.height;
    const tex = scene.textures.createCanvas(key, w, h);
    if (!tex) return null;
    const ctx = tex.getContext();
    ctx.drawImage(src, 0, 0);
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const table = tintTable(hexToRgb(hex));
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const L = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
      d[i] = table[L * 3];
      d[i + 1] = table[L * 3 + 1];
      d[i + 2] = table[L * 3 + 2];
    }
    ctx.putImageData(img, 0, 0);
    tex.refresh();
    return key;
  } catch {
    return null;
  }
}

/**
 * Make (or find) the animal's sprite with her garment painted on, and return
 * its key — or null, and she is drawn as she is. Null is the answer for an
 * animal with nothing on, for one in her arriving box, for a species with no
 * garment art yet, and for anything this scene cannot paint.
 *
 * `baseKey` is the texture the sprite layer chose, `dog-husky-sheltered` or
 * `dog-sheltered`, and the anchor is looked up from that — not from the
 * animal's variant — because the anchor belongs to the drawing.
 */
export function ensureDressedTexture(
  scene: Phaser.Scene,
  baseKey: string,
  animal: Pick<Animal, 'species' | 'wardrobe'>,
): string | null {
  const worn = parseWardrobe(animal.wardrobe);
  if (!worn || !canBeDressed(animal.species) || !canPaint(scene)) return null;
  const { pose } = splitTextureKey(animal.species, baseKey);
  // Arriving animals are in their boxes, and are not yet anyone's to dress.
  if (pose === 'arriving') return null;

  const garmentKey = getWardrobeTextureKey(animal.species);
  const hex = wardrobeHex(animal.wardrobe);
  const key = dressedKey(baseKey, garmentKey, hex);
  if (scene.textures.exists(key)) return key;

  let made = false;
  try {
    const tintedKey = ensureTintedGarment(scene, garmentKey, hex);
    if (!tintedKey) return null;
    const base = sourceOf(scene, baseKey);
    const garment = sourceOf(scene, tintedKey);
    if (!base || !garment) return null;
    const size = { width: base.width, height: base.height };

    const layerCanvas = document.createElement('canvas');
    layerCanvas.width = size.width;
    layerCanvas.height = size.height;
    const layer = layerCanvas.getContext('2d');
    if (!layer) return null;

    const tex = scene.textures.createCanvas(key, size.width, size.height);
    if (!tex) return null;
    made = true;

    const anchor = WardrobeAnchors.getInstance().get(animal.species, baseKey);
    const placement = garmentPlacement(anchor, garment, size);
    paintDressed(
      tex.getContext(), layer, base, garment, placement,
      getGarmentForSpecies(animal.species), size,
    );
    tex.refresh();
    return key;
  } catch {
    // A half-painted texture under this key would be answered as the real one
    // from now on.
    if (made) scene.textures.remove(key);
    return null;
  }
}
