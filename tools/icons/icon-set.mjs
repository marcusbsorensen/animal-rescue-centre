/**
 * icon-set.mjs — the game's interface icons, as geometry.
 *
 * **Why these are drawn rather than painted.**
 *
 * Every icon on a button renders at 24–26px (`UIButton.ts`'s `iconSize`
 * defaults, and the nav rail's disc is 22–32). The set this replaces was
 * painted illustration authored at 128px: a five-fold downscale, so the
 * interior detail that made each one charming turned to grey mush at the
 * size a child actually sees. That is not a rendering fault to tune, it
 * is the wrong medium for the job — a painted commission would fail the
 * same way. Interface icons want flat, high-contrast, bold silhouettes
 * on a grid.
 *
 * This is also the game's own rule applied honestly: *painted is
 * diegetic only; anything floating above the world is chrome*. A button
 * icon is chrome.
 *
 * **The system.**
 *
 * - Drawn on a **24px grid**, live area 2..22, exported at 4x (96px) so
 *   they stay crisp on a 3x screen.
 * - **2px stroke**, round caps and joins. Nothing thinner than the
 *   stroke, and no counter (hole) smaller than it either — that is the
 *   rule that decides whether a shape survives at 24px.
 * - **White**, on transparency. Colour arrives at draw time:
 *   `createChromeButton`'s `iconStyle: 'glyph'` tints to the button's own
 *   ink, so one asset reads dark on a cream plate and cream on a filled
 *   one; the nav rail draws it on a solid brand-hue disc; the HUD chips
 *   pass their own tint. Phaser's tint multiplies, which is why the
 *   source has to be white — it can darken, never lighten.
 * - Pictorial things (paws, weather) are **solid silhouettes** rather
 *   than outlines. An outlined paw at 24px is a grey blob; a filled one
 *   is a paw.
 *
 * Run `node tools/icons/build-icons.mjs` to rasterise.
 */

/** The stroke every outlined icon shares. */
export const STROKE = 2;

/** Reused shapes, so a cloud is the same cloud in all eight weathers. */
const CLOUD = 'M7.2 18.6a4.6 4.6 0 0 1 .4-9.1 6.1 6.1 0 0 1 11.3 1 4.1 4.1 0 0 1-.8 8.1Z';
const DROP = (x, y) => `M${x} ${y}c1.4 1.7 2 2.6 2 3.4a2 2 0 0 1-4 0c0-.8.6-1.7 2-3.4Z`;
const FLAKE = (x, y, r = 2) =>
  `M${x} ${y - r}V${y + r}M${x - r * 0.87} ${y - r * 0.5}L${x + r * 0.87} ${y + r * 0.5}` +
  `M${x - r * 0.87} ${y + r * 0.5}L${x + r * 0.87} ${y - r * 0.5}`;

/** A paw: one pad and four toes, all solid. Scales about its own centre. */
function paw(cx = 12, cy = 12.6, s = 1) {
  const e = (x, y, rx, ry) =>
    `<ellipse cx="${(cx + x * s).toFixed(2)}" cy="${(cy + y * s).toFixed(2)}" ` +
    `rx="${(rx * s).toFixed(2)}" ry="${(ry * s).toFixed(2)}" fill="#fff"/>`;
  return [
    e(0, 3.6, 5.3, 4.3),      // main pad
    e(-4.9, -2.2, 2.15, 2.5), // outer toes
    e(4.9, -2.2, 2.15, 2.5),
    e(-1.85, -5.2, 2.2, 2.6), // inner toes
    e(1.85, -5.2, 2.2, 2.6),
  ].join('');
}

/** A house outline — the roof and body shared by home / homes / centre. */
const HOUSE_ROOF = 'M2.8 11.2 12 3.6l9.2 7.6';
const HOUSE_BODY = 'M5.3 9.4V20.2h13.4V9.4';

/** A speaker cone, for the sound toggles. */
const SPEAKER = 'M3.4 9.4h3.4l4.7-3.9v13l-4.7-3.9H3.4Z';

