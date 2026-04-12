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
  SPECIES_COLOURS,
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
