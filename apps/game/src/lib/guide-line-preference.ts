/**
 * guide-line-preference — whether the driving game draws the guide line
 * from the van's nose along the route ahead, and the one place anything
 * may ask.
 *
 * **On by default, switched by a parent.** Decided 2026-10-11
 * (`docs/driving-port-plan-2026-10-11.md` section 5, answer 11): a
 * younger child cannot read the road fast enough without the line, and
 * an older one finds it babyish. Neither child should have to find the
 * switch, so it sits beside the motion preference where a parent sets
 * it, and the default is the one that helps the younger child.
 *
 * **Two states, unlike motion.** There is no device setting to follow,
 * so there is no `system`: the line is either drawn or it is not.
 *
 * **Per device, in localStorage**, the same as `motion-preference.ts`
 * and for the same reason: it is about how this screen behaves. Only
 * the departure from the default is written, so a device nobody has
 * touched and a device set back to on are the same state on disk.
 *
 * Nothing here draws anything. The drive reads `isGuideLineOn()` when
 * it builds the line and `onGuideLineChange()` to hide or show one
 * already drawn.
 */

const KEY = 'arc_guide_line';
const OFF = 'off';

const listeners = new Set<(on: boolean) => void>();

/**
 * The fallback when storage refuses — a private window, or an iOS web
 * clip with site data blocked. Lasts the session, as for motion.
 */
let memory: boolean | null = null;

/**
 * **The question the drive asks.** Is the guide line on, right now?
 *
 * Read fresh every time, so a parent switching it mid-session is
 * answered by the very next thing that asks.
 */
export function isGuideLineOn(): boolean {
  try {
    if (localStorage.getItem(KEY) === OFF) return false;
  } catch {
    // Storage refused. Fall through to the session's answer.
  }
  return memory ?? true;
}

/**
 * Record the parent's choice, and tell anything that is listening.
 *
 * On clears the key rather than storing it, so there is nothing to
 * migrate if the default ever changes.
 */
export function setGuideLine(on: boolean): void {
  const before = isGuideLineOn();
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, OFF);
    memory = null;
  } catch {
    memory = on;
  }
  const after = isGuideLineOn();
  if (after !== before) for (const listener of [...listeners]) listener(after);
}

/** Be told when the answer changes. Returns the unsubscribe. */
export function onGuideLineChange(listener: (on: boolean) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Forget everything this module is holding. For tests only. */
export function resetGuideLinePreference(): void {
  memory = null;
  listeners.clear();
}
