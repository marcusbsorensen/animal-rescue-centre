import { describe, it, expect, vi, afterEach } from 'vitest';
import type Phaser from 'phaser';
import { AssetLoader } from '../AssetLoader';

/**
 * Which tier a file loads in decides whether a screen can use it.
 *
 * Essential gates the loading screen; variant arrives silently afterwards. A
 * two-token animal file (`dog-sheltered`) is the species-level fallback and is
 * essential by its shape — but `dog-coat` has the same shape, and as a variant
 * file it landed last, so an animal dressed in a coat that had not arrived was
 * drawn without one (`docs/audit-2026-08-22.md`, finding 15).
 */

const MANIFEST = [
  'assets/animals/dog-sheltered.png',
  'assets/animals/dog-husky-sheltered.png',
  'assets/animals/dog-coat.png',
  'assets/animals/cat-scarf.png',
  'assets/animals/parrot-hat.png',
  'assets/animals/bat-scarf.png',
  'assets/animals/dog-husky-walking.png',
];

/** What `startBackgroundLoad` asks the scene's loader for. */
async function essentialKeys(manifest: string[]): Promise<string[]> {
  vi.stubGlobal('fetch', async () => ({ json: async () => manifest }));
  const loader = new (AssetLoader as unknown as { new (): AssetLoader })();
  await loader.fetchManifest();
  const queued: string[] = [];
  const scene = {
    textures: { exists: () => false },
    cache: { audio: { exists: () => false } },
    load: {
      on() {},
      image: (key: string) => { queued.push(key); },
      audio() {},
      start() {},
    },
  } as unknown as Phaser.Scene;
  loader.startBackgroundLoad(scene);
  return queued;
}

describe('AssetLoader tiers', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('loads a species\' garment with the essentials, so it is there before anyone wears it', async () => {
    const keys = await essentialKeys(MANIFEST);
    expect(keys).toEqual(expect.arrayContaining(['dog-coat', 'cat-scarf', 'parrot-hat', 'bat-scarf']));
  });

  it('still loads the species-level poses with the essentials, and the variants after', async () => {
    const keys = await essentialKeys(MANIFEST);
    expect(keys).toContain('dog-sheltered');
    expect(keys).not.toContain('dog-husky-sheltered');
    expect(keys).not.toContain('dog-husky-walking');
  });
});
