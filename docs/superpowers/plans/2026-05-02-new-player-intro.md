# A.R.C. New-Player Intro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 4-panel painted walk-in intro that plays between PLAY and the existing first-arrival overlay, composited from existing assets, with persistent skip + audio toggles.

**Architecture:** New `intro.html` iframe page mounted by a new tiny `IntroScene` Phaser scene. `MainMenuScene.startGame()` is rerouted to start `IntroScene` instead of `GameScene`. `GameScene` accepts optional `{ preSelectedSpecies, preSelectedVariant }` init params so the species shown on panel 4 matches the species GameScene will then spawn.

**Tech Stack:** Phaser 3 (existing), HTML/CSS in admin/ iframe pages (existing pattern), `AuthOverlay.ts` for iframe-mount + postMessage handshake (existing), localStorage for skip-flag persistence, `AudioManager` (existing) for sound toggle.

**Spec:** [`docs/superpowers/specs/2026-05-02-new-player-intro-design.md`](../specs/2026-05-02-new-player-intro-design.md)

---

## File Structure

### Create

| Path | Responsibility |
|---|---|
| `apps/game/public/admin/intro.html` | The 4-panel walk-in iframe page. Self-contained: all 4 panels, crossfade + zoom-drift CSS, auto-advance for panels 1-3, tap-wait for panel 4, corner controls (speaker + skip-future), postMessage bridge to host scene. |
| `apps/game/src/scenes/IntroScene.ts` | Tiny Phaser scene that mounts intro.html via AuthOverlay, pre-picks the first animal, listens for `intro-complete` postMessage, then starts GameScene with the pre-pick passed via init params. |
| `apps/game/src/lib/intro-state.ts` | Tiny pure module with `getSkipIntro()`, `setSkipIntro(value)`, `hasPlayedBefore()`, `markPlayed()`. Wraps localStorage with safe defaults. Pure for testability. |
| `apps/game/src/lib/__tests__/intro-state.test.ts` | Unit tests for the localStorage helpers. |

### Modify

| Path | What changes |
|---|---|
| `apps/game/src/auth-overlay/AuthOverlay.ts` | Add `'intro'` to `AuthPage` union + `intro: '/admin/intro.html?embed=1'` to `PAGE_URLS`. Add `'intro-complete'` and `'set-skip-intro'` to the AuthAction union. Forward those messages in the listener. |
| `apps/game/src/scenes/MainMenuScene.ts` | `startGame()` starts `IntroScene` instead of `GameScene`/`LoadingScene`. The asset-loading-gate logic moves into IntroScene (since IntroScene also needs to know when essentials are ready before passing to GameScene). |
| `apps/game/src/scenes/GameScene.ts` | New `init(data)` method accepts optional `{ preSelectedSpecies, preSelectedVariant }`. `spawnNewAnimal()` accepts an optional override and uses it instead of `pickRandomSpecies` for the first call. After the override is consumed, it goes back to random. |
| `apps/game/src/main.ts` | Register `IntroScene` in the scene array, between `MainMenuScene` and `GameScene`. |
| `packages/game-logic/src/animals.ts` | Export `spawnAnimal` is already public; nothing to change unless we need a `pickFirstSpecies()` helper — verify in Task 5. |

---

## Sequencing

Tasks build on each other but each ends with a working commit. After Task 4 the intro is mountable but uses placeholders. After Task 5 it's wired into the live game flow with stub panels. After Task 8 it's visually finished. After Task 9 it's verified live on Vercel.

---

### Task 1 — localStorage helpers (TDD)

The skip-flag and "has played before" logic is small, pure, and easy to get wrong (forgetting JSON parse, defaults, exception swallowing). Test-driven so we lock the semantics first.

**Files:**
- Create: `apps/game/src/lib/intro-state.ts`
- Create: `apps/game/src/lib/__tests__/intro-state.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/game/src/lib/__tests__/intro-state.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getSkipIntro, setSkipIntro, hasPlayedBefore, markPlayed } from '../intro-state';

describe('intro-state', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('getSkipIntro returns false by default', () => {
    expect(getSkipIntro()).toBe(false);
  });

  it('setSkipIntro(true) then getSkipIntro returns true', () => {
    setSkipIntro(true);
    expect(getSkipIntro()).toBe(true);
  });

  it('setSkipIntro(false) then getSkipIntro returns false', () => {
    setSkipIntro(true);
    setSkipIntro(false);
    expect(getSkipIntro()).toBe(false);
  });

  it('getSkipIntro tolerates corrupted localStorage and returns false', () => {
    localStorage.setItem('arc_skip_intro', 'not-a-bool');
    expect(getSkipIntro()).toBe(false);
  });

  it('hasPlayedBefore returns false on a fresh account', () => {
    expect(hasPlayedBefore()).toBe(false);
  });

  it('markPlayed then hasPlayedBefore returns true', () => {
    markPlayed();
    expect(hasPlayedBefore()).toBe(true);
  });

  it('markPlayed is idempotent', () => {
    markPlayed();
    markPlayed();
    expect(hasPlayedBefore()).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/game && pnpm vitest run src/lib/__tests__/intro-state.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the minimal implementation**

```ts
// apps/game/src/lib/intro-state.ts
/**
 * intro-state — localStorage wrappers for the new-player intro flags.
 *
 * Two flags:
 *   - arc_skip_intro     : 'true' | 'false'  — kid's skip-walk-in preference
 *   - arc_intro_played   : '1'               — set after the first ever play,
 *                                              used to default-mute brand-new
 *                                              accounts on their very first walk
 *
 * Both flags are per-device (localStorage). v2 may migrate to a Supabase
 * column on the user record so the prefs follow across devices.
 */

const SKIP_KEY = 'arc_skip_intro';
const PLAYED_KEY = 'arc_intro_played';

