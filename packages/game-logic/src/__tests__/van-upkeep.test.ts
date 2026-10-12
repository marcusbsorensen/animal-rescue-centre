import { describe, it, expect } from 'vitest';
import {
  UPKEEP_TUNABLES as T,
  UPKEEP_PLACES,
  applyDrive,
  applyDriveLeg,
  applyRoughEvent,
  arrivalHappinessEach,
  canAffordParts,
  cleanByHand,
  conditionsFromIllnesses,
  hoover,
  insideRuns,
  isMoulting,
  missingParts,
  valet,
  washRuns,
  MOULTING_SPECIES,
  energyKind,
  freshFleetUpkeep,
  freshUpkeep,
  fullTankCoins,
  insideDirtPerKm,
  isDirtyInside,
  isDirtyOutside,
  isLow,
  migrateFleetUpkeep,
  migrateVanUpkeep,
  nearerStation,
  needsWorkshop,
  outsideDirtPerKm,
  payCoins,
  rangeLeftKm,
  recordSupplyRunDamage,
  refuel,
  rideRoughness,
  service,
  spannerLight,
  spendParts,
  squabblingPairs,
  towCost,
  wash,
  workshopParts,
  type DriveReport,
  type VanUpkeep,
} from '../van-upkeep';
import { VEHICLE_DEFS, type CrateGrid, type LoadedCrate } from '../crate-stacking';
import { ALL_REWARDS } from '../depot-inventory';
import { ILLNESSES } from '../vet';
import type { Species } from '@arc/shared-types';

const DRIVE = T.TYPICAL_DRIVE_KM;

/** A drive of `km` on one road class. */
const drive = (over: Partial<DriveReport> & Pick<DriveReport, 'vehicle' | 'level'>, km: number = DRIVE, roadClass = 'secondary'): DriveReport => ({
  legs: [{ roadClass, km }],
  ...over,
});

/** Seeded rng (mulberry32), as drive-events.ts uses. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const crate = (slotIndex: number, animalId: string, species: LoadedCrate['species'], poorly = false): LoadedCrate => ({
  slotIndex, animalId, species, crateType: 'standard', ...(poorly ? { poorly } : {}),
});

const henryGrid = (crates: LoadedCrate[]): CrateGrid => ({ vehicle: 'small-van', cols: 2, rows: 2, crates });

/** A Depot parts bag that can pay any bill. */
const PLENTY = { rusty_bolt: 99, shiny_cog: 99, copper_wire: 99 };

describe('places (22A)', () => {
  it('two stations, each with fuel, a wash and a charger; the tube man in the west', () => {
    for (const id of ['station-west', 'station-east'] as const) {
      const p = UPKEEP_PLACES[id];
      expect([p.fuel, p.wash, p.charger]).toEqual([true, true, true]);
    }
    expect(UPKEEP_PLACES['station-west'].tubeMan).toBe(true);
    expect(UPKEEP_PLACES['station-east'].tubeMan).toBe(false);
    expect(UPKEEP_PLACES.workshop.workshop).toBe(true);
    expect(UPKEEP_PLACES['arc-charger']).toMatchObject({ charger: true, fuel: false, wash: false });
  });

  it('nearerStation picks by the distances it is given, ties going west', () => {
    expect(nearerStation({ 'station-west': 2, 'station-east': 1.5 })).toBe('station-east');
    expect(nearerStation({ 'station-west': 0.4, 'station-east': 3 })).toBe('station-west');
    expect(nearerStation({ 'station-west': 1, 'station-east': 1 })).toBe('station-west');
    expect(nearerStation({ 'station-west': Infinity, 'station-east': 9 })).toBe('station-east');
  });
});

describe('level gates (28A)', () => {
  it('below level 2 no fuel is used', () => {
    const r = applyDrive(freshUpkeep(), drive({ vehicle: 'small-van', level: 1 }, 50));
    expect(r.upkeep.energy).toBe(1);
    expect(r.events).toEqual([]);
    expect(r.kmDriven).toBe(50);
  });

  it('from level 2 fuel falls; dirt and wear do not run yet', () => {
    const r = applyDrive(freshUpkeep(), drive({ vehicle: 'small-van', level: 2, weather: 'snow', hardStops: 5 }, DRIVE, 'track'));
    expect(r.upkeep.energy).toBeLessThan(1);
    expect(r.upkeep.dirtOutside).toBe(0);
    expect(r.upkeep.wear).toBe(0);
  });

  it('from level 4 the van gets dirty; still no wear', () => {
    const r = applyDrive(freshUpkeep(), drive({ vehicle: 'small-van', level: 4, kerbs: 3 }, DRIVE, 'track'));
    expect(r.upkeep.dirtOutside).toBeGreaterThan(0);
    expect(r.upkeep.wear).toBe(0);
  });

  it('from level 6 the van wears', () => {
    const r = applyDrive(freshUpkeep(), drive({ vehicle: 'small-van', level: 6 }));
    expect(r.upkeep.wear).toBeGreaterThan(0);
  });

  it('visits below their gate are refused as not-yet, and cost nothing', () => {
    const half = { ...freshUpkeep(), energy: 0.5, dirtOutside: 0.8, wear: 0.9 };
    expect(refuel(half, 'small-van', 'station-west', 1).refused).toBe('not-yet');
    expect(wash(half, 'small-van', 'station-west', 3).refused).toBe('not-yet');
    expect(service(half, 'small-van', 'workshop', 5, PLENTY)).toMatchObject({ refused: 'not-yet', coins: 0, parts: {} });
  });

  it('below the workshop gate the ride is never rougher and no light shows', () => {
    const worn = { ...freshUpkeep(), wear: 1, puncture: true };
    expect(rideRoughness(worn, 'small-van', 5)).toBe(1);
    expect(spannerLight(worn, 'small-van', 5)).toBe(false);
    expect(needsWorkshop(worn, 'small-van', 5)).toBe(false);
  });
});

