# Data Protection Impact Assessment: Animal Rescue Centre – ARC (draft)

**A draft for Marcus to review. It is not legal advice.** Each claim that this repository's code does not confirm is marked **[check]**. Section numbers follow the FlagFans DPIA (`flagfans/docs/legal/dpia-young-explorers.md`, the ICO template in seven steps), so the hub's rows in `interfulgent-hub/docs/dpia-arc-hub-rows.md` can be applied by number.

Written 14 October 2026 against branch `claude/privacy-jobs`, built on `claude/crate-loading` (934557f). Nothing on that line is merged or deployed. Production Supabase has migrations up to 00016; 00017 to 00019 are not applied.

## Step 1: Why a DPIA

ARC is a game for children of 8 and 9, and it treats every player as a child. Children make their own accounts, keep a shelter on a server, add friends, send gifts and share showcases. Processing children's data in an online service needs a DPIA under the Children's Code.

The controller is Interfulgent Limited (company 12716399, ICO registration ZB255064) **[check: from the hub's privacy notes, section 4a; the ICO entry expires on 28 October 2026 and still shows the old address]**.

## Step 2: The processing

### 2.1 Lawful basis (39A, 40A)

Legitimate interests (UK GDPR Art 6(1)(f)) for all three purposes: running the game, keeping it safe, and answering grown-ups. Consent is not relied on, so no parent's permission is asked for when a child under 13 signs up, and Art 8 does not apply. The balancing test is in section 4.1.

### 2.2 What is held

#### On the server (Supabase), after migrations 00001 to 00019

| Table | What it holds | Notes |
|---|---|---|
| `users` | Sign-in name (`username`, and `username_lower`, the same in small letters); PIN hash (PBKDF2, salted); a PIN clue code from a fixed list of six (`pin_hint_code`); avatar emoji and colour; display name made from two word lists (e.g. MossyOtter); join code (e.g. FOX-428); `created_at`; `last_seen_at`; `is_active` | Since 00017 a new sign-in name is picked from three ready-made pairs of things (e.g. PebbleKite), never an animal. Accounts made before that keep the name the child typed, often a real name. No email, age, date of birth or location column exists (`privacy-audit.test.ts`) |
| `sessions` | Sign-in tokens: token, account, made, last used, expires (90 days after it was made, fixed) | |
| `game_states` | The saved shelter (`state`, JSON up to 1 MB): animals and the names a child gives them, coins, badges, decorations, progress, the days played; level; version | Pet names are checked in the game's page only, not on the server **[check: finding G11 in the hub notes is still open]** |
| `rescue_stats` | Counts: animals rescued by kind, badges, gifts sent and received | |
| `badges_earned` | Badge codes and when earned | Read by `create-showcase` and the admin page; no function in this repository writes it **[check]** |
| `friendships` | Pairs of account ids, two rows per friendship, and when | |
| `gifts` | Sender, receiver, gift kind, a message code from a list, sent and claimed times | `send-gift` accepts any message string; the game offers a fixed list **[check: G8]**. `gift_data` is never written |
| `showcase_links` | Token, account, a snapshot (display name, avatar, level, rescued count, each pet's name, kind and collar colour, badges), made, expires (7 days), views | Anyone with the code can open one through `get-showcase` |
| `audit_log` | Account, action, target, details, time. `signup` holds the sign-in name; `friend_added` the friend's join code; `gift_sent`, `gift_claimed` the gift id and sender; `showcase_created` the token; `account_deleted` counts only | |
| `rate_limits` | Counters: `login:<name>` and `hint:<name>` (the sign-in name in small letters), `gift:<id>`, `gift-pair:<id>:<id>`, `delete-account:<id>`, and address counters keyed by an HMAC of the address, never the address | Windows of 15 minutes to 24 hours |
| `username_pool` | Ready-made sign-in names; for a claimed one, the account that took it | The public key reads none of it (00017) |
| `username_pending_review` | Candidate pool names for the admin page | No child data |
| `depot_sessions`, `supply_run_records`, `depot_inventory_ledger` | Depot and supply-run history per account | Nothing in this repository writes them **[check: empty in production]** |
| `calendar_events` | Game calendar | No personal data |

The public key can read only `users.id`, `display_name`, `avatar_emoji` and `avatar_bg_colour` (00016). It cannot call `delete_account`, the rate-limit functions, the sign-in-name functions or the retention jobs: each is revoked from it, and tests check that. Marcus's admin page (`apps/admin`) reads every table with the service-role key and is built only for his own computer (`ARC_ADMIN_LOCAL_BUILD=1`; the build refuses otherwise) **[check: never deployed]**.

#### On the device, per site (browser) or per app

| Key | What it holds |
|---|---|
| `arc_session` (localStorage) | The sign-in token, account id, sign-in name, display name, avatar, join code |
| `arc_remembered_usernames` | Up to 10 sign-in names used on this device |
| `arc-save` (IndexedDB) | Per account: the latest snapshot, the last state the server confirmed, and any copy a conflict handed back |
| `arc-signup-draft` | Set-up choices while a child signs up, including the PIN in plain text; removed at the end and after 7 days **[check: open item 9]** |
| `arc-audio-prefs`, `arc_motion`, `arc_side_rail`, `arc_skip_intro`, `arc_intro_played`, `arc_guide_line` | Settings |
| Service-worker caches | The game's own files |

#### Retention (43A, 44B, 45A, 46B), built in migration 00019

| What | Kept until | Job |
|---|---|---|
| An account and everything of the child's | 3 years after the account was last used, with no warning (no contact is held) | `arc_retention_accounts`, through `delete_account`: the same one-transaction deletion as the in-game button |
| An activity-log entry | 2 years after it was made | `arc_retention_audit_log` |
| A rate-limit counter | 1 day after its window closed | `arc_retention_rate_limits` |
| A showcase and its snapshot | 30 days after the link stopped working (a link works 7 days) | `arc_retention_showcases` |
| A sign-in token | 90 days after it was made; then it no longer works. The row goes when the same player signs in again, or with the account | No job of its own **[check: decide whether expired tokens need one]** |
| The copy on a device | Until the app is deleted, the site's data is cleared, or the account is deleted in the game on that device | None: the device's |
| Supabase backups and function logs | Supabase's schedule | **[check: the plan, the backup retention and the log retention]** |
| 20i's web-server access logs for the game's site | 20i's setting for the package | **[check: read off the 20i panel]** |

"Last used" is the later of the last sign-in (`users.last_seen_at`, moved by signup, login and save-game) and the last request made with one of the account's tokens (`sessions.last_used_at`); an account with neither counts from when it was made. As a token lasts 90 days, an account goes 3 years after the last sign-in at the earliest, and up to 90 days after that. The privacy page says "3 years after the last sign-in" **[check: keep that wording, or say "3 years after it was last used"]**.

Each job deletes one bounded batch per daily run, oldest first, and is safe to run twice or twice at once. Tests: `packages/edge-functions/src/__tests__/retention-db.test.ts` (each limit a day either side) and the retention section of `packages/game-logic/src/__tests__/privacy-audit.test.ts`. The jobs are not scheduled until Marcus switches them on (section 7.1).

**[check: why 3 years and 2 years.]** FlagFans records its reasons in its section 2.2.1; this DPIA should record Marcus's in the same way.

### 2.3 Context

The players are children, most of them 8 or 9, who play on a family iPad, a phone or a computer. No parent's details are held, so nobody can be told about an action on a child's account (risk RH3 in the hub rows). A child cannot type a message to another player. The only words a child types that another player can read are pet names on a showcase.

### 2.4 Purposes

1. Run the game: sign in, keep the shelter across devices, friends, gifts and showcases.
2. Keep it safe: limit guessing and flooding, and look into a grown-up's report.
3. Answer a grown-up who writes through the help page (the hub; see its rows).

### 2.6 Processors and other recipients

| Supplier | What it handles | Where | Safeguard |
|---|---|---|---|
| Supabase | Every server table in 2.2, sign-in tokens, backups, Edge Function logs | **[check: region, from Project settings > Infrastructure]** | Supabase Inc. is a US company: the UK Addendum to the EU standard contractual clauses in its DPA **[check: the accepted DPA is on file]** |
| 20i | The game's files at `play.arcgame.app` and the website at `arcgame.app`; the internet address of each device that loads them. No accounts or saved games | UK **[check: the data centre, from the 20i panel]** | UK company; no transfer **[check: DPA or the GDPR annex on file]** |
| Vercel (retiring) | Served the web game until the move. For about 6 months after it (89A) it serves only the "we've moved" page, and handles the internet address of each visit to the old address | **[check]** | **[check: DPA; and when the project is deleted]** |

The game itself calls only its own files and the Supabase functions: no adverts, analytics or outside fonts **[check: true of the release build, as of the hub's survey]**. The help page's suppliers (20i for the hub, Resend for replies) are in the hub's rows.

### 2.7 Findings

The hub's rows list findings 1 to 8 and items 1 to 10 (`dpia-arc-hub-rows.md`, sections 3 and 6). This branch adds:

| # | Finding | Status |
|---|---|---|
| 9 | No job deleted old accounts, old log entries, closed counters or expired showcases (G4) | Fixed in code (00019). Open until 00019 is pushed and the schedule is switched on (7.1) |
| 10 | Expired sign-in tokens stay until the same player signs in again, or the account goes | Open: no decision yet |
| 11 | The privacy page still describes a typed sign-in name ("letters only, 2 to 18"); new accounts now pick a ready-made one (00017) | Open: the hub session updates the page when 00017 is live **[check]** |

## Step 3: Consultation

**[check: whom Marcus consulted, and Lily's red-hat testing if it is to be recorded.]**

## Step 4: Necessity and proportionality

### 4.1 Legitimate interests: the balancing test (39A)

- **Purpose.** A child who plays expects the game to keep her shelter, let her play with friends, keep her account from being guessed, and answer her grown-up. Without the account, the save and the counters the game cannot do those things.
- **Necessity.** The game asks a child for no email, age, school, location or real name. A new sign-in name is picked, not typed. The PIN clue is picked from a list. Other players see a made-up display name. Addresses are kept only as a keyed hash. Counters last a day after their window. A showcase lasts 7 days and its snapshot 30 days after that.
- **Balance.** These are children, so their interests weigh heavily (the Children's Code best-interests standard). Against that:
  - nothing is used for adverts, profiling or analytics;
  - a child cannot message another;
  - an account is deleted 3 years after it was last used, and a child can delete it herself in the game;
  - the activity log, which can hold a typed sign-in name from an older account, goes after 2 years.

  The remaining risks are a typed pet name on a showcase that anyone with the code can open, and older accounts' typed sign-in names in the log and the name counters.
- **Outcome.** Legitimate interests are a fair basis for the three purposes, with the measures above **[check: Marcus's conclusion and sign-off]**.

### 4.6 Rights and deletion

- **Delete this account, in the game.** On the account screen (tap the level circle), "Delete this account", then "Delete it", then the account's PIN. The `delete-account` Edge Function takes the account from the session, checks the PIN (five tries per 15 minutes), and calls `delete_account`. That removes, in one transaction: the account, sessions, saved game, counts, badges, both rows of each friendship, gifts received, showcases, depot history, the account's activity-log rows and other players' rows that name it, and its counters. Gifts it sent stay with the receiver without the sender. Its pool name is freed. One `account_deleted` line keeps counts only. The device then forgets the session, the name in the list, the sign-up draft and the account's saved copies (`docs/account-deletion.md`).
- **Through the help page** (47A, 48A): a grown-up writes with an email address and the friend code, display name, level and picture. Marcus replies to confirm, then deletes within 14 days of the confirmation and never later than a month after the request **[check: the steps Marcus runs to delete by hand. The code supports `select delete_account('<id>')` in the SQL editor, with the id found by join code]**.
- **Other rights** (access, correction, restriction, objection, portability) go through the help page, with a reply within a month **[check: how an access request is answered; nothing in the code exports an account's data]**. As the basis is legitimate interests, the right to object (Art 21) applies.

### 4.7 Moving the web game to a new address

The web game moves from the Vercel address to `play.arcgame.app`. A browser keeps storage per site, so on the new address a child must sign in again, and only what reached the server comes back. This was checked on a local stack on 14 October 2026 (`apps/game/e2e/new-address-local.spec.ts`).

- **Comes back:** the shelter as last confirmed by the server.
- **Stays on the old address:**
  - the sign-in token;
  - the saved names;
  - the settings;
  - any change saved while offline and never sent.

A child needs her sign-in name and PIN. On the new address the big PLAY sign opens sign-up, because no names are saved there. The child should choose "I already have an account".

## Step 5: Risks (additions)

| # | Risk | Likelihood | Severity | Overall |
|---|---|---|---|---|
| R-ret1 | A retention job stops running and data is kept past the stated period | Possible | Significant | Medium |
| R-ret2 | An account a child still means to use is deleted after 3 years without warning | Remote | Significant | Medium |
| R-move1 | On the new address a child makes a second account instead of signing in, or loses an offline change | Possible | Minimal | Low |

**[check: the scores; these are suggestions.]**

## Step 6: Measures

| # | Measure | Effect | Residual |
|---|---|---|---|
| R-ret1 | The four jobs are separate pg_cron jobs, so a failure is reported against one of them in `cron.job_run_details`. The account job raises an error when no account in a batch could be deleted. `arc_retention_preview()` shows what is overdue. A tested check reads the periods (`privacy-audit.test.ts`) | Reduced | Low **[check: who looks at the job history, and how often]** |
| R-ret2 | 3 years counts from the last use, not only the last sign-in. A child's own play keeps the account. No contact is held to warn anyone, which the privacy page says | Accepted **[check]** | |
| R-move1 | The moved page tells the child to choose "I already have an account" and to have her name and number ready | Reduced | Low |

## Step 7: Sign-off

### 7.1 Switching the jobs on

None of these has been run against production.

1. **Dry run of the push.** From a checkout of the merged commit, run `supabase db push --dry-run`. It should list exactly 00017, 00018 and 00019, or only 00019 if the other two are already applied.
2. **Push.** `supabase db push`. 00019 deletes nothing as it runs; it adds functions and two indexes. Then follow 00017 and 00018's own function deploys.
3. **Dry run of the jobs.** In the SQL editor, run `select arc_retention_preview();`. It counts what each job would delete and changes nothing. Production's accounts and log entries are all younger than their limits, so expect 0 for both. Expect a number for rate limits, and for any showcase that expired over 30 days ago.
4. **One run by hand.** `select arc_retention_run();`. The counts should match step 3.
5. **Enable pg_cron.** Dashboard > Database > Extensions > `pg_cron` **[check: the place in the current dashboard; it may be under Integrations > Cron]**.
6. **Schedule.** `select arc_retention_schedule();`. It returns four lines, daily from 03:10 UTC. Running it again changes nothing.
7. **Check the next day.** Run `select j.jobname, d.status, d.start_time from cron.job_run_details d join cron.job j using (jobid) where j.jobname like 'arc-retention-%' order by d.start_time desc limit 8;`. All four should show `succeeded`.

To switch the jobs off, run `select arc_retention_unschedule();`. Without pg_cron, a daily call to `rpc/arc_retention_run` with the service-role key would do the same; nothing for that is built.

### 7.3 Declaration

Approved by: ______  Date: ______
