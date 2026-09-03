import Phaser from 'phaser';
import type { Animal } from '@arc/shared-types';
import {
  getEligibleApplicants,
  type Applicant,
  type AdoptionStoreLike,
} from '@arc/game-logic';
import { FONTS, TEXT_RESOLUTION, MIN_FONT, TYPE } from '../ui/constants';
import { createAnimalSprite } from '../ui/sprites';
import { AudioManager } from '../audio/AudioManager';

/**
 * AdoptionMatchScene — painted-storybook adoption picker.
 *
 * Replaces the previous `adoption-office.html` iframe overlay with a
 * native Phaser scene so the picker shares scene-management lifecycle
 * with the rest of the game (pause/resume, audio, registry).
 *
 * Visuals follow `apps/game/public/admin/adoption.html` — warm cream
 * wash, painted polaroid for the animal, sticker-style household cards
 * with portraits + blurb + a per-card "match" banner. The match score
 * is a deterministic, kid-readable signal (see `scoreApplicant`).
 *
 * Lifecycle:
 *   1. GameScene calls `openAdoptionMatchOverlay(animal)`, which pauses
 *      itself and `scene.launch('AdoptionMatchScene', { animal,
 *      onComplete })`.
 *   2. This scene reads the curtailed L1 roster via game-logic's
 *      `getEligibleApplicants`, scores each, and renders cards.
 *   3. Tapping a card fires `onComplete(householdId)`; tapping "not yet"
 *      fires `onComplete(null)`. Either way we stop ourselves so
 *      GameScene resumes and runs `commitAdoption` (or no-ops).
 */

interface AdoptionMatchInit {
  animal: Animal;
  store: AdoptionStoreLike;
  onComplete: (householdId: string | null) => void;
}

type MatchTier = 'great' | 'good' | 'maybe';

interface ScoredApplicant {
  applicant: Applicant;
  score: number;
  tier: MatchTier;
  reasons: string[];
}

const CREAM = 0xfef9ef;
const HONEY = 0xe3b04b;
const HONEY_DARK = 0xb88a37;
const TRELLIS_BROWN = 0x7b5c3a;
const INK = 0x3a3a3a;
const PAPER = 0xfff8e3;
const SAGE_GREEN = 0x5d7f4a;
const SAGE_DARK = 0x3f5d32;
const TIER_COLOURS: Record<MatchTier, { bg: number; ink: string }> = {
  great: { bg: 0x6fb37a, ink: '#1f3a23' },
  good: { bg: 0xe3b04b, ink: '#3a2a10' },
  maybe: { bg: 0xc9a369, ink: '#3a2a14' },
};
const TIER_LABEL: Record<MatchTier, string> = {
  great: 'Great match',
  good: 'Good match',
  maybe: 'Could work',
};

export class AdoptionMatchScene extends Phaser.Scene {
  private animal!: Animal;
  private store!: AdoptionStoreLike;
  private onComplete!: (householdId: string | null) => void;

  private container!: Phaser.GameObjects.Container;
  private scored: ScoredApplicant[] = [];
  private resolved = false;
  private _lastWidth = 0;
  private _lastHeight = 0;

  constructor() {
    super({ key: 'AdoptionMatchScene' });
  }

  init(data: AdoptionMatchInit): void {
    this.animal = data.animal;
    this.store = data.store;
    this.onComplete = data.onComplete;
    this.resolved = false;
  }

  preload(): void {
    // Each applicant portrait lives at avatarSrc — load any that aren't
    // already in the texture cache. Keys mirror householdId for re-use.
    const eligible = getEligibleApplicants(this.animal, this.store);
    for (const a of eligible) {
      const key = `cast:${a.householdId}`;
      if (!this.textures.exists(key)) {
        this.load.image(key, a.avatarSrc);
      }
    }
    // Failures are non-fatal — we fall back to a painted name plate.
    this.load.on('loaderror', () => { /* swallowed; per-card fallback handles it */ });
  }

