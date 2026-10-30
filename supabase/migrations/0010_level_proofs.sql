-- Levels waiting for a winning run. A version's evidence names who proved each of its levels (design.evidence.proofs:
-- { "<level>": { "by": "solver" | "explorer" | "bot" | "human", "ticks": n } | null }); a level no bot could win is
-- null. Such a game is published and played, privately and in the test queue, and it is listed, and in the feed, only
-- once every level of its head has a recorded winning run. A player's winning run on a waiting level counts once a
-- worker has replayed it on that version and seen it win (job kind verify_proof). Versions published before this name
-- no proofs: every one of them was proven to be published.

alter type job_kind add value if not exists 'verify_proof';

create table if not exists level_proofs (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  version_id uuid not null references game_versions(id) on delete cascade,
  level text not null,
  submitted_by uuid not null references profiles(id) on delete cascade,
  -- The LevelProof the game sent: level, seed, ticks, by 'human', the input script.
  proof jsonb not null,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  reason text,
  job_id uuid references generation_jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists level_proofs_version on level_proofs (version_id, level);
-- One run of a level waits to be replayed at a time.
create unique index if not exists level_proofs_one_pending on level_proofs (version_id, level) where status = 'pending';
alter table level_proofs enable row level security;
-- The owner sees the runs recorded on their game, a player the runs they recorded. Writes go through the functions.
drop policy if exists "level proofs: owner or player" on level_proofs;
create policy "level proofs: owner or player" on level_proofs for select
  using (submitted_by = auth.uid() or exists (select 1 from games g where g.id = game_id and g.owner_id = auth.uid()));

-- The levels of a version (by its design) that wait for a recorded winning run.
create or replace function waiting_levels(p_design jsonb)
returns text[]
language sql immutable as $$
  select coalesce(array_agg(e.key order by e.key), '{}')
  from jsonb_each(case when jsonb_typeof(p_design #> '{evidence,proofs}') = 'object' then p_design #> '{evidence,proofs}' else '{}'::jsonb end) e
  where e.value = 'null'::jsonb
$$;

-- The feed: as in 0003, and every level of the head proven.
create or replace function feed(p_limit integer default 50, p_now timestamptz default now())
returns setof game_stats
language sql stable security definer as $$
  select s.* from games g
  join game_versions v on v.id = g.head_version_id
  cross join lateral game_stats_for(g.id, p_now) s
  where g.visibility = 'listed' and g.state in ('playable','published') and v.bundle_path is not null
    and coalesce((v.design #>> '{evidence,playtest,passed}')::boolean, true)
    and cardinality(waiting_levels(v.design)) = 0
    and not s.is_broken
  order by s.rank_score desc, g.created_at desc
  limit greatest(1, least(p_limit, 200))
$$;

-- Listing: as in 0004, and every level of the head proven.
create or replace function set_listed(p_user_id uuid, p_game_id uuid, p_listed boolean)
returns games
language plpgsql security definer as $$
declare me uuid := community_user(p_user_id); g games; v game_versions; waiting text[];
begin
  select * into g from games where id = p_game_id for update;
  if g.id is null or g.owner_id <> me then raise exception 'game not found'; end if;
  if p_listed then
    if g.state in ('removed','suspended') then raise exception 'the game is %; it cannot be listed until moderation clears it', g.state; end if;
    if active_strikes(g.owner_id) >= 3 then raise exception 'listing is blocked while the owner has 3 active strikes'; end if;
    if (g.listing #>> '{unlisted,versionId}') = g.head_version_id::text then raise exception 'a moderator unlisted this version; publish a fixed version first'; end if;
    select * into v from game_versions where id = g.head_version_id;
    if v.id is null or v.bundle_path is null or (v.design #>> '{evidence,playtest,passed}') = 'false' then
      raise exception 'the game needs an accepted version whose playtest passed before it can be listed';
    end if;
    waiting := waiting_levels(v.design);
    if cardinality(waiting) > 0 then
      raise exception '% % no recorded winning run yet: the game can be listed once a player finishes %',
        array_to_string(waiting, ', '), case when cardinality(waiting) = 1 then 'has' else 'have' end, case when cardinality(waiting) = 1 then 'it' else 'them' end;
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

-- A player's winning run on a level of a version that waits for one: stored pending, with a verify_proof job for the
-- game's owner that replays it. Null when the level does not wait or a run of it already waits to be replayed.
create or replace function submit_level_proof(p_user_id uuid, p_version_id uuid, p_level text, p_proof jsonb)
returns level_proofs
language plpgsql security definer as $$
declare me uuid := community_user(p_user_id); v game_versions; g games; r level_proofs; j uuid;
begin
  select * into v from game_versions where id = p_version_id;
  if v.id is null or not (p_level = any(waiting_levels(v.design))) then return null; end if;
  select * into g from games where id = v.game_id;
  if g.state in ('removed','suspended') then return null; end if;
  if exists (select 1 from level_proofs where version_id = v.id and level = p_level and status = 'pending') then return null; end if;
  insert into level_proofs (game_id, version_id, level, submitted_by, proof) values (g.id, v.id, p_level, me, p_proof) returning * into r;
  insert into generation_jobs (game_id, user_id, kind, input, priority) values (g.id, g.owner_id, 'verify_proof', jsonb_build_object('proofId', r.id), 1) returning id into j;
  update level_proofs set job_id = j where id = r.id returning * into r;
  return r;
end $$;

-- The replay's verdict, from the worker. Accepted: the version names the player's run as the level's proof, and other
-- runs waiting on the level are dropped. A run that comes after another proved the level counts for nothing more.
create or replace function resolve_level_proof(p_proof_id uuid, p_accepted boolean, p_reason text default null)
returns level_proofs
language plpgsql security definer as $$
declare p level_proofs; v game_versions;
begin
  select * into p from level_proofs where id = p_proof_id for update;
  if p.id is null then raise exception 'proof % not found', p_proof_id; end if;
  if p.status <> 'pending' then raise exception 'proof % is % already', p_proof_id, p.status; end if;
  select * into v from game_versions where id = p.version_id for update;
  if p_accepted and p.level = any(waiting_levels(v.design)) then
    update game_versions
      set design = jsonb_set(design, array['evidence', 'proofs', p.level], jsonb_build_object('by', 'human', 'ticks', coalesce((p.proof ->> 'ticks')::integer, 0)))
      where id = v.id;
    update level_proofs set status = 'accepted', reason = null, resolved_at = now() where id = p.id returning * into p;
    update level_proofs set status = 'rejected', reason = 'another run proved the level first', resolved_at = now()
      where version_id = p.version_id and level = p.level and status = 'pending';
  else
    update level_proofs
      set status = 'rejected', reason = case when p_accepted then 'another run proved the level first' else coalesce(p_reason, 'the run does not win on replay') end, resolved_at = now()
      where id = p.id returning * into p;
  end if;
  return p;
end $$;

-- Only the worker (the service role) gives verdicts.
revoke execute on function resolve_level_proof(uuid, boolean, text) from public, anon, authenticated;
