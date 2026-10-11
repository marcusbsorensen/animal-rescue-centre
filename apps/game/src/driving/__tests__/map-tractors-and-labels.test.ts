import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// ── The world map's tractors and its labels, as the SVG draws them ──────────
//
// Two things on /admin/map.html are easy to break from another file.
//
// The TRACTORS are animated images that cross the farmland. They used to run 420
// and 330 units across fields that are not that wide, so the west one crossed two
// roads and the east one ended on a third, and nothing noticed because nothing
// measured them: the road-graph tests read the road layer, not the animation. Marcus
// decided (2026-10-11) that they stay full size, because a tractor in a field is one
// of the cues that the world is responding to the time of year (the standing rule in
// docs/world-coherence-rule-2026-10-11.md), so the answer to "it does not fit" is a
// different run, not a smaller tractor. Each run is held here to: its own size, the
// farmland, the roads, and the winter switch.
//
// The LABELS are SVG text that map.html sets at a screen size and places. Its rules
// live in map.html ("Names and labels"); what the SVG owes it is held here.

const ADMIN = path.join(__dirname, '../../../public/admin');
const MAP = path.join(ADMIN, 'scene-assets/birchie-map');
const svg = fs.readFileSync(path.join(MAP, 'birchie-roads.svg'), 'utf8');
const mapHtml = fs.readFileSync(path.join(ADMIN, 'map.html'), 'utf8');

type Pt = [number, number];
interface Rect { l: number; t: number; r: number; b: number }

// ── Reading the SVG ─────────────────────────────────────────────────────────

/** The inside of `<g id=...>`, up to its first nested group or its end. */
function groupBody(id: string): string {
  const open = svg.match(new RegExp(`<g id="${id}"[^>]*>`));
  if (!open || open.index === undefined) throw new Error(`no <g id="${id}"> in birchie-roads.svg`);
  const rest = svg.slice(open.index + open[0].length);
  const end = rest.search(/<g[\s>]|<\/g>/);
  return end < 0 ? rest : rest.slice(0, end);
}

/** Every closed subpath of every path in a group, as a polygon. */
function polygons(id: string): Pt[][] {
  const out: Pt[][] = [];
  for (const m of groupBody(id).matchAll(/<path\b[^>]*\bd="([^"]+)"/g)) {
    for (const sub of m[1].split(/(?=M)/)) {
      const pts = [...sub.matchAll(/(-?[0-9.]+),(-?[0-9.]+)/g)].map((q) => [Number(q[1]), Number(q[2])] as Pt);
      if (pts.length >= 3) out.push(pts);
    }
  }
  return out;
}

/** Each drawn road as its points and the width it is drawn at (the trunk's dark outline is the widest). */
function roads(): { pts: Pt[]; width: number }[] {
  const out: { pts: Pt[]; width: number }[] = [];
  for (const id of ['roads-track', 'roads-residential', 'roads-unclassified', 'roads-tertiary', 'roads-secondary', 'roads-trunk-outline']) {
    const open = svg.match(new RegExp(`<g id="${id}"([^>]*)>([\\s\\S]*?)</g>`));
    if (!open) throw new Error(`no <g id="${id}"> in birchie-roads.svg`);
    const width = Number(open[1].match(/stroke-width="([0-9.]+)"/)?.[1]);
    for (const p of open[2].matchAll(/<path\b[^>]*\bd="([^"]+)"/g)) {
      out.push({ pts: [...p[1].matchAll(/(-?[0-9.]+),(-?[0-9.]+)/g)].map((q) => [Number(q[1]), Number(q[2])] as Pt), width });
    }
  }
  return out;
}

function inside(poly: Pt[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function ptRect(x: number, y: number, r: Rect): number {
  return Math.hypot(Math.max(0, r.l - x, x - r.r), Math.max(0, r.t - y, y - r.b));
}

function ptSeg(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / len2)) : 0;
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

function segSeg(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}

/** The gap between a road segment and a rectangle: 0 if they touch. */
function segRect(a: Pt, b: Pt, r: Rect): number {
  if (ptRect(a[0], a[1], r) === 0 || ptRect(b[0], b[1], r) === 0) return 0;
  const corners: Pt[] = [[r.l, r.t], [r.r, r.t], [r.r, r.b], [r.l, r.b]];
  for (let i = 0; i < 4; i++) if (segSeg(a, b, corners[i], corners[(i + 1) % 4])) return 0;
  return Math.min(ptRect(a[0], a[1], r), ptRect(b[0], b[1], r), ...corners.map(([x, y]) => ptSeg(x, y, a, b)));
}

// ── The sprites: where the tractor's body is inside its image ───────────────

/** The box of a PNG's pixels that are not transparent (alpha above 24), in the image's own pixels. */
function opaqueBox(file: string): { w: number; h: number; box: Rect } {
  const buf = fs.readFileSync(path.join(MAP, file));
  let p = 8, w = 0, h = 0;
  const idat: Buffer[] = [];
  let alpha: number[] = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 3 || data[12] !== 0) throw new Error(`${file}: expected an 8-bit palette PNG, not interlaced`);
    } else if (type === 'tRNS') alpha = [...data];
    else if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const rows: Buffer[] = [];
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (w + 1)];
    const row = Buffer.from(raw.subarray(y * (w + 1) + 1, (y + 1) * (w + 1)));
    const prev = y ? rows[y - 1] : Buffer.alloc(w);
    for (let x = 0; x < w; x++) {
      const a = x ? row[x - 1] : 0, b = prev[x], c = x ? prev[x - 1] : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      row[x] = (row[x] + add) & 255;
    }
    rows.push(row);
  }
  const box: Rect = { l: w, t: h, r: 0, b: 0 };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((alpha[rows[y][x]] ?? 255) > 24) {
        box.l = Math.min(box.l, x); box.r = Math.max(box.r, x + 1); box.t = Math.min(box.t, y); box.b = Math.max(box.b, y + 1);
      }
    }
  }
  return { w, h, box };
}

