import Phaser from 'phaser';
import { COLOURS, FONTS, TEXT_RESOLUTION, MIN_TAP, CHROME, hexNum, TYPE } from './constants';

/**
 * Small text-only button (for links, "Log out", secondary actions).
 * Now with subtle underline effect on hover for a polished feel.
 */
export function createTextButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void
): Phaser.GameObjects.Container {
  const text = scene.add.text(0, 0, label, {
    fontSize: TYPE.body,
    fontFamily: FONTS.body,
    fontStyle: 'bold',
    color: COLOURS.primary,
    resolution: TEXT_RESOLUTION,
  }).setOrigin(0.5);

  // Underline (hidden initially)
  const underline = scene.add.rectangle(
    0, text.height / 2 + 2,
    text.width, 1.5,
    Phaser.Display.Color.HexStringToColor(COLOURS.primary).color, 0
  );

  // The hit area is floored at MIN_TAP, not sized to the label. A 17px
  // line of text is about 31px tall with its padding, which is under the
  // 40px WARN band — and this is the "← Back to centre" button on half the
  // scenes in the game, so the same near-miss showed up everywhere. The
  // visible text is unchanged; only the region that answers a tap grows.
  const hitArea = scene.add.rectangle(
    0, 0,
    Math.max(text.width + 20, MIN_TAP),
    Math.max(text.height + 12, MIN_TAP),
    0x000000, 0,
  ).setInteractive({ useHandCursor: true });

  const container = scene.add.container(x, y, [text, underline, hitArea]);

  hitArea.on('pointerover', () => {
    text.setStyle({ color: COLOURS.primaryDark });
    underline.setAlpha(0.6);
  });
  hitArea.on('pointerout', () => {
    text.setStyle({ color: COLOURS.primary });
    underline.setAlpha(0);
  });
  hitArea.on('pointerdown', onClick);

  return container;
}

// ── Chrome ───────────────────────────────────────────────────────────
//
// Everything below draws the one non-diegetic surface described by
// `CHROME` in ./constants. Painted wood belongs to the sign screens,
// because those boards are objects in the world; a view title, a panel or
// a zone arrow is not, and gets this instead.

/**
 * The chrome plate — one rounded surface, one fill, one stroke, one shadow.
 *
 * Use it anywhere a view needs to put something *over* the world: a title,
 * an empty state, an info panel, the back of a button. It replaced both the
 * translucent-white `createPanel` look and the gold-pill `createPillTitle`
 * look, which between them were why the kitchen showed three visual
 * languages in one frame. Both are gone: the pill went with the title
 * conversion, and `createPanel`'s last 17 callers came here.
 *
 * The container publishes its drawn size via `setSize`, so a caller can
 * measure it to lay out whatever sits beneath — Graphics contributes nothing
 * to `getBounds()`, and a caller that trusts the default gets zero and
 * stacks its next row on top of this one.
 */
export function createChromePlate(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  options?: {
    radius?: number;
    fillAlpha?: number;
    shadow?: boolean;
    /**
     * `plate` (default) is paper; `filled` is paper and ink swapped — the
     * same two weights `createChromeButton` has, and for the same reason.
     *
     * A plate needs this where the surface is carrying a *state* rather
     * than decoration: the gift chips in Social are a row of identical
     * plates, one of which is the chosen one, and a child reading a row
     * of chips needs the chosen one to differ before she reads a word.
     * Painting that as a one-off green fill is how the fills came to be a
     * dozen different colours in the first place.
     *
     * Reach for it for selection, not emphasis. A screen where every plate
     * is filled has said nothing.
     */
    variant?: 'plate' | 'filled';
  }
): Phaser.GameObjects.Container {
  const radius = options?.radius ?? CHROME.radius;
  const fillAlpha = options?.fillAlpha ?? CHROME.fillAlpha;
  const shadow = options?.shadow ?? true;
  const filled = options?.variant === 'filled';

  const gfx = scene.add.graphics();

  if (shadow) {
    gfx.fillStyle(CHROME.shadowColour, CHROME.shadowAlpha);
    gfx.fillRoundedRect(-w / 2 + CHROME.shadowX, -h / 2 + CHROME.shadowY, w, h, radius);
  }

  gfx.fillStyle(filled ? hexNum(CHROME.inkAccent) : CHROME.fill, filled ? 1 : fillAlpha);
  gfx.fillRoundedRect(-w / 2, -h / 2, w, h, radius);

  // As on the button: outlining a filled plate in the plate's own warm grey
  // draws a ring around a dark shape rather than an edge on a light one.
  if (!filled) {
    gfx.lineStyle(CHROME.strokeWidth, CHROME.stroke, CHROME.strokeAlpha);
    gfx.strokeRoundedRect(-w / 2, -h / 2, w, h, radius);
  }

  const container = scene.add.container(x, y, [gfx]);
  container.setSize(w, h);
  return container;
}

