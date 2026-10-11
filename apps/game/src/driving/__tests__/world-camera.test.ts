import { describe, it, expect } from 'vitest';
import type { RoadGraph } from '../road-router';
import { atDistance, routePathFromNodes, type RoutePath } from '../route-path';
import {
  BASE_PPM, BIG_ROAD_ZOOM, CAM_EASE, LOOKAHEAD_M, SPIKE_CAM_EASE, VAN_WIDTH_M,
  cameraAim, easeCameraHeading, easeCameraHeadingSpike, easeZoom, pixelsPerMetre,
  vanScreenPoint, vanScreenRotation, vanWidthFraction, worldToScreen, wrapAngle, zoomTarget,
} from '../world-camera';
import { LANE_M } from '../lane-motion';
import { GEAR_SPEED_MPS } from '../road-gears';
import { anchorRoutes, vertexTurns } from './real-graph';

// The claims in docs/driving-rebuild-2026-10-11.md ("What is proved, and
// where"), measured here on the installed Birchie graph rather than on one
// route someone happened to drive in the spike.

const DEG = 180 / Math.PI;
const SAMPLE_S = 1 / 30;
/** Third gear, the fastest the van goes, which is the worst case. */
const V = GEAR_SPEED_MPS[3];

/** Drive a whole route at speed v, stepping the camera at fps, and sample its
 *  heading every 1/30 s. Returns [distance, |change since last sample|]. */
function cameraSamples(route: RoutePath, v: number, fps = 60): { s: number; change: number }[] {
  const out: { s: number; change: number }[] = [];
  const perSample = Math.round(fps * SAMPLE_S);
  let cam: number | null = null, prev = 0;
  for (let f = 0, s = 0; s < route.length; f++, s += v / fps) {
    cam = easeCameraHeading(cam, cameraAim(route, s), 1 / fps);
    if (f % perSample === 0) {
      if (f > 0) out.push({ s, change: Math.abs(wrapAngle(cam - prev)) });
      prev = cam;
    }
  }
  return out;
}

describe('the camera hides the route\'s corners (real graph, 210 routes, third gear)', () => {
  const routes = anchorRoutes();
  const driven = routes.map(({ route }) => ({ route, turns: vertexTurns(route), samples: cameraSamples(route, V) }));

  it('the route itself snaps by 55° and more at a node', () => {
    // The spike measured 55° on one route. Across every route between named
    // places the graph's real junction turns go much further: 149.6°, and
    // 1348 of 17354 vertex turns exceed 55°. The route's own heading takes
    // each one in a single sample.
    const all = driven.flatMap((d) => d.turns.map((t) => Math.abs(t.turn) * DEG));
    expect(Math.max(...all)).toBeGreaterThan(140);
    expect(all.filter((t) => t > 55).length).toBeGreaterThan(1000);
  });

  it('through a lone corner of up to 60°, the camera turns at most 2° per 1/30 s', () => {
    // A corner is alone when no other vertex within 45 m turns more than 5°.
    // Measured worst: 1.86° per sample, against the route's own snap of up to
    // 60° in one sample. That is the spec's "1° per frame-sample, against the
    // route's 7°", at the van's top speed.
    let worst = 0, corners = 0;
    for (const d of driven) for (const c of lone(d.turns)) {
      if (Math.abs(c.turn) * DEG > 60) continue;
      corners++;
      worst = Math.max(worst, windowMax(d.samples, c.s));
    }
    expect(corners).toBeGreaterThan(1000);
    expect(worst * DEG).toBeLessThanOrEqual(2);
  });

  it('through any lone corner, the camera turns at most 1/20 of it per sample', () => {
    // The aim swings through the corner over LOOKAHEAD_M of travel, so the
    // camera spreads it over ~1 s at 20 m/s, ~30 samples. Measured worst
    // ratio: 1/24.6 (a 128° corner, 5.2° per sample).
    let worst = 0, corners = 0;
    for (const d of driven) for (const c of lone(d.turns)) {
      if (Math.abs(c.turn) * DEG < 20) continue;
      corners++;
      worst = Math.max(worst, windowMax(d.samples, c.s) / Math.abs(c.turn));
    }
    expect(corners).toBeGreaterThan(300);
    expect(worst).toBeLessThanOrEqual(1 / 20);
  });

  it('across every metre of every route, 95% of samples turn the camera under 1°', () => {
    // Corners that come in clusters (a junction straight after a bend) add up,
    // so lone corners are not the whole story. Measured over all 210 routes
    // at 20 m/s: median 0.02°, 95th percentile 0.91°, 99th 2.47°, worst 7.7°,
    // the worst where the route itself snaps 149.6°.
    const changes = driven.flatMap((d) => d.samples.map((x) => x.change * DEG)).sort((a, b) => a - b);
    expect(changes[Math.floor(changes.length * 0.95)]).toBeLessThan(1);
    expect(changes[Math.floor(changes.length * 0.99)]).toBeLessThan(2.5);
    expect(changes[changes.length - 1]).toBeLessThan(8);
  });
});

