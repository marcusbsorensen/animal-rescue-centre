// A.R.C. Shared Types
// Core domain types used across client and server

export type Species = 'cat' | 'dog' | 'fox' | 'bunny' | 'bat' | 'parrot' | 'snake';

export type AnimalState = 'arriving' | 'sheltered' | 'bonding' | 'pet';

export interface Animal {
  id: string;
  name: string;
  species: Species;
  state: AnimalState;
  arrivalStory: string;
  hunger: number;       // 0–100, 0 = full
  tiredness: number;    // 0–100, 0 = rested
  happiness: number;    // 0–100, 100 = max
  health: number;       // 0–100, 100 = full health
  bondLevel: number;    // 0–100, 100 = fully bonded
  siblingId?: string;   // linked sibling
  roomId: string;
  bedId?: string;
  collarColour?: string; // set when becomes pet
}

export interface GameState {
  userId: string;
  animals: Animal[];
  pets: Animal[];       // animals with state === 'pet'
  level: number;
  totalRescued: number;
  inventory: Inventory;
  unlockedSpecies: Species[];
  houseUpgrades: string[];
}

export interface Inventory {
  food: FoodItem[];
  treats: number;
  pooBags: number;
  toys: string[];
  blankets: string[];
  decorations: string[];
}

export interface FoodItem {
  type: string;
  forSpecies: Species[];
  quantity: number;
}

export interface User {
  id: string;
  username: string;
  avatarEmoji: string;
  avatarBgColour: string;
  joinCode: string;
  createdAt: string;
  lastSeenAt: string;
}

export interface Gift {
  id: string;
  fromUser: string;
  toUser: string;
  giftType: 'treat_bundle' | 'toy' | 'blanket_pattern' | 'decoration';
  messagePresetCode: string;
  sentAt: string;
  claimedAt?: string;
}

export interface Badge {
  code: string;
  name: string;
  description: string;
}

export interface RescueStats {
  userId: string;
  catsRescued: number;
  dogsRescued: number;
  bunniesRescued: number;
  foxesRescued: number;
  snakesRescued: number;
  parrotsRescued: number;
  batsRescued: number;
  totalRescued: number;
  badgesUnlockedCount: number;
  giftsSentCount: number;
  giftsReceivedCount: number;
}
