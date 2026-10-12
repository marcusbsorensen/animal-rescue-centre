/**
 * Van upkeep — fuel, charge, wear and dirt on A.R.C.'s rescue vans.
 *
 * Decisions 22–28 (Marcus, 2026-10-12), recorded in
 * docs/fuel-workshop-carwash-2026-10-12.md. Design and the questions still
 * open: docs/van-upkeep-model-2026-10-12.md.
 *
 * Pure and deterministic: every function takes a serialisable state and
 * returns a new one, and the one thing left to chance (a puncture) takes a
 * seeded `rng`. No Phaser, no map, no clock. The scene reports what
 * happened on a drive (`applyDrive`, or `applyDriveLeg` as it goes) and what
 * a visit bought (`refuel`, `wash`, `service`); this module says what the
 * van is like afterwards and what it cost.
 *
 * The consequence model is the driving rebuild's (docs/driving-rebuild-
 * 2026-10-11.md): nothing is ever hurt and there is never an accident. A
 * wrong-but-safe choice is allowed and costs something — time, coins, Depot
 * parts and the animals' comfort — and nothing is ever locked out.
 *
 * Gates (28A): below player level 2 there is no fuel, below 4 no dirt and no
 * wash, below 6 no wear, no punctures and no workshop. Below its gate a
 * mechanic simply does not run: the drive leaves its numbers where they are.
 */

import type { DamageEntry, Season, Weather } from '@arc/shared-types';
import {
  VEHICLE_DEFS,
  neighbourIndices,
  pairFeeling,
  type CrateGrid,
  type VehicleType,
} from './crate-stacking';
import { DAMAGE_THRESHOLDS } from './supply-runs';

// ═══════════════════════════════════════════════════════════════════
// TUNABLES — every number the model plays with, in one place.
//
// All provisional (2026-10-12), for Marcus to tune by feel. "A drive" means
// TYPICAL_DRIVE_KM: Birchie is about 4 km across, so a trip from A.R.C. to a
// destination is a couple of kilometres.
// ═══════════════════════════════════════════════════════════════════

