import { describe, it, expect } from 'vitest';
import {
  DISPLAY_NAME_ADJECTIVES,
  DISPLAY_NAME_ANIMALS,
  DISPLAY_NAME_SKIPPED_NUMBERS,
  DISPLAY_NAME_MAX_LENGTH,
  allowedDisplayNameNumbers,
  randomDisplayName,
  anotherDisplayName,
  isDisplayNameBase,
  isDisplayName,
  splitDisplayName,
} from '../display-names';

/**
 * The name other players see is made from two word lists, never typed:
 * an adjective and an animal, for example MossyOtter, with a number on
 * the end when that one is taken.
 *
 * Every word and every pair has to be fit for a child to carry and for
 * another child to read. These tests check that mechanically, with a
 * deny-list run over every pair joined together, so that a word added
 * later cannot slip a rude word across the join. The deny-list is a
 * floor, not the review: the lists were also read pair by pair by hand.
 */

const ADJ = [...DISPLAY_NAME_ADJECTIVES];
const ANIMALS = [...DISPLAY_NAME_ANIMALS];

/**
 * Letters that must not appear anywhere in a name, joined or not:
 * swearing, sexual words, slurs, words for violence or fear, and
 * mocking words. Matched against the lower-case name with nothing
 * between the words, so "Snug" + "Gerbil" is checked as "snuggerbil".
 */
