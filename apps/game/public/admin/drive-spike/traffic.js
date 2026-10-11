// traffic.js — other road users in the driving spike.
//
// STUB. The contract below is what drive-spike.html calls; the bodies are
// no-ops so the spike runs unchanged until this module is filled in.
//
// The route is a polyline in world metres. A position on it is s, the distance
// along it in metres; route.atDistance(s) gives {x, y, h} with h the heading in
// radians. A lateral offset of route.laneOffset(lane) metres to the left of the
// direction of travel puts something in a lane: lane 0 is ours (keep left),
// lane 1 is the oncoming side, which is where overtaking happens.

/**
 * @typedef {Object} Route
 * @property {number} length                     metres
 * @property {(s:number) => {x:number, y:number, h:number}} atDistance
 * @property {(lane:0|1) => number} laneOffset   metres from the centreline
 * @property {(s:number) => string} roadClassAt  OSM class of the road at s
 * @property {number} laneWidth                  metres
 */

/**
 * @typedef {Object} Van
 * @property {number} s        distance along the route, metres
 * @property {number} lane     current lateral offset, metres (eases between lanes)
 * @property {0|1} laneWant    the lane the child has asked for
 * @property {number} v        speed, metres per second
 * @property {number} length   metres
 * @property {number} width    metres
 */

/**
 * @typedef {Object} TrafficResult
 * @property {number} speedCap     the fastest the van may go this frame without
 *           touching anything. Infinity when the road ahead is clear. If the van
 *           is faster, the spike brakes it hard itself — there is never an
 *           accident, and the hard stop is what jostles the animals.
 * @property {boolean} laneBlocked the overtaking lane is not safe now. The
 *           spike refuses a swipe into it and, if the van is already there,
 *           brings it back, which also counts as a swerve.
 * @property {string[]} events     one-off moments for the HUD, e.g. 'close'
 *           for a clean overtake (the reference's "CLOSE!"), 'beep' for a
 *           queue behind a van in first gear on a dual carriageway.
 */

/** A fresh set of traffic for a new route. Called on every route change.
 *  @param {Route} route */
export function create(route) {
  return { route };
}

/** Advance the traffic and report what it means for the van.
 *  @returns {TrafficResult} */
export function step(traffic, dt, van) {
  return { speedCap: Infinity, laneBlocked: false, events: [] };
}

/** Called with ctx in world metres, rotated by the camera, after the scenery
 *  and before the van. Shadows use view.sun, as scenery.js does. */
export function draw(ctx, traffic, view) {}
