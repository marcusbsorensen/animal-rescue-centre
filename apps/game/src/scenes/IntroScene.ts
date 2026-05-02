import Phaser from 'phaser';
import { mountAuth, unmountAuth } from '../auth-overlay/AuthOverlay';
import { AssetLoader } from '../lib/AssetLoader';
import { AudioManager } from '../audio/AudioManager';
import { getSkipIntro, setSkipIntro, hasPlayedBefore, markPlayed } from '../lib/intro-state';
import {
  getSpeciesUnlocksForLevel,
  pickRandomSpecies,
  spawnAnimal,
} from '@arc/game-logic';
import type { Species } from '@arc/shared-types';

/**
 * IntroScene — sits between MainMenuScene and GameScene.
 *
 * Mounts /admin/intro.html as an iframe overlay. When the kid taps
 * the door open on panel 4, postMessage 'intro-complete' fires and
 * we start GameScene with the pre-picked species so panel 4's reveal
 * sprite matches what GameScene will then spawn for first arrival.
 *
 * Brand-new-account silent override: on the very first ever play
 * (hasPlayedBefore() === false), we force AudioManager to muted
 * before mounting so panel 4's SFX can't surprise the kid.
 *
 * v1 limitation: species pre-pick uses level-1 unlocks (cat | dog)
 * regardless of the player's actual level. v2 fixes this by reading
 * the actual saved state.
 */
export class IntroScene extends Phaser.Scene {
  constructor() {
    super({ key: 'IntroScene' });
  }

  create(): void {
    // Brand-new-account silent override.
    if (!hasPlayedBefore() && AudioManager.getInstance().isMusicOn()) {
      AudioManager.getInstance().toggleMusic();
    }

    // Bind AudioManager to this scene so playSfx can route through.
    AudioManager.getInstance().setScene(this);

    // Pre-pick the species panel 4 will reveal + GameScene will spawn.
    const { species, variant, spriteSrc } = this.preSelectFirstAnimal();

    const skipIntro = getSkipIntro();
    const musicOn = AudioManager.getInstance().isMusicOn();

    const unmount = mountAuth(
      'intro',
      {
        onAction: (action, _session, payload) => {
          if (action === 'set-skip-intro') {
            const v = (payload as { value?: boolean } | undefined)?.value;
            if (typeof v === 'boolean') setSkipIntro(v);
            return;
          }
          if (action === 'intro-climactic-sfx') {
            this.playClimacticSfx(species);
            return;
          }
          if (action === 'intro-complete') {
            markPlayed();
            unmount();
            this.startGameWithPreselect(species, variant);
            return;
          }
          // toggle-music is handled by AuthOverlay directly
        },
      },
      {
        skipIntro,
        speciesForArrival: species,
        arrivingSpriteSrc: spriteSrc,
        musicOn,
      },
    );

    this.events.once('shutdown', unmountAuth);
    this.events.once('destroy', unmountAuth);

    // Safety net — if intro iframe fails to load and never posts
    // 'intro-complete', fall through to GameScene after 30s so the
    // kid is never stuck on a black screen.
    this.time.delayedCall(30_000, () => {
      if (this.scene.isActive('IntroScene')) {
        unmount();
        this.startGameWithPreselect(species, variant);
      }
    });
  }

  /**
   * Pick the species + variant GameScene will spawn first, BEFORE
   * mounting the intro iframe. v1 always picks from level-1 unlocks
   * (cat | dog) — this is correct for brand-new accounts (the primary
   * use case) and accepted as a tradeoff for returning players who
   * are at higher levels.
   */
  private preSelectFirstAnimal(): { species: Species; variant: string; spriteSrc: string } {
    const unlocked = getSpeciesUnlocksForLevel(1, 0);
    const species = pickRandomSpecies(unlocked);
    const sample = spawnAnimal(species, undefined, []);
    const variant = sample.variant ?? 'default';
    const spriteSrc = `/assets/animals/${species}-${variant}-arriving.png`;
    return { species, variant, spriteSrc };
  }

  /**
   * Play the climactic panel-4 SFX. Respects AudioManager state —
   * silent if music is off (e.g. brand-new override active, or kid
   * has muted on the menu / intro).
   *
   * AudioManager only exposes a typed playSfx for known SoundEffect
   * enums; per-species and voice clips are loaded under their filename
   * keys (cat-meow, voice-hello-friend, etc) so we play those directly
   * via the Phaser sound manager. The audio cache is shared across
   * scenes, so this works as long as the assets have been loaded by
   * AssetLoader.
   */
  private playClimacticSfx(species: Species): void {
    const audio = AudioManager.getInstance();
    if (!audio.isMusicOn()) return;

    // Doorbell / arrival chime — typed enum routes through AudioManager.
    audio.playSfx('animal_arrive');

    // Per-species sound (snake has hiss; all others map cleanly).
    const speciesSoundMap: Record<Species, string> = {
      cat: 'cat-meow',
      dog: 'dog-bark',
      fox: 'fox-yip',
      bunny: 'bunny-squeak',
      parrot: 'parrot-squawk',
      bat: 'bat-chitter',
      snake: 'snake-hiss',
    };
    const speciesKey = speciesSoundMap[species];
    if (speciesKey && this.cache.audio.exists(speciesKey)) {
      try {
        this.sound.play(speciesKey, { volume: 0.6 });
      } catch {
        // Audio playback failed — non-fatal.
      }
    }

    // Friendly greeting voice.
    if (this.cache.audio.exists('voice-hello-friend')) {
      try {
        this.sound.play('voice-hello-friend', { volume: 0.7 });
      } catch {
        // Audio playback failed — non-fatal.
      }
    }
  }

  private startGameWithPreselect(species: Species, variant: string): void {
    const loader = AssetLoader.getInstance();
    const next = loader.isFullyLoaded ? 'GameScene' : 'LoadingScene';
    this.scene.start(next, { preSelectedSpecies: species, preSelectedVariant: variant });
  }
}
