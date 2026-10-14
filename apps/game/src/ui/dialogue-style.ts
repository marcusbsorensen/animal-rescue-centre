/**
 * The dialogue overlay's colours, in one place so the runner, the demo and the
 * contrast tests read the same numbers.
 *
 * Marnie, the warden, is the player's own character: honey-amber, the shelter's
 * colour. Every guest is soft blue. A child learns "amber is us, blue is them"
 * the same way she learns "left is us, right is them" (docs/adoption-dialogue-
 * presentation-2026-05-19.md).
 *
 * Names in the body copy are coloured too: animals green, people amber. The
 * amber is a deep one (it sits on a pale-blue box, and the honey of the warden's
 * pill would be 1.6:1 there), which still reads as amber next to the navy copy.
 */
export interface PillStyle {
  /** Pill fill. */
  fill: number;
  /** The dashed border drawn inside the pill. */
  dashed: number;
  /** The name's ink. */
  ink: string;
}

export const DIALOGUE_COLOURS = {
  /** Pale-blue panel from the reference. */
  boxFill: 0xdbeef7,
  boxStroke: 0x8fbcd6,
  /** Body copy. */
  navy: '#173a4d',
  /** The down-chevron and the SKIP pill. */
  chevron: 0x2e6b8a,
  skipFill: 0x2e6b8a,
  skipInk: '#ffffff',
  /** Animal names in the body copy: A.R.C. green, deep enough to read on the box. */
  animalName: '#2d6b1f',
  /** Person names in the body copy: deep amber. */
  personName: '#8f5a00',
  warden: { fill: 0xe3b04b, dashed: 0x7a4f0a, ink: '#3b2406' } as PillStyle,
  guest: { fill: 0xa9d3ea, dashed: 0x2e6b8a, ink: '#173a4d' } as PillStyle,
  /** The choice pills a player picks from. */
  choiceFill: 0xffffff,
} as const;

export type DialogueRoleName = 'warden' | 'guest';

export function pillStyleFor(role: DialogueRoleName): PillStyle {
  return role === 'warden' ? DIALOGUE_COLOURS.warden : DIALOGUE_COLOURS.guest;
}

/** '#rrggbb' to 0xRRGGBB. */
export function hexToNumber(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}
