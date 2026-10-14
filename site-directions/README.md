# arcgame.app: three visual directions

These are mock-ups for Marcus to choose from, not the finished site. Each direction is one page covering every section: the hero with PLAY, what children do, who made it, safety and privacy, help and reports, the app, and the footer. All three use the same copy, so only the look differs.

- `1-wooden-sign/index.html`
- `2-calm-clean/index.html`
- `3-map/index.html`
- `contact.jpg`: the three side by side, showing the hero at 1280 and the full page at 390
- `shots/`: full-page JPEGs of each direction at 1280 and 390
- `assets/`: shared by all three. It holds the images (WebP), the two fonts, `fonts.css`, `scene.css` and `config.js`
- `_tools/build-assets.py`: rebuilds `assets/img` from the game's art and prints each animal's outline colour

To view them, serve the folder (`python3 -m http.server` inside `site-directions/`) and open each directory.

## The three directions

**1. Wooden-sign garden.** The site looks like the game. The hero is the painted summer lawn with a signpost: the logo board, the white title on the dark plank (the `_story-title.css` style), and a PLAY plank. A macaw perches on the board's top rail, and a puppy and a rabbit stand in the grass at the foot of the posts. Each section below is a noticeboard on stakes, with cream paper notices pinned to it, so text is read on paper and not on wood. Animals sleep or walk along the top rails and stand by the posts. The grown-ups' safety section moves to the quiet hedged garden.

**2. Calm and clean.** A modern, parent-first layout: a warm white page, soft green and honey, Fredoka headings, and a sticky header with a small Play button. The hero sets the headline beside a small painted vignette: the oak with its swing, a puppy, a hedgehog and a lop rabbit on a soft green mound. The six "what children do" cards each have a little floor strip for their animal (or for Henry the van) to stand on. Safety is a calm green panel of facts, and help and the app are paired cards.

**3. The map.** The painted Birchie map is the hero, with a navy panel holding the headline and a gold PLAY. The gold route line runs up the side road, turns right with the strip map's arrow mark, and continues along the main road, where the top-down Henry is driving. That gold line then becomes the spine of the page. The sections are numbered stops, and the dividers between them use the strip map's own marks: a roundabout ring with its exit arm, and a turn arrow with its small gap. "What children do" opens on a roadside scene: animals on the verge, a hedgehog sign and a 20 sign, and Henry on the road. The colours are navy ink and gold, which reads as confident sat-nav rather than picture-book.

## Rules checked on all three (Playwright, at 1280 and 390)

- **No third-party requests.** Every request is same-origin, there are no cookies, and there are no scripts beyond `config.js`.
- **Fonts.** Only Fredoka (600 and 700) and Nunito (400 to 800), self-hosted from `apps/game/public/fonts/`. There is no script or handwriting face.
- **Text size.** All text is 16px or larger.
- **No horizontal scroll** at 390.
- **Contrast.** Text on solid backgrounds passes WCAG AA, as measured. Text over wood or painting in direction 1 sits on a dark plank, cream paper or a dark chip, and was checked by eye. White on the PLAY plank is about 3.6:1, which passes AA only because PLAY is large bold text.
- **Keyboard focus** is visible on every background. This includes a white ring on direction 3's navy panel.
- **Alt text and outlines.** Every animal and object has real alt text. Each animal has a 1px outline in its own darkest fur colour, taken from the same analysis `scripts/sign-animal-ink.py` uses, plus a contact shadow.
- **PLAY link.** Every PLAY link goes to `ARC_CONFIG.PLAY_URL` in `assets/config.js`, which defaults to `https://play.arcgame.app`. The link also works without JavaScript.

What each page loads: about 21KB of HTML, 474KB of images for directions 1 and 3 and 609KB for direction 2, and about 307KB of fonts. Each direction is well under the 3MB limit, and the whole `assets/` folder is 1.7MB.

## [check]: claims still to confirm

Each of these is marked `[check]` on the pages. I checked them against the code at `b9b18a3`:

1. **"A secret name and a PIN."** The PIN is true: it is 4 digits and stored hashed (`supabase/functions/signup/index.ts`). The "secret name" is not. The signup screen asks "What's your name and animal?" and "Type your name..." (`apps/game/public/admin/signup.html:1684,1691`). Only a profanity blocklist is applied, and nothing steers a child away from their real first name. Either change the signup to ask for a made-up name, or change the claim.
2. **"A.R.C. holds no email address."** This is true in practice today, because nothing is stored. But the schema has a `parent_email_hash` column (`supabase/migrations/00001_initial_schema.sql:14`). The signup function would store an unsalted SHA-256 hash of `parentEmail` if one were sent, and the in-game signup still offers "A grown-up wants to add their email". Today the client and server field names don't match, so nothing is saved. Remove the column and the code path, or reword the claim.
3. **"Accounts are deleted after 3 years without a sign-in."** This is not implemented. `last_seen_at` is updated at login and on save, but no cron, `pg_cron` job or scheduled function reads it. There is no delete-account feature either.

Confirmed, so stated plainly on the pages:
- No adverts.
- No analytics or tracking SDKs.
- No in-app purchases. Coins are in-game only.
- No cookies. The game uses localStorage and IndexedDB.
- Gifts between friends carry preset messages only, and there is no chat.

Two things to know for the help and reports copy:
- **Friend requests.** Friends are added instantly by swapping a friend code. There is no request and accept step, and no unfriend, block or report feature in the game. The pages ask parents to report "a friend your child doesn't know" rather than "a friend request".
- **PIN hint.** The free-text PIN hint is returned to anyone who knows the username (`get-pin-hint`), with only rate limiting.

## Things that didn't come out perfectly

- **The logo on wood (direction 1).** The logo's small orange "Animal Rescue Centre" line is low contrast on the honey wood. The image alt text carries the name, but the full build should give the logo a lighter backing or use the icon version.
- **The A.R.C. building.** The painted Art Deco building (`arc-main-building.png`, `site-arc-building.png`) has a white sticker border, so I didn't use it. It would be a strong hero for directions 2 and 3 if the border were removed. Direction 3 uses the cottage scene (`arc-exterior.png`) as a framed picture instead.
- **The hero route (direction 3).** The route ends at the bottom of the map and does not join the spine's line below it. Also, in the game the strip map reads upward, the way the van travels, but here the spine reads downward with the page.
- **Mobile roadside (direction 3).** At 390 the roadside scene drops two of its five figures to avoid crowding.

## What the full build would need

- **A decision on the [check] items:** fix the code, or change the words.
- **The real privacy notice and support pages** at support.interfulgent.com/arc/, and a confirmed PLAY_URL.
- **App Store.** When the app leaves TestFlight, switch the "coming soon" badge to a link to App Store id 6821467142, using Apple's badge artwork stored locally, not hot-linked.
- **Host and launch details:**
  - Hosting with no third-party scripts.
  - A strict Content-Security-Policy (`default-src 'self'`).
  - Favicon and social-share images.
  - A 404 page.
- **The chosen direction made production-ready:**
  - A dedicated hero image, and a hero crop at 2x.
  - Responsive `srcset` sizes, and preloading the hero image and the two title weights.
  - A reduced-motion review.
  - An accessibility pass with a screen reader.
- **Copy review by Marcus,** especially the "Who made it" wording. That section uses only Lily's first name, calls her dad "her dad", and has no photo, surname, school or town.
- **Place names.** Keep allusive names only (`docs/naming-places.md`). The only places named are "Birchie" and "Kent".
