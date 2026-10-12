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
 * 5 m lane is 110 px) times a zoom, and the zoom follows speed and place
 * (zoomFor, below; docs/driving-rebuild-2026-10-11.md, "The camera's distance
 * follows speed and place").
 * No Phaser — unit-tested.
 */
import { atDistance, carriagewayAt, roadClassAt, type RoutePath } from './route-path';
import { GEAR_SPEED_MPS } from './road-gears';

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

/** The closest the camera may sit on the dual carriageway, whose true 21.6 m
 *  would otherwise fill a phone, and how soon before it that applies, so the
 *  wider road is already framed when the van arrives. Only the real dual
 *  carriageway: the A28's divided and single stretches are main roads and get
 *  the main road's zoom (trunk-carriageways.ts). */
export const BIG_ROAD_ZOOM = 0.62;
export const BIG_ROAD_ZOOM_AHEAD_M = 40;

/** How close the camera sits, by speed and by place. Marcus, 2026-10-11:
 *  going fast is for overview, seeing far ahead; going slowly, on the small
 *  lanes and pulling up at a farm or a rewilding site, is for detail, such as
 *  a small animal crossing the road. 1 is the scale measured against the
 *  reference: the van 13.6% of the screen's width. */
export const ZOOM_FAST = 0.66;
/** Standing still on a small road (SMALL_ROADS), and on any other. */
export const ZOOM_STILL_LANE = 1.35;
export const ZOOM_STILL_ROAD = 1.15;
/** Pulled up at the gate, and how far out the arrival zoom begins. */
export const ZOOM_ARRIVE = 1.6;
export const ARRIVE_ZOOM_M = 120;
export const SMALL_ROADS: ReadonlySet<string> = new Set(['residential', 'unclassified', 'track']);
/** The speed at which the zoom reaches ZOOM_FAST: third gear. */
export const ZOOM_TOP_SPEED_MPS = GEAR_SPEED_MPS[3];

/** Zoom's easing rates, per second. Out is quicker than in: seeing ahead when
 *  speeding up matters more than detail when slowing down. */
export const ZOOM_OUT_RATE = 1.5;
export const ZOOM_IN_RATE = 0.7;

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

export interface ZoomPlace {
  /** OSM class of the road underfoot. */
  road: string;
  /** Speed, m/s. */
  v: number;
  /** Metres left to the end of the route. */
  toGo: number;
  /** On, or within BIG_ROAD_ZOOM_AHEAD_M of, the real dual carriageway. */
  bigAhead: boolean;
}

/** The zoom the camera is heading for: from the standing zoom for the road
 *  down to ZOOM_FAST at top speed, drawn in towards ZOOM_ARRIVE over the last
 *  ARRIVE_ZOOM_M, and never closer than BIG_ROAD_ZOOM near the dual
 *  carriageway. The spike's zoomTarget. */
export function zoomFor({ road, v, toGo, bigAhead }: ZoomPlace): number {
  const still = SMALL_ROADS.has(road) ? ZOOM_STILL_LANE : ZOOM_STILL_ROAD;
  const f = Math.min(1, v / ZOOM_TOP_SPEED_MPS);
  let z = still + (ZOOM_FAST - still) * f;
  if (toGo < ARRIVE_ZOOM_M) z += (ZOOM_ARRIVE - z) * (1 - toGo / ARRIVE_ZOOM_M);
  if (bigAhead) z = Math.min(z, BIG_ROAD_ZOOM);
  return z;
}

/** Whether the road at distance s is the real dual carriageway. A trunk
 *  segment with no carriageway (a route built without the data) counts, as
 *  every trunk edge did before; one known to be divided or single does not. */
export function bigRoadAt(route: RoutePath, s: number): boolean {
  if (roadClassAt(route, s) !== 'trunk') return false;
  const c = carriagewayAt(route, s);
  return !c || c.kind === 'dual';
}

/** zoomFor at distance s along the route, at speed v. */
export function zoomTarget(route: RoutePath, s: number, v: number): number {
  const road = roadClassAt(route, s);
  const bigAhead = bigRoadAt(route, s) || bigRoadAt(route, s + BIG_ROAD_ZOOM_AHEAD_M);
  return zoomFor({ road, v, toGo: route.length - s, bigAhead });
}

/** Ease the zoom towards target over dt seconds, multiplicatively (each step
 *  closes a share of the ratio, not of the difference, so going from 0.62 to
 *  1.24 feels as fast as from 0.8 to 1.6), out at ZOOM_OUT_RATE and in at
 *  ZOOM_IN_RATE. The share is 1 - exp(-rate * dt), so it closes the same
 *  amount per second at any frame rate, as easeCameraHeading does. */
export function easeZoom(zoom: number, target: number, dt: number): number {
  const rate = target < zoom ? ZOOM_OUT_RATE : ZOOM_IN_RATE;
  return zoom * Math.exp(Math.log(target / zoom) * (1 - Math.exp(-rate * dt)));
}
