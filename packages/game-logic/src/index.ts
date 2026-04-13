export { calculateBondIncrease, isBondComplete } from './bond';
export { getSpeciesUnlocksForLevel, getRequiredRescuesForLevel } from './progression';
export {
  validateFoodForSpecies,
  isFoodValidForSpecies,
  getFoodsForSpecies,
  generateKitchenRound,
  FOOD_CATALOGUE,
} from './food';
export type { FoodDefinition } from './food';
export { assignRoom, assignSiblingBed } from './rooms';
export {
  validatePin,
  validateUsername,
  validateJoinCode,
  validateAvatarEmoji,
  validateAvatarBgColour,
  isUsernameSafe,
} from './auth-validation';
export {
  spawnAnimal,
  spawnSiblingPair,
  pickRandomSpecies,
  shouldSpawnSiblings,
  getRandomName,
  pickRandomVariant,
  syncNextId,
  SPECIES_COLOURS,
  SPECIES_VARIANTS,
} from './animals';
export {
  tickNeeds,
  applyFeeding,
  applySleep,
  applyPlay,
  getUrgentNeed,
  getNeedSpeech,
} from './needs';
export {
  canGoOnWalk,
  generateWalkEvents,
  startWalk,
  advanceWalk,
  handleRoadCrossingSuccess,
  handleRoadCrossingFail,
  calculateWalkRewards,
  getAvailableTricks,
  canTrain,
  WALK_EVENTS,
  WALK_ZONES,
  TRICKS,
  WALKABLE_SPECIES,
} from './walks';
export type { WalkState, WalkZone, WalkEvent, Trick, TrickDef, WalkEventDef } from './walks';
export {
  shouldGetSick,
  pickIllness,
  applySickness,
  isHealActionEffective,
  applyHealStep,
  getAvailableUpgrades,
  getUnlockedUpgrades,
  ILLNESSES,
  HEAL_ACTIONS,
  HOUSE_UPGRADES,
} from './vet';
export type { Illness, Severity, IllnessDef, HealAction, HealActionDef, HouseUpgrade } from './vet';
export {
  createAudioState,
  transitionScene,
  getSfxVolume,
  getMusicVolume,
  SCENE_MUSIC,
  SOUND_EFFECTS,
} from './audio';
export type { AudioScene, SoundEffect, AudioState } from './audio';
export {
  shouldSpawnConflict,
  generateConflict,
  isResolutionEffective,
  resolveConflict,
  CONFLICT_TYPES,
  RESOLUTION_ACTIONS,
} from './conflicts';
export type { Conflict, ConflictType, ResolutionAction, ResolutionDef } from './conflicts';
