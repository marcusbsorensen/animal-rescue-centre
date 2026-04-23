/**
 * Task-driven in-game time progression — pure logic.
 *
 * The in-game clock advances by "care tasks completed", not by the
 * wall clock. Feeding, walking, grooming, etc. each bump a counter;
 * when the counter hits the per-phase threshold, time rolls to the
 * next phase (morning → afternoon → evening → night → morning-of-next-day).
 *
 * This makes the clock feel like a progression reward: helpers,
 * trained pets and tools LOWER the threshold, so levelling up
 * literally makes days go faster. Lily at level 1 sees the sun move
 * slowly; by level 9 she's chasing evenings to unlock bat bonding.
 *
 * Everything here is pure — no IO, no mutation.
 */

import type {
  Animal,
  TimeOfDay,
  TimeProgress,
  CareTaskType,
} from '@arc/shared-types';

// ── Phase order ──────────────────────────────────────────────

const PHASE_ORDER: TimeOfDay[] = ['morning', 'afternoon', 'evening', 'night'];

/** Index of a phase in the day cycle. */
export function phaseIndex(phase: TimeOfDay): number {
  return PHASE_ORDER.indexOf(phase);
}

/** The next phase in the cycle (night → morning wraps to a new day). */
export function nextPhase(phase: TimeOfDay): TimeOfDay {
  const i = phaseIndex(phase);
  return PHASE_ORDER[(i + 1) % PHASE_ORDER.length];
}

// ── Task weights ─────────────────────────────────────────────

/**
 * How many "ticks" a given care task contributes toward the next
 * phase advance. Most tasks = 1; big missions count more.
 */
const TASK_WEIGHT: Record<CareTaskType, number> = {
  feed:                 1,
  walk:                 1,
  play:                 1,
  groom:                1,
  heal:                 1,
  welcome:              1,
  bond:                 1,
  garden_let_out:       1,
  garden_bring_in:      1,
  conflict_resolve:     1,
  supply_run_complete:  3,   // big mission — counts as several
};

export function getTaskWeight(task: CareTaskType): number {
  return TASK_WEIGHT[task];
}

// ── Tasks-per-phase calculation ──────────────────────────────

/**
 * Base tasks-per-phase by level bracket. Early game is slow (12
 * tasks per phase = 48 per day); late game is brisk (6 tasks per
 * phase = 24 per day).
 */
export function baseTasksPerPhase(level: number): number {
  if (level >= 9) return 6;
  if (level >= 6) return 8;
  if (level >= 3) return 10;
  return 12;
}

/**
 * Helper multipliers reduce tasks-per-phase. Stackable up to a 50%
 * floor so it never feels frantic.
 *
 * - Volunteer hired:       −15% (available from L5, costs coins/day)
 * - Trained chaperone pet: −10% per bonded pet at 100 (caps at 3)
 * - Weekend boost:         −20% (real Saturday/Sunday)
 * - Auto-feeder tool:      no time effect (see design note —
 *                          auto-feeds still count as tasks)
 */
export interface HelperModifiers {
  volunteerHired?: boolean;
  fullyBondedPets?: number;   // count of pets at bondLevel 100
  isWeekend?: boolean;
}

export function computeTasksPerPhase(
  level: number,
  helpers: HelperModifiers = {},
): number {
  const base = baseTasksPerPhase(level);
  let multiplier = 1;
  if (helpers.volunteerHired) multiplier -= 0.15;
  const bondedPets = Math.min(3, helpers.fullyBondedPets ?? 0);
  multiplier -= bondedPets * 0.10;
  if (helpers.isWeekend) multiplier -= 0.20;
  // Floor at 0.5 — never below half the base threshold.
  if (multiplier < 0.5) multiplier = 0.5;
  return Math.max(1, Math.round(base * multiplier));
}

// ── State initialisation ─────────────────────────────────────

/**
 * Create a fresh TimeProgress. Defaults to morning on first load.
 * `now` is injectable for deterministic tests.
 */
export function createTimeProgress(
  level: number,
  helpers: HelperModifiers = {},
  now: Date = new Date(),
): TimeProgress {
  return {
    currentPhase: 'morning',
    tasksThisPhase: 0,
    tasksPerPhase: computeTasksPerPhase(level, helpers),
    lastPhaseAdvanceAt: now.toISOString(),
  };
}

// ── Recording a task ─────────────────────────────────────────

export interface RecordTaskResult {
  progress: TimeProgress;
  /** True if this task advanced the phase (UI should sparkle). */
  phaseAdvanced: boolean;
  /** True if the advance rolled past night into a new day. */
  dayRolled: boolean;
  /** The phase we landed on (unchanged if no advance). */
  newPhase: TimeOfDay;
}

/**
 * Record one care task against the current phase. Advances phase
 * when the counter meets the threshold. Never advances more than
 * one phase per call — big weighted tasks (supply runs) carry
 * excess into the next phase's counter rather than skipping phases.
 */
export function recordCareTask(
  progress: TimeProgress,
  task: CareTaskType,
  now: Date = new Date(),
): RecordTaskResult {
  const weight = getTaskWeight(task);
  const newCount = progress.tasksThisPhase + weight;

  if (newCount < progress.tasksPerPhase) {
    return {
      progress: { ...progress, tasksThisPhase: newCount },
      phaseAdvanced: false,
      dayRolled: false,
      newPhase: progress.currentPhase,
    };
  }

  // Advance one phase; carry any excess into the next counter.
  const carry = newCount - progress.tasksPerPhase;
  const landed = nextPhase(progress.currentPhase);
  const dayRolled = progress.currentPhase === 'night';

  return {
    progress: {
      ...progress,
      currentPhase: landed,
      tasksThisPhase: carry,
      lastPhaseAdvanceAt: now.toISOString(),
    },
    phaseAdvanced: true,
    dayRolled,
    newPhase: landed,
  };
}

// ── Threshold refresh ────────────────────────────────────────

/**
 * Recompute `tasksPerPhase` when level or helpers change mid-game.
 * Preserves the current phase and task counter (so a mid-phase
 * threshold drop doesn't erase progress).
 */
export function refreshTasksPerPhase(
  progress: TimeProgress,
  level: number,
  helpers: HelperModifiers = {},
): TimeProgress {
  const newThreshold = computeTasksPerPhase(level, helpers);
  if (newThreshold === progress.tasksPerPhase) return progress;
  // Clamp counter in case the threshold dropped below current count.
  const tasksThisPhase = Math.min(progress.tasksThisPhase, newThreshold - 1);
  return { ...progress, tasksPerPhase: newThreshold, tasksThisPhase };
}

// ── Helper counter from game state ───────────────────────────

/**
 * Count pets at bondLevel 100 — these act as implicit "trained
 * helpers" that reduce the tasks-per-phase requirement.
 */
export function countFullyBondedPets(animals: Animal[]): number {
  return animals.filter((a) => a.state === 'pet' && a.bondLevel >= 100).length;
}

// ── Real-world day check ─────────────────────────────────────

/** Is the given date a Saturday or Sunday (player's local TZ)? */
export function isWeekend(now: Date = new Date()): boolean {
  const d = now.getDay();
  return d === 0 || d === 6;
}
