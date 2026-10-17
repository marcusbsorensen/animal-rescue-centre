/**
 * The clue a child picks for their secret code at signup: a code from a
 * fixed list, never typed text.
 *
 * A copy of packages/game-logic/src/pin-hints.ts, because Edge Functions
 * cannot import from the workspace packages. `pin-hints.test.ts` there
 * fails if the two lists differ.
 */
export const PIN_HINT_CHOICES = [
  { code: 'birthday', text: 'A birthday' },
  { code: 'year', text: 'A year' },
  { code: 'pet', text: 'About a pet' },
  { code: 'shirt', text: 'A shirt number' },
  { code: 'pattern', text: 'A shape on the keypad' },
  { code: 'favourite', text: 'My favourite numbers' },
] as const;

export function isPinHintCode(value: unknown): value is string {
  return typeof value === 'string' && PIN_HINT_CHOICES.some((c) => c.code === value);
}

/** The words for a code, or null for anything not on the list. */
export function pinHintText(code: unknown): string | null {
  return PIN_HINT_CHOICES.find((c) => c.code === code)?.text ?? null;
}
