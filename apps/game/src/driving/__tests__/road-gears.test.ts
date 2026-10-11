import { describe, it, expect } from 'vitest';
import { GEAR_OK, GEAR_SPEED_MPS, ROAD_NAME, gearVerdict, gearsFor, speedCameraFires, type ForwardGear } from '../road-gears';
import { graph, carriageways } from './real-graph';
import { buildAdjacency, roadClassAt, roadRunAt, routeProfile } from '../road-router';
import type { CarriagewayKind } from '../trunk-carriageways';

// docs/driving-rebuild-2026-10-11.md, "Gears are about choosing a speed":
//   trunk                    2-3  first gear: traffic beeping, pulling up behind
//   secondary, tertiary      any  -
//   unclassified, residential 1-2 too fast
//   track                    1    a dust storm the animals breathe

const MOVING = 10;

describe('every row of the spec table', () => {
  const cases: [string, ForwardGear, true | ['too-fast' | 'too-slow', string, string]][] = [
    ['trunk', 1, ['too-slow', 'beeping', 'queue']],
    ['trunk', 2, true],
    ['trunk', 3, true],
    ['secondary', 1, true], ['secondary', 2, true], ['secondary', 3, true],
    ['tertiary', 1, true], ['tertiary', 2, true], ['tertiary', 3, true],
    ['unclassified', 1, true], ['unclassified', 2, true],
    ['unclassified', 3, ['too-fast', 'too fast', 'speeding']],
    ['residential', 1, true], ['residential', 2, true],
    ['residential', 3, ['too-fast', 'slow down', 'speeding']],
    ['track', 1, true],
    ['track', 2, ['too-fast', 'dust!', 'dust']],
    ['track', 3, ['too-fast', 'dust!', 'dust']],
  ];
  it.each(cases)('%s in gear %s', (cls, gear, want) => {
    const v = gearVerdict(cls, gear, MOVING);
    expect(v.roadName).toBe(ROAD_NAME[cls]);
    if (want === true) expect(v.ok).toBe(true);
    else expect(v).toMatchObject({ ok: false, problem: want[0], label: want[1], cost: want[2] });
  });
});

describe('gearVerdict', () => {
  it('never tells off a van that is barely moving', () => {
    expect(gearVerdict('track', 3, 0.5).ok).toBe(true);
    expect(gearVerdict('trunk', 1, 0).ok).toBe(true);
    expect(gearVerdict('track', 3, 1).ok).toBe(false);
  });

  it('a class the table does not know takes any gear, under its own name', () => {
    expect(gearsFor('service')).toEqual([1, 2, 3]);
    expect(gearVerdict('service', 3, MOVING)).toEqual({ ok: true, roadName: 'service' });
  });

  it('covers every road class on the real graph', () => {
    for (const cls of new Set(graph.edges.map((e) => e[2]))) {
      expect(GEAR_OK[cls], cls).toBeDefined();
      expect(ROAD_NAME[cls], cls).toBeDefined();
    }
  });

  it('has the spike\'s gear speeds', () => {
    expect(GEAR_SPEED_MPS).toEqual({ 1: 7, 2: 13, 3: 20 });
  });
});

describe('speedCameraFires', () => {
  it('fires on too fast for the road, not on a fixed gear', () => {
    expect(speedCameraFires('residential', 3, MOVING)).toBe(true);
    expect(speedCameraFires('unclassified', 3, MOVING)).toBe(true);
    expect(speedCameraFires('track', 2, MOVING)).toBe(true);
    // Third gear is right for a main road and the dual carriageway.
    expect(speedCameraFires('secondary', 3, MOVING)).toBe(false);
    expect(speedCameraFires('trunk', 3, MOVING)).toBe(false);
  });

  it('never fires on a gear the road suits', () => {
    for (const [cls, ok] of Object.entries(GEAR_OK)) {
      for (const g of ok) expect(speedCameraFires(cls, g, MOVING), `${cls} ${g}`).toBe(false);
    }
  });

  it('never fires for too slow', () => {
    expect(gearVerdict('trunk', 1, MOVING).ok).toBe(false);
    expect(speedCameraFires('trunk', 1, MOVING)).toBe(false);
  });

  it('never fires on a van barely moving, or on a road the table does not know', () => {
    expect(speedCameraFires('track', 3, 0)).toBe(false);
    expect(speedCameraFires('service', 3, MOVING)).toBe(false);
  });
});

