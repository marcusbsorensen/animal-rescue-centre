import Phaser from 'phaser';
import { runDialogue, type DialoguePortrait } from '../ui/DialogueRunner';
import type { DialogueSequence, DialogueBeat } from '@arc/game-logic';

/**
 * DialogueDemoScene — dev-only harness for eyeballing the DialogueRunner
 * without playing through to an adoption. Registered ONLY when the game is
 * booted with `?dialogueDemo=1`. Not part of normal play.
 *
 * Exercises: a right-side real portrait (adopter greeting), a left-side
 * painted-initials fallback (a speaker with no portrait), inline name
 * highlighting, the name pill, chevron and SKIP.
 */
export class DialogueDemoScene extends Phaser.Scene {
  constructor() {
    super({ key: 'DialogueDemoScene' });
  }

  preload(): void {
    this.load.image('demo-priya', '/admin/scene-assets/cast/01-priya.png');
    this.load.image('demo-priya-greeting', '/admin/scene-assets/cast/variants/01-priya-greeting.png');
  }

  create(): void {
    // A soft painted-garden stand-in so the dim backdrop reads like real play.
    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0xbfe3c8).setOrigin(0, 0);
    this.add
      .text(this.scale.width / 2, 40, 'DialogueRunner demo (?dialogueDemo=1)', {
        fontSize: '18px', color: '#2d5a1e', fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const sequence: DialogueSequence = {
      id: 'demo',
      beats: [
        {
          speaker: 'Priya "Pri" Kaur', speakerId: 'priya', side: 'right',
          expression: 'neutral',
          text: "Hello little Pumpkin! I've come all this way to meet you.",
          highlights: ['Pumpkin'],
        },
        {
          speaker: 'Warden', speakerId: 'warden', side: 'left',
          expression: 'happy',
          text: "She's been waiting for a home just like yours.",
        },
        {
          speaker: 'Priya "Pri" Kaur', speakerId: 'priya', side: 'right',
          expression: 'greeting',
          text: "Come on then, Pumpkin — let's go home. I'll love you forever.",
          highlights: ['Pumpkin'],
        },
      ],
    };

    const resolvePortrait = (beat: DialogueBeat): DialoguePortrait => {
      if (beat.speakerId === 'priya') {
        const wantsGreeting = beat.expression === 'greeting' || beat.expression === 'happy';
        return wantsGreeting
          ? { key: 'demo-priya-greeting', altKey: 'demo-priya', fallbackName: 'Priya Kaur' }
          : { key: 'demo-priya', fallbackName: 'Priya Kaur' };
      }
      // Warden has no portrait → painted-initials chip.
      return { key: 'demo-warden-missing', fallbackName: 'Warden' };
    };

    const replay = () => runDialogue(this, sequence, {
      onComplete: () => {
        this.add
          .text(this.scale.width / 2, this.scale.height / 2, 'Dialogue complete ✓  (tap to replay)', {
            fontSize: '20px', color: '#2d5a1e', fontStyle: 'bold',
          })
          .setOrigin(0.5)
          .setInteractive()
          .once('pointerdown', () => { this.scene.restart(); });
      },
      resolvePortrait,
    });
    replay();
  }
}
