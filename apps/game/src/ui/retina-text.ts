import type Phaser from 'phaser';
import { TEXT_RESOLUTION } from './constants';

/** Marks a factory we have already wrapped. */
const WRAPPED = Symbol.for('arc.retinaText');

/**
 * Make every `scene.add.text` in this scene render at device resolution.
 *
 * Phaser draws text into an offscreen canvas at `style.resolution`, which
 * defaults to 1. On a retina screen that canvas is then scaled up, so the
 * text is visibly soft next to everything else the GPU draws. The fix is
 * one property, and the project has a constant for it — but it has to be
 * on *every* text style, and it is not: `PtvDriveScene` had 30 `add.text`
 * calls and set it on none of them, and `SupplyRunScene` 19 and none — it
 * imported the constant and never used it, which is what the unused-import
 * warning on that file had been saying all along. The UX harness scores
 * this as F10 and had it failing on four scenes.
 *
 * Setting it once per scene rather than 49 more times is not only less
 * typing. A list of call sites that each have to remember a property is a
 * list that grows a fiftieth entry the next time someone adds a label,
 * and nothing catches it until a screenshot looks wrong. This cannot be
 * forgotten, because there is nothing to remember.
 *
 * An explicit `resolution` in a call's own style still wins — the style
 * is spread *after* the default — so a scene that deliberately wants
 * something else keeps it.
 *
 * Scoped to the one scene: `scene.add` is a per-scene GameObjectFactory,
 * so this touches nothing else. Call it in `create()`, before anything
 * draws.
 */
export function useRetinaText(scene: Phaser.Scene): void {
  const add = scene.add as unknown as Record<PropertyKey, unknown>;
  // Phaser restarts a scene on a large resize — every one of these scenes
  // does it in its own resize handler — and `create()` runs again on the
  // same GameObjectFactory. Without this, each restart wraps the wrapper
  // and a long session accumulates a closure chain that does the same
  // thing N times.
  if (add[WRAPPED]) return;

  const factory = scene.add.text.bind(scene.add);
  scene.add.text = ((
    x: number,
    y: number,
    text: string | string[],
    style?: Phaser.Types.GameObjects.Text.TextStyle,
  ) => factory(x, y, text, { resolution: TEXT_RESOLUTION, ...style })) as typeof scene.add.text;
  add[WRAPPED] = true;
}