  create(): void {
    this.container = this.add.container(0, 0);

    // Score and stash for render. Sort: tier rank desc, then score desc.
    const eligible = getEligibleApplicants(this.animal, this.store);
    this.scored = eligible
      .map((a) => this.scoreApplicant(a))
      .sort((a, b) => {
        const rank = (t: MatchTier) => t === 'great' ? 2 : t === 'good' ? 1 : 0;
        if (rank(b.tier) !== rank(a.tier)) return rank(b.tier) - rank(a.tier);
        return b.score - a.score;
      });

    // Resize handling — restart scene like sibling scenes do, no
    // mid-flight layout fixups.
    this._lastWidth = this.scale.width;
    this._lastHeight = this.scale.height;
    this.scale.on('resize', this.handleResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.handleResize, this));

    this.cameras.main.fadeIn(280, 254, 249, 239);
    this.renderView();
  }

  private handleResize(gameSize: Phaser.Structs.Size): void {
    if (Math.abs(gameSize.width - this._lastWidth) > 50 ||
        Math.abs(gameSize.height - this._lastHeight) > 50) {
      this._lastWidth = gameSize.width;
      this._lastHeight = gameSize.height;
      this.scene.restart({
        animal: this.animal,
        store: this.store,
        onComplete: this.onComplete,
      });
    }
  }

  /** Build a kid-readable score with tier + reasons. */
  private scoreApplicant(applicant: Applicant): ScoredApplicant {
    const reasons: string[] = [];
    let score = 0;

    // Species preference (always satisfied here — getEligibleApplicants
    // already filters — but we surface the line either way).
    if (applicant.speciesPreferences.includes(this.animal.species)) {
      score += 50;
      const speciesWord = applicant.speciesPreferences.length === 1
        ? `${this.animal.species}s`
        : 'pets like this';
      reasons.push(`Loves ${speciesWord}`);
    }

    // Bond: a well-bonded animal slots in faster.
    const bond = this.animal.bondLevel ?? 0;
    if (bond >= 80) {
      score += 30;
      reasons.push(`${this.animal.name} is settled and ready`);
    } else if (bond >= 60) {
      score += 15;
      reasons.push(`${this.animal.name} is bonded enough to leave`);
    }

    // Capacity headroom — a household at 0/1 used is "fresh", a returning
    // adopter (1/1) is filtered out by getEligibleApplicants so we only
    // see real headroom here, but we still dial the score by it.
    const used = this.store.rehomed.filter((r) => r.householdId === applicant.householdId).length;
    const headroom = applicant.capacity - used;
    if (headroom >= 1) score += 10;

    // Tier — deterministic banding so the kid sees three honest signals.
    let tier: MatchTier;
    if (score >= 85) tier = 'great';
    else if (score >= 60) tier = 'good';
    else tier = 'maybe';

    return { applicant, score, tier, reasons };
  }

  private renderView(): void {
    this.container.removeAll(true);
    const { width, height } = this.scale;

    // ── Painted background ─────────────────────────────────────
    const bg = this.add.graphics();
    bg.fillStyle(CREAM, 1);
    bg.fillRect(0, 0, width, height);
    // Soft amber radial wash, top-centre.
    bg.fillStyle(HONEY, 0.10);
    bg.fillCircle(width / 2, height * 0.15, Math.max(width, height) * 0.6);
    // Warmer corner wash, bottom-left.
    bg.fillStyle(HONEY_DARK, 0.06);
    bg.fillCircle(width * 0.15, height * 0.95, Math.max(width, height) * 0.5);
    this.container.add(bg);

    // ── Header plaque ──────────────────────────────────────────
    const headerY = Math.max(56, height * 0.09);
    this.renderHeader(width, headerY);

    // ── Animal polaroid ────────────────────────────────────────
    const polaroidY = headerY + 92;
    this.renderAnimalPolaroid(width / 2, polaroidY);

    // ── Cards row ──────────────────────────────────────────────
    const cardsTop = polaroidY + 130;
    const cardsBottom = height - 84;
    this.renderCards(width, cardsTop, cardsBottom - cardsTop);

    // ── "Not yet" pill, bottom-centre ──────────────────────────
    this.renderNotYet(width / 2, height - 38);
  }

  private renderHeader(width: number, y: number): void {
    // Plaque rectangle (rounded, painted-wood feel via tinted gradient).
    const plaqueW = Math.min(width - 48, 640);
    const plaqueH = 76;
    const x = width / 2 - plaqueW / 2;

    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.18);
    shadow.fillRoundedRect(x + 3, y - plaqueH / 2 + 5, plaqueW, plaqueH, 14);
    this.container.add(shadow);

    const plaque = this.add.graphics();
    plaque.fillStyle(TRELLIS_BROWN, 1);
    plaque.fillRoundedRect(x, y - plaqueH / 2, plaqueW, plaqueH, 14);
    plaque.lineStyle(3, 0x5e431f, 1);
    plaque.strokeRoundedRect(x, y - plaqueH / 2, plaqueW, plaqueH, 14);
    this.container.add(plaque);

    // Honey sash
    const sash = this.add.graphics();
    sash.fillStyle(HONEY, 1);
    sash.fillRoundedRect(x + 8, y - plaqueH / 2 + 8, plaqueW - 16, plaqueH - 16, 8);
    this.container.add(sash);

    this.container.add(
      this.add.text(width / 2, y - 12, 'Adoption Office', {
        fontSize: '28px',
        fontFamily: FONTS.title,
        fontStyle: 'bold',
        color: '#3a2010',
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5),
    );
    this.container.add(
      this.add.text(width / 2, y + 16,
        `Who feels like the right home for ${this.animal.name}?`, {
          fontSize: TYPE.caption,
          fontFamily: FONTS.body,
          fontStyle: 'italic',
          color: '#3a2618',
          resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5),
    );
  }

  private renderAnimalPolaroid(cx: number, cy: number): void {
    const w = 200, h = 110;
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.18);
    shadow.fillRoundedRect(cx - w / 2 + 4, cy - h / 2 + 6, w, h, 8);
    this.container.add(shadow);

    const card = this.add.graphics();
    card.fillStyle(0xffffff, 1);
    card.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 6);
    card.lineStyle(2, 0xe6d8bf, 1);
    card.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 6);
    this.container.add(card);

    const sprite = createAnimalSprite(this, cx - 50, cy - 4, this.animal, { width: 172, height: 168 });
    this.container.add(sprite);

    // Hand-lettered name + species
    this.container.add(
      this.add.text(cx + 10, cy - 26, this.animal.name, {
        fontSize: '20px',
        fontFamily: FONTS.title,
        fontStyle: 'bold',
        color: '#3a2618',
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0, 0.5),
    );
    this.container.add(
      this.add.text(cx + 10, cy - 4, this.animal.species, {
        fontSize: `${MIN_FONT.small}px`,
        fontFamily: FONTS.body,
        color: '#6b3a18',
        fontStyle: 'italic',
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0, 0.5),
    );
    const bondPct = Math.round(this.animal.bondLevel ?? 0);
    this.container.add(
      this.add.text(cx + 10, cy + 18, `Bond ${bondPct}%`, {
        fontSize: `${MIN_FONT.small}px`,
        fontFamily: FONTS.body,
        fontStyle: 'bold',
        color: '#2e6b3a',
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0, 0.5),
    );
  }

  private renderCards(width: number, top: number, available: number): void {
    if (this.scored.length === 0) {
      this.renderEmptyState(width / 2, top + available / 2);
      return;
    }

    const sidePad = 24;
    const gap = 16;
    const n = this.scored.length;
    // Stack vertically on narrow viewports — keeps cards big enough to
    // tap with chubby fingers; otherwise lay out horizontally.
    const horizontal = width >= 720 && n > 1;

    if (horizontal) {
      const cardW = (width - sidePad * 2 - gap * (n - 1)) / n;
      const cardH = Math.min(available - 8, 320);
      this.scored.forEach((s, i) => {
        const x = sidePad + i * (cardW + gap) + cardW / 2;
        const y = top + cardH / 2;
        this.renderCard(s, x, y, cardW, cardH);
      });
    } else {
      const cardW = Math.min(width - sidePad * 2, 460);
      const rows = n;
      const cardH = Math.max(96, Math.min((available - gap * (rows - 1)) / rows, 150));
      this.scored.forEach((s, i) => {
        const x = width / 2;
        const y = top + cardH / 2 + i * (cardH + gap);
        this.renderCard(s, x, y, cardW, cardH);
      });
    }
  }

  private renderEmptyState(cx: number, cy: number): void {
    this.container.add(
      this.add.text(cx, cy - 24, '🏠', { fontSize: '48px', fontFamily: FONTS.body, resolution: TEXT_RESOLUTION })
        .setOrigin(0.5),
    );
    this.container.add(
      this.add.text(cx, cy + 24,
        `No families looking for a ${this.animal.species} this week.`, {
          fontSize: '16px',
          fontFamily: FONTS.body,
          color: '#6b3a18',
          fontStyle: 'italic',
          align: 'center',
          wordWrap: { width: 360 },
          resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5),
    );
    this.container.add(
      this.add.text(cx, cy + 70, 'Try again in a few days.', {
        fontSize: `${MIN_FONT.small}px`,
        fontFamily: FONTS.body,
        color: '#888',
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5),
    );
  }

  private renderCard(s: ScoredApplicant, cx: number, cy: number, w: number, h: number): void {
    const tierCol = TIER_COLOURS[s.tier];

    // Drop shadow
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.20);
    shadow.fillRoundedRect(cx - w / 2 + 3, cy - h / 2 + 6, w, h, 14);
    this.container.add(shadow);

    // Card paper
    const card = this.add.graphics();
    card.fillStyle(PAPER, 1);
    card.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 14);
    card.lineStyle(2, 0x8a5a2a, 1);
    card.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 14);
    this.container.add(card);

    // Match-tier sticker — top-right
    const stickerW = 96, stickerH = 26;
    const stickerX = cx + w / 2 - stickerW / 2 - 10;
    const stickerY = cy - h / 2 + stickerH / 2 + 8;
    const sticker = this.add.graphics();
    sticker.fillStyle(tierCol.bg, 1);
    sticker.fillRoundedRect(stickerX - stickerW / 2, stickerY - stickerH / 2, stickerW, stickerH, 13);
    sticker.lineStyle(2, 0x000000, 0.18);
    sticker.strokeRoundedRect(stickerX - stickerW / 2, stickerY - stickerH / 2, stickerW, stickerH, 13);
    this.container.add(sticker);
    this.container.add(
      this.add.text(stickerX, stickerY, TIER_LABEL[s.tier], {
        fontSize: `${MIN_FONT.small}px`,
        fontFamily: FONTS.title,
        fontStyle: 'bold',
        color: tierCol.ink,
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5),
    );

    // Portrait — square thumb on the left.
    const portraitSize = Math.min(h - 24, 110);
    const portraitX = cx - w / 2 + portraitSize / 2 + 12;
    const portraitY = cy;
    this.renderPortrait(s.applicant, portraitX, portraitY, portraitSize);

    // Name + blurb — to the right of the portrait, above the sticker.
    const textX = portraitX + portraitSize / 2 + 14;
    const textW = (cx + w / 2) - textX - 16;

    this.container.add(
      this.add.text(textX, cy - h / 2 + 16, s.applicant.name, {
        fontSize: '17px',
        fontFamily: FONTS.title,
        fontStyle: 'bold',
        color: '#3a2010',
        resolution: TEXT_RESOLUTION,
        wordWrap: { width: textW - stickerW - 4 },
      }).setOrigin(0, 0),
    );

    this.container.add(
      this.add.text(textX, cy - 8, s.applicant.blurb, {
        fontSize: '12.5px',
        fontFamily: FONTS.body,
        color: '#4a2e14',
        fontStyle: 'italic',
        wordWrap: { width: textW },
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0, 0.5),
    );

    // Reasons — small bullet stack at the bottom.
    const reasonY = cy + h / 2 - 12 - Math.min(s.reasons.length, 2) * 14;
    s.reasons.slice(0, 2).forEach((r, i) => {
      this.container.add(
        this.add.text(textX, reasonY + i * 14, `• ${r}`, {
          fontSize: '11.5px',
          fontFamily: FONTS.body,
          color: '#2e6b3a',
          resolution: TEXT_RESOLUTION,
          wordWrap: { width: textW },
        }).setOrigin(0, 0),
      );
    });

    // Hit area — the whole card.
    const hit = this.add.rectangle(cx, cy, w, h, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => {
      card.clear();
      card.fillStyle(0xffeec8, 1);
      card.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 14);
      card.lineStyle(3, HONEY, 1);
      card.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 14);
    });
    hit.on('pointerout', () => {
      card.clear();
      card.fillStyle(PAPER, 1);
      card.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 14);
      card.lineStyle(2, 0x8a5a2a, 1);
      card.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 14);
    });
    hit.on('pointerdown', () => this.pickApplicant(s.applicant));
    this.container.add(hit);
  }

  private renderPortrait(applicant: Applicant, cx: number, cy: number, size: number): void {
    // Honey-rim frame.
    const frame = this.add.graphics();
    frame.fillStyle(HONEY_DARK, 1);
    frame.fillRoundedRect(cx - size / 2, cy - size / 2, size, size, 10);
    this.container.add(frame);

    // Inner cream pad.
    const inner = this.add.graphics();
    inner.fillStyle(0xfff3d8, 1);
    inner.fillRoundedRect(cx - size / 2 + 4, cy - size / 2 + 4, size - 8, size - 8, 8);
    this.container.add(inner);

    const key = `cast:${applicant.householdId}`;
    if (this.textures.exists(key)) {
      const img = this.add.image(cx, cy, key);
      const tex = this.textures.get(key).getSourceImage() as { width?: number; height?: number };
      const tw = tex?.width ?? size;
      const th = tex?.height ?? size;
      const fit = (size - 12) / Math.max(tw, th);
      img.setScale(fit);
      // Square mask so portraits with off-square aspect stay tidy.
      const maskShape = this.make.graphics({}, false);
      maskShape.fillStyle(0xffffff);
      maskShape.fillRoundedRect(cx - size / 2 + 4, cy - size / 2 + 4, size - 8, size - 8, 8);
      const mask = maskShape.createGeometryMask();
      img.setMask(mask);
      this.container.add(img);
    } else {
      // Painted-name fallback (file missing or load failed).
      const initials = applicant.name
        .split(/\s+/)
        .filter((p) => p.length > 0)
        .slice(0, 2)
        .map((p) => p.replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase())
        .join('');
      this.container.add(
        this.add.text(cx, cy, initials || '?', {
          fontSize: `${Math.round(size * 0.4)}px`,
          fontFamily: FONTS.title,
          fontStyle: 'bold',
          color: '#6b3a18',
          resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5),
      );
    }
  }

  private renderNotYet(cx: number, cy: number): void {
    const w = 240, h = 44;
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.22);
    shadow.fillRoundedRect(cx - w / 2 + 2, cy - h / 2 + 4, w, h, h / 2);
    this.container.add(shadow);

    const pill = this.add.graphics();
    pill.fillStyle(SAGE_GREEN, 1);
    pill.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, h / 2);
    pill.lineStyle(2.5, SAGE_DARK, 1);
    pill.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, h / 2);
    this.container.add(pill);

    const label = this.add.text(cx, cy, '← Not yet, let me hug them first', {
      fontSize: TYPE.caption,
      fontFamily: FONTS.title,
      fontStyle: 'bold',
      color: '#fffbe8',
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5);
    this.container.add(label);

    const hit = this.add.rectangle(cx, cy, w, h, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => label.setScale(1.04));
    hit.on('pointerout', () => label.setScale(1));
    hit.on('pointerdown', () => this.cancel());
    this.container.add(hit);
  }

  private pickApplicant(applicant: Applicant): void {
    if (this.resolved) return;
    this.resolved = true;

    AudioManager.getInstance().playSfx('animal_happy');

    // Light "card-pop" tween before we close.
    this.cameras.main.flash(180, 255, 240, 200);
    this.time.delayedCall(220, () => {
      const cb = this.onComplete;
      this.scene.stop();
      cb(applicant.householdId);
    });
  }

  private cancel(): void {
    if (this.resolved) return;
    this.resolved = true;
    this.cameras.main.fadeOut(180, 254, 249, 239);
    this.time.delayedCall(200, () => {
      const cb = this.onComplete;
      this.scene.stop();
      cb(null);
    });
  }

  // Mark INK + suppress unused-warnings for future palette extensions.
  private static readonly _palette = { CREAM, INK };
}
