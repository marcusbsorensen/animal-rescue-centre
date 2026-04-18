// Barrel exports for the gradually-growing view-modules folder.
// Each module renders one GameScene view (corridor, room, garden,
// kitchen, etc) as a pure function taking the scene + store + a
// callbacks bag for scene-level coordination.
export { renderGarden } from './GardenView';
export type { GardenCallbacks, ResolvedAnchor } from './GardenView';
