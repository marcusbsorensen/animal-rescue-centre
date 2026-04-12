import type { RescueStats } from '@arc/shared-types';

export type BadgeCriterion = (stats: RescueStats & { extras: BadgeExtras }) => boolean;

export interface BadgeExtras {
  totalBonded: number;
  siblingPairsReunited: number;
  selfHealed: number;
  walksWithoutIncident: number;
  animalsTrained: number;
  conflictsResolved: number;
  houseUpgrades: number;
  totalPets: number;
  consecutiveDays: number;
  totalDaysPlayed: number;
  playerNumber: number; // signup order
  level: number;
}

export interface BadgeDefinition {
  code: string;
  name: string;
  description: string;
  criterion: BadgeCriterion;
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    code: 'first_rescue',
    name: 'First Friend',
    description: 'Rescue your first animal',
    criterion: (s) => s.totalRescued >= 1,
  },
  {
    code: 'first_bond',
    name: 'Heart Connection',
    description: 'Fully bond with your first pet',
    criterion: (s) => s.extras.totalBonded >= 1,
  },
  {
    code: 'sibling_reunion',
    name: 'Together Again',
    description: 'Rescue a sibling pair',
    criterion: (s) => s.extras.siblingPairsReunited >= 1,
  },
  {
    code: 'all_mammals',
    name: 'Fluffy Five',
    description: 'Rescue one of every mammal species',
    criterion: (s) =>
      s.catsRescued >= 1 &&
      s.dogsRescued >= 1 &&
      s.foxesRescued >= 1 &&
      s.bunniesRescued >= 1 &&
      s.batsRescued >= 1,
  },
  {
    code: 'all_species',
    name: 'Full Menagerie',
    description: 'Rescue one of every species',
    criterion: (s) =>
      s.catsRescued >= 1 &&
      s.dogsRescued >= 1 &&
      s.foxesRescued >= 1 &&
      s.bunniesRescued >= 1 &&
      s.batsRescued >= 1 &&
      s.parrotsRescued >= 1 &&
      s.snakesRescued >= 1,
  },
  {
    code: 'snake_friend',
    name: 'Scale Whisperer',
    description: 'Rescue 5 snakes',
    criterion: (s) => s.snakesRescued >= 5,
  },
  {
    code: 'bat_friend',
    name: 'Night Keeper',
    description: 'Rescue 5 bats',
    criterion: (s) => s.batsRescued >= 5,
  },
  {
    code: 'parrot_friend',
    name: 'Feather Talker',
    description: 'Rescue 5 parrots',
    criterion: (s) => s.parrotsRescued >= 5,
  },
  {
    code: 'fox_friend',
    name: 'Bramble Buddy',
    description: 'Rescue 5 foxes',
    criterion: (s) => s.foxesRescued >= 5,
  },
  {
    code: 'vet_apprentice',
    name: 'Vet in Training',
    description: 'Heal your first sick animal yourself',
    criterion: (s) => s.extras.selfHealed >= 1,
  },
  {
    code: 'vet_pro',
    name: 'Trusted Vet',
    description: 'Heal 20 animals yourself',
    criterion: (s) => s.extras.selfHealed >= 20,
  },
  {
    code: 'good_walker',
    name: 'Pavement Pro',
    description: 'Complete 10 walks without a road incident',
    criterion: (s) => s.extras.walksWithoutIncident >= 10,
  },
  {
    code: 'trainer',
    name: 'Patient Teacher',
    description: 'Train 10 animals',
    criterion: (s) => s.extras.animalsTrained >= 10,
  },
  {
    code: 'peacekeeper',
    name: 'Peacemaker',
    description: 'Resolve 10 pet conflicts',
    criterion: (s) => s.extras.conflictsResolved >= 10,
  },
  {
    code: 'cosy_centre',
    name: 'Cosy Up',
    description: 'Unlock your first house upgrade',
    criterion: (s) => s.extras.houseUpgrades >= 1,
  },
  {
    code: 'grand_centre',
    name: 'Grand Rescue',
    description: 'Reach 50 pets',
    criterion: (s) => s.extras.totalPets >= 50,
  },
  {
    code: 'giver',
    name: 'Kind Heart',
    description: 'Send 5 gifts',
    criterion: (s) => s.giftsSentCount >= 5,
  },
  {
    code: 'generous',
    name: 'Generous Soul',
    description: 'Send 25 gifts',
    criterion: (s) => s.giftsSentCount >= 25,
  },
  {
    code: 'receiver',
    name: 'Well-Loved',
    description: 'Receive 10 gifts',
    criterion: (s) => s.giftsReceivedCount >= 10,
  },
  {
    code: 'level_10',
    name: 'Ten Up',
    description: 'Reach level 10',
    criterion: (s) => s.extras.level >= 10,
  },
  {
    code: 'level_25',
    name: 'Quarter Century',
    description: 'Reach level 25',
    criterion: (s) => s.extras.level >= 25,
  },
  {
    code: 'level_50',
    name: 'Half Ton',
    description: 'Reach level 50',
    criterion: (s) => s.extras.level >= 50,
  },
  {
    code: 'daily_week',
    name: 'Weekly Carer',
    description: 'Play 7 days in a row',
    criterion: (s) => s.extras.consecutiveDays >= 7,
  },
  {
    code: 'daily_month',
    name: 'Monthly Carer',
    description: 'Play 30 days (any pattern)',
    criterion: (s) => s.extras.totalDaysPlayed >= 30,
  },
  {
    code: 'early_supporter',
    name: 'Founding Friend',
    description: 'Among the first 50 players ever',
    criterion: (s) => s.extras.playerNumber <= 50,
  },
];
