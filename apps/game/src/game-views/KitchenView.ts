import Phaser from 'phaser';
import type { Animal } from '@arc/shared-types';
import {
  SPECIES_COLOURS,
  applyFeeding,
  calculateBondIncrease,
  isSiblingPresent,
  hasAllyPresent,
} from '@arc/game-logic';
import { createButton, createTextButton, createPillTitle, createPanel } from '../ui/UIButton';
import { COLOURS, FONTS, TEXT_RESOLUTION } from '../ui/constants';
import type { GameStateStore } from '../game-state';

/**
 * KitchenView — renders the kitchen/feeding area.
 *
 * Extracted from GameScene as phase 3 of the refactor plan. Pure
 * render function: takes the scene, store, container, and a callbacks
 * bag for scene-level coordination.
 *
 * Renders:
 * - Kitchen background + pill title.
 * - Semi-transparent card with hungry-animal count, species icons,
 *   "Start Sorting!" button (launches the KitchenMinigameScene), and
 *   a quick-feed accessibility shortcut.
 * - Garden shortcut button beneath the card.
 * - "Everyone is well-fed!" calm-state text when no hungry animals.
 */

export interface KitchenCallbacks {
  /** Launch the KitchenMinigameScene with these hungry animals and
   *  a completion callback that writes the updated list back. */
  launchMinigame: (hungry: Animal[]) => void;

  /** After quick-feeding mutated the animals, re-check bond and save. */
  onQuickFedAnimal: (animal: Animal) => void;

  /** Navigate to the Garden view. */
  goToGarden: () => void;

  /** Trigger a full re-render after state changes. */
  rerender: () => void;

  /** Persist current state. */
  save: () => void;

  /** Draw the nav bar on top of this view. */
  renderNavBar: (opts: { showBack: boolean }) => void;
}

export function renderKitchen(
  scene: Phaser.Scene,
  store: GameStateStore,
  container: Phaser.GameObjects.Container,
  callbacks: KitchenCallbacks,
): void {
  const { width, height } = scene.scale;

  // ── Background ───────────────────────────────────────────
  if (scene.textures.exists('bg-kitchen')) {
    const bg = scene.add.image(width / 2, height / 2, 'bg-kitchen');
    bg.setDisplaySize(width, height - 40);
    container.add(bg);
  } else {
    container.add(
      scene.add.rectangle(
        width / 2, height / 2, width, height - 40,
        Phaser.Display.Color.HexStringToColor('#fff8e7').color,
      ),
    );
  }

  container.add(
    createPillTitle(scene, width / 2, 55, 'Kitchen', {
      bgColour: 0xD4A017, fontSize: '20px', icon: 'icon-kitchen',
    }),
  );

  const hungry = store.animals.filter((a) => a.hunger > 60 && a.state !== 'arriving');
  const petCount = store.animals.filter((a) => a.state === 'pet').length;

  // ── Readable card behind text/buttons ────────────────────
  // Sits over the painted counter so body text stays readable against
  // the busy kitchen background.
  const panelW = Math.min(420, width - 40);
  const panelH = hungry.length > 0 ? 260 : 140;
  const panelCy = height / 2 + 10;
  container.add(
    createPanel(scene, width / 2, panelCy, panelW, panelH, {
      fillColour: 0xffffff,
      fillAlpha: 0.92,
      borderColour: 0xd4a017,
      borderWidth: 2,
      radius: 18,
    }),
  );

  if (hungry.length === 0) {
    container.add(
      scene.add.text(width / 2, panelCy - 10, 'Everyone is well-fed!', {
        fontSize: '20px', fontFamily: FONTS.title, fontStyle: 'bold',
        color: COLOURS.primary, resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5),
    );
    container.add(
      scene.add.text(width / 2, panelCy + 18, 'Check back when someone gets peckish.', {
        fontSize: '13px', fontFamily: FONTS.body, color: COLOURS.textLight,
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5),
    );
  } else {
    // Title
    container.add(
      scene.add.text(width / 2, panelCy - 90,
        `${hungry.length} animal${hungry.length > 1 ? 's are' : ' is'} hungry!`, {
          fontSize: '22px', fontFamily: FONTS.title, fontStyle: 'bold',
          color: COLOURS.text, resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5),
    );

    // Subtitle
    container.add(
      scene.add.text(width / 2, panelCy - 62,
        "Sort the right food into each animal's bowl!", {
          fontSize: '14px', fontFamily: FONTS.body, color: COLOURS.textLight,
          resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5),
    );

    // Species icons — small coloured dots per hungry animal
    const iconSize = 32;
    const iconY = panelCy - 20;
    const iconSpacing = 40;
    const shownHungry = hungry.slice(0, Math.min(hungry.length, 8));
    const iconsStartX = width / 2 - ((shownHungry.length - 1) * iconSpacing) / 2;
    shownHungry.forEach((a, i) => {
      const ix = iconsStartX + i * iconSpacing;
      const bg = scene.add.graphics();
      bg.fillStyle(SPECIES_COLOURS[a.species], 0.25);
      bg.fillCircle(ix, iconY, iconSize / 2 + 2);
      container.add(bg);
      const speciesIconKey = `icon-${a.species}`;
      if (scene.textures.exists(speciesIconKey)) {
        container.add(
          scene.add.image(ix, iconY, speciesIconKey)
            .setDisplaySize(iconSize, iconSize)
            .setOrigin(0.5),
        );
      } else {
        const c = scene.add.graphics();
        c.fillStyle(SPECIES_COLOURS[a.species], 1);
        c.fillCircle(ix, iconY, iconSize / 2);
        container.add(c);
      }
    });

    // Launch minigame button
    container.add(
      createButton(scene, width / 2, panelCy + 30, 'Start Sorting!', () => {
        callbacks.launchMinigame(hungry);
      }, { width: 240 }),
    );

    // Quick-feed option for accessibility
    container.add(
      createTextButton(scene, width / 2, panelCy + 78,
        'Quick feed all (skip minigame)', () => {
          for (const animal of hungry) {
            const idx = store.animals.findIndex((a) => a.id === animal.id);
            if (idx >= 0) {
              store.animals[idx] = applyFeeding(store.animals[idx]);
              const sibPresent =
                isSiblingPresent(store.animals[idx], store.animals)
                || hasAllyPresent(store.relationships, store.animals[idx], store.animals, 'friend');
              const bondGain = calculateBondIncrease(store.animals[idx], 'feed', sibPresent);
              store.animals[idx].bondLevel =
                Math.min(100, store.animals[idx].bondLevel + bondGain);
              callbacks.onQuickFedAnimal(store.animals[idx]);
            }
          }
          callbacks.rerender();
          callbacks.save();
        }),
    );
  }

  // Garden shortcut — always below kitchen content
  const gardenBtnY = panelCy + panelH / 2 + 30;
  const gardenLabel = petCount === 0
    ? 'Garden (empty)'
    : `Garden (${petCount} ${petCount === 1 ? 'pet' : 'pets'})`;
  container.add(
    createButton(scene, width / 2, gardenBtnY, gardenLabel, () => callbacks.goToGarden(), {
      width: 240, fontSize: '15px', bgColour: '#2ecc71', icon: 'icon-walk',
    }),
  );

  callbacks.renderNavBar({ showBack: true });
}
