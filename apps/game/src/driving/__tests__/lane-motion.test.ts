import { describe, it, expect } from 'vitest';
import {
  BASE_FOLLOW_MPS, LANE_M, RESERVATION_M, ROAD_M, SIDESTEP_MPS, TRUNK_LANE_M, TRUNK_M,
  createLaneState, laneOffset, roadWidth, stepLane, type LaneState,
} from '../lane-motion';

// Keep left is lane 0; lane 1 is the overtaking side. Offsets are metres from
// the route's centreline, negative to the left.

describe('lane offsets', () => {
  it('an ordinary road is one lane each way: a lane is half the road', () => {
    expect(laneOffset(0, 'tertiary')).toBe(-2.5);
    expect(laneOffset(1, 'tertiary')).toBe(2.5);
    expect(laneOffset(0, 'secondary')).toBe(-2.5);
    expect(laneOffset(0, 'unclassified')).toBe(-2.25);
    expect(laneOffset(1, 'residential')).toBe(2);
    expect(laneOffset(0, 'service')).toBe(-2);   // unknown class: 8 m
  });

  it('with no class it answers for two LANE_M lanes', () => {
    expect(laneOffset(0, null)).toBe(-LANE_M / 2);
    expect(laneOffset(1, null)).toBe(LANE_M / 2);
  });

  it('a farm track is single and unmarked: both lanes are the middle', () => {
    expect(laneOffset(0, 'track')).toBe(0);
    expect(laneOffset(1, 'track')).toBe(0);
  });

  it('every other road puts a lane centre a quarter of its width from the centreline, as the spike does', () => {
    for (const [cls, w] of Object.entries(ROAD_M)) {
      if (cls === 'track') continue;
      expect(laneOffset(0, cls)).toBe(-w / 4);
      expect(laneOffset(1, cls)).toBe(w / 4);
    }
  });

  it('the dual carriageway is two true 5 m lanes each way, both of ours left of the grass', () => {
    expect(TRUNK_LANE_M).toBe(LANE_M);
    expect(RESERVATION_M).toBe(1.6);
    expect(TRUNK_M).toBeCloseTo(21.6, 12);
    expect(roadWidth('trunk')).toBe(TRUNK_M);
    expect(laneOffset(0, 'trunk')).toBeCloseTo(-(0.8 + 7.5), 12);
    expect(laneOffset(1, 'trunk')).toBeCloseTo(-(0.8 + 2.5), 12);
    // each lane centre is half a lane in from its lines
    expect(laneOffset(1, 'trunk') + TRUNK_LANE_M / 2).toBeCloseTo(-RESERVATION_M / 2, 12);
    expect(laneOffset(0, 'trunk') - TRUNK_LANE_M / 2).toBeCloseTo(-roadWidth('trunk') / 2, 12);
  });

  it('at the 0.62 zoom cap the big road is about 300 px across', () => {
    expect(TRUNK_M * 22 * 0.62).toBeCloseTo(294.6, 1);
  });
});

describe('the sidestep', () => {
  const run = (s: LaneState, off0: number, off1: number, seconds: number, fps = 60) => {
    let step = stepLane(s, off0, off1, 1 / fps);
    for (let i = 1; i < seconds * fps; i++) step = stepLane(step.state, off0, off1, 1 / fps);
    return step;
  };

  it('starts in the keep-left lane', () => {
    const first = stepLane(createLaneState(), -2.5, 2.5, 1 / 60);
    expect(first.offset).toBe(-2.5);
    expect(first.swerveMps).toBe(0);
  });

  it('crosses a 5 m lane change at SIDESTEP_MPS, and that is the swerve', () => {
    expect(SIDESTEP_MPS).toBe(7);
    const s0 = { ...stepLane(createLaneState(), -2.5, 2.5, 1 / 60).state, want: 1 as const };
    const mid = stepLane(s0, -2.5, 2.5, 1 / 60);
    expect(mid.swerveMps).toBeCloseTo(7, 9);
    expect(mid.offset).toBeCloseTo(-2.5 + 7 / 60, 9);
    // 5 m at 7 m/s is 0.714 s
    expect(run(s0, -2.5, 2.5, 0.7).offset).toBeLessThan(2.5);
    const done = run(s0, -2.5, 2.5, 0.75);
    expect(done.offset).toBeCloseTo(2.5, 9);
    expect(done.swerveMps).toBe(0);
  });

  it('the road moving under the van is followed at BASE_FOLLOW_MPS and is never a swerve', () => {
    // Joining the dual carriageway: lane 0 moves from -2.5 to -8.3.
    const s0 = stepLane(createLaneState(), -2.5, 2.5, 1 / 60).state;
    const off0 = laneOffset(0, 'trunk'), off1 = laneOffset(1, 'trunk');
    let step = stepLane(s0, off0, off1, 1 / 60);
    expect(step.offset).toBeCloseTo(-2.5 - BASE_FOLLOW_MPS / 60, 9);
    for (let i = 0; i < 120; i++) {
      step = stepLane(step.state, off0, off1, 1 / 60);
      expect(step.swerveMps).toBe(0);
    }
    expect(step.offset).toBeCloseTo(off0, 9);
  });

  it('on a farm track the van keeps to the middle whatever the child asks', () => {
    const s0 = { ...createLaneState(), base: 0, want: 1 as const };
    expect(run(s0, 0, 0, 2).offset).toBe(0);
  });
});