export const UPKEEP_TUNABLES = {
  /** One typical drive, km. Every "in drives" note below divides by this. */
  TYPICAL_DRIVE_KM: 2.5,

  // ── Gates (28A) ────────────────────────────────────────────────
  /** Fuel and charge run from here (Henry, the first van that uses fuel). */
  FUEL_FROM_LEVEL: 2,
  /** Dirt (outside and inside) and the car wash run from here. */
  WASH_FROM_LEVEL: 4,
  /** Wear, punctures, the spanner light and the workshop run from here. */
  WORKSHOP_FROM_LEVEL: 6,

  // ── Fuel and charge (23A, 27A) ─────────────────────────────────
  /**
   * How far a full tank (or battery) goes, km. Bigger vans burn faster.
   * Henry 12 km = ~5 drives; Bea 10 km = 4 drives; Big Tilly 7.5 km = 3
   * drives; Spark 10 km = 4 drives. None of them needs filling every drive.
   * Trikey is pedalled and has no entry.
   */
  RANGE_KM: {
    'small-van': 12,
    'long-van': 10,
    'animal-lorry': 7.5,
    'electric-minibus': 10,
  } as Partial<Record<VehicleType, number>>,
  /**
   * The gauge glows and the GPS offers the nearer station at this level.
   * Henry reaches it after ~3.6 drives, Big Tilly after ~2.2.
   */
  LOW_AT: 0.25,
  // Price of a full tank is not a number here: it is VEHICLE_DEFS.fuelCost
  // (coins per drive's worth, until now unread) × drives per tank, so
  // Henry 5 × 4.8 = 24 coins, Bea 40, Big Tilly 60, Spark 20 at a station.
  // A part fill costs its share, rounded up. See fullTankCoins.
  /** Spark charging at A.R.C.'s own charger: coins for a full battery. */
  HOME_CHARGE_COINS: 0,
  /** In-game minutes a full fill takes at a pump. */
  REFUEL_MINUTES: 5,
  /** In-game minutes a full charge takes at a station charger. */
  STATION_CHARGE_MINUTES: 30,
  /** In-game minutes a full charge takes at A.R.C.'s (slower) charger. */
  HOME_CHARGE_MINUTES: 120,

  // ── Running dry (23A) ──────────────────────────────────────────
  /** Coins the tow costs (never more than she has). About two drives of fuel for Henry. */
  TOW_COINS: 10,
  /** In-game minutes lost waiting on the verge for the tow. */
  TOW_MINUTES: 45,
  /** Happiness each animal aboard loses while they wait (restless). */
  TOW_RESTLESS_HAPPINESS: -8,
  /** What the tow leaves in the tank: enough for ~1.2 km, to reach a pump. */
  TOW_SPLASH: 0.1,

  // ── Wear (25A) ─────────────────────────────────────────────────
  /**
   * Wear per km by OSM road class. Henry on ordinary roads: 0.012/km ×
   * 2.5 km = 0.03 a drive, so the spanner light comes on after ~20 gentle
   * drives; a rough driver gets there in about half that.
   */
  WEAR_PER_KM: {
    trunk: 0.01,
    secondary: 0.012,
    tertiary: 0.012,
    unclassified: 0.014,
    residential: 0.014,
    track: 0.03,
  } as Record<string, number>,
  /** Wear per km on a road class not in the table. */
  WEAR_PER_KM_DEFAULT: 0.012,
  /** Bigger vans wear faster (multiplier on the per-km figures). */
  WEAR_SIZE: {
    'small-van': 1,
    'long-van': 1.15,
    'animal-lorry': 1.3,
    'electric-minibus': 1,
  } as Partial<Record<VehicleType, number>>,
  /** Wear per hard stop she makes herself (handbrake, slamming on). */
  WEAR_PER_HARD_STOP: 0.01,
  /** Wear per time the van stops itself because she did not brake. */
  WEAR_PER_SELF_STOP: 0.015,
  /** Wear per kerb clipped. */
  WEAR_PER_KERB: 0.02,
  /** The spanner light comes on at this much wear (0–1). */
  SPANNER_AT: 0.6,
  /** Ride-roughness multiplier while the spanner light is on. */
  WORN_ROUGHNESS: 1.5,
  /** Ride-roughness multiplier while a tyre is flat (Trikey). */
  PUNCTURE_ROUGHNESS: 1.5,
  /** In-game minutes a service takes at the workshop. */
  SERVICE_MINUTES: 30,
  /**
   * Depot parts a full service costs (wear only; supply-run damage adds
   * DAMAGE_THRESHOLDS' parts on top). Codes are depot-inventory.ts 'part' items.
   */
  SERVICE_PARTS: { rusty_bolt: 1, shiny_cog: 1 } as Record<string, number>,
  /** Depot parts a puncture repair costs. */
  PUNCTURE_PARTS: { rusty_bolt: 1 } as Record<string, number>,

  // ── Punctures (27B; Trikey only) ───────────────────────────────
  /**
   * Chance of a puncture per km by road class. 0.012/km on the lanes Trikey
   * rides ≈ one puncture in ~33 drives; a farm track trebles it.
   */
  PUNCTURE_PER_KM: 0.012,
  PUNCTURE_PER_KM_TRACK: 0.04,
  /** Extra chance per kerb Trikey clips. */
  PUNCTURE_PER_KERB: 0.1,

  // ── Dirt outside (26A) ─────────────────────────────────────────
  /**
   * Outside dirt per km on a farm track. A rewilding drive with 1 km of
   * track takes the van from clean to "dirty" (DIRTY_AT) in about two trips.
   */
  OUTSIDE_DIRT_PER_TRACK_KM: 0.25,
  /** Outside dirt per km on any road in rain (light or heavy). */
  OUTSIDE_DIRT_PER_KM_RAIN: 0.03,
  /** Outside dirt per km on any road in snow. */
  OUTSIDE_DIRT_PER_KM_SNOW: 0.05,
  /** Outside dirt per km on any road in winter (salt and slush), any weather. ~8 drives to dirty. */
  OUTSIDE_DIRT_PER_KM_WINTER: 0.025,
  /** Outside dirt per km on any road otherwise (ordinary road grime). ~40 drives to dirty. */
  OUTSIDE_DIRT_PER_KM_BASE: 0.005,

  // ── Dirt inside (26A extended) ─────────────────────────────────
  /**
   * Inside dirt per km for each animal aboard that is poorly
   * (`GameStateStore.sickAnimals`). One sick passenger, ~4 drives to dirty.
   */
  INSIDE_DIRT_PER_KM_SICK: 0.05,
  /** …that is moulting (no such condition in the game yet; an input). */
  INSIDE_DIRT_PER_KM_MOULTING: 0.04,
  /** …that makes a mess (no such condition in the game yet; an input). ~2–3 drives. */
  INSIDE_DIRT_PER_KM_MESSY: 0.08,
  /** …for each pair of neighbours that squabble (a 'stressed' pair). ~5 drives. */
  INSIDE_DIRT_PER_KM_SQUABBLE: 0.04,
  /** Either kind of dirt counts as "dirty" (worth showing, worth a wash) here. */
  DIRTY_AT: 0.5,

  // ── The wash (24A, 26A) ────────────────────────────────────────
  /** Coins a wash costs. */
  WASH_COINS: 1,
  /** Happiness each animal aboard gains going through the wash (they perk up). */
  WASH_PERK_HAPPINESS: 5,
  /** In-game minutes a wash takes. */
  WASH_MINUTES: 10,
} as const;