describe('fuel (23A)', () => {
  it('bigger vans burn faster', () => {
    const left = (v: 'small-van' | 'long-van' | 'animal-lorry') =>
      applyDrive(freshUpkeep(), drive({ vehicle: v, level: 10 })).upkeep.energy;
    expect(left('small-van')).toBeGreaterThan(left('long-van'));
    expect(left('long-van')).toBeGreaterThan(left('animal-lorry'));
  });

  it('a refuel every few drives, never every drive', () => {
    for (const v of ['small-van', 'long-van', 'animal-lorry', 'electric-minibus'] as const) {
      const drives = T.RANGE_KM[v]! / DRIVE;
      expect(drives, v).toBeGreaterThanOrEqual(2.5);
    }
    // Henry, the level-2 van, goes about five drives on a tank.
    expect(T.RANGE_KM['small-van']! / DRIVE).toBeGreaterThanOrEqual(4);
  });

  it('the quarter-tank warning fires once, at the right distance, until the next fill', () => {
    let u = freshUpkeep();
    const lows: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = applyDrive(u, drive({ vehicle: 'small-van', level: 2 }));
      u = r.upkeep;
      lows.push(r.events.filter((e) => e.type === 'low').length);
    }
    // 12 km tank: 3 km left (the quarter) is crossed on drive 4 (7.5 → 10 km).
    expect(lows).toEqual([0, 0, 0, 1]);
    expect(isLow(u, 'small-van', 2)).toBe(true);

    // Further driving does not fire it again.
    const again = applyDrive(u, drive({ vehicle: 'small-van', level: 2 }, 1));
    expect(again.events.some((e) => e.type === 'low')).toBe(false);

    // A fill above the quarter resets it.
    const filled = refuel(again.upkeep, 'small-van', 'station-east', 2).upkeep;
    expect(filled.lowWarned).toBe(false);
  });

  it('says where along the drive the warning fired', () => {
    const u = { ...freshUpkeep(), energy: 0.5 }; // 6 km left; quarter at 3 km
    const r = applyDrive(u, drive({ vehicle: 'small-van', level: 2 }, 4));
    expect(r.events.find((e) => e.type === 'low')).toEqual({ type: 'low', atKm: 3, energy: 'fuel' });
  });

  it('a part fill keeps the warning armed if still under the quarter', () => {
    const u: VanUpkeep = { ...freshUpkeep(), energy: 0.1, lowWarned: true };
    expect(refuel(u, 'small-van', 'station-west', 2, 0.2).upkeep.lowWarned).toBe(true);
  });

  it('ignored, the van runs dry, is towed, and the rest of the drive is not driven', () => {
    const u = { ...freshUpkeep(), energy: 0.1 }; // 1.2 km left
    const r = applyDrive(u, {
      vehicle: 'small-van',
      level: 2,
      legs: [{ roadClass: 'secondary', km: 1 }, { roadClass: 'residential', km: 2 }],
      grid: henryGrid([crate(0, 'a', 'cat')]),
    });
    expect(r.kmDriven).toBeCloseTo(1.2, 6);
    const dry = r.events.find((e) => e.type === 'ran-dry');
    expect(dry).toEqual({ type: 'ran-dry', atKm: 1.2, energy: 'fuel' });
    expect(r.tow).toEqual({ coins: T.TOW_COINS, minutes: T.TOW_MINUTES, happinessEach: T.TOW_RESTLESS_HAPPINESS });
    // The tow leaves a splash, enough to reach a pump.
    expect(r.upkeep.energy).toBe(T.TOW_SPLASH);
    expect(rangeLeftKm(r.upkeep, 'small-van')).toBeGreaterThan(1);
  });

  it('an empty van that runs dry costs time and coins but upsets nobody', () => {
    expect(towCost().happinessEach).toBe(0);
    expect(towCost(henryGrid([])).happinessEach).toBe(0);
    expect(towCost().coins).toBeGreaterThan(0);
    expect(towCost().minutes).toBeGreaterThan(0);
  });

  it('a van already on empty runs dry at the start of the drive', () => {
    const r = applyDrive({ ...freshUpkeep(), energy: 0 }, drive({ vehicle: 'small-van', level: 2 }));
    expect(r.kmDriven).toBe(0);
    expect(r.tow).toBeDefined();
  });

  it('wear and dirt accrue only for the distance driven before running dry', () => {
    const u = { ...freshUpkeep(), energy: 0.1 };
    const cut = applyDrive(u, drive({ vehicle: 'small-van', level: 6 }, 10));
    const whole = applyDrive(freshUpkeep(), drive({ vehicle: 'small-van', level: 6 }, 10));
    expect(cut.upkeep.wear).toBeLessThan(whole.upkeep.wear);
  });

  it('applyDriveLeg as the scene drives gives the same answer as one applyDrive', () => {
    const report = drive({ vehicle: 'long-van', level: 6, weather: 'light_rain' }, 3);
    const whole = applyDrive(freshUpkeep(), report).upkeep;
    let u = freshUpkeep();
    for (let i = 0; i < 6; i++) {
      u = applyDriveLeg(u, { vehicle: 'long-van', level: 6, weather: 'light_rain', roadClass: 'secondary', km: 0.5 }).upkeep;
    }
    expect(u.energy).toBeCloseTo(whole.energy, 9);
    expect(u.wear).toBeCloseTo(whole.wear, 9);
    expect(u.dirtOutside).toBeCloseTo(whole.dirtOutside, 9);
  });
});

describe('paying (24A)', () => {
  it('a full tank is the old per-drive fuelCost times the drives it lasts', () => {
    expect(fullTankCoins('small-van')).toBe(Math.round(VEHICLE_DEFS['small-van'].fuelCost * 12 / DRIVE));
    expect(fullTankCoins('animal-lorry')).toBeGreaterThan(fullTankCoins('small-van'));
    expect(fullTankCoins('pedal-trike')).toBe(0);
  });

  it('a part fill costs its share, rounded up', () => {
    const r = refuel({ ...freshUpkeep(), energy: 0.5 }, 'small-van', 'station-west', 2);
    expect(r.coins).toBe(Math.ceil(fullTankCoins('small-van') * 0.5));
    expect(r.upkeep.energy).toBe(1);
    expect(r.minutes).toBeGreaterThan(0);
  });

  it('a full tank is nothing to do', () => {
    expect(refuel(freshUpkeep(), 'small-van', 'station-west', 2).refused).toBe('nothing-to-do');
  });

  it('a fuel van at A.R.C.\'s charger or the workshop gets no fuel: not-here, free', () => {
    const u = { ...freshUpkeep(), energy: 0.2 };
    expect(refuel(u, 'small-van', 'arc-charger', 2)).toMatchObject({ refused: 'not-here', coins: 0 });
    expect(refuel(u, 'small-van', 'workshop', 2)).toMatchObject({ refused: 'not-here', coins: 0 });
  });

  it('payCoins never takes more than she has', () => {
    expect(payCoins(24, 100)).toEqual({ paid: 24, coinsLeft: 76 });
    expect(payCoins(24, 10)).toEqual({ paid: 10, coinsLeft: 0 });
    expect(payCoins(1, 0)).toEqual({ paid: 0, coinsLeft: 0 });
  });

  it('repairs cost Depot parts the Depot actually hands out, never coins', () => {
    const partCodes = new Set(ALL_REWARDS.filter((r) => r.category === 'part').map((r) => r.code));
    const u: VanUpkeep = { ...freshUpkeep(), wear: 0.9, supplyDamage: 100 };
    const r = service(u, 'animal-lorry', 'workshop', 6, PLENTY);
    expect(r.coins).toBe(0);
    expect(Object.keys(r.parts).length).toBeGreaterThan(0);
    for (const code of Object.keys(r.parts)) expect(partCodes.has(code), code).toBe(true);
    const trike = service({ ...freshUpkeep(), puncture: true }, 'pedal-trike', 'workshop', 6, PLENTY);
    for (const code of Object.keys(trike.parts)) expect(partCodes.has(code), code).toBe(true);
  });

  it('canAffordParts and spendParts read and spend the Depot parts bag', () => {
    const bag = { rusty_bolt: 2, shiny_cog: 1 };
    expect(canAffordParts(bag, { rusty_bolt: 1, shiny_cog: 1 })).toBe(true);
    expect(canAffordParts(bag, { copper_wire: 1 })).toBe(false);
    expect(spendParts(bag, { rusty_bolt: 1, shiny_cog: 2 })).toEqual({ rusty_bolt: 1, shiny_cog: 0 });
    expect(bag).toEqual({ rusty_bolt: 2, shiny_cog: 1 }); // pure
  });
});

