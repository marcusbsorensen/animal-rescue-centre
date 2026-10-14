# arcgame.app: the website

This folder is the public front door for A.R.C. (Animal Rescue Centre), the game Lily dreamt up. It is one page plus a 404 page. The PLAY buttons go to the game at https://play.arcgame.app.

It is built from mock-up direction 2 (`site-directions/2-calm-clean`) with Marcus's review changes. The site is static: plain HTML and CSS, `config.js` and one small progressive-enhancement script (`assets/site.js`). There is no build step and no framework, and nothing is loaded from another site.

## How to view it

```
cd site && python3 -m http.server 8123
# open http://localhost:8123/
```

Paths are root-relative (`/assets/...`), so serve the folder as the site root. Opening the file directly will not work.

- `shots/home-1280.jpg` and `shots/home-390.jpg` are full-page screenshots.
- `shots/contact.jpg` shows the two side by side.
- `shots/` is for review only. Do not upload it to the host.

## What's here

| File | What it is |
|---|---|
| `index.html` | The page. Sections: hero, what players do, who made it, the app (hidden), safety and privacy for grown-ups, help and reports, footer |
| `404.html` | A friendly "this page has wandered off" page, with the puzzled beagle |
| `config.js` | `PLAY_URL`, and `APP_STORE_URL` (empty for now) |
| `assets/site.js` | Points every `[data-play]` link at `PLAY_URL`. When `APP_STORE_URL` is set, it also shows the app block and the hero's iPhone button. Without JavaScript the links still work, and the app block stays hidden. |
| `assets/site.css`, `assets/fonts.css` | Styles. There are no inline styles or inline scripts anywhere. |
| `assets/ink.css` | Generated. One class per animal, holding its outline colour. Each colour is that animal's darkest fur colour. |
| `assets/img/` | WebP images, each at a 1x and a 2x width, used with `srcset` |
| `assets/fonts/` | Fredoka (600 and 700) and Nunito (400, 700 and 800), copied from `apps/game/public/fonts/` |
| `favicon-32.png`, `apple-touch-icon.png` | Made from the game's paw-heart icon (`arc-logo-icon.png`) |
| `share.jpg` | The 1200x630 social-share image: the summer lawn, the logo, the puppy, the hedgehog and the rabbit |
| `.htaccess` | Security headers, caching, redirects and the 404 page (see below) |

The images, favicons and share image are all rebuilt by:

```
python3 site-directions/_tools/build-assets.py --site
```

