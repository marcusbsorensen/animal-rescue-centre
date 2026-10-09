import tseslint from 'typescript-eslint';

/**
 * Files that still add tweens straight to a Phaser scene.
 *
 * **This list is a backlog, not a permission.** Every animation in the
 * game is supposed to go through `apps/game/src/ui/tween.ts`, which is
 * where the player's reduced-motion setting is honoured; a tween added
 * to the scene bypasses it silently, and the one child the setting
 * exists for is the only person who finds out. The rule below is an
 * error everywhere except here, so a *new* animation cannot be written
 * without meeting it, and these are the twenty-odd files that predate
 * the setting.
 *
 * To clear one: replace each `scene.tweens.add` with `stateTween` or
 * `decorativeTween` — saying which of the two it is, which is the only
 * decision involved — and delete the file from this list. Do not add
 * to it.
 */
const TWEENS_NOT_YET_ROUTED = [
  'apps/game/src/audio/AudioManager.ts',
  'apps/game/src/game-views/ApprenticeDecorations.ts',
  'apps/game/src/game-views/CelebrationViews.ts',
  'apps/game/src/game-views/CollarPickerView.ts',
  'apps/game/src/game-views/ConflictView.ts',
  'apps/game/src/game-views/CorridorView.ts',
  'apps/game/src/game-views/GardenView.ts',
  'apps/game/src/game-views/HUDView.ts',
  'apps/game/src/game-views/NavBarView.ts',
  'apps/game/src/game-views/RoomView.ts',
  'apps/game/src/game-views/ToyPickerView.ts',
  'apps/game/src/scenes/BootScene.ts',
  'apps/game/src/scenes/DepotScene.ts',
  'apps/game/src/scenes/GroomingScene.ts',
  'apps/game/src/scenes/KitchenMinigameScene.ts',
  'apps/game/src/scenes/LoadingScene.ts',
  'apps/game/src/scenes/MainMenuScene.ts',
  'apps/game/src/scenes/PlayScene.ts',
  'apps/game/src/scenes/PtvDriveScene.ts',
  'apps/game/src/scenes/SocialScene.ts',
  'apps/game/src/scenes/SupplyRunScene.ts',
  'apps/game/src/scenes/VetScene.ts',
  'apps/game/src/scenes/WalkScene.ts',
  'apps/game/src/ui/ErrorOverlay.ts',
  'apps/game/src/ui/ShakeOffAnimation.ts',
];

// Matches `anything.tweens.add(…)` — `this.tweens.add` in a scene and
// `scene.tweens.add` in a view are the same shape.
const NO_RAW_TWEENS = {
  selector:
    "CallExpression > MemberExpression[property.name='add'][object.property.name='tweens']",
  message:
    'Add animations through ui/tween.ts — stateTween for an animation that says '
    + 'something happened, decorativeTween for one that is only pleasant. A tween '
    + 'added straight to the scene ignores the player\'s reduced-motion setting.',
};

export default tseslint.config(
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // The reduced-motion guard. An error, because the failure mode is
    // silence: nothing breaks when a tween escapes it.
    files: ['apps/game/src/**/*.ts'],
    ignores: ['apps/game/src/ui/tween.ts', ...TWEENS_NOT_YET_ROUTED],
    rules: {
      'no-restricted-syntax': ['error', NO_RAW_TWEENS],
    },
  },
  {
    ignores: ['**/dist/**', '**/node_modules/**'],
  }
);
