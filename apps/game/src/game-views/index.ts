// Barrel exports for the gradually-growing view-modules folder.
// Each module renders one GameScene view (corridor, room, garden,
// kitchen, etc) as a pure function taking the scene + store + a
// callbacks bag for scene-level coordination.
export { renderGarden } from './GardenView';
export type { GardenCallbacks, ResolvedAnchor } from './GardenView';
export { renderKitchen } from './KitchenView';
export type { KitchenCallbacks } from './KitchenView';
export { showBadgeNotification, showLevelUpCelebration } from './CelebrationViews';
export { renderConflictPopup, renderConflictResult } from './ConflictView';
export type { ConflictPopupCallbacks, ConflictResultCallbacks } from './ConflictView';
export { renderCollarPicker, renderPetCreated } from './CollarPickerView';
export type { CollarPickerCallbacks, PetCreatedCallbacks } from './CollarPickerView';
export { renderAnimalDetails } from './AnimalDetailsPopup';
export type { AnimalDetailsCallbacks } from './AnimalDetailsPopup';
