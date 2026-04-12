import { describe, it, expect } from 'vitest';
import {
  createAudioState,
  transitionScene,
  getSfxVolume,
  getMusicVolume,
  SCENE_MUSIC,
  SOUND_EFFECTS,
} from '../audio';

describe('createAudioState', () => {
  it('creates default state', () => {
    const state = createAudioState();
    expect(state.currentScene).toBe('menu');
    expect(state.musicEnabled).toBe(true);
    expect(state.sfxEnabled).toBe(true);
    expect(state.musicVolume).toBe(0.5);
    expect(state.sfxVolume).toBe(0.7);
  });
});

describe('transitionScene', () => {
  it('transitions to new scene', () => {
    const state = createAudioState();
    const result = transitionScene(state, 'corridor');
    expect(result.state.currentScene).toBe('corridor');
    expect(result.newTrack).toBe('music_busy');
    expect(result.shouldCrossfade).toBe(true);
  });

  it('does not crossfade when scene unchanged', () => {
    const state = createAudioState();
    const result = transitionScene(state, 'menu');
    expect(result.shouldCrossfade).toBe(false);
  });
});

describe('getSfxVolume', () => {
  it('returns adjusted volume', () => {
    const state = createAudioState();
    const vol = getSfxVolume(state, 'button_click');
    expect(vol).toBeCloseTo(0.3 * 0.7);
  });

  it('returns 0 when sfx disabled', () => {
    const state = { ...createAudioState(), sfxEnabled: false };
    expect(getSfxVolume(state, 'button_click')).toBe(0);
  });
});

describe('getMusicVolume', () => {
  it('returns music volume', () => {
    const state = createAudioState();
    expect(getMusicVolume(state)).toBe(0.5);
  });

  it('returns 0 when music disabled', () => {
    const state = { ...createAudioState(), musicEnabled: false };
    expect(getMusicVolume(state)).toBe(0);
  });
});

describe('SCENE_MUSIC', () => {
  it('has a track for every scene', () => {
    const scenes = ['menu', 'corridor', 'room', 'kitchen', 'garden', 'walk', 'vet', 'social', 'celebration'] as const;
    for (const scene of scenes) {
      expect(SCENE_MUSIC[scene]).toBeTruthy();
    }
  });
});

describe('SOUND_EFFECTS', () => {
  it('has all expected effects defined', () => {
    const effects = [
      'button_click', 'food_correct', 'food_wrong', 'bond_increase',
      'bond_complete', 'animal_arrive', 'road_stop', 'heal_complete',
      'badge_earned', 'collar_pick',
    ] as const;
    for (const effect of effects) {
      expect(SOUND_EFFECTS[effect]).toBeDefined();
      expect(SOUND_EFFECTS[effect].volume).toBeGreaterThan(0);
    }
  });
});
