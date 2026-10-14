-- Rate-limit rows keep a keyed hash of an address, never the address.
--
-- Address limits were keyed `login-ip:<address>`, `signup-ip:<address>`,
-- `signup-create-ip:<address>`, `hint-ip:<address>` and
-- `gift-ip:<address>`. Nothing calls sweep_rate_limits() on a timer, so
-- those rows stayed after their windows closed. The functions now key
-- them by an HMAC-SHA-256 of the address (64 hex characters; see
-- addressKey in supabase/functions/_shared/rate-limit.ts).
--
-- Run only after signup, login, get-pin-hint and send-gift have been
-- deployed from the same commit, and after RATE_LIMIT_ADDRESS_KEY is set.
-- The constraint below refuses the old functions' keys, and a refused
-- rate-limit write fails closed: logins and signups would be turned away
-- until the new functions are live.

-- Every row keyed by a raw address goes. This restarts those address
-- windows, which is harmless.
delete from rate_limits
where key ~ '-ip:' and key !~ '-ip:[0-9a-f]{64}$';

-- And none can be written again.
alter table rate_limits
  add constraint rate_limits_no_raw_address check (
    key !~ '-ip:' or key ~ '-ip:[0-9a-f]{64}$'
  );