describe('workshop (25A)', () => {
  it('wear builds with distance; farm tracks wear faster; bigger vans faster', () => {
    const w = (v: 'small-van' | 'animal-lorry', road: string) =>
      applyDrive(freshUpkeep(), drive({ vehicle: v, level: 6 }, DRIVE, road)).upkeep.wear;
    expect(w('small-van', 'track')).toBeGreaterThan(w('small-van', 'secondary'));
    expect(w('animal-lorry', 'secondary')).toBeGreaterThan(w('small-van', 'secondary'));
  });

  it('rough driving wears the van: hard stops, self-stops, kerbs', () => {
    const smooth = applyDrive(freshUpkeep(), drive({ vehicle: 'small-van', level: 6 })).upkeep.wear;
    const rough = applyDrive(freshUpkeep(), drive({ vehicle: 'small-van', level: 6, hardStops: 2, selfStops: 2, kerbs: 1 })).upkeep.wear;
    expect(rough - smooth).toBeCloseTo(2 * T.WEAR_PER_HARD_STOP + 2 * T.WEAR_PER_SELF_STOP + T.WEAR_PER_KERB, 9);
    // The van stopping itself costs more than her own hard stop.
    expect(T.WEAR_PER_SELF_STOP).toBeGreaterThan(T.WEAR_PER_HARD_STOP);
  });

  it('applyRoughEvent adds the same wear one moment at a time', () => {
    const r = applyRoughEvent(freshUpkeep(), 'kerb', 'small-van', 6);
    expect(r.upkeep.wear).toBeCloseTo(T.WEAR_PER_KERB, 9);
    expect(applyRoughEvent(freshUpkeep(), 'kerb', 'small-van', 5).upkeep.wear).toBe(0);
  });

  it('the spanner light comes on past the threshold, once, and the ride gets bumpier', () => {
    let u = { ...freshUpkeep(), wear: T.SPANNER_AT - 0.01 };
    expect(rideRoughness(u, 'small-van', 6)).toBe(1);
    const r = applyDrive(u, drive({ vehicle: 'small-van', level: 6, kerbs: 1 }));
    u = r.upkeep;
    expect(r.events.filter((e) => e.type === 'spanner-on')).toHaveLength(1);
    expect(spannerLight(u, 'small-van', 6)).toBe(true);
    expect(rideRoughness(u, 'small-van', 6)).toBe(T.WORN_ROUGHNESS);
    const after = applyDrive(u, drive({ vehicle: 'small-van', level: 6 }));
    expect(after.events.some((e) => e.type === 'spanner-on')).toBe(false);
  });

  it('a gentle driver sees the spanner light every couple of dozen drives, a rough one sooner', () => {
    const drivesTo = (rough: Partial<DriveReport>) => {
      let u = freshUpkeep();
      for (let n = 1; n < 200; n++) {
        u = { ...applyDrive(u, drive({ vehicle: 'small-van', level: 6, ...rough })).upkeep, energy: 1 };
        if (spannerLight(u, 'small-van', 6)) return n;
      }
      return Infinity;
    };
    const gentle = drivesTo({});
    const rough = drivesTo({ hardStops: 1, selfStops: 1 });
    expect(gentle).toBeGreaterThanOrEqual(15);
    expect(gentle).toBeLessThanOrEqual(30);
    expect(rough).toBeLessThan(gentle);
  });

  it('the service puts it right, in parts, and the ride is smooth again', () => {
    const u = { ...freshUpkeep(), wear: 0.8 };
    const r = service(u, 'small-van', 'workshop', 6, PLENTY);
    expect(r.upkeep.wear).toBe(0);
    expect(r.parts).toEqual(T.SERVICE_PARTS);
    expect(rideRoughness(r.upkeep, 'small-van', 6)).toBe(1);
  });

  it('an early service is allowed and costs no parts; a fresh van is nothing to do', () => {
    const early = service({ ...freshUpkeep(), wear: 0.2 }, 'small-van', 'workshop', 6, PLENTY);
    expect(early.refused).toBeUndefined();
    expect(early.parts).toEqual({});
    expect(early.upkeep.wear).toBe(0);
    expect(service(freshUpkeep(), 'small-van', 'workshop', 6, PLENTY).refused).toBe('nothing-to-do');
  });

  it('the service is only at the workshop', () => {
    expect(service({ ...freshUpkeep(), wear: 0.8 }, 'small-van', 'station-west', 6, PLENTY).refused).toBe('not-here');
  });

  it('supply-run damage is carried to the van and mended at the workshop', () => {
    const damaged = recordSupplyRunDamage(freshUpkeep(), [
      { type: 'scratches', severity: 12 },
      { type: 'dents', severity: 12 },
      { type: 'rattles', severity: 12 },
    ], 6);
    expect(damaged.supplyDamage).toBe(36);
    expect(needsWorkshop(damaged, 'small-van', 6)).toBe(true);
    // scratches + dents + rattles, as getRepairCost says for 36.
    expect(workshopParts(damaged, 'small-van', 6)).toEqual({ rusty_bolt: 4, shiny_cog: 1 });
    expect(service(damaged, 'small-van', 'workshop', 6, PLENTY).upkeep.supplyDamage).toBe(0);
  });

  it('supply-run damage is not kept below the workshop level', () => {
    expect(recordSupplyRunDamage(freshUpkeep(), [{ type: 'dents', severity: 30 }], 5).supplyDamage).toBe(0);
  });

  it('supply-run damage caps at 100', () => {
    const u = recordSupplyRunDamage({ ...freshUpkeep(), supplyDamage: 90 }, [{ type: 'total', severity: 40 }], 6);
    expect(u.supplyDamage).toBe(100);
  });
});