const T = UPKEEP_TUNABLES;

// ═══════════════════════════════════════════════════════════════════
// Places (22A). Ids only: the in-game names are still to be chosen with
// Marcus and must allude to, never name, the real places.
// ═══════════════════════════════════════════════════════════════════

export type StationId = 'station-west' | 'station-east';
export type UpkeepPlaceId = StationId | 'workshop' | 'arc-charger';

export interface UpkeepPlaceDef {
  id: UpkeepPlaceId;
  fuel: boolean;
  charger: boolean;
  wash: boolean;
  workshop: boolean;
  /** The inflatable tube man stands here (29A). */
  tubeMan: boolean;
}

export const UPKEEP_PLACES: Record<UpkeepPlaceId, UpkeepPlaceDef> = {
  'station-west': { id: 'station-west', fuel: true,  charger: true,  wash: true,  workshop: false, tubeMan: true  },
  'station-east': { id: 'station-east', fuel: true,  charger: true,  wash: true,  workshop: false, tubeMan: false },
  // Beside the vet.
  'workshop':     { id: 'workshop',     fuel: false, charger: false, wash: false, workshop: true,  tubeMan: false },
  // A.R.C.'s own charger, at home.
  'arc-charger':  { id: 'arc-charger',  fuel: false, charger: true,  wash: false, workshop: false, tubeMan: false },
};

/**
 * Which station the GPS should offer when the gauge glows: the nearer of
 * the two, by road distance the scene measures (the router knows the map;
 * this does not). Ties go west, where the tube man waves. An unreachable
 * station is passed as Infinity.
 */
export function nearerStation(distances: Record<StationId, number>): StationId {
  return distances['station-east'] < distances['station-west'] ? 'station-east' : 'station-west';
}

// ═══════════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════════

/** What a vehicle runs on. */
export type EnergyKind = 'fuel' | 'battery' | 'none';

export function energyKind(vehicle: VehicleType): EnergyKind {
  if (vehicle === 'pedal-trike') return 'none';
  if (vehicle === 'electric-minibus') return 'battery';
  return 'fuel';
}

/**
 * One vehicle's upkeep. Serialisable; this is what the save holds.
 * Every number is 0–1 except `supplyDamage`, which is the supply-run
 * damage total on the 0–100 scale `DAMAGE_THRESHOLDS` uses.
 */
export interface VanUpkeep {
  /** Fuel in the tank, or charge in Spark's battery. 1 = full. Trikey: always 1. */
  energy: number;
  /** Wear from distance and rough driving. 0 = fresh from a service. */
  wear: number;
  /** Mud, salt and grime on the outside. */
  dirtOutside: number;
  /** Fur, mess and scattered bedding on the inside. Kept separate from outside. */
  dirtInside: number;
  /** The quarter-tank warning has fired and has not been reset by a fill. */
  lowWarned: boolean;
  /** Trikey has a flat tyre. */
  puncture: boolean;
  /** Supply-run damage waiting for the workshop (0–100). */
  supplyDamage: number;
}

export type FleetUpkeep = Record<VehicleType, VanUpkeep>;

/** Full tank, clean, no wear: a new van, and the migration default. */
export function freshUpkeep(): VanUpkeep {
  return {
    energy: 1,
    wear: 0,
    dirtOutside: 0,
    dirtInside: 0,
    lowWarned: false,
    puncture: false,
    supplyDamage: 0,
  };
}

const FLEET: VehicleType[] = Object.keys(VEHICLE_DEFS) as VehicleType[];

export function freshFleetUpkeep(): FleetUpkeep {
  return Object.fromEntries(FLEET.map((v) => [v, freshUpkeep()])) as FleetUpkeep;
}

/**
 * Read whatever the save holds into a whole, valid fleet record. A save
 * from before this existed (undefined), a vehicle missing from it, a field
 * missing or a number out of range all fall back to the fresh default for
 * that piece alone — so a later field never wipes an earlier one.
 */
export function migrateFleetUpkeep(raw: unknown): FleetUpkeep {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out = {} as FleetUpkeep;
  for (const v of FLEET) out[v] = migrateVanUpkeep(src[v]);
  return out;
}

