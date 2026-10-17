import { describe, it, expect } from 'vitest';
import { OverlayQueue, mustWait, HOLDING_PAGES } from '../overlay-queue';

describe('OverlayQueue', () => {
  it('is first in, first out', () => {
    const q = new OverlayQueue<string>();
    q.push('arrival', 'a');
    q.push('badge', 'b');
    q.push('visitor', 'c');
    expect(q.pages()).toEqual(['arrival', 'badge', 'visitor']);
    expect(q.shift()?.request).toBe('a');
    expect(q.shift()?.request).toBe('b');
    expect(q.shift()?.request).toBe('c');
    expect(q.shift()).toBeUndefined();
    expect(q.length).toBe(0);
  });

  it('keeps every request, however many, with nothing dropped', () => {
    const q = new OverlayQueue<number>();
    for (let i = 0; i < 500; i++) q.push('arrival', i);
    expect(q.length).toBe(500);
    for (let i = 0; i < 500; i++) expect(q.shift()?.request).toBe(i);
  });

  it('withdraws one that is still waiting, and says so', () => {
    const q = new OverlayQueue<string>();
    const a = q.push('arrival', 'a');
    const b = q.push('badge', 'b');
    expect(q.remove(a.id)).toBe(true);
    expect(q.remove(a.id)).toBe(false);          // already gone
    expect(q.pages()).toEqual(['badge']);
    expect(q.shift()?.id).toBe(b.id);
    expect(q.remove(b.id)).toBe(false);          // already shown
  });

  it('gives each request an id that is not reused', () => {
    const q = new OverlayQueue<string>();
    const a = q.push('x', '1');
    q.shift();
    const b = q.push('x', '2');
    expect(b.id).not.toBe(a.id);
  });

  it('clears everything', () => {
    const q = new OverlayQueue<string>();
    q.push('arrival', 'a');
    q.push('badge', 'b');
    q.clear();
    expect(q.length).toBe(0);
    expect(q.shift()).toBeUndefined();
  });
});

describe('mustWait', () => {
  const ctx = (o: Partial<Parameters<typeof mustWait>[0]>) => ({ active: null, page: 'arrival', queued: 0, chained: false, ...o });

  it('holds the garden tunnel, and only it', () => {
    expect([...HOLDING_PAGES]).toEqual(['tunnel']);
  });

  it('makes an arrival, a badge, a visitor and a vet popup wait while the tunnel is up', () => {
    for (const page of ['arrival', 'badge', 'visitor', 'vet', 'adoption', 'rewilding', 'map']) {
      expect(mustWait(ctx({ active: 'tunnel', page }))).toBe(true);
    }
  });

  it('lets a screen straight in when nothing is up, or when a plaque is (it replaces it, as it always did)', () => {
    expect(mustWait(ctx({ active: null }))).toBe(false);
    expect(mustWait(ctx({ active: 'badge', page: 'arrival' }))).toBe(false);
    expect(mustWait(ctx({ active: 'map', page: 'tunnel' }))).toBe(false);
  });

  it('never makes the tunnel itself wait', () => {
    expect(mustWait(ctx({ active: 'tunnel', page: 'tunnel' }))).toBe(false);
    expect(mustWait(ctx({ active: 'arrival', page: 'tunnel', queued: 2, chained: true }))).toBe(false);
  });

  it('makes a newcomer wait behind requests already waiting, so a run of them keeps its order', () => {
    expect(mustWait(ctx({ active: null, queued: 1 }))).toBe(true);
    expect(mustWait(ctx({ active: 'arrival', queued: 2, chained: true }))).toBe(true);
  });

  it('makes a newcomer wait behind a screen that was itself taken off the waiting list', () => {
    expect(mustWait(ctx({ active: 'arrival', page: 'badge', queued: 0, chained: true }))).toBe(true);
  });
});
