import { describe, it, expect, afterEach } from 'vitest';
import { driveJolts } from '../drive-jolts';
import { resetMotionPreference, setMotionSetting } from '../../lib/motion-preference';

describe('driveJolts', () => {
  afterEach(() => {
    setMotionSetting('system');
    resetMotionPreference();
  });

  it('plays every jolt with motion in full', () => {
    expect(driveJolts(false)).toEqual({ shake: true, judder: true, cameraFlash: true });
  });

  it('drops the shake, the judder and the camera flash under reduced motion', () => {
    expect(driveJolts(true)).toEqual({ shake: false, judder: false, cameraFlash: false });
  });

  it("asks the player's motion setting when not told", () => {
    setMotionSetting('reduced');
    expect(driveJolts().shake).toBe(false);
    setMotionSetting('full');
    expect(driveJolts().shake).toBe(true);
  });
});
