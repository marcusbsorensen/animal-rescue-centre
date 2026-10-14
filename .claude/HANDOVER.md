# A.R.C. — handover 2026-10-14, late evening (paused for the account move)

Marcus paused development at about 21:30 BST on 14 Oct. The work account was
running out of credits, and the work moves to his personal account.

**Older handovers:**
- the driving rebuild of 11–12 Oct: `.claude/handovers/2026-10-12-driving-rebuild.md`;
- the hub session's accounts and hosting handover:
  `.claude/HANDOVER-from-hub-2026-10-14.md` (untracked; read it there);
- older traps: `.claude/handovers/2026-10-10-accumulated.md`.

## Moving accounts
- **Cloud routines:** they belong to the account that created them. On the
  personal account use cloud env **`env_01RvVtM997E4tssn2CkjBiBg`**, as in
  `~/.claude/CLAUDE.md`. The work env `env_01XEuhfALG2Bm8UZiSSGr96Q` and its
  routines stay behind. After creating any routine, strip its connectors with
  `update {clear_mcp_connections:true}` and confirm `[]`.
- **Memory:** it lives on this Mac, in
  `~/.claude/projects/-Users-marcus-Projects-animal-rescue-centre/memory/`, so
  it carries over. Read `MEMORY.md` first.
- **Git and GitHub:** nothing changes (repo `marcusbsorensen/animal-rescue-centre`).

## Goal
1. **One release PR:** `claude/crate-loading` to main, for Marcus to approve. It
   carries the driving spike, the tunnel, the sign and story screens, the fonts,
   the voice booth, accounts, hosting tools and privacy jobs.
2. **The move:** web game to **play.arcgame.app** on 20i (139A), a new website
   at **arcgame.app**, and the "we've moved" page on Vercel.

## Branches
- **`claude/crate-loading`** is at fb2e7d5 (pushed). It includes 00020, a5cc981. Merged into it:
  - the account branches (child-data-gaps, account-deletion PR #24,
    ready-made-names);
  - **131A**, typed-name sign-in on a new device;
  - **hub 96**, names ignore capitals;
  - **130A**, the sign screens: one row of small signs, bigger animals, white
    titles, `e2e/sign-geometry.spec.ts`;
  - the office footer fix;
  - **`claude/arcgame-hosting`**: `tools/deploy-arcgame.sh`, the `.htaccess`
    files, `tools/leak-check.mjs`, `tools/site-holding/`, `tools/vercel-moved/`,
    the prune list (140A), and art and voice caches named by content hash;
  - **`claude/privacy-jobs`**: 00019 retention jobs and `docs/legal/dpia-arc.md`;
  - **`claude/old-client-compat`**: `apps/game/e2e-compat/`. It checks that the
    live Vercel client still works against a new server; rerun it before any
    server deploy.
- **Not merged yet:**
  - **`claude/remove-friend`** (27065b9, 146A): 00021, the `remove-friend` and
    `get-friends` functions and the new friends screen. All tests pass. The copy
    is approved (155A). Merge it.
  - **`claude/arcgame-site`** (4870ef6): the cloud build of the arcgame.app
    website, from direction 2 with Marcus's review changes. Nobody has looked at
    it yet. Fetch it, send `site/shots/contact.jpg` to Marcus, and check
    `site/README.md` for the [check] claims.
  - **`claude/arcgame-site-directions`**: the three mock-ups. Reference only;
    don't merge.

## Production
- **Supabase `bdptplvksniheaqjitek`** (Free plan, Frankfurt):
  - **Applied** on 14 Oct (145B): 00017 and 00018, plus the login, get-pin-hint,
    signup, send-gift, claim-gift and load-game functions from fcd8ebf. This was
    done after the compat check passed.
  - **151A, done 14 Oct about 21:45 BST:**
    - 00019 and 00020 were pushed after a dry run; `migration list` confirms
      both;
    - `cron.job` holds four active jobs, run as postgres, daily: accounts at
      03:10 UTC, showcases at 03:15, audit log at 03:20, rate limits at 03:25;
    - `arc_retention_preview()` showed all zeros;
    - the hub has been told;
    - the first run is 03:10 UTC on 15 Oct, so check
      `cron.job_run_details` afterwards in the dashboard SQL editor.
    - **To fix:** the DPIA's status line still says 00017–00020 are not
      applied. All four are now applied.
  - **152A:** stay on Free. Supabase keeps no backups on Free; Interfulgent's
    nightly encrypted dump to Backblaze is the only one. Free projects pause
    after a week of inactivity, so check after release that it never has.
- **20i:**
  - the play subdomain exists, with its folder `~/play.arcgame.app` beside
    `public_html`;
  - the cert `*.arcgame.app` is valid until 12 Jan 2027;
  - nothing has been uploaded;
  - Force HTTPS is still to switch on, on release day.

## Next steps, in order
1. Check that the first retention run (03:10 UTC, 15 Oct) succeeded.
2. Merge `claude/remove-friend`.
3. **154A (approved; the agent was stopped before it changed anything):** one
   task, starting from remove-friend:
   - hide the empty "Last visit" and "Sprout" labels;
   - add a code box to add friends;
   - rate-limit add-friend per account and per hashed address (migration 00022);
   - move the gift inbox and the friends board to server reads, so gifts arrive.