/**
 * A view title on a chrome plate — what replaced the gold pills, all
 * twenty of them.
 *
 * The pills were chrome wearing scenery clothes: they carried the painted
 * world's bevel and warmth on an element that floats above the world and
 * could not be an object in it. This kept their shape of call so the
 * conversion did not have to rethink twenty layouts as well, minus the
 * colour options — the point of one surface is that it is not per-view.
 * `createPillTitle` itself is deleted; its last caller went with the
 * conversion.
 *
 * `subtitle` sets a second, quieter line on the same plate. Views that show
 * a heading and a count under it were drawing the count straight onto
 * painted art, which is the same readability problem one line lower down.
 */
export function createChromeTitle(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  options?: {
    fontSize?: string;
    subtitle?: string;
    subtitleSize?: string;
    icon?: string;       // texture key for a custom icon
    iconSize?: number;   // display size in px (default 26)
    /**
     * What the heading *means*, for the handful of places where that is
     * not neutral — "PERFECT RUN!" against "TOTALLED!", "Session Complete!"
     * against "Out of Moves!".
     *
     * Those were pill titles whose whole background carried the valence:
     * green plate for a good run, red for a wrecked one. Moving them onto
     * one cream surface without this would delete the signal a child reads
     * the moment before she reads the words. It moves to the ink instead,
     * so the surface stays single and the meaning survives.
     *
     * Ink, not fill, and deliberately: the words already differ, so colour
     * here is reinforcement rather than the only channel — which is the
     * right way round for a child who does not see red and green apart.
     */
    tone?: 'default' | 'success' | 'danger';
  }
): Phaser.GameObjects.Container {
  const fontSize = options?.fontSize ?? '20px';
  const subtitleSize = options?.subtitleSize ?? TYPE.caption;
  const iconSize = options?.iconSize ?? 26;
  const ink = options?.tone === 'success' ? CHROME.inkAccent
    : options?.tone === 'danger' ? CHROME.inkDanger
      : CHROME.ink;

  const text = scene.add.text(0, 0, label, {
    fontSize,
    fontFamily: FONTS.ui,
    fontStyle: 'bold',
    color: ink,
    resolution: TEXT_RESOLUTION,
  }).setOrigin(0.5);

  const subtitle = options?.subtitle
    ? scene.add.text(0, 0, options.subtitle, {
      fontSize: subtitleSize,
      fontFamily: FONTS.ui,
      color: CHROME.inkMuted,
      align: 'center',
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5)
    : undefined;

  let icon: Phaser.GameObjects.Image | undefined;
  if (options?.icon && scene.textures.exists(options.icon)) {
    icon = scene.add.image(0, 0, options.icon).setOrigin(0.5);
    icon.setScale(iconSize / Math.max(icon.width, icon.height));
  }

  // Heading row: [icon] label. The subtitle, when present, is centred on
  // the plate rather than on the row, so it reads as a caption for the
  // whole thing rather than as a continuation of the label.
  const gap = 8;
  const rowW = text.width + (icon ? iconSize + gap : 0);
  if (icon) {
    icon.setX(-rowW / 2 + iconSize / 2);
    text.setX(rowW / 2 - text.width / 2);
  }

  const rowH = Math.max(text.height, icon ? iconSize : 0);
  const stackH = rowH + (subtitle ? 4 + subtitle.height : 0);
  const contentW = Math.max(rowW, subtitle?.width ?? 0);

  const w = contentW + CHROME.padX * 2;
  const h = stackH + CHROME.padY * 2;

  const rowY = -stackH / 2 + rowH / 2;
  text.setY(rowY);
  icon?.setY(rowY);
  subtitle?.setY(stackH / 2 - subtitle.height / 2);

  const plate = createChromePlate(scene, 0, 0, w, h);

  const children: Phaser.GameObjects.GameObject[] = [plate, text];
  if (icon) children.push(icon);
  if (subtitle) children.push(subtitle);

  const container = scene.add.container(x, y, children);
  container.setSize(w, h + CHROME.shadowY);
  return container;
}

/**
 * A round chrome button — for glyph controls like the garden's zone arrows.
 *
 * Those were 48px text objects with `.setInteractive()` on them, which gives
 * a glyph-sized hit area, not a control-sized one; the drawn arrow and the
 * region that answers a tap are different rectangles, and the smaller one
 * wins. The hit area here is floored at `MIN_TAP` independently of the
 * drawn diameter, the established pattern for exactly this.
 */
export function createChromeCircleButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  glyph: string,
  onClick: () => void,
  options?: {
    diameter?: number;
    fontSize?: string;
  }
): Phaser.GameObjects.Container {
  const diameter = options?.diameter ?? MIN_TAP;
  const r = diameter / 2;
  const fontSize = options?.fontSize ?? '22px';

  const gfx = scene.add.graphics();

  gfx.fillStyle(CHROME.shadowColour, CHROME.shadowAlpha);
  gfx.fillCircle(CHROME.shadowX - 1, CHROME.shadowY - 1, r);

  gfx.fillStyle(CHROME.fill, CHROME.fillAlpha);
  gfx.fillCircle(0, 0, r);

  gfx.lineStyle(CHROME.strokeWidth, CHROME.stroke, CHROME.strokeAlpha);
  gfx.strokeCircle(0, 0, r);

  const text = scene.add.text(0, 0, glyph, {
    fontSize,
    fontFamily: FONTS.ui,
    color: CHROME.ink,
    resolution: TEXT_RESOLUTION,
  }).setOrigin(0.5);

  // A transparent rectangle floored at MIN_TAP, per the idiom documented on
  // MIN_TAP — not `setInteractive()` on the glyph, which is what these
  // arrows used to be and which gives a hit area the size of the character.
  const hitSize = Math.max(diameter, MIN_TAP);
  const hitArea = scene.add.rectangle(0, 0, hitSize, hitSize, 0x000000, 0)
    .setInteractive({ useHandCursor: true });

  const container = scene.add.container(x, y, [gfx, text, hitArea]);
  container.setSize(hitSize, hitSize);

  hitArea.on('pointerover', () => container.setScale(1.06));
  hitArea.on('pointerout', () => container.setScale(1));
  hitArea.on('pointerdown', () => {
    scene.tweens.add({
      targets: container,
      scaleX: 0.92,
      scaleY: 0.92,
      duration: 60,
      yoyo: true,
      onComplete: onClick,
    });
  });

  return container;
}

