# Account deletion

A player can delete their account from inside the game. Apple requires this before App Store submission (guideline 5.1.1(v)), and it closes DPIA finding 5's in-app half (`interfulgent-hub/docs/dpia-arc-hub-rows.md`, finding 5 and open item 5b). The same work closes the deletion traces in the privacy notes (G3), and the public-key reads in DPIA open items 7 and 8 (notes G5 and G6).

Branch `claude/account-deletion`, built on `claude/child-data-gaps`. Not merged and not deployed.

## How a player does it

1. **My A.R.C.** (tap the level orb) → **Delete this account** (top right).
2. The panel says what goes: "your shelter, all your animals, your badges and coins, your friends and gifts, and your name and secret number. It cannot be undone. Ask a grown-up to help you." **Keep my account** is the main button. **Delete it** goes on.
3. **Ask a grown-up**: type the account's secret number (PIN) on the keypad.
4. **Your account is deleted** → OK → the welcome screen.

Every step happens inside the game. Nothing uses a browser `confirm()`. The PIN is the check the game already uses for an account (login asks for it too). It is not a new grown-up gate, and nothing new is collected. A child who knows their own PIN can delete their own account. The words ask for a grown-up, but they do not enforce one.

## What is deleted

`delete_account(user id)` (`supabase/migrations/00015_delete_account.sql`) runs as one transaction. If any statement fails, nothing is deleted. Every table is named, so nothing depends on a cascade:

| Table | What goes |
|---|---|
| `users` | the account row: typed sign-in name, display name, PIN hash, PIN clue, avatar, join code, times |
| `sessions` | every sign-in token, so every device is signed out |
| `game_states` | the saved shelter |
| `rescue_stats`, `badges_earned` | counts and badges |
| `friendships` | both rows of every friendship |
| `gifts` | gifts received |
| `showcase_links` | every showcase and its snapshot |
| `depot_sessions`, `supply_run_records`, `depot_inventory_ledger` | depot and supply-run history |
| `audit_log` | the account's own rows (the `signup` row holds the typed name), and other players' rows that name it by id (`target_id`), by join code (`friend_added`) or as a gift's sender (`gift_claimed`) |
| `rate_limits` | `login:<name>` and `hint:<name>` as typed (spaces either side allowed), and every key holding the user id: `gift:`, `gift-pair:` both ways, `delete-account:` |

On the device (`apps/game/src/lib/delete-account.ts`), the game removes the session (`arc_session`), the name from the "who's playing" list (`arc_remembered_usernames`), the signup draft (`arc-signup-draft`), the in-memory save tracking, and the account's three IndexedDB records (`arc-save`: live, rejected, base).

## What is kept, and why

- **Gifts the player sent.** They sit in a friend's inbox and belong to the friend. The sender is set to null, so the gift keeps its type and picked message and says nothing about who sent it.
- **A suggested name the player claimed** (`username_pool`) goes back into the pool with no account attached. It came from the pool's list, not from the child.
- **One `audit_log` row, `account_deleted`**, holds counts of what was removed. It has no id, no name and no join code. It shows that a deletion happened and when.
- **Rate-limit rows keyed by an address** (`login-ip:`, `signup-ip:`, `hint-ip:`, `gift-ip:`, `signup-create-ip:`). Each is a keyed hash of the address, shared by everyone behind it, and not tied to any account. Nothing can link one to the deleted player.
- **Rate-limit rows from mistyped names.** A failed login as "Adda" cannot be linked to "Ada".
- **Device settings** stay on the iPad (sound, less movement, screen layout, skip intro). They belong to the device, and another child on it would lose them.
- **Supabase backups and logs.** Deleted rows stay in Supabase's backups until those expire on Supabase's schedule, and Edge Function logs follow Supabase's log retention. The function logs counts only, never a name or id. **[Marcus to confirm: the project's backup plan and retention, for the privacy page.]**
- **Hub records.** Help-page messages and report pointers in the Interfulgent hub are outside this function. They follow the hub's own retention and `hubworker forget`.

## Who can call it

- `delete_account` is executable by `service_role` only (revoked from `public`, `anon`, `authenticated`).
- The `delete-account` Edge Function (`supabase/functions/delete-account/index.ts`) takes the account from the `x-arc-session` session, never from the body, and checks the PIN against that account's hash. It allows five wrong PINs per account per 15 minutes (`delete-account:<user id>`, removed by the deletion).
- Answers: `200 {deleted:true}`, `401 signed_out`, `400 bad_pin`, `403 wrong_pin`, `429 too_many_tries`, `500 failed`. The app keeps everything on the device unless it gets the 200.

## The public key (migration 00016)

`supabase/migrations/00016_client_reads.sql`:

