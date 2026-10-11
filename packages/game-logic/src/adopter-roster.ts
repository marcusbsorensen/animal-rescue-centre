// ── The adopter roster ─────────────────────────────────────────
// Who can take an animal home. Built from `apps/game/public/data/cast.json`
// (32 households) and docs/rehoming-cast.md, and kept honest against that
// file by __tests__/adoption.test.ts: every id, every species list and every
// portrait is read back from disk, so the two cannot drift apart again.
//
// **Not every household adopts.** cast.json's `category` and `return_rhythm`
// say what each one is for, and the roster follows them:
//
//   solo, couple, family, housemates, institutional, two-houses
//        take animals home. 28 households.
//   return-visitor with return_rhythm 'repeat-adopter'
//        also takes animals home: Tata comes back for another working dog.
//   return-visitor with any other rhythm
//        does NOT adopt (NON_ADOPTING_HOUSEHOLDS below). Their `species` list
//        names the animals they are connected to, not animals they would
//        take: the Khans bring donations for the cat they already have;
//        Benji and Simeon & Karo help animals go back to the wild.
//
// Which is why no household takes a fox or a bat. Those animals leave by
// rewilding, with Benji and Simeon & Karo as the people who help — see
// REWILDING_HELPERS in exits.ts. There is no hedgehog household either, and
// cast.json's species_vocabulary does not list one: hedgehogs are nursed and
// let go, not rehomed.
//
// **Nova and Hiro take CATS.** docs/rehoming-cast.md (rows 3 and 6) and the
// code have always said cats. The "Decisions LOCKED 2026-05-03" table in
// docs/animal-flow-implementation-plan-2026-05-03.md says dogs; that table is
// the older of the two and is wrong. Marcus settled it on 2026-10-11. Leave it.
//
// Blurbs are the one-line "adoption preference" from rehoming-cast.md, in the
// storybook voice the first five were written in. Each names the animals the
// household takes, so a card never promises a pet the household would turn
// away.

import type { Applicant } from './adoption';

/**
 * Households that take animals in at once, per cooldown window. Everyone
 * takes one; the three institutions have many hands (a children's home, a
 * care home, a class of 26) and take up to two. Rhubarb's household stays at
 * one on purpose — "this household gets ONE animal at a time"
 * (rehoming-cast.md, row 30).
 */
const INSTITUTION_CAPACITY = 2;

const cast = (id: string): string => `/admin/scene-assets/cast/${id}.png`;

