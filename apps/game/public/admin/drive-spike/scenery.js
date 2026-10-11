// scenery.js — what the driving spike draws beside the road.
//
// STUB. The contract below is what drive-spike.html calls; the bodies are
// no-ops so the spike runs unchanged until this module is filled in.
//
// Coordinates. Everything here is in world metres, the same frame as the
// route: x east, y south, origin at the map's top-left. One pixel of the
// child's map (birchie-roads.svg, viewBox 1800 x 1121) is WORLD.metresPerMapPx
// metres on both axes, so a map polygon converts with mapToWorld().
//
// Drawing. Both draw functions are called with ctx already transformed into
// world metres and rotated by the camera, so a path drawn at world (x, y) lands
// in the right place on screen. Draw nothing in screen space here.

/**
 * @typedef {Object} View
 * @property {number} cx       world x the camera centres on (metres)
 * @property {number} cy       world y the camera centres on (metres)
 * @property {number} radius   metres from (cx, cy) to beyond the screen corner
 * @property {number} camH     camera heading, radians, world frame
 * @property {number} ppm      pixels per metre at the current zoom
 * @property {'spring'|'summer'|'autumn'|'winter'} season
 * @property {{x:number, y:number}} sun  shadow offset in world metres per
 *           metre of object height. Fixed in the world, so shadows stay put
 *           while the camera turns. The van's shadow uses the same vector.
 */

/**
 * Called once at boot, after the graph has loaded.
 * @param {{ graph: object, mapToWorld: (px:number, py:number) => {x:number, y:number},
 *           metresPerMapPx: number }} world
 * @returns {Promise<object>} whatever drawGround/drawObjects need
 */
export async function load(world) {
  return { world };
}

/** Under the roads: fields, wood floor, grass, water, sea. */
export function drawGround(ctx, scenery, view) {}

/** Over the roads, under the guide line, traffic and van: hedges, walls,
 *  roofs, canopies, with their world-space shadows. */
export function drawObjects(ctx, scenery, view) {}