export function migrateVanUpkeep(raw: unknown): VanUpkeep {
  const d = freshUpkeep();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d;
  const r = raw as Record<string, unknown>;
  const unit = (x: unknown, dflt: number) => (typeof x === 'number' && Number.isFinite(x) ? clamp01(x) : dflt);
  return {
    energy: unit(r.energy, d.energy),
    wear: unit(r.wear, d.wear),
    dirtOutside: unit(r.dirtOutside, d.dirtOutside),
    dirtInside: unit(r.dirtInside, d.dirtInside),
    lowWarned: typeof r.lowWarned === 'boolean' ? r.lowWarned : d.lowWarned,
    puncture: typeof r.puncture === 'boolean' ? r.puncture : d.puncture,
    supplyDamage:
      typeof r.supplyDamage === 'number' && Number.isFinite(r.supplyDamage)
        ? Math.min(100, Math.max(0, r.supplyDamage))
        : d.supplyDamage,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Gates and readings (what the dashboard shows)
// ═══════════════════════════════════════════════════════════════════

export function fuelRuns(level: number, vehicle: VehicleType): boolean {
  return level >= T.FUEL_FROM_LEVEL && energyKind(vehicle) !== 'none';
}

/** Dirt and the wash. Trikey is never washed (see the doc's open questions). */
export function washRuns(level: number, vehicle: VehicleType): boolean {
  return level >= T.WASH_FROM_LEVEL && vehicle !== 'pedal-trike';
}

export function workshopRuns(level: number): boolean {
  return level >= T.WORKSHOP_FROM_LEVEL;
}

/** The gauge glows (and the GPS offers the nearer station). */
export function isLow(u: VanUpkeep, vehicle: VehicleType, level: number): boolean {
  return fuelRuns(level, vehicle) && u.energy <= T.LOW_AT;
}

/** The spanner light. Vans only: Trikey does not wear, it punctures. */
export function spannerLight(u: VanUpkeep, vehicle: VehicleType, level: number): boolean {
  return workshopRuns(level) && vehicle !== 'pedal-trike' && u.wear >= T.SPANNER_AT;
}

/** Anything the workshop would mend: worn, punctured or supply-run damaged. */
export function needsWorkshop(u: VanUpkeep, vehicle: VehicleType, level: number): boolean {
  return workshopRuns(level) && (spannerLight(u, vehicle, level) || u.puncture || u.supplyDamage > 0);
}

export function isDirtyOutside(u: VanUpkeep, vehicle: VehicleType, level: number): boolean {
  return washRuns(level, vehicle) && u.dirtOutside >= T.DIRTY_AT;
}

export function isDirtyInside(u: VanUpkeep, vehicle: VehicleType, level: number): boolean {
  return washRuns(level, vehicle) && u.dirtInside >= T.DIRTY_AT;
}

/**
 * How much bumpier the ride is for the animals: multiply the jostle the
 * drive would otherwise cause by this (ride-comfort.ts's hard-decel and
 * swerve terms). 1 is a well van; the spanner light or a flat tyre makes it
 * rougher until the workshop sees to it.
 */
export function rideRoughness(u: VanUpkeep, vehicle: VehicleType, level: number): number {
  if (!workshopRuns(level)) return 1;
  let m = 1;
  if (spannerLight(u, vehicle, level)) m = Math.max(m, T.WORN_ROUGHNESS);
  if (u.puncture) m = Math.max(m, T.PUNCTURE_ROUGHNESS);
  return m;
}

/** How far the van can go on what is in the tank, km. Infinity for Trikey. */
export function rangeLeftKm(u: VanUpkeep, vehicle: VehicleType): number {
  const range = T.RANGE_KM[vehicle];
  return range === undefined ? Infinity : u.energy * range;
}

// ═══════════════════════════════════════════════════════════════════
// Drives
// ═══════════════════════════════════════════════════════════════════

/** Per-animal facts the inside-dirt model needs and the crate grid lacks. */
export interface PassengerCondition {
  /**
   * Moulting. **No such condition exists in the game yet**; the scene passes
   * false until one does.
   */
  moulting?: boolean;
  /**
   * Makes a mess. **No such condition exists in the game yet**; until one
   * does the scene may pass `illness === 'tummy_ache'` (vet.ts) as the
   * nearest thing, or false.
   */
  messy?: boolean;
}

export interface DriveLeg {
  /** OSM road class of the stretch (trunk, secondary, … track). */
  roadClass: string;
  km: number;
}

export interface DriveReport {
  vehicle: VehicleType;
  level: number;
  /** The stretches driven, in order. Order matters for where the van runs dry. */
  legs: DriveLeg[];
  /** Hard stops she made herself (handbrake, slamming on). */
  hardStops?: number;
  /** Times the van stopped itself because she did not brake. */
  selfStops?: number;
  /** Kerbs clipped. */
  kerbs?: number;
  weather?: Weather;
  season?: Season;
  /**
   * Who is aboard, as loaded. `poorly` on each crate is the game's own
   * illness flag (`GameStateStore.sickAnimals`), already carried there.
   */
  grid?: CrateGrid;
  /** Conditions the grid does not carry, by animal id. */
  conditions?: Record<string, PassengerCondition>;
  /** Seeded random source in [0, 1), used only for Trikey's punctures. Absent means no puncture. */
  rng?: () => number;
}

export type UpkeepEvent =
  /** The quarter-tank warning. Fires once until the next fill. */
  | { type: 'low'; atKm: number; energy: 'fuel' | 'battery' }
  /** Ran dry: pulled onto the verge, hazards on, towed. */
  | { type: 'ran-dry'; atKm: number; energy: 'fuel' | 'battery' }
  /** The spanner light came on during this drive. */
  | { type: 'spanner-on'; atKm: number }
  /** Trikey's tyre went flat. */
  | { type: 'puncture'; atKm: number }
  /** The outside crossed DIRTY_AT on this drive. */
  | { type: 'dirty-outside' }
  /** The inside crossed DIRTY_AT on this drive. */
  | { type: 'dirty-inside' };

export interface TowCost {
  /** Coins the tow costs, before capping at what she holds (see `payCoins`). */
  coins: number;
  minutes: number;
  /** Happiness change for each animal aboard. */
  happinessEach: number;
}

export interface DriveResult {
  upkeep: VanUpkeep;
  events: UpkeepEvent[];
  /** km actually driven before anything stopped the van (the tow carries the rest). */
  kmDriven: number;
  /** Present when the van ran dry. */
  tow?: TowCost;
}

/**
 * Apply one finished drive. Wear, dirt and energy accrue for the distance
 * actually driven; if the tank empties part-way, the drive stops there, the
 * van is towed (`tow` in the result) and the rest of the legs are not
 * driven. The rough events and the passengers' inside dirt are spread over
 * the distance driven, so a drive cut short counts only its share.
 */
export function applyDrive(u: VanUpkeep, report: DriveReport): DriveResult {
  const plannedKm = report.legs.reduce((s, l) => s + Math.max(0, l.km), 0);
  let state = u;
  const events: UpkeepEvent[] = [];
  let kmDriven = 0;
  let tow: TowCost | undefined;

  for (const leg of report.legs) {
    const km = Math.max(0, leg.km);
    if (km === 0) continue;
    const r = applyDriveLeg(state, { ...report, roadClass: leg.roadClass, km, kmSoFar: kmDriven });
    state = r.upkeep;
    events.push(...r.events);
    kmDriven += r.kmDriven;
    if (r.ranDry) {
      tow = towCost(report.grid);
      break;
    }
  }

  // Rough events, spread over the share of the drive actually driven.
  const share = plannedKm > 0 ? kmDriven / plannedKm : 1;
  state = applyRough(state, report, share, kmDriven, events);

  if (tow) state = { ...state, energy: Math.max(state.energy, T.TOW_SPLASH) };

  return { upkeep: state, events, kmDriven, ...(tow ? { tow } : {}) };
}

export interface LegInput extends Omit<DriveReport, 'legs' | 'hardStops' | 'selfStops' | 'kerbs'> {
  roadClass: string;
  km: number;
  /** km already driven on this drive, so events can say where they fired. */
  kmSoFar?: number;
}

export interface LegResult {
  upkeep: VanUpkeep;
  events: UpkeepEvent[];
  kmDriven: number;
  ranDry: boolean;
}

/**
 * One stretch of road, for a scene that updates the gauge as it drives
 * (call it every few hundred metres; `applyDrive` is the same thing folded
 * over a whole drive). Does not apply rough events: report those with
 * `applyRoughEvent` as they happen.
 *
 * When the tank empties within the stretch, `ranDry` is true, `kmDriven`
 * is where it emptied, and the scene runs the tow (`towCost`).
 */
export function applyDriveLeg(u: VanUpkeep, leg: LegInput): LegResult {
  const { vehicle, level } = leg;
  const at0 = leg.kmSoFar ?? 0;
  const events: UpkeepEvent[] = [];
  let km = Math.max(0, leg.km);
  let ranDry = false;
  let energy = u.energy;
  let lowWarned = u.lowWarned;

  // Fuel / charge first: it decides how far the stretch actually goes.
  const range = T.RANGE_KM[vehicle];
  if (fuelRuns(level, vehicle) && range !== undefined) {
    const kind = energyKind(vehicle) as 'fuel' | 'battery';
    const canGo = energy * range;
    if (km >= canGo) {
      km = canGo;
      ranDry = true;
    }
    const before = energy;
    energy = ranDry ? 0 : clamp01(energy - km / range);
    if (!lowWarned && energy <= T.LOW_AT) {
      lowWarned = true;
      const atKm = before <= T.LOW_AT ? 0 : (before - T.LOW_AT) * range;
      events.push({ type: 'low', atKm: round3(at0 + atKm), energy: kind });
    }
    if (ranDry) events.push({ type: 'ran-dry', atKm: round3(at0 + km), energy: kind });
  }

  let next: VanUpkeep = { ...u, energy, lowWarned };

  // Wear (vans) and punctures (Trikey).
  if (workshopRuns(level)) {
    if (vehicle === 'pedal-trike') {
      if (!next.puncture && km > 0) {
        const perKm = leg.roadClass === 'track' ? T.PUNCTURE_PER_KM_TRACK : T.PUNCTURE_PER_KM;
        const p = 1 - Math.pow(1 - perKm, km);
        if (requireRng(leg.rng)() < p) {
          next = { ...next, puncture: true };
          events.push({ type: 'puncture', atKm: round3(at0 + km / 2) });
        }
      }
    } else {
      const perKm = (T.WEAR_PER_KM[leg.roadClass] ?? T.WEAR_PER_KM_DEFAULT) * (T.WEAR_SIZE[vehicle] ?? 1);
      next = addWear(next, perKm * km, vehicle, level, round3(at0 + km), events);
    }
  }

  // Dirt.
  if (washRuns(level, vehicle)) {
    const out0 = next.dirtOutside;
    const in0 = next.dirtInside;
    const outside = outsideDirtPerKm(leg.roadClass, leg.weather, leg.season) * km;
    const inside = insideDirtPerKm(leg.grid, leg.conditions) * km;
    next = { ...next, dirtOutside: clamp01(out0 + outside), dirtInside: clamp01(in0 + inside) };
    if (out0 < T.DIRTY_AT && next.dirtOutside >= T.DIRTY_AT) events.push({ type: 'dirty-outside' });
    if (in0 < T.DIRTY_AT && next.dirtInside >= T.DIRTY_AT) events.push({ type: 'dirty-inside' });
  }

  return { upkeep: next, events, kmDriven: km, ranDry };
}

export type RoughEvent = 'hard-stop' | 'self-stop' | 'kerb';

/**
 * One rough moment, as it happens: wear on a van, a puncture chance on
 * Trikey's kerb. (The jostle in the back is ride-comfort.ts's business;
 * multiply it by `rideRoughness`.)
 */
export function applyRoughEvent(
  u: VanUpkeep,
  event: RoughEvent,
  vehicle: VehicleType,
  level: number,
  rng?: () => number,
): { upkeep: VanUpkeep; events: UpkeepEvent[] } {
  const events: UpkeepEvent[] = [];
  const counts = { hardStops: 0, selfStops: 0, kerbs: 0 };
  if (event === 'hard-stop') counts.hardStops = 1;
  if (event === 'self-stop') counts.selfStops = 1;
  if (event === 'kerb') counts.kerbs = 1;
  const upkeep = applyRough(u, { vehicle, level, rng, ...counts }, 1, 0, events);
  return { upkeep, events };
}

function applyRough(
  u: VanUpkeep,
  r: Pick<DriveReport, 'vehicle' | 'level' | 'hardStops' | 'selfStops' | 'kerbs' | 'rng'>,
  share: number,
  atKm: number,
  events: UpkeepEvent[],
): VanUpkeep {
  if (!workshopRuns(r.level)) return u;
  const hard = (r.hardStops ?? 0) * share;
  const self = (r.selfStops ?? 0) * share;
  const kerbs = (r.kerbs ?? 0) * share;
  if (r.vehicle === 'pedal-trike') {
    if (u.puncture || kerbs <= 0) return u;
    const p = 1 - Math.pow(1 - T.PUNCTURE_PER_KERB, kerbs);
    if (requireRng(r.rng)() < p) {
      events.push({ type: 'puncture', atKm: round3(atKm) });
      return { ...u, puncture: true };
    }
    return u;
  }
  const wear = hard * T.WEAR_PER_HARD_STOP + self * T.WEAR_PER_SELF_STOP + kerbs * T.WEAR_PER_KERB;
  return addWear(u, wear, r.vehicle, r.level, round3(atKm), events);
}

function addWear(
  u: VanUpkeep,
  amount: number,
  vehicle: VehicleType,
  level: number,
  atKm: number,
  events: UpkeepEvent[],
): VanUpkeep {
  if (amount <= 0) return u;
  const was = spannerLight(u, vehicle, level);
  const next = { ...u, wear: clamp01(u.wear + amount) };
  if (!was && spannerLight(next, vehicle, level)) events.push({ type: 'spanner-on', atKm });
  return next;
}

/** The tow, for a van that ran dry with these animals aboard. */
export function towCost(grid?: CrateGrid): TowCost {
  return {
    coins: T.TOW_COINS,
    minutes: T.TOW_MINUTES,
    happinessEach: grid && grid.crates.length > 0 ? T.TOW_RESTLESS_HAPPINESS : 0,
  };
}

// ── Dirt rates ─────────────────────────────────────────────────

export function outsideDirtPerKm(roadClass: string, weather?: Weather, season?: Season): number {
  let rate = T.OUTSIDE_DIRT_PER_KM_BASE;
  if (roadClass === 'track') rate += T.OUTSIDE_DIRT_PER_TRACK_KM;
  if (weather === 'light_rain' || weather === 'heavy_rain') rate += T.OUTSIDE_DIRT_PER_KM_RAIN;
  if (weather === 'snow') rate += T.OUTSIDE_DIRT_PER_KM_SNOW;
  if (season === 'winter_cosy') rate += T.OUTSIDE_DIRT_PER_KM_WINTER;
  return rate;
}

/**
 * Pairs of orthogonal neighbours that squabble: a pair whose
 * `pairFeeling` is 'stressed' because the two species disagree. A healthy
 * animal beside a poorly one also reads 'stressed', but that is one of them
 * needing quiet (`needsQuiet`), not a squabble, and makes no mess. A blocked
 * pair never travels (`isDriveable`), so it is not counted either.
 */
export function squabblingPairs(grid: CrateGrid): Array<[string, string]> {
  const bySlot = new Map(grid.crates.map((c) => [c.slotIndex, c]));
  const out: Array<[string, string]> = [];
  for (const a of grid.crates) {
    for (const n of neighbourIndices(a.slotIndex, grid.cols, grid.rows)) {
      if (n <= a.slotIndex) continue; // each pair once
      const b = bySlot.get(n);
      if (!b) continue;
      const f = pairFeeling(a, b);
      if (f.level === 'stressed' && !f.needsQuiet) out.push([a.animalId, b.animalId]);
    }
  }
  return out;
}

export function insideDirtPerKm(grid?: CrateGrid, conditions?: Record<string, PassengerCondition>): number {
  if (!grid) return 0;
  let rate = 0;
  for (const c of grid.crates) {
    const cond = conditions?.[c.animalId];
    if (c.poorly) rate += T.INSIDE_DIRT_PER_KM_SICK;
    if (cond?.moulting) rate += T.INSIDE_DIRT_PER_KM_MOULTING;
    if (cond?.messy) rate += T.INSIDE_DIRT_PER_KM_MESSY;
  }
  rate += squabblingPairs(grid).length * T.INSIDE_DIRT_PER_KM_SQUABBLE;
  return rate;
}

// ═══════════════════════════════════════════════════════════════════
// Visits: the station, the wash, the workshop, A.R.C.'s charger
// ═══════════════════════════════════════════════════════════════════

/**
 * Coins she actually pays for a price, and what she has left. Mirrors the
 * vet (free when she cannot afford it, GameScene's vet fee): a child is
 * never stranded for want of coins, and the purse never goes negative.
 * Whether that kindness should hold here is open question 3 in the doc.
 */
export function payCoins(price: number, coins: number): { paid: number; coinsLeft: number } {
  const paid = Math.max(0, Math.min(price, coins));
  return { paid, coinsLeft: coins - paid };
}

/** Coins for a full tank (or a station charge) from empty. */
export function fullTankCoins(vehicle: VehicleType): number {
  const range = T.RANGE_KM[vehicle];
  if (range === undefined) return 0;
  return Math.round(VEHICLE_DEFS[vehicle].fuelCost * (range / T.TYPICAL_DRIVE_KM));
}

export type VisitRefusal =
  /** The mechanic is below its level gate: the place is not open to her yet. */
  | 'not-yet'
  /** This place does not do that for this vehicle (Spark at a pump, Trikey at a wash…). */
  | 'not-here'
  /** Nothing to do: the tank is full, the van is clean, nothing to mend. */
  | 'nothing-to-do';

export interface VisitResult {
  upkeep: VanUpkeep;
  /** Coins the visit costs before `payCoins`. 0 when refused. */
  coins: number;
  /** Depot parts the visit costs (workshop only). */
  parts: Record<string, number>;
  minutes: number;
  /** Happiness change for each animal aboard. */
  happinessEach: number;
  refused?: VisitRefusal;
}

function refused(u: VanUpkeep, why: VisitRefusal): VisitResult {
  return { upkeep: u, coins: 0, parts: {}, minutes: 0, happinessEach: 0, refused: why };
}

/**
 * Fill the tank (or charge Spark) at a place, up to `to` (default full).
 * A part fill — the pump's tap-and-hold released early — costs its share.
 * Filling above the quarter resets the warning so it can fire again.
 */
export function refuel(
  u: VanUpkeep,
  vehicle: VehicleType,
  place: UpkeepPlaceId,
  level: number,
  to = 1,
): VisitResult {
  if (!fuelRuns(level, vehicle)) return refused(u, energyKind(vehicle) === 'none' ? 'not-here' : 'not-yet');
  const def = UPKEEP_PLACES[place];
  const kind = energyKind(vehicle);
  if (kind === 'fuel' && !def.fuel) return refused(u, 'not-here');
  if (kind === 'battery' && !def.charger) return refused(u, 'not-here');
  const target = clamp01(to);
  if (target <= u.energy) return refused(u, 'nothing-to-do');

  const added = target - u.energy;
  const home = place === 'arc-charger';
  const coins = home ? Math.ceil(T.HOME_CHARGE_COINS * added) : Math.ceil(fullTankCoins(vehicle) * added);
  const fullMinutes = kind === 'fuel' ? T.REFUEL_MINUTES : home ? T.HOME_CHARGE_MINUTES : T.STATION_CHARGE_MINUTES;
  return {
    upkeep: { ...u, energy: target, lowWarned: target > T.LOW_AT ? false : u.lowWarned },
    coins,
    parts: {},
    minutes: Math.ceil(fullMinutes * added),
    happinessEach: 0,
  };
}

/**
 * The car wash: a coin, the outside comes up clean, and the animals aboard
 * perk up (they love the wash, and the tube man). The INSIDE is not touched:
 * how the inside gets cleaned is not decided (open question 1 in the doc).
 * A clean van may still go through — the animals enjoy it — and pays the
 * same coin: wrong-but-safe, never locked out.
 */
export function wash(u: VanUpkeep, vehicle: VehicleType, place: UpkeepPlaceId, level: number): VisitResult {
  if (vehicle === 'pedal-trike') return refused(u, 'not-here');
  if (!washRuns(level, vehicle)) return refused(u, 'not-yet');
  if (!UPKEEP_PLACES[place].wash) return refused(u, 'not-here');
  return {
    upkeep: { ...u, dirtOutside: 0 },
    coins: T.WASH_COINS,
    parts: {},
    minutes: T.WASH_MINUTES,
    happinessEach: T.WASH_PERK_HAPPINESS,
  };
}

/** Depot parts the workshop wants for this vehicle as it stands. */
export function workshopParts(u: VanUpkeep, vehicle: VehicleType, level: number): Record<string, number> {
  const parts: Record<string, number> = {};
  const add = (p: Record<string, number>) => {
    for (const [k, q] of Object.entries(p)) parts[k] = (parts[k] ?? 0) + q;
  };
  if (spannerLight(u, vehicle, level)) add(T.SERVICE_PARTS);
  if (u.puncture) add(T.PUNCTURE_PARTS);
  for (const t of DAMAGE_THRESHOLDS) if (u.supplyDamage >= t.threshold) add(t.repairParts);
  return parts;
}

/**
 * The workshop beside the vet: wear back to nought, a puncture mended and
 * supply-run damage put right, paid in Depot parts. Whether she has the
 * parts is `canAffordParts`; what happens when she has not is open
 * question 4 in the doc (the model reports the bill and does not refuse).
 *
 * A van below the spanner light may be serviced early (wear still resets
 * and costs nothing in parts): taking a van in too soon is allowed.
 */
export function service(u: VanUpkeep, vehicle: VehicleType, place: UpkeepPlaceId, level: number): VisitResult {
  if (!workshopRuns(level)) return refused(u, 'not-yet');
  if (!UPKEEP_PLACES[place].workshop) return refused(u, 'not-here');
  if (u.wear === 0 && !u.puncture && u.supplyDamage === 0) return refused(u, 'nothing-to-do');
  return {
    upkeep: { ...u, wear: 0, puncture: false, supplyDamage: 0 },
    coins: 0,
    parts: workshopParts(u, vehicle, level),
    minutes: T.SERVICE_MINUTES,
    happinessEach: 0,
  };
}

/** Does the Depot's `parts` bag hold everything in `cost`? */
export function canAffordParts(have: Record<string, number>, cost: Record<string, number>): boolean {
  return Object.entries(cost).every(([k, q]) => (have[k] ?? 0) >= q);
}

/** Take `cost` out of the Depot's `parts` bag. Never below zero. */
export function spendParts(have: Record<string, number>, cost: Record<string, number>): Record<string, number> {
  const out = { ...have };
  for (const [k, q] of Object.entries(cost)) out[k] = Math.max(0, (out[k] ?? 0) - q);
  return out;
}

/**
 * Carry a finished supply run's damage onto the van that drove it, for the
 * workshop to mend (25A). From the workshop's level only; below it the
 * damage is shown at the end of the run, as now, and forgotten.
 */
export function recordSupplyRunDamage(u: VanUpkeep, damages: DamageEntry[], level: number): VanUpkeep {
  if (!workshopRuns(level)) return u;
  const total = damages.reduce((s, d) => s + d.severity, 0);
  return { ...u, supplyDamage: Math.min(100, u.supplyDamage + total) };
}

// ── helpers ─────────────────────────────────────────────────────

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/**
 * Without a seeded rng there is no puncture: the model stays deterministic
 * and a scene that forgot to pass one loses a puncture, never a drive.
 */
function requireRng(rng?: () => number): () => number {
  return rng ?? (() => 1);
}
