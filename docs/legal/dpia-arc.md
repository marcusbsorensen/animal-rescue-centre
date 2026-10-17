# Data Protection Impact Assessment: Animal Rescue Centre – ARC (draft)

**A draft for Marcus to review. It is not legal advice.** Each claim that this repository's code or the sourced research does not confirm is an open item: bold, in square brackets, starting with the word check. A search for that opening bracket with the word check lists every open item. Section numbers follow the FlagFans DPIA (`flagfans/docs/legal/dpia-young-explorers.md`, the ICO template in seven steps), so the hub's rows in `interfulgent-hub/docs/dpia-arc-hub-rows.md` can be applied by number.

Written 14 October 2026 against branch `claude/privacy-jobs`, built on `claude/crate-loading` (934557f). Nothing on that line is merged or deployed. Production Supabase has migrations up to 00016; 00017 to 00020 are not applied.

Updated the same day with research the first draft missed: the Supabase region, Interfulgent's own encrypted backups of ARC's database, and 20i's answers to FlagFans' support tickets #497585008 and #497653007. Updated again with Marcus's answers 147A (an account goes 3 years after it was last used) and 148B (all his 20i hosting is on one account and one virtual server). Updated again with answer 151A (migration 00020 switches the retention jobs on) and with the Supabase plan, its backups and its log retention, read from the Supabase dashboard and Supabase's website on 14 October 2026. The sources are named where each fact is used.

## Step 1: Why a DPIA

ARC is a game for children of 8 and 9, and it treats every player as a child. Children make their own accounts, keep a shelter on a server, add friends, send gifts and share showcases. Processing children's data in an online service needs a DPIA under the Children's Code.