/** Turns over 5° with nothing else over 5° within 45 m. */
function lone(turns: { s: number; turn: number }[]): { s: number; turn: number }[] {
  const big = turns.filter((t) => Math.abs(t.turn) * DEG > 5);
  return big.filter((t) => !big.some((o) => o !== t && Math.abs(o.s - t.s) <= 45));
}

/** The largest camera change sampled within 25 m of distance s. */
function windowMax(samples: { s: number; change: number }[], s: number): number {
  let m = 0;
  for (const x of samples) if (x.s > s - 25 && x.s < s + 25) m = Math.max(m, x.change);
  return m;
}

describe('easing is frame-rate independent', () => {
  it('k is chosen so one 60 fps step closes what the spike\'s did', () => {
    expect(SPIKE_CAM_EASE).toBe(3.4);
    expect(CAM_EASE).toBeCloseTo(3.5, 2);
    const spike = easeCameraHeadingSpike(0, 1, 1 / 60);
    expect(easeCameraHeading(0, 1, 1 / 60)).toBeCloseTo(spike, 12);
  });

  function settle(fps: number, ease: typeof easeCameraHeading, seconds = 2): number {
    let cam: number | null = 0;
    for (let i = 0; i < seconds * fps; i++) cam = ease(cam, Math.PI / 3, 1 / fps);
    return cam!;
  }

  it('30, 60 and 120 fps reach the same heading after 2 s towards a fixed aim', () => {
    const at = [30, 60, 120].map((fps) => settle(fps, easeCameraHeading));
    // 60° away to start, 0.055° left after 2 s, the same at every rate.
    expect(Math.abs(at[0] - at[2]) * DEG).toBeLessThan(1e-9);
    expect(Math.abs(at[1] - at[2]) * DEG).toBeLessThan(1e-9);
    // The spike's form does not: 30 and 120 fps end 0.018° apart.
    const spike = [30, 120].map((fps) => settle(fps, easeCameraHeadingSpike));
    expect(Math.abs(spike[0] - spike[1]) * DEG).toBeGreaterThan(0.01);
  });

  it('30, 60 and 120 fps agree within 0.5° after 2 s driving through any real corner', () => {
    // Every corner of 30° or more on the 210 routes (2298 of them), from 30 m
    // before it, at 20 m/s. The van moves, then the camera aims, as in the
    // spike's step(). What is left is the aim being sampled less often at
    // 30 fps, not the easing: measured worst 0.40°. The spike's easing in the
    // same drive: 1.05°.
    const spread = (ease: typeof easeCameraHeading) => {
      let worst = 0;
      for (const { route } of anchorRoutes()) for (const t of vertexTurns(route)) {
        if (Math.abs(t.turn) * DEG < 30 || t.s < 40) continue;
        const start = t.s - 30;
        const drive = (fps: number) => {
          let cam: number | null = null;
          for (let i = 0; i < 2 * fps; i++) cam = ease(cam, cameraAim(route, start + (V * (i + 1)) / fps), 1 / fps);
          return cam!;
        };
        const [a, b, c] = [30, 60, 120].map(drive);
        worst = Math.max(worst, Math.abs(wrapAngle(a - c)), Math.abs(wrapAngle(b - c)));
      }
      return worst * DEG;
    };
    expect(spread(easeCameraHeading)).toBeLessThan(0.5);
    expect(spread(easeCameraHeadingSpike)).toBeGreaterThan(0.8);
  });

  it('takes the short way round across ±180°', () => {
    const next = easeCameraHeading(Math.PI - 0.1, -Math.PI + 0.1, 1 / 60);
    expect(Math.abs(wrapAngle(next - Math.PI))).toBeLessThan(0.1);
  });

  it('a camera with no heading yet takes the aim at once', () => {
    expect(easeCameraHeading(null, 1.2, 1 / 60)).toBe(1.2);
  });
});

