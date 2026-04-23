import Phaser from 'phaser';
import { COLOURS, FONTS, TEXT_RESOLUTION } from '../ui/constants';
import { createButton, createTextButton, createAmbientParticles } from '../ui/UIButton';
import { getSession, logout } from '../lib/auth';
import { AudioManager } from '../audio/AudioManager';
import { AssetLoader } from '../lib/AssetLoader';
import { SPECIES_VARIANTS, SPECIES_COLOURS } from '@arc/game-logic';
import type { Species } from '@arc/shared-types';
import { mountAuth, unmountAuth } from '../auth-overlay/AuthOverlay';

/**
 * MainMenuScene — warm, polished welcome screen.
 *
 * Content is constrained inside a central card panel that
 * scales responsively to the viewport size.
 *
 * Designed by Lily (age 8) 💜
 */
export class MainMenuScene extends Phaser.Scene {
  private _lastWidth = 0;
  private _lastHeight = 0;
  private animalContainer?: Phaser.GameObjects.Container;
  private bannerParams?: { cx: number; y: number; stripW: number; sf: number };

  constructor() {
    super({ key: 'MainMenuScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    const session = getSession();

    // Start menu music
    const audio = AudioManager.getInstance();
    audio.setScene(this);
    audio.playSceneMusic('menu');

    // Not logged in: show the HTML welcome overlay (Lily's painted sign design)
    // on top of Phaser. PLAY → startGame, "I already have account" → login,
    // "Make an account" → signup. Overlay is torn down when we leave scene.
    if (!session) {
      const unmount = mountAuth('welcome', {
        onAction: (action) => {
          if (action === 'play')   { unmount(); this.startGame(); return; }
          if (action === 'login')  { unmount(); this.scene.start('LoginScene'); return; }
          if (action === 'signup') { unmount(); this.scene.start('SignupScene'); return; }
        },
      });
      this.events.once('shutdown', unmountAuth);
      this.events.once('destroy', unmountAuth);
      return;
    }

    // Start background loading of all game assets
    const assetLoader = AssetLoader.getInstance();
    assetLoader.startBackgroundLoad(this);

    // When background load finishes, re-render animal banner with real sprites
    assetLoader.onComplete(() => {
      if (this.bannerParams && this.animalContainer) {
        this.animalContainer.removeAll(true);
        this.renderAnimalSprites(this.bannerParams.cx, this.bannerParams.y, this.bannerParams.stripW, this.bannerParams.sf);
      }
    });

    // ── Responsive sizing ───────────────────────────────────
    // Panel is capped at a comfortable max width/height
    const panelW = Math.min(520, width - 40);
    const panelH = Math.min(680, height - 30);
    const cx = width / 2;
    const cy = height / 2;
    const panelTop = cy - panelH / 2;

    // Scale factor for content (shrink on small screens)
    const sf = Math.min(1, panelW / 520, panelH / 680);

    // ── Background fills ────────────────────────────────────
    // Outer background — subtle pattern
    this.add.rectangle(cx, cy, width, height, 0xf0e8d8);

    // Subtle paw-print pattern on outer background
    const bgPattern = this.add.graphics();
    bgPattern.lineStyle(1.2, 0xd4c8b8, 0.08);
    for (let px = 30; px < width; px += 90) {
      for (let py = 30; py < height; py += 90) {
        const ox = ((py / 90) % 2) * 45; // offset every other row
        // Main pad
        bgPattern.strokeCircle(px + ox, py, 8);
        // Four toes
        bgPattern.strokeCircle(px + ox - 7, py - 10, 4);
        bgPattern.strokeCircle(px + ox + 7, py - 10, 4);
        bgPattern.strokeCircle(px + ox - 11, py - 3, 3.5);
        bgPattern.strokeCircle(px + ox + 11, py - 3, 3.5);
      }
    }

    // Warm radial glow behind the panel
    const glow = this.add.graphics();
    glow.fillStyle(0xfef9ef, 0.8);
    glow.fillCircle(cx, cy, Math.max(panelW, panelH) * 0.7);

    // Accent bars — logo red
    this.add.rectangle(cx, 0, width, 5, 0xD44040).setOrigin(0.5, 0);
    this.add.rectangle(cx, height, width, 4, 0xD4783C).setOrigin(0.5, 1);

    // Ambient floating particles (behind the panel)
    createAmbientParticles(this, [], {
      count: 12,
      minAlpha: 0.05,
      maxAlpha: 0.12,
      speed: 0.5,
    });

    // ── Main panel ──────────────────────────────────────────
    const panel = this.add.graphics();

    // Panel shadow
    panel.fillStyle(0x000000, 0.1);
    panel.fillRoundedRect(cx - panelW / 2 + 4, panelTop + 5, panelW, panelH, 22);

    // Panel body (warm cream)
    panel.fillStyle(0xfef9ef, 1);
    panel.fillRoundedRect(cx - panelW / 2, panelTop, panelW, panelH, 20);

    // Panel border
    panel.lineStyle(2, 0xe0d5c5, 0.6);
    panel.strokeRoundedRect(cx - panelW / 2, panelTop, panelW, panelH, 20);

    // Subtle inner top highlight
    panel.fillStyle(0xffffff, 0.4);
    panel.fillRoundedRect(cx - panelW / 2 + 3, panelTop + 2, panelW - 6, panelH * 0.08,
      { tl: 18, tr: 18, bl: 0, br: 0 });

    // ── Content layout (relative to panel top) ──────────────
    let yPos = panelTop + 15 * sf;

    // ── Logo ────────────────────────────────────────────────
    if (this.textures.exists('logo-full')) {
      const logo = this.add.image(cx, yPos + 55 * sf, 'logo-full').setOrigin(0.5);
      const maxLogoW = panelW * 0.7;
      const maxLogoH = 100 * sf;
      const logoScale = Math.min(maxLogoW / logo.width, maxLogoH / logo.height, 1);
      logo.setScale(logoScale);
      yPos += (logo.height * logoScale) / 2 + 65 * sf;
    } else {
      // Fallback text logo
      const titleSize = Math.round(42 * sf);
      this.add.text(cx, yPos + 30 * sf, 'A.R.C.', {
        fontSize: `${titleSize}px`, fontFamily: FONTS.title, fontStyle: 'bold', color: COLOURS.primary,
      }).setOrigin(0.5);

      // Text shadow
      this.add.text(cx + 2, yPos + 32 * sf, 'A.R.C.', {
        fontSize: `${titleSize}px`, fontFamily: FONTS.title, fontStyle: 'bold', color: '#2a6e3a',
      }).setOrigin(0.5).setAlpha(0.15).setDepth(-1);

      this.add.text(cx, yPos + 68 * sf, 'Animal Rescue Centre', {
        fontSize: `${Math.round(18 * sf)}px`, fontFamily: FONTS.body, fontStyle: 'bold', color: COLOURS.text,
      }).setOrigin(0.5);

      yPos += 90 * sf;
    }

    // ── Tagline ─────────────────────────────────────────────
    this.add.text(cx, yPos, 'Rescue, care for and rehome animals in need!', {
      fontSize: `${Math.round(14 * sf)}px`, fontFamily: FONTS.body, color: COLOURS.textLight,
      fontStyle: 'italic', align: 'center',
      wordWrap: { width: panelW - 50 },
    }).setOrigin(0.5);

    yPos += 30 * sf;

    // ── Grass strip with pets ───────────────────────────────
    this.renderPetPreviews(cx, yPos, panelW - 40, sf);
    yPos += 68 * sf;

    // ── Description ─────────────────────────────────────────
    const descSize = Math.max(14, Math.round(12 * sf));
    const descLines = [
      'Feed hungry animals, play with them, take them on walks,',
      'cure them when they\'re sick, and find them forever homes!',
    ];
    descLines.forEach((line, i) => {
      this.add.text(cx, yPos + i * (descSize + 4), line, {
        fontSize: `${descSize}px`, fontFamily: FONTS.body, color: COLOURS.text,
        align: 'center',
      }).setOrigin(0.5);
    });
    yPos += (descSize + 4) * descLines.length + 30 * sf;

    // ── Action Buttons ──────────────────────────────────────
    const btnW = Math.round(Math.min(260, panelW - 60));
    const btnFontMain = `${Math.round(20 * sf)}px`;
    const btnFontSub = `${Math.round(16 * sf)}px`;

    if (session) {
      // ─ Logged-in layout ─
      // Welcome pill
      const welcomeGfx = this.add.graphics();
      const pillW = Math.min(300, panelW - 50);
      const pillH = 34 * sf;
      welcomeGfx.fillStyle(0xf0f8e8, 0.9);
      welcomeGfx.fillRoundedRect(cx - pillW / 2, yPos - pillH / 2, pillW, pillH, pillH / 2);
      welcomeGfx.lineStyle(1.5, 0x5AAE4A, 0.4);
      welcomeGfx.strokeRoundedRect(cx - pillW / 2, yPos - pillH / 2, pillW, pillH, pillH / 2);

      this.add.text(cx, yPos,
        `Welcome back, ${session.username}! ${session.avatarEmoji}`, {
        fontSize: `${Math.round(16 * sf)}px`, fontFamily: FONTS.body, fontStyle: 'bold', color: COLOURS.primary,
      }).setOrigin(0.5);
      yPos += 35 * sf;

      createButton(this, cx, yPos, 'Enter your centre', () => {
        this.startGame();
      }, { width: btnW, fontSize: btnFontMain, icon: 'icon-play' });
      yPos += 52 * sf;

      createButton(this, cx, yPos, 'Friends', () => {
        this.scene.start('FriendsScene');
      }, { width: btnW, fontSize: btnFontSub, bgColour: COLOURS.warm, icon: 'icon-friends' });
      yPos += 48 * sf;

      // Friend code
      this.add.text(cx, yPos,
        `Your friend code: ${session.joinCode}`, {
        fontSize: `${Math.max(14, Math.round(12 * sf))}px`, fontFamily: FONTS.body, color: COLOURS.textLight,
      }).setOrigin(0.5);
      yPos += 22 * sf;

      createTextButton(this, cx, yPos, 'Log out', () => {
        logout();
        this.scene.start('MainMenuScene');
      });
    } else {
      // ─ Not logged-in layout ─
      createButton(this, cx, yPos, 'Play', () => {
        this.startGame();
      }, { width: btnW, fontSize: btnFontMain, icon: 'icon-play' });
      yPos += 60 * sf;

      createButton(this, cx, yPos, 'Create an account', () => {
        this.scene.start('SignupScene');
      }, { width: btnW, fontSize: btnFontSub, bgColour: COLOURS.warm, icon: 'icon-create-account' });
      yPos += 56 * sf;

      createButton(this, cx, yPos, 'I already have an account', () => {
        this.scene.start('LoginScene');
      }, { width: btnW, fontSize: btnFontSub, bgColour: COLOURS.info, icon: 'icon-login' });
    }

    // ── Credits (pinned to panel bottom) ────────────────────
    const creditsY = panelTop + panelH - 38 * sf;
    this.add.text(cx, creditsY, 'Designed by Lily (age 8)', {
      fontSize: `${Math.max(14, Math.round(12 * sf))}px`, fontFamily: FONTS.body, color: COLOURS.primary,
      fontStyle: 'italic',
    }).setOrigin(0.5);

    this.add.text(cx, creditsY + 16 * sf, 'Built with love by Dad', {
      fontSize: `${Math.max(14, Math.round(10 * sf))}px`, fontFamily: FONTS.body, color: COLOURS.textLight,
    }).setOrigin(0.5);

    // ── Music Toggle (top-right corner of panel) ────────────
    const musicOn = audio.isMusicOn();
    const hasMusicIcons = this.textures.exists('icon-music-on') && this.textures.exists('icon-music-off');

    if (hasMusicIcons) {
      const musicImg = this.add.image(
        cx + panelW / 2 - 15, panelTop + 12,
        musicOn ? 'icon-music-on' : 'icon-music-off'
      ).setOrigin(1, 0).setInteractive({ useHandCursor: true });
      const iconScale = 24 / Math.max(musicImg.width, musicImg.height);
      musicImg.setScale(iconScale);
      musicImg.on('pointerdown', () => {
        audio.toggleMusic();
        musicImg.setTexture(audio.isMusicOn() ? 'icon-music-on' : 'icon-music-off');
      });
    } else {
      const musicBtn = this.add.text(
        cx + panelW / 2 - 15, panelTop + 12,
        musicOn ? 'ON' : 'OFF',
        { fontSize: '12px', fontFamily: FONTS.body, color: '#888' }
      ).setOrigin(1, 0).setInteractive({ useHandCursor: true });
      musicBtn.on('pointerdown', () => {
        audio.toggleMusic();
        musicBtn.setText(audio.isMusicOn() ? 'ON' : 'OFF');
      });
    }

    // ── Viewport resize handling ───────────────────────────
    this.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
      const w = gameSize.width;
      const h = gameSize.height;
      if (Math.abs(w - this._lastWidth) > 50 || Math.abs(h - this._lastHeight) > 50) {
        this._lastWidth = w;
        this._lastHeight = h;
        this.scene.restart();
      }
    });
    this._lastWidth = this.scale.width;
    this._lastHeight = this.scale.height;

    // ── Entrance fade ───────────────────────────────────────
    this.cameras.main.fadeIn(400, 245, 235, 224);
  }

