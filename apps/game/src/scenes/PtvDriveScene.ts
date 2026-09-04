import Phaser from 'phaser';
import {
  COLOURS, FONTS, SAFE_MARGIN, MIN_FONT, TYPE,
  CHROME, SPACE, TITLE_CY, TEXT_RESOLUTION, contentTopFor,
} from '../ui/constants';
import { createChromeButton, createChromeTitle, createChromePlate } from '../ui/UIButton';
import { useRetinaText } from '../ui/retina-text';
import { AudioManager, type HornProfile } from '../audio/AudioManager';
import type { Economy } from '@arc/shared-types';
import { VEHICLE_DEFS, DESTINATIONS, getDestination, type VehicleDef, type VehicleType } from '@arc/game-logic';
import {
  createDriveState,
  cycleGear,
  gearLabel,
  gearScrollRate,
  jostleComfort,
  PARK,
  REVERSE,
  type DriveState,
  type DriveType,
  type Gear,
} from '../driving/drive-state';
import {
  drawRoadForConfig,
  drawTransitionRoad,
  drawJunctionMouth,
  drawTopDownVan,
  drawTrafficVehicle,
  drawSceneryItem,
  roadGeometry,
  laneCentreX,
  vanSizeForLane,
  isOvertakingZone,
} from '../driving/drive-render';
import { buildRoadTransitions, worldYForRow, type RoadTransition } from '../driving/road-transition';
import { buildRouteJunctions, nextJunction, nextChoiceJunction, inDecisionWindow, type RouteJunction } from '../driving/junctions';
import { TRAFFIC_PROFILES, pickTrafficKind, pickFrom, isBusSeason, type TrafficProfile, type TrafficKind } from '../driving/traffic';
import { preferredLane, carAbsoluteSpeed, maxLaneFor } from '../driving/traffic-sim';
import { ARC_PLACE, placeFor, CAMERA_PLACES } from '../driving/birchie-places';
import { buildAdjacency, routePolyline, routeProfile, type RoadGraph, type Adjacency, type RoutePoint, type RoadClassRun } from '../driving/road-router';
import { buildManeuvers, nextManeuver, maneuverText, maneuverArrow, projectToRoute, type Maneuver } from '../driving/route-instructions';
import { ROADS, type RoadConfig, type RoadId } from '../driving/road-config';

/**
 * Reference cruising rate (px/tick) that traffic `relSpeed` is measured
 * against, so other vehicles have an *absolute* speed independent of ours —
 * they keep flowing past even when we're stopped (Park/Neutral) at a crossing.
 */
const TRAFFIC_REF_SPEED = gearScrollRate(2);

/** Painted top-down sprite key(s) per traffic kind. Cars pick a random colour;
 *  a kind with no loaded sprite falls back to the procedural draw. */
const TRAFFIC_SPRITE_KEYS: Record<TrafficKind, string[]> = {
  car: ['vehicle-topdown-car-red', 'vehicle-topdown-car-blue', 'vehicle-topdown-car-yellow'],
  pickup: ['vehicle-topdown-pickup'],
  truck: ['vehicle-topdown-truck'],
  tractor: ['vehicle-topdown-tractor', 'vehicle-topdown-tractor-red', 'vehicle-topdown-tractor-blue'],
  motorbike: ['vehicle-topdown-motorbike'],
  emergency: ['vehicle-topdown-ambulance', 'vehicle-topdown-fireengine'],
  bus: ['vehicle-topdown-bus'],
  binlorry: ['vehicle-topdown-binlorry'],
  // Six flatbed loads: one empty + five overflowing skips, picked at random so
  // the skip varies truck-to-truck and sometimes the bed runs empty.
  skiptruck: [
    'vehicle-topdown-skiptruck-empty',
    'vehicle-topdown-skiptruck-1', 'vehicle-topdown-skiptruck-2', 'vehicle-topdown-skiptruck-3',
    'vehicle-topdown-skiptruck-4', 'vehicle-topdown-skiptruck-5',
  ],
};

/** The top-down sprite the player drives, per picked fleet vehicle. */
const VEHICLE_SPRITE: Record<VehicleType, string> = {
  'pedal-trike': 'vehicle-topdown-trikey',
  'small-van': 'vehicle-topdown-henry',
  'long-van': 'vehicle-topdown-bea',
  'animal-lorry': 'vehicle-topdown-big-tilly',
  'electric-minibus': 'vehicle-topdown-spark',
};

/** On-screen size of each fleet vehicle relative to Henry the van (= 1.0), so
 *  they read proportionately: the pedal trike is tiny, Big Tilly the animal
 *  lorry is the biggest. Used on the road, in the picker cards and in the bay
 *  (the A.R.C. forecourt has different-sized spaces for exactly this reason). */
const VEHICLE_SIZE: Record<VehicleType, number> = {
  'pedal-trike': 0.55,
  'small-van': 1.0,
  'long-van': 1.12,
  'electric-minibus': 1.18,
  'animal-lorry': 1.3,
};
const VEHICLE_SIZE_MAX = Math.max(...Object.values(VEHICLE_SIZE));

/** Top-speed multiplier per fleet vehicle (× the gear's rate), so the same gear
 *  means different speeds: the pedal trike is slow flat-out, the electric minibus
 *  is nippy, the heavy lorry lumbers. */
const VEHICLE_SPEED: Record<VehicleType, number> = {
  'pedal-trike': 0.5,      // pedal power — slow even in top gear
  'small-van': 1.0,        // Henry, the baseline
  'long-van': 0.95,        // Bea, a touch heavier
  'electric-minibus': 1.15, // Spark, zippy EV torque
  'animal-lorry': 0.8,     // Big Tilly, heavy and lumbering
};

/** Bay orientation: the parked vehicle must point its NOSE at the road (down).
 *  Flagged fleet fronts (Henry, Trikey, Big Tilly) are drawn nose-down already,
 *  so they sit at 0°; the plain top-down fronts (Bea, Spark) are nose-up and
 *  need a 180° flip to face the exit. */
const VEHICLE_PARK_ANGLE: Record<VehicleType, number> = {
  'pedal-trike': 0,
  'small-van': 0,
  'long-van': 0,
  'electric-minibus': 0,
  'animal-lorry': 0,
};

/** Each vehicle's horn, shaped to its character: the pedal trike gives a
 *  playful rising trill, Henry a friendly two-tone beep, Bea a deeper honk,
 *  Spark a clean electric tone, and Big Tilly a big low fog-horn blast. */
const VEHICLE_HORN: Record<VehicleType, HornProfile> = {
  'pedal-trike':      { freqs: [760, 1140], wave: 'triangle', duration: 0.5, pattern: 'trill', gain: 0.4 },
  'small-van':        { freqs: [440, 554],  wave: 'sawtooth', duration: 0.5, pattern: 'double', gain: 0.5 },
  'long-van':         { freqs: [330, 415],  wave: 'sawtooth', duration: 0.6, pattern: 'double', gain: 0.52 },
  'electric-minibus': { freqs: [660, 990],  wave: 'sine',     duration: 0.45, pattern: 'double', gain: 0.45 },
  'animal-lorry':     { freqs: [118, 155],  wave: 'sawtooth', duration: 1.1, pattern: 'single', gain: 0.62 },
};

/** Decorative (non-consequential) other road user. */
interface TrafficCar {
  gfx: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
  profile: TrafficProfile;
  lane: number;
  y: number;
  /** Absolute pace (px/tick), lane-aware — faster in the fast lane. */
  absSpeed: number;
  /** When (scene time) this weaver may next change lane; 0 = never. */
  nextZigAt: number;
}

/** A roadside scenery prop scrolling past on the verge. */
interface SceneryProp {
  gfx: Phaser.GameObjects.Graphics;
  y: number;
  size: number;
}

/** A roadside decoration (cone, sign, bollard, barrier, speed camera). */
interface DecorProp {
  obj: Phaser.GameObjects.Image;
  y: number;
  size: number;
  isCamera: boolean;
  triggered: boolean;
  /** One-shot props (a placed speed camera) are removed when they pass, not
   *  recycled — so cameras only appear at their fixed map spots. */
  oneShot?: boolean;
}

/** Decor kinds that are purely decorative (the speed camera is special). */
const DECOR_KINDS = ['cone', 'cones-three', 'sign-warning', 'sign-speed', 'bollard', 'barrier'];

/** An oncoming vehicle in the opposite carriageway, sweeping up toward us. It's
 *  across the divide so it never collides with the player — just atmosphere. */
interface OncomingCar {
  gfx: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
  lane: number;
  y: number;
  speed: number;
}

/** The order the demo cycles road types in. */
const ROAD_CYCLE: RoadId[] = ['country-lane', 'thanet-way', 'rural-track', 'coast-road'];

/** Uniform oncoming pace (px/tick). Uniform so same-lane oncoming cars keep
 *  their spacing and never overlap. */
const ONCOMING_SPEED = 5.5;

/** OSM road class → the road type we render. Only the trunk road (the A28 /
 *  Thanet Way) is a dual carriageway; farm tracks go to gravel; everything else
 *  is a single-carriageway country lane. */
const CLASS_TO_ROAD: Record<string, RoadId> = {
  trunk: 'thanet-way',
  track: 'rural-track',
};
function roadIdForClass(cls: string): RoadId {
  return CLASS_TO_ROAD[cls] ?? 'country-lane';
}

/** Merge-zone length in world-px (~3–4s at cruising speed): the stretch over
 *  which a dual↔single carriageway change is drawn narrowing/opening. */
const MERGE_ZONE_LEN = 550;

/** How far either side of a fork (world-px) a turn choice counts — generous, so
 *  it's never a split-second reflex test for a young player. */
const JUNCTION_WINDOW_HALF = 220;

export interface PtvDriveInit {
  driveType?: DriveType;
  destinationId?: string;
  level?: number;
  economy?: Economy;
  weather?: string;
  returnTo?: string;
  /**
   * Handed straight back to `returnTo` when the van parks, untouched.
   *
   * Whose journey this is stays the caller's business — GameScene puts
   * the poorly animal's id in here on a vet run and reads it out at
   * the far end. The drive does not look inside.
   */
  returnData?: Record<string, unknown>;
}

/**
 * PtvDriveScene — the hybrid-camera PTV drive.
 *
 * Slice 1 (+ eyeball polish): top-down travel mode. Gentle daylight bird's-eye
 * road, van fixed near the lower third while the world scrolls past. Banked
 * snap lane changes, a vertical gear stick (R/1/2/3) with reverse, exponential
 * gear speeds, roadside scenery, and varied decorative traffic (cars,
 * tractors, trucks, pick-ups, weaving motorbikes, overtaking emergency cars).
 * No cab/events/cargo yet — those arrive in later slices.
 */
export class PtvDriveScene extends Phaser.Scene {
  private container!: Phaser.GameObjects.Container;
  /** Everything that turns at a junction (road, scenery, traffic) — rotated as
   *  one about the van, which itself only tilts. HUD + van live in `container`. */
  private worldLayer!: Phaser.GameObjects.Container;
  /** True while a junction turn animation is playing (freezes the drive loop). */
  private turning = false;
  private drive!: DriveState;
  private returnTo?: string;
  /** Opaque payload echoed back to `returnTo` on arrival. */
  private returnData: Record<string, unknown> = {};

  // Phase: pick the vehicle, the A.R.C. car park, the road, then the
  // destination's own forecourt at the far end.
  private phase: 'select' | 'parking' | 'travel' | 'arrival' = 'select';
  /** Guards the arrival so a long final tick cannot fire it twice. */
  private arriving = false;
  /** The fleet vehicle the player is driving (chosen on the select screen). */
  private vehicleId: VehicleType = 'small-van';
  /** Player level — gates which vehicles are unlocked in the picker. */
  private playerLevel = 12;

  // Render state
  private roadGfx?: Phaser.GameObjects.Graphics;
  /** One layer that draws a soft dropshadow under every vehicle each frame, so
   *  they sit right on any surface (tarmac / gravel / sand) without baked-in art
   *  shadows that halo on the wrong colour. */
  private shadowGfx?: Phaser.GameObjects.Graphics;
  private vanGfx?: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
  private traffic: TrafficCar[] = [];
  private oncoming: OncomingCar[] = [];
  private scenery: SceneryProp[] = [];
  private decor: DecorProp[] = [];
  private roadConfig: RoadConfig = ROADS['thanet-way'];
  /** Road-class runs along the route; the road type follows the map. */
  private roadProfile: RoadClassRun[] = [];
  /** World-space merge zones for smooth road-type changes (dual↔single). */
  private roadTransitions: RoadTransition[] = [];
  /** Junctions along the route — real forks (a player choice) and cosmetic bends. */
  private routeJunctions: RouteJunction[] = [];
  /** Live turn-choice prompt state at a fork. */
  private junctionPrompt?: Phaser.GameObjects.Container;
  private promptJunction?: RouteJunction;
  /** Guards the pick-and-depart transition so a double tap can't launch twice. */
  private departing = false;
  private resolvedJunctions = new Set<number>();
  /** False once Marcus manually toggles a road type — stops map auto-following. */
  private autoRoad = true;
  /** True during a road-type change so the loop doesn't re-trigger it. */
  private roadSwitching = false;
  private scrollY = 0;
  /** True while the van is out in the oncoming lane overtaking on a single
   *  carriageway. `drive.lane` still holds her own-carriageway lane throughout. */
  private overtaking = false;
  private driveTimer?: Phaser.Time.TimerEvent;
  private laneTween?: Phaser.Tweens.Tween;

  // GPS mini-map
  private destinationId = 'woodland';
  private gpsDot?: Phaser.GameObjects.Arc;
  private gpsArc = { x: 0, y: 0 };
  private gpsDest = { x: 0, y: 0 };
  private gpsGraph?: RoadGraph;
  private gpsAdj?: Adjacency;
  /** The route as panel-pixel points, with cumulative lengths for the dot. */
  private gpsRoutePts: { x: number; y: number }[] = [];
  private gpsRouteCum: number[] = [];
  private gpsRouteTotal = 0;
  private gpsManeuvers: Maneuver[] = [];
  /** Fixed-location speed cameras that this route passes, as progress points. */
  private cameraTriggers: { atProgress: number; done: boolean }[] = [];
  /** The GPS is a draggable panel; this holds it and where the player put it. */
  private gpsPanel?: Phaser.GameObjects.Container;
  private gpsOffset = { x: 0, y: 0 };
  private gpsRouteGfx?: Phaser.GameObjects.Graphics;
  private gpsInstrBg?: Phaser.GameObjects.Graphics;
  private gpsInstrText?: Phaser.GameObjects.Text;
  private gpsInstrArrow?: Phaser.GameObjects.Text;

  private vanY = 0;
  private vanW = 46;
  private vanH = 74;

  // Gear stick
  private gearKnob?: Phaser.GameObjects.Container;
  private gearSlotY: Partial<Record<string, number>> = {};

  /** Handbrake: while engaged the vehicle is held and gear changes are blocked
   *  (a reminder flashes). Off once the van pulls away; re-engages on Park. */
  private handbrakeOn = false;
  private handbrakeLamp?: Phaser.GameObjects.Arc;
  private handbrakeLabel?: Phaser.GameObjects.Text;

