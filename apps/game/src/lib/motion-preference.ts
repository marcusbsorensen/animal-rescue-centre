/**
 * motion-preference — whether this player wants animation reduced, and
 * the one place anything in the game may ask.
 *
 * **Seeded from the device, overridable by the player, and settled
 * once.** The operating system already knows whether the person using
 * it has asked for less movement, and iOS, Android, macOS and Windows
 * all report it the same way through
 * `prefers-reduced-motion: reduce`. So that is the default and nobody
 * has to find a switch. The switch exists anyway, because a child
 * playing on a parent's device inherits the parent's answer, and
 * because a system setting is a blunt instrument: it is one answer for
 * a whole machine and this is a game for autistic children, some of
 * whom will want the animals to stop moving on a device nobody has
 * ever opened the accessibility settings on.
 *
 * **Three states, not a boolean.** `system` follows the device and is
 * the default. `reduced` and `full` are the player saying so outright
 * and win over whatever the device reports. A boolean cannot express
 * "my system setting is wrong for me", which is the whole reason the
 * switch is here.
 *
 * **Per device, in localStorage**, which is the same mechanism
 * `intro-state.ts` uses for the skip-intro flag and `main.ts` for the
 * side rail: a preference about how this screen behaves belongs to the
 * screen rather than to the account. The same note applies as there —
 * v2 may move it onto the user record so it follows across devices.
 *
 * Nothing here draws anything. The Phaser side is `ui/tween.ts`, which
 * is what a scene reaches for; this module is what it asks.
 */

export type MotionSetting = 'system' | 'reduced' | 'full';

const KEY = 'arc_motion';
const QUERY = '(prefers-reduced-motion: reduce)';

const SETTINGS: readonly MotionSetting[] = ['system', 'reduced', 'full'];

/**
 * Everybody who wants telling when the answer changes, and the media
 * query listener that is bound only while somebody does.
 *
 * Bound lazily and released when the last subscriber goes, so a module
 * that is imported and never used costs nothing and leaves nothing
 * attached to `window`.
 */
const listeners = new Set<(reduced: boolean) => void>();
let media: MediaQueryList | null = null;
let onMediaChange: (() => void) | null = null;

/** The media query, or null where the browser has no `matchMedia`. */
function mediaQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  try {
    return window.matchMedia(QUERY);
  } catch {
    return null;
  }
}

/** What the device says, right now. False where it cannot be asked. */
export function systemPrefersReduced(): boolean {
  return mediaQuery()?.matches ?? false;
}

/** The player's own choice, or `system` where they have not made one. */
export function getMotionSetting(): MotionSetting {
  try {
    const raw = localStorage.getItem(KEY);
    return SETTINGS.includes(raw as MotionSetting) ? raw as MotionSetting : 'system';
  } catch {
    // Private browsing, or storage refused. Follow the device.
    return 'system';
  }
}

/**
 * Record the player's choice, and tell anything that is listening.
 *
 * `system` clears the key rather than storing the word, so a player
 * who has never chosen and a player who has chosen to follow the
 * device are the same state on disk. There is nothing to migrate if
 * the default ever changes.
 */
export function setMotionSetting(setting: MotionSetting): void {
  const before = isMotionReduced();
  try {
    if (setting === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, setting);
  } catch {
    // Storage refused. The choice still applies to this session,
    // because everything reads through this module.
    memory = setting;
  }
  const after = isMotionReduced();
  if (after !== before) announce(after);
}

/**
 * The fallback when storage refuses — a private window, or an iOS web
 * clip with site data blocked. A choice made in one of those lasts the
 * session and is forgotten, which is better than a switch that does
 * nothing when it is pressed.
 */
let memory: MotionSetting | null = null;

/**
 * **The question everything else asks.** Is motion reduced, right now?
 *
 * Read fresh every time rather than cached, so a carer turning the
 * device setting on mid-session is answered correctly by the very next
 * thing that asks — there is no stale copy to invalidate. The
 * subscription below exists for the animations already running, which
 * cannot ask again by themselves.
 */
export function isMotionReduced(): boolean {
  const setting = stored();
  if (setting === 'reduced') return true;
  if (setting === 'full') return false;
  return systemPrefersReduced();
}

function stored(): MotionSetting {
  const saved = getMotionSetting();
  return saved === 'system' && memory ? memory : saved;
}

function announce(reduced: boolean): void {
  for (const listener of [...listeners]) listener(reduced);
}

/**
 * Be told when the answer changes — because the device setting moved,
 * or because the player did.
 *
 * Returns the unsubscribe. An animation already running cannot ask
 * again on its own, so this is how a looping one is stopped the moment
 * a carer turns the setting on mid-session; `ui/tween.ts` is the one
 * subscriber that matters and every decorative tween in the game goes
 * through it.
 */
export function onMotionChange(listener: (reduced: boolean) => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) bindMedia();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) releaseMedia();
  };
}

function bindMedia(): void {
  media = mediaQuery();
  if (!media) return;
  onMediaChange = () => announce(isMotionReduced());
  // `addEventListener` on a MediaQueryList is Safari 14 and up;
  // `addListener` is the deprecated spelling that older WKWebViews
  // still answer to. The app ships inside a WKWebView, so both.
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', onMediaChange);
  } else if (typeof media.addListener === 'function') {
    media.addListener(onMediaChange);
  }
}

function releaseMedia(): void {
  if (media && onMediaChange) {
    if (typeof media.removeEventListener === 'function') {
      media.removeEventListener('change', onMediaChange);
    } else if (typeof media.removeListener === 'function') {
      media.removeListener(onMediaChange);
    }
  }
  media = null;
  onMediaChange = null;
}

/**
 * Forget everything this module is holding.
 *
 * For tests, and for them only: it drops the session fallback and
 * unbinds the media listener, so one test's `matchMedia` stub cannot
 * answer the next test's question.
 */
export function resetMotionPreference(): void {
  memory = null;
  listeners.clear();
  releaseMedia();
}
