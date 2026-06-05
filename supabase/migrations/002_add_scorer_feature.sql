-- ================================================================
-- Migration 002 — Scorer prediction feature
-- Run in: Supabase dashboard → SQL Editor → New query
-- ================================================================

-- FD match ID mapping: pool match ID → football-data.org match ID
create table if not exists fd_match_ids (
  match_id text    primary key,
  fd_id    integer not null,
  ts       bigint
);

-- Lineups fetched T-55min before kickoff
create table if not exists lineups (
  match_id     text    primary key,
  home_team_id integer,
  away_team_id integer,
  home_lineup  jsonb,   -- [{id, name, position, shirtNumber}] starting XI
  home_bench   jsonb,   -- bench players
  away_lineup  jsonb,
  away_bench   jsonb,
  fetched_at   bigint
);

-- Goals per match (populated from runSync after match finishes)
create table if not exists match_goals (
  match_id     text    primary key,
  home_team_id integer,
  away_team_id integer,
  goals        jsonb,   -- [{minute, scorer_id, scorer_name, team_id}]
  ts           bigint
);

-- Scorer picks: one row per (user × match × team)
create table if not exists scorer_picks (
  id          text primary key,  -- "{email}_{matchId}_{team}"
  email       text not null,
  match_id    text not null,
  team        text not null,     -- 'home' | 'away'
  player_id   integer not null,
  player_name text not null,
  ts          bigint
);

create index if not exists scorer_picks_email_idx    on scorer_picks (email);
create index if not exists scorer_picks_match_id_idx on scorer_picks (match_id);

alter table fd_match_ids disable row level security;
alter table lineups      disable row level security;
alter table match_goals  disable row level security;
alter table scorer_picks disable row level security;

do $$
begin
  alter publication supabase_realtime add table scorer_picks;
exception when others then null; end $$;
