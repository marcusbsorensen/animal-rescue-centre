import { Capacitor } from '@capacitor/core';

/**
 * Where is this copy of the game running?
 *
 * The same `dist/` bundle ships to the web and gets copied into the iOS
 * app, so anything that must differ between the two is decided here at
 * runtime rather than by a second build. Keep the list of differences
 * short and in this file, so there is one place to look.
 */

/** True inside the Capacitor WKWebView (iOS app), false in a browser. */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** 'ios' | 'android' | 'web' */
export function platform(): string {
  return Capacitor.getPlatform();
}

/**
 * Should the service worker be registered?
 *
 * No, on native. Capacitor serves the app from `capacitor://localhost`,
 * and service workers do not register on a custom scheme — the call
 * fails and the update banner it drives could never fire anyway, since
 * a native build only updates through the App Store. The runtime caches
 * are equally pointless there: every asset is already inside the app
 * bundle, on disk, offline by construction.
 */
export function shouldRegisterServiceWorker(): boolean {
  return !isNative();
}
