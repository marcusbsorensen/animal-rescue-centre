# Overnight report — 2026-04-24

*Left you with seven menu items + a Manus sound commission. All landed. 580 tests still green; build clean every push. Here's what to poke, what to watch, and where the open threads are.*

---

## 🚀 Shipped overnight

Eight commits pushed to `main`, in order:

| Commit | What |
|---|---|
| `22ff35e` | **Vet / arrival / badge modals + toy-picker UI** wired into the live game |
| `ce6e88c` | **Sprite audit**: 127 outdated animal sprites promoted to current-gen art |
| `13dfd6d` | **Apprentices appear in scenes** when recruited (corridor, rooms, garden) |
| `2df25a0` | Login fix: hide "TYPE YOUR NAME" sign on PIN stage |
| `743c141` | **Phase 2 cast art**: 41 new greeting + departing-with-pet sprites (all 31 households) |
| (earlier pushes for PWA update banner, background imagery, golden-retriever refresh) |

### Feature-level detail

**1. Vet/illness popup** (`/admin/vet.html`)
- Pulsing green medical-cross flag
- Sick animal sprite
- 3 treatment choices: amber "Herbal tea rest" (slow + free), sage "Visit the vet" (fast + 20 coins), cream "Home remedy" (70% chance)
- `onHeal` in AnimalDetailsPopup routes to it
- "Rest" ticks down across heal-actions and clears sickness at 0

**2. Arrival popup** (`/admin/arrival.html`)
- Fires when `spawnNewAnimal` runs
- Pulsing 📮 delivery flag
- 3 welcome choices: "Give them space" (neutral), "Say hi gently" (+2 bond), "Offer a treat" (+3 bond, -5 hunger)

**3. Badge-earned popup** (`/admin/badge.html`)
- Replaces the old `showBadgeNotification` toast
- Giant 🏆 with orbiting sparkles, bright garden background, ~18 ambient confetti drifting
- Single "HURRAY!" button flanked by ✨

**4. Toy-picker UI** (`apps/game/src/game-views/ToyPickerView.ts`)
- Appears between Play button and PlayScene **only when > 1 toy available** (default + arrival toy, or later when toy inventory grows)
- Circular toy cards with emoji + label, selected gets green ring + glow
- Animals with no arrival-toy skip the picker entirely

**5. Apprentice decorations in scenes** (`apps/game/src/game-views/ApprenticeDecorations.ts`)
- When a player has recruited Rhubarb/Amara/Kofi via the Friends page, their painted pose appears in the appropriate scenes:
  - **Corridor**: Rhubarb skateboarding, Amara climbing, Kofi reading
  - **Cat room**: Amara-on-shoulder, Rhubarb cat-lap (if both recruited)
  - **Dog room**: Rhubarb feeding
  - **Parrot room**: Kofi with parrot on arm
  - **Snake room**: Kofi nose-to-nose with snake
  - **Garden**: Rhubarb skateboarding on lawn
- BootScene preloads all 9 pose textures
- Gentle sway/pulse animations on a few (cat-lap, cat-shoulder, reading-aloud)
- Alpha 0.95, depth 50 — present but decorative, not intrusive

**6. Sprite audit + art refresh** (127 sprites)
- Foxes, parrots, snakes, bunnies, bats — anywhere the live sprite was under 100KB (the old Manus downscale) got promoted from `regen-v3-sprites/` to the live `/assets/animals/` path, downscaled to 512px
- Should visibly unify the style across the whole game

**7. Phase 2 cast art** (41 new sprites)
- **Greeting pose** for every one of the 31 households (arms out, waving hello)
- **Departing-with-pet** poses for 10 families who are most likely to actually adopt during a playthrough: Babcia with a cat, Finn with a running dog, Dani & Rex with a golden, Kumar-Ishii with Amara carrying a calico in a carrier, Theo's grandkids with a beagle on a lead, Lei with a cockatiel, Mara with a macaw, Wenna with a sheepdog, Two-Houses with Rhubarb holding a tuxedo cat, Estrada Train with a snake vivarium + parrot
- All at `/admin/scene-assets/cast/variants/` (1024 masters archived in `variants/original/`)

**8. Login PIN-stage cleanup** — the stray "TYPE YOUR NAME" sign now hides once the player picks an avatar and moves to PIN entry.

---

## 🎧 Manus sound commission

