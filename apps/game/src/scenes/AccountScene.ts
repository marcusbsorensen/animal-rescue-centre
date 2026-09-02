import Phaser from 'phaser';
import type { Animal, Species, Economy } from '@arc/shared-types';
import { COLOURS, FONTS, TEXT_RESOLUTION, SAFE_MARGIN, MIN_FONT } from '../ui/constants';
import { createButton, createChromeTitle, createAmbientParticles } from '../ui/UIButton';
import { BADGE_DEFINITIONS } from '@arc/badges';
import { getSession } from '../lib/auth';
import { AudioManager } from '../audio/AudioManager';

/**
 * AccountScene — "about me" hub for the player.
 *
 * Shows avatar + username, running stats (rescued / bonded / pets /
 * species unlocked), and the full badge wall — earned badges light up,
 * unearned ones appear locked with a hint. Intended to be a warm, low-
 * pressure screen kids can visit any time to admire their progress.
 *
 * Data comes through scene.start() payload so we don't have to re-query
 * anything or duplicate save logic.
 */

interface AccountPayload {
  level: number;
  totalRescued: number;
  totalBonded: number;
  earnedBadges: string[];
  animals: Animal[];
  economy: Economy;
}

export class AccountScene extends Phaser.Scene {
  private payload!: AccountPayload;
  private container!: Phaser.GameObjects.Container;
  private _lastW = 0;
  private _lastH = 0;

  constructor() {
    super({ key: 'AccountScene' });
  }

  init(data: AccountPayload): void {
    this.payload = {
      level: data?.level ?? 1,
      totalRescued: data?.totalRescued ?? 0,
      totalBonded: data?.totalBonded ?? 0,
      earnedBadges: Array.isArray(data?.earnedBadges) ? data.earnedBadges : [],
      animals: Array.isArray(data?.animals) ? data.animals : [],
      economy: data?.economy ?? { coins: 0, lifetimeEarnings: 0 },
    };
  }

  create(): void {
    const { width, height } = this.scale;
    this._lastW = width;
    this._lastH = height;
    this.cameras.main.fadeIn(260, 254, 249, 239);

    // Ambient paw-prints background
    createAmbientParticles(this, [], {
      count: 10, minAlpha: 0.05, maxAlpha: 0.12, speed: 0.4,
    }).setDepth(-1);

    this.container = this.add.container(0, 0);

    // Refresh on big resizes so layout stays centred
    this.scale.on('resize', (size: Phaser.Structs.Size) => {
      if (Math.abs(size.width - this._lastW) > 50 || Math.abs(size.height - this._lastH) > 50) {
        this._lastW = size.width;
        this._lastH = size.height;
        this.scene.restart(this.payload);
      }
    });

    this.renderPage();
  }

  // ── Rendering ──────────────────────────────────────────────

  private renderPage(): void {
    const { width } = this.scale;
    this.container.removeAll(true);

    // Title pill. On a phone the Back button occupies the top-left, so
    // centre the title in what is left rather than over the button.
    const backRight = SAFE_MARGIN + 58 + 58;
    const titleX = width < 500 ? (backRight + width) / 2 : width / 2;
    this.container.add(
      createChromeTitle(this, titleX, SAFE_MARGIN + 23, 'My A.R.C.', {
        icon: 'icon-badge',
        iconSize: 22,
      })
    );

    // Back button (top-left)
    this.container.add(
      createButton(this, SAFE_MARGIN + 58, SAFE_MARGIN + 23, 'Back', () => {
        AudioManager.getInstance().playSfx('button_click');
        this.scene.start('GameScene');
      }, { width: 100, fontSize: '16px', bgColour: '#6b5a4a', icon: 'icon-back', iconSize: 18 })
    );

    this.renderProfileCard();
    // Stats can wrap to more than one row on a narrow screen; renderStatsRow
    // reports the first y the badge wall may safely start at.
    const contentTop = this.renderStatsRow();
    this.renderBadgeWall(contentTop);
  }

