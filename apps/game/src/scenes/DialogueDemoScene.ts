import Phaser from 'phaser';
import { runDialogue, type DialoguePortrait } from '../ui/DialogueRunner';
import { portraitCropFor } from '../ui/dialogue-framing';
import { ADOPTER_HOUSEHOLD_DEFS, buildHandoverDialogue, WARDEN_SPEAKER } from '@arc/game-logic';
import type { DialogueSequence, DialogueBeat } from '@arc/game-logic';
import type { Animal } from '@arc/shared-types';
import { FONTS, TYPE } from '../ui/constants';

/**
 * DialogueDemoScene — dev-only harness for eyeballing the DialogueRunner
 * without playing through to an adoption. Registered ONLY when the game is
 * booted with `?dialogueDemo=1`. Not part of normal play.
 *
 * It runs the real hand-over script (the same `buildHandoverDialogue` the game
 * uses) over a real painted scene, with a choice beat swapped in for beat 3 so
 * the reply pills can be seen.
 *
 *   ?dialogueDemo=1                              Marnie and Priya, choice on Marnie (left)
 *   ?dialogueDemo=1&household=31-estrada-train   any household in the roster
 *   ?dialogueDemo=1&choiceSide=right             the choice beat is the guest's (right)
 */
const DEMO_ANIMAL: Animal = {
  id: 'demo-1', name: 'Pumpkin', species: 'cat', variant: 'ginger',
  state: 'bonding', arrivalStory: 'Found under a car.',
  hunger: 20, tiredness: 20, happiness: 80, health: 100,
  bondLevel: 60, roomId: 'room-cat',
};

export class DialogueDemoScene extends Phaser.Scene {
  constructor() {
    super({ key: 'DialogueDemoScene' });
  }

  private params(): URLSearchParams {
    return new URLSearchParams(window.location.search);
  }

  private household() {
    const id = this.params().get('household');
    return ADOPTER_HOUSEHOLD_DEFS.find((h) => h.householdId === id) ?? ADOPTER_HOUSEHOLD_DEFS[0];
  }

  preload(): void {
    const h = this.household();
    this.load.image('demo-bg', '/assets/bg/bg-garden.png');
    this.load.image('demo-warden', '/admin/scene-assets/cast/warden-marnie.png');
    this.load.image('demo-warden-happy', '/admin/scene-assets/cast/warden-marnie-happy.png');
    this.load.image('demo-guest', h.avatarSrc);
    this.load.image('demo-guest-greeting', greetingUrlOf(h.avatarSrc));
  }

  create(): void {
    // A real painted scene behind the conversation, so the mist is judged
    // against what it will actually sit on.
    const bg = this.add.image(0, 0, 'demo-bg').setOrigin(0.5, 0.5);
    const fit = () => {
      const W = this.scale.width;
      const H = this.scale.height;
      bg.setPosition(W / 2, H / 2);
      bg.setScale(Math.max(W / bg.width, H / bg.height));
    };
    fit();
    this.scale.on('resize', fit);

    const h = this.household();
    const sequence = this.buildSequence(h);
    const greetingUrl = greetingUrlOf(h.avatarSrc);

    const resolvePortrait = (beat: DialogueBeat): DialoguePortrait => {
      const warm = beat.expression === 'happy' || beat.expression === 'greeting';
      if (beat.speakerId === WARDEN_SPEAKER.id) {
        const happyUrl = '/admin/scene-assets/cast/warden-marnie-happy.png';
        const url = '/admin/scene-assets/cast/warden-marnie.png';
        return warm
          ? { key: 'demo-warden-happy', altKey: 'demo-warden', fallbackName: 'Marnie', crop: portraitCropFor(happyUrl) }
          : { key: 'demo-warden', fallbackName: 'Marnie', crop: portraitCropFor(url) };
      }
      return warm
        ? { key: 'demo-guest-greeting', altKey: 'demo-guest', fallbackName: h.name, crop: portraitCropFor(greetingUrl) }
        : { key: 'demo-guest', fallbackName: h.name, crop: portraitCropFor(h.avatarSrc) };
    };

    runDialogue(this, sequence, {
      onComplete: () => {
        this.add
          .text(this.scale.width / 2, this.scale.height / 2, 'Dialogue complete  (tap to replay)', {
            fontSize: TYPE.lead, fontFamily: FONTS.body, color: '#173a4d', fontStyle: 'bold',
            backgroundColor: '#ffffffcc', padding: { x: 14, y: 8 },
          })
          .setOrigin(0.5)
          .setName('demo-complete')
          .setInteractive()
          .once('pointerdown', () => { this.scene.restart(); });
      },
      resolvePortrait,
      onChoice: (choiceId) => { console.log('[dialogue demo] choice picked:', choiceId); },
    });
  }

  /** The real hand-over, with beat 3 turned into a choice. */
  private buildSequence(household: ReturnType<DialogueDemoScene['household']>): DialogueSequence {
    const seq = buildHandoverDialogue(DEMO_ANIMAL, household);
    const guestChoice = this.params().get('choiceSide') === 'right';
    const beats = seq.beats.map((b, i): DialogueBeat => {
      if (i !== 2) return b;
      const base: DialogueBeat = guestChoice ? { ...seq.beats[1], expression: 'neutral' } : b;
      return {
        ...base,
        text: guestChoice ? 'Shall we take Pumpkin home?' : 'Ready to take Pumpkin home?',
        choices: [
          { id: 'yes', label: 'Yes — off you go, together!' },
          { id: 'cuddle', label: 'One last cuddle first' },
        ],
      };
    });
    return { ...seq, beats };
  }
}

function greetingUrlOf(avatarSrc: string): string {
  return avatarSrc.replace(/\/([^/]+)\.png$/, '/variants/$1-greeting.png');
}