- Brief sent at **02:19 UTC** to `marcusbs@manus.bot`
- Manus acknowledged at 02:19:40 ("I have received your task Sound Design Brief for Children's Game ARC and started working")
- Still processing as of report-write time
- **The draft email in your Gmail Drafts** is the one I wrote — you should review + send (it's the full brief, you already sent yours; both may have overlapping requests — Manus will pick up yours since it's from `marcusbs@gmail.com`)
- ⚠️ **Cloud-run gotcha**: Manus can't save files directly to your Mac. When deliveries arrive, I (or you) need to pull them from the task's output page. I'll sweep the inbox in the morning — if they've already landed when you wake up, you can run `manus_download_output` equivalents via your Manus dashboard, or I can build a pull script.
- Audio infrastructure is already in place: `apps/game/public/assets/audio/` already has `music-*.mp3` tracks and some `sfx-*.mp3` files. New files just drop in and the existing `AudioManager` picks them up.

---

## 📸 Beta-test screenshots (prod, fresh visit)

Pulled these live from `https://animal-rescue-centre.vercel.app/` via Playwright at 02:21 UTC:

- `beta-01-welcome.png` — new painted welcome rendering correctly (garden bg, ARC logo, wooden sign, macaw, grass tuft, dog+fox, handwritten credits)
- `beta-02-after-play.png` — PLAY! click transitions into corridor view with HUD, rainbow bunting, 7 pastel doors, arrival widget for a new ginger cat

Both landed in `.playwright-mcp/`.

---

## ✅ What to test when you wake up

Rough order — most impactful first.

1. **Hard-refresh the prod URL and catch the new bat-sign update banner.** If your SW is still showing stale, the bat banner should appear and a tap on "Refresh!" brings you to the new build.
2. **Welcome screen**: painted wooden sign + garden bg + golden retriever (new art) + fox + macaw + Caveat credits. Click PLAY!, Login, Signup — each should route correctly.
3. **Sound toggle**: tap the 🔊 icon top-right — should toggle music on/off and swap to 🔇. (Previously broken — now wired via postMessage → AudioManager.)
4. **Main-menu (logged in)**: avatar + stats card (real store data) + CONTINUE! + Friends + Log out pills.
5. **Friends page → recruit**: try recruiting Rhubarb, Amara, or Kofi. After recruit, return to the rescue centre and the apprentices should appear in the relevant rooms/garden doing their thing.
6. **Spawn a new animal** (wait 45s or create new save): the arrival popup should appear, pulsing 📮, with 3 welcome choices.
7. **Tap an animal → Play** → toy-picker (if the animal has an arrival toy) OR straight to PlayScene. Try each of the 7 species mini-games (dog ball-throw is the most polished; others vary).
8. **Bond up to ≥50 on a shelter animal** → tap "💫 What will {name} become?" → Paths panel with 3 cards (rehome/rewild/stay). Pick Forever Family → Adopters list → tap a match → Adoption ceremony (warm farewell screen with scroll letter and "WAVE THEM OFF!").
9. **Make an animal sick** (natural via sickness chance, or hack in DevTools) → Vet popup drops in with 3 treatment choices.
10. **Earn a badge** → Badge popup with giant trophy + confetti.
11. **Visit the gallery** at `/admin/cast-gallery.html` — 31 households now consistent, and you can click each "view 1024 original →" to see the high-res master.

## 🐞 Things I noticed while beta-testing