/**
 * The set. `s` is stroked path data, `f` is filled path data, `raw` is
 * literal SVG. Everything is white; the game tints it.
 */
export const ICONS = {
  // ── Navigation ──────────────────────────────────────────
  'nav-home': { s: [HOUSE_ROOF, HOUSE_BODY, 'M9.8 20.2v-5.3h4.4v5.3'] },
  'nav-care': {
    // A heart. Care is the whole of feeding, healing and the garden, and
    // no single implement stands for all three — the feeling does.
    f: ['M12 20.4S3.6 15.1 3.6 9.5A4.7 4.7 0 0 1 12 6.6a4.7 4.7 0 0 1 8.4 2.9c0 5.6-8.4 10.9-8.4 10.9Z'],
  },
  'nav-walk': { raw: paw() },
  'nav-map': {
    s: [
      'M3 6.3 9 3.8l6 2.7 6-2.5v13.7l-6 2.5-6-2.7-6 2.5Z',
      'M9 3.8v13.7', 'M15 6.5v13.7',
    ],
  },

  // ── Chrome actions ──────────────────────────────────────
  'icon-back': { s: ['M20 12H4.8', 'M10.6 6.2 4.8 12l5.8 5.8'] },
  'icon-accept': { s: ['m4.6 12.6 4.9 5.1L19.4 6.6'] },
  'icon-close': { s: ['M6.2 6.2 17.8 17.8', 'M17.8 6.2 6.2 17.8'] },
  'icon-menu': { s: ['M4 7h16', 'M4 12h16', 'M4 17h16'] },
  'icon-feed': {
    // A bowl with kibble above it. The bowl is solid because a 2px
    // outlined crescent closes up at 24px.
    f: ['M3.2 12.4h17.6a8.8 8.8 0 0 1-17.6 0Z'],
    raw: '<circle cx="8.6" cy="9.1" r="1.5" fill="#fff"/>'
       + '<circle cx="12.2" cy="7.9" r="1.5" fill="#fff"/>'
       + '<circle cx="15.7" cy="9.3" r="1.5" fill="#fff"/>',
  },
  'icon-heal': {
    s: ['M4.6 4.6h14.8a1 1 0 0 1 1 1v12.8a1 1 0 0 1-1 1H4.6a1 1 0 0 1-1-1V5.6a1 1 0 0 1 1-1Z'],
    f: ['M10.6 7.6h2.8v3.6H17v2.8h-3.6v3.6h-2.8v-3.6H7v-2.8h3.6Z'],
  },
  'icon-vet': {
    // A cross inside a heart. This was a stethoscope, which is the
    // obvious picture and an unreadable squiggle at 24px — the tube, the
    // ear pieces and the chest piece are four thin elements inside a
    // 20px box. Care plus medicine says the same thing in two shapes.
    s: ['M12 20.4S3.6 15.1 3.6 9.5A4.7 4.7 0 0 1 12 6.6a4.7 4.7 0 0 1 8.4 2.9c0 5.6-8.4 10.9-8.4 10.9Z'],
    f: ['M10.7 9.2h2.6v2.3h2.3v2.6h-2.3v2.3h-2.6v-2.3H8.4v-2.6h2.3Z'],
  },
  'icon-play': {
    s: [
      'M12 3.6a8.4 8.4 0 1 1 0 16.8 8.4 8.4 0 0 1 0-16.8Z',
      // Seams bowing outward, the way a tennis ball's do. Bowed inward
      // they crossed the disc and the whole thing read as a no-entry sign.
      'M5.4 6.2a9.4 9.4 0 0 1 0 11.6', 'M18.6 6.2a9.4 9.4 0 0 0 0 11.6',
    ],
  },
  'icon-walk': { raw: paw() },
  'icon-groom': {
    // A comb. A brush's bristles vanish at 24px; a comb's teeth are
    // 2px apart and survive.
    s: ['M3.6 7.2h16.8v4.4H3.6Z', 'M6.8 11.6v5.4', 'M10.3 11.6v5.4', 'M13.7 11.6v5.4', 'M17.2 11.6v5.4'],
  },
  'icon-rest': { f: ['M20.4 14.6A8.6 8.6 0 1 1 10 3.9a6.9 6.9 0 0 0 10.4 10.7Z'] },
  'icon-garden': {
    s: ['M12 20.6v-6.4'],
    f: [
      'M12 15c-4.9 0-8-3.1-8-7.7 4.9 0 8 3.1 8 7.7Z',
      'M12 12c4.5 0 7.4-2.9 7.4-7.2-4.5 0-7.4 2.9-7.4 7.2Z',
    ],
  },
  'icon-kitchen': {
    s: [
      'M4.4 10.2h15.2v5.6a3.2 3.2 0 0 1-3.2 3.2H7.6a3.2 3.2 0 0 1-3.2-3.2Z',
      'M4.4 12.4H2.2', 'M19.6 12.4h2.2',
      'M9.4 7.4q1.6-2 0-3.8', 'M14.2 7.4q1.6-2 0-3.8',
    ],
  },
  'icon-depot': {
    // An open crate: lid band, body, and a hand slot. As a plain
    // rectangle divided by two lines it read as a window.
    s: ['M3 5.2h18v4.4H3Z', 'M5.2 9.6v9.8h13.6V9.6', 'M9.8 13.4h4.4'],
  },
  'icon-supply-run': {
    s: [
      'M2.6 16V8.6a1 1 0 0 1 1-1H13V16',
      'M13 10.6h3.3a1 1 0 0 1 .8.4l2.7 3.2a1 1 0 0 1 .2.6V16',
      'M2.6 16h18',
    ],
    raw: '<circle cx="7.4" cy="16.8" r="2.1" fill="#fff"/>'
       + '<circle cx="16.8" cy="16.8" r="2.1" fill="#fff"/>',
  },
  'icon-games': {
    s: ['M5 3.8h14a1.2 1.2 0 0 1 1.2 1.2v14a1.2 1.2 0 0 1-1.2 1.2H5a1.2 1.2 0 0 1-1.2-1.2V5A1.2 1.2 0 0 1 5 3.8Z'],
    raw: '<circle cx="8.6" cy="8.6" r="1.5" fill="#fff"/>'
       + '<circle cx="12" cy="12" r="1.5" fill="#fff"/>'
       + '<circle cx="15.4" cy="15.4" r="1.5" fill="#fff"/>',
  },
  'icon-friends': {
    s: ['M2.4 20.2a6.3 6.3 0 0 1 12.6 0', 'M16.6 15.6a4.8 4.8 0 0 1 5 4.6'],
    raw: '<circle cx="8.7" cy="7.8" r="3.5" fill="none" stroke="#fff" stroke-width="2"/>'
       + '<circle cx="17.9" cy="9.4" r="2.6" fill="none" stroke="#fff" stroke-width="2"/>',
  },
  'icon-send-gift': {
    s: [
      'M3.4 6.6h17.2v4H3.4Z', 'M4.8 10.6h14.4v8.8H4.8Z', 'M12 6.6v12.8',
      'M12 6.6C9.6 2.6 6 4.4 7.6 6.6', 'M12 6.6c2.4-4 6-2.2 4.4 0',
    ],
  },
  'icon-leaderboard': {
    f: ['M3.4 13.4h4.8v6.4H3.4Z', 'M9.6 7.6h4.8v12.2H9.6Z', 'M15.8 10.6h4.8v9.2h-4.8Z'],
  },
  'icon-share': {
    s: ['M8.4 10.8 15.6 7.4', 'M8.4 13.2l7.2 3.4'],
    raw: '<circle cx="5.8" cy="12" r="2.6" fill="none" stroke="#fff" stroke-width="2"/>'
       + '<circle cx="17.4" cy="6.2" r="2.6" fill="none" stroke="#fff" stroke-width="2"/>'
       + '<circle cx="17.4" cy="17.8" r="2.6" fill="none" stroke="#fff" stroke-width="2"/>',
  },
  'icon-welcome': {
    // A paw and a plus: take this animal in. It was an archway with a
    // paw standing in it, which at 24px is a keyhole. The plus borrows
    // `icon-create-account`'s grammar — a thing, plus, means add it.
    s: ['M19.2 4.6v5.4', 'M16.5 7.3h5.4'],
    raw: paw(10, 13.6, 0.82),
  },
  'icon-inbox': {
    s: [
      'M3.4 13.6 6.6 5.4a1.4 1.4 0 0 1 1.3-.9h8.2a1.4 1.4 0 0 1 1.3.9l3.2 8.2',
      'M3.4 13.6v4.6a1.4 1.4 0 0 0 1.4 1.4h14.4a1.4 1.4 0 0 0 1.4-1.4v-4.6',
      'M3.4 13.6h4.9l1.4 2.6h4.6l1.4-2.6h5.3',
    ],
  },
  'icon-social': {
    // One bubble, three dots. Two overlapping bubbles read as a smudge
    // at 24px — the second one's tail and the first one's edge are 1px
    // apart, which is below the stroke and therefore below the floor.
    s: ['M4 4.4h16a1.7 1.7 0 0 1 1.7 1.7v8.2a1.7 1.7 0 0 1-1.7 1.7h-8.8l-4.9 3.9v-3.9H4a1.7 1.7 0 0 1-1.7-1.7V6.1A1.7 1.7 0 0 1 4 4.4Z'],
    raw: '<circle cx="8" cy="10.2" r="1.4" fill="#fff"/>'
       + '<circle cx="12" cy="10.2" r="1.4" fill="#fff"/>'
       + '<circle cx="16" cy="10.2" r="1.4" fill="#fff"/>',
  },

  // ── Account ─────────────────────────────────────────────
  'icon-login': {
    s: ['M13 3.8h5.8a1.4 1.4 0 0 1 1.4 1.4v13.6a1.4 1.4 0 0 1-1.4 1.4H13', 'M3.4 12h9.8', 'M9.2 7.8 13.4 12l-4.2 4.2'],
  },
  'icon-logout': {
    s: ['M11 3.8H5.2a1.4 1.4 0 0 0-1.4 1.4v13.6a1.4 1.4 0 0 0 1.4 1.4H11', 'M10.8 12h9.8', 'M16.4 7.8 20.6 12l-4.2 4.2'],
  },
  'icon-save': {
    s: ['M3.8 15.4v3.4a1.4 1.4 0 0 0 1.4 1.4h13.6a1.4 1.4 0 0 0 1.4-1.4v-3.4', 'M12 3.6v11.6', 'M7.4 10.6 12 15.2l4.6-4.6'],
  },
  'icon-create-account': {
    s: ['M3.8 20a6.6 6.6 0 0 1 13.2 0', 'M18.6 4.8v6.4', 'M15.4 8h6.4'],
    raw: '<circle cx="10.4" cy="8.2" r="3.4" fill="none" stroke="#fff" stroke-width="2"/>',
  },
  'icon-settings': {
    // Sliders, not a gear. A gear's teeth are sub-pixel at 24px.
    s: ['M3.6 7.4h16.8', 'M3.6 12h16.8', 'M3.6 16.6h16.8'],
    raw: '<circle cx="9" cy="7.4" r="2.3" fill="#fff"/>'
       + '<circle cx="15.4" cy="12" r="2.3" fill="#fff"/>'
       + '<circle cx="10.4" cy="16.6" r="2.3" fill="#fff"/>',
  },

  // ── Sound ───────────────────────────────────────────────
  // Two toggles, two pictures. The rail used words because nothing was
  // painted for effects; a note and a speaker say it without reading.
  'icon-music-on': {
    s: ['M9.2 17.2V5.6l10-2v11.6', 'M9.2 9.4l10-2'],
    raw: '<ellipse cx="6.6" cy="17.4" rx="2.8" ry="2.4" fill="#fff"/>'
       + '<ellipse cx="16.6" cy="15.4" rx="2.8" ry="2.4" fill="#fff"/>',
  },
  'icon-music-off': {
    s: ['M9.2 17.2V5.6l10-2v11.6', 'M9.2 9.4l10-2', 'M3.4 20.6 20.6 3.4'],
    raw: '<ellipse cx="6.6" cy="17.4" rx="2.8" ry="2.4" fill="#fff"/>'
       + '<ellipse cx="16.6" cy="15.4" rx="2.8" ry="2.4" fill="#fff"/>',
  },
  'icon-sfx-on': {
    f: [SPEAKER],
    s: ['M14.8 9.2a4 4 0 0 1 0 5.6', 'M17.6 6.6a7.8 7.8 0 0 1 0 10.8'],
  },
  'icon-sfx-off': {
    f: [SPEAKER],
    s: ['M15 9.4 20.6 15', 'M20.6 9.4 15 15'],
  },

  // ── HUD ─────────────────────────────────────────────────
  'icon-hud-animals': { raw: paw() },
  'icon-hud-coins': {
    // A stack of three coins. One coin with a smaller coin inside it is
    // a doughnut or a target; a stack is unmistakably money.
    s: [
      'M12 4.4c4.4 0 8 1.5 8 3.4S16.4 11.2 12 11.2 4 9.7 4 7.8s3.6-3.4 8-3.4Z',
      'M4 12c0 1.9 3.6 3.4 8 3.4s8-1.5 8-3.4',
      'M4 7.8v8.4c0 1.9 3.6 3.4 8 3.4s8-1.5 8-3.4V7.8',
    ],
  },
  'icon-hud-homes': {
    s: [HOUSE_ROOF, HOUSE_BODY],
    f: ['M12 18.6s-3.6-2.3-3.6-4.7a2 2 0 0 1 3.6-1.2 2 2 0 0 1 3.6 1.2c0 2.4-3.6 4.7-3.6 4.7Z'],
  },
  'icon-hud-level': {
    f: ['M12 2.8 14.9 8.7 21.4 9.6 16.7 14.2 17.8 20.7 12 17.6 6.2 20.7 7.3 14.2 2.6 9.6 9.1 8.7Z'],
  },
  'icon-hud-time': {
    s: ['M12 3.6a8.4 8.4 0 1 1 0 16.8 8.4 8.4 0 0 1 0-16.8Z', 'M12 7v5.2l3.6 2.4'],
  },
  'icon-hud-progress': {
    f: ['M3.4 14.2h4.2v5.8H3.4Z', 'M9.9 10h4.2v10H9.9Z', 'M16.4 5.4h4.2V20h-4.2Z'],
  },
  'icon-hud-score': {
    s: ['M12 3.4a5.6 5.6 0 1 1 0 11.2 5.6 5.6 0 0 1 0-11.2Z', 'M9 14 7.4 21.2 12 18.6l4.6 2.6L15 14'],
  },
  'icon-hud-damage': {
    s: ['M12 3.2 20 6.2v6c0 5-3.6 8.2-8 9.6-4.4-1.4-8-4.6-8-9.6v-6Z'],
    f: ['M12.9 7.6 9.6 13h2.6l-1.1 4.2 3.3-5.4h-2.6Z'],
  },
  'icon-hud-smash': {
    f: ['M12 2.6 14 8.4 19.6 5.8 17 11.4 22.4 13.4 16.6 14.6 18.4 20.4 13.6 16.8 12 22.4 10.4 16.8 5.6 20.4 7.4 14.6 1.6 13.4 7 11.4 4.4 5.8 10 8.4Z'],
  },

  // ── Weather ─────────────────────────────────────────────
  'weather-sunny': {
    f: ['M12 6.9a5.1 5.1 0 1 1 0 10.2 5.1 5.1 0 0 1 0-10.2Z'],
    s: ['M12 1.4v2.6', 'M12 20v2.6', 'M1.4 12H4', 'M20 12h2.6',
        'M4.5 4.5 6.3 6.3', 'M17.7 17.7l1.8 1.8', 'M19.5 4.5l-1.8 1.8', 'M6.3 17.7l-1.8 1.8'],
  },
  'weather-cloudy': {
    // The sun clear of the cloud, up and right. Overlapped, the two
    // solids merged into one shape at 24px and the icon lost its sun.
    f: ['M16.6 2.4a3.9 3.9 0 1 1 0 7.8 3.9 3.9 0 0 1 0-7.8Z',
        'M6.6 21a4.4 4.4 0 0 1 .4-8.7 5.9 5.9 0 0 1 10.9 1 3.9 3.9 0 0 1-.8 7.7Z'],
    s: ['M16.6 12.4v-1.2'],
  },
  'weather-overcast': { f: [CLOUD] },
  'weather-light-rain': {
    f: ['M7.2 15.6a4.6 4.6 0 0 1 .4-9.1 6.1 6.1 0 0 1 11.3 1 4.1 4.1 0 0 1-.8 8.1Z', DROP(9.4, 17.4), DROP(15, 17.4)],
  },
  'weather-heavy-rain': {
    f: [
      'M7.2 14.4a4.6 4.6 0 0 1 .4-9.1 6.1 6.1 0 0 1 11.3 1 4.1 4.1 0 0 1-.8 8.1Z',
      DROP(6.8, 15.8), DROP(11, 15.8), DROP(15.2, 15.8), DROP(8.9, 19.2), DROP(13.1, 19.2),
    ],
  },
  'weather-fog': {
    f: ['M7.2 14.6a4.6 4.6 0 0 1 .4-9.1 6.1 6.1 0 0 1 11.3 1 4.1 4.1 0 0 1-.8 8.1Z'],
    s: ['M4.4 17.8h15.2', 'M6.6 21h11'],
  },
  'weather-snow': {
    f: ['M7.2 14.4a4.6 4.6 0 0 1 .4-9.1 6.1 6.1 0 0 1 11.3 1 4.1 4.1 0 0 1-.8 8.1Z'],
    s: [FLAKE(7.6, 18.4), FLAKE(12, 20.4), FLAKE(16.4, 18.4)],
  },
  'weather-windy': {
    s: [
      'M2.6 8.4h10a3 3 0 1 0-3-3',
      'M2.6 13h13.4a3.2 3.2 0 1 1-3.2 3.2',
      'M2.6 17.8h6.2',
    ],
  },
};