The `--site` mode is new. Henry the van is painted in a different style from the animals, so the build now bakes an outline into his image. The outline uses his darkest palette colour (`#4a1c24`, found the same way as the animals' colours). It is 1px at the 1x width and 2px at the 2x width, so it shows as 1px on screen, the same as the animals.

To show the app, set `APP_STORE_URL` in `config.js`, for example to `https://apps.apple.com/app/id6821467142`. There is no Apple badge artwork in the repo, so the button is a plain text button in direction 2's iPhone-app style: an Apple glyph, "iPhone app", and "On the App Store". Swap in Apple's official badge, stored locally, when there is one. With the URL unset, the block is `hidden` and the page closes up around it. I checked this with the URL both set and unset.

## .htaccess

The headers below are tied to the host name `arcgame.app`. If the game's folder sits inside `public_html`, Apache reads this file for the game's requests too, and the strict CSP and caching must not reach the game.

- **CSP:** `default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'`. It also sets `nosniff` and a referrer policy.
- **Caching:** `no-cache` on html. A one-hour cache on images, CSS and fonts.
- **Redirects:** 301s from `arcgame.co.uk`, `www.arcgame.co.uk` and `www.arcgame.app` to `https://arcgame.app`, keeping the path. These are adapted from `tools/site-holding/.htaccess` on `claude/arcgame-hosting`, but without its 302-to-play rule. `/.well-known/` is left alone so certificate checks still work.
- **Also:** `Options -Indexes` and `ErrorDocument 404 /404.html`.

I could not test the `.htaccess` under Apache here, because there is no Apache in this environment. `tools/test-arcgame-htaccess.sh` on `claude/arcgame-hosting` should be pointed at it before deploying.

## Checks run

These ran in headless Chromium at 1280, 768 and 390, with the CSP header injected into every response (`site-directions/_tools/check-site.py`). All pass on `index.html` and `404.html`:

- **No horizontal scroll.**
- **No request leaves the origin,** and no cookies are set.
- **No CSP violations.**
- **All visible text is 16px or more.**
- **No body-text line is longer than 8 words.** The check measures the rendered line boxes. Titles and buttons are excluded.
  - To keep within 8 words, the measure is 29ch, a little tighter than the 40-45ch in the brief, because Nunito's short words fit 9 to 11 to a line at 40ch.
  - The widest body line is about 345px.
- **No title contains a comma.** The check covers `<title>`, h1-h3, fact and worry titles, and `dt`.
- **No banned words.** "children", "gentle", "calm" and "coming soon" appear nowhere in the visible text. "Children" is not used even in the privacy summary.
- **Contrast is AA or better** for every text element against its solid background. This includes the four sticker colours.
- **Every image has real alt text.**

**Page weight at 390** (all files, uncompressed):
- 411KB at 1x.
- 684KB on a 3x phone, because it loads the 2x images.
- 552KB at 768, which loads the 640px oak.

All are well under 1.5MB.

## Claims on the page, checked against `origin/claude/crate-loading` (934557f)

Confirmed in code, so stated plainly:

- **No email address.** Migration `00013_drop_parent_email.sql:35` drops `parent_email_hash`. The signup function never reads an email field.
- **A 4-digit PIN, kept scrambled.** `signup/index.ts:96` checks the 4 digits. `_shared/crypto.ts` hashes the PIN with PBKDF2, 100,000 rounds and a salt.
- **The PIN clue is picked from a list.**
  - The server rejects anything else (`signup/index.ts:112-114`, "Pick one of the clues"), and the database enforces it too (`00010_pin_hint_choice.sql`).
  - The old free-text `pin_hint` column is dropped (`00011`).
  - `get-pin-hint` only returns text from the list.
- **Delete account.** The "Delete this account" button is in `AccountScene.ts:90`. It calls `delete-account`, which needs a session and the PIN, then runs `rpc('delete_account')` (`00015_delete_account.sql`).
  - That removes the player's rows from every table, including the users row.
  - Gifts the player sent are kept but no longer linked to them.
- **No adverts, no analytics and no cookies.** There is no ad, analytics or tracking SDK in any package, and no `document.cookie`.
- **Coins are earned by playing.** There are no in-app purchases (no StoreKit or purchase code).
- **Gameplay.**
  - The right crate matters (`GameScene.ts:617`).
  - The speed camera flashes when the van is too fast for the road (`road-gears.ts:183`).
  - The van has gears (`road-gears.ts`).
  - Hedgehog food is never bread and milk (`packages/game-logic/src/food.ts:38`).
  - There is an adoption office.
- **Friends join by sharing a code.** `add-friend` adds the friend straight away from the code.

Still marked `[check]` on the page:

1. **"A ready-made secret name. Players pick a name from a list."** Only partly confirmed.
   - Both signup screens offer only ready-made names: `signup.html:1618` "Pick a secret name", and `SignupScene.ts:481`.
   - The signup function still accepts a typed name: `signup/index.ts:55` says "Older builds send a typed name without it, and still sign up as before". That name is only checked for letters, length and the blocklist.
   - To confirm, the server should require `readyMadeName`.
   - Also, sign-in still has the player type their secret name (`login.html:1465`). That is fine, but the page doesn't say otherwise.
2. **"Kind notes between friends. Gifts carry ready-made messages."** Only partly confirmed.
   - The gift screen offers preset messages only (`SocialScene.ts:402`), and there is no chat anywhere.
   - But `send-gift/index.ts:32` only checks that the message is a string, with no length limit. `SocialScene.ts:262` then shows the raw code when it isn't on the list, so a modified client could deliver free text.
   - To confirm, the server should check the message against the list.
3. **"Unused accounts go after 3 years."** Not built on this branch. There is no cron or scheduled job, and it is being built on another branch. Remove the `[check]` once it lands.

Also noted, but not claimed on the page:

- **The signup function logs the username** in `audit_log` (`signup/index.ts:315`). Requests are also rate-limited by hashed address.
- **The privacy notice should mention both.** The summary on this page says only "a secret name, a scrambled PIN, game progress and friends".

## Choices made

- **The hero.**
  - The full logo, at up to 520px wide, is the main feature.
  - Under it are Marcus's line "Run your own animal rescue centre for kids big and small" and the PLAY button, with nothing written under the button.
- **Ages.** "Ages 5 to 7 with a grown-up's help", "8 and up on their own" and "Teens and adults welcome too" sit as chips under "What players do in A.R.C.".
- **Positive title.** "A safe and friendly place to play" replaces "What A.R.C. never does". Each item is worded positively ("Free of adverts", "Coins are earned by playing").
- **No scared or squashed animals.**
  - The first card's scared fox is now the sitting fox (`fox-red-sheltered`).
  - The help card's scared terrier is gone.
  - The help section uses the beagle's head-tilt (`dog-beagle-arriving`) as the puzzled face and the hedgehog's raised brow (`hedgehog-brown-arriving`) as the worried one. These are the closest moods in the game's art. There are no dialogue portraits with puzzled or sad faces. "Sick" and "scared" poses exist, but they lie flat or cower, so I left them out. No new art was made.
- **Who made it.**
  - One cat only: the calico asleep on the bench.
  - The tuxedo cat is swapped for a sitting lop rabbit.
  - Everything is sized against the bench, so the beagle, cat and rabbit are in proportion.
  - The copy uses Lily's first name only.
- **Stickers.** The section titles for who made it (coral), the app (sky), safety (honey) and help (leaf) are sticker labels, rotated 1.5-2 degrees. The hover wiggle is turned off under reduced motion.

## Still open

- **The three `[check]` items above.** Fix the code, or change the words.
- **The support pages.** They must exist at `https://support.interfulgent.com/arc`, with a `#reports` anchor for "Make a report", and the privacy notice at `/arc/privacy`.
- **The App Store URL,** once the app is live (id 6821467142). Apple's badge artwork too, if wanted.
- **The logo source is only 512px wide,** so the hero logo is slightly soft on 2x screens above about 260px wide. A larger export of `arc-logo-full.png` would fix this.
- **The `.htaccess` is untested under Apache.**
- **A screen-reader pass on a real device.**
- **Deploying.** This branch does not deploy anything.
