-- Heatmap events of plays: player deaths, the point where a player left a game unfinished, and position samples.
-- Same rules as the file store (packages/db/src/file-store.ts, heatmap.ts; PLAY_EVENT_LIMITS in @gg/schemas);
-- migrations.test.ts runs them and checks play_heatmap against heatRows on the same rows.

create type play_event_kind as enum ('death','quit','sample');

create table play_events (
  id bigint generated always as identity primary key,
  play_id uuid not null references plays(id) on delete cascade,
  game_id uuid not null references games(id) on delete cascade,
  version_id uuid not null references game_versions(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  kind play_event_kind not null,
  level_id text not null check (char_length(level_id) between 1 and 64),
  x double precision not null check (abs(x) <= 1e6),
  y double precision not null check (abs(y) <= 1e6),
  t double precision not null check (t between 0 and 14400),
  created_at timestamptz not null default now()
);
create index play_events_version_idx on play_events(game_id, version_id);

-- No policies: positions are read only as aggregates, by the game's owner, through play_heatmap.
alter table play_events enable row level security;

-- One batch per play, by the player who played it, at most 601 events (the play page's caps).
create or replace function record_play_events(p_user_id uuid, p_play_id uuid, p_events jsonb)
returns integer
language plpgsql security definer as $$
declare me uuid := community_user(p_user_id); p plays; n integer;
begin
  select * into p from plays where id = p_play_id;
  if p.id is null or p.user_id <> me then raise exception 'play not found'; end if;
  if jsonb_typeof(p_events) is distinct from 'array' or jsonb_array_length(p_events) > 601 then raise exception 'events must be an array of at most 601'; end if;
  if exists (select 1 from play_events where play_id = p.id) then raise exception 'this play already has its events'; end if;
  insert into play_events (play_id, game_id, version_id, user_id, kind, level_id, x, y, t)
    select p.id, p.game_id, p.version_id, me, e.kind::play_event_kind, e.level, e.x, e.y, e.t
    from jsonb_to_recordset(p_events) as e(kind text, level text, x double precision, y double precision, t double precision);
  get diagnostics n = row_count;
  return n;
end $$;

-- The owner's heatmap of one version: events per level, kind and cell (floor(px / cell)), other players only, with the
-- number of plays that reached each level.
create or replace function play_heatmap(p_user_id uuid, p_game_id uuid, p_version_id uuid, p_cell integer default 16)
returns table (level_id text, kind play_event_kind, cx integer, cy integer, n integer, plays integer)
language plpgsql stable security definer as $$
#variable_conflict use_column
declare me uuid := community_user(p_user_id); g games;
begin
  select * into g from games where id = p_game_id;
  if g.id is null or g.owner_id <> me then raise exception 'game not found'; end if;
  if p_cell is null or p_cell < 1 or p_cell > 256 then raise exception 'cell must be a whole number of pixels from 1 to 256'; end if;
  return query
    with ev as (
      select e.play_id, e.level_id, e.kind, floor(e.x / p_cell)::integer as cx, floor(e.y / p_cell)::integer as cy
        from play_events e
        where e.game_id = p_game_id and e.version_id = p_version_id and e.user_id <> g.owner_id
    ), reached as (
      select ev.level_id, count(distinct ev.play_id)::integer as plays from ev group by ev.level_id
    )
    select ev.level_id, ev.kind, ev.cx, ev.cy, count(*)::integer, reached.plays
      from ev join reached on reached.level_id = ev.level_id
      group by ev.level_id, ev.kind, ev.cx, ev.cy, reached.plays;
end $$;
