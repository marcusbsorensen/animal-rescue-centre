/**
 * drive-jolts.ts
 *
 * Which of the drive's jolts play, given the player's motion setting.
 *
 * Under reduced motion the world still rotates, because the road bending is
 * the information, but the screen shake, the van's judder and the speed
 * camera's full-screen white flash go: they say nothing the sound and the
 * words on screen do not already say. Marcus, 2026-10-11
 * (docs/driving-port-plan-2026-10-11.md section 5, answer 5).
 *
 * Asked fresh each time, as `isMotionReduced` asks for itself, so a carer
 * turning the setting on mid-drive is honoured by the very next jolt.
 * No Phaser — unit-tested.
 */

import { isMotionReduced } from '../lib/motion-preference';

export interface DriveJolts {
  /** The camera shake when the handbrake is slammed on. */
  shake: boolean;
  /** The van's quick side-to-side wobble with it. */
  judder: boolean;
  /** The speed camera's full-screen white flash. */
  cameraFlash: boolean;
}

export function driveJolts(reduced: boolean = isMotionReduced()): DriveJolts {
  return { shake: !reduced, judder: !reduced, cameraFlash: !reduced };
}
