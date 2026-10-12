// fuel.js — the van's fuel, or Spark's battery, in the driving spike, run by
// the game's own van upkeep model (packages/game-logic/src/van-upkeep.ts:
// Marcus's decisions 22-28 and his answers, docs/van-upkeep-model-2026-10-12.md).
//
// The model is imported as it is, through the Vite dev server (the spike is
// a dev page); served any other way the import fails and the vans simply
// run on a full tank, so the page still works.
//
// What it does here (Marcus, 2026-10-12: "wire up the fuel gauges"):
// - The level falls with the distance driven, faster for bigger vans, at the
//   model's own rates (applyDriveLeg: Henry 12 km a tank, Bea 10, Big Tilly
//   7.5, Spark's battery 10). Trikey is pedalled and has none.
// - Each van's level is kept on this device (localStorage, a convenience for
//   play-testing), starting full.
// - At a quarter the gauge glows and a toast names the nearer station
//   (Station K67 in the west, FastFuel in the east, landmarks.json; for
//   Spark A.R.C.'s own charger too). The model says which is nearer
//   (nearerStation) from distances the page measures: here straight-line,
//   where the game will use its router.
// - Running dry (46B, answer 5): the van pulls onto the verge with its
//   hazard lights on, a toast says it is being towed to the nearer station
//   (the model's towCost), and it is refilled there with the tow's splash
//   (the model's refuel to TOW_SPLASH). In the spike the van stays where it
//   stopped and drives on from there: the tow itself is not shown.
// - A grown-up can fill up at any time: F, or ?fuel=0..1 in the URL (which
//   sets the level as the page opens), so Lily is never stuck.
// - Level gates do not apply in the spike: fuel runs as it does from level 2.
//
// Contract with drive-spike.html:
//   create(van, { query, toWorld, toast }) -> Promise<F>
//                             toWorld(fx, fy) -> {x, y} metres, for the
//                             landmarks; toast(text, ms) shows a message
//   step(F, dt, metres, roadClass, car)   every frame; metres driven this
//                             frame, car = { x, y, v }
//   canGo(F)                  false while she is dry: no throttle
//   vergeT(F)                 0..1, how far the van has pulled onto the verge
//   level(F)                  0..1 for the gauge, or null (Trikey, no model)
//   low(F)                    the gauge glows
//   refill(F)                 a grown-up's full tank (F)
//   drawHazards(ctx, F, w, h, now)   the hazard lights, in the van's own
//                             frame (centred, nose up), w x h its size in px

const VEHICLE = { henry: 'small-van', bea: 'long-van', 'big-tilly': 'animal-lorry',
  spark: 'electric-minibus', trikey: 'pedal-trike' };
const NAME = { henry: 'Henry', bea: 'Bea', 'big-tilly': 'Big Tilly', spark: 'Spark', trikey: 'Trikey' };
/** The model's station ids, and the landmarks they are on the map. */
const LANDMARK = { 'station-west': 'station-k67', 'station-east': 'fastfuel', arc: 'dest-arc' };
const KEY = 'arc-spike-upkeep-';
const LONG_TOAST = 3600;     // ms a fuel message stays up: long enough to read aloud
const TOW_WAIT_S = 4.5;      // seconds on the verge before the tow has her at the station
const VERGE_EASE = 1.2;      // per second, onto the verge and back

export async function create(van, { query, toWorld, toast }) {
  const vehicle = VEHICLE[van] ?? 'small-van';
  const F = { van, vehicle, name: NAME[van] ?? 'The van', M: null, kind: 'none', u: null,
    place: {}, state: 'driving', t: 0, verge: 0, toast, savedAt: 0, shown: 1 };
  if (vehicle === 'pedal-trike') return F;
  try {
    F.M = await import('/@id/@arc/game-logic/src/van-upkeep.ts');
  } catch {
    return F;   // served without Vite: no fuel model, a full tank for ever
  }
  const M = F.M;
  F.kind = M.energyKind(vehicle);
  F.level = M.UPKEEP_TUNABLES.FUEL_FROM_LEVEL;
  F.u = M.freshUpkeep();
  try {
    const raw = localStorage.getItem(KEY + van);
    if (raw) F.u = M.migrateVanUpkeep(JSON.parse(raw));
  } catch { /* no storage: a full tank */ }
  const q = query.get('fuel');
  if (q !== null && q !== '' && Number.isFinite(Number(q))) setLevel(F, Number(q));
  F.shown = F.u.energy;
  try {
    const d = await (await fetch('/assets/driving/landmarks.json')).json();
    for (const [id, lm] of Object.entries(LANDMARK)) {
      const m = d.landmarks.find(l => l.id === lm);
      if (m) F.place[id] = { name: id === 'arc' ? 'A.R.C.' : m.name, ...toWorld(m.at[0], m.at[1]) };
    }
  } catch { /* without the landmarks the toasts say "the station" */ }
  return F;
}

