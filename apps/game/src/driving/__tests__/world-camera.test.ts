import { describe, it, expect } from 'vitest';
import type { RoadGraph } from '../road-router';
import { atDistance, carriagewayAt, roadClassAt, routePathFromNodes, type RoutePath } from '../route-path';
import { parseTrunkCarriageways, type CarriagewayKind } from '../trunk-carriageways';
import {
  bigRoadAt, BIG_ROAD_ZOOM_AHEAD_M,
  ARRIVE_ZOOM_M, BASE_PPM, BIG_ROAD_ZOOM, CAM_EASE, LOOKAHEAD_M, SPIKE_CAM_EASE, VAN_WIDTH_M,
  ZOOM_ARRIVE, ZOOM_FAST, ZOOM_IN_RATE, ZOOM_OUT_RATE, ZOOM_STILL_LANE, ZOOM_STILL_ROAD,
  cameraAim, easeCameraHeading, easeCameraHeadingSpike, easeZoom, pixelsPerMetre,
  vanScreenPoint, vanScreenRotation, vanWidthFraction, worldToScreen, wrapAngle, zoomFor, zoomTarget,
} from '../world-camera';
import { LANE_M } from '../lane-motion';
import { GEAR_SPEED_MPS } from '../road-gears';
import { anchorRoutes, carriageways, vertexTurns } from './real-graph';

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
});

