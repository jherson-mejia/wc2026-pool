-- Add user_id to participants; backfill existing rows with a generated UUID.
alter table participants
  add column if not exists user_id uuid not null default gen_random_uuid();

-- Make it unique so it can be used as a stable secondary key.
create unique index if not exists participants_user_id_key on participants (user_id);