  private keys?: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    r: Phaser.Input.Keyboard.Key;
    space: Phaser.Input.Keyboard.Key;
    h: Phaser.Input.Keyboard.Key;
  };

  constructor() {
    super({ key: 'PtvDriveScene' });
  }

  /**
   * Self-load the top-down driving art. In the full game these keys are
   * already loaded from the asset manifest (the exists-check skips them); in
   * the isolated ?ptvDemo=1 boot there's no asset pipeline, so we fetch them
   * here. Missing files (fleet sprites still rendering) fail softly and the
   * scene falls back to the procedural draws.
   */
  preload(): void {
    const base = '/assets/driving/topdown/';
    const tryImg = (key: string, file: string) => {
      if (!this.textures.exists(key)) this.load.image(key, base + file);
    };
    tryImg('vehicle-topdown-henry', 'vehicle-topdown-henry.png');
    tryImg('site-arc-building', 'site-arc-building.png');
    tryImg('site-gravel', 'site-gravel.png');
    // The destinations' own buildings, for the arrival forecourt. Keyed
    // by destination id, so `renderArrival` finds them by name and falls
    // back to its chrome signboard for any that are not painted yet.
    for (const d of DESTINATIONS) {
      tryImg(`site-${d.id}-building`, `site-${d.id}-building.png`);
      tryImg(`site-${d.id}-place`, `site-${d.id}-place.png`);
    }
    for (const n of ['car-red', 'car-blue', 'car-yellow', 'pickup', 'truck', 'tractor', 'tractor-red', 'tractor-blue', 'motorbike', 'ambulance', 'fireengine', 'bus', 'binlorry', 'trikey', 'bea', 'big-tilly', 'spark']) {
      tryImg(`vehicle-topdown-${n}`, `vehicle-topdown-${n}.png`);
    }
    for (const n of ['empty', '1', '2', '3', '4', '5']) {
      tryImg(`vehicle-topdown-skiptruck-${n}`, `vehicle-topdown-skiptruck-${n}.png`);
    }
    // Rear ("driving away") views for the front-heavy vehicles. Missing files
    // fail softly, so this list can run ahead of the art being rendered.
    for (const n of ['henry', 'car-red', 'car-blue', 'car-yellow', 'tractor', 'tractor-red', 'tractor-blue', 'ambulance', 'fireengine', 'trikey', 'big-tilly', 'pickup', 'truck', 'bea', 'spark']) {
      tryImg(`vehicle-topdown-${n}-rear`, `vehicle-topdown-${n}-rear.png`);
    }
    for (const n of [...DECOR_KINDS, 'speed-camera']) {
      tryImg(`decor-${n}`, `decor/decor-${n}.png`);
    }
    // The Birchie vector map for the GPS mini-map (rasterised from the SVG).
    if (!this.textures.exists('gps-map')) {
      this.load.svg('gps-map', '/admin/scene-assets/birchie-map/birchie-roads.svg', { width: 640, height: 399 });
    }
    // The routable road graph (built offline from the same SVG).
    if (!this.cache.json.exists('birchie-graph')) {
      this.load.json('birchie-graph', '/assets/driving/birchie-graph.json');
    }
    this.load.on('loaderror', () => { /* tolerate not-yet-generated sprites */ });
  }

  init(data?: PtvDriveInit): void {
    this.drive = createDriveState({
      driveType: data?.driveType,
      destinationId: data?.destinationId,
      weather: data?.weather,
    });
    this.returnTo = data?.returnTo;
    this.returnData = data?.returnData ?? {};
    this.arriving = false;
    // Dev: ?ptvDemo=1&dest=<id> lets Marcus test any route/turns; else woodland.
    const urlDest = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('dest') ?? undefined
      : undefined;
    this.destinationId = data?.destinationId ?? urlDest ?? 'woodland';
    // Player level gates the vehicle picker. Demo/URL override for testing lock
    // states; default high so the whole fleet shows.
    const urlLevel = typeof window !== 'undefined'
      ? Number(new URLSearchParams(window.location.search).get('level')) : NaN;
    this.playerLevel = data?.level ?? (Number.isFinite(urlLevel) ? urlLevel : 12);
    this.vehicleId = 'small-van';
    this.phase = 'select';
    this.scrollY = 0;
    this.traffic = [];
    this.scenery = [];
    this.decor = [];
    this.roadGfx = undefined;
    this.vanGfx = undefined;
    this.laneTween = undefined;
    this.gearKnob = undefined;
    this.gearSlotY = {};
    this.gpsDot = undefined;
    this.gpsManeuvers = [];
    this.cameraTriggers = [];
    this.roadProfile = [];
    this.roadTransitions = [];
    this.routeJunctions = [];
    this.junctionPrompt = undefined;
    this.promptJunction = undefined;
    this.resolvedJunctions = new Set();
    this.turning = false;
    this.autoRoad = true;
    this.roadSwitching = false;
    this.gpsInstrText = undefined;
    this.gpsInstrArrow = undefined;
    this.gpsInstrBg = undefined;
  }

  create(): void {
    // 30 add.text calls here, none of which set a resolution, so all of
    // them rendered at 1x on a retina screen. One line beats thirty.
    useRetinaText(this);

    const audio = AudioManager.getInstance();
    audio.setScene(this);
    audio.playSceneMusic('walk'); // reuse the journey track until a PTV track lands

    this.container = this.add.container(0, 0);
    // A render error should never silently blank the whole drive — log it loudly.
    try {
      this.renderView();
    } catch (e) {
      console.error('[ptv] renderView failed', e);
    }

    this.events.on('shutdown', () => this.cleanup());
  }

  private cleanup(): void {
    if (this.driveTimer) { this.driveTimer.destroy(); this.driveTimer = undefined; }
    if (this.laneTween) { this.laneTween.stop(); this.laneTween = undefined; }
    if (this.keys) {
      for (const k of Object.values(this.keys)) {
        k.removeAllListeners();
        this.input.keyboard?.removeKey(k);
      }
      this.keys = undefined;
    }
  }

  /** Road geometry for the current road config. */
  private geo(): ReturnType<typeof roadGeometry> {
    return roadGeometry(this.scale.width, this.roadConfig);
  }

  /** Number of lanes on the player's side of the current road. */
  private pl(): number {
    return this.roadConfig.playerLanes;
  }

  private renderView(): void {
    this.cleanup();
    this.container.removeAll(true);
    // The GPS lives at the scene root, so the container clear above won't remove
    // it — tear it down explicitly (renderGps rebuilds it in the travel phase).
    this.gpsPanel?.destroy();
    this.gpsPanel = undefined;
    this.gpsDot = undefined;
    // A fresh view puts the van back in her own lane, so any overtake ends here
    // (also covers switching onto a reservation road mid-overtake).
    this.overtaking = false;
    this.shadowGfx = undefined;
    this.traffic = [];
    this.oncoming = [];
    this.scenery = [];
    this.decor = [];

    const { width, height } = this.scale;
    const geo = this.geo();
    const size = vanSizeForLane(geo.laneWidth);
    this.vanW = size.w;
    this.vanH = size.h;

    if (this.phase === 'select') {
      this.renderPicker(width, height);
    } else if (this.phase === 'parking') {
      this.renderParking(width, height);
    } else if (this.phase === 'arrival') {
      this.renderArrival(width, height);
    } else {
      this.renderTravel(width, height, geo);
    }
  }

  /** Build the van object — the painted Henry sprite if loaded, else the
   *  procedural top-down van. Both are Transform game objects, so lane tweens,
   *  banking and the handbrake judder work either way. */
  private makeVan(): Phaser.GameObjects.Image | Phaser.GameObjects.Graphics {
    // The picked fleet vehicle's sprite. Driving away on the road → its REAR view
    // (if one exists); parked in the forecourt / picker → its FRONT. Falls back
    // to Henry, then the procedural draw.
    const front = VEHICLE_SPRITE[this.vehicleId];
    const rear = `${front}-rear`;
    const key = this.phase === 'travel' && this.textures.exists(rear) ? rear : front;
    const useKey = this.textures.exists(key) ? key
      : this.textures.exists('vehicle-topdown-henry') ? 'vehicle-topdown-henry' : null;
    if (useKey) {
      const img = this.add.image(0, 0, useKey);
      img.setScale((this.vanW * VEHICLE_SIZE[this.vehicleId]) / img.width);
      return img;
    }
    const gfx = this.add.graphics();
    drawTopDownVan(gfx, this.vanW * VEHICLE_SIZE[this.vehicleId], this.vanH * VEHICLE_SIZE[this.vehicleId], 0xf3ede0);
    return gfx;
  }

  private renderTravel(width: number, height: number, geo: ReturnType<typeof roadGeometry>): void {
    // Keep the van within the player's lanes (a country lane has just one).
    this.drive.lane = Math.max(0, Math.min(this.pl() - 1, this.drive.lane));

    // The world layer holds everything that rotates as one at a junction (road,
    // scenery, traffic); the van and HUD sit above it in `container` and only
    // the van tilts. At rotation 0 this is visually identical to before.
    this.worldLayer = this.add.container(0, 0);
    this.container.add(this.worldLayer);

    // Road (redrawn every tick).
    this.roadGfx = this.add.graphics();
    this.worldLayer.add(this.roadGfx);

    // Vehicle dropshadows — one layer, redrawn each frame, below the vehicles
    // (depth 13) but above the road, so shadows track every vehicle on any
    // surface without any baked-in art shadow.
    this.shadowGfx = this.add.graphics().setDepth(13);
    this.worldLayer.add(this.shadowGfx);

    this.spawnScenery(width, height);
    this.spawnDecor(width, height);
    this.spawnInitialTraffic(width, height);
    this.spawnOncoming(width, height);

    // The van — fixed near the lower third, pointing up.
    this.vanY = height * 0.72;
    this.vanGfx = this.makeVan();
    this.vanGfx.setPosition(laneCentreX(geo, this.drive.lane), this.vanY);
    this.vanGfx.setDepth(20);
    this.container.add(this.vanGfx);

    this.renderHud(width, height);
    this.renderGps(width, height);
    this.setupInput(width, height);
    this.startDriveLoop();

    drawRoadForConfig(this.roadGfx, width, height, this.scrollY, geo, this.roadConfig);
  }

  /**
   * GPS mini-map (Slice 1): the Birchie vector map in a corner panel, with
   * A.R.C. and the destination pinned, a straight route line between them, and
   * a position dot that advances with `drive.progress`. Real routing +
   * turn-by-turn come in later slices. Positions come from birchie-places.ts
   * (provisional — see that file).
   */
  private renderGps(width: number, height: number): void {
    const pw = 176, ph = 122;
    const px = 12, py = 60; // panel-local origin (below the Back button)
    // The whole GPS lives in one container built in panel-local coordinates, so
    // it can be dragged around the screen as a single unit. `gpsOffset` is where
    // the player last dropped it (0,0 = the default top-left home). It sits at
    // the SCENE root (not inside this.container) at a high depth, so it wins the
    // pointer over the full-width lane-tap zones for dragging.
    this.gpsPanel?.destroy();
    const gps = this.add.container(this.gpsOffset.x, this.gpsOffset.y).setDepth(60);
    this.gpsPanel = gps;

    const panel = this.add.graphics().setDepth(46);
    panel.fillStyle(0x2a2a2a, 0.9);
    panel.fillRoundedRect(px - 5, py - 20, pw + 10, ph + 44, 10);
    panel.fillStyle(0x9cc0d6, 1); // sea backdrop behind the map
    panel.fillRoundedRect(px, py, pw, ph, 6);
    gps.add(panel);
    gps.add(
      this.add.text(px + pw / 2, py - 11, 'GPS  ⠿', {
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.title, fontStyle: 'bold', color: '#ffffff',
      }).setOrigin(0.5).setDepth(48)
    );

    // The map, contained inside the panel.
    let mapLeft = px, mapTop = py, dispW = pw, dispH = ph;
    if (this.textures.exists('gps-map')) {
      const img = this.add.image(0, 0, 'gps-map').setDepth(46);
      const s = Math.min(pw / img.width, ph / img.height);
      dispW = img.width * s; dispH = img.height * s;
      mapLeft = px + (pw - dispW) / 2; mapTop = py + (ph - dispH) / 2;
      img.setScale(s).setPosition(mapLeft + dispW / 2, mapTop + dispH / 2);
      gps.add(img);
    }
    const toPanel = (p: { fx: number; fy: number }) => ({ x: mapLeft + p.fx * dispW, y: mapTop + p.fy * dispH });
    this.gpsArc = toPanel(ARC_PLACE);
    this.gpsDest = toPanel(placeFor(this.destinationId));

    // Road-following route A.R.C. → destination (Dijkstra on the road graph,
    // straight-line fallback if the network can't connect).
    this.ensureGraph();
    const polyFrac: RoutePoint[] = this.gpsGraph && this.gpsAdj
      ? routePolyline(this.gpsGraph, this.gpsAdj, ARC_PLACE, placeFor(this.destinationId))
      : [ARC_PLACE, placeFor(this.destinationId)];
    this.gpsRoutePts = polyFrac.map(toPanel);
    this.gpsRouteCum = [0];
    for (let i = 1; i < this.gpsRoutePts.length; i++) {
      const a = this.gpsRoutePts[i - 1], b = this.gpsRoutePts[i];
      this.gpsRouteCum.push(this.gpsRouteCum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
    }
    this.gpsRouteTotal = this.gpsRouteCum[this.gpsRouteCum.length - 1] || 1;
    this.gpsManeuvers = buildManeuvers(polyFrac);
    // Fixed speed cameras this route actually passes near (within ~5% of the
    // map), placed at the progress where the route passes them.
    this.cameraTriggers = CAMERA_PLACES
      .map((c) => projectToRoute(polyFrac, c.fx, c.fy))
      .filter((p) => p.dist < 0.06 && p.atProgress > 0.03 && p.atProgress < 0.97)
      .map((p) => ({ atProgress: p.atProgress, done: false }));

    // Route line: drawn each tick so the stretch already driven can fade back
    // (see redrawGpsRoute). Held on the scene so the loop can refresh it.
    this.gpsRouteGfx = this.add.graphics().setDepth(47);
    gps.add(this.gpsRouteGfx);

    // Pins + moving position dot. The dot is deliberately bold — a white halo
    // ring under a bright amber core — so it reads at this small size.
    gps.add(this.add.circle(this.gpsDest.x, this.gpsDest.y, 6, 0xa82020).setStrokeStyle(2, 0xffffff).setDepth(48));
    gps.add(this.add.circle(this.gpsArc.x, this.gpsArc.y, 5, 0x2e6b8a).setStrokeStyle(2, 0xffffff).setDepth(48));
    gps.add(this.add.circle(this.gpsArc.x, this.gpsArc.y, 9, 0xffffff, 0.9).setDepth(48));
    this.gpsDot = this.add.circle(this.gpsArc.x, this.gpsArc.y, 6, 0xffd54a).setStrokeStyle(2.5, 0x3a2e22).setDepth(49);
    gps.add(this.gpsDot);
    this.redrawGpsRoute(0);

    const label = this.destinationId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    gps.add(
      this.add.text(px + pw / 2, py + ph + 5, `→ ${label}`, {
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body, color: '#ffffff',
      }).setOrigin(0.5, 0).setDepth(48)
    );

    // Turn-by-turn instruction banner, just below the GPS panel.
    const by = py + ph + 26, bh = 40;
    this.gpsInstrBg = this.add.graphics().setDepth(47);
    this.gpsInstrBg.fillStyle(0x3d8a2e, 0.95);
    this.gpsInstrBg.fillRoundedRect(px - 5, by, pw + 10, bh, 9);
    gps.add(this.gpsInstrBg);
    this.gpsInstrArrow = this.add.text(px + 12, by + bh / 2, '▲', {
      fontSize: '24px', fontFamily: FONTS.title, fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5).setDepth(48);
    gps.add(this.gpsInstrArrow);
    this.gpsInstrText = this.add.text(px + 30, by + bh / 2, 'Off we go!', {
      fontSize: TYPE.caption, fontFamily: FONTS.title, fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0, 0.5).setDepth(48);
    gps.add(this.gpsInstrText);
    this.updateGpsInstruction();

    // Drag anywhere on the panel/banner to reposition; clamp so it can't be
    // dragged off-screen and lost.
    const hit = new Phaser.Geom.Rectangle(px - 5, py - 20, pw + 10, ph + 68);
    gps.setInteractive(hit, Phaser.Geom.Rectangle.Contains);
    this.input.setDraggable(gps);
    gps.on('drag', (_p: Phaser.Input.Pointer, dragX: number, dragY: number) => {
      const nx = Phaser.Math.Clamp(dragX, -px - 5, width - pw - px - 20);
      const ny = Phaser.Math.Clamp(dragY, -py + 24, height - py - ph - 70);
      gps.setPosition(nx, ny);
      this.gpsOffset = { x: nx, y: ny };
    });
  }

  /** Redraw the GPS route so the stretch already driven fades to grey and the
   *  road still ahead stays bright green — a clear at-a-glance progress bar. */
  private redrawGpsRoute(progress: number): void {
    const g = this.gpsRouteGfx;
    const pts = this.gpsRoutePts;
    if (!g || pts.length < 2) return;
    g.clear();
    // Faded "already driven" underlay: the whole route in muted grey.
    g.lineStyle(3.5, 0x9aa6a0, 0.65);
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.strokePath();
    // Bright "still to go" overlay: from the dot to the destination.
    const here = this.routePointAt(progress);
    const target = Math.max(0, Math.min(1, progress)) * this.gpsRouteTotal;
    let seg = 1;
    while (seg < pts.length && this.gpsRouteCum[seg] < target) seg++;
    g.lineStyle(4, 0x2fbf3a, 1);
    g.beginPath();
    g.moveTo(here.x, here.y);
    for (let i = seg; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.strokePath();
  }

  /** Refresh the GPS turn banner from the current progress: the next turn (or
   *  arrival), with a "soon / now" cue as we close on it. */
  private updateGpsInstruction(): void {
    if (!this.gpsInstrText || !this.gpsInstrArrow || !this.gpsInstrBg) return;
    const m = nextManeuver(this.gpsManeuvers, this.drive.progress);
    if (!m) { this.gpsInstrText.setText('Keep going'); this.gpsInstrArrow.setText('▲'); return; }
    const gap = m.atProgress - this.drive.progress;
    let text = maneuverText(m);
    let urgent = false;
    if (m.kind === 'turn') {
      if (gap <= 0.05) { text += ' now!'; urgent = true; }
      else if (gap <= 0.14) { text += ' soon'; }
    }
    this.gpsInstrArrow.setText(maneuverArrow(m));
    this.gpsInstrText.setText(text);
    // Amber flash when a turn is imminent, ARC green otherwise.
    this.gpsInstrBg.clear();
    this.gpsInstrBg.fillStyle(urgent ? 0xd4783c : 0x3d8a2e, 0.95);
    this.gpsInstrBg.fillRoundedRect(7, 208, 186, 40, 9); // matches renderGps banner box
  }

  /** Point (panel px) at fraction `p` (0..1) along the GPS route polyline. */
  private routePointAt(p: number): { x: number; y: number } {
    const pts = this.gpsRoutePts;
    if (pts.length === 0) return this.gpsArc;
    if (pts.length === 1) return pts[0];
    const target = Math.max(0, Math.min(1, p)) * this.gpsRouteTotal;
    let i = 1;
    while (i < this.gpsRouteCum.length && this.gpsRouteCum[i] < target) i++;
    if (i >= pts.length) return pts[pts.length - 1];
    const segStart = this.gpsRouteCum[i - 1];
    const segLen = (this.gpsRouteCum[i] - segStart) || 1;
    const f = (target - segStart) / segLen;
    const a = pts[i - 1], b = pts[i];
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  }

  // ── Vehicle picker ─────────────────────────────────────────

  /** The pre-drive screen: choose the destination (shown) and pick a fleet
   *  vehicle. Locked vehicles (unlockLevel > playerLevel) are dimmed. */
  /**
   * The single pre-drive screen: the A.R.C. building above a car park whose bays
   * are sized to each vehicle. Every fleet vehicle sits parked in its bay; the
   * ones above the player's level are coned off with an "L10" unlock label.
   * Clicking an available vehicle picks it and pulls straight out for the drive.
   */
  private renderPicker(width: number, height: number): void {
    this.departing = false;

    // Gravel forecourt.
    if (this.textures.exists('site-gravel')) {
      this.container.add(this.add.tileSprite(0, 0, width, height, 'site-gravel').setOrigin(0));
    } else {
      this.container.add(this.add.rectangle(width / 2, height / 2, width, height, 0xcbb79a));
    }
    // The screen's heading, on the chrome surface at the one title line —
    // this was a `backgroundColor` text block floating at `height * 0.505`,
    // which is a cream plate drawn by Phaser's text renderer instead of
    // `createChromeTitle`, and it put the screen's only words on the
    // midline while the top half sat empty. The two facts it carries are
    // the two lines the component already has.
    const destName = this.destinationId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const title = createChromeTitle(this, width / 2, TITLE_CY, 'Pick your vehicle', {
      fontSize: TYPE.lead,
      subtitle: `off to ${destName}`,
    });
    this.container.add(title);

    // Car park: bays sized in proportion to each vehicle (Trikey narrow, Big
    // Tilly wide — the forecourt has different-sized spaces for exactly this).
    const defs = Object.values(VEHICLE_DEFS);
    const weights = defs.map((v) => VEHICLE_SIZE[v.id]);
    const wsum = weights.reduce((a, b) => a + b, 0);
    const bayTop = height * 0.57;
    const bayH = height * 0.28;

    // A.R.C. building at the back of its own forecourt, filling the band
    // between the title and the bays rather than a bare `0.46` of the
    // viewport — which on a landscape phone drew it at 185px in the middle
    // of an empty gravel field, and on a desktop at nearly half the screen.
    //
    // Its base runs *under* the tarmac: the slab is added after this, so it
    // crops the building's own ground line, which is what the far edge of a
    // car park does to the building behind it. That is what buys the height
    // back — stacked strictly above the bays it would have measured 141px,
    // smaller than the number this replaced.
    if (this.textures.exists('site-arc-building')) {
      const top = contentTopFor(title);
      const base = bayTop + bayH * 0.3;
      const target = Math.max(0, Math.min(base - top, width * 0.46));
      const b = this.add.image(width / 2, base - target / 2, 'site-arc-building').setOrigin(0.5);
      b.setDisplaySize(target, target);
      this.container.add(b);
    }
    const areaW = Math.min(width * 0.92, 1080);
    const left = (width - areaW) / 2;

    const slab = this.add.graphics();
    slab.fillStyle(0x39383a, 1);
    slab.fillRoundedRect(left - 8, bayTop - 8, areaW + 16, bayH + 16, 12);
    this.container.add(slab);

    // Exit road along the bottom.
    const roadY = height * 0.93;
    const road = this.add.graphics();
    road.fillStyle(0x6b6f76, 1);
    road.fillRect(0, roadY, width, height - roadY);
    road.fillStyle(0xfdf6e3, 0.9);
    for (let rx = 10; rx < width; rx += 54) road.fillRect(rx, roadY + (height - roadY) / 2 - 2, 30, 4);
    this.container.add(road);

    let x = left;
    defs.forEach((v, i) => {
      const bw = areaW * (weights[i] / wsum);
      const cx = x + bw / 2;
      const cy = bayTop + bayH * 0.44;
      const locked = v.unlockLevel > this.playerLevel;

      if (i > 0) {
        const d = this.add.graphics();
        d.fillStyle(0xf2ead6, 0.85);
        d.fillRect(x - 2, bayTop + 8, 4, bayH - 16);
        this.container.add(d);
      }

      const key = VEHICLE_SPRITE[v.id];
      let img: Phaser.GameObjects.Image | undefined;
      if (this.textures.exists(key)) {
        img = this.add.image(cx, cy, key);
        const targetW = Math.min(bw * 0.72, bayH * 0.62 * (img.width / img.height));
        img.setScale(targetW / img.width);
        img.setAngle(VEHICLE_PARK_ANGLE[v.id]);
        img.setDepth(20);
        if (locked) img.setTint(0x707070);
        this.container.add(img);
      }

      this.container.add(
        this.add.text(cx, bayTop + bayH - 9, v.name, {
          fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.title, fontStyle: 'bold', color: '#e8dcc8',
        }).setOrigin(0.5)
      );

      if (locked) {
        // Coned off, with the unlock level called out.
        const coneY = bayTop + bayH + 20;
        if (this.textures.exists('decor-cone')) {
          this.container.add(this.add.image(cx, coneY, 'decor-cone').setDisplaySize(26, 34).setDepth(22));
        } else {
          const cone = this.add.graphics().setDepth(22);
          cone.fillStyle(0xe8712c, 1); cone.fillTriangle(cx - 11, coneY + 14, cx + 11, coneY + 14, cx, coneY - 14);
          cone.fillStyle(0xffffff, 0.85); cone.fillRect(cx - 7, coneY + 1, 14, 4);
          this.container.add(cone);
        }
        // The unlock chip used to sit just above the cone, 7px below the
        // vehicle name — close enough that the two labels overlapped and
        // "Big Tilly" read as "B____ly". Moved to the top of the bay, where
        // there is nothing but slab above the roof of a greyed-out van.
        //
        // On the chrome plate, not a `backgroundColor` block: this floats
        // above the world telling the child when the van opens, so it is
        // chrome, and a darker-than-the-slab block was the only surface in
        // the game arguing otherwise.
        const chipLabel = this.add.text(cx, bayTop + 12, `L${v.unlockLevel}`, {
          fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.title, fontStyle: 'bold',
          color: CHROME.ink, resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5).setDepth(23);
        this.container.add(
          createChromePlate(
            this, cx, bayTop + 12,
            chipLabel.width + SPACE.m, chipLabel.height + SPACE.s,
          ).setDepth(22)
        );
        this.container.add(chipLabel);
      } else if (img) {
        const hit = this.add.rectangle(cx, bayTop + bayH / 2, bw - 6, bayH, 0xffffff, 0)
          .setInteractive({ useHandCursor: true }).setDepth(30);
        const vimg = img;
        hit.on('pointerover', () => vimg.setTint(0xfff2c8));
        hit.on('pointerout', () => vimg.clearTint());
        hit.on('pointerdown', () => this.pickAndDepart(v.id, vimg, cy, roadY));
        this.container.add(hit);
      }
      x += bw;
    });

    this.container.add(
      createChromeButton(this, SAFE_MARGIN, SAFE_MARGIN, 'Back', () => this.exit(), { width: 88, anchor: { x: 'left', y: 'top' } }).setDepth(45)
    );
  }

  /** Pick a vehicle and pull it out of its bay toward the exit road, then offer
   *  the left/right turn onto the road (existing departure flow). */
  private pickAndDepart(id: VehicleType, img: Phaser.GameObjects.Image, cy: number, roadY: number): void {
    if (this.departing) return;
    this.departing = true;
    this.vehicleId = id;
    AudioManager.getInstance().playSfx('button_click');
    img.clearTint();
    img.setDepth(30);
    this.vanGfx = img;
    this.vanY = cy;
    const { width, height } = this.scale;
    this.tweens.add({
      targets: img, y: roadY - 6, duration: 700, ease: 'Sine.easeInOut',
      onComplete: () => this.showTurnChoice(width, height),
    });
  }

  private renderSelect(width: number, height: number): void {
    if (this.textures.exists('site-gravel')) {
      this.container.add(this.add.tileSprite(0, 0, width, height, 'site-gravel').setOrigin(0));
    } else {
      this.container.add(this.add.rectangle(width / 2, height / 2, width, height, 0xcbb79a));
    }

    this.container.add(
      this.add.text(width / 2, height * 0.08, 'Time for a drive!', {
        fontSize: TYPE.heading, fontFamily: FONTS.title, fontStyle: 'bold', color: COLOURS.text,
        backgroundColor: 'rgba(255,249,239,0.8)', padding: { x: 14, y: 6 },
      }).setOrigin(0.5)
    );

    // Where are we going? — a simple destination strip.
    const destName = this.destinationId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const dpW = Math.min(width * 0.7, 560), dpX = (width - dpW) / 2, dpY = height * 0.16, dpH = 52;
    const dp = this.add.graphics();
    dp.fillStyle(0x4a3f2e, 0.92); dp.fillRoundedRect(dpX, dpY, dpW, dpH, 12);
    this.container.add(dp);
    this.container.add(
      this.add.text(dpX + 18, dpY + dpH / 2, `Off to ${destName}`, {
        fontSize: TYPE.body, fontFamily: FONTS.title, fontStyle: 'bold', color: '#fff5e8',
      }).setOrigin(0, 0.5)
    );

    this.container.add(
      this.add.text(width / 2, height * 0.31, 'Which vehicle?', {
        fontSize: TYPE.lead, fontFamily: FONTS.title, fontStyle: 'bold', color: COLOURS.text,
      }).setOrigin(0.5)
    );

    // Vehicle cards, one row.
    const defs = Object.values(VEHICLE_DEFS);
    const n = defs.length;
    const gap = 14;
    const areaW = Math.min(width * 0.94, 1100);
    const cardW = Math.min(200, (areaW - gap * (n - 1)) / n);
    const cardH = height * 0.42;
    const rowW = cardW * n + gap * (n - 1);
    const startX = (width - rowW) / 2, cardY = height * 0.36;
    defs.forEach((v, i) => {
      this.container.add(this.makeVehicleCard(v, startX + i * (cardW + gap), cardY, cardW, cardH));
    });

    this.container.add(
      createChromeButton(this, width / 2, height * 0.88, "Let's go!", () => {
        AudioManager.getInstance().playSfx('button_click');
        this.phase = 'parking';
        this.renderView();
      }, { width: 190, variant: 'filled' }).setDepth(45)
    );
    this.container.add(
      createChromeButton(this, SAFE_MARGIN, SAFE_MARGIN, 'Back', () => this.exit(), { width: 88, anchor: { x: 'left', y: 'top' } }).setDepth(45)
    );
  }

  /** One vehicle card in the picker (top-left origin at x,y). */
  private makeVehicleCard(v: VehicleDef, x: number, y: number, w: number, h: number): Phaser.GameObjects.Container {
    const locked = v.unlockLevel > this.playerLevel;
    const selected = v.id === this.vehicleId;
    const card = this.add.container(x, y);

    const bg = this.add.graphics();
    bg.fillStyle(selected ? 0xfff2e0 : 0xfbf6ec, 1);
    bg.fillRoundedRect(0, 0, w, h, 12);
    bg.lineStyle(selected ? 4 : 2, selected ? 0xd9534f : 0xcbbfa6, 1);
    bg.strokeRoundedRect(0, 0, w, h, 12);
    card.add(bg);

    const key = VEHICLE_SPRITE[v.id];
    if (this.textures.exists(key)) {
      const img = this.add.image(w / 2, h * 0.36, key);
      // Scale by WIDTH proportional to real size (Henry = 1.0), so Trikey reads
      // tiny and the bigger vehicles are visibly wider — never narrower than
      // Henry. Cap the height so a long body mostly fits, but a "large" vehicle
      // (size >= Henry) is floored at Henry's width even if it then runs tall.
      const henryW = w * 0.52;
      let scale = (henryW * VEHICLE_SIZE[v.id]) / img.width;
      const maxH = h * 0.58;
      if (img.height * scale > maxH) scale = maxH / img.height;
      if (VEHICLE_SIZE[v.id] >= 1) scale = Math.max(scale, henryW / img.width);
      img.setScale(scale);
      card.add(img);
    }

    card.add(
      this.add.text(w / 2, h * 0.7, v.name, {
        fontSize: TYPE.caption, fontFamily: FONTS.title, fontStyle: 'bold', color: COLOURS.text,
      }).setOrigin(0.5)
    );
    card.add(
      this.add.text(w / 2, h * 0.82, `Slots ${v.slots}    Fuel ${v.fuelCost}    L${v.unlockLevel}+`, {
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body, color: '#6a6152',
      }).setOrigin(0.5)
    );

    if (selected) {
      card.add(
        this.add.text(w - 8, 8, 'Selected!', {
          fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.title, fontStyle: 'bold', color: '#ffffff',
          backgroundColor: '#d9534f', padding: { x: 6, y: 3 },
        }).setOrigin(1, 0)
      );
    }

    if (locked) {
      const ov = this.add.graphics();
      ov.fillStyle(0x2a2a2a, 0.5); ov.fillRoundedRect(0, 0, w, h, 12);
      card.add(ov);
      card.add(
        this.add.text(w / 2, h / 2, `Unlocks\nL${v.unlockLevel}`, {
          fontSize: TYPE.caption, fontFamily: FONTS.title, fontStyle: 'bold', color: '#ffffff', align: 'center',
        }).setOrigin(0.5)
      );
    } else {
      card.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
      card.on('pointerdown', () => {
        if (this.vehicleId === v.id) return;
        this.vehicleId = v.id;
        AudioManager.getInstance().playSfx('button_click');
        this.renderView();
      });
    }
    return card;
  }

  // ── Parking-lot start ──────────────────────────────────────

  /**
   * The drive opens on the A.R.C. gravel forecourt: the top of the Art Deco
   * building sits behind (above), the chosen vehicle is in its labelled bay, and
   * the player pulls out and turns left or right onto the road. Then it hands off
   * to travel mode.
   */
  private renderParking(width: number, height: number): void {
    // Gravel forecourt (tiled).
    if (this.textures.exists('site-gravel')) {
      this.container.add(this.add.tileSprite(0, 0, width, height, 'site-gravel').setOrigin(0));
    } else {
      this.container.add(this.add.rectangle(width / 2, height / 2, width, height, 0xcbb79a));
    }

    // The A.R.C. building across the top — a hint of the top behind the car park.
    if (this.textures.exists('site-arc-building')) {
      const b = this.add.image(width / 2, 6, 'site-arc-building').setOrigin(0.5, 0);
      // Aspect-preserving. `setDisplaySize(target, target)` was harmless
      // while the art happened to be a 768 square; the building has since
      // been cropped to its own content (693x683, like the five new
      // destinations) and a forced square now squashes it.
      const s = Math.min((width * 0.5) / b.width, (height * 0.52) / b.height);
      b.setScale(s);
      this.container.add(b);
    } else {
      const sign = this.add.text(width / 2, height * 0.16, 'A.R.C.', {
        fontSize: '40px', fontFamily: FONTS.title, fontStyle: 'bold', color: COLOURS.primary,
      }).setOrigin(0.5);
      this.container.add(sign);
    }

    // Parking bays (dark tarmac with white line dividers), like the site map.
    const bayTop = height * 0.60;
    const bayH = height * 0.20;
    const bayCount = 4;
    const bayAreaW = Math.min(width * 0.62, 520);
    const bayLeft = (width - bayAreaW) / 2;
    const bayW = bayAreaW / bayCount;
    const bays = this.add.graphics();
    bays.fillStyle(0x39383a, 1);
    bays.fillRoundedRect(bayLeft, bayTop, bayAreaW, bayH, 10);
    bays.fillStyle(0xf2ead6, 0.85);
    for (let i = 1; i < bayCount; i++) {
      bays.fillRect(bayLeft + bayW * i - 2, bayTop + 8, 4, bayH - 16);
    }
    this.container.add(bays);

    // The chosen vehicle's bay label.
    const henryBay = 1; // second bay from the left
    const henryX = bayLeft + bayW * (henryBay + 0.5);
    this.container.add(
      this.add.text(henryX, bayTop + bayH - 12, VEHICLE_DEFS[this.vehicleId].name, {
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.title, color: '#e8dcc8',
      }).setOrigin(0.5)
    );

    // The exit road along the bottom (runs left–right).
    const roadY = height * 0.88;
    const road = this.add.graphics();
    road.fillStyle(0x6b6f76, 1);
    road.fillRect(0, roadY, width, height - roadY);
    road.fillStyle(0xfdf6e3, 0.9);
    for (let x = 10; x < width; x += 54) {
      road.fillRect(x, roadY + (height - roadY) / 2 - 2, 30, 4);
    }
    this.container.add(road);

    // Henry, parked nose-down toward the exit. Scaled up to fill his bay so he
    // reads clearly (the on-road size is much smaller).
    this.vanY = bayTop + bayH * 0.42;
    this.vanGfx = this.makeVan();
    // Sized proportionately in the bay too — Trikey sits small, Big Tilly fills it.
    const parkImg = this.vanGfx as Phaser.GameObjects.Image;
    if (parkImg.width) parkImg.setScale((bayW * 0.6 * VEHICLE_SIZE[this.vehicleId]) / parkImg.width);
    this.vanGfx.setPosition(henryX, this.vanY);
    this.vanGfx.setAngle(VEHICLE_PARK_ANGLE[this.vehicleId]); // nose toward the forecourt exit
    this.vanGfx.setDepth(20);
    this.container.add(this.vanGfx);

    // Title + "Let's go!" prompt.
    this.container.add(
      this.add.text(width / 2, height * 0.55, 'Time for a drive!', {
        fontSize: TYPE.lead, fontFamily: FONTS.title, fontStyle: 'bold', color: COLOURS.text,
        backgroundColor: 'rgba(255,249,239,0.7)', padding: { x: 12, y: 4 },
      }).setOrigin(0.5).setDepth(45)
    );
    const go = createChromeButton(this, width / 2, roadY - 34, "Let's go!", () => this.pullOutOfBay(width, height, roadY), {
      width: 180, variant: 'filled',
    }).setDepth(45);
    this.container.add(go);

    this.container.add(
      createChromeButton(this, SAFE_MARGIN, SAFE_MARGIN, 'Back', () => this.exit(), { width: 88, anchor: { x: 'left', y: 'top' } }).setDepth(45)
    );
  }

  // ── Arrival ────────────────────────────────────────────────

  /**
   * The far end of the journey: the destination's own forecourt.
   *
   * **This is the mirror of `renderParking`, and deliberately so.** A
   * drive that ends by cutting to the vet's waiting room is a drive
   * that ends in a jump; a child should see the van come off the road,
   * swing into a bay and stop in front of the building, and only then
   * find out what is inside. The departure already draws that grammar
   * — building across the top, bays across the middle, road along the
   * bottom — so the arrival plays it backwards rather than inventing a
   * second visual language for the same car park.
   *
   * Only A.R.C. has a painted building. Every other destination falls
   * back to a chrome plate carrying its emoji and name, standing where
   * the building goes — the same fallback the departure has always had
   * for a missing `site-arc-building`. So the arrival works today and
   * gets better as each forecourt is painted. **That is the art ask
   * this leaves behind: one building per destination.**
   */
  private renderArrival(width: number, height: number): void {
    const dest = getDestination(this.destinationId);
    const name = dest?.label
      ?? this.destinationId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    // Gravel forecourt (tiled) — same ground as home.
    if (this.textures.exists('site-gravel')) {
      this.container.add(this.add.tileSprite(0, 0, width, height, 'site-gravel').setOrigin(0));
    } else {
      this.container.add(this.add.rectangle(width / 2, height / 2, width, height, 0xcbb79a));
    }

    // ── The stack ─────────────────────────────────────────
    //
    // Laid out from the road upward rather than on fractions of the
    // height, because the pieces have to clear each other on a 402pt
    // screen and fractions do not know how tall a van is. The first
    // pass put "Go inside" at 0.68 and the bays at 0.58–0.78, so the
    // button printed across the bay the van had just parked in — the
    // same class of collision the composition pass spent its time on
    // everywhere else in the game.
    //
    // Bottom up: road, then the control above it, then the bays with
    // the van in them, then the message, then the building.
    const roadH = height * 0.12;
    const roadY = height - roadH;
    const goCy = roadY - 34;                 // where the departure puts "Let's go!"
    const bayH = Math.min(64, height * 0.17);
    const bayTop = goCy - 26 - 12 - bayH;    // button half-height, then a gap
    // **The message goes at the top, not above the bays.**
    //
    // Sat just over the car park it printed across the building's ground
    // floor — the door, the shopfront, the hand-painted name board: the
    // half of each elevation that says which place this is. Every
    // building carries its own sign, so the one thing the message must
    // not cover is the sign.
    const msgCy = SAFE_MARGIN + 12;

    // The building across the top, in the room the message leaves it.
    // Two kinds of far end, two key patterns. A place you go *into* is a
    // `-building` — a front elevation you park in front of. A place you
    // release an animal *to* is a `-place`: a vignette of the habitat
    // itself, because a moor has no front door. Marcus's call, 2026-09-04.
    const key = [
      `site-${this.destinationId}-place`,
      `site-${this.destinationId}-building`,
    ].find((k) => this.textures.exists(k));
    const topRoom = msgCy + 22;   // the building starts below the message
    if (key) {
      // **Drawn big, with its base behind the tarmac.**
      //
      // The drive picker settled this grammar already: a building that
      // fills the band down to the bays, with the car park drawing
      // *after* it so the slab crops its ground line. Fitted strictly
      // above the message instead, it measured 158px on a 874-wide
      // screen — a doll's house in an acre of gravel — for the same
      // reason the picker's building did before it was allowed to run
      // under its own forecourt.
      //
      // And **aspect-preserving**, which the first pass was not:
      // `setDisplaySize(target, target)` on art that is 746x700 squashes
      // it 6%. Invisible on one building and obvious across five.
      const b = this.add.image(width / 2, topRoom, key).setOrigin(0.5, 0);
      const boxH = bayTop + bayH * 0.45 - topRoom;
      const boxW = width * 0.55;
      b.setScale(Math.min(boxW / b.width, boxH / b.height));
      this.container.add(b);
    } else {
      // Not a placeholder box: a signboard is a real thing to find at
      // the end of a lane, so an unpainted destination reads as a
      // place with a sign rather than as missing art.
      const plateH = Math.min(96, bayTop - topRoom - 24);
      const plateCy = topRoom + plateH / 2 + 8;
      this.container.add(createChromePlate(this, width / 2, plateCy, Math.min(width * 0.6, 320), plateH));
      this.container.add(
        this.add.text(width / 2, plateCy - plateH * 0.22, dest?.emoji ?? '📍', {
          fontSize: '28px', fontFamily: FONTS.body,
        }).setOrigin(0.5)
      );
      this.container.add(
        this.add.text(width / 2, plateCy + plateH * 0.22, name, {
          fontSize: TYPE.lead, fontFamily: FONTS.title, fontStyle: 'bold', color: CHROME.ink,
          resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5)
      );
    }

    // Visitor bays, and the road she comes in off along the bottom —
    // the departure's geometry, because it is the same kind of place.
    //
    // Except at a habitat, which is not. Painting four white-lined
    // parking bays across a moor says "retail park", so the wild
    // destinations get a plain pull-in on the verge instead: same
    // geometry, same place for the van, no tarmac.
    const wild = dest?.arrival === 'rewilding';
    const bayCount = 4;
    const bayAreaW = Math.min(width * 0.62, 520);
    const bayLeft = (width - bayAreaW) / 2;
    const bayW = bayAreaW / bayCount;
    const bays = this.add.graphics();
    if (wild) {
      // A worn chalk pull-in: a paler patch of ground, no markings.
      bays.fillStyle(0xd8cdb2, 0.85);
      bays.fillRoundedRect(bayLeft, bayTop, bayAreaW, bayH, bayH / 2);
    } else {
      bays.fillStyle(0x39383a, 1);
      bays.fillRoundedRect(bayLeft, bayTop, bayAreaW, bayH, 10);
      bays.fillStyle(0xf2ead6, 0.85);
      for (let i = 1; i < bayCount; i++) {
        bays.fillRect(bayLeft + bayW * i - 2, bayTop + 8, 4, bayH - 16);
      }
    }
    this.container.add(bays);

    const road = this.add.graphics();
    road.fillStyle(0x6b6f76, 1);
    road.fillRect(0, roadY, width, roadH);
    road.fillStyle(0xfdf6e3, 0.9);
    for (let x = 10; x < width; x += 54) {
      road.fillRect(x, roadY + roadH / 2 - 2, 30, 4);
    }
    this.container.add(road);

    // The van comes in from the road, nose first, and swings into the
    // second bay.
    //
    // Sized to the bay's *height*, not its width. The departure scales
    // by width (0.6 of the bay) because its bay is a fifth of the
    // screen; here the band is 64pt and a width-scaled van stood a
    // third taller than the space it had parked in, which is what put
    // it under the message above and the button below.
    const bayIndex = 1;
    const bayX = bayLeft + bayW * (bayIndex + 0.5);
    const van = this.makeVan();
    const img = van as Phaser.GameObjects.Image;
    if (img.width && img.height) {
      const byW = (bayW * 0.6 * VEHICLE_SIZE[this.vehicleId]) / img.width;
      const byH = (bayH * 0.86 * VEHICLE_SIZE[this.vehicleId] / VEHICLE_SIZE_MAX) / img.height;
      img.setScale(Math.min(byW, byH));
    }
    van.setPosition(width + this.vanW * 2, roadY + roadH / 2);
    van.setAngle(-90); // nose pointing the way she is travelling: right to left
    van.setDepth(20);
    this.container.add(van);
    this.vanGfx = van;

    // A message in the middle of the scene is translucent —
    // `CHROME.fillAlphaOverArt`, the same rule the room messages
    // follow, and 0.84 is a contrast limit rather than a taste.
    const title = this.add.text(width / 2, msgCy, `We've arrived at ${name}!`, {
      fontSize: TYPE.lead, fontFamily: FONTS.title, fontStyle: 'bold', color: CHROME.ink,
      backgroundColor: `rgba(255,249,239,${CHROME.fillAlphaOverArt})`, padding: { x: 12, y: 4 },
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5).setDepth(45).setAlpha(0);
    this.container.add(title);

    // Roll in along the road, then turn up into the bay and stop.
    this.tweens.add({
      targets: van,
      x: bayX,
      duration: 900,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: van,
          angle: 180, // nose to the building, tail to the road
          y: bayTop + bayH / 2,
          duration: 700,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            AudioManager.getInstance().playSfx('button_click');
            this.tweens.add({ targets: title, alpha: 1, duration: 260 });
            this.showArrivalPrompt(width, roadY);
          },
        });
      },
    });
  }

  /**
   * The one control on the arrival: go inside.
   *
   * Deliberately not automatic. The van parking is a beat worth
   * letting a child watch end, and the tap is what turns "the drive
   * finished" into "I have arrived somewhere and I am going in".
   *
   * At `roadY - 34`, which is where the departure puts "Let's go!" —
   * the strip between the bays and the road, so the button sits below
   * the parked van rather than on top of it. Placed at 0.68 of the
   * height first, which is *inside* the bays: the van reversed into a
   * space and the label for going in was printed across it.
   *
   * The destination's name is on the building's sign and in the
   * message above; a third copy under the button was the same three
   * words three times on one screen.
   */
  private showArrivalPrompt(width: number, roadY: number): void {
    const go = createChromeButton(this, width / 2, roadY - 34, 'Go inside', () => this.finishArrival(), {
      width: 190, variant: 'filled',
    }).setDepth(50);
    this.container.add(go);
  }

  /**
   * Hand back to whoever sent us, saying where we got to.
   *
   * `returnData` rides along untouched — the drive never looked inside
   * it — so GameScene reads its own passenger out of the far end.
   */
  private finishArrival(): void {
    this.cleanup();
    if (!this.returnTo) { this.scene.restart(); return; }
    this.scene.start(this.returnTo, {
      arrived: { destinationId: this.destinationId, ...this.returnData },
    });
  }

  /**
   * Progress has reached the far end — leave travel mode and park.
   *
   * Guarded, because the drive loop is a repeating timer and progress
   * stays pinned at 1 once it gets there: without the flag every
   * subsequent tick would re-enter the arrival and restart the tween.
   */
  private beginArrival(): void {
    if (this.arriving) return;
    this.arriving = true;

    // **Travel's pending work has to die before the forecourt is
    // drawn.** `cleanup()` takes the drive timer and the lane tween,
    // which is everything travel mode owns *synchronously* — but
    // `switchRoad` schedules its re-layout on a `delayedCall(180)` and
    // hands the fade to a tween, so a road change that started in the
    // last moments of the route lands 180ms into the arrival and
    // re-runs `renderTravel` over it.
    //
    // The symptom was subtle and worth writing down: the forecourt
    // rendered correctly, and then the van in it was silently replaced
    // by travel's own van — right size for a road lane, half again too
    // tall for a parking bay, and sitting at 0.72 of the screen
    // instead of in a space. Everything *looked* like a sizing bug in
    // the arrival, and the arrival's own numbers were correct.
    this.time.removeAllEvents();
    this.tweens.killAll();

    this.phase = 'arrival';
    this.renderView();
  }

  /** Henry rolls forward out of the bay to the exit road, then asks which way. */
  private pullOutOfBay(width: number, height: number, roadY: number): void {
    // Hide the start-prompt layer (title + Let's go! + Back all sit at depth 45+).
    for (const o of this.container.list) {
      const go = o as Phaser.GameObjects.GameObject & { depth?: number; setVisible?: (v: boolean) => unknown };
      if (typeof go.depth === 'number' && go.depth >= 45 && go.setVisible) go.setVisible(false);
    }

    AudioManager.getInstance().playSfx('button_click');
    const van = this.vanGfx;
    if (!van) { this.beginTravel(1); return; }
    this.tweens.add({
      targets: van,
      y: roadY - 4,
      duration: 750,
      ease: 'Sine.easeInOut',
      onComplete: () => this.showTurnChoice(width, height),
    });
  }

  /** Offer the left/right turn onto the road. */
  private showTurnChoice(width: number, height: number): void {
    this.container.add(
      this.add.text(width / 2, height * 0.5, 'Which way?', {
        fontSize: TYPE.heading, fontFamily: FONTS.title, fontStyle: 'bold', color: COLOURS.text,
        backgroundColor: 'rgba(255,249,239,0.85)', padding: { x: 14, y: 6 },
      }).setOrigin(0.5).setDepth(50)
    );
    this.container.add(
      createChromeButton(this, width * 0.32, height * 0.62, '◀ Left', () => this.turnAndGo(-1), {
        width: 150,
      }).setDepth(50)
    );
    this.container.add(
      createChromeButton(this, width * 0.68, height * 0.62, 'Right ▶', () => this.turnAndGo(1), {
        width: 150,
      }).setDepth(50)
    );
  }

  /** Henry turns to face the chosen way and drives off that edge of the
   *  forecourt; then the road screen appears and he drives on from the bottom. */
  private turnAndGo(dir: -1 | 1): void {
    AudioManager.getInstance().playSfx('button_click');
    const van = this.vanGfx;
    if (!van) { this.beginTravel(dir); return; }
    const { width } = this.scale;
    this.tweens.add({
      targets: van,
      angle: dir > 0 ? 90 : -90,                  // nose points the way we're turning
      x: dir > 0 ? width + this.vanW * 2 : -this.vanW * 2, // drive off that edge
      duration: 640,
      ease: 'Sine.easeIn',
      onComplete: () => this.beginTravel(dir),
    });
  }

  private beginTravel(_dir: -1 | 1): void {
    // Work out the road-class profile for this route, and open on the road type
    // the route starts on, so the drive matches the map from the off.
    this.computeRouteProfile();
    if (this.autoRoad && this.roadProfile.length) {
      this.roadConfig = ROADS[this.profileRoadId(0)];
    }
    this.drive.gear = 1; // pull away in first
    this.phase = 'travel';
    this.renderView();
    this.animateVanEntry();
  }

  /** Drive the van on from the bottom of the road into its resting position. */
  private animateVanEntry(): void {
    const van = this.vanGfx;
    if (!van) return;
    const { height } = this.scale;
    van.setAngle(0);
    van.setY(height + this.vanH * 1.6); // start just below the screen
    this.tweens.add({ targets: van, y: this.vanY, duration: 720, ease: 'Sine.easeOut' });
  }

  /** Load the road graph from the cached JSON once. */
  private ensureGraph(): void {
    if (!this.gpsGraph && this.cache.json.exists('birchie-graph')) {
      this.gpsGraph = this.cache.json.get('birchie-graph') as RoadGraph;
      this.gpsAdj = buildAdjacency(this.gpsGraph);
    }
  }

  private computeRouteProfile(): void {
    this.ensureGraph();
    this.roadProfile = this.gpsGraph && this.gpsAdj
      ? routeProfile(this.gpsGraph, this.gpsAdj, ARC_PLACE, placeFor(this.destinationId))
      : [];
    // One merge zone per road-type change, centred on the class boundary
    // (~3–4s to play out at cruising speed). scrollY and progress are the same
    // signal, so the zone's world-Y lines up with where the boundary scrolls to.
    this.roadTransitions = buildRoadTransitions(this.roadProfile, roadIdForClass, MERGE_ZONE_LEN);
    this.routeJunctions = this.gpsGraph && this.gpsAdj
      ? buildRouteJunctions(this.gpsGraph, this.gpsAdj, ARC_PLACE, placeFor(this.destinationId))
      : [];
  }

  /** The road type at a progress fraction, from the route's class profile. */
  private profileRoadId(progress: number): RoadId {
    for (const run of this.roadProfile) {
      if (progress <= run.untilProgress + 1e-6) return roadIdForClass(run.roadClass);
    }
    const last = this.roadProfile[this.roadProfile.length - 1];
    return last ? roadIdForClass(last.roadClass) : 'country-lane';
  }

  /**
   * Change road type mid-drive with a soft flash so the re-layout of lanes and
   * traffic is masked — reads as "joining a new road", not a glitch. Preserves
   * progress, the GPS route and the cameras.
   */
  private switchRoad(id: RoadId): void {
    if (id === this.roadConfig.id || this.roadSwitching) return;
    // Travel-mode machinery, and only travel mode. See applyRoadSwitch.
    if (this.phase !== 'travel') return;
    this.roadSwitching = true;
    const { width, height } = this.scale;
    const cover = this.add.rectangle(width / 2, height / 2, width, height, 0xf4efe6, 0).setDepth(80);
    this.container.add(cover);
    this.showRoadBanner(ROADS[id].label);
    // Timing-driven (not tween-callback-driven) so the cover ALWAYS clears and
    // roadSwitching always resets — a road switch can never freeze the drive,
    // even if the re-layout throws.
    this.tweens.add({ targets: cover, alpha: 0.72, duration: 170, ease: 'Sine.easeInOut' });
    this.time.delayedCall(180, () => {
      try {
        this.applyRoadSwitch(id);
      } catch (e) {
        // Don't let a re-layout error strand the cover / freeze the game.
        console.error('[ptv] road switch failed', e);
      }
      this.tweens.add({ targets: cover, alpha: 0, duration: 200, ease: 'Sine.easeInOut', onComplete: () => cover.destroy() });
      this.time.delayedCall(230, () => { this.roadSwitching = false; });
    });
  }

  /** The actual re-layout, run while the flash covers the screen. */
  private applyRoadSwitch(id: RoadId): void {
    // **Only while we are still on the road.**
    //
    // This is a re-layout of travel mode that does not go through
    // `renderView` — it destroys `vanGfx` and rebuilds it at road
    // geometry directly. It is also scheduled 180ms out by
    // `switchRoad`, so a road change that begins in the last moments
    // of a route lands *after* the arrival has drawn the forecourt,
    // and silently swaps the parked van for a road one: right size for
    // a lane, half again too tall for a bay, and sitting at 0.72 of the
    // screen instead of in a parking space.
    //
    // That cost an hour, because every number in the arrival was
    // correct and the arrival was demonstrably the last thing to
    // render. The guard is on the phase rather than on the timer
    // because the timer is not the only way back in here.
    if (this.phase !== 'travel') return;
    this.roadConfig = ROADS[id];
    const { width, height } = this.scale;
    const geo = this.geo();
    const size = vanSizeForLane(geo.laneWidth);
    this.vanW = size.w; this.vanH = size.h;
    this.drive.lane = Math.max(0, Math.min(this.pl() - 1, this.drive.lane));
    // The van is rebuilt in her own lane below, so any overtake ends with the switch.
    this.overtaking = false;

    if (this.vanGfx) this.vanGfx.destroy();
    this.vanGfx = this.makeVan();
    this.vanGfx.setPosition(laneCentreX(geo, this.drive.lane), this.vanY);
    this.vanGfx.setDepth(20);
    this.container.add(this.vanGfx);

    for (const c of this.traffic) c.gfx.destroy();
    for (const o of this.oncoming) o.gfx.destroy();
    for (const d of this.decor) d.obj.destroy();
    for (const s of this.scenery) s.gfx.destroy();
    this.traffic = []; this.oncoming = []; this.decor = []; this.scenery = [];
    this.spawnScenery(width, height);
    this.spawnDecor(width, height);
    this.spawnInitialTraffic(width, height);
    this.spawnOncoming(width, height);
  }

  private showRoadBanner(label: string): void {
    const { width, height } = this.scale;
    const t = this.add.text(width / 2, height * 0.2, label, {
      fontSize: TYPE.lead, fontFamily: FONTS.title, fontStyle: 'bold', color: '#ffffff',
      backgroundColor: 'rgba(46,107,138,0.92)', padding: { x: 16, y: 7 },
    }).setOrigin(0.5).setDepth(82).setAlpha(0);
    this.container.add(t);
    this.tweens.add({ targets: t, alpha: 1, duration: 200, yoyo: true, hold: 900, onComplete: () => t.destroy() });
  }

  /** Draw the road for this frame: banded (narrowing/opening) across a
   *  road-type merge zone, else the plain static road. */
  private drawRoad(width: number, height: number): void {
    if (!this.roadGfx) return;
    if (this.roadTransitions.length && this.transitionOnScreen(height)) {
      drawTransitionRoad(
        this.roadGfx, width, height, this.scrollY, this.vanY, this.roadTransitions,
        (id) => roadGeometry(width, ROADS[id as RoadId]),
        (id) => ROADS[id as RoadId],
      );
    } else {
      drawRoadForConfig(this.roadGfx, width, height, this.scrollY, this.geo(), this.roadConfig);
    }
    // Just the NEXT unresolved fork's side-road opening — one clear turn-in
    // approaching from the top, not every fork on the route (which stacked into
    // a clutter of tarmac strips). It scrolls down at road speed via its fixed
    // world-Y; drawJunctionMouth culls it once off-screen.
    const mouth = this.routeJunctions.find(
      (j) => j.isChoice && j.side && !this.resolvedJunctions.has(j.nodeIndex) &&
        this.scrollY + this.vanY - j.worldY < height + 40,
    );
    if (mouth) drawJunctionMouth(this.roadGfx, width, height, this.scrollY, this.vanY, this.geo(), mouth);
  }

  /** Whether any merge zone overlaps the visible rows this frame. */
  private transitionOnScreen(height: number): boolean {
    const top = worldYForRow(this.scrollY, this.vanY, 0);      // screen top = highest world-Y
    const bot = worldYForRow(this.scrollY, this.vanY, height); // screen bottom = lowest world-Y
    return this.roadTransitions.some((z) => {
      const start = z.centreWorldY - z.zoneLen / 2;
      const end = z.centreWorldY + z.zoneLen / 2;
      return end >= bot && start <= top;
    });
  }

  // ── Turning at junctions ───────────────────────────────────

  /** Each tick: offer the next fork's turn choice while the van is in its
   *  (generous) decision window, and auto-resolve one we've driven past. */
  private updateJunctionPrompt(): void {
    // The van sits at vanY, so its world-Y is exactly scrollY.
    const active = this.promptJunction;
    if (active && this.scrollY > active.worldY + JUNCTION_WINDOW_HALF && !this.resolvedJunctions.has(active.nodeIndex)) {
      this.resolveJunction(active, 'straight'); // drove past without choosing → carry on
    }
    if (!this.routeJunctions.length) return;
    const j = nextChoiceJunction(this.routeJunctions, this.drive.progress);
    if (!j || this.resolvedJunctions.has(j.nodeIndex)) return;
    if (this.promptJunction?.nodeIndex !== j.nodeIndex && inDecisionWindow(j, this.scrollY, JUNCTION_WINDOW_HALF)) {
      this.showJunctionChoice(j);
    }
  }

  /** Offer a left/right turn at a fork — buttons sit out on the grass verges,
   *  clear of the road and van; the GPS-correct way is highlighted green. The
   *  arrow keys (A/D too) turn while a fork is live. Doing nothing carries on. */
  private showJunctionChoice(j: RouteJunction): void {
    this.clearJunctionPrompt();
    this.promptJunction = j;
    const { width, height } = this.scale;
    const geo = this.geo();
    const y = height * 0.5;
    const leftX = Math.max(60, geo.roadLeft * 0.5);
    const rightX = Math.min(width - 60, (geo.roadLeft + geo.roadWidth + width) / 2);
    const want = j.side;
    const c = this.add.container(0, 0).setDepth(55);
    // The way the route wants is filled and the other is a plate. It was
    // green against blue, which is the hint a red-green colourblind child
    // gets nothing from; weight is the one channel everybody reads.
    c.add(createChromeButton(this, leftX, y, '◀', () => this.resolveJunction(j, 'left'), {
      width: 88, height: 78, variant: want === 'left' ? 'filled' : 'plate',
    }));
    c.add(createChromeButton(this, rightX, y, '▶', () => this.resolveJunction(j, 'right'), {
      width: 88, height: 78, variant: want === 'right' ? 'filled' : 'plate',
    }));
    this.container.add(c);
    this.junctionPrompt = c;
  }

  private clearJunctionPrompt(): void {
    this.junctionPrompt?.destroy();
    this.junctionPrompt = undefined;
    this.promptJunction = undefined;
  }

  /** Resolve a fork. The GPS-correct way is cheerful; a wrong way (or a
   *  drive-past) is gently accepted — for now we always carry on along the
   *  route (a true wrong-turn reroute is the next slice). */
  private resolveJunction(j: RouteJunction, dir: 'left' | 'straight' | 'right'): void {
    if (this.resolvedJunctions.has(j.nodeIndex)) return;
    this.resolvedJunctions.add(j.nodeIndex);
    this.clearJunctionPrompt();
    const correct = dir === (j.side ?? 'straight');
    AudioManager.getInstance().playSfx(correct ? 'button_click' : 'food_wrong');
    this.showRoadBanner(correct ? 'Good turn!' : 'This way!');
    if (dir !== 'straight') this.turnWorld(dir);
  }

  /**
   * Take a junction: the whole world (road, scenery, traffic) rotates 90° about
   * the van — anticlockwise for a left turn, clockwise for a right — while the
   * van holds its place and just tilts to show it's steering. When the world
   * has swung into its new heading it snaps upright and the road ahead is
   * rebuilt, so the drive continues straight down the new road.
   */
  private turnWorld(dir: 'left' | 'right'): void {
    if (this.turning) return;
    this.turning = true;
    const sign = dir === 'left' ? -1 : 1; // the van leans this way (nose into the turn)
    // The world spins the OPPOSITE way, so the chosen side swings up to become
    // the road ahead: a LEFT turn rotates the world clockwise (+90°), putting
    // the left-hand road forward. (Rotating the world the same way as the lean
    // would send you down the road on the other side — the reported inversion.)
    const worldSpin = (-sign * Math.PI) / 2;
    const px = laneCentreX(this.geo(), this.drive.lane); // van pivot on screen
    const py = this.vanY;
    const van = this.vanGfx;
    if (van) {
      this.tweens.add({
        targets: van, angle: sign * 24, duration: 320, ease: 'Sine.easeInOut',
        yoyo: true, onComplete: () => van.setAngle(0),
      });
    }
    const st = { a: 0 };
    this.tweens.add({
      targets: st, a: worldSpin, duration: 640, ease: 'Cubic.easeInOut',
      onUpdate: () => {
        const c = Math.cos(st.a), s = Math.sin(st.a);
        this.worldLayer.setRotation(st.a);
        this.worldLayer.setPosition(px - (px * c - py * s), py - (px * s + py * c));
      },
      onComplete: () => {
        this.worldLayer.setRotation(0).setPosition(0, 0);
        this.rebuildWorldForNewHeading();
        this.turning = false;
      },
    });
  }

  /** After a turn, respawn the roadside world so the drive continues cleanly
   *  down the new road (the road itself keeps scrolling). */
  private rebuildWorldForNewHeading(): void {
    const { width, height } = this.scale;
    for (const c of this.traffic) c.gfx.destroy();
    for (const o of this.oncoming) o.gfx.destroy();
    for (const d of this.decor) d.obj.destroy();
    for (const s of this.scenery) s.gfx.destroy();
    this.traffic = []; this.oncoming = []; this.decor = []; this.scenery = [];
    this.overtaking = false;
    this.spawnScenery(width, height);
    this.spawnDecor(width, height);
    this.spawnInitialTraffic(width, height);
    this.spawnOncoming(width, height);
  }

  // ── Scenery ────────────────────────────────────────────────

  private spawnScenery(width: number, height: number): void {
    const geo = this.geo();
    const leftVergeMax = geo.roadLeft - 16;
    const rightVergeMin = geo.roadLeft + geo.roadWidth + 16;
    const count = 8;
    for (let i = 0; i < count; i++) {
      const onLeft = i % 2 === 0;
      const size = 16 + Math.random() * 16;
      const kind = Math.random() < 0.6 ? 'tree' : 'hedge';
      const x = onLeft
        ? Math.random() * Math.max(10, leftVergeMax - size)
        : rightVergeMin + size + Math.random() * Math.max(10, width - rightVergeMin - size * 2);
      const y = (i / count) * height + Math.random() * 40 - height * 0.1;
      const gfx = this.add.graphics();
      drawSceneryItem(gfx, kind as 'tree' | 'hedge', size);
      gfx.setPosition(x, y);
      gfx.setDepth(5);
      this.worldLayer.add(gfx);
      this.scenery.push({ gfx, y, size });
    }
  }

  // ── Roadside decorations ───────────────────────────────────

  private spawnDecor(width: number, height: number): void {
    // Cones / signs / bollards scatter randomly for life. Speed cameras are NOT
    // random — they're placed at fixed map spots by the route (see cameraTriggers).
    const count = 5;
    for (let i = 0; i < count; i++) {
      const kind = DECOR_KINDS[Math.floor(Math.random() * DECOR_KINDS.length)];
      const key = `decor-${kind}`;
      if (!this.textures.exists(key)) continue;
      const side: -1 | 1 = Math.random() < 0.5 ? -1 : 1;
      const obj = this.makeDecorObj(key, width, side);
      const y = (i / count) * height + Math.random() * 80 - height * 0.2;
      obj.setY(y);
      this.decor.push({ obj, y, size: obj.displayHeight, isCamera: false, triggered: false });
    }
  }

  /** Drop a speed camera at the top of the road so it scrolls down to us — fired
   *  when the drive reaches a fixed camera map-spot on the route. */
  private spawnCameraProp(width: number): void {
    const key = 'decor-speed-camera';
    if (!this.textures.exists(key)) return;
    const side: -1 | 1 = Math.random() < 0.5 ? -1 : 1;
    const obj = this.makeDecorObj(key, width, side);
    const y = -obj.displayHeight - 20;
    obj.setY(y);
    this.decor.push({ obj, y, size: obj.displayHeight, isCamera: true, triggered: false, oneShot: true });
  }

  private makeDecorObj(key: string, width: number, side: -1 | 1): Phaser.GameObjects.Image {
    const geo = this.geo();
    const img = this.add.image(0, 0, key);
    const targetW = Math.min(geo.laneWidth * 0.72, 72);
    img.setScale(targetW / img.width);
    const half = img.displayWidth * 0.5;
    const x = side < 0
      ? geo.roadLeft - 10 - half - Math.random() * 26
      : geo.roadLeft + geo.roadWidth + 10 + half + Math.random() * 26;
    img.setX(Math.max(half, Math.min(width - half, x)));
    img.setDepth(6);
    this.worldLayer.add(img);
    return img;
  }

  // ── Decorative traffic ─────────────────────────────────────

  /** Pick a traffic kind appropriate to the current road, honouring where the
   *  specials belong:
   *   - 'leader'  = the slow vehicle you catch on a single carriageway. Inland
   *                 side roads get a tractor / bin lorry / skip truck; the coast
   *                 road gets the seaside open-top bus (spring/summer) or a tractor.
   *   - 'traffic' = ordinary flowing traffic. On the main A-road the seasonal bus
   *                 turns up now and then; otherwise the everyday weighted pool. */
  private pickRoadKind(role: 'leader' | 'traffic'): TrafficKind {
    const id = this.roadConfig.id;
    const inSeason = isBusSeason(new Date().getMonth() + 1);
    if (role === 'leader') {
      if (id === 'coast-road') return pickFrom(inSeason ? ['bus', 'tractor'] : ['tractor'], Math.random());
      return pickFrom(['tractor', 'binlorry', 'skiptruck'], Math.random());
    }
    if (id === 'thanet-way' && inSeason && Math.random() < 0.14) return 'bus';
    return pickTrafficKind(Math.random());
  }

  private spawnInitialTraffic(width: number, height: number): void {
    // Scale same-direction traffic to the number of player lanes. A single-lane
    // country road gets ONE slow leader ahead — a tractor / bin lorry / skip
    // truck (inland) or the seaside bus (coast) to catch up to and overtake
    // (that's the whole point of the overtaking mechanic here). It recycles far
    // ahead once passed, so there's always a next one but never a jam. Multi-lane
    // roads get plenty, with overtaking between lanes.
    if (this.pl() <= 1) {
      if (this.roadConfig.oncomingLanes >= 1) this.addTrafficCar(width, height * 0.12, this.pickRoadKind('leader'));
      return;
    }
    const count = this.pl() * 3;
    for (let i = 0; i < count; i++) {
      // Spread cars ahead and behind, but never in the van's band (~0.72h) so
      // nothing spawns on top of Henry.
      const t = i / Math.max(1, count - 1);
      const yFrac = t < 0.5 ? -0.35 + t * 1.6 : 0.9 + (t - 0.5) * 0.9; // ahead: -0.35..0.45; behind: 0.9..1.35
      this.addTrafficCar(width, height * yFrac, this.pickRoadKind('traffic'));
    }
  }

  // ── Oncoming traffic (opposite carriageway) ────────────────

  private spawnOncoming(width: number, height: number): void {
    if (this.roadConfig.oncomingLanes <= 0) return;
    const perLane = 3;
    const first = this.roadConfig.playerLanes;
    for (let lane = first; lane < first + this.roadConfig.oncomingLanes; lane++) {
      for (let k = 0; k < perLane; k++) {
        // Even spacing within the lane so they never bunch up.
        this.addOncomingCar(-height * 0.15 + (k / perLane) * height * 1.35, lane);
      }
    }
  }

  private addOncomingCar(y: number, lane: number): void {
    const geo = this.geo();
    const profile = TRAFFIC_PROFILES[this.pickRoadKind('traffic')];
    const w = Math.round(this.vanW * profile.widthFactor);
    const h = Math.round(this.vanH * profile.lengthFactor);
    const gfx = this.makeTrafficObj(profile, w, h, 'oncoming'); // front view, faces us
    gfx.setPosition(laneCentreX(geo, lane), y);
    gfx.setDepth(15);
    this.worldLayer.add(gfx);
    this.oncoming.push({ gfx, lane, y, speed: ONCOMING_SPEED });
  }

  /** Redraw the soft dropshadow under every vehicle (van, traffic, oncoming).
   *  A faint wide ellipse under a slightly stronger inner one reads as a soft
   *  contact shadow on any road surface. Called each travel tick. */
  private drawShadows(): void {
    const g = this.shadowGfx;
    if (!g) return;
    g.clear();
    const shadow = (o?: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics): void => {
      if (!o) return;
      // Vehicles are sprites (Image) with a real display size; the procedural
      // Graphics fallback has none, so use the van footprint for it.
      const sized = o as Phaser.GameObjects.Image;
      const w = sized.displayWidth || this.vanW;
      const h = sized.displayHeight || this.vanH;
      const cx = o.x;
      const cy = o.y + h * 0.04; // nudge down so the van sits just above its shadow
      g.fillStyle(0x14140f, 0.10);
      g.fillEllipse(cx, cy, w * 0.96, h * 0.88);
      g.fillStyle(0x14140f, 0.16);
      g.fillEllipse(cx, cy, w * 0.80, h * 0.70);
    };
    shadow(this.vanGfx);
    for (const c of this.traffic) shadow(c.gfx);
    for (const o of this.oncoming) shadow(o.gfx);
  }

  /** Recycle an off-top oncoming car to the back of its own lane's queue, a
   *  clear gap behind the current last car, so nothing overlaps. Lane is kept. */
  private recycleOncoming(o: OncomingCar): void {
    const geo = this.geo();
    // Re-enter at the top, a clear gap above its lane's current topmost car.
    let highest = -this.vanH * 1.5;
    for (const c of this.oncoming) if (c !== o && c.lane === o.lane) highest = Math.min(highest, c.y);
    o.y = highest - this.vanH * 2.4;
    const profile = TRAFFIC_PROFILES[this.pickRoadKind('traffic')];
    const w = Math.round(this.vanW * profile.widthFactor);
    const h = Math.round(this.vanH * profile.lengthFactor);
    o.gfx.destroy();
    o.gfx = this.makeTrafficObj(profile, w, h, 'oncoming'); // front view, faces us
    o.gfx.setPosition(laneCentreX(geo, o.lane), o.y);
    o.gfx.setDepth(15);
    this.worldLayer.add(o.gfx);
    o.speed = ONCOMING_SPEED;
  }

  /** Choose a lane for a vehicle: mostly its preferred (slow vehicles slow
   *  lane, fast vehicles fast lane), with an occasional neighbour for variety. */
  private assignLane(profile: TrafficProfile): number {
    const cap = maxLaneFor(profile, this.pl()); // slow vehicles never in the fast lane
    const base = Math.min(preferredLane(profile, this.pl()), cap);
    if (Math.random() < 0.62) return base;
    const j = Math.random() < 0.5 ? -1 : 1;
    return Math.max(0, Math.min(cap, base + j));
  }

  /** A traffic vehicle object — painted sprite if one is loaded for the kind,
   *  else the procedural draw. Sprites scale to the target width, keeping their
   *  own aspect. */
  private makeTrafficObj(profile: TrafficProfile, w: number, h: number, role: 'same' | 'oncoming'): Phaser.GameObjects.Image | Phaser.GameObjects.Graphics {
    const fronts = TRAFFIC_SPRITE_KEYS[profile.kind].filter((k) => this.textures.exists(k));
    if (fronts.length) {
      const front = fronts[Math.floor(Math.random() * fronts.length)];
      const rear = `${front}-rear`;
      const hasRear = this.textures.exists(rear);
      // Going our way (driving away) → the REAR view; coming at us → the FRONT.
      const key = role === 'same' && hasRear ? rear : front;
      const img = this.add.image(0, 0, key);
      img.setScale(w / img.width);
      // A front/rear-paired vehicle already faces correctly per view (no spin).
      // A plain single top-down sprite is nose-up, so flip 180° when oncoming.
      img.setAngle(role === 'oncoming' && !hasRear ? 180 : 0);
      return img;
    }
    const gfx = this.add.graphics();
    drawTrafficVehicle(gfx, profile.kind, w, h, profile.colour);
    gfx.setAngle(role === 'oncoming' ? 180 : 0);
    return gfx;
  }

  private addTrafficCar(width: number, y: number, kind: keyof typeof TRAFFIC_PROFILES): void {
    const geo = this.geo();
    const profile = TRAFFIC_PROFILES[kind];
    const lane = this.assignLane(profile);
    const w = Math.round(this.vanW * profile.widthFactor);
    const h = Math.round(this.vanH * profile.lengthFactor);
    const gfx = this.makeTrafficObj(profile, w, h, 'same'); // rear view, driving away
    gfx.setPosition(laneCentreX(geo, lane), y);
    gfx.setDepth(15);
    this.worldLayer.add(gfx);
    this.traffic.push({
      gfx,
      profile,
      lane,
      y,
      absSpeed: carAbsoluteSpeed(profile, lane, TRAFFIC_REF_SPEED, this.pl()),
      nextZigAt: profile.zigzag ? this.time.now + 800 + Math.random() * 900 : 0,
    });
  }

  // ── HUD ────────────────────────────────────────────────────

  private renderHud(width: number, height: number): void {
    // Title pill (top).
    const titlePill = this.add.container(width / 2, 34);
    const t = this.add.text(0, 0, 'Practice Drive', {
      fontSize: TYPE.lead, fontFamily: FONTS.title, fontStyle: 'bold', color: COLOURS.white,
    }).setOrigin(0.5);
    const pad = 18;
    const bg = this.add.graphics();
    bg.fillStyle(0x3d8a2e, 0.92);
    bg.fillRoundedRect(-t.width / 2 - pad, -18, t.width + pad * 2, 36, 18);
    titlePill.add([bg, t]);
    titlePill.setDepth(40);
    this.container.add(titlePill);

    // Back / exit button (top-left).
    this.container.add(
      // Anchored by both edges, like the other three copies of this
      // button: 53 was half of the 88 asked for and the drawn control is
      // 108, and the control is 52 tall where EDGE_CONTROL_INSET assumes
      // MIN_TAP. Both guesses landed it inside the margin.
      createChromeButton(this, SAFE_MARGIN, SAFE_MARGIN, 'Back', () => this.exit(), {
        width: 88, anchor: { x: 'left', y: 'top' },
      }).setDepth(40)
    );

    // Road-type toggle (demo): cycle country lane / Thanet Way / gravel / sand.
    this.container.add(
      createChromeButton(this, width - 96, 34, this.roadConfig.label, () => this.cycleRoad(), {
        width: 168, fontSize: TYPE.caption,
      }).setDepth(40)
    );

    this.renderGearStick(width, height);
    this.renderHandbrake(width, height);
    this.renderHorn(width, height);

    // Gentle hint.
    this.container.add(
      this.add.text(width / 2, height - 14, 'Tap left/right to change lane   ·   Spacebar = handbrake   ·   H = horn', {
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5).setDepth(40)
    );
  }

  /**
   * Handbrake — slam to a halt. Better than an RTA, but it jostles the animals
   * in their cages: comfort drops, the van judders, the screen shakes. Drops
   * the stick straight into Park so the vehicle actually stops.
   */
  private emergencyBrake(): void {
    this.setGear(PARK);
    this.drive.cargoComfort = jostleComfort(this.drive.cargoComfort, 15);
    AudioManager.getInstance().playSfx('food_wrong'); // wobble/chaos cue (placeholder)

    // Screen shake + a quick van judder.
    this.cameras.main.shake(320, 0.012);
    if (this.vanGfx) {
      this.tweens.add({
        targets: this.vanGfx,
        angle: { from: -6, to: 6 },
        duration: 70,
        yoyo: true,
        repeat: 3,
        ease: 'Sine.easeInOut',
        onComplete: () => this.vanGfx?.setAngle(0),
      });
    }

    // "Hold on!" popup.
    const { width, height } = this.scale;
    const popup = this.add.text(width / 2, height * 0.5, 'Hold on!', {
      fontSize: TYPE.title, fontFamily: FONTS.title, fontStyle: 'bold',
      color: '#ffffff',
      backgroundColor: 'rgba(168,32,32,0.85)',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setDepth(60).setAlpha(0);
    this.container.add(popup);
    this.tweens.add({
      targets: popup,
      alpha: 1,
      scale: { from: 0.7, to: 1.1 },
      duration: 150,
      yoyo: true,
      hold: 350,
      ease: 'Back.easeOut',
      onComplete: () => popup.destroy(),
    });
  }

  /** Vertical gear stick on the right: 3 / 2 / 1 / P / R top-to-bottom. */
  private renderGearStick(width: number, height: number): void {
    const stickX = width - 46;
    const topY = height * 0.28;
    const botY = height * 0.78;
    const slots: Gear[] = [3, 2, 1, PARK, REVERSE]; // visual top → bottom
    const slotY = (i: number) => topY + (botY - topY) * (i / (slots.length - 1));

    // Track.
    const track = this.add.graphics().setDepth(38);
    track.fillStyle(0x000000, 0.18);
    track.fillRoundedRect(stickX - 26, topY - 34, 52, botY - topY + 68, 16);
    track.fillStyle(0x3a2e22, 0.85);
    track.fillRoundedRect(stickX - 22, topY - 30, 44, botY - topY + 60, 14);
    this.container.add(track);

    // "GEAR" caption.
    this.container.add(
      this.add.text(stickX, topY - 44, 'GEAR', {
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.title, fontStyle: 'bold', color: COLOURS.white,
      }).setOrigin(0.5).setDepth(40)
    );

    // Notches + tap zones.
    slots.forEach((gear, i) => {
      const y = slotY(i);
      this.gearSlotY[String(gear)] = y;
      const label = gearLabel(gear);
      const labelColour =
        gear === PARK ? '#a9c7e0' :
        gear === REVERSE ? '#ffc9c9' :
        '#e8dcc8';
      this.container.add(
        this.add.text(stickX, y, label, {
          fontSize: TYPE.body, fontFamily: FONTS.title, fontStyle: 'bold',
          color: labelColour,
        }).setOrigin(0.5).setDepth(39)
      );
      const zone = this.add.rectangle(stickX, y, 52, 40, 0xffffff, 0)
        .setInteractive({ useHandCursor: true }).setDepth(41);
      zone.on('pointerdown', () => this.setGear(gear));
      this.container.add(zone);
    });

    // Knob.
    this.gearKnob = this.add.container(stickX, slotY(slots.indexOf(this.drive.gear)));
    const knobBg = this.add.graphics();
    knobBg.fillStyle(0xd4783c, 1);
    knobBg.fillRoundedRect(-20, -17, 40, 34, 10);
    knobBg.lineStyle(2, 0xffffff, 0.4);
    knobBg.strokeRoundedRect(-20, -17, 40, 34, 10);
    this.gearKnob.add(knobBg);
    this.gearKnob.setDepth(42);
    this.container.add(this.gearKnob);
  }

  // ── Input ──────────────────────────────────────────────────

  private setupInput(width: number, height: number): void {
    const kb = this.input.keyboard;
    if (kb) {
      this.keys = {
        left: kb.addKey('LEFT'),
        right: kb.addKey('RIGHT'),
        up: kb.addKey('UP'),
        down: kb.addKey('DOWN'),
        a: kb.addKey('A'),
        d: kb.addKey('D'),
        r: kb.addKey('R'),
        space: kb.addKey('SPACE'),
        h: kb.addKey('H'),
      };
      this.keys.left.on('down', () => this.steer(-1));
      this.keys.a.on('down', () => this.steer(-1));
      this.keys.right.on('down', () => this.steer(1));
      this.keys.d.on('down', () => this.steer(1));
      this.keys.up.on('down', () => this.setGear(cycleGear(this.drive.gear, 1)));
      this.keys.down.on('down', () => this.setGear(cycleGear(this.drive.gear, -1)));
      this.keys.r.on('down', () => this.setGear(REVERSE));
      this.keys.space.on('down', () => this.toggleHandbrake()); // handbrake: pull/release
      this.keys.h.on('down', () => this.playHorn());
    }

    // Lane tap zones — left / right halves of the upper driving area, clear of
    // the gear stick on the right and the bottom hint.
    const zoneH = height - 90;
    const leftZone = this.add.rectangle(width * 0.22, zoneH / 2, width * 0.44, zoneH, 0xffffff, 0)
      .setInteractive();
    leftZone.on('pointerdown', () => this.moveLane(-1));
    leftZone.setDepth(1);
    this.container.add(leftZone);

    const rightZone = this.add.rectangle(width * 0.60, zoneH / 2, width * 0.36, zoneH, 0xffffff, 0)
      .setInteractive();
    rightZone.on('pointerdown', () => this.moveLane(1));
    rightZone.setDepth(1);
    this.container.add(rightZone);
  }

  /** Left/right input: turns at a live fork, otherwise changes lane. */
  private steer(dir: -1 | 1): void {
    if (this.promptJunction) this.resolveJunction(this.promptJunction, dir < 0 ? 'left' : 'right');
    else this.moveLane(dir);
  }

  private moveLane(dir: -1 | 1): void {
    const pl = this.pl();

    // Already out overtaking: the only meaningful move is pulling back home.
    if (this.overtaking) {
      if (dir < 0) {
        const home = pl - 1;
        // Return only into real space — behaviour 3: if a car is beside us in the
        // home lane, we can't pull in yet (the oncoming lane is being held for us).
        if (this.laneBlockedAt(home, this.vanY)) { this.bumpBlocked(-1); return; }
        this.overtaking = false;
        this.glideToLane(home, -1);
      } else {
        this.bumpBlocked(1); // nowhere further to go — kerbside of the oncoming lane
      }
      return;
    }

    const next = Math.max(0, Math.min(pl - 1, this.drive.lane + dir));
    if (next !== this.drive.lane) {
      // Ordinary lane change within our own carriageway. Safety first: with
      // animals aboard we NEVER swerve into another vehicle.
      if (this.drive.carriesAnimals && this.laneBlockedAt(next, this.vanY)) {
        this.bumpBlocked(dir);
        return;
      }
      this.drive.lane = next;
      this.glideToLane(next, dir);
      return;
    }

    // At the edge of our carriageway. A tap towards the centre from the fast
    // lane pulls OUT to overtake into the oncoming lane — if the markings and
    // the oncoming lane both allow it.
    if (dir > 0 && this.canOvertake()) {
      const otLane = pl; // first oncoming lane
      if (!isOvertakingZone(this.scrollY, this.vanY)) { this.bumpBlocked(1); return; } // solid line
      if (this.oncomingBlockedAt(otLane, this.vanY)) { this.bumpBlocked(1); return; } // car there → bounce
      this.overtaking = true;
      this.glideToLane(otLane, 1);
      return;
    }
    this.bumpBlocked(dir);
  }

  /** Can we overtake into the oncoming lane from here? Only on a single
   *  carriageway with a painted line (not a reservation) and an oncoming lane,
   *  and only from the lane nearest the centre. */
  private canOvertake(): boolean {
    return (
      this.roadConfig.oncomingLanes >= 1 &&
      this.roadConfig.divider === 'line' &&
      this.drive.lane === this.pl() - 1
    );
  }

  /** Glide the van to `lane` with the usual bank, force-straightening on
   *  completion/interruption so it can never stick mid-lean. */
  private glideToLane(lane: number, dir: -1 | 1): void {
    AudioManager.getInstance().playSfx('button_click');
    const geo = this.geo();
    const targetX = laneCentreX(geo, lane);
    const van = this.vanGfx;
    if (this.laneTween) this.laneTween.stop();
    if (!van) return;
    van.setAngle(0);
    this.laneTween = this.tweens.add({
      targets: van,
      x: targetX,
      duration: 380,
      ease: 'Sine.easeInOut',
      onUpdate: (tw: Phaser.Tweens.Tween) => {
        van.setAngle(dir * 10 * Math.sin(tw.progress * Math.PI));
      },
      onComplete: () => van.setAngle(0),
      onStop: () => van.setAngle(0),
    });
  }

  /** Is there a same-direction vehicle in `lane` beside us (within a safe gap)? */
  private laneBlockedAt(lane: number, y: number): boolean {
    const safe = this.vanH * 1.15;
    return this.traffic.some((c) => c.lane === lane && Math.abs(c.y - y) < safe);
  }

  /** Is an oncoming vehicle in the space we'd pull into? Oncoming closes fast, so
   *  the danger window reaches well ahead (above) the van as well as beside it. */
  private oncomingBlockedAt(lane: number, y: number): boolean {
    const ahead = this.vanH * 4.5; // they're driving down onto us — leave room
    const beside = this.vanH * 1.3;
    return this.oncoming.some((o) => o.lane === lane && o.y > y - ahead && o.y < y + beside);
  }

  /** "Can't go there" feedback — a small lean toward the blocked lane and back,
   *  plus a soft wobble cue. No lane change, no collision. */
  private bumpBlocked(dir: -1 | 1): void {
    AudioManager.getInstance().playSfx('food_wrong');
    const van = this.vanGfx;
    if (!van || (this.laneTween && this.laneTween.isPlaying())) return;
    const x0 = van.x;
    this.tweens.add({ targets: van, x: x0 + dir * 12, duration: 95, yoyo: true, ease: 'Sine.easeOut' });
  }

  /** Demo: cycle to the next road type and rebuild the travel view. */
  private cycleRoad(): void {
    // Manual override: stop the map auto-following so Marcus can inspect a type.
    this.autoRoad = false;
    const idx = ROAD_CYCLE.indexOf(this.roadConfig.id as RoadId);
    this.roadConfig = ROADS[ROAD_CYCLE[(idx + 1) % ROAD_CYCLE.length]];
    this.scrollY = 0;
    this.renderView();
  }

  private setGear(gear: Gear): void {
    if (gear === this.drive.gear) return;
    // Can't select a driving gear with the handbrake on — flash a reminder.
    if (gear !== PARK && this.handbrakeOn) {
      this.flashHandbrakeReminder();
      return;
    }
    this.drive.gear = gear;
    if (gear === PARK) this.setHandbrake(true); // parking pulls the handbrake on
    AudioManager.getInstance().playSfx('button_click');
    const y = this.gearSlotY[String(gear)];
    if (this.gearKnob && y !== undefined) {
      this.tweens.add({ targets: this.gearKnob, y, duration: 140, ease: 'Sine.easeOut' });
    }
  }

  /** Engage/release the handbrake. Releasing lets the driver pick a gear;
   *  pulling it on stops the vehicle (drops to Park). */
  private toggleHandbrake(): void {
    if (this.handbrakeOn) {
      this.setHandbrake(false); // release — the driver can now select a gear
      AudioManager.getInstance().playSfx('button_click');
    } else {
      this.emergencyBrake(); // pull the handbrake hard: stop + engage + judder
    }
  }

  private setHandbrake(on: boolean): void {
    this.handbrakeOn = on;
    this.updateHandbrakeLamp();
  }

  private updateHandbrakeLamp(): void {
    this.handbrakeLamp?.setFillStyle(this.handbrakeOn ? 0xff3b30 : 0x5a2420)
      .setStrokeStyle(2, this.handbrakeOn ? 0xffd0cc : 0x3a1a17);
    if (this.handbrakeLabel) {
      this.handbrakeLabel.setText(this.handbrakeOn ? 'RELEASE' : 'PULL');
      this.handbrakeLabel.setColor(this.handbrakeOn ? '#ffd0cc' : '#c8b8a4');
    }
  }

  /** Flash the lamp + a banner when the driver tries to change gear with the
   *  handbrake still on. */
  private flashHandbrakeReminder(): void {
    AudioManager.getInstance().playSfx('food_wrong');
    if (this.handbrakeLamp) {
      this.tweens.add({
        targets: this.handbrakeLamp, scale: { from: 1, to: 1.6 },
        duration: 120, yoyo: true, repeat: 2,
      });
    }
    const { width, height } = this.scale;
    const msg = this.add.text(width / 2, height * 0.42, 'Release the handbrake first!', {
      fontSize: TYPE.lead, fontFamily: FONTS.title, fontStyle: 'bold', color: '#ffffff',
      backgroundColor: 'rgba(168,32,32,0.9)', padding: { x: 14, y: 7 },
    }).setOrigin(0.5).setDepth(60).setAlpha(0);
    this.container.add(msg);
    this.tweens.add({
      targets: msg, alpha: 1, duration: 130, yoyo: true, hold: 750,
      onComplete: () => msg.destroy(),
    });
  }

  /** Handbrake control, grouped with the gear stick on the right: a red warning
   *  lamp + a PULL/RELEASE lever. */
  private renderHandbrake(width: number, height: number): void {
    const x = width - 116;
    const y = height * 0.6;
    const panel = this.add.graphics().setDepth(38);
    panel.fillStyle(0x000000, 0.18); panel.fillRoundedRect(x - 30, y - 42, 60, 104, 14);
    panel.fillStyle(0x3a2e22, 0.85); panel.fillRoundedRect(x - 26, y - 38, 52, 96, 12);
    this.container.add(panel);
    this.container.add(
      this.add.text(x, y - 50, 'BRAKE', {
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.title, fontStyle: 'bold', color: COLOURS.white,
      }).setOrigin(0.5).setDepth(40)
    );
    this.handbrakeLamp = this.add.circle(x, y - 14, 12, 0x5a2420).setStrokeStyle(2, 0x3a1a17).setDepth(40);
    this.container.add(this.handbrakeLamp);
    this.container.add(
      this.add.text(x, y - 14, 'P', {
        fontSize: TYPE.caption, fontFamily: FONTS.title, fontStyle: 'bold', color: '#2a0f0c',
      }).setOrigin(0.5).setDepth(41)
    );
    this.handbrakeLabel = this.add.text(x, y + 26, 'PULL', {
      fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.title, fontStyle: 'bold', color: '#c8b8a4',
    }).setOrigin(0.5).setDepth(41);
    this.container.add(this.handbrakeLabel);
    const zone = this.add.rectangle(x, y + 8, 60, 104, 0xffffff, 0)
      .setInteractive({ useHandCursor: true }).setDepth(42);
    zone.on('pointerdown', () => this.toggleHandbrake());
    this.container.add(zone);
    this.updateHandbrakeLamp();
  }

  /** Horn button on the left, just above the handbrake. Sounds the current
   *  vehicle's character horn (also the H key). */
  private renderHorn(width: number, height: number): void {
    const x = width - 116;
    const y = height * 0.4;
    const g = this.add.graphics().setDepth(38);
    g.fillStyle(0x000000, 0.18); g.fillRoundedRect(x - 28, y - 28, 56, 56, 14);
    g.fillStyle(0x3a2e22, 0.9); g.fillRoundedRect(x - 24, y - 24, 48, 48, 12);
    // Classic squeeze/klaxon horn: a rubber bulb (left) to squeeze, a coiled
    // brass tube (the 360 turn) in the middle, and a flared bell opening (right).
    const brass = 0xd9a441, rubber = 0x2b2b2b;
    g.lineStyle(3.5, brass, 1);
    g.strokeCircle(x - 1, y, 6.5);                                   // the 360 coil
    g.beginPath(); g.moveTo(x - 7, y + 1); g.lineTo(x - 12, y + 3); g.strokePath(); // stem to bulb
    g.fillStyle(rubber, 1); g.fillCircle(x - 15, y + 3, 6);          // rubber squeeze bulb
    g.fillStyle(brass, 1);                                           // flared bell (right)
    g.beginPath();
    g.moveTo(x + 5, y - 3); g.lineTo(x + 18, y - 9); g.lineTo(x + 18, y + 9); g.lineTo(x + 5, y + 3);
    g.closePath(); g.fillPath();
    this.container.add(g);
    this.container.add(
      this.add.text(x, y + 20, 'HORN', {
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.title, fontStyle: 'bold', color: COLOURS.white,
      }).setOrigin(0.5).setDepth(40)
    );
    const zone = this.add.rectangle(x, y, 56, 68, 0xffffff, 0)
      .setInteractive({ useHandCursor: true }).setDepth(42);
    zone.on('pointerdown', () => this.playHorn());
    this.container.add(zone);
  }

  /** Sound the current vehicle's character horn. */
  private playHorn(): void {
    AudioManager.getInstance().playHorn(VEHICLE_HORN[this.vehicleId]);
  }

  // ── Drive loop ─────────────────────────────────────────────

  private startDriveLoop(): void {
    const { width, height } = this.scale;
    const margin = this.vanH * 1.4;

    this.driveTimer = this.time.addEvent({
      delay: 50,
      loop: true,
      callback: () => {
        // Freeze the world while a junction turn is animating (the world layer
        // is mid-rotation; resume once it snaps into the new heading).
        if (this.turning) return;
        // Our forward pace is the gear's rate, but capped so we can't drive
        // through a slower vehicle ahead in our lane — we tuck in behind until
        // we pull out to overtake.
        // Same gear, different speed per vehicle (Trikey crawls, Spark zips).
        const gearRate = gearScrollRate(this.drive.gear) * VEHICLE_SPEED[this.vehicleId];
        const rate = this.effectivePlayerRate(gearRate);
        this.scrollY += rate;

        this.drawRoad(width, height);

        // Scenery scrolls exactly with the road.
        for (const s of this.scenery) {
          s.y += rate;
          if (s.y > height + s.size + 20) s.y = -s.size - Math.random() * 60;
          else if (s.y < -s.size - 80) s.y = height + s.size + Math.random() * 60;
          s.gfx.setY(s.y);
        }

        // Roadside decorations scroll with the road. A speed camera flashes if
        // we pass it in top gear — the gentle "consequence" that pairs with the
        // handbrake, never a crash.
        for (let di = this.decor.length - 1; di >= 0; di--) {
          const d = this.decor[di];
          const prevY = d.y;
          d.y += rate;
          if (d.isCamera && !d.triggered && prevY < this.vanY && d.y >= this.vanY && this.drive.gear === 3) {
            this.flashSpeedCamera(d);
            d.triggered = true;
          }
          if (d.oneShot) {
            // A placed speed camera: remove it once it's driven past, don't recycle.
            if (d.y > height + d.size + 30) { d.obj.destroy(); this.decor.splice(di, 1); continue; }
          } else if (d.y > height + d.size + 30) { d.y = -d.size - Math.random() * 80; d.triggered = false; }
          else if (d.y < -d.size - 100) { d.y = height + d.size + Math.random() * 80; d.triggered = false; }
          d.obj.setY(d.y);
        }

        // Fire fixed-location speed cameras as the route reaches them.
        for (const t of this.cameraTriggers) {
          if (!t.done && this.drive.progress >= t.atProgress) {
            this.spawnCameraProp(width);
            t.done = true;
          }
        }

        // Follow the map: change road type where the route's road class changes.
        if (this.autoRoad && !this.roadSwitching && this.roadProfile.length) {
          const id = this.profileRoadId(this.drive.progress);
          if (id !== this.roadConfig.id) this.switchRoad(id);
        }

        // Traffic drifts by the difference between our pace and their own
        // lane-aware absolute pace — so they keep flowing past even when we're
        // stopped, and the fast lane genuinely moves faster.
        for (const car of this.traffic) {
          car.y += rate - car.absSpeed;

          // Weavers hop lanes now and then.
          if (car.nextZigAt && this.time.now >= car.nextZigAt) {
            const dir = car.lane === 0 ? 1 : car.lane === this.pl() - 1 ? -1 : (Math.random() < 0.5 ? -1 : 1);
            this.moveCarToLane(car, car.lane + dir);
            car.nextZigAt = this.time.now + 700 + Math.random() * 900;
          }

          // Recycle off either end depending on drift direction.
          if (car.y > height + margin) {
            this.recycleCar(car, width, -margin);
          } else if (car.y < -margin) {
            this.recycleCar(car, width, height + margin);
          }
        }

        // Keep vehicles from overlapping each other or the van, and let blocked
        // cars overtake into a clear lane.
        this.resolveTraffic(width);
        for (const car of this.traffic) car.gfx.setY(car.y);

        // Oncoming traffic sweeps DOWN the screen toward and past us (its own
        // pace + our forward pace). While we're out overtaking in its lane, the
        // cars ahead of us BRAKE — they hold their world position (drifting only
        // with the road at our pace, engine off) rather than driving into us. So
        // they gently close on us as we advance, our forward cap stops us before
        // contact, and when we stop (rate 0) they stop too: a clean nose-to-nose
        // standstill, no crash, and — because they move WITH the road — they
        // never appear to reverse. Cars we've already passed drive on normally.
        const otLane = this.pl();
        for (const o of this.oncoming) {
          if (this.overtaking && o.lane === otLane && o.y <= this.vanY) {
            o.y += Math.max(rate, 0); // braked: hold world position
          } else {
            o.y += o.speed + Math.max(rate, 0) * 0.6;
          }
          if (o.y > height + this.vanH * 2.2) this.recycleOncoming(o);
          o.gfx.setY(o.y);
        }

        // Soft dropshadow under every vehicle, redrawn now they're all placed.
        this.drawShadows();

        this.drive.progress = Math.min(1, Math.max(0, this.drive.progress + rate * 0.0004));
        this.updateJunctionPrompt();

        // **The drive used to have no end.** Progress clamped at 1 and
        // the road kept scrolling, which was invisible while the only
        // way in was `?ptvDemo=1` and the only way out was Back. Now
        // that a map pin starts a journey, a child has to be able to
        // get there.
        if (this.drive.progress >= 1) { this.beginArrival(); return; }

        // Advance the GPS position dot along the road route + refresh the turn.
        if (this.gpsDot) {
          const q = this.routePointAt(this.drive.progress);
          this.gpsDot.setPosition(q.x, q.y);
          this.redrawGpsRoute(this.drive.progress);
          this.updateGpsInstruction();
        }
      },
    });
  }

  private recycleCar(car: TrafficCar, width: number, y: number): void {
    const geo = this.geo();
    // On a single carriageway the only same-direction car is the slow leader, so
    // recycle it back into a leader; multi-lane roads recycle into ordinary flow.
    const kind = this.pickRoadKind(this.pl() <= 1 ? 'leader' : 'traffic');
    car.profile = TRAFFIC_PROFILES[kind];
    car.lane = this.assignLane(car.profile);
    car.absSpeed = carAbsoluteSpeed(car.profile, car.lane, TRAFFIC_REF_SPEED, this.pl());
    car.y = y;
    const w = Math.round(this.vanW * car.profile.widthFactor);
    const h = Math.round(this.vanH * car.profile.lengthFactor);
    // Kind (and image↔graphics) may change on recycle, so swap the object out.
    car.gfx.destroy();
    car.gfx = this.makeTrafficObj(car.profile, w, h, 'same'); // rear view, driving away
    car.gfx.setPosition(laneCentreX(geo, car.lane), y);
    car.gfx.setDepth(15);
    this.worldLayer.add(car.gfx);
    car.nextZigAt = car.profile.zigzag ? this.time.now + 700 + Math.random() * 900 : 0;
  }

  /** Move a traffic car to a lane: clamps, recomputes its lane-aware speed, and
   *  slides it across. */
  private moveCarToLane(car: TrafficCar, lane: number): void {
    const clamped = Math.max(0, Math.min(this.pl() - 1, lane));
    if (clamped === car.lane) return;
    car.lane = clamped;
    car.absSpeed = carAbsoluteSpeed(car.profile, clamped, TRAFFIC_REF_SPEED, this.pl());
    const geo = this.geo();
    this.tweens.add({ targets: car.gfx, x: laneCentreX(geo, clamped), duration: 260, ease: 'Sine.easeInOut' });
  }

  /** Half a vehicle's on-screen length (nose-to-centre). Long vehicles (bus,
   *  bin lorry, skip truck) are much longer than the van, so gaps must use each
   *  vehicle's own length or they visibly overlap. */
  private carHalfLen(o?: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics): number {
    const h = o ? (o as Phaser.GameObjects.Image).displayHeight : 0;
    return (h || this.vanH) / 2;
  }

  /** Our forward pace, capped so the van never drives through another vehicle. */
  private effectivePlayerRate(gearRate: number): number {
    const vanHalf = this.carHalfLen(this.vanGfx);

    // Reversing: stop rather than back into (or drag) a vehicle behind us — they
    // hold their ground, the van simply can't reverse past them.
    if (gearRate < 0) {
      for (const c of this.traffic) {
        if (c.lane !== this.drive.lane || c.y <= this.vanY) continue; // behind = below us
        const gap = c.y - this.vanY;
        if (gap <= this.carHalfLen(c.gfx) + vanHalf + this.vanH * 0.15) return 0;
      }
      return gearRate;
    }
    if (gearRate === 0) return 0;

    // Out overtaking in the oncoming lane: never drive into an oncoming car head
    // on. If we're closing on the nearest braked oncoming ahead, STOP — and wait
    // for a gap to pull back into our own lane. (The oncoming brake to a halt in
    // the movement loop, so this is a clean nose-to-nose standstill.)
    if (this.overtaking) {
      const otLane = this.pl();
      for (const o of this.oncoming) {
        if (o.lane !== otLane || o.y >= this.vanY) continue; // ahead = above us
        const gap = this.vanY - o.y;
        if (gap <= this.carHalfLen(o.gfx) + vanHalf + this.vanH * 0.2) return 0;
      }
      return gearRate;
    }

    // Normal: capped by the nearest slower vehicle ahead in our lane.
    let cap = gearRate;
    for (const c of this.traffic) {
      if (c.lane !== this.drive.lane || c.y >= this.vanY) continue; // must be ahead
      const contact = this.carHalfLen(c.gfx) + vanHalf; // centres this close = touching
      const minGap = contact + this.vanH * 0.08;
      const follow = contact + this.vanH * 1.5;
      const gap = this.vanY - c.y;
      if (gap <= follow && c.absSpeed < cap) {
        cap = Math.max(0, gap < minGap ? c.absSpeed - 0.6 : c.absSpeed);
      }
    }
    return cap;
  }

  /**
   * Stop vehicles overlapping. Within each lane, keep a minimum nose-to-tail
   * gap (the van is an immovable anchor in its lane); then let a car that's
   * stuck behind something slower peel off into a clear lane to overtake. Gaps
   * are length-aware so a long bus/lorry doesn't overlap the vehicle ahead.
   */
  private resolveTraffic(width: number): void {
    const margin = this.vanH * 0.06;
    const vanHalf = this.carHalfLen(this.vanGfx);
    // Centre-to-centre gap needed so two vehicles just touch, plus a margin.
    const pairGap = (halfA: number, halfB: number) => halfA + halfB + margin;

    for (let lane = 0; lane < this.pl(); lane++) {
      const cars = this.traffic.filter((c) => c.lane === lane);
      // While overtaking we've vacated our home lane, so we no longer anchor it —
      // the car we're passing must be able to drift down past our old slot.
      if (this.drive.lane === lane && !this.overtaking) {
        // Cars ahead of the van (closest first) held a gap in front.
        let anchor = this.vanY, anchorHalf = vanHalf;
        for (const c of cars.filter((c) => c.y < this.vanY).sort((a, b) => b.y - a.y)) {
          const half = this.carHalfLen(c.gfx);
          const maxY = anchor - pairGap(anchorHalf, half);
          if (c.y > maxY) c.y = maxY;
          anchor = c.y; anchorHalf = half;
        }
        // Cars behind the van (closest first) held a gap behind.
        anchor = this.vanY; anchorHalf = vanHalf;
        for (const c of cars.filter((c) => c.y >= this.vanY).sort((a, b) => a.y - b.y)) {
          const half = this.carHalfLen(c.gfx);
          const minY = anchor + pairGap(anchorHalf, half);
          if (c.y < minY) c.y = minY;
          anchor = c.y; anchorHalf = half;
        }
      } else {
        let anchor = -Infinity, anchorHalf = 0;
        for (const c of cars.slice().sort((a, b) => a.y - b.y)) {
          const half = this.carHalfLen(c.gfx);
          const minY = anchor === -Infinity ? c.y : anchor + pairGap(anchorHalf, half);
          if (c.y < minY) c.y = minY;
          anchor = c.y; anchorHalf = half;
        }
      }
    }

    // Overtaking: a car blocked by something slower ahead (or by the slow van)
    // occasionally pulls into a clear lane.
    for (const c of this.traffic) {
      let aheadGap = Infinity;
      let aheadSpeed = Infinity;
      for (const o of this.traffic) {
        if (o === c || o.lane !== c.lane || o.y >= c.y) continue;
        const g = c.y - o.y;
        if (g < aheadGap) { aheadGap = g; aheadSpeed = o.absSpeed; }
      }
      if (c.lane === this.drive.lane && !this.overtaking && this.vanY < c.y) {
        const g = c.y - this.vanY;
        if (g < aheadGap) { aheadGap = g; aheadSpeed = 0; } // van as a slow obstacle
      }
      // "Stuck behind something slower" threshold, ~2.4 van-lengths.
      if (aheadGap < this.vanH * 2.4 && aheadSpeed < c.absSpeed * 0.9 && Math.random() < 0.03) {
        this.tryOvertake(c);
      }
    }
  }

  /** Try to move a blocked car one lane over into clear space (fast vehicles
   *  favour the fast lane). */
  private tryOvertake(car: TrafficCar): void {
    const minGap = this.vanH * 1.6;
    const dirs: number[] = car.absSpeed > TRAFFIC_REF_SPEED * 0.8 ? [1, -1] : [-1, 1];
    for (const dir of dirs) {
      const target = car.lane + dir;
      if (target < 0 || target > maxLaneFor(car.profile, this.pl())) continue; // slow vehicles can't peel into the fast lane
      let clear = true;
      for (const o of this.traffic) {
        if (o === car || o.lane !== target) continue;
        if (Math.abs(o.y - car.y) < minGap) { clear = false; break; }
      }
      if (clear && target === this.drive.lane && Math.abs(this.vanY - car.y) < minGap) clear = false;
      if (clear) { this.moveCarToLane(car, target); return; }
    }
  }

  /** Speed camera caught us going too fast — a white blitz, a little camera
   *  pop, a jostle to the cargo and a "Slow down!". No crash, just a nudge. */
  private flashSpeedCamera(d: DecorProp): void {
    const { width, height } = this.scale;
    AudioManager.getInstance().playSfx('food_wrong');

    const flash = this.add.rectangle(width / 2, height / 2, width, height, 0xffffff, 0.85).setDepth(70);
    this.container.add(flash);
    this.tweens.add({ targets: flash, alpha: 0, duration: 320, onComplete: () => flash.destroy() });

    this.tweens.add({ targets: d.obj, scale: d.obj.scale * 1.18, duration: 110, yoyo: true });

    this.drive.cargoComfort = jostleComfort(this.drive.cargoComfort, 6);

    const msg = this.add.text(width / 2, height * 0.34, 'Slow down!', {
      fontSize: TYPE.heading, fontFamily: FONTS.title, fontStyle: 'bold', color: '#ffffff',
      backgroundColor: 'rgba(168,32,32,0.85)', padding: { x: 14, y: 6 },
    }).setOrigin(0.5).setDepth(71).setAlpha(0);
    this.container.add(msg);
    this.tweens.add({ targets: msg, alpha: 1, duration: 150, yoyo: true, hold: 550, onComplete: () => msg.destroy() });
  }

  // ── Exit ───────────────────────────────────────────────────

  private exit(): void {
    this.cleanup();
    if (this.returnTo) {
      this.scene.start(this.returnTo);
    } else {
      this.scene.restart();
    }
  }
}
