import Phaser from 'phaser';
import { runDialogue, type DialoguePortrait } from '../ui/DialogueRunner';
import type { DialogueSequence, DialogueBeat } from '@arc/game-logic';
import { FONTS } from '../ui/constants';

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
    this.load.image('demo-warden', '/admin/scene-assets/cast/warden-marnie.png');
    this.load.image('demo-warden-happy', '/admin/scene-assets/cast/warden-marnie-happy.png');
  }

  create(): void {
    // A soft painted-garden stand-in so the dim backdrop reads like real play.
    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0xbfe3c8).setOrigin(0, 0);
    this.add
      .text(this.scale.width / 2, 40, 'DialogueRunner demo (?dialogueDemo=1)', {
        fontSize: '18px', fontFamily: FONTS.body, color: '#2d5a1e', fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const sequence: DialogueSequence = {
      id: 'demo',
      beats: [
        {
          speaker: 'Marnie', speakerId: 'warden', side: 'left',
          expression: 'neutral',
          text: 'This is Pumpkin. Pumpkin has been hoping for the perfect home.',
          highlights: ['Pumpkin'],
        },
        {
          speaker: 'Priya "Pri" Kaur', speakerId: 'priya', side: 'right',
          expression: 'neutral',
          text: "Hello little Pumpkin! We've come all this way to meet you.",
          highlights: ['Pumpkin'],
        },
        // A choice beat — showcases the choice-pill UI (Marcus, 2026-07-05).
        {
          speaker: 'Marnie', speakerId: 'warden', side: 'left',
          expression: 'happy',
          text: 'Ready to take Pumpkin home?',
          highlights: ['Pumpkin'],
          choices: [
            { id: 'yes', label: 'Yes — off you go, together!' },
            { id: 'cuddle', label: 'One last cuddle first' },
          ],
        },
        {
          speaker: 'Priya "Pri" Kaur', speakerId: 'priya', side: 'right',
          expression: 'greeting',
          text: "We'll love Pumpkin forever. Promise!",
          highlights: ['Pumpkin'],
        },
      ],
    };

    const resolvePortrait = (beat: DialogueBeat): DialoguePortrait => {
      if (beat.speakerId === 'warden') {
        const happy = beat.expression === 'happy' || beat.expression === 'greeting';
        return happy
          ? { key: 'demo-warden-happy', altKey: 'demo-warden', fallbackName: 'Marnie' }
          : { key: 'demo-warden', fallbackName: 'Marnie' };
      }
      const wantsGreeting = beat.expression === 'greeting' || beat.expression === 'happy';
      return wantsGreeting
        ? { key: 'demo-priya-greeting', altKey: 'demo-priya', fallbackName: 'Priya Kaur' }
        : { key: 'demo-priya', fallbackName: 'Priya Kaur' };
    };

    const replay = () => runDialogue(this, sequence, {
      onComplete: () => {
        this.add
          .text(this.scale.width / 2, this.scale.height / 2, 'Dialogue complete ✓  (tap to replay)', {
            fontSize: '20px', fontFamily: FONTS.body, color: '#2d5a1e', fontStyle: 'bold',
          })
          .setOrigin(0.5)
          .setInteractive()
          .once('pointerdown', () => { this.scene.restart(); });
      },
      resolvePortrait,
      onChoice: (choiceId) => { console.log('[dialogue demo] choice picked:', choiceId); },
    });
    replay();
  }
}
