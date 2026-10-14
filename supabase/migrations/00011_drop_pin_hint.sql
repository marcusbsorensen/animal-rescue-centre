-- Drop the free-text PIN hint column.
--
-- Run only after signup and get-pin-hint have been deployed from the
-- same commit as 00010: the functions deployed before that read and write
-- `pin_hint`, and would fail once it is gone. 00010 has already blanked
-- every value, so this removes an empty column.

drop trigger if exists users_blank_pin_hint on users;
drop function if exists users_blank_pin_hint();

alter table users drop column if exists pin_hint;
