import { describe, it, expect } from 'vitest';
import {
  UPKEEP_TUNABLES as T,
  UPKEEP_PLACES,
  applyDrive,
  applyDriveLeg,
  applyRoughEvent,
  canAffordParts,
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
    expect(service(half, 'small-van', 'workshop', 5)).toMatchObject({ refused: 'not-yet', coins: 0, parts: {} });
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
    const r = service(u, 'animal-lorry', 'workshop', 6);
    expect(r.coins).toBe(0);
    expect(Object.keys(r.parts).length).toBeGreaterThan(0);
    for (const code of Object.keys(r.parts)) expect(partCodes.has(code), code).toBe(true);
    const trike = service({ ...freshUpkeep(), puncture: true }, 'pedal-trike', 'workshop', 6);
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
    const r = service(u, 'small-van', 'workshop', 6);
    expect(r.upkeep.wear).toBe(0);
    expect(r.parts).toEqual(T.SERVICE_PARTS);
    expect(rideRoughness(r.upkeep, 'small-van', 6)).toBe(1);
  });

  it('an early service is allowed and costs no parts; a fresh van is nothing to do', () => {
    const early = service({ ...freshUpkeep(), wear: 0.2 }, 'small-van', 'workshop', 6);
    expect(early.refused).toBeUndefined();
    expect(early.parts).toEqual({});
    expect(early.upkeep.wear).toBe(0);
    expect(service(freshUpkeep(), 'small-van', 'workshop', 6).refused).toBe('nothing-to-do');
  });

  it('the service is only at the workshop', () => {
    expect(service({ ...freshUpkeep(), wear: 0.8 }, 'small-van', 'station-west', 6).refused).toBe('not-here');
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
    expect(service(damaged, 'small-van', 'workshop', 6).upkeep.supplyDamage).toBe(0);
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

  it('Trikey does not wear and is not washed', () => {
    const r = applyDrive(freshUpkeep(), drive({ vehicle: 'pedal-trike', level: 20, hardStops: 9, weather: 'snow' }, 20, 'track'));
    expect(r.upkeep.wear).toBe(0);
    expect(r.upkeep.dirtOutside).toBe(0);
    expect(wash(freshUpkeep(), 'pedal-trike', 'station-west', 20).refused).toBe('not-here');
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
          u = service(r.upkeep, 'pedal-trike', 'workshop', 6).upkeep;
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
    const r = service(flat, 'pedal-trike', 'workshop', 6);
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

  it('crossing DIRTY_AT inside is its own event, and the wash does not clean it', () => {
    const u = { ...freshUpkeep(), dirtInside: T.DIRTY_AT - 0.01, dirtOutside: 0.9 };
    const r = applyDrive(u, drive({ vehicle: 'small-van', level: 4, grid: henryGrid([crate(0, 'a', 'cat', true)]) }));
    expect(r.events).toContainEqual({ type: 'dirty-inside' });
    expect(isDirtyInside(r.upkeep, 'small-van', 4)).toBe(true);
    const washed = wash(r.upkeep, 'small-van', 'station-west', 4).upkeep;
    expect(washed.dirtOutside).toBe(0);
    expect(washed.dirtInside).toBe(r.upkeep.dirtInside);
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
    service(u, 'small-van', 'workshop', 20);
    expect(JSON.stringify(u)).toBe(snapshot);
  });
});