  /**
   * Route to game — fade out, then go to GameScene or LoadingScene.
   */
  private startGame(): void {
    const loader = AssetLoader.getInstance();
    this.tweens.add({
      targets: this.cameras.main,
      alpha: 0,
      duration: 300,
      ease: 'Sine.easeIn',
      onComplete: () => {
        if (loader.isFullyLoaded) {
          this.scene.start('GameScene');
        } else {
          this.scene.start('LoadingScene');
        }
      },
    });
  }

  /**
   * Render pet previews on a lush grass strip.
   */
  private renderPetPreviews(cx: number, y: number, maxWidth: number, sf: number): void {
    const stripW = maxWidth;
    const stripH = Math.round(72 * sf);

    const grass = this.add.graphics();

    // Shadow
    grass.fillStyle(0x000000, 0.08);
    grass.fillRoundedRect(cx - stripW / 2 + 3, y - stripH / 2 + 3, stripW, stripH, 14);

    // Main grass (logo green)
    grass.fillStyle(0x5AAE4A, 1);
    grass.fillRoundedRect(cx - stripW / 2, y - stripH / 2, stripW, stripH, 12);

    // Top highlight
    grass.fillStyle(0x7CC76E, 0.55);
    grass.fillRoundedRect(cx - stripW / 2 + 3, y - stripH / 2 + 2, stripW - 6, stripH * 0.35,
      { tl: 10, tr: 10, bl: 0, br: 0 });

    // Bottom shadow
    grass.fillStyle(0x4A9438, 0.35);
    grass.fillRoundedRect(cx - stripW / 2 + 3, y + stripH * 0.15, stripW - 6, stripH * 0.3,
      { tl: 0, tr: 0, bl: 10, br: 10 });

    // Grass texture dots
    for (let i = 0; i < 16; i++) {
      const gx = cx + (Math.random() - 0.5) * (stripW - 20);
      const gy = y + (Math.random() - 0.5) * (stripH - 10);
      const shade = Math.random() > 0.5 ? 0x4A9438 : 0x7CC76E;
      grass.fillStyle(shade, 0.25 + Math.random() * 0.15);
      grass.fillCircle(gx, gy, 1.5 + Math.random() * 2.5);
    }

    // Outline
    grass.lineStyle(1.5, 0xffffff, 0.12);
    grass.strokeRoundedRect(cx - stripW / 2, y - stripH / 2, stripW, stripH, 12);

    // Grass tufts — small green blades
    const tuftCount = 5;
    const tuftSpacing = stripW / (tuftCount + 1);
    for (let i = 0; i < tuftCount; i++) {
      const tx = cx - stripW / 2 + tuftSpacing * (i + 1) + (i % 2 === 0 ? 5 : -5);
      const ty = y + stripH / 2 - 12 * sf;
      const tuftGfx = this.add.graphics();
      tuftGfx.fillStyle(0x4A9438, 0.5);
      tuftGfx.fillTriangle(tx - 3, ty + 4, tx, ty - 6, tx + 3, ty + 4);
      tuftGfx.fillTriangle(tx + 2, ty + 4, tx + 5, ty - 4, tx + 8, ty + 4);
    }

    // ── Animals (in a swappable container) ────────────────
    this.animalContainer = this.add.container(0, 0);
    this.bannerParams = { cx, y, stripW, sf };
    this.renderAnimalSprites(cx, y, stripW, sf);
  }