describe('Spark and Trikey (27A+B)', () => {
  it('Spark has a battery, not a tank', () => {
    expect(energyKind('electric-minibus')).toBe('battery');
    expect(energyKind('small-van')).toBe('fuel');
    expect(energyKind('pedal-trike')).toBe('none');
    const r = applyDrive({ ...freshUpkeep(), energy: 0.3 }, drive({ vehicle: 'electric-minibus', level: 12 }, 1));
    expect(r.events.find((e) => e.type === 'low')).toMatchObject({ energy: 'battery' });
  });

  it('Spark charges at A.R.C. and at either station, never at the workshop', () => {
    const u = { ...freshUpkeep(), energy: 0.2 };
    for (const place of ['arc-charger', 'station-west', 'station-east'] as const) {
      const r = refuel(u, 'electric-minibus', place, 12);
      expect(r.refused, place).toBeUndefined();
      expect(r.upkeep.energy).toBe(1);
    }
    expect(refuel(u, 'electric-minibus', 'workshop', 12).refused).toBe('not-here');
  });

  it('charging at home is cheaper and slower than at a station', () => {
    const u = { ...freshUpkeep(), energy: 0.2 };
    const home = refuel(u, 'electric-minibus', 'arc-charger', 12);
    const away = refuel(u, 'electric-minibus', 'station-east', 12);
    expect(home.coins).toBeLessThan(away.coins);
    expect(home.minutes).toBeGreaterThan(away.minutes);
    // A pump fill is quicker than any charge.
    expect(refuel(u, 'small-van', 'station-east', 12).minutes).toBeLessThan(away.minutes);
  });

  it('Spark runs dry like any van, and is towed', () => {
    const r = applyDrive({ ...freshUpkeep(), energy: 0.05 }, drive({ vehicle: 'electric-minibus', level: 12 }));
    expect(r.events.find((e) => e.type === 'ran-dry')).toMatchObject({ energy: 'battery' });
    expect(r.tow).toBeDefined();
  });

  it('Trikey needs no fuel, ever, and is never low', () => {
    const r = applyDrive(freshUpkeep(), drive({ vehicle: 'pedal-trike', level: 20 }, 500));
    expect(r.upkeep.energy).toBe(1);
    expect(r.kmDriven).toBe(500);
    expect(r.events.some((e) => e.type === 'low' || e.type === 'ran-dry')).toBe(false);
    expect(rangeLeftKm(freshUpkeep(), 'pedal-trike')).toBe(Infinity);
    expect(refuel({ ...freshUpkeep(), energy: 0.1 }, 'pedal-trike', 'station-west', 20).refused).toBe('not-here');
  });

  it('Trikey does not wear', () => {
    const r = applyDrive(freshUpkeep(), drive({ vehicle: 'pedal-trike', level: 20, hardStops: 9, weather: 'snow' }, 20, 'track'));
    expect(r.upkeep.wear).toBe(0);
  });

  it('Trikey gets the odd puncture, deterministically from the seed', () => {
    const run = (seed: number) => {
      const rng = seeded(seed);
      let u = freshUpkeep();
      let punctures = 0;
      for (let i = 0; i < 300; i++) {
        const r = applyDrive(u, drive({ vehicle: 'pedal-trike', level: 6, rng }));
        if (r.upkeep.puncture) {
          punctures++;
          u = service(r.upkeep, 'pedal-trike', 'workshop', 6, PLENTY).upkeep;
        } else {
          u = r.upkeep;
        }
      }
      return punctures;
    };
    expect(run(7)).toBe(run(7));
    // "the odd puncture": a handful in 300 drives, not one a week.
    const n = run(7);
    expect(n).toBeGreaterThan(2);
    expect(n).toBeLessThan(30);
  });

  it('a farm track and kerbs make a puncture likelier', () => {
    const count = (road: string, kerbs: number) => {
      const rng = seeded(42);
      let n = 0;
      for (let i = 0; i < 500; i++) {
        if (applyDrive(freshUpkeep(), drive({ vehicle: 'pedal-trike', level: 6, rng, kerbs }, DRIVE, road)).upkeep.puncture) n++;
      }
      return n;
    };
    expect(count('track', 0)).toBeGreaterThan(count('residential', 0));
    expect(count('residential', 2)).toBeGreaterThan(count('residential', 0));
  });

  it('no puncture below the workshop level, or without an rng', () => {
    const always = () => 0;
    expect(applyDrive(freshUpkeep(), drive({ vehicle: 'pedal-trike', level: 5, rng: always })).upkeep.puncture).toBe(false);
    expect(applyDrive(freshUpkeep(), drive({ vehicle: 'pedal-trike', level: 6 })).upkeep.puncture).toBe(false);
    expect(applyDrive(freshUpkeep(), drive({ vehicle: 'pedal-trike', level: 6, rng: always })).upkeep.puncture).toBe(true);
  });

  it('a flat tyre makes the ride bumpier and sends Trikey to the workshop for parts', () => {
    const flat = { ...freshUpkeep(), puncture: true };
    expect(rideRoughness(flat, 'pedal-trike', 6)).toBe(T.PUNCTURE_ROUGHNESS);
    expect(needsWorkshop(flat, 'pedal-trike', 6)).toBe(true);
    const r = service(flat, 'pedal-trike', 'workshop', 6, PLENTY);
    expect(r.parts).toEqual(T.PUNCTURE_PARTS);
    expect(r.upkeep.puncture).toBe(false);
  });

  it('a punctured Trikey can still be ridden (never locked out)', () => {
    const r = applyDrive({ ...freshUpkeep(), puncture: true }, drive({ vehicle: 'pedal-trike', level: 6, rng: () => 0 }));
    expect(r.kmDriven).toBe(DRIVE);
    expect(r.tow).toBeUndefined();
  });
});

describe('dirt outside (26A)', () => {
  it('farm tracks dirty the van far faster than roads', () => {
    expect(outsideDirtPerKm('track')).toBeGreaterThan(10 * outsideDirtPerKm('secondary'));
  });

  it('rain, snow and winter add to it', () => {
    const dry = outsideDirtPerKm('secondary', 'sunny', 'summer_warmth');
    expect(outsideDirtPerKm('secondary', 'light_rain', 'summer_warmth')).toBeGreaterThan(dry);
    expect(outsideDirtPerKm('secondary', 'snow', 'summer_warmth')).toBeGreaterThan(outsideDirtPerKm('secondary', 'heavy_rain', 'summer_warmth'));
    expect(outsideDirtPerKm('secondary', 'sunny', 'winter_cosy')).toBeGreaterThan(dry);
  });

  it('outside dirt never touches the inside, and crossing DIRTY_AT is an event', () => {
    const r = applyDrive({ ...freshUpkeep(), dirtOutside: T.DIRTY_AT - 0.01 }, drive({ vehicle: 'small-van', level: 4 }, 1, 'track'));
    expect(r.upkeep.dirtInside).toBe(0);
    expect(r.events).toContainEqual({ type: 'dirty-outside' });
    expect(isDirtyOutside(r.upkeep, 'small-van', 4)).toBe(true);
  });
});

