# A.R.C. UI — what is left, ranked

**Written 2026-09-02**, after the chrome surface landed and all twenty
pill titles moved onto it. Successor to `ui-audit-2026-08-31.md`, which
is still the reasoning; this is the queue.

Counts are exact and re-measured today. Judgements are mine.

---

## Where the audit's seven findings actually stand

| | Finding | State |
|---|---|---|
| §1 | Three visual languages | **Half.** Titles and plates are one surface. 57 `createButton` call sites across 24 files, the HUD and the nav bar are still the old languages. |
| §2 | 39 font stacks | **Game side only.** `FONTS.ui` fixed Phaser. The 500 declarations live in `public/admin/`, untouched — and that is where the visible symptom is. |
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

### 1. See the chrome on a device
Everything so far is verified in Chrome at 874x402 and nowhere else.
`FONTS.ui` leads with `ui-rounded`, which is a WebKit generic — if it
resolves differently in the app's WKWebView than in Chrome, **sixteen
screens carry the same mistake**. This is the cheapest way to find out
and the most expensive thing to discover late.

Needs Marcus at the keyboard: `osascript` cannot rotate the simulator.
`VITE_SIDE_RAIL=1 pnpm build:ios`, then Cmd+Left, then re-attach.

### 2. Finish §2 on the DOM screens
The audit's second finding is the one that is still fully open, and its
symptom is the most visible thing in the game: login's "TYPE YOUR NAME"
renders in system sans on a hand-painted plank. 500 `font-family`
declarations across 21 screens resolving to 39 stacks. The fix has the
same shape as the game side — one scale, declared once — and
`_signpost-physics.css` is where it belongs.

Mechanical, highly visible, and it closes a finding rather than halving
one.

### 3. Retire `createButton`'s bevel
57 call sites, 24 files: the largest remaining piece of §1 and the one a
child touches most. Every screen has at least one. A `createChromeButton`
beside the existing chrome helpers, then the same mechanical sweep the
titles just had.

Do it after §2, not before — buttons carry labels, and converting them
twice because the type scale moved would be the third time this project
has paid that particular tax.

### 4. The kitchen's Garden button icon
Renders as two small dots instead of the walk glyph. The nav bar draws
the same `icon-walk` key correctly, so it is `createButton`'s icon
scaling, not a missing texture. Small, real, and a child sees it.

Fold into 3 if 3 happens soon; do it alone if not.

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

- `createPillTitle` has **no callers**. Delete it.
- `createPanel` has 20 call sites left; they want `createChromePlate`.
- `chrome-views` is unmerged.
- The handover still describes the fifteen-view conversion as pending.

## Environment, so it is not rediscovered a third time

- Playwright's bundled browsers do not install on this machine — the
  headless shell stalls and `chromium-1217` is missing its Framework.
  `ARC_BROWSER_CHANNEL=chrome` is the supported way round and works.
- WebGL does not initialise in the Claude browser pane; Phaser sticks in
  BootScene with "Framebuffer status: Incomplete Attachment". Use
  Playwright or the simulator.
- Both of these were already in `.claude/TRAPS.md` and were rediscovered
  the slow way anyway. Read it first.
