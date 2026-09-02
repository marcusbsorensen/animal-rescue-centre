import Phaser from 'phaser';
import type { Animal } from '@arc/shared-types';
import {
  SPECIES_COLOURS,
  applyFeeding,
  calculateBondIncrease,
  isSiblingPresent,
  hasAllyPresent,
} from '@arc/game-logic';
import {
  createButton, createTextButton, createChromeTitle, createChromePlate,
} from '../ui/UIButton';
import {
  FONTS, TEXT_RESOLUTION, MIN_FONT, MIN_TAP, SAFE_MARGIN, TITLE_CY, CHROME,
} from '../ui/constants';
import { playAreaFor, viewportIsShort, sideNavEnabled } from '../ui/layout';
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

  /**
   * Open the Depot / Supply Run popup.
   *
   * Optional because only the side-nav layout routes through here — under
   * the bottom bar the Supplies FAB still owns it.
   */
  openSupplies?: () => void;
}

export function renderKitchen(
  scene: Phaser.Scene,
  store: GameStateStore,
  container: Phaser.GameObjects.Container,
  callbacks: KitchenCallbacks,
): void {
  const { width, height } = scene.scale;
  const play = playAreaFor(width, height);

  // ── Background ───────────────────────────────────────────
  // `play.w`, not `width`. Audit §6: the corridor, room and garden all
  // draw to the play box and the kitchen did not, so its art ran under the
  // arrivals rail and behind the Dynamic Island — visible in the capture
  // as painting continuing past the rail's left edge. The rail is opaque
  // and mounted at depth 50, so that strip of the painting was never seen.
  if (scene.textures.exists('bg-kitchen')) {
    const bg = scene.add.image(play.x + play.w / 2, height / 2, 'bg-kitchen');
    bg.setDisplaySize(play.w, height - 40);
    container.add(bg);
  } else {
    container.add(
      scene.add.rectangle(
        play.x + play.w / 2, height / 2, play.w, height - 40,
        Phaser.Display.Color.HexStringToColor('#fff8e7').color,
      ),
    );
  }

  // Title — chrome, and on the play origin like its three siblings. The
  // gold pill here sat next to a white glass panel and a flat green
  // button, which is the frame the audit uses to show three visual
  // languages at once.
  container.add(
    createChromeTitle(scene, play.x + play.w / 2, TITLE_CY, 'Kitchen', {
      icon: 'icon-kitchen',
    }),
  );

  const hungry = store.animals.filter((a) => a.hunger > 60 && a.state !== 'arriving');
  const petCount = store.animals.filter((a) => a.state === 'pet').length;

  // ── Readable card behind text/buttons ────────────────────
  // Sits over the painted counter so body text stays readable against
  // the busy kitchen background.
  const short = viewportIsShort(height);

  // Two layouts, because the tall one does not fold.
  //
  // The rows are placed at fixed offsets from the panel centre, spanning
  // -90..+78, and the Garden shortcut hangs below the panel: 216px of
  // content stacked in the 137px the play band gives a landscape phone,
  // centred on a screen midpoint that is itself inside the nav bar. That
  // does not compress — five rows including three tap targets cannot share
  // 137px and keep MIN_TAP_GAP between them; squeezing them put "Quick
  // feed" and "Garden" 8px apart, which for a child aiming at one and
  // hitting the other is the same as being too small.
  //
  // So the short layout turns the stack on its side. The screen is 812
  // wide and the panel was using 420 of it: the message goes in the left
  // half, the three controls in the right, and each keeps its full height.
  // Only the hungry state has to fold: "Everyone is well-fed!" is two
  // lines and one button, which fits the band stacked.
  const twoColumn = short && hungry.length > 0;
  const panelW = twoColumn
    ? Math.min(724, play.w - 32)
    : Math.min(420, width - 40);
  const panelH = twoColumn
    ? play.h - 8
    : (hungry.length > 0 ? 260 : (short ? 78 : 140));
  const panelCx = short ? play.x + play.w / 2 : width / 2;
  const panelCy = short
    ? play.y + (twoColumn ? play.h / 2 : (play.h - 50) / 2)
    : height / 2 + 10;
  // Column centres. Both are `panelCx` outside the two-column layout, so
  // every other viewport keeps the single centred column it has always had.
  const msgCx = twoColumn ? panelCx - panelW / 4 : panelCx;
  const btnCx = twoColumn ? panelCx + panelW / 4 : panelCx;
  const row = (offset: number) => panelCy + offset * (short ? 0.66 : 1);
  // Where the three controls sit: stacked below the message normally; when
  // folded, two in the right column and Garden under the message in the
  // left. Not an aesthetic choice — three 48px targets plus the 12px
  // MIN_TAP_GAP between them need 168px, and the band is 137. Two fit with
  // room to spare; the third has to go in the other column.
  const btnY = twoColumn
    ? { sort: panelCy - 30, quick: panelCy + 30, garden: panelCy + 44 }
    : { sort: row(30), quick: row(78), garden: panelCy + panelH / 2 + 30 };
  // Garden rides in the message column when folded, so it is `msgCx`, not
  // `btnCx`, that it centres on.
  const gardenCx = twoColumn ? msgCx : panelCx;
  // The white glass panel with the gold border was the second of the three
  // languages the audit found in this one frame — flat white at 92% alpha
  // with a drop shadow, which is what every other mobile game looks like.
  // Same job, one surface.
  container.add(createChromePlate(scene, panelCx, panelCy, panelW, panelH));

  if (hungry.length === 0) {
    container.add(
      scene.add.text(panelCx, row(-10), 'Everyone is well-fed!', {
        // `CHROME.inkAccent`, not `COLOURS.primary`. The brand green
        // measures 4.11:1 on the cream and misses AA — see the note on
        // CHROME. This heading is where that would first have shown.
        fontSize: '20px', fontFamily: FONTS.ui, fontStyle: 'bold',
        color: CHROME.inkAccent, resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5),
    );
    container.add(
      scene.add.text(panelCx, row(18), 'Check back when someone gets peckish.', {
        fontSize: `${MIN_FONT.small}px`, fontFamily: FONTS.ui, color: CHROME.inkMuted,
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5),
    );
  } else {
    // Title
    container.add(
      scene.add.text(msgCx, twoColumn ? panelCy - 52 : row(-90),
        `${hungry.length} animal${hungry.length > 1 ? 's are' : ' is'} hungry!`, {
          fontSize: '22px', fontFamily: FONTS.ui, fontStyle: 'bold',
          color: CHROME.ink, resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5),
    );

    // Subtitle
    container.add(
      scene.add.text(msgCx, twoColumn ? panelCy - 28 : row(-62),
        "Sort the right food into each animal's bowl!", {
          fontSize: '14px', fontFamily: FONTS.ui, color: CHROME.inkMuted,
          resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5),
    );

    // Species icons — small coloured dots per hungry animal
    const iconSize = 32;
    const iconY = twoColumn ? panelCy - 2 : row(-20);
    const iconSpacing = 40;
    const shownHungry = hungry.slice(0, Math.min(hungry.length, 8));
    const iconsStartX = msgCx - ((shownHungry.length - 1) * iconSpacing) / 2;
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
      createButton(scene, btnCx, btnY.sort, 'Start Sorting!', () => {
        callbacks.launchMinigame(hungry);
      }, { width: 240 }),
    );

    // Quick-feed option for accessibility
    container.add(
      createTextButton(scene, btnCx, btnY.quick,
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

  // Garden shortcut — below the kitchen content, but never past the bottom
  // of the play band. The nav bar is opaque and drawn after this container,
  // so a button under it is not merely hard to see: the bar takes the tap.
  // On a landscape phone the panel and this button together want more than
  // the 137px band has, so the clamp can crowd them — visibly, which is the
  // point. See the handover: the kitchen needs its own short-viewport
  // layout, and this only keeps the control reachable until it gets one.
  const gardenBtnY = btnY.garden;
  const gardenLabel = petCount === 0
    ? 'Garden (empty)'
    : `Garden (${petCount} ${petCount === 1 ? 'pet' : 'pets'})`;
  container.add(
    createButton(scene, gardenCx, gardenBtnY, gardenLabel, () => callbacks.goToGarden(), {
      width: 240, fontSize: '15px', bgColour: '#2ecc71', icon: 'icon-walk',
    }),
  );

  // Supplies lives here under the side-nav layout, because it lost its
  // slot on the rail: four controls fit a thumb-reachable stack and five
  // do not, and restocking the depot is the least of the five a child
  // does. Care is where the centre gets looked after, so it is the least
  // surprising place to find it.
  //
  // Only drawn under side-nav — the bottom bar still carries its FAB, and
  // two routes to one popup is how a control ends up half-maintained.
  if (sideNavEnabled() && callbacks.openSupplies) {
    const suppliesY = Math.min(
      gardenBtnY + 54,
      play.y + play.h - MIN_TAP / 2 - SAFE_MARGIN,
    );
    container.add(
      createButton(scene, gardenCx, suppliesY, 'Supplies', () => callbacks.openSupplies!(), {
        width: 240, fontSize: '15px', bgColour: '#d46020', icon: 'icon-supply-run',
      }),
    );
  }

  callbacks.renderNavBar({ showBack: true });
}
