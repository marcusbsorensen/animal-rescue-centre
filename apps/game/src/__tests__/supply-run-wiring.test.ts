import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * A supply run is the delivery race: nothing alive aboard (driving port plan
 * 2026-10-11, section 5, answer 8).
 *
 * Asserted against the source, as `collection-wiring.test.ts` does and for
 * the same reason: Phaser probes a canvas the moment either scene is
 * imported. The rule itself, `carriesAnimalsFor`, is tested properly in
 * `driving/__tests__/drive-state.test.ts`; this holds the two scenes to it.
 */

const SRC = path.join(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

const GAME_SCENE = read('scenes/GameScene.ts');
const DRIVE_SCENE = read('scenes/PtvDriveScene.ts');

const body = (src: string, start: string) => src.split(start)[1]?.split('\n  }')[0] ?? '';

describe('the supply run', () => {
  it('sets off with no passenger and no cargo', () => {
    const driveTo = body(GAME_SCENE, 'private driveTo(');
    expect(driveTo).toMatch(/const aboard = carriesAnimalsFor\(driveType\)/);
    expect(driveTo).toMatch(/const passenger = aboard && animalId/);
    expect(driveTo).toMatch(/const others = aboard \?/);
    expect(driveTo).toMatch(/returnData: aboard && animalId/);
  });

  it('opens no loading screen in the drive, whatever it is handed', () => {
    const readCargo = body(DRIVE_SCENE, 'private readCargo(');
    expect(readCargo).toMatch(/if \(!this\.drive\.carriesAnimals\) return \[\];/);
  });

  it('is as collision-safe as every other drive', () => {
    const moveLane = body(DRIVE_SCENE, 'private moveLane(');
    expect(moveLane).toMatch(/if \(this\.laneBlockedAt\(next, this\.vanY\)\)/);
    expect(moveLane).not.toMatch(/carriesAnimals/);
  });
});
