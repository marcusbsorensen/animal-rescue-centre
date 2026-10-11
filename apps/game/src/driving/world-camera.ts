/**
 * world-camera.ts
 *
 * The rotating-world camera. The van never moves on screen; the world turns
 * underneath it. Ported from drive-spike.html (step()'s camera lines, draw()
 * and drawVan()), with one deliberate change, below.
 *
 * Why the camera has a heading of its own. The route is straight segments
 * between graph nodes, so its tangent snaps at every node: the spike measured
 * 55° on one route, and across all 210 routes between named places the real
 * junction turns reach 150° (__tests__/world-camera.test.ts). Pointing the
 * camera along the segment underfoot makes the whole world jump at each node,
 * which is very likely what "difficult to manoeuvre" was. So the camera aims
 * at the route LOOKAHEAD_M ahead and eases towards that aim. The van is then
 * drawn at the difference between its own heading and the camera's: the world
 * swings through a bend while the van turns only a little in the frame.
 *
 * The change from the spike. The spike eases with
 *   camH += wrap(aim - camH) * min(1, k * dt)
 * which closes a different fraction of the gap per second at different frame
 * rates. This eases with
 * 1 - exp(-k * dt), which is the same per second at any frame rate, with k
 * chosen so one 60 fps frame closes exactly what the spike's did.
 *
 * Screen placement is measured off the reference game: the vehicle sits 53.5%
 * across and 59% down in every frame. Pixels per metre is the spike's 22 (a
 * 5 m lane is 110 px) times a zoom, because the dual carriageway either zooms
 * out (BIG_ROAD_ZOOM) or narrows its lanes (lane-motion.ts's TRUNK_LANE_M).
 * No Phaser — unit-tested.
 */
import { atDistance, roadClassAt, type RoutePath } from './route-path';
import type { BigRoadMode } from './lane-motion';

/** The camera aims at the route this far ahead of the van, metres. */
export const LOOKAHEAD_M = 20;

/** The spike's per-second easing rate, in its frame-rate dependent form. */
export const SPIKE_CAM_EASE = 3.4;
/** The frame rate the spike was tuned at. */
export const SPIKE_FPS = 60;
/** Exponential rate whose single 60 fps step equals the spike's: about 3.50/s. */
export const CAM_EASE = -SPIKE_FPS * Math.log(1 - SPIKE_CAM_EASE / SPIKE_FPS);

/** Where the van sits on screen, as fractions of width and height. */
export const VAN_SCREEN_X = 0.535;
export const VAN_SCREEN_Y = 0.59;

/** Pixels per metre at zoom 1. */
export const BASE_PPM = 22;
/** Van footprint across, metres: a real panel van. */
export const VAN_WIDTH_M = 2.4;

/** The zoom trial's framing on the dual carriageway, and how soon before it. */
export const BIG_ROAD_ZOOM = 0.62;
export const BIG_ROAD_ZOOM_AHEAD_M = 40;
/** Zoom's easing rate, per second; already exponential in the spike. */
export const ZOOM_EASE = 1.6;

/** An angle into (-PI, PI]. */
export function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** The heading the camera wants at distance s: from the route at s to the
 *  route LOOKAHEAD_M further on. Near the end, where the two points meet, it
 *  falls back to the segment underfoot. */
export function cameraAim(route: RoutePath, s: number, lookahead = LOOKAHEAD_M): number {
  const here = atDistance(route, s);
  const ahead = atDistance(route, Math.min(route.length, s + lookahead));
  const dx = ahead.x - here.x, dy = ahead.y - here.y;
  return dx * dx + dy * dy < 1e-6 ? here.heading : Math.atan2(dy, dx);
}

/** Ease the camera heading towards aim over dt seconds, by the short way
 *  round. A null camera (first frame, or after a jump) takes the aim at once. */
export function easeCameraHeading(camH: number | null, aim: number, dt: number, k = CAM_EASE): number {
  if (camH === null) return aim;
  return wrapAngle(camH + wrapAngle(aim - camH) * (1 - Math.exp(-k * dt)));
}

/** The spike's easing, kept so the tests can show what the change fixed. */
export function easeCameraHeadingSpike(camH: number | null, aim: number, dt: number, k = SPIKE_CAM_EASE): number {
  if (camH === null) return aim;
  return wrapAngle(camH + wrapAngle(aim - camH) * Math.min(1, k * dt));
}

/** How far the van is turned within the frame: its heading less the camera's. */
export function vanScreenRotation(vanHeading: number, camH: number): number {
  return wrapAngle(vanHeading - camH);
}

/** The rotation that turns world into screen: camH points up the screen. */
export function worldRotation(camH: number): number {
  return -camH - Math.PI / 2;
}

export function pixelsPerMetre(zoom = 1): number {
  return BASE_PPM * zoom;
}

/** The van's fixed spot on a screen of w x h. */
export function vanScreenPoint(w: number, h: number): { x: number; y: number } {
  return { x: w * VAN_SCREEN_X, y: h * VAN_SCREEN_Y };
}

/** Fraction of the screen's width the van covers. */
export function vanWidthFraction(screenW: number, zoom = 1): number {
  return (VAN_WIDTH_M * pixelsPerMetre(zoom)) / screenW;
}

export interface CameraView {
  /** World point under the van's screen spot, metres. */
  x: number;
  y: number;
  camH: number;
  zoom: number;
  screenW: number;
  screenH: number;
}

/** A world point to screen pixels: translate to the camera, rotate so camH is
 *  up, scale, and place at the van's spot. The same transform the spike's
 *  draw() applies to the canvas. */
export function worldToScreen(view: CameraView, wx: number, wy: number): { x: number; y: number } {
  const r = worldRotation(view.camH);
  const ppm = pixelsPerMetre(view.zoom);
  const dx = wx - view.x, dy = wy - view.y;
  const rx = dx * Math.cos(r) - dy * Math.sin(r);
  const ry = dx * Math.sin(r) + dy * Math.cos(r);
  const o = vanScreenPoint(view.screenW, view.screenH);
  return { x: o.x + rx * ppm, y: o.y + ry * ppm };
}

/** The zoom the camera is heading for: pulled back on the dual carriageway,
 *  and a little before it so the wider road is framed when the van arrives.
 *  Only in the zoom trial; the narrow trial never changes zoom. */
export function zoomTarget(route: RoutePath, s: number, mode: BigRoadMode): number {
  if (mode !== 'zoom') return 1;
  const bigAhead = roadClassAt(route, s) === 'trunk' || roadClassAt(route, s + BIG_ROAD_ZOOM_AHEAD_M) === 'trunk';
  return bigAhead ? BIG_ROAD_ZOOM : 1;
}

export function easeZoom(zoom: number, target: number, dt: number): number {
  return zoom + (target - zoom) * (1 - Math.exp(-ZOOM_EASE * dt));
}
