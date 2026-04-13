import Phaser from 'phaser';
import {
  createAudioState,
  transitionScene,
  getSfxVolume,
  getMusicVolume,
  SCENE_MUSIC,
  SOUND_EFFECTS,
} from '@arc/game-logic';
import type { AudioState, AudioScene, SoundEffect } from '@arc/game-logic';

/**
 * AudioManager — singleton that handles all game audio.
 *
 * Wraps Phaser's audio system with the game-logic audio state machine.
 * Handles music crossfades, SFX playback, and user volume preferences.
 * Gracefully skips playback when audio files aren't loaded yet.
 */
export class AudioManager {
  private static instance: AudioManager | null = null;
  private state: AudioState;
  private scene: Phaser.Scene | null = null;
  private currentMusic: Phaser.Sound.BaseSound | null = null;
  private crossfadeTween: Phaser.Tweens.Tween | null = null;

  private constructor() {
    this.state = createAudioState();
    // Restore preferences from localStorage
    const saved = localStorage.getItem('arc-audio-prefs');
    if (saved) {
      try {
        const prefs = JSON.parse(saved);
        this.state.musicVolume = prefs.musicVolume ?? 0.5;
        this.state.sfxVolume = prefs.sfxVolume ?? 0.7;
        this.state.musicEnabled = prefs.musicEnabled ?? true;
        this.state.sfxEnabled = prefs.sfxEnabled ?? true;
      } catch { /* ignore corrupt prefs */ }
    }
  }

  static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  /** Bind to a Phaser scene (call from each scene's create()) */
  setScene(scene: Phaser.Scene): void {
    // Stop any sounds still playing on the old scene before switching
    if (this.scene && this.scene !== scene) {
      try {
        // Cancel any running crossfade tweens on the old scene
        if (this.crossfadeTween) {
          this.crossfadeTween.stop();
          this.crossfadeTween = null;
        }
        // Stop and destroy current music (it belongs to the old scene's sound manager)
        if (this.currentMusic) {
          this.currentMusic.stop();
          this.currentMusic.destroy();
          this.currentMusic = null;
        }
      } catch {
        // Old scene may already be destroyed — safe to ignore
        this.currentMusic = null;
        this.crossfadeTween = null;
      }
    }
    this.scene = scene;
  }

  /** Transition music to match a new game scene */
  playSceneMusic(audioScene: AudioScene): void {
    if (!this.scene || !this.state.musicEnabled) return;

    const { state: newState, newTrack, shouldCrossfade } = transitionScene(this.state, audioScene);
    this.state = newState;

    if (!shouldCrossfade) return;

    const trackKey = this.getTrackKey(newTrack);
    if (!this.scene.sound.get(trackKey) && !this.scene.cache.audio.exists(trackKey)) {
      // Audio file not loaded — skip gracefully
      return;
    }

    // Crossfade out current music
    if (this.currentMusic && this.currentMusic.isPlaying) {
      const oldMusic = this.currentMusic;
      if (this.scene.tweens) {
        this.scene.tweens.add({
          targets: oldMusic,
          volume: 0,
          duration: 800,
          onComplete: () => {
            oldMusic.stop();
            oldMusic.destroy();
          },
        });
      } else {
        oldMusic.stop();
        oldMusic.destroy();
      }
    }

    // Start new music
    try {
      this.currentMusic = this.scene.sound.add(trackKey, {
        volume: 0,
        loop: true,
      });
      this.currentMusic.play();

      // Fade in
      const targetVol = getMusicVolume(this.state);
      if (this.scene.tweens) {
        this.scene.tweens.add({
          targets: this.currentMusic,
          volume: targetVol,
          duration: 800,
        });
      } else {
        (this.currentMusic as any).volume = targetVol;
      }
    } catch {
      // Audio playback failed (likely user hasn't interacted yet)
    }
  }

