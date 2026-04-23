export { calculateBondIncrease, isBondComplete, isSiblingPresent, SIBLING_BOND_BONUS } from './bond';
export {
  generateDailyWeather,
  advanceWeatherToPhase,
  getSpeciesRainTolerance,
  getSpeciesColdTolerance,
  isRainy,
  isCold,
  needsCoat,
  rainHappinessDelta,
  markWet,
  dry,
  shouldAutoDry,
  applyShakeOff,
  WET_DURATION_MS,
} from './weather';
export type { RainTolerance, ColdTolerance, ShakeOffEffect } from './weather';
export {
  getGarmentForSpecies,
  getWardrobeTextureKey,
  getWardrobeAnchor,
  equipWardrobe,
  unequipWardrobe,
  isDressedForWeather,
  dressingBlockReason,
} from './wardrobe';
export type { Garment, WardrobeAnchor } from './wardrobe';
export { getSpeciesUnlocksForLevel, getRequiredRescuesForLevel, getMaxShelterAnimals, getMaxArrivals } from './progression';
export {
  APPRENTICE_DEFS,
  APPRENTICE_MIN_LEVEL,
  canRecruit,
  recruitApprentice,
  recomputeApprenticeUnlocks,
  isApprenticeRecruited,
} from './apprentices';
export type {
  ApprenticeId,
  ApprenticeEntry,
  ApprenticeUnlocks,
  ApprenticeStoreSlice,
  CanRecruitResult,
} from './apprentices';
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
  applyGrooming,
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
  // Grid walk system
  generateWalkGrid,
  startGridWalk,
  movePlayer,
  interactWithTile,
  handleAnimalEncounter,
  handleGridRoadCrossing,
  advanceNPCs,
  calculateGridWalkRewards,
  TILE_DEFS,
} from './walks';
export type {
  WalkState, WalkZone, WalkEvent, Trick, TrickDef, WalkEventDef,
  WalkTileType, WalkTile, WalkNPC, WalkGridMap, WalkGridState,
  WalkDirection, NPCTemperament, MoveTrigger,
  InteractionResult, EncounterResult,
} from './walks';
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
  pickConflictPair,
  isResolutionEffective,
  resolveConflict,
  CONFLICT_TYPES,
  RESOLUTION_ACTIONS,
} from './conflicts';
export type { Conflict, ConflictType, ResolutionAction, ResolutionDef } from './conflicts';
export {
  createCalendarState,
  calculateCurrentDate,
  getSeasonForMonth,
  getSeasonForDate,
  getCurrentSeason,
  getSeasonDef,
  getActiveEvents,
  advanceCalendar,
  isDailyReset,
  SEASONS,
  SEASON_THEMES,
  CALENDAR_EVENTS,
} from './calendar';
export type { Season, CalendarState, SeasonDef, CalendarEventDef } from './calendar';
export {
  canAccessDestination,
  startSupplyRun,
  generateObstacle,
  applyObstacleHit,
  applySmash,
  changeLane,
  advanceDistance,
  checkCompletion,
  isCatastrophicDamage,
  calculateSupplyRewards,
  getRepairCost,
  getDailyContractBonus,
  SUPPLY_DESTINATIONS,
  OBSTACLES,
  DAMAGE_THRESHOLDS,
} from './supply-runs';
export type { DestinationDef, ObstacleDef, DamageThreshold, SupplyRunLaneState } from './supply-runs';
export {
  getTilesForMode,
  getBoardDimensions,
  generateRewards,
  rollForSuperTreat,
  canAccessMode,
  getSessionLimit,
  resetDailySessions,
  PARTS_TILES,
  TREATS_TILES,
  DECORATIONS_TILES,
  MEDICAL_TILES,
  ALL_REWARDS,
} from './depot-inventory';
export type { TileDefinition, RewardItem } from './depot-inventory';
export {
  createBoard,
  findGroup,
  tapCell,
  applyGravity,
  refillBoard,
  activatePowerUp,
  checkGoals,
  generateGoals,
  serialiseBoard,
  deserialiseBoard,
  MODE_TILE_TYPES,
} from './depot-board';
export {
  placeDecoration,
  removeDecoration,
  moveDecoration,
  getRoomDecorations,
  getAvailableDecorationCounts,
  syncPlacedDecorationId,
} from './decorations';
export {
  phaseIndex,
  nextPhase,
  getTaskWeight,
  baseTasksPerPhase,
  computeTasksPerPhase,
  createTimeProgress,
  recordCareTask,
  refreshTasksPerPhase,
  countFullyBondedPets,
  isWeekend,
} from './time';
export type { HelperModifiers, RecordTaskResult } from './time';
export {
  getSpeciesTemperament,
  getOutsideBondThreshold,
  hasChaperoneInGarden,
  inGarden,
  canLetOutside,
  assignGardenZone,
  letOutside,
  bringInside,
  switchZone,
  gardenOccupants,
  partitionByZone,
} from './garden';
export type { LetOutsideBlock } from './garden';
export {
  setRelationship,
  clearRelationship,
  getRelationship,
  getRelationshipsFor,
  hasAllyPresent,
  syncSiblingIds,
  relationshipsFromSiblingIds,
} from './relationships';
export {
  scheduleVisitsForDay,
  getDueVisitors,
  markVisitSeen,
  scheduleWildReturns,
  getDueGardenReturns,
  markGardenReturnSeen,
  markAllDueGardenReturnsSeen,
  REHOMED_VISIT_CHANCE,
  REWILDED_VISIT_CHANCE,
  WILD_RETURN_CHANCE,
} from './visitors';
export type {
  VisitType,
  VisitorEntry,
  VisitorStoreShape,
  GardenReturnEntry,
  WildReturnStoreShape,
} from './visitors';
export {
  TOY_DEFS,
  DEFAULT_TOY_FOR_SPECIES,
  ARRIVAL_TOY_PROBABILITY,
  rollArrivalToy,
  getAvailableToys,
  getToyBondBonus,
  getPlayToyId,
} from './toys';
export type { ToyDef } from './toys';
