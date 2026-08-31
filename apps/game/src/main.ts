import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { LoadingScene } from './scenes/LoadingScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { SignupScene } from './scenes/SignupScene';
import { LoginScene } from './scenes/LoginScene';
import { ForgotPinScene } from './scenes/ForgotPinScene';
import { FriendsScene } from './scenes/FriendsScene';
import { GameScene } from './scenes/GameScene';
import { IntroScene } from './scenes/IntroScene';
import { KitchenMinigameScene } from './scenes/KitchenMinigameScene';
import { SocialScene } from './scenes/SocialScene';
import { WalkScene } from './scenes/WalkScene';
import { VetScene } from './scenes/VetScene';
import { AdoptionMatchScene } from './scenes/AdoptionMatchScene';
import { CharmSelectScene } from './scenes/CharmSelectScene';
import { GroomingScene } from './scenes/GroomingScene';
import { PlayScene } from './scenes/PlayScene';
import { DepotScene } from './scenes/DepotScene';
import { SupplyRunScene } from './scenes/SupplyRunScene';
import { AccountScene } from './scenes/AccountScene';
import { DialogueDemoScene } from './scenes/DialogueDemoScene';
import { PtvDriveScene } from './scenes/PtvDriveScene';
import { showUpdateBanner } from './ui/UpdateBanner';
import { registerSW } from 'virtual:pwa-register';
import { shouldRegisterServiceWorker } from './lib/platform';
import { setSafeAreaLeft, getSafeAreaLeft, setSideNav } from './ui/layout';
import { readSafeAreaInsets } from './ui/safe-area';

// Show the painted "new version ready!" banner when vite-plugin-pwa
// detects a waiting service worker. Refresh clicks skip-waiting the SW
// and reload so the fresh bundle takes over immediately.
//
// Web only — see shouldRegisterServiceWorker(). The native shell serves
// from capacitor://localhost, where registration cannot succeed and an
// update banner would be lying about how the app updates.
if (shouldRegisterServiceWorker()) {
  const updateSW = registerSW({
    onNeedRefresh() {
      showUpdateBanner(() => updateSW(true));
    },
  });
}

// Dev-only: `?dialogueDemo=1` boots straight into the DialogueRunner harness.
const DIALOGUE_DEMO =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('dialogueDemo');

// Dev-only: `?ptvDemo=1` boots straight into the PTV driving scene (Slice 1
// travel mode) in isolation — no login/asset flow needed for testing.
const PTV_DEMO =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('ptvDemo');

// Prototype: `?sideRail=1` boots the side-nav layout — navigation down
// the left edge, arrivals down the right, no HUD strip and no bottom
// bar. `?sideRail=0` turns it back off.
//
// The choice is remembered in localStorage because the device this is
// judged on is a phone: retyping a query string into mobile Safari to
// compare two layouts is the kind of friction that stops the comparison
// being made. See docs/landscape-relayout-2026-08-31.md.
if (typeof window !== 'undefined') {
  const param = new URLSearchParams(window.location.search).get('sideRail');
  if (param !== null) {
    try {
      window.localStorage.setItem('arc_side_rail', param === '0' ? '0' : '1');
    } catch { /* private browsing — the param still applies to this load */ }
  }
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem('arc_side_rail');
  } catch { /* ignore */ }
  // The native shell loads `capacitor://localhost/` with no query string,
  // and a fresh install has empty localStorage — so on the device neither
  // source above says anything and the flag would always read off, which
  // is exactly where this layout most needs looking at. Build a prototype
  // with `VITE_SIDE_RAIL=1 pnpm build:ios`; a URL param or a stored choice
  // still wins, so the toggle keeps working inside that build.
  const buildDefault = import.meta.env.VITE_SIDE_RAIL === '1';
  const on = param !== null
    ? param !== '0'
    : (stored !== null ? stored === '1' : buildDefault);
  setSideNav(on);
}

// `?safeAreaLeft=50` forces the inset a desktop browser cannot report.
// The Dynamic Island measures 50pt on a landscape 17 Pro and moves both
// the nav rail and the play box; without it a Chrome capture of this
// layout is 50pt wider than the device and is not the thing being judged.
//
// It has to win over the live probe rather than seed it: `readSafeAreaInsets`
// answers 0 in a desktop browser, and applySafeArea would overwrite the
// override on its first pass. Nothing sets this on a phone, so the probe
// still owns the value everywhere it can read one.
const FORCED_SAFE_AREA_LEFT: number | null = (() => {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('safeAreaLeft');
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
})();
if (FORCED_SAFE_AREA_LEFT !== null) setSafeAreaLeft(FORCED_SAFE_AREA_LEFT);

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
    // autoRound keeps sprite positions on whole pixels, which noticeably
    // reduces the "blurry scaled icon" artifact on retina displays.
    autoRound: false,
  },
  backgroundColor: '#fef9ef',
  scene: DIALOGUE_DEMO
    ? [DialogueDemoScene]
    : PTV_DEMO
    ? [PtvDriveScene]
    : [BootScene, LoadingScene, MainMenuScene, SignupScene, LoginScene, ForgotPinScene, FriendsScene, IntroScene, GameScene, KitchenMinigameScene, SocialScene, WalkScene, VetScene, GroomingScene, PlayScene, DepotScene, SupplyRunScene, AccountScene, AdoptionMatchScene, CharmSelectScene, PtvDriveScene],
  // Render config: antialias is ON by default but we set it explicitly so
  // downsampled icons (256-px source → 36-px display) stay smooth instead
  // of aliased. mipmapFilter enables trilinear-ish downscaling in WebGL
  // which is the big win for nav/HUD icons that sit at a small display
  // size relative to their 256-px source art.
  render: {
    antialias: true,
    antialiasGL: true,
    pixelArt: false,
    roundPixels: false,
    mipmapFilter: 'LINEAR_MIPMAP_LINEAR',
    powerPreference: 'high-performance',
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
};

const game = new Phaser.Game(config);

// Teach the layout where the notch is. Phaser knows nothing about safe
// areas, so without this the left rail sits at x=0 — underneath the
// Dynamic Island on a landscape iPhone, which left about six of its
// fifty-six points reachable.
//
// Measured repeatedly on purpose. Reading it straight after the Phaser
// constructor gives 0: the probe is in the document but nothing has
// settled, and `env()` has nothing to report yet. If that first 0 were
// the only reading the rail would stay under the notch forever, because
// nothing resizes afterwards on a phone sitting still. The orientation
// hook matters too — the Island swaps edges between the two landscape
// orientations, both of which this app allows.
//
// When the value does change, scenes have already laid out against the
// old one, so refresh the scale manager to make them do it again.
const applySafeArea = (): void => {
  if (FORCED_SAFE_AREA_LEFT !== null) return;
  const next = readSafeAreaInsets().left;
  if (next === getSafeAreaLeft()) return;
  setSafeAreaLeft(next);
  game.scale.refresh();
};
applySafeArea();
requestAnimationFrame(applySafeArea);
window.addEventListener('load', applySafeArea);
window.addEventListener('resize', applySafeArea);
window.addEventListener('orientationchange', () => setTimeout(applySafeArea, 100));
game.scale.on('resize', applySafeArea);

// Expose for dev-tools inspection and Playwright e2e tests. Harmless
// to expose in production — kids playing in the browser can already
// poke the game state via devtools regardless, and this is a single-
// player client-side app, not a server.
(window as unknown as Record<string, unknown>).__PHASER_GAME__ = game;
