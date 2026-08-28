import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor shell for the iOS build.
 *
 * The game is the same Vite bundle that ships to the web — `dist/` is
 * copied wholesale into the app, so there is no second codebase to keep
 * in step. What differs on native is decided at runtime via
 * `Capacitor.isNativePlatform()` (see src/lib/platform.ts), not by a
 * separate build.
 */
const config: CapacitorConfig = {
  appId: 'com.healingishere.arc',
  appName: 'A.R.C.',

  // NOT `dist`. Capacitor copies webDir wholesale, and dist carries ~32 MB
  // of internal tooling that must not ship inside the app. `dist-ios` is
  // the pruned staging copy produced by scripts/build-ios.mjs — build with
  // `pnpm build:ios`, never `cap sync` on its own.
  webDir: 'dist-ios',

  ios: {
    // The game paints its own background and manages its own safe-area
    // insets, so WKWebView must not add its own. `never` stops iOS
    // inserting a status-bar-height gap above the canvas.
    contentInset: 'never',

    // Matches the Phaser backgroundColor and the index.html body colour,
    // so the split second before the canvas paints is the same cream
    // rather than a white flash.
    backgroundColor: '#fef9ef',

    // Phaser owns all touch handling; WKWebView's own scroll and bounce
    // would otherwise let a child drag the whole game view around.
    scrollEnabled: false,

    // Everything is bundled locally. No remote origin should ever be
    // loaded as app content.
    limitsNavigationsToAppBoundDomains: true,
  },
};

export default config;
