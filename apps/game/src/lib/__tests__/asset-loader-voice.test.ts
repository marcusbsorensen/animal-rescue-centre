import { describe, it, expect, vi, afterEach } from 'vitest';
import type Phaser from 'phaser';
import { AssetLoader } from '../AssetLoader';

/**
 * Recorded voice lines are looked up by id and loaded on demand. They must
 * not ride in the boot queue (a hundred clips for a handful a child hears),
 * and a line with no recording must answer "nothing" so the dialogue stays
 * silent instead of asking the server for a file that is not there.
 */

const MANIFEST = [
  'assets/animals/dog-sheltered.png',
  'assets/audio/voice-hello-friend.mp3',
  'assets/voice/handover-warden-1.mp3',
  'assets/voice/handover-01-priya-2.mp3',
];

async function loaderFor(manifest: string[]): Promise<AssetLoader> {
  vi.stubGlobal('fetch', async () => ({ json: async () => manifest }));
  const loader = new (AssetLoader as unknown as { new (): AssetLoader })();
  await loader.fetchManifest();
  return loader;
}

afterEach(() => vi.unstubAllGlobals());

describe('AssetLoader.voiceUrl', () => {
  it('answers the URL of a line that has shipped', async () => {
    const loader = await loaderFor(MANIFEST);
    expect(loader.voiceUrl('handover-warden-1')).toBe('/assets/voice/handover-warden-1.mp3');
    expect(loader.voiceUrl('handover-01-priya-2')).toBe('/assets/voice/handover-01-priya-2.mp3');
  });

  it('answers nothing for a line with no recording', async () => {
    const loader = await loaderFor(MANIFEST);
    expect(loader.voiceUrl('handover-warden-3')).toBeUndefined();
    expect(loader.voiceUrl(undefined)).toBeUndefined();
  });

  it('answers nothing for every line when the manifest cannot be read', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('offline'); });
    const loader = new (AssetLoader as unknown as { new (): AssetLoader })();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await loader.fetchManifest();
    expect(loader.voiceUrl('handover-warden-1')).toBeUndefined();
  });

  it('keeps recorded lines out of the boot and essential queues', async () => {
    const loader = await loaderFor(MANIFEST);
    const audioKeys: string[] = [];
    const scene = {
      textures: { exists: () => false },
      cache: { audio: { exists: () => false } },
      load: {
        on() {},
        image() {},
        audio: (key: string) => { audioKeys.push(key); },
        start() {},
      },
    } as unknown as Phaser.Scene;
    loader.loadBootAssets(scene);
    loader.startBackgroundLoad(scene);
    expect(audioKeys).toContain('voice-hello-friend');
    expect(audioKeys.some((k) => k.startsWith('handover-'))).toBe(false);
  });
});