- **`showcase_links`**: the `using (true)` read rule and the unused insert and update rules are gone, and `anon`/`authenticated` have no rights on the table. Showcases are read only through `get-showcase`, one token at a time.
- **`users`**: `anon`/`authenticated` may select `id, display_name, avatar_emoji, avatar_bg_colour` and nothing else. The typed sign-in name, PIN hash, PIN clue and join code are unreadable with the key, even if Supabase's own sign-in were switched on and the `users_read_*` rules matched. The typed name reaches only its own player, through login and signup.
- **`username_pool`**: only unclaimed names are readable (`username`, `claimed_at`), never `claimed_by`. Migration 00017 (branch `claude/ready-made-names`) later takes this away too: once sign-in names are ready-made pairs from public word lists, the free names would show which ones are children's logins.
- `searchUsername` in `lib/auth.ts`, which read `users.username` with the key for a hidden fallback screen, is removed.

Not done here: DPIA open item 8's suggestion to move the friends, gift-inbox and friends-board reads into Edge Functions. Those reads still use the key under rules tied to `auth.uid()`, so today they return nothing to ARC's own sessions. Before this branch they did the same.

## How to verify

Offline, from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm test        # all packages
pnpm typecheck
pnpm lint
```

- `packages/edge-functions/src/__tests__/delete-account-db.test.ts` runs every migration in PGlite (Postgres in WebAssembly, in-process). It seeds three players into every table, deletes one, and checks four things. No row anywhere names her by id, typed name or join code. Every row that did not name her is unchanged. A failure part-way deletes nothing. `anon` and `authenticated` cannot call the function or read showcases, typed names or PIN hashes.
- `packages/edge-functions/src/__tests__/delete-account.test.ts` covers the function: no session, wrong PIN, a user id in the body ignored, the rate limit, a failed delete.
- `apps/game/src/lib/__tests__/delete-account.test.ts` covers the device: what is forgotten, what stays, and that nothing is forgotten on any failure.
- `packages/game-logic/src/__tests__/privacy-audit.test.ts` fails if a new table that references `users` is not cleared by `delete_account` by name, and checks what the key can read.

In production, after the steps below, with a test account made for the purpose (not the harness account):

```sql
-- before: note the id
select id, display_name from users where username = '<test name>';
-- after deleting in the app, all must return 0
select count(*) from users where id = '<id>';
select count(*) from audit_log where user_id = '<id>' or target_id = '<id>' or metadata::text like '%<id>%';
select count(*) from rate_limits where key like '%<id>%' or key in ('login:<test name>', 'hint:<test name>');
select count(*) from sessions where user_id = '<id>';
-- and one new line with counts only
select created_at, metadata from audit_log where action = 'account_deleted' order by created_at desc limit 1;
```

With the anon key, `curl "$URL/rest/v1/showcase_links?select=token" -H "apikey: $ANON"` and `…/rest/v1/users?select=username` must both answer `permission denied` (401 or 403), not `[]`.

## Production steps for Marcus (not run)

These come **after** the run order for `claude/child-data-gaps` (DPIA open item 4: the gates, `RATE_LIMIT_ADDRESS_KEY`, 00010, 00014, the seven functions, the app build, then `supabase db push` for 00011 to 00013). That push also runs 00015 and 00016 if this branch is merged first. Both are safe to run then.

1. **Migration 00015** (`delete_account`). It changes no table, so it is safe any time. It must run before step 3. Run it by hand in the SQL editor, or let `supabase db push` run it.
2. **Migration 00016** (key rights). Safe any time. Nothing the game does with the key stops working: the reads it removes returned nothing or were never made. Afterwards, check that the signup name picker still offers names, and run the curl checks above.
3. **Deploy the function**: `supabase functions deploy delete-account`. It needs no new secret. Keep `verify_jwt` at its default, as the other functions do: the app sends the anon-key JWT, and the session goes in `x-arc-session`.
4. **Release the app build** (web via Vercel, iOS via TestFlight) with the new account screen. An older build simply has no button.
5. Run the verification above with a throwaway account.
6. Update the parents' privacy page ("Deleting an account", `interfulgent-hub` `content/support/arc/privacy.md`) and the DPIA. Finding 5 closes once 1 to 4 are done and the help-page line is published. The page can then say a player can also delete in the app, and list what is kept (section above).

## Where this run stopped

Done on the branch, with every package's tests, typecheck and lint passing (lint: 34 old warnings, none new):

- `7325d37`: migration 00016; `searchUsername` removed
- `e5b4b2a`: migration 00015, the `delete-account` Edge Function, its tests and the PGlite database tests
- `097e15e`: the account-screen button and panel, the device clean-up and the client tests
- `95cc815`: the privacy-audit additions
- this document

Not done, and why:

- **Nothing is deployed or merged**, as asked. No migration has run against the real project, and no function has been deployed.
- **The panel was checked in Chromium only**, with the function stubbed (780x360, 667x375, 1024x768). It has not been checked on an iPhone or in the simulator, or against a real Supabase.
- **No grown-up gate beyond the PIN.** The game has none to follow, and the task said not to invent one. If Apple review or the DPIA wants a parental gate (for example, a sum a young child cannot do), that is a separate decision.
- **DPIA open item 8** (move friends, gifts and board reads into functions) and **item 10's other half** (`login:<name>` and `hint:<name>` still hold the typed name while an account exists, and `sweep_rate_limits()` is still not scheduled) are untouched. Deletion now removes those rows. A keyed hash for name keys and a scheduled sweep would close the rest.
- **Backups and log retention** need Marcus's answer for the privacy page.