  /**
   * Render animal sprites (or emoji fallback) into the banner container.
   * Called once on create, and again when background loading completes.
   */
  private renderAnimalSprites(cx: number, y: number, stripW: number, sf: number): void {
    const showcaseSpecies: Species[] = ['cat', 'dog', 'bunny', 'fox', 'parrot', 'bat', 'snake'];
    const showcaseVariants: { species: Species; variant: string }[] = [];

    for (const sp of showcaseSpecies) {
      const variants = SPECIES_VARIANTS[sp];
      let found = false;
      for (const v of variants) {
        if (this.textures.exists(`${sp}-${v}-sheltered`)) {
          showcaseVariants.push({ species: sp, variant: v });
          found = true;
          break;
        }
      }
      if (!found && this.textures.exists(`${sp}-sheltered`)) {
        showcaseVariants.push({ species: sp, variant: '' });
      }
    }

    // Prefer full sprites → species icons (always boot-loaded) → coloured circle
    const items = showcaseSpecies.map((sp) => {
      const sv = showcaseVariants.find((x) => x.species === sp);
      if (sv) {
        return {
          type: 'sprite' as const,
          key: sv.variant ? `${sv.species}-${sv.variant}-sheltered` : `${sv.species}-sheltered`,
        };
      }
      if (this.textures.exists(`icon-${sp}`)) {
        return { type: 'sprite' as const, key: `icon-${sp}` };
      }
      return { type: 'colour' as const, species: sp };
    });

    const count = items.length;
    const spacing = Math.min(55 * sf, (stripW - 30) / count);
    const startX = cx - ((count - 1) * spacing) / 2;

    items.forEach((item, i) => {
      const ix = startX + i * spacing;
      const iy = y - 6 * sf;

      if (item.type === 'sprite') {
        const sprite = this.add.image(ix, iy, item.key).setOrigin(0.5);
        const targetSize = 42 * sf;
        const scale = Math.min(targetSize / sprite.width, targetSize / sprite.height, 1);
        sprite.setScale(scale);

        this.tweens.add({
          targets: sprite, y: iy - 5 * sf,
          duration: 900 + i * 80, yoyo: true, repeat: -1,
          ease: 'Sine.easeInOut', delay: i * 150,
        });
        this.animalContainer!.add(sprite);
      } else if (item.type === 'colour') {
        // Coloured circle fallback for each species
        const circleColour = SPECIES_COLOURS[item.species] ?? 0x888888;
        const size = Math.round(20 * sf);
        const circle = this.add.circle(ix, iy, size, circleColour)
          .setStrokeStyle(2, 0xffffff, 0.6);

        this.tweens.add({
          targets: circle, y: iy - 5 * sf,
          duration: 800 + i * 100, yoyo: true, repeat: -1,
          ease: 'Sine.easeInOut', delay: i * 120,
        });
        this.animalContainer!.add(circle);
      }
    });
  }
}
