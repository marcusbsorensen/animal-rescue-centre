import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GIFT_MESSAGE_CODES, isGiftMessageCode } from '../../../../supabase/functions/_shared/gift-messages.ts';

/**
 * arcgame.app tells parents that gifts carry ready-made messages. That was
 * true of the screen, which offers fifteen lines and no box to type in, and
 * untrue of the server, which took any string. A client that had been
 * altered could put arbitrary text in a child's inbox, in quotation marks,
 * as though a friend had written it.
 *
 * The codes live in the function's _shared and the words in the game's
 * constants, because one is Deno and the other is the browser bundle. These
 * hold the two lists together: a code in one and not the other is a gift a
 * child can either not send or not read.
 */

const ROOT = path.resolve(__dirname, '../../../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

/** The codes the screens draw, read out of the game's own list. */
function codesTheGameOffers(): string[] {
  const source = read('apps/game/src/ui/constants.ts');
  const block = source.match(/export const GIFT_MESSAGES = \[([\s\S]*?)\] as const;/);
  return (block?.[1] ?? '').match(/code: '([a-z_]+)'/g)?.map((s) => s.slice(7, -1)) ?? [];
}

describe('the messages a gift may carry', () => {
  it('is the same list on the server as on the screen', () => {
    const offered = codesTheGameOffers();
    expect(offered.length).toBeGreaterThan(0);
    expect([...GIFT_MESSAGE_CODES].sort()).toEqual([...offered].sort());
  });

  it('takes every code the screen can send', () => {
    expect(codesTheGameOffers().filter((c) => !isGiftMessageCode(c))).toEqual([]);
  });

  it('refuses anything that is not on it', () => {
    // The shapes an altered client would actually send.
    for (const sent of [
      'Meet me at the park after school',
      '',
      'HI',
      'hi ',
      'hi; drop table gifts',
      '<script>alert(1)</script>',
      null,
      undefined,
      42,
      { code: 'hi' },
      ['hi'],
    ]) {
      expect(isGiftMessageCode(sent), String(sent)).toBe(false);
    }
  });

  it('is checked by send-gift, not merely declared here', () => {
    const fn = read('supabase/functions/send-gift/index.ts');
    expect(fn).toContain('isGiftMessageCode(messagePresetCode)');
    // The old check let any string through; it must not come back.
    expect(fn).not.toMatch(/typeof messagePresetCode !== 'string'/);
  });

  it('is never printed raw to a child, whatever is already in the database', () => {
    // A gift sent before the server checked could hold anything, so the
    // screen falls back to its own words rather than the stored code.
    const scene = read('apps/game/src/scenes/SocialScene.ts');
    expect(scene).not.toMatch(/\$\{message\?\.text \?\? gift\.messagePresetCode\}/);
  });
});
