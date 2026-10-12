import { describe, it, expect } from 'vitest';
import { graph, carriageways, carriagewaysFile } from './real-graph';
import { isDual, parseTrunkCarriageways, type TrunkCarriagewaysFile } from '../trunk-carriageways';
import type { RoadGraph } from '../road-router';

// ── What the A28 really is ──
//
// trunk-carriageways.json gives every trunk edge of the installed graph a kind
// (dual, divided, single), a speed limit and lanes. Measured on the real file.

describe('parseTrunkCarriageways on the real data', () => {
  it('has a record for every trunk edge and none for any other', () => {
    const trunk = graph.edges.flatMap((e, i) => (e[2] === 'trunk' ? [i] : []));
    expect(trunk).toHaveLength(carriagewaysFile.summary.trunkEdges);
    expect(trunk).toHaveLength(184);
    for (const i of trunk) expect(carriageways.carriagewayOf(i), `edge ${i}`).not.toBeNull();
    graph.edges.forEach((e, i) => {
      if (e[2] !== 'trunk') expect(carriageways.carriagewayOf(i), `edge ${i}`).toBeNull();
    });
    expect(carriageways.carriagewayOf(-1)).toBeNull();
    expect(carriageways.carriagewayOf(graph.edges.length)).toBeNull();
  });

  it('counts each kind as the file does', () => {
    const count = { dual: 0, divided: 0, single: 0 };
    for (const c of carriageways.all) count[c.kind]++;
    expect(count).toEqual(carriagewaysFile.summary.byKind);
    expect(count).toEqual({ dual: 57, divided: 57, single: 70 });
  });

  it('puts 50 mph only on the dual carriageway, and 30 or 40 mph everywhere else', () => {
    for (const c of carriageways.all) {
      if (c.kind === 'dual') expect(c.maxspeedMph, `edge ${c.edge}`).toBe(50);
      else expect([30, 40], `edge ${c.edge}`).toContain(c.maxspeedMph);
    }
  });

  it('finds the record by its nodes either way round', () => {
    for (const c of carriageways.all) {
      expect(carriageways.between(c.nodes[0], c.nodes[1])).toBe(c);
      expect(carriageways.between(c.nodes[1], c.nodes[0])).toBe(c);
    }
    const [a, b] = graph.edges.find((e) => e[2] === 'residential')!;
    expect(carriageways.between(a, b)).toBeNull();
  });

  it('isDual is true only for the dual kind', () => {
    expect(isDual(carriageways.carriagewayOf(13))).toBe(true);
    expect(carriageways.all.filter(isDual)).toHaveLength(57);
    expect(isDual(null)).toBe(false);
    expect(isDual(undefined)).toBe(false);
  });
});

describe('parseTrunkCarriageways checks the file against the graph', () => {
  const g: RoadGraph = { nodes: [[0, 0], [0.1, 0], [0.2, 0]], edges: [[0, 1, 'residential'], [1, 2, 'trunk']] };
  const rec = { edge: 1, nodes: [1, 2] as [number, number], kind: 'single' as const, maxspeedMph: 30, lanes: 2, oneway: null, lengthM: 10, osmWays: [] };

  it('accepts a matching file', () => {
    expect(parseTrunkCarriageways({ edges: [rec] }, g).carriagewayOf(1)?.kind).toBe('single');
  });

  it('refuses a record naming the wrong edge, a missing trunk edge, or an unknown kind', () => {
    expect(() => parseTrunkCarriageways({ edges: [{ ...rec, edge: 0 }] }, g)).toThrow(/does not match/);
    expect(() => parseTrunkCarriageways({ edges: [] }, g)).toThrow(/no carriageway record/);
    expect(() => parseTrunkCarriageways({ edges: [{ ...rec, kind: 'motorway' }] } as unknown as TrunkCarriagewaysFile, g)).toThrow(/unknown kind/);
  });
});
