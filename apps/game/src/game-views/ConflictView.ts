import Phaser from 'phaser';
import type { Animal } from '@arc/shared-types';
import { RESOLUTION_ACTIONS, type Conflict, type ResolutionDef } from '@arc/game-logic';
import { createButton } from '../ui/UIButton';
import { createAnimalSprite } from '../ui/sprites';
import { COLOURS, FONTS, TEXT_RESOLUTION } from '../ui/constants';
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
  const { width } = scene.scale;

  // Background fill
  container.add(
    scene.add.rectangle(width / 2, scene.scale.height / 2, width, scene.scale.height, 0xfff3e0),
  );

  // Title
  container.add(
    scene.add.text(width / 2, 80, `${conflict.type.replace('_', ' ').toUpperCase()}!`, {
      fontSize: '26px', fontFamily: FONTS.title, color: '#e74c3c',
    }).setOrigin(0.5),
  );

  // Description — the pre-built narrative from generateConflict
  const animal1 = store.animals.find((a) => a.id === conflict.animal1Id);
  const animal2 = store.animals.find((a) => a.id === conflict.animal2Id);

  container.add(
    scene.add.text(width / 2, 130, conflict.description, {
      fontSize: '17px', fontFamily: FONTS.body, color: COLOURS.text,
      wordWrap: { width: width - 80 }, align: 'center',
    }).setOrigin(0.5),
  );

  // Animal sprites — match the conflict narrative so visuals reflect
  // the text. a1 = instigator, a2 = disturbed party.
  const stateByRole: Record<string, [string, string]> = {
    noise_complaint:  ['sheltered', 'sleeping'],
    food_jealousy:    ['eating',    'sheltered'],
    space_sharing:    ['sleeping',  'sheltered'],
    sibling_squabble: ['sheltered', 'sheltered'],
  };
  const [s1State, s2State] = stateByRole[conflict.type] ?? ['sheltered', 'sheltered'];

  const spriteW = 110, spriteH = 88;
  const spriteRowY = 225;
  if (animal1) {
    container.add(
      createAnimalSprite(scene, width / 2 - 80, spriteRowY, animal1, {
        width: spriteW, height: spriteH, stateOverride: s1State,
      }),
    );
  }
  if (animal2) {
    container.add(
      createAnimalSprite(scene, width / 2 + 80, spriteRowY, animal2, {
        width: spriteW, height: spriteH, stateOverride: s2State,
      }),
    );
  }

  // Prompt
  container.add(
    scene.add.text(width / 2, 305, 'How do you want to help?', {
      fontSize: '18px', fontFamily: FONTS.body, color: COLOURS.textLight,
    }).setOrigin(0.5),
  );

  // Resolution cards — visual-first so pre-readers can pick by icon
  const iconKeyFor: Record<string, string> = {
    give_treat:    'icon-resolve-treat',
    separate:      'icon-resolve-separate',
    pet_both:      'icon-resolve-comfort',
    play_together: 'icon-resolve-play',
  };
  const cardW = Math.min(320, width - 40);
  const cardH = 66;
  const startY = 350;

  RESOLUTION_ACTIONS.forEach((action, i) => {
    const cy = startY + i * (cardH + 10);
    const card = scene.add.container(width / 2, cy);

    // Shadow + body
    const cardGfx = scene.add.graphics();
    cardGfx.fillStyle(0x000000, 0.18);
    cardGfx.fillRoundedRect(-cardW / 2 + 2, -cardH / 2 + 3, cardW, cardH, 16);
    cardGfx.fillStyle(0xffffff, 0.98);
    cardGfx.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 16);
    cardGfx.lineStyle(2, 0x5AAE4A, 0.55);
    cardGfx.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 16);
    card.add(cardGfx);

    // Big icon on the left
    const iconKey = iconKeyFor[action.action];
    const iconX = -cardW / 2 + 34;
    if (iconKey && scene.textures.exists(iconKey)) {
      const iconImg = scene.add.image(iconX, 0, iconKey)
        .setDisplaySize(48, 48).setOrigin(0.5);
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
      circleBg.fillCircle(iconX, 0, 24);
      card.add(circleBg);
      card.add(
        scene.add.text(iconX, 0, action.emoji, {
          fontSize: '28px', fontFamily: FONTS.body, resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5),
      );
    }

    // Label + helper text
    const textX = iconX + 36;
    card.add(
      scene.add.text(textX, -10, action.label, {
        fontSize: '17px', fontFamily: FONTS.body, fontStyle: 'bold',
        color: COLOURS.text, resolution: TEXT_RESOLUTION,
      }).setOrigin(0, 0.5),
    );
    card.add(
      scene.add.text(textX, 12, action.description, {
        fontSize: '11px', fontFamily: FONTS.body,
        color: COLOURS.textLight, resolution: TEXT_RESOLUTION,
        wordWrap: { width: cardW - (textX + cardW / 2 + 10) },
      }).setOrigin(0, 0.5),
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

  container.add(
    scene.add.rectangle(width / 2, height / 2, width, height,
      effective ? 0xe8f5e9 : 0xfff9c4),
  );

  container.add(
    scene.add.text(width / 2, height / 2 - 30,
      effective ? 'Great job!' : 'That helped a little...', {
        fontSize: '28px', fontFamily: FONTS.title,
        color: effective ? COLOURS.primary : '#f39c12',
      }).setOrigin(0.5),
  );

  container.add(
    scene.add.text(width / 2, height / 2 + 20,
      effective
        ? 'The animals feel much happier now! (+10 happiness)'
        : 'The animals calmed down a bit. (+3 happiness)', {
        fontSize: '15px', fontFamily: FONTS.body, color: COLOURS.text,
        wordWrap: { width: width - 60 }, align: 'center',
      }).setOrigin(0.5),
  );

  container.add(
    createButton(scene, width / 2, height / 2 + 80, '← Back', () => callbacks.onBack(), {
      width: 180,
    }),
  );
}