/**
 * A button on the chrome surface — the only button in the game.
 *
 * It replaced `createButton`, which was the largest single piece of the
 * audit's first finding and the piece a child touches most: 56 call sites
 * across 22 files, at least one on every screen. That drew a bevel — a
 * lighter strip along the top, a darker one along the bottom, a white rim
 * — which is the painted world's vocabulary on an element that floats
 * above the world. Worse, each caller picked its own `bgColour`, so the
 * game carried a dozen button colours whose only shared rule was that
 * somebody had liked them. It is deleted; this is what every screen uses.
 *
 * **Two weights, one surface.** `plate` is the cream paper every other
 * chrome element already uses. `filled` is the same plate with the ink and
 * the paper swapped — the accent as the fill, the cream as the type. That
 * is one surface read two ways rather than a second surface, and it gives
 * a screen exactly one level of emphasis to spend on its main action.
 *
 * The swap is also why `filled` needs no contrast work of its own: cream on
 * `inkAccent` is the same pair as `inkAccent` on cream, read backwards, and
 * `chrome.test.ts` already holds that pair at AA. A test says so, so that
 * a later edit introducing a third fill has to answer for it.
 *
 * **Padding stays at the button's numbers, not the plate's.** `CHROME.padY`
 * is 12 and this uses 14, deliberately: a title plate is padded so the words
 * can breathe, a button is padded so a finger can land. Dropping to the
 * plate's value would take 4px off the drawn height of every button in the
 * game — all of them already under `MIN_TAP` — to make a number match.
 */
