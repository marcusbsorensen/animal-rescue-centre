# A.R.C. UI — what is left, ranked

**Written 2026-09-02**, after the chrome surface landed and all twenty
pill titles moved onto it. Successor to `ui-audit-2026-08-31.md`, which
is still the reasoning; this is the queue.

Counts are exact and re-measured today. Judgements are mine.

---

## Where the audit's seven findings actually stand

| | Finding | State |
|---|---|---|
| §1 | Three visual languages | **Most of it.** Titles, plates and all 56 buttons are one surface. The HUD and the nav bar are still the old languages, and DepotScene/SupplyRunScene are held back on decision 1. |
| §2 | 39 font stacks | **Done, and the finding was wrong.** The 24 shipping screens were already consistent; the variance was in two mockups. The real defect was 36 screens fetching four faces from fonts.googleapis.com — IP to Google on cold launch, fallback type offline. All six faces self-hosted, Chalkboard SE dropped so Mac and iPad agree. |
| §3 | Text on painted art | **Two of unknown.** Garden and species room are plated. Nobody has enumerated the rest. |
| §4 | Raw colour literals | **Untouched.** 658 raw `0xRRGGBB` against 287 `COLOURS.` uses — still about 70%. (The audit's 610/276 used a narrower grep; the ratio is what matters.) |
| §5 | Controls at the screen edge | **Rule exists, one user.** `EDGE_CONTROL_INSET` is named and tested; only the garden arrows use it. |
| §6 | Kitchen ignores the play area | **Done.** |
| §7 | Emoji standing in for art | **Untouched.** Needs art, not code. |

---

## Decisions before more code

These are not work items. They change what the work is.

1. **Do Depot and SupplyRun join the game's world, or stay their own?**
   They are deep purple and near-black with neon cards — a *fourth*
   language, not an unconverted third. The audit inferred its findings
   would hold there and they do not. Both read fine as they are, so this
   is a taste call, not a defect: are they deliberately "the grown-up
   logistics bit", or should they warm up to match?

2. **Does `main` deploy, and do you want it to right now?**
   `chrome-views` changes what a child sees on sixteen screens. Nothing
   is behind a flag. Worth knowing before it merges.

3. **The sign fold — sweep or drop?** `d22ef1a` on `side-nav-prototype`
   has been carried for several sessions and touches twelve live DOM
   screens with ten never looked at. It is either an afternoon of
   sweeping or a delete.

---

## The queue

### 1. ~~See the chrome on a device~~ — the font question is answered
**Done 2026-09-02.** `ui-rounded` resolves in the app's WKWebView: 187.86px
against a 178.29px nonexistent-family baseline and 186.12px for plain
`system-ui`. The chrome renders in the rounded face on device, so the
sixteen screens are not carrying a shared mistake.

Two things fell out of the same probe:
- `"SF Pro Rounded"` by name does **not** resolve on iOS — it measures
  identical to a font that does not exist. Harmless, since `ui-rounded`
  precedes it, but it is not doing the work anyone would assume.
- The app's viewport is **874x402**, exactly what the harness shoots at.
  So Chrome captures at that size are geometrically faithful, which is
  what makes the whole capture workflow trustworthy for layout.

**Seen on device 2026-09-02**, iPhone 17 Pro simulator, landscape:
corridor, Dog Room, kitchen and garden all render the chrome surface
correctly in the rounded face. The kitchen's §6 fix is visible — art
stops at the play column instead of running under the rail — and the
garden's arrows sit clear of both edges. Nothing differs from the Chrome
captures, which is the useful result: the harness can be trusted.

Reached by seeding the session with the harness's own `mintRealSession`
into a temporary `public/__devsession.js`, the app-side equivalent of
`installSession`. Probe and seed both reverted; no token was committed.

Two things only the device showed:
- **The animal details card is white glass** with three flat buttons —
  one of the fourteen in-game overlays the audit never covered, and a
  large piece of §1 still outstanding.
- **The kitchen's Garden button icon really is broken**, not a capture
  artefact: two dots where the walk glyph should be. See item 4.

### 2. ~~Finish §2 on the DOM screens~~ — done
**Done 2026-09-02**, and it was not the job the audit described. See
`ca8c4fe` and `18342d9`. Three things worth carrying forward:

- The audit's "500 declarations, 39 stacks" counted two design mockups
  that never mount. The 24 shipping screens shared one value per property.
- The actual defect was the network: 36 screens still linked
  fonts.googleapis.com for Fredoka, Quicksand, Kalam and Gochi Hand, long
  after the canvas stopped. Device IP to Google on every cold launch — the
  Kids Category review risk `fonts.css` already names — and fallback
  typography until the request landed, permanently when offline.
- "TYPE YOUR NAME renders in system sans" was a misreading. It was
  Chalkboard SE, a macOS-only face that never reached the device. Dropped,
  so captures now tell the truth about the shipping typeface.

**Still open here:** the type scale is declared once *per screen* — 23
copies of the same four custom properties. Values agree today; nothing
stops them drifting. Hoisting them into `fonts.css` would make "declared
once" literally true, and is a contained 23-file change.

### 3. ~~Retire `createButton`'s bevel~~ — done, bar two screens
**Done 2026-09-02.** 56 call sites across 22 files, all but the four in
DepotScene and SupplyRunScene, which are the deep-purple screens decision 1
is about. `createButton` stays until those move.

`createChromeButton` carries two weights on one surface — `plate` is the
cream paper, `filled` is the ink and the paper swapped. The dozen
`bgColour`s are gone, and what they carried splits in two: *which button
matters* is now weight, *which button is which* was always the icon and the
label.

The rule the sweep applied, written on `variant` in the source:

- **Plate by default**, on painted art and on bare cream alike. The worry
  that a plate would vanish on the game's own cream was drawn and looked at,
  not argued: a button carries a drop shadow as well as a hairline and reads
  as something raised. The "nearly invisible on flat-cream scenes" note
  further down is about title plates, which have only the hairline.
- **Filled for the one action a screen is for.** Two side by side spends
  the emphasis.
- **Filled throughout on a surface that is already a plate** — the left
  rail, the Games popup, the animal card. A plate there is a frame inside
  a frame.

Three things fell out of it:

- **The icon set has two kinds, and only one survives on paper.**
  `icon-back`, `icon-accept` and `icon-walk` are white line drawings made
  when every button had a dark fill. `iconStyle: 'glyph'` tints them to
  whatever ink the button is already setting its label in, so one asset
  reads dark on the plate and cream on the filled button. The painterly
  icons keep their own colours; tint multiplies, which is right for line
  art and ruinous for anything painted.
- **The Phaser PIN keypads set white type on `#f5efe4` — 1.06:1.** Both
  LoginScene and SignupScene. Behind `USE_OVERLAY = true`, so no child has
  seen it, but it is what renders the day the DOM board fails. Fixed by the
  conversion.
- **`animalCard()` destroys the card it is asked for.** It calls
  `destroyAnimalCard()` and returns a fresh empty container, so reading the
  card through it deletes the card. Cost four blank captures. Read
  `animalCardContainer` instead.

### 4. ~~The kitchen's Garden button icon~~ — done, and it was the asset
**Done 2026-09-02**, and the diagnosis above was wrong twice over.

Not `createButton`'s icon scaling: `icon-walk.png` had 69x34 of drawn
content adrift in a 128x128 frame and off-centre, so scaling the *frame* to
a 24px box drew the paw at 13x6px. Cropped to its content, centred, and
scaled to the ~70% the rest of the set fills.

And not only the kitchen — WalkScene draws the same key on "Let's go!". The
nav bar looked fine because it never draws `icon-walk` at all: `nav-play.png`
exists and wins the fallback chain ahead of it. So "the nav bar draws the
same key correctly" was comparing against something that never ran.

### 5. Sweep the edges with the harness holding it
`EDGE_CONTROL_INSET` exists and one control uses it. `ux-geometry.ts`
already has the predicates and `e2e/ux-review.spec.ts` runs them. Point
them at every scene and fix what falls out. TRAPS.md records three
controls that were unreachable on every viewport for as long as they
existed, so this class does not stay fixed on its own.

### 6. Enumerate the rest of §3
Two instances are plated; nobody knows the denominator. The species room
one had never been *seen* — it took fixing the walk harness to find it.
Now that `ui-audit.spec.ts` and `scene-walk.spec.ts` both pass end to
end, the captures exist to go through.

### 7. Use the palette
658 raw literals against 287 token uses. Invisible individually,
compounding across screens, and entirely mechanical now that `hexNum`
exists to bridge `COLOURS` into the Phaser side.

### 8. Retire the emoji furniture
§7. Needs commissioned art for anything missing, so it is a lead-time
item — worth starting the ask early even though the code is last.

---

## Smaller things, carried

- **The garden's count line** sits at y=95, inside the HUD's second row
  (phase and weather pills, y 78..106), which draws on top of it. Its x
  is fixed. Its y wants deciding with the HUD, not locally.
- **"Garden — Quiet nook" abuts the "0 in care" pill.** Longest title in
  the game against the HUD's 600px-centred gap. The chrome plate is 20px
  narrower than the pill it replaced, so this is better than it was — but
  any longer title collides.
- **LoginScene and SignupScene are converted but unlooked-at.** The walk
  harness starts a scene without `unmountAuth()`, so the DOM sign boards
  sit over them. They are live fallbacks from MainMenuScene and
  ForgotPinScene, not dead code.
- **The chrome plate is nearly invisible on the flat-cream scenes** —
  Account, Friends, Social. Text clears 12.56:1 so nothing is unreadable,
  and strengthening the plate would cost legibility over painted art,
  which is the case it exists for. Understated, not broken. Recorded so
  it is not "discovered" again.

## Housekeeping

- ~~`createPillTitle` has no callers. Delete it.~~ Deleted.
- `createPanel` has 20 call sites left; they want `createChromePlate`.
- `chrome-views` is unmerged.
- `e2e/chrome-buttons.spec.ts` shoots the overlays `ui-audit.spec.ts` never
  opens — the animal card, its More grid, the Games popup. The Phaser login
  keypad in it needs `USE_OVERLAY` flipped to false by hand and skips itself
  otherwise.

## Environment, so it is not rediscovered a third time

- Playwright's bundled browsers do not install on this machine — the
  headless shell stalls and `chromium-1217` is missing its Framework.
  `ARC_BROWSER_CHANNEL=chrome` is the supported way round and works.
- WebGL does not initialise in the Claude browser pane; Phaser sticks in
  BootScene with "Framebuffer status: Incomplete Attachment". Use
  Playwright or the simulator.
- Both of these were already in `.claude/TRAPS.md` and were rediscovered
  the slow way anyway. Read it first.
