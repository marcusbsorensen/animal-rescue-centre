// Shared UI constants for consistent styling across scenes

export const COLOURS = {
  bg: '#fef9ef',
  primary: '#4a9c5d',
  primaryDark: '#3d8a4e',
  text: '#3a2e22',
  textLight: '#7c6b5a',
  white: '#ffffff',
  error: '#c0392b',
  inputBg: '#f5efe4',
  inputBorder: '#d4c8b8',
} as const;

export const FONTS = {
  title: 'Georgia, serif',
  body: 'system-ui, -apple-system, sans-serif',
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
