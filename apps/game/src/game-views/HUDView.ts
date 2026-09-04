import Phaser from 'phaser';
import type { TimeOfDay, Weather } from '@arc/shared-types';
import {
  getRequiredRescuesForLevel,
  getUrgentNeed,
  getMaxShelterAnimals,
} from '@arc/game-logic';
import { AudioManager } from '../audio/AudioManager';
import {
  COLOURS, FONTS, TEXT_RESOLUTION, SAFE_MARGIN, TYPE, SPACE, MIN_TAP, MIN_TAP_GAP,
  CHROME, TITLE_CY, TITLE_PLATE_H, statusRowCy, hexNum,
} from '../ui/constants';
import { createChromePlate } from '../ui/UIButton';
import { playAreaFor, sideNavEnabled, sideNavHeaderLeft, railIsCollapsible } from '../ui/layout';
import type { GameStateStore } from '../game-state';

// Human-readable names for phases + weathers (shown in HUD pills).
const PHASE_LABELS: Record<TimeOfDay, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
};
const WEATHER_LABELS: Record<Weather, string> = {
  sunny: 'Sunny',
  cloudy: 'Cloudy',
  overcast: 'Overcast',
  light_rain: 'Rain',
  heavy_rain: 'Heavy rain',
  snow: 'Snow',
  fog: 'Fog',
  windy: 'Windy',
};
// Map weather to texture keys on disk (snake-case → dashed).
const WEATHER_ICON: Record<Weather, string> = {
  sunny: 'weather-sunny',
  cloudy: 'weather-cloudy',
  overcast: 'weather-overcast',
  light_rain: 'weather-light-rain',
  heavy_rain: 'weather-heavy-rain',
  snow: 'weather-snow',
  fog: 'weather-fog',
  windy: 'weather-windy',
};

/**
 * HUDView — the always-on top strip: level orb, XP bar, arrival /
 * needs-care alert badges, audio toggle, coin + shelter pills.
 *
 * Phase 6 extraction. The HUD is a pure function of the store plus a
 * couple of tap callbacks — no internal state, no animation besides
 * the two pulsing alert badges.
 */

export interface HUDCallbacks {
  /** Tap the green level orb — opens AccountScene (stats/badges). */
  onLevelOrbTap: () => void;
  /** Tap the red arrivals alert — jump to corridor. */
  onArrivalAlertTap: () => void;
  /** Tap the amber needs-care alert — jump to corridor. */
  onCareAlertTap: () => void;
  /** Tap the music-on/off orb — scene toggles audio + re-renders HUD. */
  onAudioToggle: () => void;
  /** Tap the sound-effects chip — side-nav only; the two are separate there. */
  onSfxToggle: () => void;
  /**
   * Press and hold either sound chip — open that one's volume slider.
   *
   * The chip's own position comes with it: the popup anchors under the
   * control the press started from, and only the header knows where the
   * chips landed.
   */
  onAudioVolume: (kind: 'music' | 'sfx', cx: number, cy: number) => void;
}

