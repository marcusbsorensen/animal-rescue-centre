import Phaser from 'phaser';
import type { Weather } from '@arc/shared-types';

/**
 * WeatherParticles — lightweight Phaser particle overlays for garden
 * scenes (and any other outdoor view) that react to the current
 * `GardenWeather.current`.
 *
 * Design:
 *   - Pure particle effects (no per-weather BG changes — those are
 *     handled by the GardenView BG picker).
 *   - Each weather state has a self-contained emitter config.
 *   - Textures are generated once per scene from Phaser Graphics (we
 *     don't ship PNG particle assets — they're simple shapes).
 *   - `createWeatherParticles()` returns a cleanup function the caller
 *     must call when leaving the scene or swapping weather.
 *
 * Performance: each emitter caps at 60–120 particles on-screen. Fine
 * for iPad (Phaser optimises the same-texture batch draws).
 */

// Keys we assign when generating procedural particle textures
const TEX = {
  rain:  'wx-particle-rain',
  snow:  'wx-particle-snow',
  fog:   'wx-particle-fog',
  leaf:  'wx-particle-leaf',
} as const;

/**
 * Ensure procedural textures exist on the scene. Idempotent — only
 * generates the first time it's called per Phaser.Game instance.
 */
function ensureTextures(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);

  if (!scene.textures.exists(TEX.rain)) {
    // Thin blue-grey droplet, vertical
    g.clear();
    g.fillStyle(0x6a8fa5, 1);
    g.fillRoundedRect(0, 0, 2, 12, 1);
    g.generateTexture(TEX.rain, 2, 12);
  }

  if (!scene.textures.exists(TEX.snow)) {
    // Soft white circle
    g.clear();
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(4, 4, 3.5);
    // A slight outer halo
    g.fillStyle(0xffffff, 0.4);
    g.fillCircle(4, 4, 4);
    g.generateTexture(TEX.snow, 8, 8);
  }

  if (!scene.textures.exists(TEX.fog)) {
    // Semi-transparent soft wisp
    g.clear();
    g.fillStyle(0xdadada, 0.45);
    g.fillEllipse(32, 16, 60, 24);
    g.generateTexture(TEX.fog, 64, 32);
  }

  if (!scene.textures.exists(TEX.leaf)) {
    // Autumn leaf (simple oval with gradient approximation via layers)
    g.clear();
    g.fillStyle(0x8b4513, 1);
    g.fillEllipse(6, 8, 10, 14);
    g.fillStyle(0xc0792c, 1);
    g.fillEllipse(6, 8, 7, 11);
    g.fillStyle(0xe0a13a, 1);
    g.fillEllipse(6, 8, 4, 8);
    g.generateTexture(TEX.leaf, 12, 16);
  }

  g.destroy();
}

export interface WeatherParticleBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WeatherParticleHandle {
  /** Destroy the emitters and clean up. Safe to call multiple times. */
  destroy: () => void;
  /** Change the weather in place (useful when phase advances). */
  setWeather: (w: Weather) => void;
}

/**
 * Create particle emitters for a given weather + scene bounds.
 *
 * Returns a handle with `destroy()` to clean up, and `setWeather(w)` to
 * swap in a different weather without recreating the handle.
 *
 * Sunny / cloudy / overcast draw no particles (return a no-op handle).
 */
export function createWeatherParticles(
  scene: Phaser.Scene,
  weather: Weather,
  bounds: WeatherParticleBounds,
): WeatherParticleHandle {
  ensureTextures(scene);

  let emitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];

  const build = (w: Weather) => {
    // Clean up any existing emitters first
    for (const e of emitters) e.destroy();
    emitters = [];

    switch (w) {
      case 'light_rain':
        emitters.push(mkRain(scene, bounds, 'light'));
        break;
      case 'heavy_rain':
        emitters.push(mkRain(scene, bounds, 'heavy'));
        break;
      case 'snow':
        emitters.push(mkSnow(scene, bounds));
        break;
      case 'fog':
        emitters.push(mkFog(scene, bounds));
        break;
      case 'windy':
        emitters.push(mkWind(scene, bounds));
        break;
      // sunny / cloudy / overcast → no particles (backgrounds + lighting alone)
      case 'sunny':
      case 'cloudy':
      case 'overcast':
      default:
        break;
    }
  };

  build(weather);

  return {
    destroy: () => {
      for (const e of emitters) e.destroy();
      emitters = [];
    },
    setWeather: (w: Weather) => build(w),
  };
}

