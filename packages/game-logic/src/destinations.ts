// ── World-Map Destinations ───────────────────────────────────
// The GPS-style world map lets players pick driving destinations:
// supply runs, adoption deliveries, rewilding releases, and visits
// to rewilded animals in their habitats. This module is the single
// source of truth for destination metadata (id, label, map position,
// unlock level, kind) so the map UI, drive scene, and game logic
// can share it.
//
// Note: a separate `DestinationDef` lives in ./supply-runs for the
// legacy supply-run picker. This one is broader (9 destinations,
// including rewilding habitats). It's re-exported from index.ts as
// `MapDestinationDef` to avoid a name clash.

export type DestinationKind =
  | 'supply-run'
  | 'rewilding-habitat'
  | 'adoption-home'
  | 'visit-home'
  // ── Added 2026-04-24 per Marcus's brainstorm. See
  // ── docs/ptv-pet-transport-vehicle.md §"PTV destinations"
  // ── for the full design. Not yet wired to map UI.
  | 'vet-general'           // normal vet (Greystone / Haven)
  | 'vet-prosthetics'       // specialist prosthetics / mobility
  | 'training-guide-dog'
  | 'training-sniffer'
  | 'training-parrot'
  | 'training-rewilding-prep'
  | 'pet-show';             // village fête → national championship

export type RewildingHabitat =
  | 'moorland'
  | 'woodland'
  | 'sea-cliffs'
  | 'deep-forest'
  | 'wetlands';

export interface DestinationDef {
  id: string;
  label: string;
  emoji: string;
  kind: DestinationKind;
  description: string;
  /** km (cosmetic, drives the drive-length) */
  distance: number;
  unlockLevel: number;
  /** % from left on the world map */
  mapX: number;
  /** % from top on the world map */
  mapY: number;
  /** For rewilding-habitat destinations, which species belong here */
  suitableSpecies?: string[];
}

export const DESTINATIONS: DestinationDef[] = [
  // ── Centre ──
  {
    id: 'arc',
    label: 'A.R.C.',
    emoji: '\uD83C\uDFE1', // 🏡
    kind: 'adoption-home',
    description: 'Animal Rescue Centre — your home base.',
    distance: 0,
    unlockLevel: 0,
    mapX: 50,
    mapY: 68,
  },

  // ── Supply runs ──
  {
    id: 'bramble-farm',
    label: 'Bramble Farm',
    emoji: '\uD83C\uDF3E', // 🌾
    kind: 'supply-run',
    description: 'Hay, straw, feed and bedding for the animals.',
    distance: 12,
    unlockLevel: 0,
    mapX: 22,
    mapY: 52,
  },
  {
    id: 'cove-harbour',
    label: 'Cove Harbour',
    emoji: '\uD83D\uDC1F', // 🐟
    kind: 'supply-run',
    description: 'Fresh fish from the dockside market.',
    distance: 18,
    unlockLevel: 5,
    mapX: 14,
    mapY: 82,
  },
  {
    id: 'pinebark-medical',
    label: 'Pinebark Medical',
    emoji: '\uD83D\uDC8A', // 💊
    kind: 'supply-run',
    description: 'Bandages, medicines and vet supplies.',
    distance: 24,
    unlockLevel: 10,
    mapX: 78,
    mapY: 46,
  },

  // ── Rewilding habitats ──
  {
    id: 'moorland',
    label: 'Moorland',
    emoji: '\uD83E\uDD8A', // 🦊
    kind: 'rewilding-habitat',
    description: 'Open heather moors — home for foxes.',
    distance: 28,
    unlockLevel: 3,
    mapX: 32,
    mapY: 22,
    suitableSpecies: ['fox'],
  },
  {
    id: 'woodland',
    label: 'Woodland',
    emoji: '\uD83D\uDC3F\uFE0F', // 🐿️
    kind: 'rewilding-habitat',
    description: 'Dappled woods for hedgehogs, squirrels and wild bunnies.',
    distance: 16,
    unlockLevel: 3,
    mapX: 58,
    mapY: 30,
    suitableSpecies: ['bunny', 'hedgehog', 'squirrel'],
  },
  {
    id: 'sea-cliffs',
    label: 'Sea Cliffs',
    emoji: '\uD83D\uDC26', // 🐦
    kind: 'rewilding-habitat',
    description: 'Windy cliffs where seabirds nest.',
    distance: 34,
    unlockLevel: 7,
    mapX: 88,
    mapY: 76,
    suitableSpecies: ['parrot', 'seabird'],
  },
  {
    id: 'deep-forest',
    label: 'Deep Forest',
    emoji: '\uD83E\uDD87', // 🦇
    kind: 'rewilding-habitat',
    description: 'Ancient trees and quiet caves — bat country.',
    distance: 40,
    unlockLevel: 8,
    mapX: 70,
    mapY: 14,
    suitableSpecies: ['bat'],
  },
  {
    id: 'wetlands',
    label: 'Wetlands',
    emoji: '\uD83D\uDC0D', // 🐍
    kind: 'rewilding-habitat',
    description: 'Reed beds and slow water — perfect for snakes.',
    distance: 22,
    unlockLevel: 9,
    mapX: 44,
    mapY: 88,
    suitableSpecies: ['snake'],
  },
];

// ── Species → habitat mapping ────────────────────────────────
// Picks the "natural" habitat for each rewilding-capable species.
// Cats and dogs are intentionally absent — they can't survive wild,
// and the Paths panel disables the rewild card for them. Same logic
// applies here: habitatForSpecies('cat') → undefined.
const SPECIES_HABITATS: Record<string, RewildingHabitat> = {
  fox: 'moorland',
  bat: 'deep-forest',
  snake: 'wetlands',
  parrot: 'sea-cliffs',
  seabird: 'sea-cliffs',
  bunny: 'woodland',
  hedgehog: 'woodland',
  squirrel: 'woodland',
};

export function getDestination(id: string): DestinationDef | undefined {
  return DESTINATIONS.find((d) => d.id === id);
}

export function getAvailableDestinations(playerLevel: number): DestinationDef[] {
  return DESTINATIONS.filter((d) => d.unlockLevel <= playerLevel);
}

/** Given a rewilded animal's species, which habitat is it visiting from? */
export function habitatForSpecies(species: string): RewildingHabitat | undefined {
  return SPECIES_HABITATS[species];
}