export function createChromeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  options?: {
    fontSize?: string;
    width?: number;
    height?: number;
    radius?: number;
    icon?: string;       // texture key for a custom icon (e.g. 'icon-play')
    iconSize?: number;   // display size of icon in px (default 24)
    /**
     * Which of the two kinds of icon this key is.
     *
     * `artwork` (default) — a painterly piece carrying its own colours,
     * like `icon-feed` or `icon-depot`. Drawn as it was painted.
     *
     * `glyph` — a line drawing in white or pale grey: `icon-back`,
     * `icon-accept`, `icon-walk`. Those were made when every button had a
     * dark fill, and on cream paper they all but disappear. A glyph is
     * tinted to whatever ink the button is already setting its label in,
     * so one asset reads in both weights — dark on the plate, cream on the
     * filled button — and neither needs redrawing.
     *
     * Two kinds rather than tinting everything, because tint multiplies:
     * exactly right for white line art, ruinous for anything painted.
     */
    iconStyle?: 'artwork' | 'glyph';
    /**
     * `plate` (default) is paper; `filled` is paper and ink swapped.
     *
     * **Plate is the default, and it holds on cream.** The worry was that
     * a cream button on the game's cream canvas would have no edge —
     * `ui-next-steps` records the title plate as "nearly invisible" on the
     * flat-cream scenes. Drawn and looked at rather than argued about: a
     * button is fine. A title plate is understated on purpose and has only
     * its hairline to show for itself; a button carries the same hairline
     * *and* a drop shadow, and the two together read as something raised
     * that you would press. It works on painted art and on bare cream.
     *
     * **Filled marks the one action the screen is for** — "Start
     * Sorting!", "Let's go!", "Done playing!". Two of them side by side
     * spends the emphasis and leaves a child no clue which the screen
     * wants.
     *
     * **A plate inside a plate is two hairlines a few pixels apart**, so
     * fill the inner one. That is the left rail, the Games popup and the
     * animal card: each is already a bordered cream surface, and a bordered
     * cream button on it reads as a frame around a frame. Those layouts
     * carry several filled buttons and are right to; they get their
     * emphasis from position and wording, which is what they were already
     * doing when the fills were a dozen different colours.
     */
    variant?: 'plate' | 'filled';
    /**
     * For the rare control that undoes or ends something. Same rule as
     * `createChromeTitle`'s tone: it moves the ink, never the surface, and
     * it reinforces a label that already says so. Nothing in the game
     * reads only as red.
     */
    tone?: 'default' | 'danger';
    /**
     * Which part of the button `x` and `y` name.
     *
     * Both default to `centre`, which is the normal thing. Any other value
     * puts the control's **outer edge** on that coordinate instead, so a
     * caller anchoring against a screen edge writes the margin it wants and
     * gets it.
     *
     * This exists because the alternative kept failing, on both axes.
     *
     * Horizontally: a caller wanting a Back button `SAFE_MARGIN` from the
     * left has to write `SAFE_MARGIN + w / 2`, and it does not know `w` —
     * the button sizes itself to `max(label + icon + 56, options.width)`
     * and the hit box is floored at `MIN_TAP` on top of that. The three
     * Back buttons in this game used hand-guessed half-widths of 53, 58 and
     * 59 and landed 14, 15 and 15px from the edge.
     *
     * Vertically: `EDGE_CONTROL_INSET` is `SAFE_MARGIN + MIN_TAP / 2`, so
     * it lands the edge correctly only for a control that is exactly
     * `MIN_TAP` tall. PtvDriveScene's Back button is 52, and anchoring its
     * centre there left 14px — the same defect, arrived at through the
     * constant meant to prevent it.
     *
     * The edge measured is the hit box's, not the drawn plate's, because
     * the hit box is what a child touches and what the harness scores.
     */
    anchor?: { x?: 'left' | 'centre' | 'right'; y?: 'top' | 'centre' | 'bottom' };
  }
): Phaser.GameObjects.Container {
  const fontSize = options?.fontSize ?? '22px';
  const radius = options?.radius ?? CHROME.radius;
  const iconSize = options?.iconSize ?? 24;
  const filled = options?.variant === 'filled';
  const accent = options?.tone === 'danger' ? CHROME.inkDanger : CHROME.inkAccent;

  // Filled swaps the two: the accent becomes the surface, the cream the
  // type. Plate keeps the paper and puts the accent nowhere — a plain
  // button's label is `ink`, because on a screen of plates the one that
  // differs should be the one that matters.
  const fillNum = filled ? hexNum(accent) : CHROME.fill;
  const inkHex = filled
    ? COLOURS.bg
    : (options?.tone === 'danger' ? CHROME.inkDanger : CHROME.ink);

  const text = scene.add.text(0, 0, label, {
    fontSize,
    fontFamily: FONTS.ui,
    fontStyle: 'bold',
    color: inkHex,
    resolution: TEXT_RESOLUTION,
  }).setOrigin(0.5);

  let iconSprite: Phaser.GameObjects.Image | undefined;
  let iconOffset = 0;
  if (options?.icon && scene.textures.exists(options.icon)) {
    iconSprite = scene.add.image(0, 0, options.icon).setOrigin(0.5);
    iconSprite.setScale(iconSize / Math.max(iconSprite.width, iconSprite.height));
    if (options.iconStyle === 'glyph') iconSprite.setTint(hexNum(inkHex));
    iconOffset = (iconSize + 6) / 2;
    text.setX(iconOffset);
    iconSprite.setX(-text.width / 2 - 6 + iconOffset - iconSize / 2);
  }

  const padX = 28;
  const padY = 14;
  const contentW = text.width + (iconSprite ? iconSize + 6 : 0);
  const w = Math.max(contentW + padX * 2, options?.width ?? 200);
  const h = options?.height ?? text.height + padY * 2;

  const gfx = scene.add.graphics();

  gfx.fillStyle(CHROME.shadowColour, CHROME.shadowAlpha);
  gfx.fillRoundedRect(-w / 2 + CHROME.shadowX - 1, -h / 2 + CHROME.shadowY - 1, w, h, radius);

  gfx.fillStyle(fillNum, filled ? 1 : CHROME.fillAlpha);
  gfx.fillRoundedRect(-w / 2, -h / 2, w, h, radius);

  // The hairline is what separates cream from cream. A filled button
  // separates itself from anything it sits on, and outlining it in the
  // plate's warm grey would draw a ring around a dark shape rather than
  // an edge on a light one.
  if (!filled) {
    gfx.lineStyle(CHROME.strokeWidth, CHROME.stroke, CHROME.strokeAlpha);
    gfx.strokeRoundedRect(-w / 2, -h / 2, w, h, radius);
  }

  // Hit area floored at MIN_TAP, per the idiom documented on MIN_TAP. The
  // drawn button keeps the size the caller asked for; only the region that
  // answers a tap grows, which costs nothing visible.
  const hitArea = scene.add.rectangle(
    0, 0, Math.max(w, MIN_TAP), Math.max(h, MIN_TAP), 0x000000, 0,
  ).setInteractive({ useHandCursor: true });

  const children: Phaser.GameObjects.GameObject[] = [gfx, text];
  if (iconSprite) children.push(iconSprite);
  children.push(hitArea);

  // Anchoring shifts the whole container so the hit box's outer edge lands
  // on the coordinate given. Done here rather than by the caller because
  // neither dimension is knowable until the label has been measured.
  const hitW = Math.max(w, MIN_TAP);
  const hitH = Math.max(h, MIN_TAP);
  const cx = options?.anchor?.x === 'left' ? x + hitW / 2
    : options?.anchor?.x === 'right' ? x - hitW / 2
      : x;
  const cy = options?.anchor?.y === 'top' ? y + hitH / 2
    : options?.anchor?.y === 'bottom' ? y - hitH / 2
      : y;

  const container = scene.add.container(cx, cy, children);
  // Graphics contributes nothing to getBounds(), so a caller measuring this
  // to stack the next row gets the height of the *text* and lands inside
  // the button. The bevelled button this replaced never published its
  // size and every caller hardcoded round it; this one does.
  container.setSize(w, h + CHROME.shadowY);

  hitArea.on('pointerover', () => container.setScale(1.03));
  hitArea.on('pointerout', () => container.setScale(1));
  hitArea.on('pointerdown', () => {
    scene.tweens.add({
      targets: container,
      scaleX: 0.96,
      scaleY: 0.96,
      duration: 60,
      yoyo: true,
      onComplete: onClick,
    });
  });

  return container;
}