/** Set the level outright (?fuel=, and the grown-up's F): what a fill to
 *  that level leaves, the warning reset when it is above the quarter. */
function setLevel(F, x) {
  // The warning is reset, so at or below the quarter it shows as she sets off.
  F.u = { ...F.u, energy: Math.max(0, Math.min(1, x)), lowWarned: false };
  F.state = 'driving'; F.t = 0;
  save(F, true);
}

function save(F, now = false) {
  const t = performance.now();
  if (!now && t - F.savedAt < 1000) return;
  F.savedAt = t;
  try { localStorage.setItem(KEY + F.van, JSON.stringify(F.u)); } catch { /* private window */ }
}

/** Straight-line km from the van to a place (Infinity if unknown). */
function distKm(F, id, car) {
  const p = F.place[id];
  return p ? Math.hypot(p.x - car.x, p.y - car.y) / 1000 : Infinity;
}
const stationKm = (F, car) => ({ 'station-west': distKm(F, 'station-west', car), 'station-east': distKm(F, 'station-east', car) });

/** The model's StationId of the nearer station. */
const nearer = (F, car) => F.M.nearerStation(stationKm(F, car));

const placeName = (F, id) => F.place[id]?.name ?? 'the station';

export function step(F, dt, metres, roadClass, car) {
  if (!F.u) return;
  const M = F.M;
  F.shown += (F.u.energy - F.shown) * (1 - Math.exp(-4 * dt));
  if (F.state === 'driving') {
    F.verge = Math.max(0, F.verge - VERGE_EASE * dt);
    if (metres <= 0) return;
    const r = M.applyDriveLeg(F.u, { vehicle: F.vehicle, level: F.level, roadClass, km: metres / 1000 });
    F.u = { ...F.u, energy: r.upkeep.energy, lowWarned: r.upkeep.lowWarned };
    for (const e of r.events) {
      if (e.type === 'low') {
        const st = placeName(F, nearer(F, car));
        F.toast(F.kind === 'battery'
          ? `${F.name}'s battery is low: charge at ${st} or at A.R.C.`
          : `${F.name} is low on fuel: fill up at ${st}`, LONG_TOAST);
        save(F, true);
      }
      if (e.type === 'ran-dry') {
        F.state = 'dry'; F.t = 0;
        F.tow = M.towCost(undefined, stationKm(F, car));
        F.toast(F.kind === 'battery' ? `${F.name}'s battery is flat` : `${F.name} has run out of fuel`, LONG_TOAST);
        save(F, true);
      }
    }
    save(F);
    return;
  }
  // Dry: onto the verge, hazards on, and once she has stopped, the tow.
  F.verge = Math.min(1, F.verge + VERGE_EASE * dt);
  if (F.state === 'dry' && car.v < 0.2) {
    F.state = 'towing'; F.t = 0;
    F.toast(`Towing ${F.name} to ${placeName(F, F.tow?.to ?? nearer(F, car))}`, LONG_TOAST);
  } else if (F.state === 'towing') {
    F.t += dt;
    if (F.t >= TOW_WAIT_S) {
      const to = F.tow?.to ?? nearer(F, car);
      const r = M.refuel(F.u, F.vehicle, to, F.level, M.UPKEEP_TUNABLES.TOW_SPLASH);
      F.u = r.upkeep;
      F.state = 'driving';
      F.toast(F.kind === 'battery'
        ? `A little charge at ${placeName(F, to)}: enough to get going`
        : `A splash of fuel at ${placeName(F, to)}: enough to get going`, LONG_TOAST);
      save(F, true);
    }
  }
}

export const canGo = F => F.state === 'driving';
export const vergeT = F => F.verge * F.verge * (3 - 2 * F.verge);
export const level = F => (F.u ? F.shown : null);
export const low = F => !!F.u && F.u.energy <= F.M.UPKEEP_TUNABLES.LOW_AT;

/** A grown-up's full tank (F): the model's fill at the nearer station. */
export function refill(F) {
  if (!F.u) return false;
  F.u = { ...F.u, energy: 1, lowWarned: false };
  F.state = 'driving'; F.t = 0;
  save(F, true);
  F.toast(F.kind === 'battery' ? `${F.name}'s battery is full` : `${F.name} has a full tank`, 1600);
  return true;
}

/** Hazard lights: the four corner lamps blinking amber together, about
 *  one and a half times a second, while she is dry or waiting for the tow. */
export function drawHazards(ctx, F, w, h, now) {
  if (F.state === 'driving' || !F.u) return;
  const on = Math.floor(now / 340) % 2 === 0;
  const r = Math.max(2.2, w * 0.1);
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = sx * (w / 2 - r * 0.6), y = sy * (h / 2 - r * 0.9);
    ctx.save();
    if (on) { ctx.shadowColor = 'rgba(255,170,30,.95)'; ctx.shadowBlur = r * 3; }
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = on ? '#ffb326' : 'rgba(150,95,20,.85)'; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = '#3a2208'; ctx.stroke();
    ctx.restore();
  }
}