export const ADOPTER_HOUSEHOLD_DEFS: Applicant[] = [
  // ── Solo adopters ────────────────────────────────────────────
  {
    householdId: '01-priya',
    name: 'Priya "Pri" Kaur',
    avatarSrc: cast('01-priya'),
    blurb:
      "A quiet flat with a sunny laptop spot — Pri would love a calm cat or a small dog who's happy indoors.",
    speciesPreferences: ['cat', 'dog'],
    capacity: 1,
  },
  {
    householdId: '02-jan',
    name: 'Jan Lindqvist',
    avatarSrc: cast('02-jan'),
    blurb:
      'Beehives, clover and a very patient beekeeper — Jan has the quiet garden a bunny or a gentle snake would love.',
    speciesPreferences: ['bunny', 'snake'],
    capacity: 1,
  },
  {
    householdId: '03-nova',
    name: 'Nova Adebayo',
    avatarSrc: cast('03-nova'),
    blurb:
      'An attic art studio full of paint pots and music — Nova would love a playful cat for company.',
    speciesPreferences: ['cat'],
    capacity: 1,
  },
  {
    householdId: '04-babcia',
    name: 'Babcia Basia Kowalska',
    avatarSrc: cast('04-babcia'),
    blurb:
      'A cosy lap, a biscuit-crumbed pocket, and a cane by the door — Babcia would love a senior cat or tiny dog.',
    speciesPreferences: ['cat', 'dog'],
    capacity: 1,
  },
  {
    householdId: '05-finn',
    name: "Finn O'Malley",
    avatarSrc: cast('05-finn'),
    blurb:
      'Muddy trainers by the door and a trail to run every morning — Finn is looking for a dog who loves a long run.',
    speciesPreferences: ['dog'],
    capacity: 1,
  },
  {
    householdId: '06-hiro',
    name: 'Hiroshi "Hiro" Nakamura',
    avatarSrc: cast('06-hiro'),
    blurb:
      'A very quiet home with library books stacked by the chair — Hiro would love a sweet older cat for a gentle forever.',
    speciesPreferences: ['cat'],
    capacity: 1,
  },
  {
    householdId: '18-tali',
    name: 'Avital "Tali" Rosenberg',
    avatarSrc: cast('18-tali'),
    blurb:
      'A pottery studio dusted with clay — Tali would love a playful cat to keep her company at the wheel.',
    speciesPreferences: ['cat'],
    capacity: 1,
  },
  {
    householdId: '19-linny',
    name: 'Mei Lin "Linny" Chow',
    avatarSrc: cast('19-linny'),
    blurb:
      'A tidy flat, a camera and a notebook — Linny would love a photogenic cat to be the star of her blog.',
    speciesPreferences: ['cat'],
    capacity: 1,
  },
  {
    householdId: '20-lei',
    name: 'Leilani "Lei" Kealoha',
    avatarSrc: cast('20-lei'),
    blurb:
      'Ukulele lessons and a hibiscus in her hair — Lei would love a parrot to sing along while she plays.',
    speciesPreferences: ['parrot'],
    capacity: 1,
  },
  {
    householdId: '21-mara',
    name: 'Mariama "Mara" Diop',
    avatarSrc: cast('21-mara'),
    blurb:
      'A busy tailoring shop full of bright cloth — Mara would love a parrot to perch beside her and chirp while she sews.',
    speciesPreferences: ['parrot'],
    capacity: 1,
  },
  {
    householdId: '29-wenna',
    name: 'Morwenna "Wenna" Treloar',
    avatarSrc: cast('29-wenna'),
    blurb:
      'A lighthouse by the sea and a salty Aran jumper — Wenna would love a loyal shaggy dog who loves wild weather.',
    speciesPreferences: ['dog'],
    capacity: 1,
  },

  // ── Couples ──────────────────────────────────────────────────
  {
    householdId: '07-patel-greens',
    name: 'Anjali & Sam Patel-Green',
    avatarSrc: cast('07-patel-greens'),
    blurb:
      "A peaceful retirement home with two patient adults — they'd love a senior cat who needs a calm sunset chapter.",
    speciesPreferences: ['cat'],
    capacity: 1,
  },
  {
    householdId: '08-walkers',
    name: 'Chris & Jamie Walker',
    avatarSrc: cast('08-walkers'),
    blurb:
      "A house with a garden, a carpenter's workshop and one calm dog already — Chris and Jamie would love a second gentle dog.",
    speciesPreferences: ['dog'],
    capacity: 1,
  },
  {
    householdId: '09-okonkwo-harts',
    name: 'Mel & Alex Okonkwo-Hart',
    avatarSrc: cast('09-okonkwo-harts'),
    blurb:
      'Flour on the counter and a big comfy sofa — Mel and Alex would love a playful cat to raise together.',
    speciesPreferences: ['cat'],
    capacity: 1,
  },
  {
    householdId: '10-dani-rex',
    name: 'Dani & Rex',
    avatarSrc: cast('10-dani-rex'),
    blurb:
      'A farmhouse with a huge garden and muddy boots by the door — Dani and Rex would love an energetic dog.',
    speciesPreferences: ['dog'],
    capacity: 1,
  },
  {
    householdId: '22-yilmaz',
    name: 'Cem & Leyla Yılmaz',
    avatarSrc: cast('22-yilmaz'),
    blurb:
      'A warm bakery home with sacks of flour — Cem and Leyla would love a calm cat to nap on them.',
    speciesPreferences: ['cat'],
    capacity: 1,
  },
  {
    householdId: '23-wiri-harper',
    name: 'Wiri & Harper',
    avatarSrc: cast('23-wiri-harper'),
    blurb:
      "Forest paths, a ranger's coat and a clipboard — Wiri and Harper would love a high-energy dog for long walks.",
    speciesPreferences: ['dog'],
    capacity: 1,
  },

  // ── Families ─────────────────────────────────────────────────
  {
    householdId: '11-vargas-chen',
    name: 'Vargas-Chen family',
    avatarSrc: cast('11-vargas-chen'),
    blurb:
      'Four people, one football and lots of tumbling — the Vargas-Chens would love a sturdy, patient dog.',
    speciesPreferences: ['dog'],
    capacity: 1,
  },
  {
    householdId: '12-odenkirks',
    name: 'The Odenkirks',
    avatarSrc: cast('12-odenkirks'),
    blurb:
      'A quiet home with a field guide on the table — Helen and Bo would love a calm snake, parrot or cat.',
    speciesPreferences: ['snake', 'parrot', 'cat'],
    capacity: 1,
  },
  {
    householdId: '13-kumar-ishii',
    name: 'Kumar-Ishii family',
    avatarSrc: cast('13-kumar-ishii'),
    blurb:
      'A vet mum, a tree-climbing daughter and a cat already at home — they would love a second cat as a friend.',
    speciesPreferences: ['cat'],
    capacity: 1,
  },
  {
    householdId: '14-theo-grandkids',
    name: 'Grandpa Theo & grandkids',
    avatarSrc: cast('14-theo-grandkids'),
    blurb:
      'Weekend visits, corduroys and a pipe that is never lit — Theo and the grandkids would love a sweet, gentle dog.',
    speciesPreferences: ['dog'],
    capacity: 1,
  },
  {
    householdId: '24-perera-fernando',
    name: 'Perera-Fernando family',
    avatarSrc: cast('24-perera-fernando'),
    blurb:
      'Twins in rain boots and a very gentle house — they would love a calm dog or cat to grow up with.',
    speciesPreferences: ['dog', 'cat'],
    capacity: 1,
  },
  {
    householdId: '31-estrada-train',
    name: 'The Estrada Train',
    avatarSrc: cast('31-estrada-train'),
    blurb:
      'Eight kids, lots of noise and cheerful chaos — they would love a loud, colourful parrot or a snake.',
    speciesPreferences: ['parrot', 'snake'],
    capacity: 1,
  },

  // ── Housemates ───────────────────────────────────────────────
  {
    householdId: '25-bramble-house',
    name: 'Bramble House housemates',
    avatarSrc: cast('25-bramble-house'),
    blurb:
      'Four friends, one terraced house and plenty of quiet study hours — they would love a chilled-out cat to share.',
    speciesPreferences: ['cat'],
    capacity: 1,
  },

  // ── Institutions: many hands share the care ──────────────────
  {
    householdId: '26-aisha-childrens-home',
    name: "Sunnybrook Children's Home",
    avatarSrc: cast('26-aisha-childrens-home'),
    blurb:
      "A home with six children and a warm routine — they would love a calm dog or cat to be everyone's steady friend.",
    speciesPreferences: ['dog', 'cat'],
    capacity: INSTITUTION_CAPACITY,
  },
  {
    householdId: '27-tomas-care-home',
    name: 'Oak Lodge Care Home',
    avatarSrc: cast('27-tomas-care-home'),
    blurb:
      'Twelve friends who love a gentle lap — Oak Lodge would love a cat or small dog passed softly from lap to lap.',
    speciesPreferences: ['cat', 'dog'],
    capacity: INSTITUTION_CAPACITY,
  },
  {
    householdId: '28-iris-teacher',
    name: "Ms. Popescu's Year 3",
    avatarSrc: cast('28-iris-teacher'),
    blurb:
      'A classroom of curious seven-year-olds — they would love a snake or a calm parrot to learn to look after.',
    speciesPreferences: ['snake', 'parrot'],
    capacity: INSTITUTION_CAPACITY,
  },

  // ── Two homes, one friend at a time ──────────────────────────
  {
    householdId: '30-two-houses',
    name: 'Marcus & Rhubarb & Gosia',
    avatarSrc: cast('30-two-houses'),
    blurb:
      'Two homes, one skateboard and one very keen Rhubarb — room for one friend at a time, who loves to travel.',
    speciesPreferences: ['dog', 'cat', 'bunny', 'parrot'],
    capacity: 1,
  },

  // ── A return visitor who adopts ──────────────────────────────
  {
    householdId: '16-tata',
    name: 'Ana "Tata" Silva',
    avatarSrc: cast('16-tata'),
    blurb:
      "Rufus the collie is her farm's pride — Tata comes back for another dog who loves a good day's work.",
    speciesPreferences: ['dog'],
    capacity: 1,
  },
];

/**
 * The cast.json households that do not adopt, and why. Every household in
 * cast.json is either in ADOPTER_HOUSEHOLD_DEFS or here — a test holds the
 * two lists against the file, so a new household cannot be left out by
 * accident.
 */
export const NON_ADOPTING_HOUSEHOLDS: Readonly<Record<string, string>> = {
  '15-khans': 'donation drop-offs; they adopted their cat two years ago',
  '17-benji': 'wild-visit reporter; helps foxes go back to the wild',
  '32-simeon-karo': 'bat-rewilding helpers; they already have Poppy the cat',
};