describe('dirt inside (26A extended)', () => {
  it('an empty van stays clean inside', () => {
    expect(insideDirtPerKm()).toBe(0);
    expect(insideDirtPerKm(henryGrid([]))).toBe(0);
  });

  it('a sick animal dirties the inside (the game\'s own poorly flag)', () => {
    expect(insideDirtPerKm(henryGrid([crate(0, 'a', 'dog', true)]))).toBe(T.INSIDE_DIRT_PER_KM_SICK);
  });

  it('a moulting one and a messy one, passed in as conditions', () => {
    const g = henryGrid([crate(0, 'a', 'dog'), crate(3, 'b', 'dog')]);
    expect(insideDirtPerKm(g, { a: { moulting: true } })).toBe(T.INSIDE_DIRT_PER_KM_MOULTING);
    expect(insideDirtPerKm(g, { b: { messy: true } })).toBe(T.INSIDE_DIRT_PER_KM_MESSY);
  });

  it('a squabbling pair dirties the inside', () => {
    // cat beside dog: a 'stressed' pair (crate-stacking MATRIX).
    const g = henryGrid([crate(0, 'c', 'cat'), crate(1, 'd', 'dog')]);
    expect(squabblingPairs(g)).toEqual([['c', 'd']]);
    expect(insideDirtPerKm(g)).toBe(T.INSIDE_DIRT_PER_KM_SQUABBLE);
    const r = applyDrive(freshUpkeep(), drive({ vehicle: 'small-van', level: 4, grid: g }));
    expect(r.upkeep.dirtInside).toBeCloseTo(T.INSIDE_DIRT_PER_KM_SQUABBLE * DRIVE, 9);
    expect(r.upkeep.dirtOutside).toBeCloseTo(T.OUTSIDE_DIRT_PER_KM_BASE * DRIVE, 9);
  });

  it('the same pair on a diagonal, or happy neighbours, do not squabble', () => {
    expect(squabblingPairs(henryGrid([crate(0, 'c', 'cat'), crate(3, 'd', 'dog')]))).toEqual([]);
    expect(squabblingPairs(henryGrid([crate(0, 'a', 'dog'), crate(1, 'b', 'dog')]))).toEqual([]);
  });

  it('a healthy animal giving a poorly one space is not a squabble', () => {
    // dog beside dog is happy, but one being poorly makes the pair 'stressed'
    // with needsQuiet: only the sick one's own dirt counts.
    const g = henryGrid([crate(0, 'a', 'dog', true), crate(1, 'b', 'dog')]);
    expect(squabblingPairs(g)).toEqual([]);
    expect(insideDirtPerKm(g)).toBe(T.INSIDE_DIRT_PER_KM_SICK);
  });

  it('every pair counts once', () => {
    // Bea, 2x3: cat | dog / dog | cat — four stressed edges, each once.
    const g: CrateGrid = {
      vehicle: 'long-van', cols: 2, rows: 3,
      crates: [crate(0, 'c1', 'cat'), crate(1, 'd1', 'dog'), crate(2, 'd2', 'dog'), crate(3, 'c2', 'cat')],
    };
    expect(squabblingPairs(g)).toHaveLength(4);
  });

  it('crossing DIRTY_AT inside is its own event', () => {
    const u = { ...freshUpkeep(), dirtInside: T.DIRTY_AT - 0.01, dirtOutside: 0.9 };
    const r = applyDrive(u, drive({ vehicle: 'small-van', level: 4, grid: henryGrid([crate(0, 'a', 'cat', true)]) }));
    expect(r.events).toContainEqual({ type: 'dirty-inside' });
    expect(r.events).not.toContainEqual({ type: 'dirty-outside' });
    expect(isDirtyInside(r.upkeep, 'small-van', 4)).toBe(true);
  });

  it('no inside dirt below the wash level', () => {
    const r = applyDrive(freshUpkeep(), drive({ vehicle: 'small-van', level: 3, grid: henryGrid([crate(0, 'a', 'cat', true)]) }));
    expect(r.upkeep.dirtInside).toBe(0);
  });
});

