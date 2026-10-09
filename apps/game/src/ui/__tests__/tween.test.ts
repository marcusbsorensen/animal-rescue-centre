/**
 * The two tween helpers, and the contract that keeps reduced motion
 * from becoming a second, half-broken rendering path.
 *
 * The test that matters most is the last one: a reduced run and a full
 * run are given identical targets and have to finish identical. The
 * journey differs, the destination does not. Everything else here is
 * about which animations are allowed to be skipped and which are not.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  decorativeTween, forgetDecorativeTweens, stateTween, type MotionTweenConfig,
} from '../tween';
import { resetMotionPreference, setMotionSetting } from '../../lib/motion-preference';

/** A target, as a tween sees one: an object with numbers on it. */
const piece = () => ({ x: 10, y: 20, scaleX: 1, scaleY: 1, alpha: 1 });

/**
 * A scene that runs tweens the way a real one eventually does —
 * straight to the end, callback and all.
 *
 * It is not a simulation of the easing. It is the *outcome* of the
 * easing, which is the only part of a full-motion run that the
 * reduced-motion run has to match.
 */
function fakeScene() {
  const added: MotionTweenConfig[] = [];
  const stopped: MotionTweenConfig[] = [];
  return {
    added,
    stopped,
    tweens: {
      add(config: MotionTweenConfig) {
        added.push(config);
        return { stop: () => { stopped.push(config); } };
      },
    },
    /** Let every tween added so far reach its end. */
    settle() {
      for (const config of added) {
        const targets = Array.isArray(config.targets) ? config.targets : [config.targets];
        for (const [key, value] of Object.entries(config)) {
          if (typeof value !== 'number') continue;
          if (['duration', 'delay', 'repeat', 'hold', 'repeatDelay', 'loopDelay'].includes(key)) {
            continue;
          }
          // A yoyo comes back to where it started, so it leaves
          // nothing behind.
          if (config.yoyo) continue;
          for (const t of targets) (t as Record<string, unknown>)[key] = value;
        }
        config.onComplete?.();
      }
    },
  };
}

