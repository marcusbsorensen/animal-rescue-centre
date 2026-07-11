import Phaser from 'phaser';
import { COLOURS, FONTS } from '../ui/constants';
import { createButton } from '../ui/UIButton';
import { AudioManager } from '../audio/AudioManager';
import type { Economy } from '@arc/shared-types';
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
  drawTopDownVan,
  drawTrafficVehicle,
  drawSceneryItem,
  roadGeometry,
  laneCentreX,
  vanSizeForLane,
  isOvertakingZone,
} from '../driving/drive-render';
import { TRAFFIC_PROFILES, pickTrafficKind, pickFrom, isBusSeason, type TrafficProfile, type TrafficKind } from '../driving/traffic';
import { preferredLane, carAbsoluteSpeed } from '../driving/traffic-sim';
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
  tractor: ['vehicle-topdown-tractor'],
  motorbike: ['vehicle-topdown-motorbike'],
  emergency: ['vehicle-topdown-ambulance'],
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

export interface PtvDriveInit {
  driveType?: DriveType;
  destinationId?: string;
  level?: number;
  economy?: Economy;
  weather?: string;
  returnTo?: string;
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
  private drive!: DriveState;
  private returnTo?: string;

  // Phase: the drive opens in the A.R.C. car park, then joins the road.
  private phase: 'parking' | 'travel' = 'parking';

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

  private keys?: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    r: Phaser.Input.Keyboard.Key;
    space: Phaser.Input.Keyboard.Key;
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
    for (const n of ['car-red', 'car-blue', 'car-yellow', 'pickup', 'truck', 'tractor', 'motorbike', 'ambulance', 'bus', 'binlorry']) {
      tryImg(`vehicle-topdown-${n}`, `vehicle-topdown-${n}.png`);
    }
    for (const n of ['empty', '1', '2', '3', '4', '5']) {
      tryImg(`vehicle-topdown-skiptruck-${n}`, `vehicle-topdown-skiptruck-${n}.png`);
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
    // Dev: ?ptvDemo=1&dest=<id> lets Marcus test any route/turns; else woodland.
    const urlDest = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('dest') ?? undefined
      : undefined;
    this.destinationId = data?.destinationId ?? urlDest ?? 'woodland';
    this.phase = 'parking';
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
    this.autoRoad = true;
    this.roadSwitching = false;
    this.gpsInstrText = undefined;
    this.gpsInstrArrow = undefined;
    this.gpsInstrBg = undefined;
  }

  create(): void {
    const audio = AudioManager.getInstance();
    audio.setScene(this);
    audio.playSceneMusic('walk'); // reuse the journey track until a PTV track lands

    this.container = this.add.container(0, 0);
    this.renderView();

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

    if (this.phase === 'parking') {
      this.renderParking(width, height);
    } else {
      this.renderTravel(width, height, geo);
    }
  }

  /** Build the van object — the painted Henry sprite if loaded, else the
   *  procedural top-down van. Both are Transform game objects, so lane tweens,
   *  banking and the handbrake judder work either way. */
  private makeVan(): Phaser.GameObjects.Image | Phaser.GameObjects.Graphics {
    if (this.textures.exists('vehicle-topdown-henry')) {
      const img = this.add.image(0, 0, 'vehicle-topdown-henry');
      img.setScale(this.vanW / img.width);
      return img;
    }
    const gfx = this.add.graphics();
    drawTopDownVan(gfx, this.vanW, this.vanH, 0xf3ede0);
    return gfx;
  }

