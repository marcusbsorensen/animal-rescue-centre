/**
 * tween — every animation in the game, and the one place reduced
 * motion is honoured.
 *
 * **Reach for these, not for `scene.tweens.add`.** A tween added
 * straight to the scene is a tween that ignores the player's motion
 * setting, and it will do so silently — nothing breaks, nothing warns,
 * and the one child the setting exists for is the only person who
 * finds out. These two functions are the way in.
 *
 * **Two of them, because the author has to say which kind it is.**
 * There is no general `addTween`, deliberately: the decision reduced
 * motion turns on is whether a particular animation *carries
 * information*, and only the person writing it knows.
 *
 *   `stateTween`      — the animation says something happened. A piece
 *                       snapping into the space it was dropped in, a
 *                       button acknowledging a press, a panel sliding
 *                       in with the answer. Under reduced motion it
 *                       still happens: the end state is applied at
 *                       once and `onComplete` still runs, so the
 *                       screen ends up exactly where it would have.
 *                       **Reduced does not mean the feedback goes.**
 *
 *   `decorativeTween` — the animation is pleasant and says nothing. A
 *                       loop, a drift, a breath, an ambient float.
 *                       Under reduced motion it does not run at all,
 *                       and one already running is stopped and put
 *                       back where it started the moment the setting
 *                       changes.
 *
 * **The end state is the same either way, and that is the contract.**
 * A reduced run is not a second rendering path with its own layout and
 * its own bugs; it is the same screen, arrived at without the journey.
 * `__tests__/tween.test.ts` runs both paths against identical targets
 * and insists they finish identical.
 */

import type Phaser from 'phaser';
import { isMotionReduced, onMotionChange } from '../lib/motion-preference';

/**
 * As much of a Phaser scene as a tween needs — so a test can hand in
 * a fake one without a canvas, a renderer or a game loop.
 *
 * A type-only import of Phaser, so nothing here touches the canvas
 * probe that runs the moment the real module is loaded.
 */
export interface FakeTweenHost {
  tweens: {
    add: (config: MotionTweenConfig) => { stop: () => void };
  };
}

export type TweenHost = Phaser.Scene | FakeTweenHost;

/**
 * Hand the config to whichever of the two it is.
 *
 * The one cast in this file. Phaser's `TweenManager.add` is typed
 * against its own builder config, which an object with an index
 * signature is not assignable to however correct it is at run time —
 * and the whole point of `MotionTweenConfig` is that a caller writes
 * the properties flat, as this game always has.
 */
function addTo(scene: TweenHost, config: MotionTweenConfig): { stop: () => void } {
  const manager = scene.tweens as unknown as {
    add: (c: MotionTweenConfig) => { stop: () => void };
  };
  return manager.add(config);
}

/**
 * A tween, as this game writes them: a target or targets, a duration,
 * and the properties to move, flat on the object.
 */
export interface MotionTweenConfig {
  targets: unknown;
  duration?: number;
  yoyo?: boolean;
  repeat?: number;
  onComplete?: () => void;
  [key: string]: unknown;
}

/**
 * The keys of a tween config that are not properties of the target.
 *
 * Everything else on the object is taken to be a property to animate,
 * which is how Phaser reads it too. The list is Phaser's own
 * `TweenBuilderConfig` minus the props; a key missing from here would
 * be set on the target under reduced motion, which is why it is
 * written out rather than guessed at.
 */
const NOT_A_PROPERTY = new Set([
  'targets', 'duration', 'delay', 'ease', 'easeParams', 'hold', 'repeat',
  'repeatDelay', 'yoyo', 'flipX', 'flipY', 'completeDelay', 'loop', 'loopDelay',
  'paused', 'persist', 'interpolation', 'props', 'callbackScope', 'onActive',
  'onComplete', 'onCompleteParams', 'onLoop', 'onLoopParams', 'onPause',
  'onRepeat', 'onRepeatParams', 'onResume', 'onStart', 'onStartParams',
  'onStop', 'onStopParams', 'onUpdate', 'onUpdateParams', 'onYoyo',
  'onYoyoParams',
]);

