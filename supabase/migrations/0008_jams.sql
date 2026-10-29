-- Jams: a theme and three moments. Entries open at starts_at, submissions close and voting starts at
-- submissions_close, results are published at voting_close. An owner enters a listed, unmoderated game whose head
-- passed its playtest and that was made after the jam started (for a remix, its original too); the entry freezes that
-- head. A vote needs a 30 s play of the entered version and is never on the voter's own entry. jam_results ranks the
-- entries still listed and unmoderated by the formula of rankJam in packages/db/src/ranking.ts (JAM there); the
-- migration test runs the rules and checks SQL and TypeScript rank the same votes the same way.

create table jams (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  title text not null check (char_length(title) between 3 and 80),
  theme text not null check (char_length(theme) between 2 and 80),
  description text not null default '' check (char_length(description) <= 2000),
  genres genre[] not null default '{}',
  starts_at timestamptz not null,
  submissions_close timestamptz not null,
  voting_close timestamptz not null,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  constraint jam_moments_in_order check (starts_at < submissions_close and submissions_close < voting_close)
);

create table jam_entries (
  jam_id uuid not null references jams(id) on delete cascade,
  game_id uuid not null references games(id) on delete cascade,
  owner_id uuid not null references profiles(id) on delete cascade,
  version_id uuid not null references game_versions(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  primary key (jam_id, game_id),
  unique (jam_id, owner_id)
);

create table jam_votes (
  jam_id uuid not null,
  game_id uuid not null,
  voter_id uuid not null references profiles(id) on delete cascade,
  fun smallint not null check (fun between 1 and 5),
  theme smallint not null check (theme between 1 and 5),
  look smallint not null check (look between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (jam_id, game_id, voter_id),
  foreign key (jam_id, game_id) references jam_entries(jam_id, game_id) on delete cascade
);

alter table jams enable row level security;
alter table jam_entries enable row level security;
alter table jam_votes enable row level security;
create policy "jams are public" on jams for select using (true);
create policy "jam entries are public" on jam_entries for select using (true);
create policy "own jam votes" on jam_votes for select using (voter_id = auth.uid());
-- Writes go through the functions below only.
revoke insert, update, delete on jams, jam_entries, jam_votes from anon, authenticated;

create or replace function jam_phase(j jams, p_now timestamptz default now())
returns text
language sql stable as $$
  select case when p_now < j.starts_at then 'upcoming' when p_now < j.submissions_close then 'open' when p_now < j.voting_close then 'voting' else 'closed' end
$$;

-- Still in the jam: the entry's game is listed and neither suspended nor removed.
create or replace function jam_entry_stands(p_game_id uuid)
returns boolean
language sql stable security definer as $$
  select exists (select 1 from games g where g.id = p_game_id and g.visibility = 'listed' and g.state in ('playable','published'))
$$;

create or replace function create_jam(p_user_id uuid, p_slug text, p_title text, p_theme text, p_description text, p_genres genre[], p_starts_at timestamptz, p_submissions_close timestamptz, p_voting_close timestamptz)
returns jams
language plpgsql security definer as $$
declare me uuid := community_user(p_user_id); j jams;
begin
  if not is_moderator(me) then raise exception 'only moderators can create jams'; end if;
  if not (p_starts_at < p_submissions_close and p_submissions_close < p_voting_close) then
    raise exception 'the jam must start, close submissions and close voting in that order';
  end if;
  if exists (select 1 from jams where slug = p_slug) then raise exception 'a jam called ''%'' exists', p_slug; end if;
  insert into jams (slug, title, theme, description, genres, starts_at, submissions_close, voting_close, created_by)
    values (p_slug, p_title, p_theme, coalesce(p_description, ''), coalesce(p_genres, '{}'), p_starts_at, p_submissions_close, p_voting_close, me)
    returning * into j;
  return j;
end $$;

create or replace function set_jam_schedule(p_user_id uuid, p_jam_id uuid, p_starts_at timestamptz default null, p_submissions_close timestamptz default null, p_voting_close timestamptz default null)
returns jams
language plpgsql security definer as $$
declare me uuid := community_user(p_user_id); j jams;
begin
  if not is_moderator(me) then raise exception 'only moderators can change a jam'; end if;
  select * into j from jams where id = p_jam_id for update;
  if j.id is null then raise exception 'jam not found'; end if;
  j.starts_at := coalesce(p_starts_at, j.starts_at);
  j.submissions_close := coalesce(p_submissions_close, j.submissions_close);
  j.voting_close := coalesce(p_voting_close, j.voting_close);
  if not (j.starts_at < j.submissions_close and j.submissions_close < j.voting_close) then
    raise exception 'the jam must start, close submissions and close voting in that order';
  end if;
  update jams set starts_at = j.starts_at, submissions_close = j.submissions_close, voting_close = j.voting_close where id = j.id returning * into j;
  return j;
end $$;

create or replace function submit_to_jam(p_user_id uuid, p_jam_id uuid, p_game_id uuid)
returns jam_entries
language plpgsql security definer as $$
declare me uuid := community_user(p_user_id); j jams; g games; v game_versions; root games; mine jam_entries; e jam_entries; ph text;
begin
  select * into j from jams where id = p_jam_id;
  if j.id is null then raise exception 'jam not found'; end if;
  ph := jam_phase(j);
  if ph <> 'open' then raise exception '%', case when ph = 'upcoming' then 'the jam has not started' else 'submissions are closed' end; end if;
  select * into g from games where id = p_game_id for update;
  if g.id is null or g.owner_id <> me then raise exception 'game not found'; end if;
  if g.state in ('removed','suspended') then raise exception 'the game is %; it cannot be entered', g.state; end if;
  select * into v from game_versions where id = g.head_version_id;
  if g.visibility <> 'listed' or v.id is null or v.bundle_path is null or (v.design #>> '{evidence,playtest,passed}') = 'false' then
    raise exception 'publish the game to the feed (a version whose playtest passed) before entering it';
  end if;
  if cardinality(j.genres) > 0 and not (g.genre = any(j.genres)) then raise exception 'this jam takes % games', array_to_string(j.genres, ', '); end if;
  if g.root_game_id is not null then select * into root from games where id = g.root_game_id; end if;
  if g.created_at < j.starts_at or (root.id is not null and root.created_at < j.starts_at) then
    raise exception 'only games made after the jam started can be entered (for a remix, its original too)';
  end if;
  select * into mine from jam_entries where jam_id = j.id and owner_id = me;
  if mine.game_id is not null and mine.game_id <> g.id then raise exception 'you already entered another game in this jam; withdraw it first'; end if;
  insert into jam_entries (jam_id, game_id, owner_id, version_id) values (j.id, g.id, me, v.id)
    on conflict (jam_id, game_id) do update set version_id = excluded.version_id
    returning * into e;
  return e;
end $$;

create or replace function withdraw_from_jam(p_user_id uuid, p_jam_id uuid, p_game_id uuid)
returns void
language plpgsql security definer as $$
declare me uuid := community_user(p_user_id); j jams; e jam_entries;
begin
  select * into j from jams where id = p_jam_id;
  if j.id is null then raise exception 'jam not found'; end if;
  if jam_phase(j) <> 'open' then raise exception 'entries can be withdrawn only while submissions are open'; end if;
  select * into e from jam_entries where jam_id = j.id and game_id = p_game_id;
  if e.game_id is null or e.owner_id <> me then raise exception 'not your entry'; end if;
  delete from jam_entries where jam_id = j.id and game_id = p_game_id;
end $$;

create or replace function list_jam_entries(p_jam_id uuid)
returns setof jam_entries
language sql stable security definer as $$
  select e.* from jam_entries e where e.jam_id = p_jam_id and jam_entry_stands(e.game_id) order by e.submitted_at
$$;

create or replace function vote_in_jam(p_user_id uuid, p_jam_id uuid, p_game_id uuid, p_fun integer, p_theme integer, p_look integer)
returns jam_votes
language plpgsql security definer as $$
declare me uuid := community_user(p_user_id); j jams; e jam_entries; r jam_votes; ph text;
begin
  select * into j from jams where id = p_jam_id;
  if j.id is null then raise exception 'jam not found'; end if;
  ph := jam_phase(j);
  if ph <> 'voting' then raise exception '%', case when ph = 'closed' then 'voting is closed' else 'voting opens when submissions close' end; end if;
  select * into e from jam_entries where jam_id = j.id and game_id = p_game_id;
  if e.game_id is null or not jam_entry_stands(e.game_id) then raise exception 'not an entry of this jam'; end if;
  if e.owner_id = me then raise exception 'you cannot vote on your own entry'; end if;
  if not exists (select 1 from plays p where p.user_id = me and p.version_id = e.version_id and p.duration_s >= 30 and p.source not in ('workspace','test')) then
    raise exception 'play the entry for 30 seconds before voting';
  end if;
  insert into jam_votes (jam_id, game_id, voter_id, fun, theme, look) values (j.id, e.game_id, me, p_fun, p_theme, p_look)
    on conflict (jam_id, game_id, voter_id) do update set fun = excluded.fun, theme = excluded.theme, look = excluded.look, updated_at = now()
    returning * into r;
  return r;
end $$;

-- Standings once voting closed. Shown per criterion: the plain mean of the votes. Ranked by: the mean over fun, theme
-- and look of (sum + 3 * 3) / (votes + 3); entries with 3 votes or more by score, then votes, then entry time; the
-- rest follow unranked by votes, then entry time.
create or replace function jam_results(p_jam_id uuid, p_now timestamptz default now())
returns table (game_id uuid, version_id uuid, owner_id uuid, votes integer, fun double precision, theme double precision, look double precision, score double precision, rank integer)
language plpgsql stable security definer as $$
#variable_conflict use_column
declare j jams;
begin
  select * into j from jams where id = p_jam_id;
  if j.id is null then raise exception 'jam not found'; end if;
  if jam_phase(j, p_now) <> 'closed' then raise exception 'results are published when voting closes'; end if;
  return query
  with s as (
    select e.game_id, e.version_id, e.owner_id, e.submitted_at, count(v.voter_id)::int as n,
           coalesce(sum(v.fun), 0)::double precision as sf, coalesce(sum(v.theme), 0)::double precision as st, coalesce(sum(v.look), 0)::double precision as sl
    from jam_entries e
    left join jam_votes v on v.jam_id = e.jam_id and v.game_id = e.game_id
    where e.jam_id = j.id and jam_entry_stands(e.game_id)
    group by e.game_id, e.version_id, e.owner_id, e.submitted_at
  ), scored as (
    select s.*, round((((s.sf + 9) / (s.n + 3) + (s.st + 9) / (s.n + 3) + (s.sl + 9) / (s.n + 3)) / 3)::numeric, 6)::double precision as sc from s
  ), ordered as (
    select scored.*, row_number() over (order by (scored.n >= 3) desc, case when scored.n >= 3 then scored.sc end desc, scored.n desc, scored.submitted_at) as pos from scored
  )
  select o.game_id, o.version_id, o.owner_id, o.n,
         case when o.n > 0 then round((o.sf / o.n)::numeric, 6)::double precision end,
         case when o.n > 0 then round((o.st / o.n)::numeric, 6)::double precision end,
         case when o.n > 0 then round((o.sl / o.n)::numeric, 6)::double precision end,
         o.sc,
         case when o.n >= 3 then o.pos::int end
  from ordered o
  order by o.pos;
end $$;
