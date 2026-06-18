create table if not exists team_rosters (
  team_name  text    primary key,
  fd_team_id integer not null,
  players    jsonb   not null default '[]',
  synced_at  bigint  not null default (extract(epoch from now()) * 1000)::bigint
);