// ── The tractors ────────────────────────────────────────────────────────────

/** Marcus, 2026-10-11: full size. These are the sizes the images were drawn at before the reroute. */
const TRACTOR_SIZE: Record<string, [number, number]> = { 'tractor-classic.png': [80, 44], 'tractor-with-trailer.png': [100, 42] };
/** Clear air beyond a road's drawn edge, in map units. */
const AIR = 4;

interface Tractor { cls: string; href: string; run: Rect; x: number; y: number; w: number; h: number; flipped: boolean; travel: number }

function tractors(): Tractor[] {
  const out: Tractor[] = [];
  const attr = (src: string, name: string) => src.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? '';
  for (const m of svg.matchAll(/<g class="tractor-wrap"([^>]*)>\s*<g class="(tractor-(?:west|east))">\s*<image\b([^>]*)\/>/g)) {
    const run = attr(m[1], 'data-run').split(/\s+/).map(Number);
    const kf = svg.match(new RegExp(`@keyframes ${m[2].replace('tractor-', 'tractor-cross-')}\\s*\\{[\\s\\S]*?100%\\s*\\{\\s*transform:\\s*translateX\\((-?[0-9.]+)px\\)`));
    out.push({
      cls: m[2], href: attr(m[3], 'href'), run: { l: run[0], t: run[1], r: run[2], b: run[3] },
      x: Number(attr(m[3], 'x')), y: Number(attr(m[3], 'y')), w: Number(attr(m[3], 'width')), h: Number(attr(m[3], 'height')),
      flipped: /face-west/.test(attr(m[3], 'class')), travel: Number(kf?.[1]),
    });
  }
  return out;
}

/** The strip a tractor's visible body sweeps: its body inside the image, mirrored if flipped, carried by the animation's travel. */
function sweep(t: Tractor): Rect {
  const { w: pw, h: ph, box } = opaqueBox(t.href);
  const sx = t.w / pw, sy = t.h / ph;
  const l0 = t.flipped ? t.x + t.w - box.r * sx : t.x + box.l * sx;
  const r0 = t.flipped ? t.x + t.w - box.l * sx : t.x + box.r * sx;
  return { l: Math.min(l0, l0 + t.travel), r: Math.max(r0, r0 + t.travel), t: t.y + box.t * sy, b: t.y + box.b * sy };
}

