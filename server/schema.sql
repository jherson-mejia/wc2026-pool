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

-- ── fd_match_ids ──────────────────────────────────────────────
-- Maps pool match IDs → football-data.org match IDs.
-- Populated when admin syncs schedule. Used by scheduler to fetch lineups.
create table if not exists fd_match_ids (
  match_id text    primary key,
  fd_id    integer not null,
  ts       bigint
);

-- ── lineups ───────────────────────────────────────────────────
-- Fetched from FD API ~55 min before kickoff. Opens scorer picks.
create table if not exists lineups (
  match_id     text    primary key,
  home_team_id integer,
  away_team_id integer,
  home_lineup  jsonb,
  home_bench   jsonb,
  away_lineup  jsonb,
  away_bench   jsonb,
  fetched_at   bigint
);

-- ── match_goals ───────────────────────────────────────────────
-- Goals per match, populated from runSync after match finishes.
create table if not exists match_goals (
  match_id     text    primary key,
  home_team_id integer,
  away_team_id integer,
  goals        jsonb,
  ts           bigint
);

-- ── scorer_picks ──────────────────────────────────────────────
-- One row per (user × match × team). id = "{email}_{matchId}_{team}".
create table if not exists scorer_picks (
  id          text    primary key,
  email       text    not null,
  match_id    text    not null,
  team        text    not null,
  player_id   integer not null,
  player_name text    not null,
  ts          bigint
);

create index if not exists scorer_picks_email_idx    on scorer_picks (email);
create index if not exists scorer_picks_match_id_idx on scorer_picks (match_id);

-- ── match_meta ─────────────────────────────────────────────────
-- Venue + referee (from lineup fetch) + odds (from schedule sync).
create table if not exists match_meta (
  match_id   text    primary key,
  venue      text,
  referee    text,
  odds_home  real,
  odds_draw  real,
  odds_away  real,
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
alter table fd_match_ids disable row level security;
alter table lineups      disable row level security;
alter table match_goals  disable row level security;
alter table scorer_picks disable row level security;
alter table match_meta   disable row level security;

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
