-- Moderation: player reports, suspension pending review, moderator resolutions, takedowns, strikes; and the privileges
-- that keep clients from writing around them (the last section).
-- Same rules as the file store (packages/db/src/file-store.ts, MODERATION in ranking.ts); migrations.test.ts runs them.

create type report_kind as enum ('ip','abuse','broken','other');
create type report_status as enum ('open','resolved');
create type report_resolution as enum ('dismiss','unlist','warn','license','remove');
create type takedown_action as enum ('removed','licensed');

alter table profiles add column if not exists is_moderator boolean not null default false;

create table reports (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  version_id uuid references game_versions(id) on delete set null,
  reporter_id uuid not null references profiles(id) on delete cascade,
  kind report_kind not null,
  note text not null default '' check (char_length(note) <= 1000),
  rights_holder boolean not null default false,
  status report_status not null default 'open',
  resolution report_resolution,
  resolved_by uuid references profiles(id),
  resolution_note text not null default '' check (char_length(resolution_note) <= 1000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index reports_open_idx on reports(game_id, reporter_id, kind) where status = 'open';
create index reports_status_idx on reports(status, created_at);

create table strikes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  report_id uuid not null references reports(id) on delete cascade,
  game_id uuid references games(id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days'
);
create index strikes_user_idx on strikes(user_id, expires_at);

create table takedowns (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  report_id uuid not null references reports(id) on delete cascade,
  action takedown_action not null,
  terms text not null default '',
  moderator_id uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

alter table reports enable row level security;
alter table strikes enable row level security;
alter table takedowns enable row level security;

create or replace function is_moderator(p_user uuid)
returns boolean
language sql stable security definer as $$
  select coalesce((select is_moderator from profiles where id = p_user), false)
$$;

create policy "reports: reporter or moderator" on reports for select using (reporter_id = auth.uid() or is_moderator(auth.uid()));
create policy "strikes: own or moderator" on strikes for select using (user_id = auth.uid() or is_moderator(auth.uid()));
create policy "takedowns: public" on takedowns for select using (true);

create or replace function active_strikes(p_user uuid)
returns integer
language sql stable security definer as $$
  select count(*)::int from strikes where user_id = p_user and expires_at > now()
$$;

-- Distinct players with open ip, abuse or broken reports on a game (three suspend it).
create or replace function suspending_reporters(p_game_id uuid)
returns integer
language sql stable security definer as $$
  select count(distinct reporter_id)::int from reports where game_id = p_game_id and status = 'open' and kind in ('ip','abuse','broken')
$$;

create or replace function report_game(p_user_id uuid, p_game_id uuid, p_kind report_kind, p_note text default '', p_rights_holder boolean default false)
returns reports
language plpgsql security definer as $$
declare me uuid := community_user(p_user_id); g games; r reports;
begin
  select * into g from games where id = p_game_id for update;
  if g.id is null then raise exception 'game not found'; end if;
  if g.owner_id = me then raise exception 'you cannot report your own game'; end if;
  if g.state = 'removed' then raise exception 'this game was already removed'; end if;
  update reports set note = coalesce(p_note, ''), rights_holder = coalesce(p_rights_holder, false)
    where game_id = p_game_id and reporter_id = me and kind = p_kind and status = 'open'
    returning * into r;
  if r.id is null then
    insert into reports (game_id, version_id, reporter_id, kind, note, rights_holder)
      values (p_game_id, g.head_version_id, me, p_kind, coalesce(p_note, ''), coalesce(p_rights_holder, false))
      returning * into r;
  end if;
  if g.state not in ('removed','suspended') and suspending_reporters(p_game_id) >= 3 then
    update games set state = 'suspended', updated_at = now() where id = p_game_id;
  end if;
  return r;
end $$;

create or replace function resolve_report(p_user_id uuid, p_report_id uuid, p_resolution report_resolution, p_note text default '')
returns reports
language plpgsql security definer as $$
declare me uuid := community_user(p_user_id); r reports; g games;
begin
  if not is_moderator(me) then raise exception 'only moderators can resolve reports'; end if;
  select * into r from reports where id = p_report_id for update;
  if r.id is null then raise exception 'report not found'; end if;
  if r.status <> 'open' then raise exception 'this report is already resolved'; end if;
  select * into g from games where id = r.game_id for update;
  if g.owner_id = me then raise exception 'moderators cannot resolve reports on their own games'; end if;
  if p_resolution = 'license' and r.kind <> 'ip' then raise exception 'only ip reports can be settled by licence'; end if;
  if p_resolution = 'warn' and r.kind = 'broken' then raise exception 'a broken game is not misconduct: unlist it until it is fixed, or dismiss the report'; end if;
  update reports set status = 'resolved', resolution = p_resolution, resolved_by = me, resolution_note = coalesce(p_note, ''), resolved_at = now()
    where id = r.id returning * into r;
  if p_resolution in ('remove','warn') then
    insert into strikes (user_id, report_id, game_id, reason) values (g.owner_id, r.id, g.id, r.kind || ': ' || p_resolution);
  end if;
  if p_resolution in ('remove','unlist') then
    update reports set status = 'resolved', resolution = p_resolution, resolved_by = me, resolution_note = coalesce(p_note, ''), resolved_at = now()
      where game_id = g.id and status = 'open';
  end if;
  if p_resolution = 'remove' then
    update games set state = 'removed', visibility = 'unlisted', updated_at = now() where id = g.id returning * into g;
    insert into takedowns (game_id, report_id, action, terms, moderator_id) values (g.id, r.id, 'removed', coalesce(p_note, ''), me);
    -- Unedited remixes serve the removed game's bundle: they come down with it, without a strike for their owners.
    with copies as (
      update games c set state = 'removed', visibility = 'unlisted', updated_at = now()
        from game_versions hv
        where hv.id = c.head_version_id and c.id <> g.id and c.state <> 'removed' and hv.bundle_path like 'bundles/g/' || g.id::text || '/%'
        returning c.id
    ), closed as (
      update reports set status = 'resolved', resolution = 'remove', resolved_by = me, resolution_note = coalesce(p_note, ''), resolved_at = now()
        where status = 'open' and game_id in (select id from copies)
    )
    insert into takedowns (game_id, report_id, action, terms, moderator_id) select id, r.id, 'removed', coalesce(p_note, ''), me from copies;
  elsif p_resolution = 'unlist' then
    update games set visibility = 'unlisted', state = case when state in ('published','suspended') then 'playable'::game_state else state end,
      listing = listing || jsonb_build_object('unlisted', jsonb_build_object('versionId', head_version_id, 'reportId', r.id, 'note', coalesce(p_note, ''), 'at', now()))
      where id = g.id returning * into g;
  elsif p_resolution = 'license' then
    update games set listing = listing || jsonb_build_object('license', jsonb_build_object('terms', coalesce(p_note, ''), 'reportId', r.id, 'at', now()))
      where id = g.id returning * into g;
    insert into takedowns (game_id, report_id, action, terms, moderator_id) values (g.id, r.id, 'licensed', coalesce(p_note, ''), me);
  end if;
  if g.state = 'suspended' and suspending_reporters(g.id) < 3 then
    update games set state = case when visibility = 'listed' then 'published'::game_state else 'playable'::game_state end, updated_at = now() where id = g.id;
  end if;
  return r;
end $$;

-- Listing also needs the game to be neither removed nor suspended, its head not unlisted by a moderator, and its owner
-- to have fewer than three active strikes.
create or replace function set_listed(p_user_id uuid, p_game_id uuid, p_listed boolean)
returns games
language plpgsql security definer as $$
declare me uuid := community_user(p_user_id); g games; v game_versions;
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
    if exists (select 1 from test_queue q where q.game_id = g.id and q.version_id = v.id and q.status = 'closed' and q.outcome = 'broken') then
      raise exception 'testers reported this version broken; publish a fixed version first';
    end if;
    update games set visibility = 'listed', state = 'published', updated_at = now() where id = g.id returning * into g;
  else
    update games set visibility = 'unlisted', state = case when state = 'published' then 'playable'::game_state else state end, updated_at = now() where id = g.id returning * into g;
  end if;
  return g;
end $$;

-- Remix as the signed-in user (the service role names the owner); a removed or suspended game cannot be remixed.
create or replace function fork_game(p_origin_version_id uuid, p_new_owner uuid, p_slug text, p_title text)
returns games
language plpgsql security definer as $$
declare
  me uuid := community_user(p_new_owner);
  origin game_versions;
  src games;
  g games;
begin
  select * into origin from game_versions where id = p_origin_version_id;
  if origin.id is null then raise exception 'origin version not found'; end if;
  select * into src from games where id = origin.game_id;
  if src.state in ('removed','suspended') then raise exception 'the game is %; it cannot be remixed', src.state; end if;
  insert into games (owner_id, slug, title, genre, state, concept_md, concept, origin_version_id, root_game_id, remix_depth, style_card_id)
    values (me, p_slug, p_title, src.genre, 'draft', src.concept_md, src.concept, origin.id, coalesce(src.root_game_id, src.id), src.remix_depth + 1, src.style_card_id)
    returning * into g;
  insert into remix_lineage (game_id, ancestor_game_id, depth, forked_from_version_id)
    select g.id, l.ancestor_game_id, l.depth + 1, origin.id from remix_lineage l where l.game_id = src.id;
  insert into remix_lineage (game_id, ancestor_game_id, depth, forked_from_version_id)
    values (g.id, src.id, 1, origin.id);
  return g;
end $$;

-- Test rounds (0003) are not for moderated games: owners cannot ask for testers, testers are not handed one.
create or replace function enqueue_test(p_user_id uuid, p_game_id uuid, p_version_id uuid, p_needed integer default 3, p_reward integer default 5)
returns test_queue
language plpgsql security definer as $$
declare me uuid := community_user(p_user_id); g games; q test_queue;
begin
  select * into g from games where id = p_game_id and owner_id = me;
  if g.id is null then raise exception 'game not found'; end if;
  if g.state in ('removed','suspended') then raise exception 'the game is %; testers cannot be asked until moderation clears it', g.state; end if;
  if not exists (select 1 from game_versions v where v.id = p_version_id and v.game_id = p_game_id and v.bundle_path is not null) then
    raise exception 'version has no published bundle';
  end if;
  select * into q from test_queue where game_id = p_game_id and version_id = p_version_id and status = 'open';
  if q.id is not null then return q; end if;
  insert into test_queue (game_id, version_id, requested_by, needed, reward_credits) values (p_game_id, p_version_id, me, coalesce(p_needed, 3), coalesce(p_reward, 5))
    returning * into q;
  return q;
end $$;

create or replace function claim_test(p_user_id uuid)
returns test_assignments
language plpgsql security definer as $$
declare me uuid := community_user(p_user_id); a test_assignments; q test_queue;
begin
  select * into a from test_assignments where tester_id = me and submitted_at is null and expires_at > now() order by claimed_at limit 1;
  if a.id is not null then return a; end if;
  select tq.* into q from test_queue tq join games g on g.id = tq.game_id
    where tq.status = 'open' and g.owner_id <> me and g.state not in ('removed','suspended')
      and not exists (select 1 from test_assignments x where x.queue_id = tq.id and x.tester_id = me)
      and (select count(*) from test_assignments x where x.queue_id = tq.id and (x.submitted_at is not null or x.expires_at > now())) < tq.needed
    order by tq.created_at
    for update of tq skip locked
    limit 1;
  if q.id is null then return null; end if;
  insert into test_assignments (queue_id, game_id, version_id, tester_id) values (q.id, q.game_id, q.version_id, me) returning * into a;
  return a;
end $$;

-- A new version neither lifts moderation nor unpublishes a listed game (0001 set every accepted game playable).
create or replace function accept_version(p_version_id uuid)
returns void
language plpgsql security definer as $$
declare v game_versions;
begin
  select * into v from game_versions where id = p_version_id;
  if v.id is null then raise exception 'version not found'; end if;
  update game_versions set is_head = false where game_id = v.game_id and is_head;
  update game_versions set is_head = true, kind = 'accepted' where id = v.id;
  update games set head_version_id = v.id, state = case when state in ('removed','suspended','published') then state else 'playable'::game_state end, updated_at = now()
    where id = v.game_id;
end $$;

-- ---------- privileges ----------
-- Supabase grants every table and function in public to anon and authenticated; RLS then picks rows, not columns. So
-- without this, an owner could update their game's state, visibility, listing or head directly (undoing a takedown),
-- any user could set their own credits or moderator flag, enqueue jobs on another user's game, or claim jobs.
-- Clients keep: their profile's presentation fields, their games' titles, and the functions that check the caller.
revoke insert, update, delete on profiles, games, generation_jobs from anon, authenticated;
grant update (handle, display_name, avatar_url, training_opt_out) on profiles to authenticated;
grant update (title) on games to authenticated;
drop policy if exists "jobs: owner inserts" on generation_jobs;
revoke execute on function claim_job(text), accept_version(uuid), refresh_game_stats(timestamptz), active_strikes(uuid), suspending_reporters(uuid) from public, anon, authenticated;
grant execute on function claim_job(text), accept_version(uuid), refresh_game_stats(timestamptz), active_strikes(uuid), suspending_reporters(uuid) to service_role;