// ── The A28 by carriageway ──
//
// trunk-carriageways.json: the dual carriageway at 50 mph, the divided and
// single stretches at 30–40 mph. Third gear (about 45 mph) is within 50 and
// over 40; second (about 29 mph) is within 30.
describe('gears on the A28 follow its carriageway', () => {
  const kinds = (kind: CarriagewayKind, mph?: number) =>
    carriageways.all.filter((c) => c.kind === kind && (mph === undefined || c.maxspeedMph === mph));

  it('keeps the dual carriageway\'s gears on the real dual carriageway', () => {
    const dual = kinds('dual');
    expect(dual.length).toBeGreaterThan(0);
    for (const c of dual) {
      expect(gearsFor('trunk', c)).toEqual([2, 3]);
      expect(gearVerdict('trunk', 1, MOVING, c)).toMatchObject({ ok: false, problem: 'too-slow', label: 'beeping', roadName: 'dual carriageway' });
      expect(speedCameraFires('trunk', 3, MOVING, c)).toBe(false);
    }
  });

  it('makes third too fast, and first fine, on every divided and single stretch', () => {
    const lesser = [...kinds('divided'), ...kinds('single')];
    expect(lesser).toHaveLength(127);
    for (const c of lesser) {
      expect(gearsFor('trunk', c), `edge ${c.edge}`).toEqual([1, 2]);
      expect(gearVerdict('trunk', 1, MOVING, c)).toEqual({ ok: true, roadName: 'main road' });
      expect(gearVerdict('trunk', 3, MOVING, c)).toMatchObject({ ok: false, problem: 'too-fast', label: 'too fast', cost: 'speeding', roadName: 'main road' });
      expect(speedCameraFires('trunk', 3, MOVING, c), `edge ${c.edge}`).toBe(true);
      expect(speedCameraFires('trunk', 2, MOVING, c), `edge ${c.edge}`).toBe(false);
    }
  });

  it('the 30 mph road through The Square is not the 50 mph dual carriageway', () => {
    const square = kinds('single', 30)[0];
    const dual = kinds('dual')[0];
    expect(speedCameraFires('trunk', 3, MOVING, square)).toBe(true);
    expect(speedCameraFires('trunk', 3, MOVING, dual)).toBe(false);
    expect(speedCameraFires('trunk', 3, 0, square)).toBe(false); // barely moving
  });

  it('judges a trunk edge with no record as before, and ignores a carriageway on any other road', () => {
    expect(gearsFor('trunk')).toEqual([2, 3]);
    expect(gearsFor('trunk', null)).toEqual([2, 3]);
    const single = kinds('single')[0];
    expect(gearsFor('residential', single)).toEqual([1, 2]);
    expect(gearVerdict('residential', 1, MOVING, single)).toEqual({ ok: true, roadName: 'houses' });
  });
});

// What the scene's speed camera reads: the run under the van, carriageway and all.
describe('the route profile carries the carriageway', () => {
  const adj = buildAdjacency(graph);
  const from = (n: number) => ({ fx: graph.nodes[n][0], fy: graph.nodes[n][1] });
  const runs = () => {
    const out = [];
    const names = Object.keys(graph.anchors);
    for (const a of names) for (const b of names) {
      if (a !== b) out.push(...routeProfile(graph, adj, from(graph.anchors[a]), from(graph.anchors[b]), carriageways));
    }
    return out;
  };

  it('gives every trunk run a carriageway, and no other run one', () => {
    const all = runs();
    const trunk = all.filter((r) => r.roadClass === 'trunk');
    expect(trunk.length).toBeGreaterThan(0);
    for (const r of trunk) expect(r.carriageway).toBeDefined();
    for (const r of all) if (r.roadClass !== 'trunk') expect(r.carriageway).toBeUndefined();
    expect(new Set(trunk.map((r) => r.carriageway!.kind))).toEqual(new Set(['dual', 'divided', 'single']));
  });

  it('leaves the classes along every route as they were without the data', () => {
    const names = Object.keys(graph.anchors);
    for (const a of names) for (const b of names) {
      if (a === b) continue;
      const f = from(graph.anchors[a]), t = from(graph.anchors[b]);
      const plain = routeProfile(graph, adj, f, t);
      const rich = routeProfile(graph, adj, f, t, carriageways);
      // The data only splits trunk runs; the classes, and where they change, are as before.
      expect(rich.map((r) => r.roadClass).filter((c, i, arr) => c !== arr[i - 1]), `${a} -> ${b}`).toEqual(plain.map((r) => r.roadClass));
      expect(rich[rich.length - 1].untilProgress).toBeCloseTo(1, 9);
      for (let p = 0; p <= 1; p += 0.01) expect(roadRunAt(rich, p)?.roadClass, `${a} -> ${b} at ${p.toFixed(2)}`).toBe(roadClassAt(plain, p));
    }
  });
});