  /** Play a sound effect */
  playSfx(effect: SoundEffect): void {
    if (!this.scene || !this.state.sfxEnabled) return;

    const def = SOUND_EFFECTS[effect];
    if (!def) return;

    const key = this.getSfxKey(def.file);
    if (!this.scene.cache.audio.exists(key)) return;

    try {
      const vol = getSfxVolume(this.state, effect);
      this.scene.sound.play(key, { volume: vol });
    } catch {
      // Audio playback failed
    }
  }

  /** Set music volume (0-1) */
  setMusicVolume(vol: number): void {
    this.state.musicVolume = Math.max(0, Math.min(1, vol));
    if (this.currentMusic) {
      (this.currentMusic as any).volume = getMusicVolume(this.state);
    }
    this.savePrefs();
  }

  /** Set SFX volume (0-1) */
  setSfxVolume(vol: number): void {
    this.state.sfxVolume = Math.max(0, Math.min(1, vol));
    this.savePrefs();
  }

  /** Toggle music on/off */
  toggleMusic(): boolean {
    this.state.musicEnabled = !this.state.musicEnabled;
    if (!this.state.musicEnabled && this.currentMusic) {
      this.currentMusic.stop();
    } else if (this.state.musicEnabled) {
      this.playSceneMusic(this.state.currentScene);
    }
    this.savePrefs();
    return this.state.musicEnabled;
  }

  /** Toggle SFX on/off */
  toggleSfx(): boolean {
    this.state.sfxEnabled = !this.state.sfxEnabled;
    this.savePrefs();
    return this.state.sfxEnabled;
  }

  /** Check if music is currently enabled */
  isMusicOn(): boolean {
    return this.state.musicEnabled;
  }

  /** Check if SFX is currently enabled */
  isSfxOn(): boolean {
    return this.state.sfxEnabled;
  }

  /** Get current state for UI display */
  getState(): Readonly<AudioState> {
    return this.state;
  }

  /** Stop all audio (for cleanup) */
  stopAll(): void {
    if (this.currentMusic) {
      this.currentMusic.stop();
      this.currentMusic.destroy();
      this.currentMusic = null;
    }
  }

  // ── Private ─────────────────────────────────────────────────

  private getTrackKey(track: string): string {
    // Map from state machine track names to Phaser audio keys
    const mapping: Record<string, string> = {
      music_gentle: 'music-menu',
      music_busy: 'music-corridor',
      music_cosy: 'music-room',
      music_playful: 'music-kitchen',
      music_peaceful: 'music-garden',
      music_adventure: 'music-walk',
      music_caring: 'music-vet',
      music_friendly: 'music-social',
      music_celebration: 'music-corridor', // reuse corridor for celebration
    };
    return mapping[track] ?? track;
  }

  private getSfxKey(file: string): string {
    // Map from state machine SFX names to Phaser audio keys
    const mapping: Record<string, string> = {
      sfx_click: 'sfx-button',
      sfx_correct: 'sfx-correct',
      sfx_wobble: 'sfx-wrong',
      sfx_sparkle: 'sfx-bond-up',
      sfx_fanfare: 'sfx-bond-complete',
      sfx_doorbell: 'sfx-arrive',
      sfx_munch: 'sfx-feed',
      sfx_purr: 'sfx-pet',
      sfx_whimper: 'sfx-wrong', // reuse wrong sound
      sfx_brake: 'sfx-walk-road',
      sfx_honk: 'sfx-wrong',
      sfx_heal: 'sfx-heal',
      sfx_tada: 'sfx-correct',
      sfx_whoosh: 'sfx-gift',
      sfx_unwrap: 'sfx-gift',
      sfx_achievement: 'sfx-badge',
      sfx_build: 'sfx-level-up',
      sfx_jingle: 'sfx-collar',
    };
    return mapping[file] ?? file;
  }

  private savePrefs(): void {
    localStorage.setItem('arc-audio-prefs', JSON.stringify({
      musicVolume: this.state.musicVolume,
      sfxVolume: this.state.sfxVolume,
      musicEnabled: this.state.musicEnabled,
      sfxEnabled: this.state.sfxEnabled,
    }));
  }
}
