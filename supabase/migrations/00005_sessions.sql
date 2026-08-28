-- Session tokens.
--
-- login/signup already minted a random 32-byte token and handed it to the
-- client, but nothing ever stored it, so no function could check it. The
-- authenticated functions instead took `userId` straight from the request
-- body and treated "a userId was supplied" as proof of identity — which
-- means the public anon key was enough to act as any child: claim their
-- gifts, send gifts as them, add friends to their account, publish a
-- showcase for them.
--
-- This table gives the token somewhere to live so it can actually be
-- verified. Service-role only: RLS is on with no policies, so the anon
-- key cannot read or write it at all.

create table sessions (
  token        text primary key,
  user_id      uuid not null references users on delete cascade,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  -- Long-lived on purpose. This is a children's game played on a shared
  -- family iPad; being logged out every fortnight is a worse outcome than
  -- a long session, and the token is a per-device secret, not a password.
  expires_at   timestamptz not null default now() + interval '90 days'
);

create index sessions_user_id_idx on sessions (user_id);
create index sessions_expires_at_idx on sessions (expires_at);

alter table sessions enable row level security;
-- No policies, deliberately. Only the service role (Edge Functions) touches
-- this table; see supabase/functions/_shared/session.ts.
