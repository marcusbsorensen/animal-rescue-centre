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
export { renderAnimalCard, PATHS_UNLOCK_BOND } from './AnimalCard';
export type { AnimalCardCallbacks } from './AnimalCard';
export { renderWardrobePicker } from './WardrobePickerView';
export type { WardrobePickerCallbacks } from './WardrobePickerView';
export { renderToyPicker } from './ToyPickerView';
export type { ToyPickerCallbacks } from './ToyPickerView';
export { renderHUD, showVolumeSlider } from './HUDView';
export type { HUDCallbacks } from './HUDView';
export { renderNavBar, renderGamesPopup, showQuickToast } from './NavBarView';
export type { NavBarCallbacks, NavBarOptions, GamesPopupCallbacks } from './NavBarView';
export { renderNavRail } from './NavRailView';
export { renderCorridor } from './CorridorView';
export type { CorridorCallbacks } from './CorridorView';
export { renderRoom } from './RoomView';
export type { RoomCallbacks, RoomRenderContext } from './RoomView';
export {
  renderLeftRail, getRailBounds, getPlayArea,
  RAIL_WIDTH, RAIL_TAB_WIDTH, RAIL_COLLAPSE_BREAKPOINT, railIsCollapsible,
} from './LeftRailView';
export type { LeftRailCallbacks } from './LeftRailView';
export { renderApprenticeDecorations } from './ApprenticeDecorations';
export type {
  ApprenticeDecorationOptions,
  ApprenticeRoomSpecies,
} from './ApprenticeDecorations';