The controller is Interfulgent Limited, company number 12716399 (private limited company, incorporated 3 July 2020, active), registered office 167-169 Great Portland Street, 5th Floor, London W1W 5PF. Its ICO registration is ZB255064 (tier 1, registered 29 October 2021). Source: Companies House and the ICO register of data protection fee payers, read on 13 October 2026 (the hub's privacy notes, `interfulgent-hub/docs/privacy-arc-dashlit-notes.md`, section 4a, lines 114 to 127). The match to the ICO entry rests on the exact name, a registration date after incorporation and the company's former registered office.

**Action for Marcus, before 28 October 2026:** the ICO registration expires on 28 October 2026, and the ICO entry still holds the old address (First Floor, 85 Great Portland Street, London W1W 7LT; the registered office moved on 23 March 2026). Renew the registration and change the address on the ICO's side. Until then the number printed on the privacy pages lapses.

## Step 2: The processing

### 2.1 Lawful basis (39A, 40A)

Legitimate interests (UK GDPR Art 6(1)(f)) for all three purposes: running the game, keeping it safe, and answering grown-ups. Consent is not relied on, so no parent's permission is asked for when a child under 13 signs up, and Art 8 does not apply. The balancing test is in section 4.1.

### 2.2 What is held

#### On the server (Supabase), after migrations 00001 to 00020

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
| `cron.job`, `cron.job_run_details` | pg_cron's own tables (00020): the four retention jobs, and a line for each run with its time, result and message | No personal data: the jobs' messages hold counts, never an id or a name (00019). pg_cron keeps the run lines until someone deletes them, about 1,500 a year |

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

#### Copies Interfulgent makes outside Supabase

Every night at 03:30, a job on Marcus's Mac (`interfulgent-backup`, run by launchd) dumps ARC's whole Supabase database with `supabase db dump --linked`: schema, data and roles. The dump holds every table in the list above, including PIN hashes, the sign-in names older accounts typed, and the activity log. The job packs it, encrypts it with `age` on the Mac, and keeps the result in two places:

1. A local folder on Marcus's Mac, `~/Backups/Interfulgent/arc/<date>/` (mode 700, synced by no cloud service; FileVault is on).
2. Backblaze B2, EU Central (Amsterdam): a private bucket with server-side encryption and Object Lock in compliance mode. Backblaze receives ciphertext only and holds no key. The private key is `~/.config/interfulgent-backup/key.txt`, with a copy in Marcus's password manager and a printed copy offline.

The job's log shows ARC's dump and its upload both succeeding on 12, 13 and 14 October 2026 (`~/Library/Logs/interfulgent-backup.log`). Source for the design: `interfulgent-backup/README.md` (lines 18, 28, 36, 52 to 64) and `interfulgent-backup/docs/restore.md`; the same design is described for FlagFans in `flagfans/docs/legal/dpia-young-explorers.md` (line 164).

Until 9 October 2026 a copy of the nightly dumps also went to Dropbox (a personal plan with no data processing contract); the job stopped writing there on 9 October. The FlagFans DPIA records 34 age-encrypted files left in the Dropbox folder, which nothing rotates or removes. **[check: whether any of those 34 files hold ARC dumps. If they do, a deletion cannot reach them and they have no end date]**

#### Retention (43A as changed by 147A, 44B, 45A, 46B), built in migration 00019 and switched on by 00020 (151A)

| What | Kept until | Job |
|---|---|---|
| An account and everything of the child's | 3 years after the account was last used (147A, 14 October 2026), with no warning (no contact is held). "Last used" is the later of the last sign-in and the last request made with one of the account's sign-in tokens | `arc_retention_accounts`, through `delete_account`: the same one-transaction deletion as the in-game button |
| An activity-log entry | 2 years after it was made | `arc_retention_audit_log` |
| A rate-limit counter | 1 day after its window closed | `arc_retention_rate_limits` |
| A showcase and its snapshot | 30 days after the link stopped working (a link works 7 days) | `arc_retention_showcases` |
| A sign-in token | 90 days after it was made; then it no longer works. The row goes when the same player signs in again, or with the account | No job of its own **[check: decide whether expired tokens need one]** |
| The copy on a device | Until the app is deleted, the site's data is cleared, or the account is deleted in the game on that device | None: the device's |
| Supabase backups | None. The `arc` project is on the Free plan, and the dashboard's Backups page says the Free plan does not include project backups (read 14 October 2026). Supabase's backup guide (https://supabase.com/docs/guides/platform/backups) recommends that free projects export with `supabase db dump`, which Interfulgent's nightly job does (above) | None |
| Supabase API and database logs | 1 day (Free plan; https://supabase.com/pricing, read 14 October 2026) | Supabase's |
| Supabase auth audit logs | 1 hour (Free plan; the same page) | Supabase's |
| Supabase Edge Function logs | **[check: Supabase publishes no retention for Edge Function logs on its pricing page; ask Supabase, or read it from the dashboard's logs]** | Supabase's |
| Interfulgent's nightly dump of ARC's database, on Marcus's Mac | The newest 7 daily, 4 weekly (Sundays) and 12 monthly (the 1st) copies, then deleted | `interfulgent-backup`, 03:30 nightly |
| The same dump at Backblaze B2 (Amsterdam), encrypted | Locked for 8 days (daily copies), 29 days (Sundays) or 366 days (the 1st) from upload. Nobody can shorten or remove a compliance lock, Backblaze included. The job deletes a folder once it is out of the rotation and its lock has expired | `interfulgent-backup`, after each dump |
| 20i's web-server access and error logs for the game's site (full internet address and browser description) | Server logs 12 weeks; CDN logs 7 days. 20i's answer (ticket #497653007, 9 October 2026), which applies to ARC because all of Marcus's 20i hosting is on one account and one virtual server (148B). 20i cannot shorten them (see 2.6) | 20i: a server setting 20i does not change |

"Last used" is the later of the last sign-in (`users.last_seen_at`, moved by signup, login and save-game) and the last request made with one of the account's tokens (`sessions.last_used_at`); an account with neither counts from when it was made. As a token lasts 90 days, an account goes 3 years after the last sign-in at the earliest, and up to 90 days after that. Marcus decided on 14 October 2026 (147A) that the rule is "3 years after the account was last used", which is what migration 00019 does. **The privacy notice must say "last used", not "last sign-in".** The hub's page now says "3 years after the last sign-in" (`interfulgent-hub/content/support/arc/privacy.md:86`; see finding 14).

Each job deletes one bounded batch per daily run, oldest first, and is safe to run twice or twice at once. Tests: `packages/edge-functions/src/__tests__/retention-db.test.ts` (each limit a day either side) and the retention section of `packages/game-logic/src/__tests__/privacy-audit.test.ts`. Migration 00020 enables pg_cron and schedules the four jobs, daily from 03:10 UTC, when it is pushed (151A; the order is in section 7.1). Pushing it again, or running `select arc_retention_schedule();` again, still leaves four jobs. Checked on a local Supabase stack on 14 October 2026 with pg_cron 1.6.4, the version production lists: after `supabase db reset` the four jobs were scheduled, run as `postgres`; the dry run and one run of each job agreed (1 account, 1 log entry, 1 counter, 1 showcase); a second run deleted nothing; and pg_cron itself ran the rate-limit job successfully.

**Deletion and the backups.** `delete_account`, the in-game button and the retention jobs change the live database only. The Free plan includes no project backups (2.2, above), so Interfulgent's nightly dumps are the only backups of the database. A deleted account stays in every nightly dump taken before the deletion until that dump expires: at most 366 days after the dump was made, because no lock is set longer than that. The Backblaze lock cannot be shortened or removed early by anyone. The copies are encrypted, and the key is held by Marcus alone. A restore from any of them would bring a deleted account back (risk R-bak1, section 5).

**[check: why 3 years and 2 years. Recorded so far: the hub's question 43 recommended 3 years because UK GDPR Art 5(1)(e) asks for no longer than needed and FlagFans deletes unused child profiles after 3 years, and Marcus chose it (43A). Question 44 recommended 12 months for the activity log; Marcus chose 2 years (44B) and no reason is written down. Sources: `interfulgent-hub/docs/privacy-arc-dashlit-questions.md` lines 110 to 128; `privacy-arc-dashlit-notes.md` lines 148 and 149]** FlagFans records its reasons in its section 2.2.1; this DPIA should record Marcus's in the same way.

### 2.3 Context

The players are children, most of them 8 or 9, who play on a family iPad, a phone or a computer. No parent's details are held, so nobody can be told about an action on a child's account (risk RH3 in the hub rows). A child cannot type a message to another player. The only words a child types that another player can read are pet names on a showcase.

### 2.4 Purposes

1. Run the game: sign in, keep the shelter across devices, friends, gifts and showcases.
2. Keep it safe: limit guessing and flooding, and look into a grown-up's report.
3. Answer a grown-up who writes through the help page (the hub; see its rows).

### 2.6 Processors and other recipients

| Supplier | What it handles | Where | Safeguard |
|---|---|---|---|
| Supabase | Every server table in 2.2, sign-in tokens, and its API, database, auth and Edge Function logs (kept as in 2.2). The source of Interfulgent's nightly dump. Project `arc` in the A.R.C. Game organisation, on the Free plan, which includes no project backups and pauses a project after 1 week of inactivity (risk R-avail1) | Central EU (Frankfurt), `eu-central-1`. Source: the Supabase dashboard, read 14 October 2026; before that, the `supabase projects list` output of 28 August 2026 and 31 August 2026 (project `arc`, created 12 April 2026), kept in two ARC session transcripts (see below the table) | Frankfurt is in the EEA, which UK adequacy regulations cover. Supabase Inc. is a US company: the UK Addendum to the EU standard contractual clauses in its DPA **[check: the accepted DPA is on file. None is in any repository]** |
| Backblaze (Backblaze, Inc., a US company) | Interfulgent's nightly dump of ARC's database, encrypted with `age` on Marcus's Mac before upload. Ciphertext only: Backblaze holds no key | EU Central (Amsterdam), a private bucket with Object Lock | The EU, which UK adequacy regulations cover. Backblaze's UK DPA applies to organisation accounts on acceptance of its terms; Interfulgent's account was opened on 8 October 2026. Filed: `flagfans/docs/legal/backblaze-dpa-uk-2026-10-08.pdf` and `backblaze-terms-of-service-2026-10-08.pdf` |
| Marcus's Mac (not a supplier) | The local copy of the nightly dump, and the key that opens every copy | `~/Backups/Interfulgent`, mode 700, no cloud sync | FileVault; the key is also in his password manager and printed offline |
| 20i | The game's files at `play.arcgame.app` and the website at `arcgame.app`; the internet address and browser description of each device that loads them (web-server logs). No accounts or saved games | UK: 20i's London zone, in Kao Data's colocation facility in Harlow, Essex; backups at ServerChoice, Stevenage. 20i gave this for FlagFans' package (ticket #497585008). Marcus confirmed on 14 October 2026 (148B) that all his 20i hosting, FlagFans and ARC included, is on one 20i account and one virtual server, so it applies to ARC (ARC's package is `981c98df9aeca87b`; the hub's handover of 9 October 2026 also records the shared server as London) | UK company; no transfer. 20i's DPA is its published agreement (https://www.20i.com/us/legal/gdpr-data-processing-agreement). Annex 2 (security measures) is filed at `flagfans/docs/legal/20i-gdpr-annex.pdf`, received 6 October 2026 **[check: a dated copy of the DPA on file. Only Annex 2 is filed]** |
| Vercel (retiring) | Served the web game until the move. For about 6 months after it (89A) it serves only the "we've moved" page, and handles the internet address of each visit to the old address | A worldwide network, as Marcus answered at 42A (hub question 42). No region for this project is recorded **[check: the project's region, if the Vercel dashboard shows one]** | **[check: DPA; and when the project is deleted]** |

Sources for the Supabase region: `/Users/marcus/.claude/projects/-Users-marcus-Projects-animal-rescue-centre/bb1459ea-2107-4db6-8e31-3c144ee4c7b9.jsonl` line 61 (28 August 2026) and `.../f6c35cf3-ed73-4f0b-b03b-18cd950b94d4.jsonl` line 508 (31 August 2026). Both show the table `supabase projects list` prints, with the row `arc | Central EU (Frankfurt)`. No file in a repository records the region, which is why the hub's privacy page still has a placeholder for it (`interfulgent-hub/content/support/arc/privacy.md:73`).

#### 20i's answers (given for FlagFans' package; they apply to ARC)

Two support tickets that FlagFans raised, recorded in `flagfans/docs/legal/dpia-young-explorers.md` (lines 164, 256, 442 and 553): #497585008, "GDPR compliance information request for flagfans.co.uk hosting" (6 October 2026), and #497653007, "Log retention and UK storage clarification for flagfans.co.uk" (raised and answered by 20i Support on 9 October 2026). 20i answered for flagfans.co.uk, package 3335839, on a Managed Cloud Server. No ticket names ARC's package. **Marcus confirmed on 14 October 2026 (148B) that all his 20i hosting, FlagFans and ARC included, is on one 20i account and one virtual server, so these answers apply to ARC.** The hub's handover of 9 October 2026 points the same way: it says the hub and FlagFans share one server.

- **Logs.** Server access and error logs are kept 12 weeks (logrotate, rotated every 3 weeks) in the package's `logs` folder. CDN (StackCDN) logs are kept 7 days and only 20i can read them. Full IPv4 and IPv6 addresses and the user agent are logged; 20i's assistant also named the request path and query string, the referrer and forwarded-address values. 20i cannot shorten the period: it is a server configuration it does not change, and updates would overwrite a change. The logs stay in the UK and are not copied elsewhere.
- **Where.** London zone, in Kao Data's colocation facility in Harlow, Essex. All backups for UK packages are stored at ServerChoice, Stevenage, UK.
- **Backups.** Files and mailboxes are kept 30 days; databases 60 days. (20i's published privacy policy separately says infrastructure backups are kept 12 months and restored deleted personal data must be removed within 180 days; the FlagFans DPIA relies on the shorter periods that support confirmed.) ARC keeps no database at 20i, only the game's files.
- **Encryption at rest.** 20i support confirmed that databases and backups are not encrypted at rest (risk R17 in the FlagFans DPIA). For ARC that reaches the game's files and the web-server logs only.
- **Paperwork.** Annex 2 (security measures) is filed; see the 20i row above.

**The log period and the hub's item 54A (settled by 148B).** The hub's item 54A (`interfulgent-hub/docs/privacy-arc-dashlit-notes.md`, line 241, written for Dashlit Diner) says to set the access-log retention to 30 days in the 20i panel. 20i told FlagFans that the 12-week period cannot be shortened, so 30 days cannot be set. The ARC privacy notice therefore states what 20i keeps: web-server logs for 12 weeks and CDN logs for 7 days, each holding the full internet address and the browser's description. The hub session noted that the ARC page says nothing about 20i's logs (`interfulgent-hub/.claude/HANDOVER.md`, line 127); finding 13 carries the wording. Item 54A needs the same correction for Dashlit Diner.

The game itself calls only its own files and the Supabase functions: no adverts, analytics or outside fonts (the hub's survey of the code: `apps/game/package.json:17-21` and `apps/game/index.html:18-25`, recorded at `privacy-arc-dashlit-notes.md:56`) **[check: true of the release build; the survey read the code, not the build]**. The help page's suppliers (20i for the hub, Resend for replies) are in the hub's rows.

### 2.7 Findings

The hub's rows list findings 1 to 8 and items 1 to 10 (`dpia-arc-hub-rows.md`, sections 3 and 6). This branch adds:

| # | Finding | Status |
|---|---|---|
| 9 | No job deleted old accounts, old log entries, closed counters or expired showcases (G4) | Fixed in code (00019). Open until 00019 is pushed and the schedule is switched on (7.1) |
| 10 | Expired sign-in tokens stay until the same player signs in again, or the account goes | Open: no decision yet |
| 11 | The privacy page still describes a typed sign-in name ("letters only, 2 to 18"); new accounts now pick a ready-made one (00017) | Open: the hub session updates the page when 00017 is live **[check]** |
| 12 | The hub's privacy notice and supplier register do not name Backblaze, or Interfulgent's own encrypted nightly copies of ARC's database, for ARC (the register lists Backblaze for Dashlit Diner only: `privacy-arc-dashlit-notes.md:218`). The notice's deletion section says only that Supabase's copies expire on Supabase's schedule (`privacy.md:111`) | Open: the hub session adds the supplier, and the notice says what 4.6 lists, before the page goes live |
| 13 | The ARC privacy page does not state how long 20i keeps web-server logs. 20i cannot shorten them, so the hub's item 54A (30 days) cannot be set (see 2.6) | Open: the hub session adds a sentence to the ARC notice: web-server logs are kept 12 weeks and CDN logs 7 days, each with the full internet address (148B), and corrects item 54A |
| 14 | The hub's ARC page says an account is deleted "3 years after the last sign-in" (`privacy.md:86`). The rule is 3 years after the account was last used: the later of the last sign-in and the last request made with a sign-in token (147A, migration 00019) | Open: the hub session changes the page to "last used" and explains the term, and hub row 43A to match. The children's page already says "If nobody plays on your account for 3 years" (`privacy-kids.md:37`) |

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

  The remaining risks are a typed pet name on a showcase that anyone with the code can open, older accounts' typed sign-in names in the log and the name counters, and Interfulgent's encrypted nightly copies, which keep a deleted account for up to 366 days (R-bak1).
- **Outcome.** Legitimate interests are a fair basis for the three purposes, with the measures above **[check: Marcus's conclusion and sign-off]**.

### 4.6 Rights and deletion

- **Delete this account, in the game.** On the account screen (tap the level circle), "Delete this account", then "Delete it", then the account's PIN. The `delete-account` Edge Function takes the account from the session, checks the PIN (five tries per 15 minutes), and calls `delete_account`. That removes, in one transaction: the account, sessions, saved game, counts, badges, both rows of each friendship, gifts received, showcases, depot history, the account's activity-log rows and other players' rows that name it, and its counters. Gifts it sent stay with the receiver without the sender. Its pool name is freed. One `account_deleted` line keeps counts only. The device then forgets the session, the name in the list, the sign-up draft and the account's saved copies (`docs/account-deletion.md`).
- **Backups.** Deleting an account changes the live database only. The account stays in Supabase's own backups until they expire on Supabase's schedule (2.2; the schedule is an open item), and in Interfulgent's own encrypted nightly copies, on Marcus's Mac and at Backblaze in Amsterdam, until each copy expires: at most 366 days after the copy was made. The Backblaze lock cannot be shortened or removed early, and the copies are not edited.
  - **What the privacy notice must say.** (1) Interfulgent keeps its own encrypted copy of the game's database every night, on the owner's computer and with Backblaze in Amsterdam, as well as Supabase's copies. (2) A deleted account stays in those copies until they expire, at most 366 days after the copy was made, and a copy cannot be edited or removed early. (3) The copies are encrypted, and only the owner holds the key. (4) If a copy is ever restored, accounts deleted since it was made are deleted again before the game uses it. The current notice says only that Supabase's copies expire on Supabase's schedule (`interfulgent-hub/content/support/arc/privacy.md:111`), and the hub's supplier register names Backblaze for Dashlit Diner only (finding 12).
  - **Statement (4) needs a record.** ARC's `account_deleted` log line holds counts only, so nothing lists which accounts to delete again. FlagFans keeps such a list for 400 days, longer than its oldest backup (`flagfans/docs/legal/dpia-young-explorers.md`, line 164; `flagfans/docs/legal/restore-procedure.md`). **[check: decide the restore rule for ARC and what record of deleted accounts to keep, or drop statement (4) from the notice]**
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
| R-bak1 | A deleted account stays in Interfulgent's locked, encrypted nightly copies for up to 366 days and cannot be removed early. A restore would bring it back, and anyone who obtained the private key and a copy could read PIN hashes and older accounts' typed sign-in names | Remote | Significant | Medium |
| R-avail1 | On the Free plan Supabase pauses a project after 1 week of inactivity (https://supabase.com/pricing, read 14 October 2026). While `arc` is paused, no child can sign in, load her shelter or save, and the retention jobs do not run | Possible | Minimal | Low |

**[check: the scores; these are suggestions.]**

## Step 6: Measures

| # | Measure | Effect | Residual |
|---|---|---|---|
| R-ret1 | The four jobs are separate pg_cron jobs, so a failure is reported against one of them in `cron.job_run_details`. The account job raises an error when no account in a batch could be deleted. `arc_retention_preview()` shows what is overdue. A tested check reads the periods (`privacy-audit.test.ts`) | Reduced | Low **[check: who looks at the job history, and how often]** |
| R-ret2 | 3 years counts from the last use, not only the last sign-in. A child's own play keeps the account. No contact is held to warn anyone, which the privacy page says | Accepted **[check]** | |
| R-move1 | The moved page tells the child to choose "I already have an account" and to have her name and number ready | Reduced | Low |
| R-bak1 | Each copy is encrypted with `age` on Marcus's Mac before it leaves, so Backblaze holds ciphertext and no key. The bucket is private, in the EU, with Object Lock: no lock is set longer than 366 days, so no copy outlives a year. The local folder is mode 700 with FileVault, and the key is in his password manager and printed offline. The notice tells the reader the copies exist and when they expire (4.6). The lock cannot be shortened, so the residue is accepted and disclosed | Reduced | Low **[check: Marcus accepts the residue, and the restore rule in 4.6]** |
| R-avail1 | Each device keeps its own copy of the shelter (2.2). Once the project runs again, the retention jobs clear any backlog in batches (00019). Nothing watches for a pause | Accepted **[check: what Supabase counts as activity, and whether the nightly dump or the daily jobs count; how Marcus would notice a pause and restore the project; or a paid plan]** | |

## Step 7: Sign-off

### 7.1 Switching the jobs on

None of these has been run against production.

pg_cron 1.6.4 is available on the project and not yet installed (the dashboard, 14 October 2026). Migration 00020 installs it and schedules the jobs, so nothing is switched on in the dashboard. Supabase's dashboard shows the result under Integrations > Cron (https://supabase.com/docs/guides/cron/install).

1. **Dry run of the push.** From a checkout of the merged commit, run `supabase db push --dry-run`. It should list 00017 to 00020, or 00019 and 00020 if the other two are already applied, and any later migration merged with them.
2. **Push, during the day.** `supabase db push`. 00019 and 00020 delete nothing as they run: 00019 adds functions and two indexes, and 00020 installs pg_cron and schedules the four jobs. The first scheduled run is at 03:10 UTC, so push early enough to finish steps 3 to 5 before then. Then follow 00017 and 00018's own function deploys.
3. **Check the schedule.** In the SQL editor, run `select jobname, schedule, username from cron.job where jobname like 'arc-retention-%' order by jobid;`. Expect four jobs, at 03:10, 03:15, 03:20 and 03:25 UTC, run as `postgres`.
4. **Dry run of the jobs.** `select arc_retention_preview();`. It counts what each job would delete and changes nothing. Production's accounts and log entries are all younger than their limits, so expect 0 for both. Expect a number for rate limits, and for any showcase that expired over 30 days ago.
5. **One run by hand.** `select arc_retention_run();`. The counts should match step 4.
6. **Check the next day.** Run `select j.jobname, d.status, d.start_time from cron.job_run_details d join cron.job j using (jobid) where j.jobname like 'arc-retention-%' order by d.start_time desc limit 8;`. All four should show `succeeded`.

To switch the jobs off, run `select arc_retention_unschedule();`, and `select arc_retention_schedule();` puts them back. Disabling the extension also removes them: Supabase's docs say it permanently deletes all jobs. Without pg_cron, a daily call to `rpc/arc_retention_run` with the service-role key would do the same work; nothing for that is built.

### 7.3 Declaration

Approved by: ______  Date: ______
