/**
 * Shared by the two name tests (`display-names.test.ts` and
 * `sign-in-names.test.ts`): a child carries one name that friends see and
 * one secret name to sign in with, and neither may hide a rude word.
 */
/**
 * Letters that must not appear anywhere in a name, joined or not:
 * swearing, sexual words, slurs, words for violence or fear, and
 * mocking words. Matched against the lower-case name with nothing
 * between the words, so "Snug" + "Gerbil" is checked as "snuggerbil".
 */
export const DENIED_INSIDE = [
  // swearing and toilet words
  'fuck', 'shit', 'cunt', 'twat', 'wank', 'piss', 'arse', 'ass', 'crap', 'damn',
  'bitch', 'bastard', 'prick', 'bollock', 'bugger', 'turd', 'poo', 'pee', 'wee',
  'fart', 'bum', 'butt', 'snot', 'puke', 'vomit',
  // sexual and body words
  'sex', 'porn', 'nude', 'naked', 'boob', 'tit', 'nipple', 'cock', 'dick', 'penis',
  'vagina', 'puss', 'cum', 'jizz', 'anal', 'anus', 'slut', 'whore', 'hoe', 'nob',
  'knob', 'minge', 'slag', 'horny', 'sexy', 'kiss',
  // slurs
  'nazi', 'retard', 'spaz', 'spastic', 'mong', 'gay', 'homo', 'lesbo', 'fag', 'dyke',
  'queer', 'tranny', 'coon', 'nig', 'chink', 'paki', 'jap', 'gook', 'spic', 'wog',
  'kike', 'yid', 'gyp', 'pikey', 'puff', 'kkk',
  // violence, death and fear
  'kill', 'dead', 'die', 'death', 'blood', 'murder', 'gun', 'knife', 'stab', 'bomb',
  'shoot', 'ghost', 'zombie', 'devil', 'demon', 'evil', 'scary', 'monster', 'skull',
  'grave', 'hate', 'war', 'hell', 'rape', 'hurt', 'pain', 'fear', 'scream',
  // mocking
  'fat', 'ugly', 'stupid', 'dumb', 'thick', 'fool', 'idiot', 'loser', 'smell', 'stink',
  'lazy', 'weird', 'freak', 'nerd', 'geek', 'dork', 'baby', 'cry', 'wimp', 'mental',
  'psycho', 'crazy', 'mad', 'sad', 'fail', 'silly', 'slow', 'fake', 'liar', 'pest',
  // drink, drugs and smoking
  'weed', 'drug', 'crack', 'coke', 'dope', 'smoke', 'beer', 'wine', 'vodka', 'drunk',
];
