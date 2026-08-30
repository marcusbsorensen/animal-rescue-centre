import Phaser from 'phaser';
import type { TimeOfDay, Weather } from '@arc/shared-types';
import {
  getRequiredRescuesForLevel,
  getUrgentNeed,
  getMaxShelterAnimals,
} from '@arc/game-logic';
import { AudioManager } from '../audio/AudioManager';
import { COLOURS, FONTS, TEXT_RESOLUTION, SAFE_MARGIN } from '../ui/constants';
import { playAreaFor } from '../ui/layout';
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
  const maxW = Math.min(play.w, 600);
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
      fontSize: '18px', fontFamily: FONTS.title, fontStyle: 'bold',
      color: '#ffffff', resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5),
  );

  // "in care" label + XP bar
  const xpX = leftX + orbH + 2;
  const xpW = leftOrbW - orbH - 14;
  uiContainer.add(
    scene.add.text(xpX, orbY - 9, `${welcomedCount} in care`, {
      fontSize: '14px', fontFamily: FONTS.body, fontStyle: 'bold',
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

  // Phase pill (left of centre)
  if (store.timeProgress) {
    const { currentPhase, tasksThisPhase, tasksPerPhase } = store.timeProgress;
    const progress = Math.min(1, tasksThisPhase / Math.max(1, tasksPerPhase));
    const pillW = 160;
    const x0 = centre - pillW - 6;

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
          fontSize: '16px', fontFamily: FONTS.body,
          color: COLOURS.text, resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5),
      );
    }

    // Phase name
    const labelX = x0 + pillH + 4;
    container.add(
      scene.add.text(labelX, cy - 5, PHASE_LABELS[currentPhase], {
        fontSize: '14px', fontFamily: FONTS.body, fontStyle: 'bold',
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
    const pillW = 130;
    const x0 = centre + 6;

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
        fontSize: '14px', fontFamily: FONTS.body, fontStyle: 'bold',
        color: COLOURS.text, resolution: TEXT_RESOLUTION,
      }).setOrigin(0, 0.5),
    );
  }
}

// ── Helpers ────────────────────────────────────────────────

interface AlertBadgeOpts {
  cx: number; cy: number;
  radius: number;
  fillColour: number;
  count: number;
  pulseScale: number;
  pulseDuration: number;
  onTap: () => void;
}

function drawAlertBadge(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  opts: AlertBadgeOpts,
): void {
  const { cx, cy, radius, fillColour, count, pulseScale, pulseDuration, onTap } = opts;
  const gfx = scene.add.graphics();
  gfx.fillStyle(0x000000, 0.2);
  gfx.fillCircle(cx + 1, cy + 2, radius);
  gfx.fillStyle(fillColour, 1);
  gfx.fillCircle(cx, cy, radius);
  gfx.lineStyle(2, 0xffffff, 1);
  gfx.strokeCircle(cx, cy, radius);
  container.add(gfx);
  container.add(
    scene.add.text(cx, cy, `${count}`, {
      fontSize: '14px', fontFamily: FONTS.body, fontStyle: 'bold',
      color: '#ffffff', resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5),
  );

  // Pulse so it draws the eye
  const pulseTarget = { s: 1 };
  scene.tweens.add({
    targets: pulseTarget,
    s: pulseScale,
    duration: pulseDuration,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
    onUpdate: () => {
      gfx.setScale(pulseTarget.s, pulseTarget.s);
      gfx.x = cx * (1 - pulseTarget.s);
      gfx.y = cy * (1 - pulseTarget.s);
    },
  });

  const hit = scene.add.circle(cx, cy, Math.max(radius + 4, 24), 0x000000, 0)
    .setInteractive({ useHandCursor: true });
  hit.on('pointerdown', onTap);
  container.add(hit);
}

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
        fontSize: '14px', fontFamily: FONTS.body, fontStyle: 'bold',
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
      fontSize: '14px', fontFamily: FONTS.body, fontStyle: 'bold',
      color: COLOURS.text, resolution: TEXT_RESOLUTION,
    }).setOrigin(0, 0.5),
  );

  return x0 - 6;  // next rx
}
