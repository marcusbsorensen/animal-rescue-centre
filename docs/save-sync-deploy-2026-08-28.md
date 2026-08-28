# Save sync, phase 1 — deployed and exercised, 28 August 2026

Phase 1 was written on 27 August and verified only against unit tests. Nothing
had touched the linked Supabase project (`arc`, `bdptplvksniheaqjitek`). This is
the record of putting it there and watching it behave.

## What the project actually looked like

The handover said one migration was pending and two functions needed
redeploying. Both were understatements.

**Two migrations were unapplied, not one.** `00005_sessions.sql` — the session
table from the 22 August audit — had never been pushed either. Remote migration
history stopped at `00004`.

**`save-game` and `load-game` had never been deployed at all.** The deployed
function list was three entries long: `signup`, `get-pin-hint`, `login`. So were
`add-friend`, `claim-gift`, `create-showcase`, `get-showcase` and `send-gift`.
Everything the 22 August audit produced was committed on
`feat/ptv-driving-engine` and had gone nowhere near the server.

**The deployed `login` predated sessions.** It was version 1, from 12 May;
`createSession` landed on 22 August. Deploying `save-game` on its own would have
left `requireSession` reading an empty table, so every save from every device
would have answered 401. The four functions had to go together.

`main` is still at the 4 July merge, so whatever is on Vercel is a client that
writes `game_states` directly with the anon key. That client does not call
`save-game`, which is why deploying these was additive rather than a cutover.
The cutover happens when this branch ships.

## What ran

```
supabase db push          # 00005_sessions, 00006_game_state_version
supabase functions deploy save-game load-game login signup
```

Docker was still not running. Neither command needs it — `db push` connects to
the remote database directly, and the CLI uploads function sources for the
platform to bundle. The `WARNING: Docker is not running` on deploy is noise.

Remote migration history is now `00001`–`00006`. The one existing `game_states`
row took `version = 0`, as the migration intends.

## Two devices, and the 409

A throwaway player was signed up, given a second session via `login`, driven
through the collision from both sides, and deleted. 29 assertions, all passing.
The database is back to the single pre-existing row, zero sessions.

The sequence that matters:

| Step | Result |
|---|---|
| A and B both load | both see `version: 0` |
| A saves `expectedVersion: 0` | 200, `version: 1` |
| B saves `expectedVersion: 0` — stale | **409**, `conflict: true`, carrying A's state at version 1 |
| read back | stored state is still A's; the rejected write changed nothing |
| B re-sends on version 1 | 200, `version: 2` |
| A saves on version 1 — now stale | **409**, carrying B's state |

That is the whole of phase 1 working against real infrastructure: the collision
is detected, the loser is told, and the loser is handed what it collided with
rather than a bare "no".

Also confirmed on the deployed functions:

- a save with no `expectedVersion` still lands, and the trigger still steps the
  version, so a *versioned* client holding the old number finds out;
- `version` and `updated_at` in the request body are ignored — the trigger owns
  both;
- 400 for a negative version, a non-object state, an out-of-range level; 413
  over 1 MB; 401 for no token, and for a well-formed token that isn't a session;
- `last_used_at` moves on use, `expires_at` lands 90 days out;
- deleting the player cascades sessions and game_states away.

## Left open

**Five functions are still undeployed:** `add-friend`, `send-gift`,
`claim-gift`, `create-showcase`, `get-showcase`. The client on this branch calls
all five. They are not needed for save sync, but nothing on this branch that
touches friends, gifts or showcases will work until they go up.

**A malformed request body answers 500, not 400.** `req.json()` throws inside
the try, and the catch returns `Internal server error`. Found by accident — a
test sent `"expectedVersion":` with nothing after it. Not reachable from the real
client, and not worth a fix on its own, but worth knowing when reading logs.

**Still nothing has run on iOS hardware,** and phase 2 — deciding what to *do*
with two divergent shelters rather than just noticing — has not started.
