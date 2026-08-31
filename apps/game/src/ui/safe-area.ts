/**
 * The device's safe-area insets, in CSS pixels.
 *
 * Phaser draws to a canvas and knows nothing about notches, so the game
 * laid its left rail out at x=0 and put it underneath the Dynamic
 * Island. On a landscape iPhone 17 Pro the Island occupies x 14–50pt of
 * an 874x402 screen; the collapsed rail tab is 56pt wide, so roughly six
 * points of it were reachable and the badge a child can see did nothing.
 *
 * The values come from CSS `env(safe-area-inset-*)`, which is the only
 * thing that actually knows. They are read through a probe element
 * because there is no way to ask for them directly.
 *
 * Re-read on resize rather than cached at boot: the app allows both
 * landscape orientations, and the Island swaps edges between them — turn
 * the phone the other way up and the left inset becomes 0 while the
 * right becomes 50.
 */
export interface SafeAreaInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const ZERO: SafeAreaInsets = { left: 0, right: 0, top: 0, bottom: 0 };

let probe: HTMLDivElement | null = null;

function ensureProbe(): HTMLDivElement | null {
  if (typeof document === 'undefined') return null;
  if (probe && probe.isConnected) return probe;
  probe = document.createElement('div');
  // Off-screen and inert: it exists to be measured, never to be seen.
  probe.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'width:0',
    'height:0',
    'visibility:hidden',
    'pointer-events:none',
    'padding-left:env(safe-area-inset-left, 0px)',
    'padding-right:env(safe-area-inset-right, 0px)',
    'padding-top:env(safe-area-inset-top, 0px)',
    'padding-bottom:env(safe-area-inset-bottom, 0px)',
  ].join(';');
  document.body.appendChild(probe);
  return probe;
}

/**
 * Measure the current insets. Returns zeroes where there is no DOM (unit
 * tests) or where the browser does not support `env()` — both of which
 * are correctly "no notch to avoid".
 */
export function readSafeAreaInsets(): SafeAreaInsets {
  const el = ensureProbe();
  if (!el) return ZERO;
  const cs = getComputedStyle(el);
  const px = (v: string): number => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  return {
    left: px(cs.paddingLeft),
    right: px(cs.paddingRight),
    top: px(cs.paddingTop),
    bottom: px(cs.paddingBottom),
  };
}
