/**
 * The only messages a gift may carry.
 *
 * The game offers a child fifteen ready-made lines and no box to type in,
 * and arcgame.app tells parents so: "Kind notes between friends. Gifts
 * carry ready-made messages." That was true of the screen and not of the
 * server — `send-gift` checked only that the code was a string, and
 * `SocialScene` prints the code itself when it is not one it knows. A
 * client that had been altered could therefore deliver any text at all to
 * another child, and it would appear in their inbox in quotation marks as
 * though they had been sent it.
 *
 * So the list lives here too, as codes only. The words stay in
 * `apps/game/src/ui/constants.ts` (GIFT_MESSAGES), which is what the
 * screens draw; a test holds the two together, because a code added to one
 * and not the other is a gift a child cannot send or cannot read.
 *
 * Adding a message: add it there, add its code here. Never accept a code
 * that is not on this list, whatever the client says.
 */
export const GIFT_MESSAGE_CODES = [
  'hi',
  'cool_pets',
  'nice_day',
  'well_done',
  'thanks',
  'miss_you',
  'congrats',
  'good_job',
  'for_you',
  'surprise',
  'share',
  'happy',
  'best_friend',
  'keep_going',
  'play_together',
] as const;

export function isGiftMessageCode(code: unknown): code is string {
  return typeof code === 'string' && (GIFT_MESSAGE_CODES as readonly string[]).includes(code);
}