beforeEach(() => {
  localStorage.clear();
  resetMotionPreference();
  forgetDecorativeTweens();
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(() => {
  forgetDecorativeTweens();
  resetMotionPreference();
  vi.unstubAllGlobals();
});

describe('with motion at full', () => {
  it('hands a state tween to the scene', () => {
    const scene = fakeScene();
    stateTween(scene, { targets: piece(), x: 99, duration: 110 });
    expect(scene.added).toHaveLength(1);
  });

  it('hands a decorative tween to the scene', () => {
    const scene = fakeScene();
    decorativeTween(scene, { targets: piece(), scaleX: 1.035, duration: 2300, repeat: -1 });
    expect(scene.added).toHaveLength(1);
  });
});

describe('with motion reduced', () => {
  beforeEach(() => setMotionSetting('reduced'));

  it('cuts a state tween to its end rather than dropping it', () => {
    const scene = fakeScene();
    const target = piece();
    stateTween(scene, { targets: target, x: 99, y: 42, duration: 110 });
    expect(scene.added, 'nothing animated').toHaveLength(0);
    expect(target.x, 'but it arrived').toBe(99);
    expect(target.y).toBe(42);
  });

  it('still runs the callback a state tween is carrying', () => {
    // **The failure this prevents is the whole game going dead.**
    // Every button in A.R.C. hangs its action off the press tween's
    // `onComplete`; skipping the animation naively would skip the tap.
    const scene = fakeScene();
    const onComplete = vi.fn();
    stateTween(scene, {
      targets: piece(), scaleX: 0.96, duration: 60, yoyo: true, onComplete,
    });
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('leaves a yoyo where it started, because that is where it ends', () => {
    const scene = fakeScene();
    const target = piece();
    stateTween(scene, {
      targets: target, scaleX: 0.96, scaleY: 0.96, duration: 60, yoyo: true,
    });
    expect(target.scaleX, 'never left shrunk').toBe(1);
    expect(target.scaleY).toBe(1);
  });

  it('does not run a decorative tween at all', () => {
    const scene = fakeScene();
    const target = piece();
    decorativeTween(scene, {
      targets: target, scaleX: 1.035, duration: 2300, yoyo: true, repeat: -1,
    });
    expect(scene.added).toHaveLength(0);
    expect(target.scaleX, 'and leaves the animal at rest').toBe(1);
  });

  it('moves every target a tween was given', () => {
    const scene = fakeScene();
    const a = piece();
    const b = piece();
    stateTween(scene, { targets: [a, b], x: 7, duration: 90 });
    expect([a.x, b.x]).toEqual([7, 7]);
  });

  it('reads a { to } value as well as a bare number', () => {
    const scene = fakeScene();
    const target = piece();
    stateTween(scene, { targets: target, alpha: { from: 0, to: 0.5 }, duration: 90 });
    expect(target.alpha).toBe(0.5);
  });

  it('never mistakes a tween setting for a property of the target', () => {
    const scene = fakeScene();
    const target = piece() as Record<string, unknown>;
    stateTween(scene, {
      targets: target, x: 5, duration: 300, delay: 40, repeat: 2, hold: 10,
    });
    expect(target.x).toBe(5);
    for (const key of ['duration', 'delay', 'repeat', 'hold']) {
      expect(target[key], `${key} is not a property of the piece`).toBeUndefined();
    }
  });
});

describe('when the setting changes mid-session', () => {
  it('stops a running decorative tween and puts its target back', () => {
    // A carer turns reduced motion on while the child is in the game.
    // The breathing animals cannot ask again by themselves, so they
    // are told — and they go back to where they began rather than
    // stopping mid-breath.
    const scene = fakeScene();
    const target = piece();
    decorativeTween(scene, {
      targets: target, scaleX: 1.035, y: 18.5, duration: 2300, yoyo: true, repeat: -1,
    });
    expect(scene.added).toHaveLength(1);
    // Mid-breath, as a real tween would leave it.
    target.scaleX = 1.02;
    target.y = 19;

    setMotionSetting('reduced');

    expect(scene.stopped, 'the tween was stopped').toHaveLength(1);
    expect(target.scaleX, 'and the animal is back at rest').toBe(1);
    expect(target.y).toBe(20);
  });

  it('leaves a running decorative tween alone when motion goes back to full', () => {
    const scene = fakeScene();
    decorativeTween(scene, { targets: piece(), scaleX: 1.035, duration: 2300, repeat: -1 });
    setMotionSetting('full');
    expect(scene.stopped).toHaveLength(0);
  });
});

describe('a reduced run ends where a full run ends', () => {
  /**
   * **The test that stops reduced motion becoming a second rendering
   * path.** Both runs are given an identical target and the same
   * configs — the real ones from the loading screen's drag — and have
   * to finish byte for byte the same. If a future state tween is ever
   * written so that the two disagree, this is what says so.
   */
  const configs = (target: object): MotionTweenConfig[] => [
    // The snap into the space a piece was dropped in.
    {
      targets: target, x: 420, y: 300, scaleX: 1, scaleY: 1, duration: 110, ease: 'Quad.easeOut',
    },
    // The journey home from a drop that landed nowhere.
    {
      targets: target, x: 10, y: 20, scaleX: 1, scaleY: 1, duration: 180, ease: 'Cubic.easeOut',
    },
    // A button acknowledging a press.
    { targets: target, scaleX: 0.96, scaleY: 0.96, duration: 60, yoyo: true },
  ];

  it('for every state tween the loading screen runs', () => {
    const full = piece();
    const fullScene = fakeScene();
    setMotionSetting('full');
    for (const config of configs(full)) stateTween(fullScene, config);
    fullScene.settle();

    const reduced = piece();
    const reducedScene = fakeScene();
    setMotionSetting('reduced');
    for (const config of configs(reduced)) stateTween(reducedScene, config);

    expect(reducedScene.added, 'the reduced run animated nothing').toHaveLength(0);
    expect(fullScene.added, 'the full run animated everything').toHaveLength(3);
    expect(reduced).toEqual(full);
  });

  it('and the callbacks run the same number of times, in the same order', () => {
    const order: string[] = [];
    const run = (): void => {
      const scene = fakeScene();
      const target = piece();
      stateTween(scene, { targets: target, x: 1, duration: 50, onComplete: () => order.push('a') });
      stateTween(scene, { targets: target, x: 2, duration: 50, onComplete: () => order.push('b') });
      scene.settle();
    };
    setMotionSetting('full');
    run();
    const atFull = [...order];
    order.length = 0;
    setMotionSetting('reduced');
    run();
    expect(order).toEqual(atFull);
    expect(order).toEqual(['a', 'b']);
  });
});
