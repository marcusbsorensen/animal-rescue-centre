// crossings.js — small wild animals crossing the small lanes.
//
// STUB. The contract below is what drive-spike.html calls; the bodies are
// no-ops so the spike runs unchanged until this module is filled in.
//
// Marcus, 2026-10-11: on the small lanes the camera comes in close so she can
// see small animals crossing — hedgehogs, rabbits, pheasants and the like. She
// slows or stops for them; if she does not, the van stops itself, the same
// rule as for traffic. Never an accident.
//
// Positions are distances along the route (s, metres) and lateral offsets
// from its centreline (metres, negative to the left), as in traffic.js.

/**
 * @typedef {Object} Route   same shape as traffic.js's Route
 * @property {number} length
 * @property {(s:number) => {x:number, y:number, h:number}} atDistance
 * @property {(lane:0|1, s?:number) => number} laneOffset
 * @property {(s:number) => string} roadClassAt
 * @property {number} laneWidth
 */

/**
 * @typedef {Object} World
 * @property {object} graph        the road graph (nodes, edges with OSM class)
 * @property {(px:number, py:number) => {x:number, y:number}} mapToWorld
 * @property {'spring'|'summer'|'autumn'|'winter'} season
 */

/** Fresh crossings for a new route. @param {Route} route @param {World} world */
export function create(route, world) {
  return { route, world };
}

/** Advance the animals and report what they mean for the van.
 *  @returns {{ speedCap: number, events: string[] }} speedCap as in traffic.js:
 *  the fastest the van may go this frame without reaching an animal; the page
 *  brakes hard itself if she has not. */
export function step(xing, dt, van) {
  return { speedCap: Infinity, events: [] };
}

/** Called with ctx in world metres, rotated by the camera, after traffic and
 *  before the van. Shadows along view.sun, as scenery.js and traffic.js. */
export function draw(ctx, xing, view) {}
