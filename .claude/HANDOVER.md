# A.R.C. — handover 2026-10-14, evening

The previous handover, on the driving rebuild of 11–12 October, is in
`.claude/handovers/2026-10-12-driving-rebuild.md`. The hub session's handover on
accounts and hosting is in `.claude/HANDOVER-from-hub-2026-10-14.md`.

## Goal
1. Ship `claude/crate-loading` to main as **one PR** for Marcus to approve. It
   carries the driving spike, the garden tunnel, the sign and story screens, the
   fonts, the voice booth and the three account branches.
2. Move the web game from Vercel to 20i:
   - the game at **play.arcgame.app** (139A);
   - a new website at **arcgame.app**;
   - arcgame.co.uk 301s to arcgame.app.

## State at 19:35 BST
- **`claude/crate-loading`** is at fcd8ebf (pushed). It has merged
  child-data-gaps, account-deletion (PR #24) and ready-made-names (129A), and
  includes:
  - **131A:** sign in on a new device by typing the name (32848b6);
  - **Hub 96:** names ignore capitals, using migration 00018 (3a29362);
  - the forgot-PIN clue timing fix (957c6cc);
  - the local-stack e2e `e2e/account-local.spec.ts`, which runs only with
    `ARC_E2E_LOCAL_STACK=1`.
- **Production steps** for Marcus's go, run from a checkout of fcd8ebf:
  1. `supabase db push --dry-run`, which should list exactly 00017 and 00018;
  2. `supabase db push`. 00018 stops cleanly if two names differ only in capitals;
  3. `functions deploy login get-pin-hint signup`;
  4. `functions deploy send-gift claim-gift load-game`.
- **Until those steps run**, sign-up on Lily's 5173 can't offer names, because 5173
  points at production.
- **Hub 97:** a wrong name and a wrong PIN still get different replies. Marcus is
  asked to confirm (Q142).
- **`claude/arcgame-hosting`** (61d5db0, worktree agent a866ddfa1e4dd1859):
  - what's there: `tools/deploy-arcgame.sh` (dry run, typed yes, aborts on a
    leak or a broken build), `apps/game/public/.htaccess`,
    `tools/leak-check.mjs`, `tools/vercel-moved/`, and tests for each;
  - the agent was resumed for the follow-up:
    - deploy to the play subdomain as a setting, refusing if the folder is
      missing;
    - `tools/site-holding/`, a 302 from arcgame.app to play.arcgame.app, with
      the co.uk redirect;
    - the moved page linking to play.arcgame.app;
    - **140A:** prune the dev-only pages from the web build, sharing the iOS
      list;
    - the art cache named from a hash of the art.
  - Merge it after the merge agent finishes.
- **Cloud routine `arc-site-directions`** (trig_01HrTrXwntasytsuzcnxf65V) fired at
  17:56Z, with its connectors cleared.
  - It makes three website mock-ups on `claude/arcgame-site-directions`:
    `site-directions/{1-wooden-sign,2-calm-clean,3-map}`, plus `contact.jpg` and
    a README.
  - Check it with list_runs and `git ls-remote`, show `contact.jpg`, and have
    Marcus pick one (138A).
- **The arcgame.app certificate is valid.** It covers arcgame.app and
  `*.arcgame.app` until 12 January 2027.
- **Production Supabase `bdptplvksniheaqjitek`** has migrations up to 00016;
  00017 and 00018 are not applied.

## Website content (134A–138A)
- **Readers:** parents and teachers first (135A).
- **Sections:**
  - what A.R.C. is, with a big Play button;
  - what children do and learn;
  - who made it;
  - safety and privacy;
  - help and reports;
  - the app, coming soon.
