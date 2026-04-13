import Phaser from 'phaser';
import { COLOURS, FONTS } from './constants';

/**
 * Polished rounded button with shadow and 3D bevel effect.
 *
 * Looks like a real game button — rounded corners, soft drop shadow,
 * lighter top edge + darker bottom edge for depth.
 */
export function createButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  options?: {
    fontSize?: string;
    bgColour?: string;
    width?: number;
    height?: number;
    radius?: number;
  }
): Phaser.GameObjects.Container {
  const fontSize = options?.fontSize ?? '22px';
  const bgHex = options?.bgColour ?? COLOURS.primary;
  const radius = options?.radius ?? 16;

  const text = scene.add.text(0, -1, label, {
    fontSize,
    fontFamily: FONTS.body,
    fontStyle: 'bold',
    color: COLOURS.white,
  }).setOrigin(0.5);

  const padX = 28;
  const padY = 14;
  const w = Math.max(text.width + padX * 2, options?.width ?? 200);
  const h = options?.height ?? text.height + padY * 2;

  const baseColour = Phaser.Display.Color.HexStringToColor(bgHex);
  const baseNum = baseColour.color;

  // Lighten / darken for bevel
  const lighten = (c: Phaser.Display.Color, amt: number) => {
    return Phaser.Display.Color.GetColor(
      Math.min(255, c.red + amt),
      Math.min(255, c.green + amt),
      Math.min(255, c.blue + amt)
    );
  };
  const darken = (c: Phaser.Display.Color, amt: number) => {
    return Phaser.Display.Color.GetColor(
      Math.max(0, c.red - amt),
      Math.max(0, c.green - amt),
      Math.max(0, c.blue - amt)
    );
  };

  const topColour = lighten(baseColour, 35);
  const bottomColour = darken(baseColour, 40);

  const gfx = scene.add.graphics();

  // Drop shadow
  gfx.fillStyle(0x000000, 0.15);
  gfx.fillRoundedRect(-w / 2 + 2, -h / 2 + 3, w, h, radius);

  // Main body
  gfx.fillStyle(baseNum, 1);
  gfx.fillRoundedRect(-w / 2, -h / 2, w, h, radius);

  // Top highlight (lighter strip inside top)
  gfx.fillStyle(topColour, 0.5);
  gfx.fillRoundedRect(-w / 2 + 2, -h / 2 + 1, w - 4, h * 0.45, { tl: radius - 1, tr: radius - 1, bl: 0, br: 0 });

  // Bottom darken (darker strip inside bottom)
  gfx.fillStyle(bottomColour, 0.3);
  gfx.fillRoundedRect(-w / 2 + 2, h * 0.05, w - 4, h * 0.45 - 1, { tl: 0, tr: 0, bl: radius - 1, br: radius - 1 });

  // Thin white outline for crispness
  gfx.lineStyle(1.5, 0xffffff, 0.25);
  gfx.strokeRoundedRect(-w / 2, -h / 2, w, h, radius);

  // Hit area (invisible rect for pointer events)
  const hitArea = scene.add.rectangle(0, 0, w, h, 0x000000, 0)
    .setInteractive({ useHandCursor: true });

  const container = scene.add.container(x, y, [gfx, text, hitArea]);

  hitArea.on('pointerover', () => {
    container.setScale(1.03);
  });
  hitArea.on('pointerout', () => {
    container.setScale(1);
  });
  hitArea.on('pointerdown', () => {
    // Quick press animation
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
    fontSize: '17px',
    fontFamily: FONTS.body,
    fontStyle: 'bold',
    color: COLOURS.primary,
  }).setOrigin(0.5);

  // Underline (hidden initially)
  const underline = scene.add.rectangle(
    0, text.height / 2 + 2,
    text.width, 1.5,
    Phaser.Display.Color.HexStringToColor(COLOURS.primary).color, 0
  );

  const hitArea = scene.add.rectangle(0, 0, text.width + 20, text.height + 12, 0x000000, 0)
    .setInteractive({ useHandCursor: true });

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

/**
 * Colourful pill-shaped title banner — used for location headings.
 * Now with proper rounded rect, shadow, and optional icon glow.
 */
export function createPillTitle(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  options?: {
    bgColour?: number;
    fontSize?: string;
    textColour?: string;
    padX?: number;
    padY?: number;
    shadow?: boolean;
  }
): Phaser.GameObjects.Container {
  const fontSize = options?.fontSize ?? '22px';
  const textColour = options?.textColour ?? '#ffffff';
  const padX = options?.padX ?? 28;
  const padY = options?.padY ?? 10;
  const bgColour = options?.bgColour ?? 0x5AAE4A;
  const shadow = options?.shadow ?? true;

  const text = scene.add.text(0, 0, label, {
    fontSize,
    fontFamily: FONTS.title,
    fontStyle: 'bold',
    color: textColour,
  }).setOrigin(0.5);

  const w = text.width + padX * 2;
  const h = text.height + padY * 2;
  const radius = h / 2;

  const gfx = scene.add.graphics();

  // Drop shadow
  if (shadow) {
    gfx.fillStyle(0x000000, 0.2);
    gfx.fillRoundedRect(-w / 2 + 2, -h / 2 + 3, w, h, radius);
  }

  // Main pill
  gfx.fillStyle(bgColour, 1);
  gfx.fillRoundedRect(-w / 2, -h / 2, w, h, radius);

  // Inner highlight (top half, lighter)
  const baseR = (bgColour >> 16) & 0xFF;
  const baseG = (bgColour >> 8) & 0xFF;
  const baseB = bgColour & 0xFF;
  const highlight = Phaser.Display.Color.GetColor(
    Math.min(255, baseR + 30),
    Math.min(255, baseG + 30),
    Math.min(255, baseB + 30)
  );
  gfx.fillStyle(highlight, 0.35);
  gfx.fillRoundedRect(-w / 2 + 2, -h / 2 + 1, w - 4, h * 0.48, { tl: radius, tr: radius, bl: 0, br: 0 });

  // Thin outline
  gfx.lineStyle(1, 0xffffff, 0.2);
  gfx.strokeRoundedRect(-w / 2, -h / 2, w, h, radius);

  const container = scene.add.container(x, y, [gfx, text]);
  return container;
}

/**
 * Styled card panel — rounded rectangle with shadow, used for
 * content areas, animal cards, info panels.
 */
export function createPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  options?: {
    fillColour?: number;
    fillAlpha?: number;
    radius?: number;
    borderColour?: number;
    borderWidth?: number;
    shadow?: boolean;
  }
): Phaser.GameObjects.Container {
  const fillColour = options?.fillColour ?? 0xffffff;
  const fillAlpha = options?.fillAlpha ?? 0.95;
  const radius = options?.radius ?? 14;
  const borderColour = options?.borderColour ?? 0xd4c8b8;
  const borderWidth = options?.borderWidth ?? 2;
  const shadow = options?.shadow ?? true;

  const gfx = scene.add.graphics();

  // Drop shadow
  if (shadow) {
    gfx.fillStyle(0x000000, 0.1);
    gfx.fillRoundedRect(-w / 2 + 3, -h / 2 + 4, w, h, radius);
  }

  // Main fill
  gfx.fillStyle(fillColour, fillAlpha);
  gfx.fillRoundedRect(-w / 2, -h / 2, w, h, radius);

  // Border
  if (borderWidth > 0) {
    gfx.lineStyle(borderWidth, borderColour, 0.7);
    gfx.strokeRoundedRect(-w / 2, -h / 2, w, h, radius);
  }

  const container = scene.add.container(x, y, [gfx]);
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
      fontSize: `${Math.round(size)}px`,
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
