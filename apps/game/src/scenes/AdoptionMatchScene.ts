import Phaser from 'phaser';
import type { Animal } from '@arc/shared-types';
import {
  pickApplicants,
  householdActiveUseCount,
  type Applicant,
  type AdoptionStoreLike,
} from '@arc/game-logic';
import { FONTS, TEXT_RESOLUTION, MIN_FONT, TYPE } from '../ui/constants';
import { readSafeAreaInsets } from '../ui/safe-area';
import {
  computePickerLayout,
  MIN_TEXT,
  type CardPlan,
  type PickerLayout,
  type Rect,
} from '../ui/adoption-match-layout';
import { fitText } from '../ui/fit-text';
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
 *   2. This scene asks game-logic's `pickApplicants` for the few
 *      households on offer (three of the free ones, not all of them),
 *      scores each, and renders cards.
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
/**
 * The animal's art is a square canvas with a margin of nothing round it (the
 * animal fills 62-100% of it), so the box it is drawn in is a little bigger
 * than the room it has: the animal itself fills the polaroid, as it always did.
 */
const ART_BOX = 1.15;
const TIER_LABEL: Record<MatchTier, string> = {
  great: 'Great match',
  good: 'Good match',
  maybe: 'Could work',
};

/** "foxes", "bunnies" — the card says "Loves ___", and `${species}s` gave "foxs" and "bunnys". */
function pluralSpecies(species: string): string {
  if (species.endsWith('y')) return `${species.slice(0, -1)}ies`;
  if (species.endsWith('x')) return `${species}es`;
  return `${species}s`;
}

export class AdoptionMatchScene extends Phaser.Scene {
  private animal!: Animal;
  private store!: AdoptionStoreLike;
  private onComplete!: (householdId: string | null) => void;