- **Who made it (136):**
  - Lily, by first name only; the idea came when she was 7;
  - she "likes to be a red hat tester" (trying to break Daddy and Claude's code);
  - her dad, and Claude Code.
- **Support** links to support.interfulgent.com/arc (137A).
- **Rules:**
  - the game's two faces only;
  - no outside fonts, analytics or cookies;
  - any claim the code doesn't confirm is marked [check].

## Next steps, in order
1. **Merge agent done.** Start two agents on the combined branch:
     - **130A sign layout:** Next and "Already have an account" on one row as
       small signs on the two posts; bigger animals; fit 780x360. The welcome,
       login, signup, menu, friends, forgot-PIN and news screens still have the
       old green titles, and get the white titles and two faces.
     - **133A privacy jobs on the local stack:**
       - delete accounts 3 years after the last sign-in (43A);
       - keep the activity log 2 years (44B);
       - a daily counter clean-up (45A);
       - delete showcase snapshots 30 days after expiry (46B);
       - write `docs/legal/dpia-arc.md`: legitimate interests (39A), with 20i
         as the supplier.
   - Fix the office bug: cards hide under the pinned "Not yet" footer with a
     real roster.
2. **Merge `claude/arcgame-hosting`.**
3. **Saves on the new address:** browsers keep saves per site. On the local stack,
   check what a signed-in player gets back on a new address, then word the
   moved page to match.
4. **Website:** Marcus picks a direction, then build the full site.
5. **Play subdomain:** Marcus adds "play" in My20i. An agent finds its folder
   with a read-only `ssh arcgame ls`.
6. **The PR:** one PR from crate-loading to main for Marcus. Production steps
   follow, **only with his go**:
   1. db push, dry run first;
   2. functions deploy;
   3. `tools/deploy-arcgame.sh --dry-run`, then the real run;
   4. Purge Everything in My20i (no API is documented);
   5. the curl checks in the hosting agent's report.
7. **Vercel:** with his go, run `vercel deploy --prod` from `tools/vercel-moved/`.
   Keep it about 6 months, then disconnect auto-deploy. Update docs that name
   the vercel.app URL.
8. **Hub:** tell the hub session ("Interfulgent Hub handover pickup") when
   play.arcgame.app serves the game over HTTPS.
9. **iOS:** run `pnpm build:ios` after the big merges. Marcus opens it with
   `pnpm --filter @arc/game exec cap open ios`.
10. **Later:**
    - check the canopy on a phone;
    - voice recordings by Marcus and friends, using the booth at
      `/admin/voice-booth.html` (plan in
      `docs/voice-recording-plan-2026-10-14.md`);
    - port the look work to Phaser, including the main game's blue route line;
    - run the directions-desk spike (`docs/directions-desk-2026-10-14.md`) as a
      cloud routine once the strip settles.

## Questions
- Numbered up to **141**. Next is 142.
- Each question has lettered options with the recommendation marked first.
- Visual choices go to Marcus by SendUserFile.

## Rules that bind
- Never push to main, never deploy. Ask Marcus before anything outward-facing.
- **Never ask Marcus to create an account anywhere.** Sign-up tests run on the
  local Supabase only, and nobody creates accounts on production.
- No db push, functions deploy or link to production without his go.
- dist must never contain the values of VITE_SUPABASE_SERVICE_ROLE_KEY or
  VITE_ADMIN_PASSWORD (from the root `.env.local`). Never print them.
- **Vite on 5173 is Lily's** (preview_start serverId 41e34ef8…). Agents never
  start or stop it; use another port for e2e tests.
- **Browsers:** only when free memory is 30% or more, in installed Chrome
  (`channel:'chrome'`), under a 3 GB RSS watchdog on the agent's own process
  tree. Close the browser when done.
- **Images:** no external image APIs without asking. Never reorder or delete
  others' ComfyUI jobs.
- Reference photos stay out of git. Never trace the satellite tile.
- `~/Pictures/iPhone HEIC/`: look only at IMG_9721–9725.
- Downloads need his explicit permission, with filename, source and size.
- Commit by path (never -A) and end with the Co-Authored-By line.
- CLAUDE.md holds credentials (NovoPsych, bank details). Never use them.
- **Game rules:**
  - for 8–9 year olds;
  - names allude to real places and never name them (`docs/naming-places.md`);
  - two faces only: Fredoka for titles, Nunito for body;
  - animals sit in the scene, outlined in their own darkest fur colour.

## Traps
- **Cloud:** the work account's cloud env is `env_01XEuhfALG2Bm8UZiSSGr96Q`.
  After each create, run `update {clear_mcp_connections:true}` and confirm `[]`.
- **Token-guard hook:**
  - bound every grep or cat with `| head`;
  - no `|` inside grep patterns (use `-e`);
  - no raw curl;
  - send an Overpass query with `--data-urlencode data@file`.
- **sips** crops from the centre.
- **Watchdogs** must count only the agent's own process tree; one that counted
  every Chrome killed another agent's browser.
- **Mac stalls** came from Peace Garden's Xcode builds, not Vite. Xcode is capped
  at 4 compile tasks.
- **20i:** its Apache is untested with our rules. If the site gives a 500, run
  `ssh arcgame 'mv public_html/.htaccess public_html/.htaccess.off'`. HTTPS is
  forced by 20i's own switch, not by .htaccess.
- **Hidden browser pane:** the built-in pane pauses animation while hidden, so use
  Playwright for the spike.
- **Cockpit slots:** `cockpit-slots-henry.json` doesn't match the painting, so
  `dashboard.js` measures off the painting.
- **Older traps** are in `.claude/handovers/2026-10-10-accumulated.md`.
