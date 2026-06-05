-- ================================================================
-- Migration 003 — Match metadata: venue, referee, odds
-- Run in: Supabase dashboard → SQL Editor → New query
-- ================================================================

create table if not exists match_meta (
  match_id   text    primary key,
  venue      text,
  referee    text,
  odds_home  real,
  odds_draw  real,
  odds_away  real,
  ts         bigint
);

alter table match_meta disable row level security;