type Mutable = Record<string, unknown>;

function targetsOf(config: MotionTweenConfig): Mutable[] {
  const raw = config.targets;
  const list = Array.isArray(raw) ? raw : [raw];
  return list.filter((t): t is Mutable => typeof t === 'object' && t !== null);
}

/** The properties a config animates, and the value each ends on. */
function endValues(config: MotionTweenConfig): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  for (const [key, value] of Object.entries(config)) {
    if (NOT_A_PROPERTY.has(key)) continue;
    if (typeof value === 'number') { out.push([key, value]); continue; }
    // `{ from, to }` is the other shape this game writes. Anything
    // else — a function, a string offset, an array — is left alone
    // rather than guessed at, and the tween simply does not move that
    // property under reduced motion.
    if (value && typeof value === 'object' && typeof (value as Mutable).to === 'number') {
      out.push([key, (value as { to: number }).to]);
    }
  }
  return out;
}

/**
 * An animation that says something happened.
 *
 * Under reduced motion the target is put straight into its end state
 * and `onComplete` is called — the same screen, without the journey.
 *
 * **A yoyo ends where it started**, so a reduced yoyo moves nothing at
 * all and only runs the callback. That is what makes a button's press
 * animation safe to route through here: the action hangs off
 * `onComplete`, and the action must happen whether or not the button
 * was seen to flex.
 */
export function stateTween(
  scene: TweenHost,
  config: MotionTweenConfig,
): { stop: () => void } | null {
  if (!isMotionReduced()) return addTo(scene, config);

  if (!config.yoyo) {
    const props = endValues(config);
    for (const target of targetsOf(config)) {
      for (const [key, value] of props) target[key] = value;
    }
  }
  config.onComplete?.();
  return null;
}

/**
 * One decorative tween that is currently running, and what its targets
 * looked like before it started.
 */
interface Decoration {
  tween: { stop: () => void };
  restore: Array<{ target: Mutable; values: Array<[string, unknown]> }>;
}

const running = new Set<Decoration>();
let watching: (() => void) | null = null;

/**
 * Stop every decorative tween and put its targets back.
 *
 * **This is the case the whole subscription exists for**: a carer
 * turning the device setting on while the child is in the game. An
 * animation already running cannot ask again by itself, so it is told.
 * The targets are restored from the values recorded before the tween
 * started rather than from anything Phaser knows, because a yoyo
 * stopped halfway is halfway and the honest resting place is where it
 * began.
 */
function calmEverything(): void {
  for (const decoration of [...running]) {
    decoration.tween.stop();
    for (const { target, values } of decoration.restore) {
      for (const [key, value] of values) target[key] = value;
    }
  }
  running.clear();
}

function watchForReduction(): void {
  if (watching) return;
  watching = onMotionChange((reduced) => { if (reduced) calmEverything(); });
}

/**
 * An animation that is pleasant and says nothing: a loop, a drift, a
 * breath.
 *
 * Under reduced motion it does not run. There is no end state to jump
 * to — a looping yoyo rests where it began — so nothing is applied and
 * nothing is lost.
 */
export function decorativeTween(
  scene: TweenHost,
  config: MotionTweenConfig,
): { stop: () => void } | null {
  if (isMotionReduced()) return null;

  const props = endValues(config).map(([key]) => key);
  const restore = targetsOf(config).map((target) => ({
    target,
    values: props.map((key) => [key, target[key]] as [string, unknown]),
  }));

  const tween = addTo(scene, config);
  const decoration: Decoration = { tween, restore };
  running.add(decoration);
  watchForReduction();
  return tween;
}

/**
 * Forget the decorative tweens this module is holding.
 *
 * For tests, and for the scene teardown that destroys them: a tween
 * whose target has gone is a tween there is no point stopping, and
 * holding the reference keeps a destroyed game object alive.
 */
export function forgetDecorativeTweens(): void {
  running.clear();
  watching?.();
  watching = null;
}