describe('the aim', () => {
  // An L: east, then a right-angle turn south.
  const L: RoadGraph = { nodes: [[0, 0], [0.05, 0], [0.05, 0.05]], edges: [[0, 1, 'tertiary'], [1, 2, 'trunk']] };
  const r = routePathFromNodes(L, [0, 1, 2]);
  const corner = r.points[1].s;

  it('looks LOOKAHEAD_M ahead, so it starts turning before the corner', () => {
    expect(LOOKAHEAD_M).toBe(20);
    expect(cameraAim(r, corner - 30)).toBe(0);
    const half = cameraAim(r, corner - 10);   // 10 m east, 10 m south of here
    expect(half * DEG).toBeCloseTo(45, 6);
    expect(cameraAim(r, corner) * DEG).toBeCloseTo(90, 6);
  });

  it('falls back to the segment underfoot at the very end', () => {
    expect(cameraAim(r, r.length) * DEG).toBeCloseTo(90, 6);
  });

  it('zooms out on the dual carriageway and 40 m before it, only in the zoom trial', () => {
    expect(zoomTarget(r, corner - 50, 'zoom')).toBe(1);
    expect(zoomTarget(r, corner - 30, 'zoom')).toBe(BIG_ROAD_ZOOM);
    expect(zoomTarget(r, corner + 10, 'zoom')).toBe(BIG_ROAD_ZOOM);
    expect(zoomTarget(r, corner + 10, 'narrow')).toBe(1);
    let z = 1;
    for (let i = 0; i < 120; i++) z = easeZoom(z, BIG_ROAD_ZOOM, 1 / 60);
    expect(z).toBeCloseTo(BIG_ROAD_ZOOM + (1 - BIG_ROAD_ZOOM) * Math.exp(-3.2), 9);
  });
});

describe('the screen', () => {
  it('at the spike\'s scale on a 390 pt screen the van is 13.5% of the width (reference 13.5%, spike 13.6%)', () => {
    expect(BASE_PPM).toBe(22);
    expect(VAN_WIDTH_M).toBe(2.4);
    expect(vanWidthFraction(390)).toBeCloseTo(0.1354, 4);
    expect(Math.abs(vanWidthFraction(390) - 0.136)).toBeLessThan(0.001);
  });

  it('a 5 m lane is 110 px, and zoom scales it', () => {
    expect(LANE_M * pixelsPerMetre()).toBe(110);
    expect(LANE_M * pixelsPerMetre(BIG_ROAD_ZOOM)).toBeCloseTo(68.2, 9);
  });

  it('puts the van 53.5% across and 59% down', () => {
    expect(vanScreenPoint(390, 844)).toEqual({ x: 390 * 0.535, y: 844 * 0.59 });
  });

  it('draws the world so the camera heading points straight up the screen', () => {
    for (const camH of [0, 1, -2.5, Math.PI]) {
      const view = { x: 100, y: 200, camH, zoom: 1, screenW: 390, screenH: 844 };
      expect(worldToScreen(view, 100, 200)).toEqual(vanScreenPoint(390, 844));
      const ahead = worldToScreen(view, 100 + 10 * Math.cos(camH), 200 + 10 * Math.sin(camH));
      expect(ahead.x).toBeCloseTo(390 * 0.535, 9);
      expect(ahead.y).toBeCloseTo(844 * 0.59 - 220, 9);
      const right = worldToScreen(view, 100 + 10 * Math.cos(camH + Math.PI / 2), 200 + 10 * Math.sin(camH + Math.PI / 2));
      expect(right.x).toBeCloseTo(390 * 0.535 + 220, 9);
    }
  });

  it('turns the van in the frame by only its heading less the camera\'s', () => {
    expect(vanScreenRotation(1.0, 1.0)).toBe(0);
    expect(vanScreenRotation(0.2, 0.1)).toBeCloseTo(0.1, 12);
    expect(vanScreenRotation(-Math.PI + 0.05, Math.PI - 0.05)).toBeCloseTo(0.1, 12);
  });

  it('the van is drawn at its route position', () => {
    const L: RoadGraph = { nodes: [[0, 0], [0.05, 0]], edges: [[0, 1, 'tertiary']] };
    const r = routePathFromNodes(L, [0, 1]);
    const p = atDistance(r, 30);
    const view = { x: p.x, y: p.y, camH: cameraAim(r, 30), zoom: 1, screenW: 390, screenH: 844 };
    expect(worldToScreen(view, p.x, p.y)).toEqual(vanScreenPoint(390, 844));
  });
});