/**
 * Floating ambient particles — paw prints, hearts, stars etc.
 * Creates a gentle drifting effect across the scene for visual richness.
 */
export function createAmbientParticles(
  scene: Phaser.Scene,
  emojis: string[],
  options?: {
    count?: number;
    minSize?: number;
    maxSize?: number;
    minAlpha?: number;
    maxAlpha?: number;
    speed?: number;
    area?: { x: number; y: number; w: number; h: number };
  }
): Phaser.GameObjects.Container {
  const count = options?.count ?? 12;
  const minSize = options?.minSize ?? 12;
  const maxSize = options?.maxSize ?? 22;
  const minAlpha = options?.minAlpha ?? 0.08;
  const maxAlpha = options?.maxAlpha ?? 0.2;
  const speed = options?.speed ?? 1;
  const { width, height } = scene.scale;
  const area = options?.area ?? { x: 0, y: 0, w: width, h: height };

  const container = scene.add.container(0, 0);

  for (let i = 0; i < count; i++) {
    const emoji = emojis[Math.floor(Math.random() * emojis.length)];
    const size = minSize + Math.random() * (maxSize - minSize);
    const alpha = minAlpha + Math.random() * (maxAlpha - minAlpha);

    const px = area.x + Math.random() * area.w;
    const py = area.y + Math.random() * area.h;

    const particle = scene.add.text(px, py, emoji, {
      fontSize: `${Math.round(size)}px`, fontFamily: FONTS.body
    }).setOrigin(0.5).setAlpha(alpha);

    container.add(particle);

    // Gentle floating drift
    const driftX = (Math.random() - 0.5) * 40 * speed;
    const driftY = -20 - Math.random() * 30 * speed;
    const duration = 4000 + Math.random() * 6000;

    scene.tweens.add({
      targets: particle,
      x: px + driftX,
      y: py + driftY,
      alpha: 0,
      rotation: (Math.random() - 0.5) * 0.5,
      duration,
      delay: Math.random() * 3000,
      repeat: -1,
      onRepeat: () => {
        particle.setPosition(
          area.x + Math.random() * area.w,
          area.y + area.h * 0.3 + Math.random() * area.h * 0.7
        );
        particle.setAlpha(alpha);
        particle.setRotation(0);
      },
    });
  }

  return container;
}