  private renderTravel(width: number, height: number, geo: ReturnType<typeof roadGeometry>): void {
    // Keep the van within the player's lanes (a country lane has just one).
    this.drive.lane = Math.max(0, Math.min(this.pl() - 1, this.drive.lane));

    // Road (redrawn every tick).
    this.roadGfx = this.add.graphics();
    this.container.add(this.roadGfx);

    // Vehicle dropshadows — one layer, redrawn each frame, below the vehicles
    // (depth 13) but above the road, so shadows track every vehicle on any
    // surface without any baked-in art shadow.
    this.shadowGfx = this.add.graphics().setDepth(13);
    this.container.add(this.shadowGfx);

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
        fontSize: '13px', fontFamily: FONTS.title, fontStyle: 'bold', color: '#ffffff',
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
        fontSize: '12px', fontFamily: FONTS.body, color: '#ffffff',
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
      fontSize: '15px', fontFamily: FONTS.title, fontStyle: 'bold', color: '#ffffff',
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

  // ── Parking-lot start ──────────────────────────────────────

  /**
   * The drive opens on the A.R.C. gravel forecourt: the top of the Art Deco
   * building sits behind (above), Henry is in his labelled bay, and the player
   * pulls out and turns left or right onto the road — matching the tunnel-game
   * site view. Then it hands off to travel mode.
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
      const target = Math.min(width * 0.5, height * 0.52);
      b.setDisplaySize(target, target);
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

    // Henry's bay label.
    const henryBay = 1; // second bay from the left
    const henryX = bayLeft + bayW * (henryBay + 0.5);
    this.container.add(
      this.add.text(henryX, bayTop + bayH - 12, 'Henry', {
        fontSize: '13px', fontFamily: FONTS.title, color: '#e8dcc8',
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
    const parkImg = this.vanGfx as Phaser.GameObjects.Image;
    if (parkImg.width) parkImg.setScale((bayW * 0.64) / parkImg.width);
    this.vanGfx.setPosition(henryX, this.vanY);
    this.vanGfx.setAngle(180); // nose pointing down toward the forecourt exit
    this.vanGfx.setDepth(20);
    this.container.add(this.vanGfx);

    // Title + "Let's go!" prompt.
    this.container.add(
      this.add.text(width / 2, height * 0.55, 'Time for a drive!', {
        fontSize: '22px', fontFamily: FONTS.title, fontStyle: 'bold', color: COLOURS.text,
        backgroundColor: 'rgba(255,249,239,0.7)', padding: { x: 12, y: 4 },
      }).setOrigin(0.5).setDepth(45)
    );
    const go = createButton(this, width / 2, roadY - 34, "Let's go!", () => this.pullOutOfBay(width, height, roadY), {
      width: 180, bgColour: COLOURS.primary,
    }).setDepth(45);
    this.container.add(go);

    this.container.add(
      createButton(this, 54, 34, 'Back', () => this.exit(), { width: 88, bgColour: COLOURS.warm }).setDepth(45)
    );
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
        fontSize: '24px', fontFamily: FONTS.title, fontStyle: 'bold', color: COLOURS.text,
        backgroundColor: 'rgba(255,249,239,0.85)', padding: { x: 14, y: 6 },
      }).setOrigin(0.5).setDepth(50)
    );
    this.container.add(
      createButton(this, width * 0.32, height * 0.62, '◀ Left', () => this.turnAndGo(-1), {
        width: 150, bgColour: COLOURS.info,
      }).setDepth(50)
    );
    this.container.add(
      createButton(this, width * 0.68, height * 0.62, 'Right ▶', () => this.turnAndGo(1), {
        width: 150, bgColour: COLOURS.info,
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
      fontSize: '22px', fontFamily: FONTS.title, fontStyle: 'bold', color: '#ffffff',
      backgroundColor: 'rgba(46,107,138,0.92)', padding: { x: 16, y: 7 },
    }).setOrigin(0.5).setDepth(82).setAlpha(0);
    this.container.add(t);
    this.tweens.add({ targets: t, alpha: 1, duration: 200, yoyo: true, hold: 900, onComplete: () => t.destroy() });
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
      this.container.add(gfx);
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
    this.container.add(img);
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
    const gfx = this.makeTrafficObj(profile, w, h);
    gfx.setPosition(laneCentreX(geo, lane), y);
    gfx.setAngle(180); // facing down, toward us
    gfx.setDepth(15);
    this.container.add(gfx);
    this.oncoming.push({ gfx, lane, y, speed: ONCOMING_SPEED });
  }

  /** While overtaking, hold the oncoming cars approaching in our overtake lane
   *  in a neat queue a safe gap above the van, so none drive through us. They
   *  resume the instant we pull back in (`overtaking` goes false). */
  private holdOncomingForOvertake(): void {
    const lane = this.pl(); // the first oncoming lane — the one we're out in
    const gap = this.vanH * 1.6; // stop this far above the van
    const spacing = this.vanH * 1.8; // spacing within the waiting queue
    const queue = this.oncoming
      .filter((o) => o.lane === lane && o.y <= this.vanY + this.vanH * 0.5)
      .sort((a, b) => b.y - a.y); // nearest the van (largest y) first
    let ceiling = this.vanY - gap;
    for (const o of queue) {
      if (o.y > ceiling) o.y = ceiling;
      ceiling = o.y - spacing;
    }
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
    o.gfx = this.makeTrafficObj(profile, w, h);
    o.gfx.setPosition(laneCentreX(geo, o.lane), o.y);
    o.gfx.setAngle(180);
    o.gfx.setDepth(15);
    this.container.add(o.gfx);
    o.speed = ONCOMING_SPEED;
  }

  /** Choose a lane for a vehicle: mostly its preferred (slow vehicles slow
   *  lane, fast vehicles fast lane), with an occasional neighbour for variety. */
  private assignLane(profile: TrafficProfile): number {
    const base = preferredLane(profile, this.pl());
    if (Math.random() < 0.62) return base;
    const j = Math.random() < 0.5 ? -1 : 1;
    return Math.max(0, Math.min(this.pl() - 1, base + j));
  }

  /** A traffic vehicle object — painted sprite if one is loaded for the kind,
   *  else the procedural draw. Sprites scale to the target width, keeping their
   *  own aspect. */
  private makeTrafficObj(profile: TrafficProfile, w: number, h: number): Phaser.GameObjects.Image | Phaser.GameObjects.Graphics {
    const existing = TRAFFIC_SPRITE_KEYS[profile.kind].filter((k) => this.textures.exists(k));
    if (existing.length) {
      const key = existing[Math.floor(Math.random() * existing.length)];
      const img = this.add.image(0, 0, key);
      img.setScale(w / img.width);
      return img;
    }
    const gfx = this.add.graphics();
    drawTrafficVehicle(gfx, profile.kind, w, h, profile.colour);
    return gfx;
  }

  private addTrafficCar(width: number, y: number, kind: keyof typeof TRAFFIC_PROFILES): void {
    const geo = this.geo();
    const profile = TRAFFIC_PROFILES[kind];
    const lane = this.assignLane(profile);
    const w = Math.round(this.vanW * profile.widthFactor);
    const h = Math.round(this.vanH * profile.lengthFactor);
    const gfx = this.makeTrafficObj(profile, w, h);
    gfx.setPosition(laneCentreX(geo, lane), y);
    gfx.setDepth(15);
    this.container.add(gfx);
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
      fontSize: '20px', fontFamily: FONTS.title, fontStyle: 'bold', color: COLOURS.white,
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
      createButton(this, 54, 34, 'Back', () => this.exit(), {
        width: 88, bgColour: COLOURS.warm,
      }).setDepth(40)
    );

    // Road-type toggle (demo): cycle country lane / Thanet Way / gravel / sand.
    this.container.add(
      createButton(this, width - 96, 34, this.roadConfig.label, () => this.cycleRoad(), {
        width: 168, bgColour: COLOURS.info, fontSize: '14px',
      }).setDepth(40)
    );

    this.renderGearStick(width, height);

    // Gentle hint.
    this.container.add(
      this.add.text(width / 2, height - 14, 'Tap left or right to change lane   ·   Spacebar = emergency stop!', {
        fontSize: '13px', fontFamily: FONTS.body, color: COLOURS.textLight,
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
      fontSize: '30px', fontFamily: FONTS.title, fontStyle: 'bold',
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
        fontSize: '12px', fontFamily: FONTS.title, fontStyle: 'bold', color: COLOURS.white,
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
          fontSize: '18px', fontFamily: FONTS.title, fontStyle: 'bold',
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
      };
      this.keys.left.on('down', () => this.moveLane(-1));
      this.keys.a.on('down', () => this.moveLane(-1));
      this.keys.right.on('down', () => this.moveLane(1));
      this.keys.d.on('down', () => this.moveLane(1));
      this.keys.up.on('down', () => this.setGear(cycleGear(this.drive.gear, 1)));
      this.keys.down.on('down', () => this.setGear(cycleGear(this.drive.gear, -1)));
      this.keys.r.on('down', () => this.setGear(REVERSE));
      this.keys.space.on('down', () => this.emergencyBrake());
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
    this.drive.gear = gear;
    AudioManager.getInstance().playSfx('button_click');
    const y = this.gearSlotY[String(gear)];
    if (this.gearKnob && y !== undefined) {
      this.tweens.add({ targets: this.gearKnob, y, duration: 140, ease: 'Sine.easeOut' });
    }
  }

  // ── Drive loop ─────────────────────────────────────────────

  private startDriveLoop(): void {
    const { width, height } = this.scale;
    const margin = this.vanH * 1.4;

    this.driveTimer = this.time.addEvent({
      delay: 50,
      loop: true,
      callback: () => {
        // Our forward pace is the gear's rate, but capped so we can't drive
        // through a slower vehicle ahead in our lane — we tuck in behind until
        // we pull out to overtake.
        const gearRate = gearScrollRate(this.drive.gear);
        const rate = this.effectivePlayerRate(gearRate);
        this.scrollY += rate;

        if (this.roadGfx) drawRoadForConfig(this.roadGfx, width, height, this.scrollY, this.geo(), this.roadConfig);

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
        // pace + our forward pace). Normally across the divide, so it never
        // touches us — but while we're out overtaking in its lane, it holds back
        // and waits above us until we pull in (behaviour 3).
        for (const o of this.oncoming) {
          o.y += o.speed + Math.max(rate, 0) * 0.6;
        }
        if (this.overtaking) this.holdOncomingForOvertake();
        for (const o of this.oncoming) {
          if (o.y > height + this.vanH * 2.2) this.recycleOncoming(o);
          o.gfx.setY(o.y);
        }

        // Soft dropshadow under every vehicle, redrawn now they're all placed.
        this.drawShadows();

        this.drive.progress = Math.min(1, Math.max(0, this.drive.progress + rate * 0.0004));

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
    car.gfx = this.makeTrafficObj(car.profile, w, h);
    car.gfx.setPosition(laneCentreX(geo, car.lane), y);
    car.gfx.setDepth(15);
    this.container.add(car.gfx);
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

    // Out overtaking in the oncoming lane. With animals aboard we must never
    // crash: if we're closing on the held oncoming queue ahead, STOP and wait
    // for a gap to pull back in. Empty (fun) runs press on — the oncoming waits.
    if (this.overtaking) {
      if (!this.drive.carriesAnimals) return gearRate;
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
      if (target < 0 || target > this.pl() - 1) continue;
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
      fontSize: '26px', fontFamily: FONTS.title, fontStyle: 'bold', color: '#ffffff',
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