describe('the map tractors run on farmland, between roads, at full size', () => {
  const list = tractors();

  it('finds both tractors, each with the strip it works', () => {
    expect(list.map((t) => t.cls).sort()).toEqual(['tractor-east', 'tractor-west']);
    for (const t of list) {
      expect(t.run.r - t.run.l, `${t.cls} data-run`).toBeGreaterThan(0);
      expect(Number.isFinite(t.travel), `${t.cls}: no travel in its keyframes`).toBe(true);
    }
  });

  it('keeps every tractor the size it was drawn at: a run that does not fit is moved, not shrunk', () => {
    for (const t of list) {
      expect([t.w, t.h], `${t.cls} (${t.href}) was shrunk or stretched`).toEqual(TRACTOR_SIZE[t.href]);
    }
  });

  it('keeps the animation inside the strip it declares (the strip map.html keeps labels out of)', () => {
    for (const t of list) {
      const s = sweep(t);
      expect(s.l, `${t.cls} sweeps left of its data-run`).toBeGreaterThanOrEqual(t.run.l - 0.5);
      expect(s.r, `${t.cls} sweeps right of its data-run`).toBeLessThanOrEqual(t.run.r + 0.5);
      expect(s.t, `${t.cls} sweeps above its data-run`).toBeGreaterThanOrEqual(t.run.t - 0.5);
      expect(s.b, `${t.cls} sweeps below its data-run`).toBeLessThanOrEqual(t.run.b + 0.5);
    }
  });

  it.each(['tractor-west', 'tractor-east'])('%s stays clear of every road by 4 units of air', (cls) => {
    const t = list.find((x) => x.cls === cls);
    expect(t).toBeDefined();
    const s = sweep(t as Tractor);
    const close: string[] = [];
    for (const road of roads()) {
      const need = road.width / 2 + AIR;
      for (let i = 0; i < road.pts.length - 1; i++) {
        const gap = segRect(road.pts[i], road.pts[i + 1], s);
        if (gap < need) { close.push(`a road ${road.width} wide at (${road.pts[i].join(',')}) is ${gap.toFixed(1)} away, needs ${need}`); break; }
      }
    }
    expect(close, `${cls} sweeps x ${s.l.toFixed(0)}-${s.r.toFixed(0)}, y ${s.t.toFixed(0)}-${s.b.toFixed(0)}`).toEqual([]);
  });

  it.each(['tractor-west', 'tractor-east'])('%s works one farm field, and nothing drawn over it', (cls) => {
    const t = list.find((x) => x.cls === cls);
    const s = sweep(t as Tractor);
    const fields = polygons('farmland');
    const over = [...polygons('green-areas'), ...polygons('woodland'), ...polygons('pools'), ...polygons('destinations')];
    const samples: Pt[] = [];
    for (let x = s.l; x <= s.r; x += 3) for (let y = s.t; y <= s.b; y += 3) samples.push([x, y], [x, s.b]);
    const one = fields.findIndex((f) => samples.every(([x, y]) => inside(f, x, y)));
    expect(one, `${cls} is not wholly inside a single farmland polygon`).toBeGreaterThanOrEqual(0);
    const covered = samples.filter(([x, y]) => over.some((p) => inside(p, x, y)));
    expect(covered.length, `${cls} runs under a park, wood, pond or the golf course`).toBe(0);
  });

  it('is switched off in winter by the season mechanism, and map.html sets the season', () => {
    // The rule: tractors work in spring, summer and autumn and are off in winter
    // (docs/map-seasonal-changes-2026-05-19.md). Both tractors sit in a .tractor-wrap, whose
    // opacity the winter rule takes to 0 without fighting the animation's own fades.
    expect(svg).toMatch(/svg\[data-season="winter"\]\s+\.tractor-wrap\s*\{\s*opacity:\s*0\s*;?\s*\}/);
    expect((svg.match(/<g class="tractor-wrap"/g) ?? []).length).toBe(2);
    expect((svg.match(/<g class="tractor-wrap"[^>]*>\s*<g class="tractor-(?:west|east)">/g) ?? []).length).toBe(2);
    expect(mapHtml).toMatch(/svg\.setAttribute\('data-season', season\)/);
  });
});

// ── The labels ──────────────────────────────────────────────────────────────

describe('what the SVG owes map.html for its labels', () => {
  const labels = [...svg.matchAll(/<text\b([^>]*\bclass="poi-label"[^>]*)>([\s\S]*?)<\/text>/g)].map((m) => ({
    text: m[2].replace(/<[^>]+>/g, '').trim(),
    tier: m[1].match(/data-tier="([^"]+)"/)?.[1],
    forId: m[1].match(/data-for="([^"]+)"/)?.[1],
  }));
  const iconIds = [...svg.matchAll(/<g\b([^>]*\bclass="[^"]*\bpoi-icon\b[^"]*"[^>]*)>/g)].map((m) => m[1].match(/\bid="([^"]+)"/)?.[1]);

  it('has the labels the map shows: the places, the service stops, the bays and the grotto', () => {
    expect(labels.map((l) => l.text).sort()).toEqual([
      'Birchie Station', 'Epple Bay', 'Glasshouse Acres', 'Grenham Bay', "Jolly Jim's", 'Minnis Bay', 'Petrol Station',
      "Santa's Grotto", "Suds 'n' Steve's", 'Westbeach Golf Club', 'Wyx Farm Shop', 'Wyx Park',
    ].sort());
  });

  it('gives each label a tier map.html knows, and an icon to stand beside (a bay has none)', () => {
    for (const l of labels) {
      expect(['major', 'service', 'bay'], `${l.text}: data-tier`).toContain(l.tier);
      if (l.tier === 'bay') continue;
      expect(iconIds, `${l.text} stands beside #${l.forId}, which is not a .poi-icon`).toContain(l.forId);
    }
  });

  it('keeps icon ids unique, so a label cannot find two', () => {
    const ids = iconIds.filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sets every label at or above the type floor (16px), a place above the rest', () => {
    const px = mapHtml.match(/const LABEL_PX = \{\s*major:\s*(\d+),\s*service:\s*(\d+),\s*bay:\s*(\d+)\s*\}/);
    expect(px, 'map.html lost its LABEL_PX table').not.toBeNull();
    const [major, service, bay] = (px as RegExpMatchArray).slice(1).map(Number);
    expect(Math.min(major, service, bay), 'a label below the 16px type floor (--fs-floor)').toBeGreaterThanOrEqual(16);
    expect(major).toBeGreaterThanOrEqual(service);
  });
});
