import Phaser from 'phaser';
import type { Animal } from '@arc/shared-types';
import { RESOLUTION_ACTIONS, type Conflict, type ResolutionDef } from '@arc/game-logic';
import { createButton } from '../ui/UIButton';
import { createAnimalSprite } from '../ui/sprites';
import { COLOURS, FONTS, TEXT_RESOLUTION, MIN_FONT } from '../ui/constants';
import { playAreaFor, HUD_HEIGHT } from '../ui/layout';
import type { GameStateStore } from '../game-state';

/**
 * ConflictView — renders the two-animal squabble popup and the
 * post-resolution feedback screen.
 *
 * Phase 4 extraction. The popup is a "modal view" in the sense that it
 * replaces the current view entirely (via scene.clearView) rather than
 * overlaying — that matches the existing shelter UX where a conflict
 * takes over until resolved.
 *
 * Two render functions:
 *  - renderConflictPopup: asks the player to pick a resolution action.
 *    Calls onResolve(actionDef) when one is tapped.
 *  - renderConflictResult: calm screen after the mutation, with a
 *    "Back" button that calls onBack.
 *
 * Scene coordinates state mutations and view switching itself; these
 * functions just render.
 */

export interface ConflictPopupCallbacks {
  onResolve: (action: ResolutionDef) => void;
}