/**
 * Names that draw the same picture.
 *
 * The codebase reaches for several keys for one idea — `nav-home` and
 * `icon-home`, `icon-walk` and `nav-walk` and `icon-hud-animals` — with
 * per-site fallback chains deciding which lands. Rather than unpick 31
 * call sites, every alias gets the file; the chain then cannot pick a
 * different picture depending on which name it tried first, which is
 * how the kitchen came to draw a different walk glyph from the nav bar.
 */
export const ALIASES = {
  'icon-home': 'nav-home',
  'icon-care': 'nav-care',
  'icon-map': 'nav-map',
  'nav-play': 'nav-walk',
  'icon-walk-scene': 'nav-walk',
  'icon-social-scene': 'icon-social',
  'icon-friends-scene': 'icon-friends',
  'icon-badge': 'icon-hud-score',
  'icon-arc-badge': 'icon-hud-score',
  'icon-rescue-centre': 'icon-hud-homes',
  'icon-vet-clinic': 'icon-vet',
  'icon-depot-scene': 'icon-depot',
  'icon-heal-scene': 'icon-heal',
  'hud-coins': 'icon-hud-coins',
  'hud-homes': 'icon-hud-homes',
};

/** Build one 24x24 SVG document for an icon. */
export function svgFor(name, size = 96) {
  const def = ICONS[name] ?? ICONS[ALIASES[name]];
  if (!def) throw new Error(`no icon named ${name}`);
  const parts = [];
  for (const d of def.f ?? []) parts.push(`<path d="${d}" fill="#fff"/>`);
  for (const d of def.s ?? []) {
    parts.push(
      `<path d="${d}" fill="none" stroke="#fff" stroke-width="${STROKE}" ` +
      `stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }
  if (def.raw) parts.push(def.raw);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ` +
    `width="${size}" height="${size}">${parts.join('')}</svg>`
  );
}

/** Every file the build writes: the set plus its aliases. */
export function allNames() {
  return [...Object.keys(ICONS), ...Object.keys(ALIASES)];
}
