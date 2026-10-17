import { describe, it, expect } from 'vitest';
import { contrastRatio } from '../contrast';
import { DIALOGUE_COLOURS, hexToNumber, pillStyleFor } from '../dialogue-style';

/** Hue in degrees, 0-360, of a 0xRRGGBB colour. */
function hue(colour: number): number {
  const r = ((colour >> 16) & 255) / 255;
  const g = ((colour >> 8) & 255) / 255;
  const b = (colour & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

describe('dialogue colours', () => {
  it('gives the warden the honey-amber pill and every guest soft blue', () => {
    const warden = pillStyleFor('warden');
    const guest = pillStyleFor('guest');
    expect(hue(warden.fill)).toBeGreaterThanOrEqual(30);
    expect(hue(warden.fill)).toBeLessThanOrEqual(50);
    expect(hue(guest.fill)).toBeGreaterThanOrEqual(190);
    expect(hue(guest.fill)).toBeLessThanOrEqual(215);
    expect(warden.fill).not.toBe(guest.fill);
  });

  it('can be read: every name pill is at least 4.5:1 ink on fill', () => {
    for (const role of ['warden', 'guest'] as const) {
      const p = pillStyleFor(role);
      expect(contrastRatio(p.fill, hexToNumber(p.ink)), role).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('shows the dashed border against the pill fill', () => {
    for (const role of ['warden', 'guest'] as const) {
      const p = pillStyleFor(role);
      expect(contrastRatio(p.fill, p.dashed), role).toBeGreaterThanOrEqual(3);
    }
  });

  it('can be read: body copy and both name colours are at least 4.5:1 on the box', () => {
    const box = DIALOGUE_COLOURS.boxFill;
    expect(contrastRatio(box, hexToNumber(DIALOGUE_COLOURS.navy))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(box, hexToNumber(DIALOGUE_COLOURS.animalName))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(box, hexToNumber(DIALOGUE_COLOURS.personName))).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps animal names green and person names amber, and the two apart', () => {
    const animal = hexToNumber(DIALOGUE_COLOURS.animalName);
    const person = hexToNumber(DIALOGUE_COLOURS.personName);
    expect(hue(animal)).toBeGreaterThanOrEqual(90);
    expect(hue(animal)).toBeLessThanOrEqual(140);
    expect(hue(person)).toBeGreaterThanOrEqual(30);
    expect(hue(person)).toBeLessThanOrEqual(50);
  });
});
