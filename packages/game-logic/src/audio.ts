// ── Audio State Machine ────────────────────────────────────────
// Manages background music and sound effect state for the game.
// The actual audio playback is handled by Phaser's audio system;
// this module provides the state logic and transition rules.

export type AudioScene =
  | 'menu'
  | 'corridor'
  | 'room'
  | 'kitchen'
  | 'garden'
  | 'walk'
  | 'vet'
  | 'social'
  | 'celebration'
  | 'depot'
  | 'supply_run';

export type SoundEffect =
  | 'button_click'
  | 'food_correct'
  | 'food_wrong'
  | 'bond_increase'
  | 'bond_complete'
  | 'animal_arrive'
  | 'animal_fed'
  | 'animal_happy'
  | 'animal_sad'
  | 'road_stop'
  | 'road_miss'
  | 'heal_action'
  | 'heal_complete'
  | 'gift_send'
  | 'gift_receive'
  | 'badge_earned'
  | 'upgrade_unlock'
  | 'collar_pick'
  | 'tile_tap'
  | 'tile_collapse'
  | 'power_up_create'
  | 'power_up_activate'
  | 'chain_reaction'
  | 'depot_complete'
  | 'truck_engine'
  | 'obstacle_smash'
  | 'obstacle_hit'
  | 'supply_complete';

export interface AudioState {
  currentScene: AudioScene;
  musicVolume: number;   // 0–1
  sfxVolume: number;     // 0–1
  musicEnabled: boolean;
  sfxEnabled: boolean;
}

/** Scene-to-music track mapping */
export const SCENE_MUSIC: Record<AudioScene, string> = {
  menu:        'music_gentle',
  corridor:    'music_busy',
  room:        'music_cosy',
  kitchen:     'music_playful',
  garden:      'music_peaceful',
  walk:        'music_adventure',
  vet:         'music_caring',
  social:      'music_friendly',
  celebration: 'music_celebration',
  depot:       'music_playful',     // reuse playful until dedicated track exists
  supply_run:  'music_adventure',   // reuse adventure until dedicated track exists
};

/** Sound effect descriptions (for Phaser to load) */
export const SOUND_EFFECTS: Record<SoundEffect, { file: string; volume: number }> = {
  button_click:   { file: 'sfx_click',      volume: 0.3 },
  food_correct:   { file: 'sfx_correct',    volume: 0.5 },
  food_wrong:     { file: 'sfx_wobble',     volume: 0.4 },
  bond_increase:  { file: 'sfx_sparkle',    volume: 0.4 },
  bond_complete:  { file: 'sfx_fanfare',    volume: 0.7 },
  animal_arrive:  { file: 'sfx_doorbell',   volume: 0.5 },
  animal_fed:     { file: 'sfx_munch',      volume: 0.4 },
  animal_happy:   { file: 'sfx_purr',       volume: 0.3 },
  animal_sad:     { file: 'sfx_whimper',    volume: 0.3 },
  road_stop:      { file: 'sfx_brake',      volume: 0.6 },
  road_miss:      { file: 'sfx_honk',       volume: 0.5 },
  heal_action:    { file: 'sfx_heal',       volume: 0.4 },
  heal_complete:  { file: 'sfx_tada',       volume: 0.6 },
  gift_send:      { file: 'sfx_whoosh',     volume: 0.4 },
  gift_receive:   { file: 'sfx_unwrap',     volume: 0.5 },
  badge_earned:   { file: 'sfx_achievement', volume: 0.7 },
  upgrade_unlock: { file: 'sfx_build',      volume: 0.5 },
  collar_pick:    { file: 'sfx_jingle',     volume: 0.4 },
  tile_tap:       { file: 'sfx_click',      volume: 0.3 },
  tile_collapse:  { file: 'sfx_correct',    volume: 0.4 },
  power_up_create: { file: 'sfx_sparkle',   volume: 0.6 },
  power_up_activate: { file: 'sfx_fanfare', volume: 0.5 },
  chain_reaction: { file: 'sfx_sparkle',    volume: 0.5 },
  depot_complete: { file: 'sfx_tada',       volume: 0.7 },
  truck_engine:   { file: 'sfx_brake',      volume: 0.3 },
  obstacle_smash: { file: 'sfx_correct',    volume: 0.5 },
  obstacle_hit:   { file: 'sfx_honk',       volume: 0.5 },
  supply_complete: { file: 'sfx_achievement', volume: 0.7 },
};

/**
 * Create initial audio state.
 */
export function createAudioState(): AudioState {
  return {
    currentScene: 'menu',
    musicVolume: 0.5,
    sfxVolume: 0.7,
    musicEnabled: true,
    sfxEnabled: true,
  };
}

/**
 * Transition to a new scene — returns the music track to play.
 */
export function transitionScene(
  state: AudioState,
  newScene: AudioScene
): { state: AudioState; newTrack: string; shouldCrossfade: boolean } {
  const shouldCrossfade = state.currentScene !== newScene;
  return {
    state: { ...state, currentScene: newScene },
    newTrack: SCENE_MUSIC[newScene],
    shouldCrossfade,
  };
}

/**
 * Get the volume for a sound effect, adjusted by user settings.
 */
export function getSfxVolume(state: AudioState, effect: SoundEffect): number {
  if (!state.sfxEnabled) return 0;
  const base = SOUND_EFFECTS[effect]?.volume ?? 0.5;
  return base * state.sfxVolume;
}

/**
 * Get the volume for music, adjusted by user settings.
 */
export function getMusicVolume(state: AudioState): number {
  if (!state.musicEnabled) return 0;
  return state.musicVolume;
}