describe('the wash (24A, 26A)', () => {
  it('a coin, the outside clean, and the animals perk up', () => {
    const r = wash({ ...freshUpkeep(), dirtOutside: 0.8 }, 'long-van', 'station-east', 4);
    expect(r).toMatchObject({ coins: T.WASH_COINS, happinessEach: T.WASH_PERK_HAPPINESS, parts: {} });
    expect(r.upkeep.dirtOutside).toBe(0);
    expect(T.WASH_COINS).toBe(1);
  });

  it('a clean van may go through anyway (wrong-but-safe): same coin', () => {
    const r = wash(freshUpkeep(), 'small-van', 'station-west', 4);
    expect(r.refused).toBeUndefined();
    expect(r.coins).toBe(T.WASH_COINS);
  });

  it('only at a station', () => {
    expect(wash({ ...freshUpkeep(), dirtOutside: 1 }, 'small-van', 'workshop', 4).refused).toBe('not-here');
    expect(wash({ ...freshUpkeep(), dirtOutside: 1 }, 'small-van', 'arc-charger', 4).refused).toBe('not-here');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Marcus's answers to the model's ten questions (2026-10-12)
// ═══════════════════════════════════════════════════════════════════

describe('answer 1: four ways to clean the inside', () => {
  const dirty: VanUpkeep = { ...freshUpkeep(), dirtInside: 0.8, dirtOutside: 0.7 };

  it('A: by hand at A.R.C. — free, takes a little time, inside only', () => {
    const r = cleanByHand(dirty, 'small-van', 'arc-charger', 4);
    expect(r.refused).toBeUndefined();
    expect(r).toMatchObject({ coins: 0, parts: {}, minutes: T.HAND_CLEAN_MINUTES });
    expect(r.minutes).toBeGreaterThan(0);
    expect(r.upkeep.dirtInside).toBe(0);
    expect(r.upkeep.dirtOutside).toBe(0.7);
  });

  it('A: only at home', () => {
    for (const place of ['station-west', 'station-east', 'workshop'] as const) {
      expect(cleanByHand(dirty, 'small-van', place, 4).refused, place).toBe('not-here');
    }
  });

  it('B: the hoover at both petrol stations — one coin, inside only', () => {
    for (const place of ['station-west', 'station-east'] as const) {
      const r = hoover(dirty, 'long-van', place, 4);
      expect(r.refused, place).toBeUndefined();
      expect(r).toMatchObject({ coins: 1, parts: {}, minutes: T.HOOVER_MINUTES });
      expect(r.upkeep.dirtInside).toBe(0);
      expect(r.upkeep.dirtOutside).toBe(0.7);
    }
    expect(hoover(dirty, 'long-van', 'workshop', 4).refused).toBe('not-here');
    expect(hoover(dirty, 'long-van', 'arc-charger', 4).refused).toBe('not-here');
  });

  it('C: a valet at the workshop — paid in Depot parts, inside only', () => {
    const r = valet(dirty, 'animal-lorry', 'workshop', 6, PLENTY);
    expect(r.refused).toBeUndefined();
    expect(r.coins).toBe(0);
    expect(r.parts).toEqual(T.VALET_PARTS);
    expect(r.upkeep.dirtInside).toBe(0);
    expect(r.upkeep.dirtOutside).toBe(0.7);
    expect(r.partsLeft).toEqual(spendParts(PLENTY, T.VALET_PARTS));
    expect(valet(dirty, 'animal-lorry', 'station-west', 6, PLENTY).refused).toBe('not-here');
    const partCodes = new Set(ALL_REWARDS.filter((x) => x.category === 'part').map((x) => x.code));
    for (const code of Object.keys(T.VALET_PARTS)) expect(partCodes.has(code), code).toBe(true);
  });

  it('C: the valet opens with the workshop (level 6); hand and hoover with the wash (level 4)', () => {
    expect(valet(dirty, 'small-van', 'workshop', 5, PLENTY).refused).toBe('not-yet');
    expect(cleanByHand(dirty, 'small-van', 'arc-charger', 3).refused).toBe('not-yet');
    expect(hoover(dirty, 'small-van', 'station-west', 3).refused).toBe('not-yet');
    expect(cleanByHand(dirty, 'small-van', 'arc-charger', 3).coins).toBe(0);
  });

  it('C: no parts for the valet — sent to the Depot first, nothing spent, inside still dirty', () => {
    const r = valet(dirty, 'small-van', 'workshop', 6, {});
    expect(r.refused).toBe('need-parts');
    expect(r.missingParts).toEqual(T.VALET_PARTS);
    expect(r.upkeep).toBe(dirty);
    expect(r.minutes).toBe(0);
  });

  it('D: the car wash cleans inside and out together, for its one coin', () => {
    const r = wash(dirty, 'small-van', 'station-east', 4);
    expect(r.coins).toBe(1);
    expect(r.upkeep.dirtInside).toBe(0);
    expect(r.upkeep.dirtOutside).toBe(0);
  });

  it('the hoover is the cheap inside-only choice, the wash the do-everything one', () => {
    const h = hoover(dirty, 'small-van', 'station-west', 4);
    const w = wash(dirty, 'small-van', 'station-west', 4);
    expect(h.coins).toBeLessThanOrEqual(w.coins);
    expect(h.minutes).toBeLessThan(w.minutes);
    expect(h.upkeep.dirtOutside).toBeGreaterThan(w.upkeep.dirtOutside);
  });

  it('a clean inside may be cleaned again (wrong-but-safe): same price, never refused for it', () => {
    expect(cleanByHand(freshUpkeep(), 'small-van', 'arc-charger', 4).refused).toBeUndefined();
    expect(hoover(freshUpkeep(), 'small-van', 'station-west', 4)).toMatchObject({ coins: 1 });
    expect(valet(freshUpkeep(), 'small-van', 'workshop', 6, PLENTY).refused).toBeUndefined();
  });

  it('Trikey has no inside: the inside cleans are not-here, free', () => {
    expect(cleanByHand(dirty, 'pedal-trike', 'arc-charger', 20)).toMatchObject({ refused: 'not-here', coins: 0 });
    expect(hoover(dirty, 'pedal-trike', 'station-west', 20)).toMatchObject({ refused: 'not-here', coins: 0 });
    expect(valet(dirty, 'pedal-trike', 'workshop', 20, PLENTY)).toMatchObject({ refused: 'not-here', parts: {} });
  });
});

describe('answer 2: inside dirt makes the animals a little less happy on arrival', () => {
  it('a dirty inside costs a little happiness each; a clean one nothing', () => {
    expect(T.DIRTY_INSIDE_ARRIVAL_HAPPINESS).toBeLessThan(0);
    expect(T.DIRTY_INSIDE_ARRIVAL_HAPPINESS).toBeGreaterThan(T.TOW_RESTLESS_HAPPINESS); // "a little"
    expect(arrivalHappinessEach({ ...freshUpkeep(), dirtInside: T.DIRTY_AT }, 'small-van', 4)).toBe(T.DIRTY_INSIDE_ARRIVAL_HAPPINESS);
    expect(arrivalHappinessEach({ ...freshUpkeep(), dirtInside: T.DIRTY_AT - 0.01 }, 'small-van', 4)).toBe(0);
  });

  it('outside dirt is only seen: no happiness cost', () => {
    expect(arrivalHappinessEach({ ...freshUpkeep(), dirtOutside: 1 }, 'small-van', 4)).toBe(0);
  });

  it('applyDrive reports it, from the state at the end of the drive', () => {
    const g = henryGrid([crate(0, 'a', 'cat', true)]);
    const clean = applyDrive(freshUpkeep(), drive({ vehicle: 'small-van', level: 4, grid: g }));
    expect(clean.arrivalHappinessEach).toBe(0);
    const tipped = applyDrive({ ...freshUpkeep(), dirtInside: T.DIRTY_AT - 0.01 }, drive({ vehicle: 'small-van', level: 4, grid: g }));
    expect(tipped.arrivalHappinessEach).toBe(T.DIRTY_INSIDE_ARRIVAL_HAPPINESS);
  });

  it('below the wash level, and on Trikey, there is no cost', () => {
    const filthy = { ...freshUpkeep(), dirtInside: 1 };
    expect(arrivalHappinessEach(filthy, 'small-van', 3)).toBe(0);
    expect(arrivalHappinessEach(filthy, 'pedal-trike', 20)).toBe(0);
  });

  it('any of the four cleans puts it right', () => {
    const filthy = { ...freshUpkeep(), dirtInside: 1 };
    for (const r of [
      cleanByHand(filthy, 'small-van', 'arc-charger', 6),
      hoover(filthy, 'small-van', 'station-west', 6),
      valet(filthy, 'small-van', 'workshop', 6, PLENTY),
      wash(filthy, 'small-van', 'station-west', 6),
    ]) expect(arrivalHappinessEach(r.upkeep, 'small-van', 6)).toBe(0);
  });
});

describe('answer 3: short of coins, she pays what she has and still gets the fill', () => {
  it('a full tank with 3 coins: pays 3, tank full', () => {
    const r = refuel({ ...freshUpkeep(), energy: 0.1 }, 'small-van', 'station-west', 2);
    expect(r.upkeep.energy).toBe(1);
    expect(payCoins(r.coins, 3)).toEqual({ paid: 3, coinsLeft: 0 });
  });

  it('the wash and the hoover with an empty purse: free, and done', () => {
    const dirty = { ...freshUpkeep(), dirtInside: 0.9, dirtOutside: 0.9 };
    const w = wash(dirty, 'small-van', 'station-west', 4);
    expect(payCoins(w.coins, 0)).toEqual({ paid: 0, coinsLeft: 0 });
    expect(w.upkeep.dirtOutside).toBe(0);
    const h = hoover(dirty, 'small-van', 'station-east', 4);
    expect(payCoins(h.coins, 0).paid).toBe(0);
    expect(h.upkeep.dirtInside).toBe(0);
  });
});

describe('answer 4: no Depot parts — the workshop sends her to the Depot first', () => {
  const worn: VanUpkeep = { ...freshUpkeep(), wear: 0.8 };

  it('says so as a result: need-parts, the bill, and what is missing', () => {
    const r = service(worn, 'small-van', 'workshop', 6, { rusty_bolt: 1 });
    expect(r.refused).toBe('need-parts');
    expect(r.parts).toEqual(T.SERVICE_PARTS);
    expect(r.missingParts).toEqual({ shiny_cog: 1 });
    expect(r.partsLeft).toBeUndefined();
    expect(r.coins).toBe(0);
    expect(r.minutes).toBe(0);
  });

  it('nothing mended, nothing spent: the spanner light stays on', () => {
    const r = service(worn, 'small-van', 'workshop', 6, {});
    expect(r.upkeep).toEqual(worn);
    expect(spannerLight(r.upkeep, 'small-van', 6)).toBe(true);
    expect(needsWorkshop(r.upkeep, 'small-van', 6)).toBe(true);
  });

  it('the van stays driveable, just bumpier', () => {
    const r = applyDrive(worn, drive({ vehicle: 'small-van', level: 6 }));
    expect(r.kmDriven).toBe(DRIVE);
    expect(r.tow).toBeUndefined();
    expect(rideRoughness(r.upkeep, 'small-van', 6)).toBe(T.WORN_ROUGHNESS);
  });

  it('all or nothing: supply-run damage she cannot fully pay for is not half-mended', () => {
    const u: VanUpkeep = { ...freshUpkeep(), wear: 0.8, supplyDamage: 36 };
    const bill = workshopParts(u, 'small-van', 6);
    const have = { rusty_bolt: 5, shiny_cog: 1 }; // enough bolts, one cog short
    const r = service(u, 'small-van', 'workshop', 6, have);
    expect(r.refused).toBe('need-parts');
    expect(r.missingParts).toEqual(missingParts(have, bill));
    expect(r.missingParts).toEqual({ shiny_cog: 1 });
    expect(r.upkeep).toEqual(u);
  });

  it('back from the Depot with the parts, it is mended and the bag is paid from', () => {
    const have = { rusty_bolt: 3, shiny_cog: 2, copper_wire: 1 };
    const r = service(worn, 'small-van', 'workshop', 6, have);
    expect(r.refused).toBeUndefined();
    expect(r.upkeep.wear).toBe(0);
    expect(r.partsLeft).toEqual({ rusty_bolt: 2, shiny_cog: 1, copper_wire: 1 });
    expect(have).toEqual({ rusty_bolt: 3, shiny_cog: 2, copper_wire: 1 }); // pure
  });

  it('a flat Trikey without a bolt is sent to the Depot too, and still rides', () => {
    const flat = { ...freshUpkeep(), puncture: true };
    const r = service(flat, 'pedal-trike', 'workshop', 6, {});
    expect(r).toMatchObject({ refused: 'need-parts', missingParts: T.PUNCTURE_PARTS });
    expect(r.upkeep.puncture).toBe(true);
    expect(applyDrive(r.upkeep, drive({ vehicle: 'pedal-trike', level: 6 })).kmDriven).toBe(DRIVE);
  });

  it('an early service needs no parts, so an empty bag is fine', () => {
    const r = service({ ...freshUpkeep(), wear: 0.2 }, 'small-van', 'workshop', 6, {});
    expect(r.refused).toBeUndefined();
    expect(r.partsLeft).toEqual({});
  });

  it('missingParts lists only what is short', () => {
    expect(missingParts({ rusty_bolt: 1 }, { rusty_bolt: 3, shiny_cog: 1 })).toEqual({ rusty_bolt: 2, shiny_cog: 1 });
    expect(missingParts({ rusty_bolt: 5 }, { rusty_bolt: 3 })).toEqual({});
  });
});

describe('answer 5: the tow takes her to the nearer petrol station', () => {
  it('towCost names the nearer station from where she stopped', () => {
    expect(towCost(undefined, { 'station-west': 1.2, 'station-east': 0.4 }).to).toBe('station-east');
    expect(towCost(undefined, { 'station-west': 0.3, 'station-east': 2 }).to).toBe('station-west');
  });

  it('applyDrive asks the scene for the distances at the point she ran dry', () => {
    const asked: number[] = [];
    const r = applyDrive(
      { ...freshUpkeep(), energy: 0.1 },
      drive({
        vehicle: 'small-van', level: 2, grid: henryGrid([crate(0, 'a', 'cat')]),
        stationKmAt: (atKm) => {
          asked.push(atKm);
          return { 'station-west': 3 - atKm, 'station-east': 1 + atKm };
        },
      }, 5),
    );
    expect(asked).toEqual([r.kmDriven]);
    expect(r.kmDriven).toBeCloseTo(1.2, 9);
    // At 1.2 km: west 1.8, east 2.2 — west is nearer.
    expect(r.tow).toMatchObject({ to: 'station-west', coins: T.TOW_COINS, minutes: T.TOW_MINUTES, happinessEach: T.TOW_RESTLESS_HAPPINESS });
  });

  it('not on to her destination: the rest of the drive is not driven, and she fills at the station', () => {
    const r = applyDrive(
      { ...freshUpkeep(), energy: 0.1 },
      drive({ vehicle: 'small-van', level: 2, stationKmAt: () => ({ 'station-west': 2, 'station-east': 1 }) }, 5),
    );
    expect(r.kmDriven).toBeLessThan(5);
    const fill = refuel(r.upkeep, 'small-van', r.tow!.to!, 2);
    expect(fill.refused).toBeUndefined();
    expect(fill.upkeep.energy).toBe(1);
    // Even with no coins (answer 3).
    expect(payCoins(fill.coins, 0).paid).toBe(0);
  });

  it('Spark is towed to a station too, and charges there', () => {
    const r = applyDrive(
      { ...freshUpkeep(), energy: 0.05 },
      drive({ vehicle: 'electric-minibus', level: 12, stationKmAt: () => ({ 'station-west': 2, 'station-east': 1 }) }),
    );
    expect(r.tow?.to).toBe('station-east');
    expect(refuel(r.upkeep, 'electric-minibus', 'station-east', 12).upkeep.energy).toBe(1);
  });

  it('without distances the tow still happens; the scene picks with nearerStation', () => {
    const r = applyDrive({ ...freshUpkeep(), energy: 0.05 }, drive({ vehicle: 'small-van', level: 2 }));
    expect(r.tow).toBeDefined();
    expect(r.tow?.to).toBeUndefined();
  });
});

describe('answer 6: Spark charges free and slow at A.R.C.', () => {
  it('free from empty, and slower than a station', () => {
    const home = refuel({ ...freshUpkeep(), energy: 0 }, 'electric-minibus', 'arc-charger', 12);
    expect(home.coins).toBe(0);
    expect(home.minutes).toBe(T.HOME_CHARGE_MINUTES);
    expect(home.minutes).toBeGreaterThan(refuel({ ...freshUpkeep(), energy: 0 }, 'electric-minibus', 'station-west', 12).minutes);
  });
});

describe('answer 7: Trikey can go through the wash, outside only', () => {
  it('Trikey gathers outside dirt on tracks and in winter, never inside', () => {
    const g = henryGrid([crate(0, 'a', 'dog', true)]);
    const r = applyDrive(freshUpkeep(), drive({ vehicle: 'pedal-trike', level: 4, season: 'winter_cosy', grid: g }, 4, 'track'));
    expect(r.upkeep.dirtOutside).toBeGreaterThanOrEqual(T.DIRTY_AT);
    expect(r.events).toContainEqual({ type: 'dirty-outside' });
    expect(r.upkeep.dirtInside).toBe(0);
    expect(isDirtyOutside(r.upkeep, 'pedal-trike', 4)).toBe(true);
    expect(washRuns(4, 'pedal-trike')).toBe(true);
    expect(insideRuns(4, 'pedal-trike')).toBe(false);
  });

  it('the wash: one coin, outside clean, the animals perk up', () => {
    const r = wash({ ...freshUpkeep(), dirtOutside: 0.9 }, 'pedal-trike', 'station-west', 4);
    expect(r.refused).toBeUndefined();
    expect(r).toMatchObject({ coins: T.WASH_COINS, happinessEach: T.WASH_PERK_HAPPINESS });
    expect(r.upkeep.dirtOutside).toBe(0);
  });

  it('still no fuel, and no wash below level 4', () => {
    const r = applyDrive(freshUpkeep(), drive({ vehicle: 'pedal-trike', level: 20 }, 50, 'track'));
    expect(r.upkeep.energy).toBe(1);
    expect(r.tow).toBeUndefined();
    expect(wash({ ...freshUpkeep(), dirtOutside: 0.9 }, 'pedal-trike', 'station-west', 3).refused).toBe('not-yet');
    expect(applyDrive(freshUpkeep(), drive({ vehicle: 'pedal-trike', level: 3 }, 4, 'track')).upkeep.dirtOutside).toBe(0);
  });
});

describe('answer 8: supply-run damage below level 6 is forgotten', () => {
  it('below 6 nothing is kept; from 6 it waits for the workshop', () => {
    const dmg = [{ type: 'dents' as const, severity: 40 }];
    for (let lvl = 0; lvl < 6; lvl++) expect(recordSupplyRunDamage(freshUpkeep(), dmg, lvl).supplyDamage).toBe(0);
    expect(recordSupplyRunDamage(freshUpkeep(), dmg, 6).supplyDamage).toBe(40);
  });

  it('so a child arriving at level 6 owes the workshop nothing', () => {
    let u = freshUpkeep();
    for (let i = 0; i < 20; i++) u = recordSupplyRunDamage(u, [{ type: 'total', severity: 99 }], 5);
    expect(needsWorkshop(u, 'small-van', 6)).toBe(false);
    expect(workshopParts(u, 'small-van', 6)).toEqual({});
  });
});

describe('answer 9: moulting by species and season; mess from tummy_ache', () => {
  const ALL_SPECIES: Species[] = ['cat', 'dog', 'fox', 'bunny', 'bat', 'parrot', 'snake', 'hedgehog'];

  it('cats, dogs, bunnies and foxes moult in spring and autumn, not summer or winter', () => {
    expect([...MOULTING_SPECIES].sort()).toEqual(['bunny', 'cat', 'dog', 'fox']);
    for (const sp of MOULTING_SPECIES) {
      expect(isMoulting(sp, 'spring_bloom'), sp).toBe(true);
      expect(isMoulting(sp, 'autumn_hush'), sp).toBe(true);
      expect(isMoulting(sp, 'summer_warmth'), sp).toBe(false);
      expect(isMoulting(sp, 'winter_cosy'), sp).toBe(false);
      expect(isMoulting(sp), sp).toBe(false);
    }
  });

  it('bats, parrots, snakes and hedgehogs never moult', () => {
    for (const sp of ALL_SPECIES.filter((x) => !MOULTING_SPECIES.includes(x))) {
      expect(isMoulting(sp, 'spring_bloom'), sp).toBe(false);
      expect(isMoulting(sp, 'autumn_hush'), sp).toBe(false);
    }
  });

  it('a moulting passenger dirties the inside by the season, with no conditions passed', () => {
    const g = henryGrid([crate(0, 'a', 'dog')]);
    expect(insideDirtPerKm(g, undefined, 'autumn_hush')).toBe(T.INSIDE_DIRT_PER_KM_MOULTING);
    expect(insideDirtPerKm(g, undefined, 'summer_warmth')).toBe(0);
    expect(insideDirtPerKm(henryGrid([crate(0, 'h', 'hedgehog')]), undefined, 'spring_bloom')).toBe(0);
    const r = applyDrive(freshUpkeep(), drive({ vehicle: 'small-van', level: 4, grid: g, season: 'spring_bloom' }));
    expect(r.upkeep.dirtInside).toBeCloseTo(T.INSIDE_DIRT_PER_KM_MOULTING * DRIVE, 9);
  });

  it('conditions can still override the season (e.g. a scene that knows better)', () => {
    const g = henryGrid([crate(0, 'a', 'dog')]);
    expect(insideDirtPerKm(g, { a: { moulting: false } }, 'spring_bloom')).toBe(0);
    expect(insideDirtPerKm(g, { a: { moulting: true } }, 'summer_warmth')).toBe(T.INSIDE_DIRT_PER_KM_MOULTING);
  });

  it('a tummy ache makes a mess; other illnesses do not', () => {
    const def = (illness: string) => ILLNESSES.find((i) => i.illness === illness)!;
    const sick = new Map([['a', def('tummy_ache')], ['b', def('cold')]]);
    expect(conditionsFromIllnesses(sick)).toEqual({ a: { messy: true } });
    expect(conditionsFromIllnesses({ a: def('tummy_ache') })).toEqual({ a: { messy: true } });
    expect(conditionsFromIllnesses(new Map())).toEqual({});
  });

  it('a tummy ache aboard: sick and messy both feed the inside dirt', () => {
    const g = henryGrid([crate(0, 'a', 'cat', true)]);
    const sick = new Map([['a', ILLNESSES.find((i) => i.illness === 'tummy_ache')!]]);
    const conditions = conditionsFromIllnesses(sick);
    expect(insideDirtPerKm(g, conditions, 'summer_warmth')).toBeCloseTo(T.INSIDE_DIRT_PER_KM_SICK + T.INSIDE_DIRT_PER_KM_MESSY, 9);
    const r = applyDrive(freshUpkeep(), drive({ vehicle: 'small-van', level: 4, grid: g, conditions }, 2 * DRIVE));
    expect(r.events).toContainEqual({ type: 'dirty-inside' });
  });
});

describe('answer 10: the tunables are kept as they were', () => {
  it('the numbers the doc quotes are unchanged', () => {
    expect(fullTankCoins('small-van')).toBe(24);
    expect(T.RANGE_KM['small-van']).toBe(12);
    expect(T.WASH_COINS).toBe(1);
    expect(T.TOW_COINS).toBe(10);
  });
});

describe('persistence', () => {
  it('a fresh fleet: every vehicle full, clean and unworn', () => {
    const f = freshFleetUpkeep();
    expect(Object.keys(f).sort()).toEqual(Object.keys(VEHICLE_DEFS).sort());
    for (const u of Object.values(f)) expect(u).toEqual(freshUpkeep());
  });

  it('a save from before upkeep migrates to the fresh default', () => {
    expect(migrateFleetUpkeep(undefined)).toEqual(freshFleetUpkeep());
    expect(migrateFleetUpkeep(null)).toEqual(freshFleetUpkeep());
    expect(migrateFleetUpkeep([])).toEqual(freshFleetUpkeep());
  });

  it('keeps what it has and fills in only what is missing or broken', () => {
    const f = migrateFleetUpkeep({
      'small-van': { energy: 0.3, wear: 2, dirtOutside: 'x', lowWarned: true },
      'unknown-van': { energy: 0 },
    });
    expect(f['small-van']).toEqual({ ...freshUpkeep(), energy: 0.3, wear: 1, lowWarned: true });
    expect(f['long-van']).toEqual(freshUpkeep());
    expect('unknown-van' in f).toBe(false);
    expect(migrateVanUpkeep({ supplyDamage: 250 }).supplyDamage).toBe(100);
    expect(migrateVanUpkeep({ energy: NaN }).energy).toBe(1);
  });

  it('round-trips through JSON', () => {
    const r = applyDrive(freshUpkeep(), drive({ vehicle: 'small-van', level: 6, kerbs: 1 }, 5, 'track'));
    const back = migrateVanUpkeep(JSON.parse(JSON.stringify(r.upkeep)));
    expect(back).toEqual(r.upkeep);
  });
});

describe('purity', () => {
  it('never mutates its input', () => {
    const u = freshUpkeep();
    const snapshot = JSON.stringify(u);
    applyDrive(u, drive({ vehicle: 'small-van', level: 20, kerbs: 3, weather: 'snow' }, 30, 'track'));
    refuel({ ...u, energy: 0.1 }, 'small-van', 'station-west', 20);
    wash(u, 'small-van', 'station-west', 20);
    service(u, 'small-van', 'workshop', 20, PLENTY);
    cleanByHand(u, 'small-van', 'arc-charger', 20);
    hoover(u, 'small-van', 'station-west', 20);
    valet(u, 'small-van', 'workshop', 20, PLENTY);
    expect(JSON.stringify(u)).toBe(snapshot);
  });
});
