import { describe, it, expect } from 'vitest';
import type Phaser from 'phaser';
import { useRetinaText } from '../retina-text';
import { TEXT_RESOLUTION } from '../constants';

/** Records what the underlying factory was handed. */
function stubScene() {
  const calls: { x: number; y: number; text: unknown; style: Record<string, unknown> }[] = [];
  const scene = {
    add: {
      text(x: number, y: number, text: unknown, style: Record<string, unknown>) {
        calls.push({ x, y, text, style });
        return { style };
      },
    },
  } as unknown as Phaser.Scene;
  return { scene, calls };
}

describe('useRetinaText', () => {
  it('adds the resolution to a style that has none', () => {
    const { scene, calls } = stubScene();
    useRetinaText(scene);
    scene.add.text(10, 20, 'GPS', { fontSize: '15px' });
    expect(calls[0].style.resolution).toBe(TEXT_RESOLUTION);
    expect(calls[0].style.fontSize).toBe('15px');
  });

  it('adds it when there is no style object at all', () => {
    const { scene, calls } = stubScene();
    useRetinaText(scene);
    scene.add.text(0, 0, 'x');
    expect(calls[0].style.resolution).toBe(TEXT_RESOLUTION);
  });

  it('leaves an explicit resolution alone', () => {
    // A scene that deliberately wants something else keeps it — the
    // call's own style is spread after the default.
    const { scene, calls } = stubScene();
    useRetinaText(scene);
    scene.add.text(0, 0, 'x', { resolution: 1 });
    expect(calls[0].style.resolution).toBe(1);
  });

  it('passes position and content through untouched', () => {
    const { scene, calls } = stubScene();
    useRetinaText(scene);
    scene.add.text(42, 7, ['two', 'lines']);
    expect(calls[0].x).toBe(42);
    expect(calls[0].y).toBe(7);
    expect(calls[0].text).toEqual(['two', 'lines']);
  });

  it('is idempotent, so a scene that restarts does not stack wrappers', () => {
    // Phaser restarts a scene on a large resize (see the resize handler in
    // every one of these scenes), and create() runs again on the same
    // GameObjectFactory. Asserting the call still works would not catch a
    // stacked wrapper — the result is the same either way — so this holds
    // the function identity instead.
    const { scene } = stubScene();
    useRetinaText(scene);
    const once = scene.add.text;
    useRetinaText(scene);
    expect(scene.add.text).toBe(once);
  });

  it('still applies the resolution after a second call', () => {
    const { scene, calls } = stubScene();
    useRetinaText(scene);
    useRetinaText(scene);
    scene.add.text(0, 0, 'x', { fontSize: '15px' });
    expect(calls).toHaveLength(1);
    expect(calls[0].style.resolution).toBe(TEXT_RESOLUTION);
  });
});