export function getSkipIntro(): boolean {
  try {
    return localStorage.getItem(SKIP_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setSkipIntro(value: boolean): void {
  try {
    localStorage.setItem(SKIP_KEY, value ? 'true' : 'false');
  } catch {
    // localStorage unavailable (e.g. private mode) — silent no-op.
  }
}

export function hasPlayedBefore(): boolean {
  try {
    return localStorage.getItem(PLAYED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markPlayed(): void {
  try {
    localStorage.setItem(PLAYED_KEY, '1');
  } catch {
    // silent
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/game && pnpm vitest run src/lib/__tests__/intro-state.test.ts`
Expected: PASS — 7 tests passing.

- [ ] **Step 5: Commit**

```bash
git add apps/game/src/lib/intro-state.ts apps/game/src/lib/__tests__/intro-state.test.ts
git commit -m "feat(intro): localStorage helpers for skip + has-played flags"
```

---

### Task 2 — Extend AuthOverlay to support the intro page

`AuthOverlay` already handles the iframe-mount + postMessage plumbing for welcome/login/signup/menu/friends/forgot-pin. Add `'intro'` as another supported page so we can reuse the infra rather than building a new mount-system.

**Files:**
- Modify: `apps/game/src/auth-overlay/AuthOverlay.ts`

- [ ] **Step 1: Add `'intro'` to the AuthPage union and PAGE_URLS map**

In `apps/game/src/auth-overlay/AuthOverlay.ts`, find the `AuthPage` type (around line 42) and the `PAGE_URLS` constant (around line 44). Add the new entry:

```ts
export type AuthPage = 'welcome' | 'login' | 'signup' | 'welcome-new' | 'menu' | 'friends' | 'forgot-pin' | 'intro';

const PAGE_URLS: Record<AuthPage, string> = {
  welcome:      '/admin/welcome.html?embed=1',
  login:        '/admin/login.html?embed=1',
  signup:       '/admin/signup.html?embed=1',
  'welcome-new': '/admin/welcome-new.html?embed=1',
  menu:         '/admin/menu.html?embed=1',
  friends:      '/admin/friends.html?embed=1',
  'forgot-pin': '/admin/forgot-pin.html?embed=1',
  intro:        '/admin/intro.html?embed=1',
};
```

- [ ] **Step 2: Add the new AuthAction values + forwarding**

Find the `AuthAction` union (around line 18) and add the two new actions:

```ts
export type AuthAction =
  | 'play'
  | 'login'
  | 'signup'
  | 'friends'
  | 'logout'
  | 'back-to-menu'
  | 'back-to-welcome'
  | 'type-name'
  | 'forgot-pin'
  | 'recruit-apprentice'
  | 'auth-success-existing'
  | 'auth-success-new'
  | 'intro-complete'      // panel 4 tapped — IntroScene starts GameScene
  | 'set-skip-intro';     // skip-future toggle changed — IntroScene writes to localStorage
```

In the message listener (around line 126-133, where navigation-style actions are passed through to the host), extend the condition to include the two new actions:

```ts
    if (msg.type === 'play' || msg.type === 'login' ||
        msg.type === 'signup' || msg.type === 'back-to-welcome' ||
        msg.type === 'friends' || msg.type === 'logout' ||
        msg.type === 'back-to-menu' ||
        msg.type === 'type-name' || msg.type === 'forgot-pin' ||
        msg.type === 'intro-complete' || msg.type === 'set-skip-intro') {
      handlers.onAction(msg.type as AuthAction, undefined, msg.payload);
      return;
    }
```

- [ ] **Step 3: Verify the file compiles**

Run: `cd apps/game && pnpm tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/game/src/auth-overlay/AuthOverlay.ts
git commit -m "feat(intro): AuthOverlay supports 'intro' page + new actions"
```

---

### Task 3 — Create IntroScene

A small Phaser scene that mounts the intro iframe, pre-picks the first animal, handles the skip + audio postMessages, and routes to GameScene on completion.

**Files:**
- Create: `apps/game/src/scenes/IntroScene.ts`

- [ ] **Step 1: Create the scene file**

```ts
// apps/game/src/scenes/IntroScene.ts
import Phaser from 'phaser';
import { mountAuth, unmountAuth } from '../auth-overlay/AuthOverlay';
import { AssetLoader } from '../lib/AssetLoader';
import { AudioManager } from '../audio/AudioManager';
import { getSkipIntro, setSkipIntro, hasPlayedBefore, markPlayed } from '../lib/intro-state';
import {
  getSpeciesUnlocksForLevel,
  pickRandomSpecies,
  spawnAnimal,
  type Species,
} from '@arc/game-logic';
import { GameStateStore, loadGameState } from '../game-state';

/**
 * IntroScene — sits between MainMenuScene and GameScene.
 *
 * Mounts /admin/intro.html as an iframe overlay. When the kid taps
 * the door open on panel 4, postMessage 'intro-complete' fires and
 * we start GameScene with the pre-picked species so panel 4's reveal
 * sprite matches what GameScene will then spawn for first arrival.
 *
 * Brand-new-account silent override: on the very first ever play
 * (hasPlayedBefore() === false), we force AudioManager to muted
 * before mounting so panel 4's SFX can't surprise the kid. The
 * intro iframe still respects the normal speaker-toggle pattern;
 * once the kid taps anything, the override is lifted (markPlayed()).
 */
export class IntroScene extends Phaser.Scene {
  constructor() {
    super({ key: 'IntroScene' });
  }

  create(): void {
    // Brand-new-account silent override.
    const wasPlayedBefore = hasPlayedBefore();
    if (!wasPlayedBefore && AudioManager.getInstance().isMusicOn()) {
      AudioManager.getInstance().toggleMusic();
    }

    // Pre-pick the species the kid will see in panel 4 + receive in GameScene.
    const { species, variant, spriteSrc } = this.preSelectFirstAnimal();

    const skipIntro = getSkipIntro();
    const musicOn = AudioManager.getInstance().isMusicOn();

    const unmount = mountAuth('intro', {
      onAction: (action, _session, payload) => {
        if (action === 'set-skip-intro') {
          const v = (payload as { value?: boolean } | undefined)?.value;
          if (typeof v === 'boolean') setSkipIntro(v);
          return;
        }
        if (action === 'intro-complete') {
          markPlayed();
          unmount();
          this.startGameWithPreselect(species, variant);
          return;
        }
        // Music toggle is handled by AuthOverlay directly via AudioManager.
      },
    }, {
      // Init payload sent to the iframe on its load event:
      //   skipIntro:           render only panel 4
      //   speciesForArrival:   species name for kid-readable text if any
      //   arrivingSpriteSrc:   path to sprite for panel 4
      //   musicOn:             current audio state for the speaker icon
      reason: undefined,  // unused for intro page
      // Stash the intro-specific payload via the existing context shape.
      // We add a new optional field; the iframe reads whichever it knows.
      stats: undefined,
      session: undefined,
      recruited: undefined,
      // Custom intro fields:
      ...({ skipIntro, speciesForArrival: species, arrivingSpriteSrc: spriteSrc, musicOn } as Record<string, unknown>),
    });

    this.events.once('shutdown', unmountAuth);
    this.events.once('destroy', unmountAuth);

    // Safety net — if intro iframe fails to load and never posts 'intro-complete',
    // fall through to GameScene after 30s so the kid is never stuck.
    this.time.delayedCall(30_000, () => {
      if (this.scene.isActive('IntroScene')) {
        unmount();
        this.startGameWithPreselect(species, variant);
      }
    });
  }

  /**
   * Pick the species + variant that GameScene will spawn first, BEFORE
   * mounting the intro iframe. This way panel 4's reveal sprite matches
   * the actual first animal the kid will then welcome in the arrival
   * overlay.
   *
   * Mirrors the logic in GameScene.spawnNewAnimal() at the level/apprentice-
   * unlock check, but without committing to the spawn here — GameScene
   * does the commit using the params we pass via init.
   */
  private preSelectFirstAnimal(): { species: Species; variant?: string; spriteSrc: string } {
    const stored = loadGameState();
    const store = stored ?? GameStateStore.empty();
    const unlocked = getSpeciesUnlocksForLevel(
      store.level,
      store.apprenticeUnlocks?.extraSpeciesSlots ?? 0,
    );
    const species = pickRandomSpecies(unlocked);
    // We use spawnAnimal to get a real variant for the sprite path. We
    // then THROW AWAY the result — GameScene re-spawns when it boots.
    // This is wasteful by a few CPU cycles, but keeps the species/variant
    // pre-pick logic in one place.
    const sample = spawnAnimal(species, undefined, []);
    const spriteSrc = `/assets/animals/${species}-${sample.variant}-arriving.png`;
    return { species, variant: sample.variant, spriteSrc };
  }

  private startGameWithPreselect(species: Species, variant?: string): void {
    const loader = AssetLoader.getInstance();
    const next = loader.isFullyLoaded ? 'GameScene' : 'LoadingScene';
    this.scene.start(next, { preSelectedSpecies: species, preSelectedVariant: variant });
  }
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd apps/game && pnpm tsc --noEmit -p tsconfig.json`
Expected: TypeScript may complain about the `mountAuth` context shape. If so, the call-site uses an object cast — update to keep the existing `MountAuthContext` happy. Check `mountAuth`'s signature; if context type is too strict, extend `MountAuthContext` in `AuthOverlay.ts` to optionally include the new intro fields.

If errors, update `MountAuthContext` in `AuthOverlay.ts`:

```ts
// In AuthOverlay.ts, find the mountAuth context parameter type and add:
context?: {
  name?: string;
  session?: AuthSession;
  stats?: MenuStats;
  recruited?: string[];
  reason?: string;
  // Intro-specific fields:
  skipIntro?: boolean;
  speciesForArrival?: string;
  arrivingSpriteSrc?: string;
  musicOn?: boolean;
}
```

Also add the matching init-payload branch in `mountAuth`'s `frame.addEventListener('load', ...)` so the intro iframe receives them:

```ts
    if (page === 'intro' && context) {
      postToFrame('init', {
        skipIntro: context.skipIntro ?? false,
        speciesForArrival: context.speciesForArrival,
        arrivingSpriteSrc: context.arrivingSpriteSrc,
        musicOn: context.musicOn ?? AudioManager.getInstance().isMusicOn(),
      });
    }
```

Re-run `pnpm tsc --noEmit` until clean.

- [ ] **Step 3: Commit**

```bash
git add apps/game/src/scenes/IntroScene.ts apps/game/src/auth-overlay/AuthOverlay.ts
git commit -m "feat(intro): IntroScene mounts intro iframe + pre-picks first species"
```

---

### Task 4 — Wire MainMenuScene + GameScene + main.ts

Reroute the PLAY action through IntroScene; teach GameScene to accept the pre-picked species; register the scene.

**Files:**
- Modify: `apps/game/src/main.ts`
- Modify: `apps/game/src/scenes/MainMenuScene.ts`
- Modify: `apps/game/src/scenes/GameScene.ts`

- [ ] **Step 1: Register IntroScene**

In `apps/game/src/main.ts`, add the import and slot it into the scene array between `MainMenuScene` and `GameScene`:

```ts
// At the top with other imports
import { IntroScene } from './scenes/IntroScene';

// In the Phaser config (find `scene: [...]` around line 44)
scene: [BootScene, LoadingScene, MainMenuScene, SignupScene, LoginScene, ForgotPinScene, FriendsScene, IntroScene, GameScene, KitchenMinigameScene, SocialScene, WalkScene, VetScene, GroomingScene, PlayScene, DepotScene, SupplyRunScene, AccountScene],
```

- [ ] **Step 2: Reroute MainMenuScene.startGame to IntroScene**

In `apps/game/src/scenes/MainMenuScene.ts`, find `startGame()` (around line 128). Replace it:

```ts
  /**
   * Route to game — fade out, then go to IntroScene which plays the
   * 4-panel walk-in (or only panel 4 if skip is on) before passing
   * to GameScene/LoadingScene.
   */
  private startGame(): void {
    this.tweens.add({
      targets: this.cameras.main,
      alpha: 0,
      duration: 300,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.scene.start('IntroScene');
      },
    });
  }
```

The asset-loading gate moves into IntroScene (which already routes to GameScene OR LoadingScene based on `loader.isFullyLoaded` in Task 3's `startGameWithPreselect`).

- [ ] **Step 3: GameScene accepts preSelected init params**

In `apps/game/src/scenes/GameScene.ts`, find the GameScene class declaration. Add an `init()` method (above `create()`):

```ts
  private preSelectedSpecies: Species | null = null;
  private preSelectedVariant: string | undefined = undefined;

  init(data?: { preSelectedSpecies?: Species; preSelectedVariant?: string }): void {
    this.preSelectedSpecies = data?.preSelectedSpecies ?? null;
    this.preSelectedVariant = data?.preSelectedVariant;
  }
```

(Add `import type { Species }` to the existing `@arc/game-logic` imports if not already present.)

Then in `spawnNewAnimal()` (around line 298), use the pre-pick on the FIRST call only and clear it after:

```ts
  private spawnNewAnimal(): void {
    const sheltered = this.store.animals.filter((a) => a.state === 'sheltered' || a.state === 'bonding').length;
    const maxShelter = getMaxShelterAnimals(this.store.level);
    if (sheltered >= maxShelter) return;

    const arriving = this.store.animals.filter((a) => a.state === 'arriving');
    const maxArrivals = getMaxArrivals(this.store.level);
    if (arriving.length >= maxArrivals) return;

    // If IntroScene pre-picked a species, use it for THIS spawn and clear
    // so subsequent spawns go back to random selection.
    let species: Species;
    if (this.preSelectedSpecies !== null) {
      species = this.preSelectedSpecies;
      this.preSelectedSpecies = null;
    } else {
      const unlockedWithApprentice = getSpeciesUnlocksForLevel(
        this.store.level,
        this.store.apprenticeUnlocks.extraSpeciesSlots,
      );
      const arrivingSpecies = new Set(arriving.map((a) => a.species));
      const availableSpecies = unlockedWithApprentice.filter((s) => !arrivingSpecies.has(s));
      if (availableSpecies.length === 0) return;
      species = pickRandomSpecies(availableSpecies);
    }

    // (rest of the method unchanged — sibling-pair check, spawnAnimal call, push, save, etc.)
    let firstNew: Animal;
    if (shouldSpawnSiblings() && sheltered + 2 <= maxShelter) {
      const [a, b] = spawnSiblingPair(species);
      this.store.animals.push(a, b);
      firstNew = a;
    } else {
      const animal = spawnAnimal(species, this.preSelectedVariant ?? undefined, this.store.animals.map(a => a.name));
      this.preSelectedVariant = undefined;
      this.store.animals.push(animal);
      firstNew = animal;
    }

    this.saveState();
    if (this.viewMode === 'corridor') this.renderView();
    this.renderHUD();
    this.openArrivalOverlay(firstNew);
  }
```

- [ ] **Step 4: Verify it compiles**

Run: `cd apps/game && pnpm tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/game/src/main.ts apps/game/src/scenes/MainMenuScene.ts apps/game/src/scenes/GameScene.ts
git commit -m "feat(intro): wire IntroScene between MainMenu + Game with preselect"
```

---

### Task 5 — intro.html shell with placeholder panels (just the structure + handshake)

Build the HTML file as a smoke-test structure with placeholder text panels. Confirms the iframe mounts, postMessage handshake works, panel-advance + tap-to-finish wiring all work end-to-end. We add the painted compositing in Task 6 once the plumbing is verified.

**Files:**
- Create: `apps/game/public/admin/intro.html`

- [ ] **Step 1: Write the HTML skeleton**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>A.R.C. — Welcome</title>
<script>
  // Iframe-context detection — flips html.iframed before first paint
  // so design-preview chrome (vp-bar) is hidden when this page is
  // mounted in-game. Same pattern as arrival.html, etc.
  if (window.top !== window.self) document.documentElement.classList.add('iframed');
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;700&family=Quicksand:wght@500;600&family=Kalam:wght@700&display=swap" rel="stylesheet">
<style>
  :root {
    --cream-wash: #fef9ef;
    --honey-amber: #e3b04b;
    --honey-shadow: #b88a37;
    --ink: #3a3a3a;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    font-family: 'Quicksand', system-ui, sans-serif;
    color: var(--ink);
    background: var(--cream-wash);
    overflow: hidden;
    display: flex; flex-direction: column;
    height: 100vh;
    user-select: none;
  }
  /* Belt-and-braces — when iframed, hide any preview chrome */
  html.iframed body { background: var(--cream-wash) !important; }

  .stage {
    flex: 1; position: relative;
    cursor: pointer;
    overflow: hidden;
  }
  .panel {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    opacity: 0;
    transition: opacity 400ms ease;
    pointer-events: none;
  }
  .panel.active {
    opacity: 1;
    pointer-events: auto;
  }
  .panel-text {
    font-family: 'Fredoka', sans-serif;
    font-size: clamp(24px, 4vw, 36px);
    font-weight: 700;
    color: var(--ink);
    text-align: center;
    padding: 24px;
  }

  .corner {
    position: absolute;
    top: 14px; right: 14px;
    display: flex; flex-direction: column; gap: 8px;
    z-index: 10;
  }
  .corner-btn {
    background: rgba(255, 255, 255, 0.85);
    border: 2px solid var(--honey-shadow);
    border-radius: 50%;
    width: 44px; height: 44px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    font-size: 18px;
    box-shadow: 1px 2px 3px rgba(0,0,0,0.15);
  }
  .corner-btn.active {
    background: var(--honey-amber);
  }
  .skip-row {
    display: flex; align-items: center; gap: 6px;
    background: rgba(255, 255, 255, 0.85);
    border: 2px solid var(--honey-shadow);
    border-radius: 22px;
    padding: 4px 10px;
    cursor: pointer;
    font-family: 'Kalam', cursive;
    font-weight: 700;
    font-size: 13px;
    color: var(--ink);
  }
  .skip-row input { cursor: pointer; }
</style>
</head>
<body>

<div class="stage" id="stage">
  <div class="panel" id="panel-1"><div class="panel-text">Panel 1 — Gate</div></div>
  <div class="panel" id="panel-2"><div class="panel-text">Panel 2 — Garden path</div></div>
  <div class="panel" id="panel-3"><div class="panel-text">Panel 3 — Door close-up</div></div>
  <div class="panel" id="panel-4"><div class="panel-text">Panel 4 — Tap to open the door</div></div>

  <div class="corner">
    <button class="corner-btn active" id="speaker-btn" aria-label="Toggle sound">🔊</button>
    <label class="skip-row">
      <input type="checkbox" id="skip-checkbox">
      <span>Skip next time</span>
    </label>
  </div>
</div>

<script>
  (function () {
    const stage = document.getElementById('stage');
    const panels = [
      document.getElementById('panel-1'),
      document.getElementById('panel-2'),
      document.getElementById('panel-3'),
      document.getElementById('panel-4'),
    ];
    const speakerBtn = document.getElementById('speaker-btn');
    const skipCheckbox = document.getElementById('skip-checkbox');

    let current = 0;
    let autoTimer = null;
    let skipIntro = false;
    let musicOn = true;
    let species = 'cat';

    function send(type, payload) {
      try { parent.postMessage({ source: 'arc-auth', type, payload }, '*'); } catch (_) {}
    }

    function showPanel(idx) {
      panels.forEach((p, i) => p.classList.toggle('active', i === idx));
      current = idx;
      clearTimeout(autoTimer);
      // Auto-advance for panels 0..2 (i.e. 1..3); panel 3 (the 4th) waits for tap.
      if (idx < 3) {
        autoTimer = setTimeout(() => showPanel(idx + 1), 2500);
      }
    }

    function start() {
      if (skipIntro) {
        showPanel(3);
      } else {
        showPanel(0);
      }
    }

    // Tap on panel body advances early (or completes on panel 4)
    stage.addEventListener('click', (e) => {
      // Ignore taps on corner controls
      if (e.target.closest('.corner')) return;
      if (current === 3) {
        send('intro-complete');
        return;
      }
      if (current < 3) {
        showPanel(current + 1);
      }
    });

    // Speaker toggle
    speakerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      send('toggle-music');
    });

    // Skip-future toggle
    skipCheckbox.addEventListener('change', (e) => {
      e.stopPropagation();
      send('set-skip-intro', { value: skipCheckbox.checked });
    });

    // Receive init payload + music-state updates from parent
    window.addEventListener('message', (e) => {
      const m = e.data;
      if (m && m.source === 'arc-auth-host') {
        if (m.type === 'init' && m.payload) {
          skipIntro = !!m.payload.skipIntro;
          musicOn = !!m.payload.musicOn;
          species = m.payload.speciesForArrival || 'cat';
          skipCheckbox.checked = skipIntro;
          speakerBtn.textContent = musicOn ? '🔊' : '🔇';
          speakerBtn.classList.toggle('active', musicOn);
          start();
        }
        if (m.type === 'music-state' && m.payload) {
          musicOn = !!m.payload.enabled;
          speakerBtn.textContent = musicOn ? '🔊' : '🔇';
          speakerBtn.classList.toggle('active', musicOn);
        }
      }
    });

    // Standalone preview (no parent) — start immediately for design review
    if (window.top === window.self) {
      start();
    }
  })();
</script>

</body>
</html>
```

- [ ] **Step 2: Smoke-test in the dev server**

Run: `cd apps/game && pnpm dev` (in another terminal if not already running)

Open: `http://localhost:5173/admin/intro.html`
Expected: Panel 1 placeholder text shows; auto-advances every 2.5s through panels 1→2→3→4; panel 4 stays. Speaker icon toggles 🔊/🔇 visually. Skip checkbox toggles. Tap on panel body advances; tap on panel 4 sends a postMessage (visible in browser devtools console if standalone).

- [ ] **Step 3: Smoke-test the in-game flow**

Open: `http://localhost:5173/` (the live game). Sign up a fresh test account or log in as an existing one. Click PLAY.

Expected: Panel 1 placeholder shows in full-screen, auto-advances through 2/3/4, panel 4 waits for tap. Tapping panel 4 closes the iframe and GameScene starts (you'll see the existing arrival overlay open as today).

- [ ] **Step 4: Commit**

```bash
git add apps/game/public/admin/intro.html
git commit -m "feat(intro): intro.html shell with placeholder panels + handshake"
```

---

### Task 6 — Composite the painted assets into the 4 panels

Replace the placeholder text panels with the actual painted composites per the spec's consistency map.

**Files:**
- Modify: `apps/game/public/admin/intro.html`

- [ ] **Step 1: Replace the panel markup with painted composites**

Find the four `<div class="panel">` blocks and replace with:

```html
  <!-- Panel 1: Gate. Painted welcome-bg sky + gate prop in foreground +
       arc-main-building shrunk in the distance. -->
  <div class="panel panel-bg" id="panel-1" style="background-image: url('/assets/bg/garden-lawn-summer-morning.png');">
    <img class="building-distant" src="/admin/scene-assets/reference/arc-site-tier1-2026-04-29/arc-main-building.png" alt="">
    <img class="tree-side tree-left" src="/admin/scene-assets/reference/arc-site-tier1-2026-04-29/arc-tree-oak.png" alt="">
    <img class="tree-side tree-right" src="/admin/scene-assets/reference/arc-site-tier1-2026-04-29/arc-tree-ash.png" alt="">
    <div class="gate-overlay" aria-hidden="true"></div>
  </div>

  <!-- Panel 2: Garden path. Building larger, gravel path receding,
       trees shifted to the edges. -->
  <div class="panel panel-bg" id="panel-2" style="background-image: url('/assets/bg/garden-lawn-summer-morning.png');">
    <div class="path-overlay" aria-hidden="true"></div>
    <img class="building-mid" src="/admin/scene-assets/reference/arc-site-tier1-2026-04-29/arc-main-building.png" alt="">
    <img class="tree-edge tree-left" src="/admin/scene-assets/reference/arc-site-tier1-2026-04-29/arc-tree-oak.png" alt="">
    <img class="tree-edge tree-right" src="/admin/scene-assets/reference/arc-site-tier1-2026-04-29/arc-tree-horse-chestnut.png" alt="">
  </div>

  <!-- Panel 3: Door close-up. Building filling the canvas, cropped to
       the entrance via CSS clip-path. -->
  <div class="panel" id="panel-3" style="background: var(--cream-wash);">
    <img class="building-close" src="/admin/scene-assets/reference/arc-site-tier1-2026-04-29/arc-main-building.png" alt="A.R.C. front door">
  </div>

  <!-- Panel 4: Door open + animal. Same crop as panel 3 but with a dark
       opening behind the doors (CSS rectangle) and the species sprite
       on the porch. The sprite src is set by JS based on init payload. -->
  <div class="panel" id="panel-4" style="background: var(--cream-wash);">
    <img class="building-close" src="/admin/scene-assets/reference/arc-site-tier1-2026-04-29/arc-main-building.png" alt="A.R.C. front door">
    <div class="door-opening" aria-hidden="true"></div>
    <img class="arrival-sprite" id="arrival-sprite" src="" alt="">
    <div class="tap-prompt" id="tap-prompt">Tap to open the door</div>
  </div>
```

- [ ] **Step 2: Add the CSS for the composites**

Inside the existing `<style>` block, after the `.panel-text` rule, add:

```css
  /* Painted background panels (1 + 2) — fill the stage with the
     existing welcome-bg painted sky/garden, then layer building +
     trees + gate or path on top. */
  .panel-bg {
    background-size: cover;
    background-position: center;
  }

  /* Building stamp at three sizes — distant, mid, close-up */
  .building-distant {
    position: absolute;
    bottom: 35%; left: 50%;
    transform: translateX(-50%);
    width: 18%;
    filter: drop-shadow(2px 4px 4px rgba(0,0,0,0.18));
    animation: zoom-drift 2.6s ease-in-out forwards;
  }
  .building-mid {
    position: absolute;
    bottom: 22%; left: 50%;
    transform: translateX(-50%);
    width: 42%;
    filter: drop-shadow(2px 4px 6px rgba(0,0,0,0.22));
    animation: zoom-drift 2.6s ease-in-out forwards;
  }
  .building-close {
    position: absolute;
    bottom: -4%; left: 50%;
    transform: translateX(-50%);
    width: 92%;
    height: auto;
    /* Crop to roughly the lower-half — the entrance + canopy + facade */
    clip-path: inset(35% 0% 0% 0%);
    filter: drop-shadow(0 8px 12px rgba(0,0,0,0.18));
  }

  /* Trees framing panels 1 + 2 */
  .tree-side {
    position: absolute;
    bottom: 12%;
    width: 16%;
    filter: drop-shadow(1px 3px 3px rgba(0,0,0,0.2));
  }
  .tree-side.tree-left  { left: 4%; }
  .tree-side.tree-right { right: 4%; }
  .tree-edge {
    position: absolute;
    bottom: 8%;
    width: 22%;
    filter: drop-shadow(1px 3px 3px rgba(0,0,0,0.2));
  }
  .tree-edge.tree-left  { left: -3%; }
  .tree-edge.tree-right { right: -3%; }

  /* Gate prop on panel 1 — picket-fence crop from welcome-bg, with
     a slight gap suggesting "gate ajar". Composited as a CSS-only
     element for v1 (cheap), can be replaced by a painted gate stamp
     later if the design wants more weight. */
  .gate-overlay {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 22%;
    background-image: url('/assets/bg/garden-lawn-summer-morning.png');
    background-size: 200% auto;
    background-position: 8% 100%;  /* Crop to the picket fence portion */
    border-top: 3px solid rgba(0,0,0,0.05);
  }

  /* Path overlay on panel 2 — receding gravel via CSS perspective */
  .path-overlay {
    position: absolute;
    bottom: 0; left: 30%; right: 30%;
    height: 50%;
    background-image: url('/admin/scene-assets/reference/arc-site-tier1-2026-04-29/seamless/texture-gravel.png');
    background-size: 200px 200px;
    background-repeat: repeat;
    transform: perspective(600px) rotateX(60deg);
    transform-origin: bottom;
    clip-path: polygon(20% 100%, 80% 100%, 60% 0%, 40% 0%);
    opacity: 0.85;
  }

  /* Door open opening — dark rectangle behind the closed doors */
  .door-opening {
    position: absolute;
    bottom: 14%; left: 50%;
    transform: translateX(-50%);
    width: 12%;
    height: 30%;
    background: linear-gradient(180deg, #2a1a0c 0%, #4a2e16 100%);
    border-radius: 4px 4px 0 0;
    box-shadow: inset 0 4px 8px rgba(0,0,0,0.5);
  }

  /* Arrival sprite on panel 4 */
  .arrival-sprite {
    position: absolute;
    bottom: 6%;
    left: 50%;
    transform: translateX(-50%);
    height: 32%;
    width: auto;
    filter: drop-shadow(2px 4px 4px rgba(0,0,0,0.25));
    animation: bob 1.4s ease-in-out infinite;
  }
  .tap-prompt {
    position: absolute;
    bottom: 4%; left: 50%;
    transform: translateX(-50%);
    background: rgba(255, 249, 239, 0.9);
    border: 2px solid var(--honey-shadow);
    border-radius: 22px;
    padding: 6px 18px;
    font-family: 'Kalam', cursive;
    font-weight: 700;
    font-size: 16px;
    color: var(--ink);
    animation: pulse 1.6s ease-in-out infinite;
  }

  @keyframes zoom-drift {
    from { transform: translateX(-50%) scale(1); }
    to   { transform: translateX(-50%) scale(1.05); }
  }
  @keyframes bob {
    0%, 100% { transform: translateX(-50%) translateY(0); }
    50%      { transform: translateX(-50%) translateY(-4px); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 0.85; }
    50%      { opacity: 1; transform: translateX(-50%) scale(1.04); }
  }
```

- [ ] **Step 3: JS — populate the panel-4 sprite from the init payload**

Find the `if (m.type === 'init' && m.payload)` block in the script. Right after `species = m.payload.speciesForArrival || 'cat';`, add:

```js
          // Update the panel-4 arrival sprite to match the species
          // GameScene will spawn first.
          const arrivalImg = document.getElementById('arrival-sprite');
          if (arrivalImg && m.payload.arrivingSpriteSrc) {
            arrivalImg.src = m.payload.arrivingSpriteSrc;
          } else if (arrivalImg) {
            // Fallback for standalone preview
            arrivalImg.src = '/assets/animals/cat-ginger-arriving.png';
          }
```

- [ ] **Step 4: Visual smoke-test**

Run dev server. Open `http://localhost:5173/admin/intro.html`. Walk through the 4 panels. Confirm:
- Panel 1: garden bg + small distant building + 2 trees framing edges + gate-y picket strip at bottom
- Panel 2: same garden bg + larger building + receding gravel path + trees flanking edges
- Panel 3: cropped front facade of the painted building filling the canvas
- Panel 4: same crop + dark opening + cat (default) sprite + "Tap to open the door" pulsing
- Crossfades feel smooth
- Zoom-drift is visible on panels 1 + 2

- [ ] **Step 5: Commit**

```bash
git add apps/game/public/admin/intro.html
git commit -m "feat(intro): composite painted assets into 4 panels"
```

---

### Task 7 — Brand-new-account silent override + audio on panel 4

Wire the climactic SFX to fire on the panel-4 tap, respecting `AudioManager` state. Brand-new-account silent override is already handled in `IntroScene.create()` (Task 3) by toggling AudioManager off before mounting; this task plays the climactic SFX.

**Files:**
- Modify: `apps/game/public/admin/intro.html`
- Modify: `apps/game/src/scenes/IntroScene.ts`

- [ ] **Step 1: Add the climactic-SFX postMessage in intro.html**

In the `stage.addEventListener('click', ...)` handler in intro.html, BEFORE sending `'intro-complete'`, send the SFX trigger:

```js
    stage.addEventListener('click', (e) => {
      if (e.target.closest('.corner')) return;
      if (current === 3) {
        // Panel 4 tap — request the climactic SFX from the host
        // (host respects AudioManager state and plays sfx-arrive +
        // species sound + voice-hello-friend if music is on).
        send('intro-climactic-sfx', { species: species });
        // Then complete after a short delay so the SFX has time to
        // start before the iframe unmounts.
        setTimeout(() => send('intro-complete'), 100);
        return;
      }
      if (current < 3) {
        showPanel(current + 1);
      }
    });
```

- [ ] **Step 2: Add the new action to AuthOverlay's allowed types**

In `apps/game/src/auth-overlay/AuthOverlay.ts`, add `'intro-climactic-sfx'` to the AuthAction union and to the navigation-style passthrough condition (same edit-points as Task 2).

- [ ] **Step 3: Handle the SFX trigger in IntroScene**

In `apps/game/src/scenes/IntroScene.ts`, find the `onAction` handler. Add a branch before the `intro-complete` branch:

```ts
        if (action === 'intro-climactic-sfx') {
          if (AudioManager.getInstance().isMusicOn()) {
            const sp = (payload as { species?: string } | undefined)?.species ?? species;
            AudioManager.getInstance().play('sfx-arrive');
            // Per-species sound (cat-meow / dog-bark / fox-yip / bunny-squeak / parrot-squawk / bat-chitter)
            const speciesSound = {
              cat: 'cat-meow',
              dog: 'dog-bark',
              fox: 'fox-yip',
              bunny: 'bunny-squeak',
              parrot: 'parrot-squawk',
              bat: 'bat-chitter',
              snake: 'sfx-arrive',  // no snake sound — fall back to arrive
            }[sp] ?? 'sfx-arrive';
            AudioManager.getInstance().play(speciesSound);
            AudioManager.getInstance().play('voice-hello-friend');
          }
          return;
        }
```

(If `AudioManager.getInstance().play(name)` doesn't exist by that name, look up the actual SFX-playing method and update accordingly. Search the codebase: `grep -n "playSfx\|playSound" apps/game/src/audio/AudioManager.ts`.)

- [ ] **Step 4: Verify it compiles + smoke-test in-game**

Run `pnpm tsc --noEmit`. Open game, log in (or sign up fresh), click PLAY.

For a brand-new account: walk-in plays silently across all 4 panels (because brand-new override muted AudioManager in `create()`). Tap panel 4 — silent (because AudioManager is still off). Game continues into arrival overlay.

For a returning account with music ON: panels 1-3 silent (no SFX scheduled). Panel 4 tap → `sfx-arrive` + species sound + `voice-hello-friend` plays. Game continues.

For any account with music OFF (kid muted on welcome): panels silent throughout. Panel 4 tap → silent. Game continues.

- [ ] **Step 5: Commit**

```bash
git add apps/game/public/admin/intro.html apps/game/src/auth-overlay/AuthOverlay.ts apps/game/src/scenes/IntroScene.ts
git commit -m "feat(intro): climactic SFX on panel 4 tap, respecting audio state"
```

---

### Task 8 — Skip-mode: render only panel 4 when skip-flag is on

Already handled by intro.html's `start()` function (Task 5) which goes directly to panel 4 if `skipIntro` is true. Verify it works end-to-end:

**Files:**
- (No new edits — verification only.)

- [ ] **Step 1: Manual end-to-end test**

1. Open game, sign up or log in.
2. Click PLAY. Walk through all 4 panels normally.
3. On the way through, tick the "Skip next time" checkbox.
4. Tap door open on panel 4 — check the postMessage `set-skip-intro` was received (browser devtools console / inspect IntroScene log if needed).
5. Reload, log in again, click PLAY.
6. Expected: intro shows ONLY panel 4 immediately (door close-up). No auto-advance through 1-3.
7. Tap door open. Game continues.
8. To verify the un-tick path: leave intro in panel 4, untick the checkbox, then tap to open. Reload. Expected: full walk-in plays again.

- [ ] **Step 2: Commit (no changes — just verification)**

If everything works, no commit. If you found a bug, fix it, commit:

```bash
git add apps/game/public/admin/intro.html
git commit -m "fix(intro): skip-mode rendering bug"
```

---

### Task 9 — Push, verify on Vercel, sign-off

**Files:**
- (No new edits — deployment + verification.)

- [ ] **Step 1: Push to origin**

```bash
git push origin main
```

- [ ] **Step 2: Wait for Vercel deploy**

```bash
sleep 75
curl -s -o /dev/null -w "%{http_code} intro.html\n" "https://animal-rescue-centre.vercel.app/admin/intro.html"
```

Expected: 200.

- [ ] **Step 3: Manual verification on production**

Open https://animal-rescue-centre.vercel.app/ on a fresh browser profile (or incognito). Sign up a test account. Walk through:

- [ ] First-ever play: silent walk-in across 4 panels, panel 4 silent on tap (brand-new override active), game continues to arrival overlay.
- [ ] Tap speaker icon during walk-in to enable sound. Tap panel 4 — climactic SFX plays.
- [ ] Tick skip-future checkbox. Tap panel 4. Reload. Log back in. Click PLAY. Only panel 4 renders. Tap. Game continues.
- [ ] Untick skip-future on the door panel. Tap. Reload. Click PLAY. Full walk-in plays.
- [ ] Visually confirm: building, trees, grass, gravel path all match the same painted style as the world map and the A.R.C.-site detail view.

- [ ] **Step 4: If everything works — done. If not — file follow-up tasks.**

---

## Self-Review

**Spec coverage check:**

- ✓ 4 panels, first-person POV, crossfade — Task 5 + 6
- ✓ Panels 1-3 auto-advance at 2.5s — Task 5
- ✓ Panel 4 waits for tap — Task 5
- ✓ Climactic SFX only on panel 4, respecting AudioManager — Task 7
- ✓ Brand-new-account silent override — Task 3 (via `IntroScene.create`)
- ✓ Persistent skip-future toggle (localStorage v1) — Task 1 + Task 5
- ✓ Door-tap preserved as daily arriving gesture — Task 5 (panel 4 always requires tap)
- ✓ Asset reuse map — Task 6 (uses arc-main-building, texture-grass, texture-gravel, arc-tree-oak/ash/horse-chestnut, garden-lawn-summer-morning, arrival sprites, audio pack)
- ✓ Garden gate workaround (CSS crop of welcome-bg picket fence) — Task 6
- ✓ Door-open workaround (CSS dark rect + sprite overlay) — Task 6
- ✓ Speaker + skip toggles in corner with stopPropagation — Task 5
- ✓ Tap-during-auto-advance to skip ahead — Task 5
- ✓ Pre-pick first animal so panel 4 sprite matches GameScene's spawn — Task 3 + Task 4
- ✓ postMessage protocol (intro-complete, toggle-music, set-skip-intro, intro-climactic-sfx) — Task 2 + Task 5 + Task 7
- ✓ AuthOverlay extension for 'intro' page — Task 2
- ✓ MainMenuScene reroute to IntroScene — Task 4
- ✓ GameScene init params — Task 4
- ✓ IntroScene safety timeout (30s fallback) — Task 3
- ✓ Refresh restarts intro from panel 1 — Task 5 (showPanel(0) in start() handles this naturally)
- ✓ TDD where it makes sense (localStorage helpers) — Task 1

**Placeholder scan:** No "TODO", "TBD", or "implement later" steps. All code blocks are complete.

**Type consistency:** `getSkipIntro/setSkipIntro/hasPlayedBefore/markPlayed` consistent across Tasks 1+3. `intro-complete/set-skip-intro/intro-climactic-sfx` consistent across Tasks 2+5+7. `preSelectedSpecies/preSelectedVariant` consistent in Task 3+4.

**Scope check:** Single feature, single deliverable plan. Builds incrementally with a working commit at every task. Each task is 5-30 minutes of focused work.

---

## Out of scope (explicitly deferred per spec)

- Door-creak / footsteps / knock SFX commissions — not in this plan.
- Bespoke painted panels for 1-3 — composited from existing assets only.
- Cross-device skip-flag (Supabase column) — localStorage only for v1.
- "Play the intro again" link in the menu — only the in-intro skip toggle exists.
- Adobe `image_fill_area` painted door-open variant — only if CSS workaround doesn't land.
