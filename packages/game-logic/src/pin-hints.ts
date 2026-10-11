/**
 * The clue a child picks for their secret code at signup.
 *
 * It says where the four numbers come from, not what they are, and it is
 * picked from this list, never typed. The forgot-PIN screen shows the
 * words back. Only the code is stored (`users.pin_hint_code`).
 *
 * Copies that must match this list, checked by `pin-hints.test.ts`:
 *   - apps/game/public/admin/signup.html (static HTML, no module loader)
 *   - supabase/functions/_shared/pin-hints.ts (Deno)
 *   - the CHECK constraint in supabase/migrations/00010_pin_hint_choice.sql
 *
 * Nothing on the list points at where a child lives or can be found: no
 * phone numbers, house numbers or schools.
 */
export const PIN_HINT_CHOICES = [
  { code: 'birthday', text: 'A birthday' },
  { code: 'year', text: 'A year' },
  { code: 'pet', text: 'About a pet' },
  { code: 'shirt', text: 'A shirt number' },
  { code: 'pattern', text: 'A shape on the keypad' },
  { code: 'favourite', text: 'My favourite numbers' },
] as const;

export type PinHintCode = (typeof PIN_HINT_CHOICES)[number]['code'];

export function isPinHintCode(value: unknown): value is PinHintCode {
  return typeof value === 'string' && PIN_HINT_CHOICES.some((c) => c.code === value);
}

/** The words for a code, or null for anything not on the list. */
export function pinHintText(code: unknown): string | null {
  return PIN_HINT_CHOICES.find((c) => c.code === code)?.text ?? null;
}
