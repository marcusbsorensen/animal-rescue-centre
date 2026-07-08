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
} from '../driving/drive-render';
import { TRAFFIC_PROFILES, pickTrafficKind, type TrafficProfile, type TrafficKind } from '../driving/traffic';
import { preferredLane, carAbsoluteSpeed } from '../driving/traffic-sim';
import { ARC_PLACE, placeFor } from '../driving/birchie-places';
import { buildAdjacency, routePolyline, type RoadGraph, type Adjacency, type RoutePoint } from '../driving/road-router';
import { buildManeuvers, nextManeuver, maneuverText, maneuverArrow, type Maneuver } from '../driving/route-instructions';
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
  private vanGfx?: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
  private traffic: TrafficCar[] = [];
  private oncoming: OncomingCar[] = [];
  private scenery: SceneryProp[] = [];
  private decor: DecorProp[] = [];
  private roadConfig: RoadConfig = ROADS['country-lane'];
  private scrollY = 0;
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
    for (const n of ['car-red', 'car-blue', 'car-yellow', 'pickup', 'truck', 'tractor', 'motorbike', 'ambulance']) {
      tryImg(`vehicle-topdown-${n}`, `vehicle-topdown-${n}.png`);
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
    this.destinationId = data?.destinationId ?? 'woodland';
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
  private renderGps(width: number, _height: number): void {
    const pw = 176, ph = 122;
    const px = 12, py = 60; // top-left, below the Back button
    const panel = this.add.graphics().setDepth(46);
    panel.fillStyle(0x2a2a2a, 0.9);
    panel.fillRoundedRect(px - 5, py - 20, pw + 10, ph + 44, 10);
    panel.fillStyle(0x9cc0d6, 1); // sea backdrop behind the map
    panel.fillRoundedRect(px, py, pw, ph, 6);
    this.container.add(panel);
    this.container.add(
      this.add.text(px + pw / 2, py - 11, 'GPS', {
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
      this.container.add(img);
    }
    const toPanel = (p: { fx: number; fy: number }) => ({ x: mapLeft + p.fx * dispW, y: mapTop + p.fy * dispH });
    this.gpsArc = toPanel(ARC_PLACE);
    this.gpsDest = toPanel(placeFor(this.destinationId));

    // Road-following route A.R.C. → destination (Dijkstra on the road graph,
    // straight-line fallback if the network can't connect). Cache the graph.
    if (!this.gpsGraph && this.cache.json.exists('birchie-graph')) {
      this.gpsGraph = this.cache.json.get('birchie-graph') as RoadGraph;
      this.gpsAdj = buildAdjacency(this.gpsGraph);
    }
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

    const route = this.add.graphics().setDepth(47);
    route.lineStyle(3.5, 0x3d8a2e, 0.95);
    route.beginPath();
    route.moveTo(this.gpsRoutePts[0].x, this.gpsRoutePts[0].y);
    for (let i = 1; i < this.gpsRoutePts.length; i++) route.lineTo(this.gpsRoutePts[i].x, this.gpsRoutePts[i].y);
    route.strokePath();
    this.container.add(route);

    // Pins + moving position dot.
    this.container.add(this.add.circle(this.gpsDest.x, this.gpsDest.y, 6, 0xa82020).setStrokeStyle(2, 0xffffff).setDepth(48));
    this.container.add(this.add.circle(this.gpsArc.x, this.gpsArc.y, 5, 0x2e6b8a).setStrokeStyle(2, 0xffffff).setDepth(48));
    this.gpsDot = this.add.circle(this.gpsArc.x, this.gpsArc.y, 5, 0xffd54a).setStrokeStyle(2, 0x3a2e22).setDepth(49);
    this.container.add(this.gpsDot);

    const label = this.destinationId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    this.container.add(
      this.add.text(px + pw / 2, py + ph + 5, `→ ${label}`, {
        fontSize: '12px', fontFamily: FONTS.body, color: '#ffffff',
      }).setOrigin(0.5, 0).setDepth(48)
    );

    // Turn-by-turn instruction banner, just below the GPS panel.
    const by = py + ph + 26, bh = 40;
    this.gpsInstrBg = this.add.graphics().setDepth(47);
    this.gpsInstrBg.fillStyle(0x3d8a2e, 0.95);
    this.gpsInstrBg.fillRoundedRect(px - 5, by, pw + 10, bh, 9);
    this.container.add(this.gpsInstrBg);
    this.gpsInstrArrow = this.add.text(px + 12, by + bh / 2, '▲', {
      fontSize: '24px', fontFamily: FONTS.title, fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5).setDepth(48);
    this.container.add(this.gpsInstrArrow);
    this.gpsInstrText = this.add.text(px + 30, by + bh / 2, 'Off we go!', {
      fontSize: '15px', fontFamily: FONTS.title, fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0, 0.5).setDepth(48);
    this.container.add(this.gpsInstrText);
    this.updateGpsInstruction();
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

    // Henry, parked nose-down toward the exit.
    this.vanY = bayTop + bayH * 0.42;
    this.vanGfx = this.makeVan();
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

  /** Swing Henry onto the road in the chosen direction, then start travelling. */
  private turnAndGo(dir: -1 | 1): void {
    AudioManager.getInstance().playSfx('button_click');
    const van = this.vanGfx;
    if (!van) { this.beginTravel(dir); return; }
    const { width } = this.scale;
    this.tweens.add({
      targets: van,
      angle: 0,                                   // swing from nose-down to nose-up
      x: van.x + dir * width * 0.12,
      duration: 620,
      ease: 'Sine.easeInOut',
      onComplete: () => this.beginTravel(dir),
    });
  }

  private beginTravel(_dir: -1 | 1): void {
    this.phase = 'travel';
    this.renderView();
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
    const count = 5;
    for (let i = 0; i < count; i++) {
      const isCamera = Math.random() < 0.28; // roughly one camera among the props
      const kind = isCamera ? 'speed-camera' : DECOR_KINDS[Math.floor(Math.random() * DECOR_KINDS.length)];
      const key = `decor-${kind}`;
      if (!this.textures.exists(key)) continue;
      const side: -1 | 1 = Math.random() < 0.5 ? -1 : 1;
      const obj = this.makeDecorObj(key, width, side);
      const y = (i / count) * height + Math.random() * 80 - height * 0.2;
      obj.setY(y);
      this.decor.push({ obj, y, size: obj.displayHeight, isCamera, triggered: false });
    }
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

  private spawnInitialTraffic(width: number, height: number): void {
    const yFracs = [0.12, 0.30, 0.02, -0.18, -0.35];
    for (const yFrac of yFracs) {
      this.addTrafficCar(width, height * yFrac, pickTrafficKind(Math.random()));
    }
  }

  // ── Oncoming traffic (opposite carriageway) ────────────────

  private spawnOncoming(width: number, height: number): void {
    if (this.roadConfig.oncomingLanes <= 0) return;
    const count = this.roadConfig.oncomingLanes * 2 + 1;
    for (let i = 0; i < count; i++) {
      this.addOncomingCar((i / count) * height * 1.4 - height * 0.2);
    }
  }

  private oncomingLane(): number {
    return this.roadConfig.playerLanes + Math.floor(Math.random() * this.roadConfig.oncomingLanes);
  }

  private addOncomingCar(y: number): void {
    const geo = this.geo();
    const lane = this.oncomingLane();
    const profile = TRAFFIC_PROFILES[pickTrafficKind(Math.random())];
    const w = Math.round(this.vanW * profile.widthFactor);
    const h = Math.round(this.vanH * profile.lengthFactor);
    const gfx = this.makeTrafficObj(profile, w, h);
    gfx.setPosition(laneCentreX(geo, lane), y);
    gfx.setAngle(180); // facing down, toward us
    gfx.setDepth(15);
    this.container.add(gfx);
    this.oncoming.push({ gfx, lane, y, speed: 4 + Math.random() * 3 });
  }

  private recycleOncoming(o: OncomingCar, y: number): void {
    const geo = this.geo();
    o.lane = this.oncomingLane();
    o.y = y;
    const profile = TRAFFIC_PROFILES[pickTrafficKind(Math.random())];
    const w = Math.round(this.vanW * profile.widthFactor);
    const h = Math.round(this.vanH * profile.lengthFactor);
    o.gfx.destroy();
    o.gfx = this.makeTrafficObj(profile, w, h);
    o.gfx.setPosition(laneCentreX(geo, o.lane), y);
    o.gfx.setAngle(180);
    o.gfx.setDepth(15);
    this.container.add(o.gfx);
    o.speed = 4 + Math.random() * 3;
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
    const next = Math.max(0, Math.min(this.pl() - 1, this.drive.lane + dir));
    if (next === this.drive.lane) return;
    // Safety first: with animals aboard we NEVER swerve into another vehicle.
    // If the target lane is occupied beside us, refuse and give a little nudge.
    if (this.drive.carriesAnimals && this.laneBlockedAt(next, this.vanY)) {
      this.bumpBlocked(dir);
      return;
    }
    this.drive.lane = next;
    AudioManager.getInstance().playSfx('button_click');

    const geo = this.geo();
    const targetX = laneCentreX(geo, next);
    const van = this.vanGfx;
    // Stopping the old tween fires its onStop, which straightens the van, so a
    // rapid second lane change can't leave it stuck mid-bank.
    if (this.laneTween) this.laneTween.stop();
    if (!van) return;
    van.setAngle(0);

    // One tween drives both the glide and the bank: the tilt is derived from
    // the tween's own progress (0 → peak → 0), and is force-reset to 0 on
    // completion or interruption — so the van can never get stuck leaning,
    // including at the far lanes where a further tap early-returns.
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

  /** Is there a vehicle in `lane` beside us (within a safe gap of `y`)? */
  private laneBlockedAt(lane: number, y: number): boolean {
    const safe = this.vanH * 1.15;
    return this.traffic.some((c) => c.lane === lane && Math.abs(c.y - y) < safe);
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
        for (const d of this.decor) {
          const prevY = d.y;
          d.y += rate;
          if (d.isCamera && !d.triggered && prevY < this.vanY && d.y >= this.vanY && this.drive.gear === 3) {
            this.flashSpeedCamera(d);
            d.triggered = true;
          }
          if (d.y > height + d.size + 30) { d.y = -d.size - Math.random() * 80; d.triggered = false; }
          else if (d.y < -d.size - 100) { d.y = height + d.size + Math.random() * 80; d.triggered = false; }
          d.obj.setY(d.y);
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

        // Oncoming traffic sweeps up the screen toward us (closing = our pace +
        // theirs). It's across the divide, so it never touches us — atmosphere.
        for (const o of this.oncoming) {
          o.y -= o.speed + Math.max(rate, 0) * 0.6;
          if (o.y < -this.vanH * 2.2) {
            this.recycleOncoming(o, height + this.vanH * 2 + Math.random() * height * 0.3);
          }
          o.gfx.setY(o.y);
        }

        this.drive.progress = Math.min(1, Math.max(0, this.drive.progress + rate * 0.0004));

        // Advance the GPS position dot along the road route + refresh the turn.
        if (this.gpsDot) {
          const q = this.routePointAt(this.drive.progress);
          this.gpsDot.setPosition(q.x, q.y);
          this.updateGpsInstruction();
        }
      },
    });
  }

  private recycleCar(car: TrafficCar, width: number, y: number): void {
    const geo = this.geo();
    const kind = pickTrafficKind(Math.random());
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

  /** Our forward pace, capped by the nearest slower vehicle ahead in our lane
   *  so the van can't drive through it. Not capped when stopped/reversing. */
  private effectivePlayerRate(gearRate: number): number {
    if (gearRate <= 0) return gearRate;
    const minGap = this.vanH * 1.05;
    const follow = this.vanH * 2.4;
    let cap = gearRate;
    for (const c of this.traffic) {
      if (c.lane !== this.drive.lane || c.y >= this.vanY) continue; // must be ahead
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
   * stuck behind something slower peel off into a clear lane to overtake.
   */
  private resolveTraffic(width: number): void {
    const minGap = this.vanH * 1.05;
    const follow = this.vanH * 2.4;

    for (let lane = 0; lane < this.pl(); lane++) {
      const cars = this.traffic.filter((c) => c.lane === lane);
      if (this.drive.lane === lane) {
        // Cars ahead of the van (closest first) held a gap in front.
        let anchor = this.vanY;
        for (const c of cars.filter((c) => c.y < this.vanY).sort((a, b) => b.y - a.y)) {
          const maxY = anchor - minGap;
          if (c.y > maxY) c.y = maxY;
          anchor = c.y;
        }
        // Cars behind the van (closest first) held a gap behind.
        anchor = this.vanY;
        for (const c of cars.filter((c) => c.y >= this.vanY).sort((a, b) => a.y - b.y)) {
          const minY = anchor + minGap;
          if (c.y < minY) c.y = minY;
          anchor = c.y;
        }
      } else {
        let anchor = -Infinity;
        for (const c of cars.slice().sort((a, b) => a.y - b.y)) {
          const minY = anchor + minGap;
          if (c.y < minY) c.y = minY;
          anchor = c.y;
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
      if (c.lane === this.drive.lane && this.vanY < c.y) {
        const g = c.y - this.vanY;
        if (g < aheadGap) { aheadGap = g; aheadSpeed = 0; } // van as a slow obstacle
      }
      if (aheadGap < follow && aheadSpeed < c.absSpeed * 0.9 && Math.random() < 0.03) {
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