4. **The chores that never started** (the disk was full):
   - set the moved page's text to: "A.R.C. has moved to play.arcgame.app. Tap 'I
     already have an account', then type the name you sign in with and your
     secret number, and your shelter will be there." Use the game's own labels.
   - change docs naming `vercel.app` to play.arcgame.app, leaving history alone.
     `docs/sprite-brief-2026-08-29.md` is one of them.
   - list any vercel.app URL baked into code.
5. **Website:** review `claude/arcgame-site` with Marcus. When it's approved,
   switch `tools/deploy-arcgame.sh --site` from `tools/site-holding` to `site/`.
6. **The release PR**, crate-loading to main. Then, **only with his go**:
   1. db push for anything pending (00021, 00022), then the function deploys
      (remove-friend, get-friends, add-friend and the gift reads), then run the
      e2e-compat check first;
   2. `tools/deploy-arcgame.sh --game-dir play.arcgame.app --dry-run`, then the
      real run;
   3. press Purge Everything in My20i;
   4. switch on Force HTTPS for both domains;
   5. run the curl checks;
   6. deploy the site, or the holding page, to `public_html`;
   7. Vercel: run `vercel deploy --prod` from `tools/vercel-moved/`, keep it
      about 6 months, then disconnect auto-deploy.
7. **Hub:** message "Interfulgent Hub handover pickup" (local socket
   `uds:/tmp/cc-socks/19597.sock`) when the retention jobs run in production,
   and when play.arcgame.app serves the game over HTTPS. The hub holds the ARC
   privacy page until the first, and switches its links at the second.
8. **iOS:** run `pnpm build:ios` after the merges; Marcus opens it in Xcode.
9. **Later:**
   - the DPIA's 26 [check] items;
   - the restore rule: nothing records which accounts were deleted, so a backup
     restore would bring them back;
   - expired sign-in tokens have no clean-up job;
   - check the canopy on a phone;
   - voice recordings;
   - port the look work to Phaser;
   - the directions-desk spike.

## Marcus's answers this evening
- **139A:** the game at play.arcgame.app; the website at arcgame.app.
- **140A:** prune the dev pages from the web build.
- **142:** direction 2 for the website, with his review, recorded in memory as
  `arc-website-copy`:
  - "players", not children, and no age limit;
  - no commas in titles;
  - short lines;
  - never "gentle" or "calm";
  - no "coming soon".
- **143A:** a wrong name and a wrong PIN keep different replies.
- **144A:** keep the three new sign-in lines.
- **145B:** server changes went live now.
- **146A:** Remove friend.
- **147A:** "3 years after it was last used".
- **148B:** all 20i hosting is one server, so the FlagFans answers apply. Logs
  are kept 12 weeks, CDN logs 7 days.
- **149A:** Supabase plan read from the dashboard: Free.
- **150A, 153A:** disk clean-up. It's now about 48 GB free.
- **151A:** switch on the retention jobs.
- **152A:** stay on Supabase Free.
- **154A:** the friends follow-up.
- **155A:** approve the remove-friend copy.
- **Questions** are numbered up to 155; the next is **156**.

## Rules that bind
- Never push to main, never deploy. Ask Marcus before anything outward-facing.
- **Never ask Marcus to create an account anywhere.** Sign-up tests run on a
  local Supabase only.
- No db push or functions deploy to production without his go. Dry-run first.
- dist must never contain the values of VITE_SUPABASE_SERVICE_ROLE_KEY or
  VITE_ADMIN_PASSWORD. Never print them.
- **Vite on 5173 is Lily's** (preview_start). Never start or stop it.
- **Browsers:** only with 30% or more free memory, in installed Chrome, under a
  3 GB watchdog on the agent's own process tree.
- **Disk:** check `df -h /` before starting agents in worktrees. Each one is about
  1.3 GB. Remove finished worktrees once they're merged.
- **Images:** no external image APIs without asking. Don't touch others' ComfyUI
  jobs.
- Commit by path, with the Co-Authored-By line.
- **Game rules:** for ages 8–9 and up; Fredoka for titles and Nunito for body;
  animals outlined in their own darkest fur colour and sitting in the scene;
  place names allusive only.

## Traps
- **Before deleting a build folder,** check no build uses it. On 14 Oct a
  DerivedData clear removed a running UnCubed build's folder. Gate the delete on
  the check, not just print it.
- **Token-guard hook:**
  - bound grep and cat with `| head`;
  - no `|` inside grep patterns (use `-e`);
  - no raw curl.
- **zsh doesn't word-split `$var`,** so in loops use `eval "$c"`.
- **20i:**
  - its own Apache is untested with our rules. If the site gives a 500, run
    `ssh arcgame 'mv public_html/.htaccess public_html/.htaccess.off'`;
  - it documents no API for the CDN purge, so use the button.
- **The built-in browser pane** pauses animation while it's hidden, and can't
  register service workers. Use Playwright.