  private renderProfileCard(): void {
    const { width } = this.scale;
    const session = getSession();
    const cardY = 120;
    const cardW = Math.min(560, width - SAFE_MARGIN * 2);
    const cardH = 110;
    const cardX = width / 2;

    // Card background
    const gfx = this.add.graphics();
    gfx.fillStyle(0x000000, 0.14);
    gfx.fillRoundedRect(cardX - cardW / 2 + 3, cardY - cardH / 2 + 4, cardW, cardH, 18);
    gfx.fillStyle(0xffffff, 0.98);
    gfx.fillRoundedRect(cardX - cardW / 2, cardY - cardH / 2, cardW, cardH, 18);
    gfx.lineStyle(2, 0xE67E22, 0.45);
    gfx.strokeRoundedRect(cardX - cardW / 2, cardY - cardH / 2, cardW, cardH, 18);
    this.container.add(gfx);

    // Avatar disc
    const avatarX = cardX - cardW / 2 + 60;
    const avatarBg = session?.avatarBgColour
      ? Phaser.Display.Color.HexStringToColor(session.avatarBgColour).color
      : 0xE67E22;
    const avatarGfx = this.add.graphics();
    avatarGfx.fillStyle(avatarBg, 1);
    avatarGfx.fillCircle(avatarX, cardY, 38);
    avatarGfx.lineStyle(3, 0xffffff, 1);
    avatarGfx.strokeCircle(avatarX, cardY, 38);
    this.container.add(avatarGfx);

    const avatarEmoji = session?.avatarEmoji ?? '🐾';
    this.container.add(
      this.add.text(avatarX, cardY, avatarEmoji, {
        fontSize: '42px', fontFamily: FONTS.body, resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5)
    );

    // Name + level
    const textX = avatarX + 54;
    const username = session?.username ?? 'A.R.C. Keeper';
    this.container.add(
      this.add.text(textX, cardY - 20, username, {
        fontSize: '22px', fontFamily: FONTS.title, fontStyle: 'bold',
        color: COLOURS.text, resolution: TEXT_RESOLUTION,
      }).setOrigin(0, 0.5)
    );
    this.container.add(
      this.add.text(textX, cardY + 8, `Level ${this.payload.level}`, {
        fontSize: '15px', fontFamily: FONTS.body, fontStyle: 'bold',
        color: COLOURS.primary, resolution: TEXT_RESOLUTION,
      }).setOrigin(0, 0.5)
    );
    const earned = this.payload.earnedBadges.length;
    this.container.add(
      this.add.text(textX, cardY + 28, `${earned} / ${BADGE_DEFINITIONS.length} badges earned`, {
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body,
        color: COLOURS.textLight, resolution: TEXT_RESOLUTION,
      }).setOrigin(0, 0.5)
    );
  }

  private renderStatsRow(): number {
    const { width } = this.scale;
    const rowY = 210;
    const pills = [
      { label: 'In care', value: `${this.payload.animals.filter(a => a.state === 'sheltered' || a.state === 'bonding').length}` },
      { label: 'Pets', value: `${this.payload.animals.filter(a => a.state === 'pet').length}` },
      { label: 'Rescued', value: `${this.payload.totalRescued}` },
      { label: 'Bonded', value: `${this.payload.totalBonded}` },
      { label: 'Coins', value: `${this.payload.economy.coins}` },
    ];

    const pillW = 98;
    const pillH = 54;
    const gap = 8;

    // Five pills at a fixed 98px are 522px wide. On a 375px phone that ran
    // 73px off both edges — the row was centred with no responsive step at
    // all. Wrap into as many rows as fit inside the 16px safe margin rather
    // than scaling the pills down, which would undo the type sizes.
    const perRow = Math.max(
      1,
      Math.floor((width - SAFE_MARGIN * 2 + gap) / (pillW + gap)),
    );
    const rows: typeof pills[] = [];
    for (let i = 0; i < pills.length; i += perRow) rows.push(pills.slice(i, i + perRow));

    rows.forEach((row, rowIndex) => {
      const rowW = pillW * row.length + gap * (row.length - 1);
      let x = width / 2 - rowW / 2 + pillW / 2;
      const y = rowY + rowIndex * (pillH + 10);

      for (const p of row) {
        const g = this.add.graphics();
        g.fillStyle(0x000000, 0.12);
        g.fillRoundedRect(x - pillW / 2 + 2, y - pillH / 2 + 3, pillW, pillH, 14);
        g.fillStyle(0xffffff, 0.98);
        g.fillRoundedRect(x - pillW / 2, y - pillH / 2, pillW, pillH, 14);
        this.container.add(g);

        this.container.add(
          this.add.text(x, y - 10, p.value, {
            fontSize: '22px', fontFamily: FONTS.title, fontStyle: 'bold',
            color: COLOURS.text, resolution: TEXT_RESOLUTION,
          }).setOrigin(0.5)
        );
        this.container.add(
          this.add.text(x, y + 15, p.label, {
            fontSize: '14px', fontFamily: FONTS.body,
            color: COLOURS.textLight, resolution: TEXT_RESOLUTION,
          }).setOrigin(0.5)
        );
        x += pillW + gap;
      }
    });

    // Everything below the pills shifts down by however many extra rows we
    // needed, so the species chips do not land on top of them.
    // Where the pill block actually ends, rather than a constant that only
    // held while the row never wrapped.
    const pillsBottom = rowY + (rows.length - 1) * (pillH + 10) + pillH / 2;

    // Species collected — one little disc per species with the animal emoji
    const speciesOrder: Species[] = ['cat', 'dog', 'bunny', 'fox', 'bat', 'parrot', 'snake', 'hedgehog'];
    const speciesEmoji: Record<Species, string> = {
      cat: '🐱', dog: '🐶', bunny: '🐰', fox: '🦊',
      bat: '🦇', parrot: '🦜', snake: '🐍', hedgehog: '🦔',
    };
    const collectedSpecies = new Set(this.payload.animals.map(a => a.species));
    // 52 below the pills: room for the caption (which sits 30 above the
    // chip centres) plus the 19px chip radius, with air either side. The
    // old fixed 265 put the caption 4px inside the pills even before the
    // row wrapped — wrapping just made it obvious.
    const chipY = pillsBottom + 52;
    const chipW = 38;
    // Eight chips at 38 + 10 gap is 374px, one pixel inside a 375px phone
    // and outside the safe margin. Squeeze the gap before the chip.
    const chipGap = Math.max(
      4,
      Math.min(10, (width - SAFE_MARGIN * 2 - chipW * speciesOrder.length) / (speciesOrder.length - 1)),
    );
    const chipRowW = chipW * speciesOrder.length + chipGap * (speciesOrder.length - 1);
    let cx = width / 2 - chipRowW / 2 + chipW / 2;

    this.container.add(
      this.add.text(width / 2, chipY - 30, 'Animals you\'ve met', {
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body, fontStyle: 'bold',
        color: COLOURS.textLight, resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5)
    );

    for (const sp of speciesOrder) {
      const met = collectedSpecies.has(sp);
      const g = this.add.graphics();
      g.fillStyle(met ? 0x5AAE4A : 0xd9cfc2, met ? 0.15 : 0.4);
      g.fillCircle(cx, chipY, chipW / 2);
      g.lineStyle(2, met ? 0x5AAE4A : 0xaea59a, met ? 0.8 : 0.5);
      g.strokeCircle(cx, chipY, chipW / 2);
      this.container.add(g);
      this.container.add(
        this.add.text(cx, chipY, speciesEmoji[sp], {
          fontSize: '20px', fontFamily: FONTS.body, resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5).setAlpha(met ? 1 : 0.45)
      );
      cx += chipW + chipGap;
    }

    // Hand the badge wall the first y it may safely use.
    return chipY + 19 + 22;
  }

  private renderBadgeWall(contentTop = 310): void {
    const { width, height } = this.scale;
    const wallY = Math.max(310, contentTop);
    const availW = Math.min(width - SAFE_MARGIN * 2, 640);
    const wallX = width / 2;

    // Heading
    this.container.add(
      this.add.text(wallX, wallY, 'Badges', {
        fontSize: '18px', fontFamily: FONTS.title, fontStyle: 'bold',
        color: COLOURS.text, resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5)
    );

    // Scrollable badge grid — 4 cols on desktop, 3 on mobile
    const cols = availW >= 520 ? 5 : (availW >= 400 ? 4 : 3);
    const badgeSize = Math.floor((availW - (cols - 1) * 10) / cols);
    const wallTop = wallY + 24;
    const wallBottom = height - 30;
    const maskH = wallBottom - wallTop;

    // Masked container for scroll clipping
    const scrollWrap = this.add.container(0, wallTop);
    this.container.add(scrollWrap);

    // Compute total content height to know how far we can scroll
    const rows = Math.ceil(BADGE_DEFINITIONS.length / cols);
    const totalH = rows * (badgeSize + 10);

    // Draw each badge tile
    BADGE_DEFINITIONS.forEach((def, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const bx = wallX - availW / 2 + col * (badgeSize + 10) + badgeSize / 2;
      const by = row * (badgeSize + 10) + badgeSize / 2;
      const earned = this.payload.earnedBadges.includes(def.code);

      const tile = this.add.container(bx, by);

      const tileGfx = this.add.graphics();
      tileGfx.fillStyle(0x000000, earned ? 0.14 : 0.08);
      tileGfx.fillRoundedRect(-badgeSize / 2 + 2, -badgeSize / 2 + 3, badgeSize, badgeSize, 14);
      tileGfx.fillStyle(earned ? 0xfff4d6 : 0xe8e0d0, 1);
      tileGfx.fillRoundedRect(-badgeSize / 2, -badgeSize / 2, badgeSize, badgeSize, 14);
      tileGfx.lineStyle(2, earned ? 0xe3b04b : 0xb8ada0, earned ? 1 : 0.5);
      tileGfx.strokeRoundedRect(-badgeSize / 2, -badgeSize / 2, badgeSize, badgeSize, 14);
      tile.add(tileGfx);

      // Icon (painterly if we have it, else gold star or padlock)
      const iconKey = `badge-${def.code}`;
      const iconSize = badgeSize * 0.44;
      if (earned && this.textures.exists(iconKey)) {
        const img = this.add.image(0, -8, iconKey).setDisplaySize(iconSize, iconSize);
        this.textures.get(iconKey).setFilter(Phaser.Textures.FilterMode.LINEAR);
        tile.add(img);
      } else if (earned && this.textures.exists('icon-badge')) {
        tile.add(this.add.image(0, -8, 'icon-badge').setDisplaySize(iconSize, iconSize));
      } else if (earned) {
        const star = this.add.graphics();
        star.fillStyle(0xf1c40f, 1);
        star.fillCircle(0, -8, iconSize / 2);
        star.lineStyle(2, 0xffffff, 1);
        star.strokeCircle(0, -8, iconSize / 2);
        tile.add(star);
        tile.add(
          this.add.text(0, -8, '\u2605', {
            fontSize: `${Math.floor(iconSize * 0.7)}px`, fontFamily: FONTS.title,
            color: '#ffffff', resolution: TEXT_RESOLUTION,
          }).setOrigin(0.5)
        );
      } else {
        // Locked padlock
        tile.add(
          this.add.text(0, -8, '\uD83D\uDD12', {
            fontSize: `${Math.floor(iconSize * 0.9)}px`, fontFamily: FONTS.body,
            resolution: TEXT_RESOLUTION,
          }).setOrigin(0.5).setAlpha(0.45)
        );
      }

      // Name
      const nameStr = earned ? def.name : '???';
      tile.add(
        this.add.text(0, badgeSize / 2 - 18, nameStr, {
          fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body, fontStyle: 'bold',
          color: earned ? COLOURS.text : COLOURS.textLight,
          resolution: TEXT_RESOLUTION,
          align: 'center',
          wordWrap: { width: badgeSize - 10 },
        }).setOrigin(0.5)
      );

      // Tooltip on tap — shows description
      const hit = this.add.rectangle(0, 0, badgeSize, badgeSize, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        this.showBadgeTooltip(def, earned);
      });
      tile.add(hit);

      scrollWrap.add(tile);
    });

    // Apply a rectangular mask so tiles clip to the wall area
    const maskShape = this.make.graphics({ x: 0, y: 0 });
    maskShape.fillStyle(0xffffff);
    maskShape.fillRect(wallX - availW / 2, wallTop, availW, maskH);
    scrollWrap.setMask(maskShape.createGeometryMask());

    // Vertical scroll via drag/wheel. Only active if content overflows.
    const maxScroll = Math.max(0, totalH - maskH);
    if (maxScroll > 0) {
      let scrollY = 0;
      const setScroll = (y: number) => {
        scrollY = Phaser.Math.Clamp(y, -maxScroll, 0);
        scrollWrap.y = wallTop + scrollY;
      };
      this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
        setScroll(scrollY - dy);
      });
      let dragStartY = 0;
      let dragStartScroll = 0;
      let dragging = false;
      this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (p.y >= wallTop && p.y <= wallBottom) {
          dragging = true;
          dragStartY = p.y;
          dragStartScroll = scrollY;
        }
      });
      this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
        if (dragging && p.isDown) {
          setScroll(dragStartScroll + (p.y - dragStartY));
        }
      });
      this.input.on('pointerup', () => { dragging = false; });
    }
  }

  private showBadgeTooltip(def: { code: string; name: string; description: string }, earned: boolean): void {
    const { width, height } = this.scale;
    AudioManager.getInstance().playSfx('button_click');

    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.45)
      .setInteractive();
    const card = this.add.container(width / 2, height / 2);

    const cw = Math.min(340, width - SAFE_MARGIN * 2);
    const ch = 200;

    const cardGfx = this.add.graphics();
    cardGfx.fillStyle(0x000000, 0.24);
    cardGfx.fillRoundedRect(-cw / 2 + 3, -ch / 2 + 4, cw, ch, 18);
    cardGfx.fillStyle(0xfff4d6, 1);
    cardGfx.fillRoundedRect(-cw / 2, -ch / 2, cw, ch, 18);
    cardGfx.lineStyle(3, earned ? 0xe3b04b : 0xb8ada0, 1);
    cardGfx.strokeRoundedRect(-cw / 2, -ch / 2, cw, ch, 18);
    card.add(cardGfx);

    // Icon
    const iconKey = `badge-${def.code}`;
    if (earned && this.textures.exists(iconKey)) {
      card.add(this.add.image(0, -48, iconKey).setDisplaySize(64, 64));
    } else if (earned) {
      const medal = this.add.graphics();
      medal.fillStyle(0xf1c40f, 1);
      medal.fillCircle(0, -48, 30);
      medal.lineStyle(3, 0xffffff, 1);
      medal.strokeCircle(0, -48, 30);
      card.add(medal);
      card.add(this.add.text(0, -48, '\u2605', {
        fontSize: '34px', fontFamily: FONTS.title, color: '#ffffff',
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5));
    } else {
      card.add(this.add.text(0, -48, '\uD83D\uDD12', {
        fontSize: '44px', fontFamily: FONTS.body,
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5).setAlpha(0.5));
    }

    card.add(this.add.text(0, 0, earned ? def.name : 'Locked', {
      fontSize: '18px', fontFamily: FONTS.title, fontStyle: 'bold',
      color: COLOURS.text, resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5));
    card.add(this.add.text(0, 28, def.description, {
      fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body,
      color: COLOURS.textLight, resolution: TEXT_RESOLUTION,
      wordWrap: { width: cw - 40 }, align: 'center',
    }).setOrigin(0.5));
    card.add(this.add.text(0, 72, 'Tap to close', {
      fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body,
      color: COLOURS.textLight, resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5));

    const close = () => { overlay.destroy(); card.destroy(); };
    overlay.on('pointerdown', close);
    const cardHit = this.add.rectangle(width / 2, height / 2, cw, ch, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    cardHit.on('pointerdown', close);
    card.add(cardHit);
  }
}
