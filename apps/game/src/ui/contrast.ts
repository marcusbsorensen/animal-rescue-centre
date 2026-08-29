/**
 * Contrast helpers — pure, no Phaser, so they can be unit-tested.
 *
 * Name pills were drawn in white on the species colour, which is fine for
 * dog and bat and fails badly for everything else: a white name on the
 * light-grey bunny pill measured 1.50:1 against a 4.5:1 threshold. In a
 * game whose whole emotional proposition is *this animal has a name*, the
 * name is the wrong thing to lose — and a child does not think "poor
 * contrast", she thinks the bunny has not got a name yet.
 *
 * Pick the ink from the background's luminance instead of hardcoding it.
 */

/** WCAG relative luminance for a 0xRRGGBB integer. */
export function relativeLuminance(colour: number): number {
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const r = channel((colour >> 16) & 0xff);
  const g = channel((colour >> 8) & 0xff);
  const b = channel(colour & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two 0xRRGGBB integers. Always >= 1. */
export function contrastRatio(a: number, b: number): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Dark ink used on light backgrounds — matches COLOURS.text. */
export const INK_DARK = '#3a2e22';
/** Light ink used on dark backgrounds. */
export const INK_LIGHT = '#ffffff';

/**
 * The more readable of the two inks on `background`. Returns a CSS colour
 * string, ready for a Phaser text style.
 */
export function inkOn(background: number): string {
  const dark = contrastRatio(background, 0x3a2e22);
  const light = contrastRatio(background, 0xffffff);
  return dark >= light ? INK_DARK : INK_LIGHT;
}

/** Blend `colour` towards `towards` by t (0 = unchanged, 1 = fully towards). */
function mix(colour: number, towards: number, t: number): number {
  const ch = (shift: number) => {
    const a = (colour >> shift) & 0xff;
    const b = (towards >> shift) & 0xff;
    return Math.round(a + (b - a) * t) & 0xff;
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/**
 * A legible pill for a species colour.
 *
 * Picking the better of two inks is not enough on its own: fox, snake and
 * hedgehog sit at a middle luminance where *neither* white nor dark ink
 * reaches 4.5:1 (measured 4.12, 3.81 and 4.00 at best). For those the pill
 * itself has to move.
 *
 * Both directions are tried — darkening the pill under white ink, and
 * lightening it under dark ink — and whichever reaches the threshold with
 * the smaller shift wins, so the species stays recognisably its own colour
 * rather than being flattened to a neutral chip.
 */
export function pillFor(
  colour: number,
  target = 4.5,
): { fill: number; ink: string } {
  if (contrastRatio(colour, 0x3a2e22) >= target) return { fill: colour, ink: INK_DARK };
  if (contrastRatio(colour, 0xffffff) >= target) return { fill: colour, ink: INK_LIGHT };

  const search = (towards: number, ink: number): { t: number; fill: number } | null => {
    for (let t = 0.05; t <= 1.0001; t += 0.05) {
      const fill = mix(colour, towards, t);
      if (contrastRatio(fill, ink) >= target) return { t, fill };
    }
    return null;
  };
  const darker = search(0x000000, 0xffffff); // darken under white ink
  const lighter = search(0xffffff, 0x3a2e22); // lighten under dark ink

  if (darker && (!lighter || darker.t <= lighter.t)) {
    return { fill: darker.fill, ink: INK_LIGHT };
  }
  if (lighter) return { fill: lighter.fill, ink: INK_DARK };
  return { fill: 0x000000, ink: INK_LIGHT };
}