const DENIED_INSIDE = [
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

/**
 * Whole words that must not be on either list, because of what they say
 * about a child who carries them, or what they become beside an animal
 * (Silly Goose, Black Sheep, Snow Bunny, Silver Fox). Kept here so that a
 * word added later is refused with the reason it was left out.
 */
const REFUSED_ADJECTIVES = [
  // about a body or its size
  'Tiny', 'Little', 'Big', 'Giant', 'Chubby', 'Plump', 'Skinny', 'Fluffy', 'Hairy',
  'Bald', 'Bouncy', 'Perky',
  // about cleverness, speed or mood, used to mock
  'Silly', 'Lazy', 'Sleepy', 'Dreamy', 'Grumpy', 'Cheeky', 'Naughty', 'Dizzy', 'Jumpy',
  'Wiggly', 'Loud', 'Quiet', 'Shy', 'Odd',
  // colours, which beside an animal can be read as about a person
  'Black', 'White', 'Yellow', 'Red', 'Brown', 'Silver', 'Golden',
  // sexual or adult
  'Hot', 'Sexy', 'Wet', 'Dirty', 'Mucky', 'Frosty',
  // beside a lamb, a hare or a deer it reads as cooked
  'Toasty', 'Roast', 'Crispy',
  // frightening
  'Spooky', 'Creepy', 'Angry', 'Fierce', 'Stormy', 'Dark', 'Wild',
];
const REFUSED_ANIMALS = [
  // used as an insult about a person
  'Pig', 'Cow', 'Rat', 'Ape', 'Monkey', 'Donkey', 'Goat', 'Sloth', 'Slug', 'Worm',
  'Toad', 'Chicken', 'Turkey', 'Goose', 'Duck', 'Whale', 'Hippo', 'Elephant', 'Weasel',
  'Shrew', 'Parrot', 'Magpie', 'Mule', 'Hog', 'Vulture', 'Snake',
  // a slur, or slang for a person or a body part
  'Frog', 'Kiwi', 'Beaver', 'Puffin', 'Bunny', 'Chick', 'Cub', 'Fox', 'Mole',
  // rude letters inside them
  'Cockatoo', 'Cockerel', 'Peacock', 'Booby', 'Titmouse', 'Raccoon',
  // frightening
  'Wolf', 'Shark', 'Spider', 'Bat', 'Crocodile', 'Scorpion', 'Hyena',
];

describe('display names: the word lists', () => {
  it('has enough pairs that a number is rarely needed', () => {
    expect(ADJ.length).toBeGreaterThanOrEqual(30);
    expect(ANIMALS.length).toBeGreaterThanOrEqual(30);
  });

  it('has each word once, as one capitalised word of letters', () => {
    for (const list of [ADJ, ANIMALS]) {
      expect(new Set(list).size).toBe(list.length);
      for (const w of list) expect(w).toMatch(/^[A-Z][a-z]{2,7}$/);
    }
    // A word on both lists would make one name two ways.
    expect(ADJ.filter((w) => (ANIMALS as string[]).includes(w))).toEqual([]);
  });

  it('keeps every name, with its number, inside the name length', () => {
    const longest = Math.max(...ADJ.map((a) => a.length)) + Math.max(...ANIMALS.map((a) => a.length));
    const digits = String(Math.max(...allowedDisplayNameNumbers())).length;
    expect(longest + digits).toBeLessThanOrEqual(DISPLAY_NAME_MAX_LENGTH);
    expect(DISPLAY_NAME_MAX_LENGTH).toBeLessThanOrEqual(18);
  });

  it('has no refused word on either list', () => {
    expect(ADJ.filter((w) => REFUSED_ADJECTIVES.includes(w))).toEqual([]);
    expect(ANIMALS.filter((w) => REFUSED_ANIMALS.includes(w))).toEqual([]);
  });

  it('makes no denied letters in any pair, across the join or inside a word', () => {
    const bad: string[] = [];
    for (const a of ADJ) {
      for (const b of ANIMALS) {
        const joined = (a + b).toLowerCase();
        for (const d of DENIED_INSIDE) if (joined.includes(d)) bad.push(`${a}${b} (${d})`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('never adds a number that is a code for something else', () => {
    // 14 and 88 are white-supremacist codes, 18 is a neo-Nazi group's
    // number, 69 is sexual.
    expect([...DISPLAY_NAME_SKIPPED_NUMBERS].sort((x, y) => x - y)).toEqual([14, 18, 69, 88]);
    const allowed = allowedDisplayNameNumbers();
    for (const n of DISPLAY_NAME_SKIPPED_NUMBERS) expect(allowed).not.toContain(n);
    expect(allowed[0]).toBe(2);
    expect(allowed).not.toContain(1);
    expect(allowed).not.toContain(0);
    expect(Math.max(...allowed)).toBe(99);
  });
});

describe('display names: making and checking one', () => {
  it('makes an adjective and an animal from the lists', () => {
    let i = 0;
    const steps = [0, 0.999999];
    const random = () => steps[i++ % steps.length];
    expect(randomDisplayName(random)).toBe(`${ADJ[0]}${ANIMALS[ANIMALS.length - 1]}`);
    for (let n = 0; n < 200; n++) expect(isDisplayNameBase(randomDisplayName())).toBe(true);
  });

  it('shows another name, never the same one twice running', () => {
    for (let n = 0; n < 200; n++) {
      const first = randomDisplayName();
      const next = anotherDisplayName(first);
      expect(next).not.toBe(first);
      expect(isDisplayNameBase(next)).toBe(true);
    }
  });

  it('accepts an adjective and an animal, with or without an allowed number', () => {
    const base = `${ADJ[3]}${ANIMALS[5]}`;
    expect(isDisplayNameBase(base)).toBe(true);
    expect(isDisplayName(base)).toBe(true);
    expect(isDisplayName(`${base}2`)).toBe(true);
    expect(isDisplayName(`${base}99`)).toBe(true);
    // A number is the server's to add, never the child's to send.
    expect(isDisplayNameBase(`${base}2`)).toBe(false);
  });

  it('refuses anything not made from the lists', () => {
    const base = `${ADJ[3]}${ANIMALS[5]}`;
    for (const bad of [
      '', 'Lily', 'Lily Smith', `${ANIMALS[5]}${ADJ[3]}`, base.toLowerCase(), `${base} `,
      ` ${base}`, `${ADJ[3]} ${ANIMALS[5]}`, `${base}1`, `${base}0`, `${base}02`, `${base}14`,
      `${base}18`, `${base}69`, `${base}88`, `${base}100`, `${ADJ[3]}${ADJ[4]}`, `${base}${ANIMALS[5]}`,
    ]) {
      expect(isDisplayName(bad), JSON.stringify(bad)).toBe(false);
    }
    expect(isDisplayName(null)).toBe(false);
    expect(isDisplayName(42)).toBe(false);
    expect(isDisplayNameBase(undefined)).toBe(false);
  });
});

describe('display names: on two lines', () => {
  it('splits a name into its adjective and its animal, number and all', () => {
    expect(splitDisplayName('MossyOtter')).toEqual(['Mossy', 'Otter']);
    expect(splitDisplayName('SparklyFlamingo99')).toEqual(['Sparkly', 'Flamingo99']);
  });

  it('leaves anything else on one line', () => {
    expect(splitDisplayName('Lily')).toEqual(['Lily']);
    expect(splitDisplayName('')).toEqual(['']);
  });
});