export function renderHUD(
  scene: Phaser.Scene,
  store: GameStateStore,
  uiContainer: Phaser.GameObjects.Container,
  callbacks: HUDCallbacks,
): void {
  uiContainer.removeAll(true);
  const { width, height } = scene.scale;
  const required = getRequiredRescuesForLevel(store.level);

  // "in care" is the live count of animals in the shelter or garden,
  // NOT the cumulative totalRescued counter. Kids read what they can
  // see in the rooms, so this matches.
  const welcomedCount = store.animals.filter(
    (a) => a.state === 'sheltered' || a.state === 'bonding' || a.state === 'pet',
  ).length;
  const arrivingCount = store.animals.filter((a) => a.state === 'arriving').length;
  const needsCareCount = store.animals.filter((a) => {
    if (a.state !== 'sheltered' && a.state !== 'bonding') return false;
    return getUrgentNeed(a) !== null || store.sickAnimals.has(a.id);
  }).length;
  const xpProgress = Math.min(store.totalRescued / required, 1);
  const shelteredCount = store.animals.filter(
    (a) => a.state === 'sheltered' || a.state === 'bonding',
  ).length;
  const maxShelter = getMaxShelterAnimals(store.level);

  // Under side-nav the strip is not a strip. It is two header blocks —
  // where you are on the left, how you are doing on the right — and it is
  // built somewhere else entirely.
  if (sideNavEnabled()) {
    renderSideNavHeader(scene, store, uiContainer, callbacks, {
      welcomedCount, arrivingCount, needsCareCount,
      shelteredCount, maxShelter, xpProgress,
    });
    return;
  }

  // Constrain to 600px centred, and centre it on the play area rather
  // than the whole screen.
  //
  // Centring on the screen while the views centre their titles on the
  // play area meant the two disagreed by half the rail's width, and on an
  // iPad the shelter pill landed on top of "Cat Room" / "Dog Room" /
  // "Rescue Centre" — visible on every screen in the game. Sharing one
  // origin is what stops that recurring: 600px centred in the play area
  // leaves a gap in the middle that the title sits in, on every viewport
  // from a landscape phone up.
  const play = playAreaFor(width, height);
  // Side-nav spreads the strip to the play area's own edges instead of
  // boxing it into a centred 600. Two reasons: the room title still needs
  // the gap in the middle and a wider strip gives it a bigger one, and
  // the strip is now floating over the art rather than sitting in
  // reserved space — pushing the pills out to the margins keeps them off
  // the part of the painting a child is looking at.
  const maxW = sideNavEnabled() ? play.w : Math.min(play.w, 600);
  const slack = (play.w - maxW) / 2;
  // 10 -> SAFE_MARGIN. The tap circles in this strip are floored at a 24px
  // radius, so a 10px inset left their outer edge 6px from the screen.
  const leftEdge = play.x + slack + SAFE_MARGIN;
  const rightEdge = play.x + play.w - slack - SAFE_MARGIN;
  // 40, not 30. The tap circles in this strip are floored at a 24px radius
  // for small fingers, so a centre at 30 put their top edge 6px from the
  // screen — inside the notch/status area on a phone. 16 + 24 clears it.
  const orbY = SAFE_MARGIN + 24;
  const orbH = 44;

  // ── LEFT: Level orb with XP bar ───────────────────────────
  const leftOrbW = 170;
  const leftX = leftEdge;
  const leftGfx = scene.add.graphics();
  leftGfx.fillStyle(0x000000, 0.14);
  leftGfx.fillRoundedRect(leftX + 2, orbY - orbH / 2 + 3, leftOrbW, orbH, orbH / 2);
  leftGfx.fillStyle(0xffffff, 0.96);
  leftGfx.fillRoundedRect(leftX, orbY - orbH / 2, leftOrbW, orbH, orbH / 2);
  uiContainer.add(leftGfx);

  // Green level circle
  // The tap circle is floored at a 24px radius while the orb art is 22, so
  // centring on the orb alone left the hit area poking 2px past the margin.
  const lvlCx = Math.max(leftX + orbH / 2, SAFE_MARGIN + 24);
  const lvlCircle = scene.add.graphics();
  lvlCircle.fillStyle(0x5AAE4A, 1);
  lvlCircle.fillCircle(lvlCx, orbY, orbH / 2 - 4);
  uiContainer.add(lvlCircle);
  uiContainer.add(
    scene.add.text(lvlCx, orbY, `${store.level}`, {
      fontSize: TYPE.body, fontFamily: FONTS.title, fontStyle: 'bold',
      color: '#ffffff', resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5),
  );

  // "in care" label + XP bar
  const xpX = leftX + orbH + 2;
  const xpW = leftOrbW - orbH - 14;
  uiContainer.add(
    scene.add.text(xpX, orbY - 9, `${welcomedCount} in care`, {
      fontSize: TYPE.caption, fontFamily: FONTS.body, fontStyle: 'bold',
      color: COLOURS.textLight, resolution: TEXT_RESOLUTION,
    }).setOrigin(0, 0.5),
  );
  const xpBar = scene.add.graphics();
  xpBar.fillStyle(0xe6e2d8, 1);
  xpBar.fillRoundedRect(xpX, orbY + 3, xpW, 7, 3.5);
  if (xpProgress > 0) {
    xpBar.fillStyle(0x5AAE4A, 1);
    xpBar.fillRoundedRect(xpX, orbY + 3, Math.max(6, xpW * xpProgress), 7, 3.5);
  }
  uiContainer.add(xpBar);

  // Level orb tappable
  // Hit radius floored at 24 (48px across) — the orb art is 44, which
  // sits in the WARN band for a 7-11 year old's targeting accuracy.
  const orbHit = scene.add.circle(lvlCx, orbY, Math.max(orbH / 2, 24), 0x000000, 0)
    .setInteractive({ useHandCursor: true });
  orbHit.on('pointerdown', () => callbacks.onLevelOrbTap());
  uiContainer.add(orbHit);

  // PROTOTYPE: the red "X arrivals waiting" and amber "needs care"
  // badges used to live here. They've moved into LeftRailView so all
  // pet-status / pet-action UI is in one column. The top strip is now
  // just brand-orbs (level, coins, shelter, audio) + the time/weather
  // pill below.
  void arrivingCount; void needsCareCount;

  // ── RIGHT SIDE: stack orbs from right edge leftward ─────
  // Pulled in by the 24px tap radius rather than the 20px orb radius, for
  // the same reason as lvlCx above.
  let rx = Math.min(rightEdge, width - SAFE_MARGIN - 24 + 20);
  const orbSize = 40;

  // Audio toggle orb (right-most)
  const audioState = AudioManager.getInstance().getState();
  const audioKey = audioState.musicEnabled ? 'icon-music-on' : 'icon-music-off';
  rx = drawIconOrb(scene, uiContainer, {
    iconKey: audioKey,
    fallback: audioState.musicEnabled ? 'ON' : 'OFF',
    cx: rx - orbSize / 2,
    cy: orbY,
    size: orbSize,
    onTap: callbacks.onAudioToggle,
  });

  // Coin pill (painterly hud-coins sign)
  if (store.economy.coins > 0) {
    const coinIcon = scene.textures.exists('hud-coins') ? 'hud-coins' : 'icon-hud-coins';
    rx = drawValuePill(scene, uiContainer, {
      value: `${store.economy.coins}`,
      iconKey: coinIcon,
      iconTint: 0xe3b04b,
      rightEdge: rx,
      cy: orbY,
      orbH,
    });
  }

  // Shelter pill (painterly hud-homes sign)
  if (shelteredCount > 0) {
    const homesIcon = scene.textures.exists('hud-homes') ? 'hud-homes' : 'icon-hud-homes';
    drawValuePill(scene, uiContainer, {
      value: `${shelteredCount}/${maxShelter}`,
      iconKey: homesIcon,
      iconTint: 0x8B6914,
      rightEdge: rx,
      cy: orbY,
      orbH,
    });
  }

  // ── Second row: time + weather strip ─────────────────────
  // Only drawn if the store has been populated with timeProgress + weather
  // (old saves won't have these yet; loadSaveState populates on first load).
  if (store.timeProgress || store.gardenWeather) {
    drawTimeWeatherStrip(scene, uiContainer, store, {
      leftEdge,
      rightEdge,
      cy: orbY + orbH + 8,
    });
  }
}

// ── Time + weather strip ───────────────────────────────────

interface TimeWeatherStripOpts {
  leftEdge: number;
  rightEdge: number;
  cy: number;
}

/**
 * Second HUD row. Two pills, centred horizontally:
 *   [sundial]  Morning  ▓▓▓░░      [☁]  Cloudy
 *
 * The phase pill doubles as a progress indicator for "tasks until next
 * phase" — the bar fills as the player completes care actions, giving
 * Lily visible feedback that time will move when she does things.
 */
function drawTimeWeatherStrip(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  store: GameStateStore,
  opts: TimeWeatherStripOpts,
): void {
  const { leftEdge, rightEdge, cy } = opts;
  const pillH = 28;
  const centre = (leftEdge + rightEdge) / 2;

  /**
   * The two pills are placed as a *pair*, not as two things near a centre.
   *
   * Each used to sit 6px from `centre` on its own side — but they are 160
   * and 130 wide, so the pair spanned `centre-166 .. centre+136` and its own
   * visual centre landed 15px left of the variable that positioned it. On
   * the corridor that put this row on a third vertical axis, 14px from the
   * view title's and 21px from the nav bar's. Nothing was wrong with any one
   * number; the row was simply never measured as a row.
   */
  const PHASE_W = 160;
  const WEATHER_W = 130;
  const PILL_GAP = 12;
  const pairX0 = centre - (PHASE_W + PILL_GAP + WEATHER_W) / 2;

  // Phase pill (left of centre)
  if (store.timeProgress) {
    const { currentPhase, tasksThisPhase, tasksPerPhase } = store.timeProgress;
    const progress = Math.min(1, tasksThisPhase / Math.max(1, tasksPerPhase));
    const pillW = PHASE_W;
    const x0 = pairX0;

    const bg = scene.add.graphics();
    bg.fillStyle(0x000000, 0.12);
    bg.fillRoundedRect(x0 + 1, cy - pillH / 2 + 2, pillW, pillH, pillH / 2);
    bg.fillStyle(0xffffff, 0.96);
    bg.fillRoundedRect(x0, cy - pillH / 2, pillW, pillH, pillH / 2);
    container.add(bg);

    // Sundial/phase icon
    const iconCx = x0 + pillH / 2;
    if (scene.textures.exists('sundial')) {
      scene.textures.get('sundial').setFilter(Phaser.Textures.FilterMode.LINEAR);
      container.add(
        scene.add.image(iconCx, cy, 'sundial').setDisplaySize(22, 22).setOrigin(0.5),
      );
    } else {
      // Unicode glyph fallback if the sundial texture isn't loaded yet
      const fallback = { morning: '\u2600', afternoon: '\u2600', evening: '\u263D', night: '\u263D' }[currentPhase];
      container.add(
        scene.add.text(iconCx, cy, fallback, {
          fontSize: TYPE.caption, fontFamily: FONTS.body,
          color: COLOURS.text, resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5),
      );
    }

    // Phase name
    const labelX = x0 + pillH + 4;
    container.add(
      scene.add.text(labelX, cy - 5, PHASE_LABELS[currentPhase], {
        fontSize: TYPE.caption, fontFamily: FONTS.body, fontStyle: 'bold',
        color: COLOURS.text, resolution: TEXT_RESOLUTION,
      }).setOrigin(0, 0.5),
    );

    // Progress bar
    const barX = labelX;
    const barY = cy + 5;
    const barW = pillW - (pillH + 12);
    const bar = scene.add.graphics();
    bar.fillStyle(0xe6e2d8, 1);
    bar.fillRoundedRect(barX, barY, barW, 4, 2);
    if (progress > 0) {
      bar.fillStyle(0xe3b04b, 1);
      bar.fillRoundedRect(barX, barY, Math.max(3, barW * progress), 4, 2);
    }
    container.add(bar);

    // No hit target on the phase pill. There was one — 160x28, invisible,
    // whose handler console.logged the remaining task count and did nothing a
    // player could see. It was the only control in GameScene under the 48px
    // touch floor (review T1-T3, failing on tablet and desktop), and the fix
    // is not to grow it: a 160x48 invisible rectangle that swallows a tap and
    // answers with nothing teaches a seven-year-old that the screen is
    // unreliable. When the phase tooltip is actually built, give it a visible
    // affordance and 48px of height. Its wording wants
    // `tasksPerPhase - tasksThisPhase` and the next phase's name — the cycle
    // is morning, afternoon, evening, night, back to morning, and
    // PHASE_LABELS has the display strings.
  }

  // Weather pill (right of centre)
  if (store.gardenWeather) {
    const current = store.gardenWeather.current;
    const pillW = WEATHER_W;
    const x0 = pairX0 + PHASE_W + PILL_GAP;

    const bg = scene.add.graphics();
    bg.fillStyle(0x000000, 0.12);
    bg.fillRoundedRect(x0 + 1, cy - pillH / 2 + 2, pillW, pillH, pillH / 2);
    bg.fillStyle(0xffffff, 0.96);
    bg.fillRoundedRect(x0, cy - pillH / 2, pillW, pillH, pillH / 2);
    container.add(bg);

    // Weather icon
    const iconCx = x0 + pillH / 2;
    const iconKey = WEATHER_ICON[current];
    if (scene.textures.exists(iconKey)) {
      scene.textures.get(iconKey).setFilter(Phaser.Textures.FilterMode.LINEAR);
      container.add(
        scene.add.image(iconCx, cy, iconKey).setDisplaySize(24, 24).setOrigin(0.5),
      );
    } else {
      // Unicode fallback so something always renders
      const glyph = ({
        sunny: '\u2600',
        cloudy: '\u26C5',
        overcast: '\u2601',
        light_rain: '\u2614',
        heavy_rain: '\u2614',
        snow: '\u2744',
        fog: '\u2591',
        windy: '\u2248',
      } as Record<Weather, string>)[current];
      container.add(
        scene.add.text(iconCx, cy, glyph, {
          fontSize: '16px', fontFamily: FONTS.body,
          color: COLOURS.text, resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5),
      );
    }

    // Weather label
    container.add(
      scene.add.text(x0 + pillH + 4, cy, WEATHER_LABELS[current], {
        fontSize: TYPE.caption, fontFamily: FONTS.body, fontStyle: 'bold',
        color: COLOURS.text, resolution: TEXT_RESOLUTION,
      }).setOrigin(0, 0.5),
    );
  }
}

// ── Helpers ────────────────────────────────────────────────

interface IconOrbOpts {
  iconKey: string; fallback: string;
  cx: number; cy: number; size: number;
  onTap: () => void;
}

/** Returns the next-available-rx after drawing. */
function drawIconOrb(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  opts: IconOrbOpts,
): number {
  const { iconKey, fallback, cx, cy, size, onTap } = opts;
  const shadow = scene.add.graphics();
  shadow.fillStyle(0x000000, 0.14);
  shadow.fillCircle(cx + 2, cy + 3, size / 2);
  shadow.fillStyle(0xffffff, 0.96);
  shadow.fillCircle(cx, cy, size / 2);
  container.add(shadow);

  if (scene.textures.exists(iconKey)) {
    const img = scene.add.image(cx, cy, iconKey).setDisplaySize(28, 28).setOrigin(0.5);
    scene.textures.get(iconKey).setFilter(Phaser.Textures.FilterMode.LINEAR);
    container.add(img);
  } else {
    container.add(
      scene.add.text(cx, cy, fallback, {
        fontSize: TYPE.caption, fontFamily: FONTS.body, fontStyle: 'bold',
        color: COLOURS.text, resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5),
    );
  }

  const hit = scene.add.circle(cx, cy, Math.max(size / 2, 24), 0x000000, 0)
    .setInteractive({ useHandCursor: true });
  hit.on('pointerdown', onTap);
  container.add(hit);

  return cx - size / 2 - 6;  // next rx
}

interface ValuePillOpts {
  value: string; iconKey: string; iconTint: number;
  rightEdge: number; cy: number; orbH: number;
}

function drawValuePill(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  opts: ValuePillOpts,
): number {
  const { value, iconKey, iconTint, rightEdge, cy, orbH } = opts;
  const pillW = 70;
  const x0 = rightEdge - pillW;

  const gfx = scene.add.graphics();
  gfx.fillStyle(0x000000, 0.14);
  gfx.fillRoundedRect(x0 + 2, cy - orbH / 2 + 3, pillW, orbH, orbH / 2);
  gfx.fillStyle(0xffffff, 0.96);
  gfx.fillRoundedRect(x0, cy - orbH / 2, pillW, orbH, orbH / 2);
  container.add(gfx);

  const circ = scene.add.graphics();
  circ.fillStyle(iconTint, 1);
  circ.fillCircle(x0 + orbH / 2, cy, orbH / 2 - 5);
  container.add(circ);

  if (scene.textures.exists(iconKey)) {
    scene.textures.get(iconKey).setFilter(Phaser.Textures.FilterMode.LINEAR);
    container.add(
      scene.add.image(x0 + orbH / 2, cy, iconKey).setDisplaySize(28, 28).setOrigin(0.5),
    );
  }

  container.add(
    scene.add.text(x0 + orbH + 2, cy, value, {
      fontSize: TYPE.caption, fontFamily: FONTS.body, fontStyle: 'bold',
      color: COLOURS.text, resolution: TEXT_RESOLUTION,
    }).setOrigin(0, 0.5),
  );

  return x0 - 6;  // next rx
}

// ── Side-nav header ────────────────────────────────────────
//
// Two blocks instead of a strip.
//
// **Left — where you are.** The room title (drawn by the view, starting on
// the nav rail) and, under it, the world's state as icons alone: the phase
// with its progress as a ring, and the weather. The words went because
// "Morning" and "Sunny" are the two most redundant strings in the game —
// the sky in the art behind them already says both — and because a row of
// two 160px worded pills was spending a fifth of the width saying it.
//
// **Right — how you are doing.** One wider plate mirroring the title:
// level, what is in care, coins, homes, and the arrivals badge that opens
// the rail. That badge is what replaced the vertical pull-tab on the right
// edge; a 56px column of chrome for one number was the thing this layout
// could least afford, and it is the same information.
//
// **Under it — the two sounds.** Music and effects, separately, because
// they are separately wanted: a child who needs the game quiet in a room
// with other people still wants to know the button she pressed did
// something. Tap toggles; press and hold opens that one's volume.

/** Radius of a status or audio chip. Clears MIN_TAP across, with room. */
const CHIP_R = 22;

interface HeaderCounts {
  welcomedCount: number;
  arrivingCount: number;
  needsCareCount: number;
  shelteredCount: number;
  maxShelter: number;
  xpProgress: number;
}

function renderSideNavHeader(
  scene: Phaser.Scene,
  store: GameStateStore,
  container: Phaser.GameObjects.Container,
  callbacks: HUDCallbacks,
  counts: HeaderCounts,
): void {
  const { width, height } = scene.scale;
  const play = playAreaFor(width, height);
  const chipCy = statusRowCy(CHIP_R);

  // ── Left: the world's state, icons only ─────────────────
  const leftX = sideNavHeaderLeft();
  let cx = leftX + CHIP_R;

  if (store.timeProgress) {
    const { currentPhase, tasksThisPhase, tasksPerPhase } = store.timeProgress;
    const progress = Math.min(1, tasksThisPhase / Math.max(1, tasksPerPhase));
    // The phase pill's progress bar was the one thing on that row a child
    // could not get from the sky: how close her care work is to moving the
    // day on. It survives as a ring around the chip rather than a bar
    // beside a word.
    drawStatusChip(scene, container, {
      cx, cy: chipCy,
      iconKey: scene.textures.exists('sundial') ? 'sundial' : '',
      fallbackGlyph: currentPhase === 'night' || currentPhase === 'evening' ? '☽' : '☀',
      label: PHASE_LABELS[currentPhase],
      progress,
    });
    cx += CHIP_R * 2 + SPACE.s;
  }

  if (store.gardenWeather) {
    const weather = store.gardenWeather.current;
    const key = WEATHER_ICON[weather];
    drawStatusChip(scene, container, {
      cx, cy: chipCy,
      iconKey: scene.textures.exists(key) ? key : '',
      fallbackGlyph: '☁',
      label: WEATHER_LABELS[weather],
    });
  }

  // ── Right: the player's own numbers, on one plate ────────
  const rightEdge = play.x + play.w - SAFE_MARGIN;
  const panelH = TITLE_PLATE_H;
  const orbR = (panelH - 14) / 2;

  const coinText = `${store.economy.coins}`;
  const homeText = `${counts.shelteredCount}/${counts.maxShelter}`;
  const careText = `${counts.welcomedCount}`;
  const alerts = counts.arrivingCount + counts.needsCareCount;

  // The badge is a *handle* for the arrivals rail, so it has nothing to
  // offer on a viewport where that rail already stands open — an iPad
  // shows the counts and the Welcome buttons themselves, and a badge
  // beside them is a duplicate control on the screen with the most
  // controls already. `railIsCollapsible` is the same test the rail uses
  // to decide whether it collapses at all.
  const showAlerts = alerts > 0 && railIsCollapsible(width);

  const SEG = 52;
  const segments = 2 + (store.economy.coins > 0 ? 1 : 0) + 1 + (showAlerts ? 1 : 0);
  const panelW = CHROME.padX * 2 + segments * SEG;
  const panelCx = rightEdge - panelW / 2;

  container.add(createChromePlate(scene, panelCx, TITLE_CY, panelW, panelH));

  let sx = panelCx - panelW / 2 + CHROME.padX + SEG / 2;

  // Level orb — the one control on this plate that goes somewhere else.
  const lvlGfx = scene.add.graphics();
  lvlGfx.fillStyle(hexNum(COLOURS.primary), 1);
  lvlGfx.fillCircle(sx, TITLE_CY, orbR);
  container.add(lvlGfx);
  container.add(
    scene.add.text(sx, TITLE_CY, `${store.level}`, {
      fontSize: TYPE.caption, fontFamily: FONTS.title, fontStyle: 'bold',
      color: COLOURS.white, resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5),
  );
  // The XP ring, where the XP bar used to be. A bar needs a run of width
  // this plate does not have to spare; a ring needs none.
  const xpRing = scene.add.graphics();
  xpRing.lineStyle(3, hexNum(COLOURS.primaryLight), 0.9);
  xpRing.beginPath();
  xpRing.arc(sx, TITLE_CY, orbR + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * counts.xpProgress);
  xpRing.strokePath();
  container.add(xpRing);
  const lvlHit = scene.add.circle(sx, TITLE_CY, Math.max(orbR + 4, MIN_TAP / 2), 0x000000, 0)
    .setInteractive({ useHandCursor: true });
  lvlHit.on('pointerdown', () => callbacks.onLevelOrbTap());
  container.add(lvlHit);
  sx += SEG;

  sx = drawPanelStat(scene, container, {
    cx: sx, cy: TITLE_CY, value: careText,
    iconKey: scene.textures.exists('nav-care') ? 'nav-care' : 'icon-kitchen',
    seg: SEG,
  });

  if (store.economy.coins > 0) {
    sx = drawPanelStat(scene, container, {
      cx: sx, cy: TITLE_CY, value: coinText,
      iconKey: scene.textures.exists('hud-coins') ? 'hud-coins' : 'icon-hud-coins',
      seg: SEG,
    });
  }

  sx = drawPanelStat(scene, container, {
    cx: sx, cy: TITLE_CY, value: homeText,
    iconKey: scene.textures.exists('hud-homes') ? 'hud-homes' : 'icon-hud-homes',
    seg: SEG,
  });

  // Arrivals badge — the pull-tab's replacement, and the way into the rail.
  if (showAlerts) {
    const badge = scene.add.graphics();
    badge.fillStyle(hexNum(counts.arrivingCount > 0 ? COLOURS.accent : COLOURS.warm), 1);
    badge.fillCircle(sx, TITLE_CY, orbR);
    container.add(badge);
    container.add(
      scene.add.text(sx, TITLE_CY, `${alerts}`, {
        fontSize: TYPE.caption, fontFamily: FONTS.title, fontStyle: 'bold',
        color: COLOURS.white, resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5),
    );
    const hit = scene.add.circle(sx, TITLE_CY, Math.max(orbR + 4, MIN_TAP / 2), 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => callbacks.onArrivalAlertTap());
    container.add(hit);
    // The one pulse left in the HUD. It marks the only thing on this plate
    // that is asking for something rather than reporting it.
    scene.tweens.add({
      targets: badge, alpha: 0.55, duration: 900,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  // ── Under it: the two sounds ─────────────────────────────
  // Words, not icons, and only because the art does not exist: there is an
  // `icon-music-on`/`off` pair and nothing at all for effects, so a pair of
  // wordless chips would be one speaker icon and one guess. Two pills is
  // the honest interim; an effects icon is a commission.
  //
  // Both filled while both are on, which the `variant` doc warns against
  // for *emphasis* — but these are toggles, and two toggles that are on
  // reading as on is the state, not a shout.
  const audio = AudioManager.getInstance().getState();
  const musicX = rightEdge - AUDIO_PILL_W / 2;
  const sfxX = musicX - AUDIO_PILL_W - MIN_TAP_GAP;
  drawAudioPill(scene, container, {
    cx: musicX, cy: chipCy, on: audio.musicEnabled, label: 'Music',
    iconKey: audio.musicEnabled ? 'icon-music-on' : 'icon-music-off',
    onTap: callbacks.onAudioToggle,
    onHold: () => callbacks.onAudioVolume('music', musicX, chipCy),
  });
  drawAudioPill(scene, container, {
    cx: sfxX, cy: chipCy, on: audio.sfxEnabled, label: 'Sounds',
    onTap: callbacks.onSfxToggle,
    onHold: () => callbacks.onAudioVolume('sfx', sfxX, chipCy),
  });
}

interface StatusChipOpts {
  cx: number;
  cy: number;
  iconKey: string;
  fallbackGlyph: string;
  /** Kept on the object rather than drawn — see the note in drawStatusChip. */
  label: string;
  progress?: number;
}

/**
 * One icon-only status chip.
 *
 * The label is set as data rather than drawn. `ux-review` harvests text
 * runs to check that nothing on screen is unreadable, and an icon with no
 * word attached anywhere is a thing no measurement can name — so the word
 * still exists, it simply is not ink.
 */
function drawStatusChip(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  opts: StatusChipOpts,
): void {
  const { cx, cy, iconKey, fallbackGlyph, label, progress } = opts;

  const plate = createChromePlate(scene, cx, cy, CHIP_R * 2, CHIP_R * 2, { radius: CHIP_R });
  plate.setData('label', label);
  container.add(plate);

  if (progress !== undefined) {
    const ring = scene.add.graphics();
    ring.lineStyle(3, hexNum(COLOURS.warm), 0.85);
    ring.beginPath();
    ring.arc(cx, cy, CHIP_R - 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ring.strokePath();
    container.add(ring);
  }

  if (iconKey) {
    scene.textures.get(iconKey).setFilter(Phaser.Textures.FilterMode.LINEAR);
    container.add(
      scene.add.image(cx, cy, iconKey).setDisplaySize(CHIP_R * 1.3, CHIP_R * 1.3).setOrigin(0.5),
    );
  } else {
    container.add(
      scene.add.text(cx, cy, fallbackGlyph, {
        fontSize: TYPE.body, fontFamily: FONTS.body,
        color: COLOURS.text, resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5),
    );
  }
}

interface PanelStatOpts {
  cx: number;
  cy: number;
  value: string;
  iconKey: string;
  seg: number;
}

/** An icon and its number, one segment of the player panel. Returns the next x. */
function drawPanelStat(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  opts: PanelStatOpts,
): number {
  const { cx, cy, value, iconKey, seg } = opts;
  if (scene.textures.exists(iconKey)) {
    scene.textures.get(iconKey).setFilter(Phaser.Textures.FilterMode.LINEAR);
    container.add(
      scene.add.image(cx - 11, cy, iconKey).setDisplaySize(24, 24).setOrigin(0.5),
    );
  }
  container.add(
    scene.add.text(cx + 6, cy, value, {
      fontSize: TYPE.caption, fontFamily: FONTS.title, fontStyle: 'bold',
      color: CHROME.ink, resolution: TEXT_RESOLUTION,
    }).setOrigin(0, 0.5),
  );
  return cx + seg;
}

/** Width of a sound pill — "Sounds" at TYPE.caption plus the plate's padding. */
const AUDIO_PILL_W = 84;

interface AudioPillOpts {
  cx: number;
  cy: number;
  on: boolean;
  label: string;
  /** Optional; only Music has art. See the note at the call site. */
  iconKey?: string;
  onTap: () => void;
  onHold: () => void;
}

/**
 * A sound toggle. Tap flips it; press and hold opens its volume.
 *
 * A second gesture on one control is normally how a child loses a feature
 * she never discovers. It is acceptable here because the whole feature is
 * *behind* the thing the tap already does: nothing becomes unreachable if
 * the hold is never found, and the tap is the action a seven-year-old
 * actually wants — off, now, because someone is talking.
 */
function drawAudioPill(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  opts: AudioPillOpts,
): void {
  const { cx, cy, on, label, iconKey, onTap, onHold } = opts;
  const h = CHIP_R * 2;

  container.add(createChromePlate(scene, cx, cy, AUDIO_PILL_W, h, {
    radius: CHIP_R,
    variant: on ? 'filled' : 'plate',
  }));

  // The music glyphs carry their own colours — a green speaker, a grey one
  // with a red cross — so they are `artwork` and are never tinted. That is
  // also why the icon alone would do for Music and cannot for Sounds.
  const hasIcon = !!iconKey && scene.textures.exists(iconKey);
  if (hasIcon) {
    scene.textures.get(iconKey!).setFilter(Phaser.Textures.FilterMode.LINEAR);
    container.add(
      scene.add.image(cx - AUDIO_PILL_W / 2 + 18, cy, iconKey!)
        .setDisplaySize(20, 20).setOrigin(0.5),
    );
  }
  container.add(
    scene.add.text(hasIcon ? cx + 8 : cx, cy, label, {
      fontSize: TYPE.caption, fontFamily: FONTS.ui, fontStyle: 'bold',
      color: on ? COLOURS.bg : CHROME.inkMuted, resolution: TEXT_RESOLUTION,
    }).setOrigin(hasIcon ? 0.5 : 0.5, 0.5),
  );

  const hit = scene.add.rectangle(cx, cy, Math.max(AUDIO_PILL_W, MIN_TAP), Math.max(h, MIN_TAP), 0x000000, 0)
    .setInteractive({ useHandCursor: true });
  let held = false;
  let timer: Phaser.Time.TimerEvent | undefined;
  hit.on('pointerdown', () => {
    held = false;
    timer = scene.time.delayedCall(450, () => { held = true; onHold(); });
  });
  hit.on('pointerup', () => {
    timer?.destroy();
    if (!held) onTap();
  });
  // A finger that slides off mid-hold has not asked for either thing.
  hit.on('pointerout', () => { timer?.destroy(); held = false; });
  container.add(hit);
}

/**
 * The volume popup a long press on a sound chip opens.
 *
 * Drawn into its own container at a depth above the HUD, dismissed by a
 * tap anywhere else. The track answers a tap along its whole length as
 * well as a drag: dragging a knob is a fine-motor task, and a child who
 * wants it quieter can simply touch the quiet end.
 *
 * Returns the container so the caller can destroy it; it also destroys
 * itself on dismiss.
 */
export function showVolumeSlider(
  scene: Phaser.Scene,
  opts: {
    cx: number;
    cy: number;
    label: string;
    value: number;
    onChange: (v: number) => void;
  },
): Phaser.GameObjects.Container {
  const { cx, label, value, onChange } = opts;
  const W = 168;
  const H = 64;
  const TRACK = W - CHROME.padX * 2;
  const { width } = scene.scale;

  // Below the chip, not above it: the chips sit under the header plate and
  // there is nothing but art beneath them, whereas above is the panel the
  // press started from.
  const py = opts.cy + CHIP_R + 8 + H / 2;
  // Kept inside the screen — the effects chip is two chip-widths in from
  // the right edge and a 168-wide popup centred on it would hang off.
  const px = Phaser.Math.Clamp(cx, SAFE_MARGIN + W / 2, width - SAFE_MARGIN - W / 2);

  const container = scene.add.container(0, 0).setDepth(900);

  // Full-screen catcher first, so it sits under the popup's own art and a
  // tap anywhere else closes rather than falling through to the room.
  const catcher = scene.add.rectangle(width / 2, scene.scale.height / 2, width, scene.scale.height, 0x000000, 0)
    .setInteractive();
  catcher.on('pointerdown', () => container.destroy(true));
  container.add(catcher);

  container.add(createChromePlate(scene, px, py, W, H));
  container.add(
    scene.add.text(px, py - 16, label, {
      fontSize: TYPE.caption, fontFamily: FONTS.body, fontStyle: 'bold',
      color: CHROME.ink, resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5),
  );

  const trackX0 = px - TRACK / 2;
  const trackY = py + 10;
  const bar = scene.add.graphics();
  const knob = scene.add.circle(0, trackY, 11, hexNum(COLOURS.primary));
  const paint = (v: number) => {
    bar.clear();
    bar.fillStyle(hexNum(COLOURS.inputBorder), 1);
    bar.fillRoundedRect(trackX0, trackY - 4, TRACK, 8, 4);
    bar.fillStyle(hexNum(COLOURS.primary), 1);
    bar.fillRoundedRect(trackX0, trackY - 4, Math.max(8, TRACK * v), 8, 4);
    knob.setX(trackX0 + TRACK * v);
  };
  container.add(bar);
  container.add(knob);
  paint(value);

  // The whole track answers, floored at MIN_TAP tall so the band a finger
  // has to find is a finger's worth rather than the 8px bar's.
  const hit = scene.add.rectangle(px, trackY, TRACK + 22, MIN_TAP, 0x000000, 0)
    .setInteractive({ draggable: true, useHandCursor: true });
  const set = (pointer: Phaser.Input.Pointer) => {
    const v = Phaser.Math.Clamp((pointer.x - trackX0) / TRACK, 0, 1);
    paint(v);
    onChange(v);
  };
  hit.on('pointerdown', set);
  hit.on('drag', set);
  container.add(hit);

  return container;
}