describe('the zoom follows speed and place', () => {
  /** A straight road of one class, 0.1 units east: about 626 m. */
  const straight = (cls: string): RoutePath =>
    routePathFromNodes({ nodes: [[0, 0], [0.1, 0]], edges: [[0, 1, cls]] }, [0, 1]);
  const FAR = 300;   // metres in, far from both ends

  it('standing still: 1.15 on a main road, 1.35 among houses, on a lane or a track', () => {
    expect([ZOOM_STILL_ROAD, ZOOM_STILL_LANE]).toEqual([1.15, 1.35]);
    for (const cls of ['secondary', 'tertiary']) expect(zoomTarget(straight(cls), FAR, 0)).toBe(1.15);
    for (const cls of ['residential', 'unclassified', 'track']) expect(zoomTarget(straight(cls), FAR, 0)).toBe(1.35);
  });

  it('at top speed (third gear, 20 m/s) 0.66 on any road, and linear in speed between', () => {
    expect(ZOOM_FAST).toBe(0.66);
    for (const cls of ['secondary', 'tertiary', 'residential', 'unclassified', 'track']) {
      expect(zoomTarget(straight(cls), FAR, V)).toBeCloseTo(0.66, 12);
      expect(zoomTarget(straight(cls), FAR, 2 * V)).toBeCloseTo(0.66, 12);   // never further than that
    }
    expect(zoomTarget(straight('tertiary'), FAR, V / 2)).toBeCloseTo((1.15 + 0.66) / 2, 12);
    expect(zoomTarget(straight('residential'), FAR, V / 4)).toBeCloseTo(1.35 + (0.66 - 1.35) / 4, 12);
  });

  it('rises to 1.6 over the last 120 m to the destination', () => {
    const r = straight('residential');
    expect([ZOOM_ARRIVE, ARRIVE_ZOOM_M]).toEqual([1.6, 120]);
    expect(zoomTarget(r, r.length - 120, 0)).toBe(1.35);
    expect(zoomTarget(r, r.length - 60, 0)).toBeCloseTo(1.35 + (1.6 - 1.35) / 2, 12);
    expect(zoomTarget(r, r.length - 30, 0)).toBeCloseTo(1.35 + (1.6 - 1.35) * 0.75, 12);
    expect(zoomTarget(r, r.length, 0)).toBeCloseTo(1.6, 12);
    // from whatever the speed would give, on any road
    const fast = zoomFor({ road: 'secondary', v: V, toGo: 30, bigAhead: false });
    expect(fast).toBeCloseTo(0.66 + (1.6 - 0.66) * 0.75, 12);
  });

  it('never closer than 0.62 on the dual carriageway or within 40 m of it', () => {
    // the L: tertiary east, then trunk south
    const L: RoadGraph = { nodes: [[0, 0], [0.05, 0], [0.05, 0.05]], edges: [[0, 1, 'tertiary'], [1, 2, 'trunk']] };
    const r = routePathFromNodes(L, [0, 1, 2]);
    const corner = r.points[1].s;
    expect(BIG_ROAD_ZOOM).toBe(0.62);
    expect(zoomTarget(r, corner - 50, 0)).toBe(1.15);
    expect(zoomTarget(r, corner - 30, 0)).toBe(BIG_ROAD_ZOOM);
    expect(zoomTarget(r, corner + 10, 0)).toBe(BIG_ROAD_ZOOM);
    // at speed the cap still holds: 0.66 would be too close for 21.6 m
    expect(zoomTarget(r, corner + 10, V)).toBe(BIG_ROAD_ZOOM);
    // and it beats the arrival zoom when the destination is on the big road
    expect(zoomTarget(r, r.length - 10, 0)).toBe(BIG_ROAD_ZOOM);
    // further out, top speed is its own 0.66
    expect(zoomTarget(r, corner - 50, V)).toBeCloseTo(0.66, 12);
  });

  it('only the real dual carriageway: a divided or single A28 stretch gets the main road\'s zoom', () => {
    const L: RoadGraph = { nodes: [[0, 0], [0.05, 0], [0.05, 0.05]], edges: [[0, 1, 'tertiary'], [1, 2, 'trunk']] };
    const data = (kind: CarriagewayKind, mph: number) => parseTrunkCarriageways({
      edges: [{ edge: 1, nodes: [1, 2], kind, maxspeedMph: mph, lanes: 2, oneway: null, lengthM: 196, osmWays: [] }],
    }, L);
    const at = (kind: CarriagewayKind, mph: number) => routePathFromNodes(L, [0, 1, 2], undefined, data(kind, mph));
    for (const [kind, mph] of [['divided', 40], ['single', 30]] as const) {
      const r = at(kind, mph);
      const corner = r.points[1].s;
      expect(bigRoadAt(r, corner + 10), kind).toBe(false);
      expect(zoomTarget(r, corner - 30, 0), kind).toBe(1.15);
      expect(zoomTarget(r, corner + 10, 0), kind).toBe(1.15);
      expect(zoomTarget(r, corner + 10, V), kind).toBeCloseTo(0.66, 12);
    }
    const dual = at('dual', 50);
    const corner = dual.points[1].s;
    expect(bigRoadAt(dual, corner + 10)).toBe(true);
    expect(zoomTarget(dual, corner - 30, 0)).toBe(BIG_ROAD_ZOOM);
    expect(zoomTarget(dual, corner + 10, V)).toBe(BIG_ROAD_ZOOM);
  });

  it('on the real A28, the cap holds only on or within 40 m of a dual edge', () => {
    let capped = 0, mainRoad = 0;
    for (const { route } of anchorRoutes(carriageways)) {
      for (let s = 0; s < route.length - ARRIVE_ZOOM_M; s += 25) {
        const z = zoomTarget(route, s, 0);
        const nearDual = [s, s + BIG_ROAD_ZOOM_AHEAD_M].some((d) => carriagewayAt(route, d)?.kind === 'dual');
        if (nearDual) { capped++; expect(z).toBe(BIG_ROAD_ZOOM); }
        else if (roadClassAt(route, s) === 'trunk') { mainRoad++; expect(z).toBe(ZOOM_STILL_ROAD); }
      }
    }
    expect(capped).toBeGreaterThan(0);
    expect(mainRoad).toBeGreaterThan(0);
  });

  /** zoom after `seconds` of easing towards a fixed target at `fps`. */
  const ease = (from: number, to: number, seconds: number, fps: number) => {
    let z = from;
    for (let i = 0; i < seconds * fps; i++) z = easeZoom(z, to, 1 / fps);
    return z;
  };

  it('eases multiplicatively, out at 1.5/s and in at 0.7/s', () => {
    expect([ZOOM_OUT_RATE, ZOOM_IN_RATE]).toEqual([1.5, 0.7]);
    // after t seconds the ratio left is (target / start) ^ exp(-rate t)
    expect(ease(1.35, 0.66, 1, 60)).toBeCloseTo(0.66 * (1.35 / 0.66) ** Math.exp(-1.5), 12);
    expect(ease(0.66, 1.35, 1, 60)).toBeCloseTo(1.35 * (0.66 / 1.35) ** Math.exp(-0.7), 12);
    // multiplicative: the same ratio closes in the same time, whatever the zoom
    expect(Math.log(ease(1.2, 0.6, 1, 60) / 0.6)).toBeCloseTo(Math.log(ease(0.8, 0.4, 1, 60) / 0.4), 12);
    expect(Math.log(ease(0.6, 1.2, 1, 60) / 1.2)).toBeCloseTo(Math.log(ease(0.4, 0.8, 1, 60) / 0.8), 12);
    // out is quicker than in: share of the ratio closed in one second
    const share = (from: number, to: number) => 1 - Math.log(ease(from, to, 1, 60) / to) / Math.log(from / to);
    expect(share(1.35, 0.66)).toBeCloseTo(1 - Math.exp(-1.5), 12);
    expect(share(0.66, 1.35)).toBeCloseTo(1 - Math.exp(-0.7), 12);
    expect(share(1.35, 0.66)).toBeGreaterThan(share(0.66, 1.35));
    // a zoom at its target stays there
    expect(easeZoom(1.15, 1.15, 1 / 60)).toBe(1.15);
  });

  it('closes the same amount per second at 30, 60 and 120 fps, both ways', () => {
    for (const [from, to] of [[1.35, 0.62], [0.66, 1.6]]) {
      const at60 = ease(from, to, 2, 60);
      expect(ease(from, to, 2, 30)).toBeCloseTo(at60, 12);
      expect(ease(from, to, 2, 120)).toBeCloseTo(at60, 12);
    }
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
