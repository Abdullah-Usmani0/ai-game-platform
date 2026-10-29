-- Community: plays, one-tag ratings, per-player stats and rank, publishing to the feed, the rewarded test queue.
-- The rank formula mirrors packages/db/src/ranking.ts; packages/db/src/migrations.test.ts runs both migrations on an
-- embedded Postgres and checks that SQL and TypeScript give the same stats and scores on the same rows.

-- ---------- enums ----------
create type play_source as enum ('feed','direct','remix','featured','search','test','workspace');
create type rating_tag as enum ('fun','confusing','broken','ugly');
create type test_verdict as enum ('works','broken');
create type test_status as enum ('open','closed');

-- ---------- tables ----------
create table plays (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  version_id uuid not null references game_versions(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  source play_source not null default 'direct',
  duration_s double precision not null check (duration_s >= 0 and duration_s <= 14400),
  completed boolean not null default false,
  levels_completed integer not null default 0 check (levels_completed between 0 and 100),
  deaths integer not null default 0 check (deaths >= 0),
  created_at timestamptz not null default now()
);
create index plays_game_idx on plays(game_id, created_at);
create index plays_user_game_idx on plays(user_id, game_id);

create table ratings (
  game_id uuid not null references games(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  tag rating_tag not null,
  score smallint check (score between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

-- Snapshot written by refresh_game_stats() (nightly and on demand); the feed computes live from the same function.
create table game_stats (
  game_id uuid primary key references games(id) on delete cascade,
  players integer not null default 0,
  qualified_players integer not null default 0,
  plays integer not null default 0,
  completion_rate double precision not null default 0,
  avg_play_min double precision not null default 0,
  fun integer not null default 0,
  confusing integer not null default 0,
  broken integer not null default 0,
  ugly integer not null default 0,
  rating_count integer not null default 0,
  remixes integer not null default 0,
  engagement double precision not null default 0,
  quality double precision not null default 0,
  rank_score double precision not null default 0,
  is_broken boolean not null default false,
  computed_at timestamptz not null default now()
);
create index game_stats_rank_idx on game_stats(rank_score desc);

create table test_queue (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  version_id uuid not null references game_versions(id) on delete cascade,
  requested_by uuid not null references profiles(id),
  needed integer not null default 3 check (needed between 1 and 10),
  reward_credits integer not null default 5 check (reward_credits between 0 and 100),
  status test_status not null default 'open',
  outcome test_verdict,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create unique index test_queue_open_idx on test_queue(game_id, version_id) where status = 'open';

create table test_assignments (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid not null references test_queue(id) on delete cascade,
  game_id uuid not null references games(id) on delete cascade,
  version_id uuid not null references game_versions(id) on delete cascade,
  tester_id uuid not null references profiles(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  submitted_at timestamptz,
  verdict test_verdict,
  tag rating_tag,
  note text not null default '' check (char_length(note) <= 500),
  reward_paid integer not null default 0,
  unique (queue_id, tester_id)
);
create index test_assignments_tester_idx on test_assignments(tester_id, submitted_at);

-- ---------- row level security ----------
alter table plays enable row level security;
alter table ratings enable row level security;
alter table game_stats enable row level security;
alter table test_queue enable row level security;
alter table test_assignments enable row level security;

create policy "plays: own" on plays for select using (user_id = auth.uid());
create policy "ratings: own" on ratings for select using (user_id = auth.uid());
create policy "stats: public" on game_stats for select using (true);
create policy "test queue: signed in" on test_queue for select using (auth.uid() is not null);
create policy "assignments: tester or owner" on test_assignments for select using (
  tester_id = auth.uid() or exists (select 1 from games g where g.id = game_id and g.owner_id = auth.uid())
);
-- Writes go through the security-definer functions below only.

-- ---------- functions ----------

-- The user a community call acts for: the signed-in user, or the given user when the service role calls (workers and
-- the web server use the service key and pass the user they authenticated).
create or replace function community_user(p_user_id uuid)
returns uuid
language plpgsql stable as $$
declare caller uuid := auth.uid();
begin
  if coalesce(auth.role(), '') = 'service_role' then
    if p_user_id is null then raise exception 'user id required'; end if;
    return p_user_id;
  end if;
  if caller is null then raise exception 'sign in required'; end if;
  if p_user_id is not null and p_user_id <> caller then raise exception 'not allowed to act for another user'; end if;
  return caller;
end $$;

create or replace function record_play(p_user_id uuid, p_game_id uuid, p_version_id uuid, p_source play_source, p_duration_s double precision, p_completed boolean, p_levels_completed integer, p_deaths integer)
returns plays
language plpgsql security definer as $$
declare me uuid := community_user(p_user_id); r plays;
begin
  if not exists (select 1 from game_versions v where v.id = p_version_id and v.game_id = p_game_id) then raise exception 'version not found for this game'; end if;
  insert into plays (game_id, version_id, user_id, source, duration_s, completed, levels_completed, deaths)
    values (p_game_id, p_version_id, me, coalesce(p_source, 'direct'), p_duration_s, coalesce(p_completed, false), coalesce(p_levels_completed, 0), coalesce(p_deaths, 0))
    returning * into r;
  return r;
end $$;

create or replace function rate_game(p_user_id uuid, p_game_id uuid, p_tag rating_tag, p_score smallint default null)
returns ratings
language plpgsql security definer as $$
declare me uuid := community_user(p_user_id); r ratings;
begin
  insert into ratings (game_id, user_id, tag, score) values (p_game_id, me, p_tag, p_score)
    on conflict (game_id, user_id) do update set tag = excluded.tag, score = excluded.score, updated_at = now()
    returning * into r;
  return r;
end $$;

-- One game's stats as of p_now. Same formula as computeStats in packages/db/src/ranking.ts:
--   per player: minutes capped at 60 per UTC day, qualified with one play of 30 s, completed if any play finished;
--   owner plays and featured/search/test/workspace traffic excluded.
--   engagement = (Q * (0.5 * completion + 0.5 * min(avgMinutes / 10, 1)) + 3 * 0.3) / (Q + 3)
--   quality    = clamp01((fun + 2 - 2 * broken - 0.5 * confusing - 0.5 * ugly) / (ratings + 4))
--   rank       = (0.6 * engagement + 0.4 * quality + min(0.1, 0.025 * log2(1 + remixes))) * (0.5 + 0.5 * 0.5^(ageDays / 14))
--   broken     = (ratings >= 5 and broken / ratings > 0.3) or the latest closed test round said broken
create or replace function game_stats_for(p_game_id uuid, p_now timestamptz default now())
returns setof game_stats
language sql stable security definer as $$
  with g as (select * from games where id = p_game_id),
  counted as (
    select p.* from plays p join g on p.game_id = g.id
    where p.user_id <> g.owner_id and p.source not in ('featured','search','test','workspace')
  ),
  per_day as (
    select user_id, (created_at at time zone 'utc')::date as day, sum(duration_s) / 60.0 as minutes,
           bool_or(duration_s >= 30) as qualified, bool_or(completed) as completed
    from counted group by user_id, day
  ),
  per_user as (
    select user_id, sum(least(minutes, 60.0)) as minutes, bool_or(qualified) as qualified, bool_or(completed) as completed
    from per_day group by user_id
  ),
  agg as (
    select count(*)::int as players,
           (count(*) filter (where qualified))::int as q,
           coalesce(avg(minutes) filter (where qualified), 0)::double precision as avg_min,
           coalesce((count(*) filter (where qualified and completed))::double precision / nullif(count(*) filter (where qualified), 0), 0) as completion
    from per_user
  ),
  rt as (
    select count(*)::int as n,
           (count(*) filter (where r.tag = 'fun'))::int as fun,
           (count(*) filter (where r.tag = 'confusing'))::int as confusing,
           (count(*) filter (where r.tag = 'broken'))::int as broken,
           (count(*) filter (where r.tag = 'ugly'))::int as ugly
    from ratings r join g on r.game_id = g.id where r.user_id <> g.owner_id
  ),
  rx as (select count(*)::int as remixes from remix_lineage l where l.ancestor_game_id = p_game_id),
  tq as (select outcome from test_queue where game_id = p_game_id and status = 'closed' order by closed_at desc limit 1),
  calc as (
    select agg.*, rt.*, rx.remixes, (select outcome from tq) as test_outcome,
           (agg.q * (0.5 * agg.completion + 0.5 * least(agg.avg_min / 10.0, 1.0)) + 3 * 0.3) / (agg.q + 3) as engagement,
           greatest(0.0, least(1.0, (rt.fun + 2 - 2 * rt.broken - 0.5 * rt.confusing - 0.5 * rt.ugly)::double precision / (rt.n + 4))) as quality,
           0.5 + 0.5 * power(0.5, greatest(0.0, extract(epoch from (p_now - g.created_at)) / 86400.0) / 14.0) as freshness,
           least(0.1, 0.025 * (ln(1.0 + rx.remixes) / ln(2.0))) as remix_bonus,
           (select count(*) from counted)::int as play_count
    from agg, rt, rx, g
  )
  select p_game_id, players, q, play_count,
         round(completion::numeric, 6)::double precision,
         round(avg_min::numeric, 6)::double precision,
         fun, confusing, broken, ugly, n, remixes,
         round(engagement::numeric, 6)::double precision,
         round(quality::numeric, 6)::double precision,
         round(((0.6 * engagement + 0.4 * quality + remix_bonus) * freshness)::numeric, 6)::double precision,
         coalesce(n >= 5 and broken::double precision / nullif(n, 0) > 0.3, false) or coalesce(test_outcome = 'broken', false),
         p_now
  from calc
$$;

create or replace function refresh_game_stats(p_now timestamptz default now())
returns integer
language plpgsql security definer as $$
declare n integer;
begin
  insert into game_stats
    select s.* from games g cross join lateral game_stats_for(g.id, p_now) s
    where g.visibility = 'listed' or exists (select 1 from plays p where p.game_id = g.id) or exists (select 1 from ratings r where r.game_id = g.id)
  on conflict (game_id) do update set
    players = excluded.players, qualified_players = excluded.qualified_players, plays = excluded.plays,
    completion_rate = excluded.completion_rate, avg_play_min = excluded.avg_play_min,
    fun = excluded.fun, confusing = excluded.confusing, broken = excluded.broken, ugly = excluded.ugly,
    rating_count = excluded.rating_count, remixes = excluded.remixes, engagement = excluded.engagement,
    quality = excluded.quality, rank_score = excluded.rank_score, is_broken = excluded.is_broken, computed_at = excluded.computed_at;
  get diagnostics n = row_count;
  return n;
end $$;

-- The feed: listed, playable games whose head version is published and passed its playtest, not broken, by rank.
create or replace function feed(p_limit integer default 50, p_now timestamptz default now())
returns setof game_stats
language sql stable security definer as $$
  select s.* from games g
  join game_versions v on v.id = g.head_version_id
  cross join lateral game_stats_for(g.id, p_now) s
  where g.visibility = 'listed' and g.state in ('playable','published') and v.bundle_path is not null
    and coalesce((v.design #>> '{evidence,playtest,passed}')::boolean, true)
    and not s.is_broken
  order by s.rank_score desc, g.created_at desc
  limit greatest(1, least(p_limit, 200))
$$;

-- List (or unlist) a game. Listing needs the owner, an accepted head whose playtest passed, and no broken test verdict on it.
create or replace function set_listed(p_user_id uuid, p_game_id uuid, p_listed boolean)
returns games
language plpgsql security definer as $$
declare me uuid := community_user(p_user_id); g games; v game_versions;
begin
  select * into g from games where id = p_game_id for update;
  if g.id is null or g.owner_id <> me then raise exception 'game not found'; end if;
  if p_listed then
    select * into v from game_versions where id = g.head_version_id;
    if v.id is null or v.bundle_path is null or (v.design #>> '{evidence,playtest,passed}') = 'false' then
      raise exception 'the game needs an accepted version whose playtest passed before it can be listed';
    end if;
    if exists (select 1 from test_queue q where q.game_id = g.id and q.version_id = v.id and q.status = 'closed' and q.outcome = 'broken') then
      raise exception 'testers reported this version broken; publish a fixed version first';
    end if;
    update games set visibility = 'listed', state = 'published', updated_at = now() where id = g.id returning * into g;
  else
    update games set visibility = 'unlisted', state = case when state = 'published' then 'playable'::game_state else state end, updated_at = now() where id = g.id returning * into g;
  end if;
  return g;
end $$;

create or replace function enqueue_test(p_user_id uuid, p_game_id uuid, p_version_id uuid, p_needed integer default 3, p_reward integer default 5)
returns test_queue
language plpgsql security definer as $$
declare me uuid := community_user(p_user_id); q test_queue;
begin
  if not exists (select 1 from games g where g.id = p_game_id and g.owner_id = me) then raise exception 'game not found'; end if;
  if not exists (select 1 from game_versions v where v.id = p_version_id and v.game_id = p_game_id and v.bundle_path is not null) then
    raise exception 'version has no published bundle';
  end if;
  select * into q from test_queue where game_id = p_game_id and version_id = p_version_id and status = 'open';
  if q.id is not null then return q; end if;
  insert into test_queue (game_id, version_id, requested_by, needed, reward_credits) values (p_game_id, p_version_id, me, coalesce(p_needed, 3), coalesce(p_reward, 5))
    returning * into q;
  return q;
end $$;

-- The tester's live assignment, or a new one on the oldest open request that is not their game, not yet claimed by
-- them, and not already covered by live or submitted assignments.
create or replace function claim_test(p_user_id uuid)
returns test_assignments
language plpgsql security definer as $$
declare me uuid := community_user(p_user_id); a test_assignments; q test_queue;
begin
  select * into a from test_assignments where tester_id = me and submitted_at is null and expires_at > now() order by claimed_at limit 1;
  if a.id is not null then return a; end if;
  select tq.* into q from test_queue tq join games g on g.id = tq.game_id
    where tq.status = 'open' and g.owner_id <> me
      and not exists (select 1 from test_assignments x where x.queue_id = tq.id and x.tester_id = me)
      and (select count(*) from test_assignments x where x.queue_id = tq.id and (x.submitted_at is not null or x.expires_at > now())) < tq.needed
    order by tq.created_at
    for update of tq skip locked
    limit 1;
  if q.id is null then return null; end if;
  insert into test_assignments (queue_id, game_id, version_id, tester_id) values (q.id, q.game_id, q.version_id, me) returning * into a;
  return a;
end $$;

-- Needs a test play of at least 30 s since the claim; pays the reward into the ledger and closes the request (majority
-- verdict, a tie counts as broken) once enough reports are in.
create or replace function submit_test(p_user_id uuid, p_assignment_id uuid, p_verdict test_verdict, p_tag rating_tag, p_note text default '')
returns test_assignments
language plpgsql security definer as $$
declare me uuid := community_user(p_user_id); a test_assignments; q test_queue; done integer; works integer; bal integer;
begin
  select * into a from test_assignments where id = p_assignment_id for update;
  if a.id is null or a.tester_id <> me then raise exception 'assignment not found'; end if;
  if a.submitted_at is not null then raise exception 'this test was already submitted'; end if;
  if a.expires_at <= now() then raise exception 'this test claim expired; claim again'; end if;
  if not exists (select 1 from plays p where p.game_id = a.game_id and p.version_id = a.version_id and p.user_id = me and p.source = 'test' and p.duration_s >= 30 and p.created_at >= a.claimed_at) then
    raise exception 'play the game for at least 30 s before reporting';
  end if;
  select * into q from test_queue where id = a.queue_id for update;
  update test_assignments set submitted_at = now(), verdict = p_verdict, tag = p_tag, note = coalesce(p_note, ''), reward_paid = q.reward_credits
    where id = a.id returning * into a;
  if q.reward_credits > 0 then
    update profiles set credits_balance = credits_balance + q.reward_credits where id = me returning credits_balance into bal;
    insert into credits_ledger (user_id, delta, reason, ref_id, balance_after) values (me, q.reward_credits, 'test_reward', a.id, bal);
  end if;
  select count(*), count(*) filter (where verdict = 'works') into done, works from test_assignments where queue_id = q.id and submitted_at is not null;
  if done >= q.needed and q.status = 'open' then
    update test_queue set status = 'closed', closed_at = now(), outcome = case when works > done - works then 'works'::test_verdict else 'broken'::test_verdict end
      where id = q.id returning * into q;
    update games set listing = listing || jsonb_build_object('tested', jsonb_build_object('versionId', q.version_id, 'outcome', q.outcome, 'at', q.closed_at))
      where id = q.game_id;
  end if;
  return a;
end $$;

-- ---------- schedule ----------
-- Nightly snapshot of every listed game's stats (pg_cron is optional; without it, call refresh_game_stats() yourself).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('refresh-game-stats', '17 3 * * *', 'select refresh_game_stats()');
  end if;
end $$;