  private container!: Phaser.GameObjects.Container;
  private scored: ScoredApplicant[] = [];
  private resolved = false;
  /** Fixed at init, so the offer and the headroom count agree on "now". */
  private now = 0;
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
    this.now = Date.now();
  }

  preload(): void {
    // Each applicant portrait lives at avatarSrc — load any that aren't
    // already in the texture cache. Keys mirror householdId for re-use.
    const offered = pickApplicants(this.animal, this.store, this.now);
    for (const a of offered) {
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
    const offered = pickApplicants(this.animal, this.store, this.now);
    this.scored = offered
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

    // Species preference (always satisfied here — pickApplicants only
    // offers households that take this species — but we surface the line
    // either way).
    if (applicant.speciesPreferences.includes(this.animal.species)) {
      score += 50;
      const speciesWord = applicant.speciesPreferences.length === 1
        ? pluralSpecies(this.animal.species)
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

    // Capacity headroom — a household with nothing fresh is "fresh"; one
    // still settling in an animal is filtered out by the picker, so we only
    // see real headroom here, but we still dial the score by it. "Fresh"
    // means inside the cooldown, and counts either id a household was
    // saved under.
    const used = householdActiveUseCount(this.store.rehomed, applicant.householdId, this.now);
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

    // Where everything goes: one pure function of the screen's size, the number
    // of families on offer and the notch (see ui/adoption-match-layout.ts). The
    // scene draws inside those boxes and fits every piece of text to its box.
    const insets = readSafeAreaInsets();
    const layout = computePickerLayout({
      width,
      height,
      count: this.scored.length,
      safeLeft: insets.left,
      safeRight: insets.right,
      safeTop: insets.top,
      safeBottom: insets.bottom,
    });
    // Published for the Playwright checks (e2e/adoption-handover.spec.ts).
    this.container.setData('layout', layout);

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

    this.renderHeader(layout);
    this.renderAnimalPolaroid(layout);

    if (this.scored.length === 0) {
      this.renderEmptyState(layout.empty);
    } else {
      // The cards come before the way out: the last interactive rectangle added is "not yet".
      this.scored.forEach((s, i) => this.renderCard(layout.cards[i], s, i));
    }

    this.renderNotYet(layout);
  }

  /** Add a Text to the scene's container, named so the checks can find it. */
  private addText(
    name: string,
    x: number,
    y: number,
    content: string,
    style: Phaser.Types.GameObjects.Text.TextStyle,
    origin: [number, number] = [0, 0],
  ): Phaser.GameObjects.Text {
    const t = this.add.text(x, y, content, { resolution: TEXT_RESOLUTION, ...style })
      .setOrigin(origin[0], origin[1])
      .setName(name);
    this.container.add(t);
    return t;
  }

  private renderHeader(layout: PickerLayout): void {
    const r = layout.header;
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.18);
    shadow.fillRoundedRect(r.x + 3, r.y + 5, r.w, r.h, 14);
    this.container.add(shadow);

    const plaque = this.add.graphics();
    plaque.fillStyle(TRELLIS_BROWN, 1);
    plaque.fillRoundedRect(r.x, r.y, r.w, r.h, 14);
    plaque.lineStyle(3, 0x5e431f, 1);
    plaque.strokeRoundedRect(r.x, r.y, r.w, r.h, 14);
    this.container.add(plaque);

    // Honey sash
    const sash = { x: r.x + 8, y: r.y + 8, w: r.w - 16, h: r.h - 16 };
    const sashG = this.add.graphics();
    sashG.fillStyle(HONEY, 1);
    sashG.fillRoundedRect(sash.x, sash.y, sash.w, sash.h, 8);
    this.container.add(sashG);

    const cx = sash.x + sash.w / 2;
    const innerW = sash.w - 16;
    const title = this.addText('picker-title', cx, sash.y, 'Adoption Office', {
      fontSize: `${layout.titleFont}px`,
      fontFamily: FONTS.title,
      fontStyle: 'bold',
      color: '#3a2010',
      align: 'center',
    }, [0.5, 0]);
    fitText(title, { w: innerW, h: sash.h }, { maxLines: layout.titleLines });

    const sub = this.addText('picker-subtitle', cx, sash.y,
      `Who feels like the right home for ${this.animal.name}?`, {
        fontSize: `${layout.subtitleFont}px`,
        fontFamily: FONTS.body,
        fontStyle: 'italic',
        color: '#3a2618',
        align: 'center',
      }, [0.5, 0]);
    fitText(sub, { w: innerW, h: Math.max(18, sash.h - 8 - title.height - 2) }, { maxLines: layout.subtitleLines });

    // The pair sits in the middle of the sash.
    const total = title.height + 2 + sub.height;
    const top = sash.y + Math.max(0, (sash.h - total) / 2);
    title.setY(top);
    sub.setY(top + title.height + 2);
  }

  private renderAnimalPolaroid(layout: PickerLayout): void {
    const r = layout.polaroid;
    if (r.h <= 0) return;
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.18);
    shadow.fillRoundedRect(r.x + 4, r.y + 6, r.w, r.h, 8);
    this.container.add(shadow);

    const card = this.add.graphics();
    card.fillStyle(0xffffff, 1);
    card.fillRoundedRect(r.x, r.y, r.w, r.h, 6);
    card.lineStyle(2, 0xe6d8bf, 1);
    card.strokeRoundedRect(r.x, r.y, r.w, r.h, 6);
    this.container.add(card);

    const bondPct = Math.round(this.animal.bondLevel ?? 0);
    const nameStyle = {
      fontSize: TYPE.lead,
      fontFamily: FONTS.title,
      fontStyle: 'bold',
      color: '#3a2618',
    };

    if (layout.polaroidStyle === 'wide') {
      // The animal on the left, its words on the right.
      const room = r.h - 16;
      const box = room * ART_BOX;
      // Solo: a polaroid of one animal. A portrait in a frame is not a row.
      this.container.add(createAnimalSprite(this, r.x + 8 + room / 2, r.y + r.h / 2, this.animal, {
        width: box, height: box, scale: 'fill',
      }));
      const tx = r.x + 8 + room + 8;
      const tw = r.x + r.w - 10 - tx;
      const name = this.addText('picker-animal-name', tx, r.y, this.animal.name, nameStyle);
      fitText(name, { w: tw, h: 34 }, { maxLines: 1 });
      const species = this.addText('picker-animal-species', tx, r.y, this.animal.species, {
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body, color: '#6b3a18', fontStyle: 'italic',
      });
      fitText(species, { w: tw, h: 26 }, { maxLines: 1 });
      const bond = this.addText('picker-animal-bond', tx, r.y, `Bond ${bondPct}%`, {
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body, fontStyle: 'bold', color: '#2e6b3a',
      });
      fitText(bond, { w: tw, h: 26 }, { maxLines: 1 });
      const total = name.height + species.height + bond.height;
      const top = r.y + Math.max(4, (r.h - total) / 2);
      name.setY(top);
      species.setY(top + name.height);
      bond.setY(top + name.height + species.height);
    } else {
      // The animal above its words, centred: the rail of a phone held sideways.
      const cx = r.x + r.w / 2;
      const textH = 34 + 26;
      const room = Math.max(40, Math.min(96, r.h - textH - 16));
      const box = room * ART_BOX;
      this.container.add(createAnimalSprite(this, cx, r.y + 8 + room / 2, this.animal, {
        width: box, height: box, scale: 'fill',
      }));
      const name = this.addText('picker-animal-name', cx, r.y + 8 + room, this.animal.name, nameStyle, [0.5, 0]);
      fitText(name, { w: r.w - 16, h: 34 }, { maxLines: 1 });
      const meta = this.addText('picker-animal-bond', cx, name.y + name.height, `${this.animal.species} · Bond ${bondPct}%`, {
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body, fontStyle: 'bold', color: '#2e6b3a',
      }, [0.5, 0]);
      fitText(meta, { w: r.w - 16, h: 26 }, { maxLines: 1 });
    }
  }

  private renderEmptyState(r: Rect): void {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    this.container.add(
      this.add.text(cx, cy - 24, '🏠', { fontSize: '48px', fontFamily: FONTS.body, resolution: TEXT_RESOLUTION })
        .setOrigin(0.5),
    );
    const msg = this.addText('picker-empty', cx, cy + 20,
      `No families looking for a ${this.animal.species} this week.`, {
        fontSize: TYPE.caption,
        fontFamily: FONTS.body,
        color: '#6b3a18',
        fontStyle: 'italic',
        align: 'center',
      }, [0.5, 0]);
    fitText(msg, { w: Math.min(r.w, 360), h: 60 }, { maxLines: 3 });
    this.addText('picker-empty-hint', cx, msg.y + msg.height + 6, 'Try again in a few days.', {
      fontSize: `${MIN_FONT.small}px`,
      fontFamily: FONTS.body,
      color: '#6b5a4a',
      align: 'center',
    }, [0.5, 0]);
  }

  private renderCard(plan: CardPlan, s: ScoredApplicant, index: number): void {
    const tierCol = TIER_COLOURS[s.tier];
    const r = plan.rect;
    const tag = (part: string): string => `picker-card-${part}:${index}`;

    // Drop shadow
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.20);
    shadow.fillRoundedRect(r.x + 3, r.y + 6, r.w, r.h, 14);
    this.container.add(shadow);

    // Card paper
    const card = this.add.graphics();
    const paint = (fill: number, edge: number, edgeW: number): void => {
      card.clear();
      card.fillStyle(fill, 1);
      card.fillRoundedRect(r.x, r.y, r.w, r.h, 14);
      card.lineStyle(edgeW, edge, 1);
      card.strokeRoundedRect(r.x, r.y, r.w, r.h, 14);
    };
    paint(PAPER, 0x8a5a2a, 2);
    this.container.add(card);

    // Portrait
    this.renderPortrait(s.applicant, plan.portrait);

    // Match-tier sticker
    const st = plan.sticker;
    const sticker = this.add.graphics();
    sticker.fillStyle(tierCol.bg, 1);
    sticker.fillRoundedRect(st.x, st.y, st.w, st.h, st.h / 2);
    sticker.lineStyle(2, 0x000000, 0.18);
    sticker.strokeRoundedRect(st.x, st.y, st.w, st.h, st.h / 2);
    this.container.add(sticker);
    const stickerText = this.addText(tag('sticker'), st.x + st.w / 2, st.y + st.h / 2, TIER_LABEL[s.tier], {
      fontSize: `${MIN_FONT.small}px`,
      fontFamily: FONTS.title,
      fontStyle: 'bold',
      color: tierCol.ink,
    }, [0.5, 0.5]);
    fitText(stickerText, { w: st.w - 8, h: st.h }, { maxLines: 1 });

    // Name
    const centred = plan.align === 'center';
    const nameX = centred ? plan.name.x + plan.name.w / 2 : plan.name.x;
    const name = this.addText(tag('name'), nameX, plan.name.y, s.applicant.name, {
      fontSize: `${plan.nameFont}px`,
      fontFamily: FONTS.title,
      fontStyle: 'bold',
      color: '#3a2010',
      align: plan.align,
    }, [centred ? 0.5 : 0, 0]);
    fitText(name, { w: plan.name.w, h: plan.nameLines * (plan.nameFont + 8) }, { maxLines: plan.nameLines });

    // Blurb and reasons flow down the text column, below the name (and the pill, when it shares the name's line).
    const colBottom = plan.text.y + plan.text.h;
    let flowY = name.y + name.height + 2;
    if (plan.stickerInline) flowY = Math.max(flowY, plan.sticker.y + plan.sticker.h + 2);

    // Measure the reasons first, so the blurb is fitted to what they leave.
    const reasonTexts: Phaser.GameObjects.Text[] = [];
    let reasonsH = 0;
    if (plan.reasons) {
      s.reasons.slice(0, 2).forEach((reason, j) => {
        const t = this.addText(`picker-card-reason:${index}:${j}`, centred ? nameX : plan.text.x, 0, `• ${reason}`, {
          fontSize: `${plan.reasonFont}px`,
          fontFamily: FONTS.body,
          color: '#2e6b3a',
          align: plan.align,
        }, [centred ? 0.5 : 0, 0]);
        fitText(t, { w: plan.text.w, h: 44 }, { maxLines: 2 });
        reasonTexts.push(t);
        reasonsH += t.height;
      });
    }
    const MIN_BLURB_H = 3 * (MIN_TEXT + 5);
    let blurbRoom = colBottom - flowY - (reasonsH ? reasonsH + 6 : 0);
    if (reasonsH && blurbRoom < MIN_BLURB_H) {
      // Not enough left for the blurb with the reasons under it: the blurb comes first.
      reasonTexts.forEach((t) => t.destroy());
      reasonTexts.length = 0;
      reasonsH = 0;
      blurbRoom = colBottom - flowY;
    }
    const blurb = this.addText(tag('blurb'), centred ? nameX : plan.text.x, flowY, s.applicant.blurb, {
      fontSize: `${plan.blurbFont}px`,
      fontFamily: FONTS.body,
      color: '#4a2e14',
      fontStyle: 'italic',
      align: plan.align,
    }, [centred ? 0.5 : 0, 0]);
    fitText(blurb, { w: plan.text.w, h: Math.max(0, blurbRoom) });
    let reasonY = blurb.y + blurb.height + 6;
    for (const t of reasonTexts) {
      t.setY(reasonY);
      reasonY += t.height;
    }

    // Hit area — the whole card.
    const hit = this.add.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, 0x000000, 0)
      .setInteractive({ useHandCursor: true })
      .setName(tag('hit'));
    hit.on('pointerover', () => paint(0xffeec8, HONEY, 3));
    hit.on('pointerout', () => paint(PAPER, 0x8a5a2a, 2));
    hit.on('pointerdown', () => this.pickApplicant(s.applicant));
    this.container.add(hit);
  }

  /** The household's portrait in a honey frame, `frame` being the frame's square. */
  private renderPortrait(applicant: Applicant, frameRect: Rect): void {
    const size = frameRect.w;
    const cx = frameRect.x + size / 2;
    const cy = frameRect.y + size / 2;
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

  private renderNotYet(layout: PickerLayout): void {
    const r = layout.notYet;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.22);
    shadow.fillRoundedRect(r.x + 2, r.y + 4, r.w, r.h, r.h / 2);
    this.container.add(shadow);

    const pill = this.add.graphics();
    pill.fillStyle(SAGE_GREEN, 1);
    pill.fillRoundedRect(r.x, r.y, r.w, r.h, r.h / 2);
    pill.lineStyle(2.5, SAGE_DARK, 1);
    pill.strokeRoundedRect(r.x, r.y, r.w, r.h, r.h / 2);
    this.container.add(pill);

    const label = this.addText('picker-notyet-label', cx, cy, layout.notYetLabel, {
      fontSize: `${layout.notYetFont}px`,
      fontFamily: FONTS.title,
      fontStyle: 'bold',
      color: '#fffbe8',
      align: 'center',
    }, [0.5, 0.5]);
    fitText(label, { w: r.w - r.h, h: r.h - 8 }, { maxLines: layout.notYetLines });

    const hit = this.add.rectangle(cx, cy, r.w, r.h, 0x000000, 0)
      .setInteractive({ useHandCursor: true })
      .setName('picker-notyet-hit');
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
