-- ================================================================
-- Trivia feature migration
-- Run once in: Supabase dashboard → SQL Editor → New query
-- ================================================================

-- ── trivia_questions ─────────────────────────────────────────────
create table if not exists trivia_questions (
  prompt_id    text   primary key,
  available_at bigint not null,
  created_at   bigint default (extract(epoch from now()) * 1000)::bigint
);

create index if not exists trivia_questions_available_at_idx on trivia_questions (available_at);

alter table trivia_questions disable row level security;

do $$
begin
  alter publication supabase_realtime add table trivia_questions;
exception when others then null; end $$;

-- ── trivia_impressions ────────────────────────────────────────────
create table if not exists trivia_impressions (
  id        text primary key,
  user_id   uuid not null,
  prompt_id text not null,
  seen_at   bigint default (extract(epoch from now()) * 1000)::bigint
);

create index if not exists trivia_impressions_user_id_idx on trivia_impressions (user_id);

alter table trivia_impressions disable row level security;

do $$
begin
  alter publication supabase_realtime add table trivia_impressions;
exception when others then null; end $$;

-- ── trivia_scores ─────────────────────────────────────────────────
create table if not exists trivia_scores (
  id          text    primary key,
  user_id     uuid    not null,
  prompt_id   text    not null,
  is_correct  boolean not null default false,
  answered_at bigint  default (extract(epoch from now()) * 1000)::bigint
);

create index if not exists trivia_scores_user_id_idx on trivia_scores (user_id);

alter table trivia_scores disable row level security;

do $$
begin
  alter publication supabase_realtime add table trivia_scores;
exception when others then null; end $$;