export function renderConflictPopup(
  scene: Phaser.Scene,
  store: GameStateStore,
  container: Phaser.GameObjects.Container,
  conflict: Conflict,
  callbacks: ConflictPopupCallbacks,
): void {
  const { width, height } = scene.scale;

  // This popup takes the view over, but the HUD and the rail are drawn
  // into their own containers and stay on top of it, so it has to lay out
  // in the space they leave — the same play area every other view uses.
  //
  // It used to run top-down from y=80 in a single column: the title
  // landed inside the HUD's second row and was printed over by the
  // time-of-day and weather pills, and the four resolution cards ran to
  // y=611 — off the bottom of any landscape phone, on a screen a child
  // cannot leave until she picks one. Landscape has width to spare and no
  // height to spare, so the cards go in a row and the layout is anchored
  // to the bottom rather than accumulated from the top.
  const play = playAreaFor(width, height);
  const cx = play.x + play.w / 2;
  const top = HUD_HEIGHT + 8;
  // clearView() empties navContainer, so a conflict has the bottom back.
  const bottom = height - 16;

  // Background fill
  container.add(
    scene.add.rectangle(play.x, 0, play.w, height, 0xfff3e0).setOrigin(0, 0),
  );

  // Title
  container.add(
    scene.add.text(cx, top + 18, `${conflict.type.replace('_', ' ').toUpperCase()}!`, {
      fontSize: '26px', fontFamily: FONTS.title, color: '#e74c3c',
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5),
  );

  // Description — the pre-built narrative from generateConflict
  const animal1 = store.animals.find((a) => a.id === conflict.animal1Id);
  const animal2 = store.animals.find((a) => a.id === conflict.animal2Id);

  const description = scene.add.text(cx, top + 52, conflict.description, {
    fontSize: '17px', fontFamily: FONTS.body, color: COLOURS.text,
    wordWrap: { width: play.w - 80 }, align: 'center',
    resolution: TEXT_RESOLUTION,
  }).setOrigin(0.5);
  container.add(description);

  // Animal sprites — match the conflict narrative so visuals reflect
  // the text. a1 = instigator, a2 = disturbed party.
  const stateByRole: Record<string, [string, string]> = {
    noise_complaint:  ['sheltered', 'sleeping'],
    food_jealousy:    ['eating',    'sheltered'],
    space_sharing:    ['sleeping',  'sheltered'],
    sibling_squabble: ['sheltered', 'sheltered'],
  };
  const [s1State, s2State] = stateByRole[conflict.type] ?? ['sheltered', 'sheltered'];

  // Resolution cards — visual-first so pre-readers can pick by icon.
  // One row across the play area, anchored to the bottom, so the number
  // of actions costs width rather than height.
  const iconKeyFor: Record<string, string> = {
    give_treat:    'icon-resolve-treat',
    separate:      'icon-resolve-separate',
    pet_both:      'icon-resolve-comfort',
    play_together: 'icon-resolve-play',
  };
  const cardCount = RESOLUTION_ACTIONS.length;
  const cardGap = 10;
  // 116, not 104: the longest helper text ("Distract them both with yummy
  // treats") wraps to two lines in a card this narrow, and 104 clipped the
  // second one against the card's bottom edge.
  const cardH = 116;
  const cardW = Math.min(240, (play.w - 32 - cardGap * (cardCount - 1)) / cardCount);
  const cardsCy = bottom - cardH / 2;
  const cardsTop = cardsCy - cardH / 2;

  // Prompt, just above the cards
  container.add(
    scene.add.text(cx, cardsTop - 18, 'How do you want to help?', {
      fontSize: '18px', fontFamily: FONTS.body, color: COLOURS.textLight,
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5),
  );

  // The two animals go in whatever band is left between the description
  // and the prompt. On a landscape phone that band is too short to be
  // worth anything, so they are dropped rather than squeezed — the
  // description already names both of them.
  const bandTop = description.y + description.height / 2 + 12;
  const bandBottom = cardsTop - 40;
  const bandH = bandBottom - bandTop;
  if (bandH >= 90) {
    // How big the animals should actually be drawn: as much of the band as
    // there is, capped so they stay a pair rather than a mural.
    const drawH = Math.min(220, bandH - 16);
    const drawW = drawH * 1.25;
    // createAnimalSprite doubles the fit scale, so an image renders at
    // twice the box it is handed (ui/sprites.ts). Halving the box here is
    // what makes drawH the size on screen rather than half of it. When
    // that multiplier goes, this halving goes with it.
    const boxW = drawW / 2, boxH = drawH / 2;
    const spriteRowY = bandTop + bandH / 2;
    const spread = drawW * 0.6;
    if (animal1) {
      container.add(
        createAnimalSprite(scene, cx - spread, spriteRowY, animal1, {
          width: boxW, height: boxH, stateOverride: s1State,
        }),
      );
    }
    if (animal2) {
      container.add(
        createAnimalSprite(scene, cx + spread, spriteRowY, animal2, {
          width: boxW, height: boxH, stateOverride: s2State,
        }),
      );
    }
  }

  const rowW = cardW * cardCount + cardGap * (cardCount - 1);
  const firstCx = cx - rowW / 2 + cardW / 2;

  RESOLUTION_ACTIONS.forEach((action, i) => {
    const card = scene.add.container(firstCx + i * (cardW + cardGap), cardsCy);

    // Shadow + body
    const cardGfx = scene.add.graphics();
    cardGfx.fillStyle(0x000000, 0.18);
    cardGfx.fillRoundedRect(-cardW / 2 + 2, -cardH / 2 + 3, cardW, cardH, 16);
    cardGfx.fillStyle(0xffffff, 0.98);
    cardGfx.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 16);
    cardGfx.lineStyle(2, 0x5AAE4A, 0.55);
    cardGfx.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 16);
    card.add(cardGfx);

    // Big icon on top — the card is now taller than it is wide-ish, and
    // the icon is what a pre-reader picks by, so it leads.
    const iconKey = iconKeyFor[action.action];
    const iconCy = -cardH / 2 + 30;
    if (iconKey && scene.textures.exists(iconKey)) {
      const iconImg = scene.add.image(0, iconCy, iconKey)
        .setDisplaySize(44, 44).setOrigin(0.5);
      scene.textures.get(iconKey).setFilter(Phaser.Textures.FilterMode.LINEAR);
      card.add(iconImg);
    } else {
      // Coloured circle + emoji for visual recognition pre-art
      const circleBg = scene.add.graphics();
      const tintHex: Record<string, number> = {
        give_treat:    0xffd27a,
        separate:      0xffb4a2,
        pet_both:      0xcdb4db,
        play_together: 0xb5e48c,
      };
      circleBg.fillStyle(tintHex[action.action] ?? 0xffe4b3, 1);
      circleBg.fillCircle(0, iconCy, 22);
      card.add(circleBg);
      card.add(
        scene.add.text(0, iconCy, action.emoji, {
          fontSize: '26px', fontFamily: FONTS.body, resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5),
      );
    }

    // Label + helper text, stacked under the icon
    card.add(
      scene.add.text(0, iconCy + 34, action.label, {
        fontSize: '17px', fontFamily: FONTS.body, fontStyle: 'bold',
        color: COLOURS.text, resolution: TEXT_RESOLUTION,
        align: 'center', wordWrap: { width: cardW - 16 },
      }).setOrigin(0.5, 0.5),
    );
    card.add(
      scene.add.text(0, iconCy + 60, action.description, {
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.body,
        color: COLOURS.textLight, resolution: TEXT_RESOLUTION,
        align: 'center', wordWrap: { width: cardW - 16 },
      }).setOrigin(0.5, 0.5),
    );

    // Hit area
    const hit = scene.add.rectangle(0, 0, cardW, cardH, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => {
      scene.tweens.add({ targets: card, scale: 0.96, duration: 80, yoyo: true });
      callbacks.onResolve(action);
    });
    card.add(hit);

    container.add(card);
  });

}

export interface ConflictResultCallbacks {
  onBack: () => void;
}

export function renderConflictResult(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  effective: boolean,
  callbacks: ConflictResultCallbacks,
): void {
  const { width, height } = scene.scale;
  // Same play area as the popup it follows — centring on the screen put
  // this behind the rail on an iPad.
  const play = playAreaFor(width, height);
  const cx = play.x + play.w / 2;
  // Centre in the space below the HUD, not the whole screen.
  const cy = HUD_HEIGHT + (height - HUD_HEIGHT) / 2;

  container.add(
    scene.add.rectangle(play.x, 0, play.w, height,
      effective ? 0xe8f5e9 : 0xfff9c4).setOrigin(0, 0),
  );

  container.add(
    scene.add.text(cx, cy - 30,
      effective ? 'Great job!' : 'That helped a little...', {
        fontSize: '28px', fontFamily: FONTS.title,
        color: effective ? COLOURS.primary : '#f39c12',
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5),
  );

  container.add(
    scene.add.text(cx, cy + 20,
      effective
        ? 'The animals feel much happier now! (+10 happiness)'
        : 'The animals calmed down a bit. (+3 happiness)', {
        fontSize: '15px', fontFamily: FONTS.body, color: COLOURS.text,
        wordWrap: { width: play.w - 60 }, align: 'center',
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5),
  );

  container.add(
    createButton(scene, cx, cy + 80, '← Back', () => callbacks.onBack(), {
      width: 180,
    }),
  );
}
