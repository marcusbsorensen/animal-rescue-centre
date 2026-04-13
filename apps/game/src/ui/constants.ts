// Shared UI constants — colours derived from the A.R.C. logo
//
//   Logo palette:
//     🟢 Green lettering  → #5AAE4A (primary)
//     🔴 Red heart/paw    → #D44040 (accent)
//     🟠 Orange outlines  → #D4783C (warm)
//     🟤 Brown text        → #3a2e22 (text)
//     🟡 Cream background → #fef9ef (bg)

export const COLOURS = {
  // ── Brand greens (from "A.R.C." lettering) ──
  primary: '#5AAE4A',
  primaryDark: '#4A9438',
  primaryLight: '#7CC76E',

  // ── Brand reds (from heart/paw) ──
  accent: '#D44040',
  accentDark: '#B83030',
  accentLight: '#E06060',

  // ── Brand orange (from outlines/subtitle) ──
  warm: '#D4783C',
  warmDark: '#B86428',
  warmLight: '#E09050',

  // ── Neutrals ──
  bg: '#fef9ef',
  bgDark: '#f5ebe0',
  text: '#3a2e22',
  textLight: '#6b5a4a',
  white: '#ffffff',
  error: '#c0392b',
  inputBg: '#f5efe4',
  inputBorder: '#d4c8b8',
} as const;

export const FONTS = {
  title: '"Nunito", "Baloo 2", "Fredoka", system-ui, -apple-system, sans-serif',
  body: '"Nunito", system-ui, -apple-system, sans-serif',
} as const;

export const AVATAR_EMOJIS = [
  '🐱', '🐶', '🐰', '🦊', '🐻', '🐼', '🐨', '🐸',
  '🦉', '🐝', '🐞', '🦋', '🐢', '🐙', '🐬', '🦩',
  '🐧', '🐴', '🦜', '🐿️', '🦇', '🐍', '🐠', '🦎',
  '🐾', '🦔', '🐳', '🦈', '🦆', '🐛',
] as const;

export const AVATAR_BG_COLOURS = [
  '#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9',
  '#BAE1FF', '#E8BAFF', '#FFB3E6', '#B3FFE6',
  '#FFD9B3', '#D9B3FF', '#B3D9FF', '#C9FFB3',
] as const;

/**
 * Pluralise a species name correctly.
 */
export function pluralSpecies(species: string, count: number): string {
  if (count === 1) return species;
  if (species === 'bunny') return 'bunnies';
  if (species === 'fox') return 'foxes';
  return species + 's';
}

export const GIFT_MESSAGES = [
  { code: 'hi', text: 'Hi from me!' },
  { code: 'cool_pets', text: 'Your pets are cool!' },
  { code: 'nice_day', text: 'Hope you\'re having a nice day!' },
  { code: 'well_done', text: 'Well done on your rescue centre!' },
  { code: 'thanks', text: 'Thanks for being my friend!' },
  { code: 'miss_you', text: 'Come play soon!' },
  { code: 'congrats', text: 'Congratulations!' },
  { code: 'good_job', text: 'Good job!' },
  { code: 'for_you', text: 'This is for you!' },
  { code: 'surprise', text: 'Surprise!' },
  { code: 'share', text: 'Wanted to share this with you!' },
  { code: 'happy', text: 'This made me think of you!' },
  { code: 'best_friend', text: 'You\'re my best friend!' },
  { code: 'keep_going', text: 'Keep going, you\'re doing great!' },
  { code: 'play_together', text: 'Let\'s keep rescuing animals!' },
] as const;