// ── Emitter factories ───────────────────────────────────────

function mkRain(
  scene: Phaser.Scene,
  bounds: WeatherParticleBounds,
  intensity: 'light' | 'heavy',
): Phaser.GameObjects.Particles.ParticleEmitter {
  const count = intensity === 'heavy' ? 120 : 50;
  const speed = intensity === 'heavy' ? { min: 700, max: 900 } : { min: 450, max: 650 };
  const angle = intensity === 'heavy' ? { min: 95, max: 100 } : { min: 88, max: 92 };
  const emitter = scene.add.particles(0, 0, TEX.rain, {
    x: { min: bounds.x - 40, max: bounds.x + bounds.width + 40 },
    y: bounds.y - 20,
    lifespan: 1600,
    speedY: speed,
    angle,
    scale: { start: 1, end: 1 },
    alpha: intensity === 'heavy' ? 0.75 : 0.55,
    frequency: intensity === 'heavy' ? 16 : 40,
    quantity: intensity === 'heavy' ? 2 : 1,
    blendMode: Phaser.BlendModes.NORMAL,
  });
  emitter.setDepth(900);
  return emitter;
}

function mkSnow(
  scene: Phaser.Scene,
  bounds: WeatherParticleBounds,
): Phaser.GameObjects.Particles.ParticleEmitter {
  const emitter = scene.add.particles(0, 0, TEX.snow, {
    x: { min: bounds.x - 40, max: bounds.x + bounds.width + 40 },
    y: bounds.y - 20,
    lifespan: 9000,
    speedY: { min: 40, max: 90 },
    speedX: { min: -20, max: 20 },
    angle: { min: 85, max: 95 },
    scale: { start: 0.9, end: 1.1 },
    alpha: { start: 0.95, end: 0.75 },
    rotate: { min: 0, max: 360 },
    frequency: 80,
    quantity: 1,
    blendMode: Phaser.BlendModes.NORMAL,
  });
  emitter.setDepth(900);
  return emitter;
}

function mkFog(
  scene: Phaser.Scene,
  bounds: WeatherParticleBounds,
): Phaser.GameObjects.Particles.ParticleEmitter {
  const emitter = scene.add.particles(0, 0, TEX.fog, {
    x: bounds.x - 80,
    y: { min: bounds.y + 40, max: bounds.y + bounds.height - 40 },
    lifespan: 14000,
    speedX: { min: 20, max: 40 },
    speedY: { min: -5, max: 5 },
    scale: { start: 0.8, end: 1.4 },
    alpha: { start: 0.0, end: 0.6, ease: 'Sine.easeInOut' },
    frequency: 900,
    quantity: 1,
    blendMode: Phaser.BlendModes.NORMAL,
  });
  // Fog should sit slightly below the main animals (atmospheric haze)
  emitter.setDepth(500);
  return emitter;
}

function mkWind(
  scene: Phaser.Scene,
  bounds: WeatherParticleBounds,
): Phaser.GameObjects.Particles.ParticleEmitter {
  const emitter = scene.add.particles(0, 0, TEX.leaf, {
    x: bounds.x - 20,
    y: { min: bounds.y + 30, max: bounds.y + bounds.height - 30 },
    lifespan: 4500,
    speedX: { min: 220, max: 320 },
    speedY: { min: -30, max: 30 },
    scale: { start: 0.9, end: 0.7 },
    alpha: { start: 1, end: 0.8 },
    rotate: { min: 0, max: 360 },
    frequency: 280,
    quantity: 1,
    blendMode: Phaser.BlendModes.NORMAL,
  });
  emitter.setDepth(900);
  return emitter;
}
