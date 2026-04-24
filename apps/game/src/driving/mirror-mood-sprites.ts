/**
 * mirror-mood-sprites.ts
 *
 * Helper for looking up rear-view-mirror mood sprite URLs.
 *
 * The PNGs + index.json live under /assets/driving/mirror-moods/ and
 * are produced by `tools/build-mirror-mood-sprites.ts`. This module is
 * a pure lookup — it doesn't load images, just returns paths that can
 * be handed to an <img src> or Phaser.load.image().
 */

export type MirrorMood = 'happy' | 'neutral' | 'stressed' | 'sleeping';

export interface MirrorMoodIndexEntry {
  file: string;
  source: string;
  fallback: boolean;
}

export interface MirrorMoodIndex {
  generatedAt: string;
  size: number;
  moods: MirrorMood[];
  species: string[];
  sprites: Record<string, Partial<Record<MirrorMood, MirrorMoodIndexEntry>>>;
}

const BASE_URL = '/assets/driving/mirror-moods';

let cachedIndex: MirrorMoodIndex | null = null;

/** URL of the index JSON — fetch this once at boot if you want species/mood lists. */
export const MIRROR_MOOD_INDEX_URL = `${BASE_URL}/index.json`;

/** Seed the module with a pre-loaded index (avoids a second fetch). */
export function setMirrorMoodIndex(index: MirrorMoodIndex): void {
  cachedIndex = index;
}

export function getMirrorMoodIndex(): MirrorMoodIndex | null {
  return cachedIndex;
}

/**
 * Return the URL for a species + mood composite. Falls back — in order —
 * to another mood on the same species, or a generic `<species>-neutral`
 * sprite, or null if nothing is known. The pure path form
 * (`{BASE_URL}/{species}-{mood}.png`) is used if no index is loaded yet,
 * so this is safe to call during early boot.
 */
export function getMoodSpriteUrl(species: string, mood: MirrorMood): string {
  if (!cachedIndex) {
    // Optimistic path — naming convention is stable.
    return `${BASE_URL}/${species}-${mood}.png`;
  }
  const forSpecies = cachedIndex.sprites[species];
  if (forSpecies?.[mood]) {
    return `${BASE_URL}/${forSpecies[mood]!.file}`;
  }
  // Fallback chain: neutral → any available mood for species → first sprite.
  if (forSpecies?.neutral) return `${BASE_URL}/${forSpecies.neutral.file}`;
  if (forSpecies) {
    const anyMood = Object.values(forSpecies).find(Boolean);
    if (anyMood) return `${BASE_URL}/${anyMood.file}`;
  }
  // Last resort: first species in the index at the requested mood.
  for (const s of cachedIndex.species) {
    const e = cachedIndex.sprites[s]?.[mood];
    if (e) return `${BASE_URL}/${e.file}`;
  }
  return `${BASE_URL}/${species}-${mood}.png`;
}

/** Convenience emoji for the little corner badge in the mirror cell. */
export function moodEmoji(mood: MirrorMood): string {
  switch (mood) {
    case 'happy':    return '😊';
    case 'neutral':  return '🙂';
    case 'stressed': return '😰';
    case 'sleeping': return '💤';
  }
}
