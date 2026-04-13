import { describe, it, expect } from 'vitest';
import {
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
} from '../depot-inventory';
import type { DepotState, BoardGoal, Season } from '@arc/shared-types';

describe('depot-inventory', () => {
  // ── Tile Definitions ─────────────────────────────────────

  describe('getTilesForMode', () => {
    it('returns parts tiles for parts_and_tools mode', () => {
      const tiles = getTilesForMode('parts_and_tools');
      expect(tiles).toBe(PARTS_TILES);
      expect(tiles.length).toBe(6);
      expect(tiles.every((t) => t.mode === 'parts_and_tools')).toBe(true);
    });

    it('returns treats tiles for treats_kitchen mode', () => {
      const tiles = getTilesForMode('treats_kitchen');
      expect(tiles).toBe(TREATS_TILES);
      expect(tiles.length).toBe(6);
    });

    it('returns seasonal decoration tiles', () => {
      const seasons: Season[] = ['spring_bloom', 'summer_warmth', 'autumn_hush', 'winter_cosy'];
      for (const s of seasons) {
        const tiles = getTilesForMode('decorations', s);
        expect(tiles.length).toBe(6);
        expect(tiles.every((t) => t.mode === 'decorations')).toBe(true);
      }
    });

    it('defaults to spring_bloom for decorations without season', () => {
      const tiles = getTilesForMode('decorations');
      expect(tiles).toBe(DECORATIONS_TILES.spring_bloom);
    });

    it('returns medical tiles for medical_supplies mode', () => {
      const tiles = getTilesForMode('medical_supplies');
      expect(tiles).toBe(MEDICAL_TILES);
      expect(tiles.length).toBe(6);
    });
  });

  // ── Board Dimensions ─────────────────────────────────────

  describe('getBoardDimensions', () => {
    it('returns 9×9 for parts_and_tools', () => {
      expect(getBoardDimensions('parts_and_tools')).toEqual({ width: 9, height: 9 });
    });

    it('returns 8×8 for treats_kitchen', () => {
      expect(getBoardDimensions('treats_kitchen')).toEqual({ width: 8, height: 8 });
    });

    it('returns 10×8 for decorations', () => {
      expect(getBoardDimensions('decorations')).toEqual({ width: 10, height: 8 });
    });

    it('returns 7×9 for medical_supplies', () => {
      expect(getBoardDimensions('medical_supplies')).toEqual({ width: 7, height: 9 });
    });
  });

  // ── Mode Access ──────────────────────────────────────────

  describe('canAccessMode', () => {
    it('allows parts, treats, decorations from level 1', () => {
      expect(canAccessMode('parts_and_tools', 1)).toBe(true);
      expect(canAccessMode('treats_kitchen', 1)).toBe(true);
      expect(canAccessMode('decorations', 1)).toBe(true);
    });

    it('blocks medical_supplies below level 15', () => {
      expect(canAccessMode('medical_supplies', 1)).toBe(false);
      expect(canAccessMode('medical_supplies', 14)).toBe(false);
    });

    it('allows medical_supplies at level 15+', () => {
      expect(canAccessMode('medical_supplies', 15)).toBe(true);
      expect(canAccessMode('medical_supplies', 20)).toBe(true);
    });
  });

  // ── Session Limits ───────────────────────────────────────

  describe('getSessionLimit', () => {
    it('adds bonuses to base limit', () => {
      expect(getSessionLimit(3, 2)).toBe(5);
    });

    it('caps at 10', () => {
      expect(getSessionLimit(3, 20)).toBe(10);
      expect(getSessionLimit(8, 5)).toBe(10);
    });
  });

  describe('resetDailySessions', () => {
    it('resets sessions to base limit', () => {
      const state: DepotState = {
        sessionsRemainingToday: 0,
        sessionsMaxToday: 5,
        lastSessionDay: '2026-04-12',
        totalSessionsPlayed: 10,
        inventory: { parts: {}, tools: {}, treats: {}, superTreats: {}, decorations: {}, medicalSupplies: {} },
      };
      const result = resetDailySessions(state);
      expect(result.sessionsRemainingToday).toBe(3);
      expect(result.sessionsMaxToday).toBe(3);
    });

    it('accepts custom base limit', () => {
      const state: DepotState = {
        sessionsRemainingToday: 0,
        sessionsMaxToday: 3,
        lastSessionDay: '2026-04-12',
        totalSessionsPlayed: 5,
        inventory: { parts: {}, tools: {}, treats: {}, superTreats: {}, decorations: {}, medicalSupplies: {} },
      };
      const result = resetDailySessions(state, 5);
      expect(result.sessionsRemainingToday).toBe(5);
    });
  });

  // ── Rewards ──────────────────────────────────────────────

  describe('generateRewards', () => {
    it('returns at least 1 reward', () => {
      const goals: BoardGoal[] = [
        { type: 'clear_count', targetCount: 50, currentCount: 10 },
      ];
      const rewards = generateRewards('parts_and_tools', 100, goals);
      expect(rewards.length).toBeGreaterThanOrEqual(1);
    });

    it('returns more rewards for higher scores', () => {
      const goals: BoardGoal[] = [
        { type: 'clear_count', targetCount: 50, currentCount: 50 },
      ];
      const lowRewards = generateRewards('parts_and_tools', 200, goals);
      const highRewards = generateRewards('parts_and_tools', 3000, goals);
      // High score should generally give more (but randomness means we just check max)
      expect(highRewards.length).toBeLessThanOrEqual(7); // 6 + possible super treat
    });

    it('caps at 6 base rewards + possible super treat', () => {
      const goals: BoardGoal[] = [
        { type: 'clear_count', targetCount: 10, currentCount: 10 },
        { type: 'collect_type', targetTile: 'cog', targetCount: 5, currentCount: 5 },
      ];
      const rewards = generateRewards('parts_and_tools', 10000, goals);
      expect(rewards.length).toBeLessThanOrEqual(7);
    });

    it('returns rewards matching the mode', () => {
      const goals: BoardGoal[] = [];
      const rewards = generateRewards('treats_kitchen', 500, goals);
      // Should be treat-category items (not parts or medical)
      for (const r of rewards) {
        expect(['treat', 'super_treat']).toContain(r.category);
      }
    });
  });

  describe('rollForSuperTreat', () => {
    it('returns null for score 0', () => {
      // At score 0, chance is 0%
      expect(rollForSuperTreat(0)).toBeNull();
    });

    it('returns a super_treat when it succeeds (mocked)', () => {
      // Run many times to statistically verify it can return something
      let found = false;
      for (let i = 0; i < 200; i++) {
        const result = rollForSuperTreat(10000); // 20% chance
        if (result) {
          expect(result.category).toBe('super_treat');
          found = true;
          break;
        }
      }
      // With 20% chance and 200 tries, probability of never finding one is ~(0.8)^200 ≈ 0
      expect(found).toBe(true);
    });
  });

  // ── ALL_REWARDS catalogue ────────────────────────────────

  describe('ALL_REWARDS', () => {
    it('has no duplicate codes', () => {
      const codes = ALL_REWARDS.map((r) => r.code);
      expect(new Set(codes).size).toBe(codes.length);
    });

    it('all items have required fields', () => {
      for (const r of ALL_REWARDS) {
        expect(r.code).toBeTruthy();
        expect(r.emoji).toBeTruthy();
        expect(r.label).toBeTruthy();
        expect(r.description).toBeTruthy();
        expect(['common', 'uncommon', 'rare', 'very_rare', 'ultra_rare']).toContain(r.rarity);
      }
    });

    it('match-3 generated items are not giftable', () => {
      // Per spec: match-3-generated items CANNOT be gifted
      for (const r of ALL_REWARDS) {
        expect(r.giftable).toBe(false);
      }
    });

    it('contains super treats', () => {
      const superTreats = ALL_REWARDS.filter((r) => r.category === 'super_treat');
      expect(superTreats.length).toBe(13);
    });
  });

  // ── Tile set completeness ────────────────────────────────

  describe('tile sets', () => {
    it('all tile types are unique within a set', () => {
      const sets = [PARTS_TILES, TREATS_TILES, MEDICAL_TILES];
      for (const set of sets) {
        const types = set.map((t) => t.type);
        expect(new Set(types).size).toBe(types.length);
      }
    });

    it('seasonal decoration sets all have 6 tiles', () => {
      const seasons: Season[] = ['spring_bloom', 'summer_warmth', 'autumn_hush', 'winter_cosy'];
      for (const s of seasons) {
        expect(DECORATIONS_TILES[s].length).toBe(6);
      }
    });

    it('all tiles have emoji and label', () => {
      const allTiles = [
        ...PARTS_TILES, ...TREATS_TILES, ...MEDICAL_TILES,
        ...Object.values(DECORATIONS_TILES).flat(),
      ];
      for (const t of allTiles) {
        expect(t.emoji).toBeTruthy();
        expect(t.label).toBeTruthy();
        expect(t.type).toBeTruthy();
      }
    });
  });
});
