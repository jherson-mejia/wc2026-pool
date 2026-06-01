-- ================================================================
-- WC 2026 Pool — Supabase migration
-- Run this once in: Supabase dashboard → SQL Editor → New query
-- ================================================================

-- ── participants ─────────────────────────────────────────────
-- One row per pool member. Email is the stable identifier.
create table if not exists participants (
  email      text primary key,
  name       text        not null,
  joined_at  bigint      default (extract(epoch from now()) * 1000)::bigint
);

-- ── picks ────────────────────────────────────────────────────
-- One row per (participant × match). id = "{email}_{matchId}".
create table if not exists picks (
  id         text    primary key,   -- e.g. "jose@co_GA_1"
  email      text    not null,
  match_id   text    not null,
  home       integer,
  away       integer,
  winner     text,                  -- 'home' | 'away' | null (KO tiebreaker)
  ts         bigint
);

create index if not exists picks_email_idx    on picks (email);
create index if not exists picks_match_id_idx on picks (match_id);

-- ── results ──────────────────────────────────────────────────
-- Admin-entered (or auto-synced) final scores.
create table if not exists results (
  match_id   text    primary key,
  home       integer not null,
  away       integer not null,
  winner     text,                  -- 'home' | 'away' | null (group stage)
  ts         bigint
);

-- ── ko_matches ────────────────────────────────────────────────
-- Admin sets the two teams for each knockout match once known.
-- Participants can then submit picks for that match.
create table if not exists ko_matches (
  match_id   text primary key,      -- e.g. "r32_1", "final_1"
  home       text not null,
  away       text not null,
  ts         bigint
);

-- ================================================================
-- Row Level Security
-- We use the service_role key server-side (bypasses RLS), so RLS
-- can stay disabled. Enable + add policies only if you ever expose
-- the anon key to clients.
-- ================================================================
alter table participants disable row level security;
alter table picks        disable row level security;
alter table results      disable row level security;
alter table ko_matches   disable row level security;

-- ================================================================
-- Realtime
-- Required so the server's Supabase channel subscription receives
-- postgres_changes events and fans them out via SSE.
--
-- NOTE: if you get "publication does not exist" errors, go to
-- Supabase dashboard → Database → Replication and toggle each
-- table on instead of running these ALTER statements.
-- ================================================================
do $$
begin
  alter publication supabase_realtime add table participants;
exception when others then null; end $$;

do $$
begin
  alter publication supabase_realtime add table picks;
exception when others then null; end $$;

do $$
begin
  alter publication supabase_realtime add table results;
exception when others then null; end $$;

do $$
begin
  alter publication supabase_realtime add table ko_matches;
exception when others then null; end $$;
