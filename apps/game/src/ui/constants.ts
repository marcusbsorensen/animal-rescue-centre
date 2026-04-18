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
  primary: '#3D8A2E',
  primaryDark: '#2D6B1F',
  primaryLight: '#7CC76E',

  // ── Brand reds (from heart/paw) ──
  accent: '#A82020',
  accentDark: '#B83030',
  accentLight: '#E06060',

  // ── Brand orange (from outlines/subtitle) ──
  warm: '#A85A28',
  warmDark: '#B86428',
  warmLight: '#E09050',

  // ── Calm blue (for secondary / info actions) ──
  info: '#2E6B8A',
  infoDark: '#1F5570',
  infoLight: '#5A9CB8',

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
  // Handwritten / chalk style — used for chalkboards, hand-hung notes,
  // anywhere we want the feel of marker or chalk rather than printed type.
  chalk: '"Caveat", "Patrick Hand", "Comic Sans MS", cursive',
} as const;

/**
 * Collar colour palette — used when the player picks a collar for a pet
 * (the walk minigame's first phase) and when rendering a bonded animal's
 * collar in the room view. Shared so the picker and the renderer can't
 * drift out of sync.
 */
export const COLLAR_COLOURS = [
  { name: 'Red',    hex: '#e74c3c' },
  { name: 'Blue',   hex: '#3498db' },
  { name: 'Green',  hex: '#2ecc71' },
  { name: 'Purple', hex: '#9b59b6' },
  { name: 'Orange', hex: '#e67e22' },
  { name: 'Pink',   hex: '#ff6b9d' },
  { name: 'Gold',   hex: '#f1c40f' },
  { name: 'Teal',   hex: '#1abc9c' },
] as const;

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

/**
 * Device pixel ratio for crisp text on retina displays.
 * Cached once at startup so we don't read it every frame.
 */
export const TEXT_RESOLUTION = typeof window !== 'undefined'
  ? Math.min(window.devicePixelRatio || 1, 3)
  : 2;

/**
 * Minimum font sizes for children's game UX (ages 7-11).
 * Based on: Hourcade 2015, British Dyslexia Association,
 * Sesame Workshop design guidelines, NNG children's UX studies.
 */
export const MIN_FONT = {
  body: 16,       // body text / descriptions
  button: 18,     // button labels
  heading: 24,    // scene titles / headings
  hud: 16,        // scores, timers, counters
  small: 14,      // smallest allowed text (hints, credits)
} as const;

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