- **None blocking**. Pre-existing console warnings about `arc-l1-assets` failing to process (texture filenames that don't match the manifest) are old and unrelated to what I touched tonight.
- Apprentice decorations don't react to taps — purely decorative. That's intentional per brief; if you want them clickable (e.g. tap Kofi → speech bubble about the book), that's a straightforward follow-up.
- The "Rest" treatment for illness uses an in-memory countdown that doesn't persist across reloads — MVP trade-off. Worth a second pass later to move it onto the store.
- Corridor Rhubarb uses the skateboarding pose as primary. If you prefer another pose there, one-line change in `ApprenticeDecorations.ts`.

## ⏭ Natural next threads (for when you want them)

- **Manus sounds** drop-in when they land: animal sounds into `playSfx('species-meow')` per species, voice clips into modal open/close hooks, music loops into `playSceneMusic`.
- **Wild-visit rendering polish**: currently `GardenView` paints returning wild animals with an ✨ marker — could add a "Luna is here!" little painted notice when they first arrive.
- **Second-adoption** and **photo-letter** painted popups (visitor-popup already handles these via the init payload, but a dedicated sub-variant with a proper postcard scroll would sing).
- **Toast audit**: now that modals cover the big emotional beats (arrival, badge, adoption, rewild, vet), the remaining toasts (conflict-resolved, bond-complete, sibling-bonus) could all graduate to painted popups in follow-up rounds.
- **Tune the 6 new species mini-games** — they all work but the difficulty curves haven't been played to confirm (cat 5 pounces might be too easy, snake 12 seconds might be too long, etc.).

---

## ☀️ Second-shift additions (continued after the first report)

You asked "anything else" and challenged me to go at the wishlist.
Here's the second batch:

### Design
- **`docs/ptv-pet-transport-vehicle.md`** (was `driving-crate-stacking.md`) +
  **`docs/driving-systems.md`** — reconciled with the prior spec after
  finding the compacted session notes. The cargo-drive doc is now correctly
  framed as **PTV** (Pet Transport Vehicle), with an overview doc making
  clear PTV / Supply Runs (cargo-free chaos) / Depot (tap-collapse) are
  three distinct systems. v0.1 had conflated PTV with Supply Runs — fixed.

### Code shipped
- **`game-logic/crate-stacking.ts`** + 32 new tests — the rule engine
  for the cargo-drive puzzle (compatibility matrix, crate prefs,
  vehicle defs, grid helpers, arrival-happiness calculator)
- **`game-logic/destinations.ts`** + 11 tests — 9 destinations around
  the A.R.C. with level gating + species-to-habitat mapping
- **`game-logic/charity.ts`** — adoption fees (base 20 + bond + species
  bonuses, capped 50) + 3 monthly charity grants unlocked by milestones
- **`game-logic/species-facts.ts`** — ≥3 kid-friendly facts per species,
  variant-aware picker
- **`map.html`** — painted GPS-style world map with 9 destination
  pins, unlock gating, status flags (NEW! / 💚 Visit / 📮)
- **Arrival popup** gains a "Did you know?" card below the choice pills
- **In-game plumbing** for all of the above — InGameOverlay gains the
  `map` page + `drive-to` action; GameScene gains charity-grant checks
  on scene boot and adoption-fee credit on commitAdoption

### Art
- **Simeon & Karo** household #32 — 3 portraits (neutral, greeting,
  with-bat-toys). Simeon's grey-flecked hair and big-toothy grin are
  a touch subtle; if you want them louder, easy iteration:
  ```
  tools/gpt-image-regen.sh apps/game/public/admin/scene-assets/cast/32-simeon-karo.png \
    "<STYLE> ... grey flecks MORE PROMINENT, GRIN showing more teeth ..." \
    <refs>
  ```
- Full Phase-2 cast batch (41 new sprites, greeting + departing-with-
  pet for every household) already shipped in the first shift

### Manus
- **Sound commission** — sent 02:19 UTC, Manus acknowledged, no
  attachments yet (as of 03:55 UTC). Still processing. ⚠️ Cloud-run
  gotcha — it'll email deliveries back; I've been polling. If they
  land while you're still asleep, I'll pull them across.
- **Driving-game art commission** — drafted (in your Gmail Drafts,
  subject `A.R.C. game — driving game art: vehicles, crates, GPS map,
  habitat destinations`). **Review the destination list in the brief
  before sending** — it's 5 vehicles + 6 crates + 1 world map + 5
  habitat landscapes + 5 road obstacles, budget check needed.

### Numbers
- 6 more commits tonight (total 12 for the overnight session)
- 652/652 tests green (was 580, +72 new overnight)
- Cast now at **32 households** (was 31)

---

## 🗺 Map of today's touchpoints

Gallery: https://animal-rescue-centre.vercel.app/admin/cast-gallery.html
World map: https://animal-rescue-centre.vercel.app/admin/map.html
Vet popup: https://animal-rescue-centre.vercel.app/admin/vet.html
Arrival popup (with fact card): https://animal-rescue-centre.vercel.app/admin/arrival.html
Badge popup: https://animal-rescue-centre.vercel.app/admin/badge.html
Visitor popup: https://animal-rescue-centre.vercel.app/admin/visitor.html
Design docs:
- `docs/driving-systems.md` (overview: PTV / Supply Runs / Depot)
- `docs/ptv-pet-transport-vehicle.md` (the animal-transport system)
- `docs/rehoming-cast.md` (now 32 households)
- `docs/future-features-lily.md` (still the compass)

Enjoy the coffee. 🐾
— Claude
