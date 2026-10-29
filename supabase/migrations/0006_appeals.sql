-- Appeals of removals: a removed game's owner asks for it back. For an ip takedown it is a DMCA counter-notice
-- (statement, contact, consent to jurisdiction) and the game can be restored 14 days after it is filed, the window the
-- claimant has to go to court (MODERATION.counterNoticeDays); any other removal takes a plain appeal decided at once.
-- Reinstating restores everything the takedown's report removed (the game and its unedited remixes) as playable and
-- unlisted, and voids the report's strikes; the stores move the quarantined bundles back. Same rules as the file
-- store (packages/db/src/file-store.ts); migrations.test.ts runs them.

create type appeal_status as enum ('open','reinstated','upheld');

alter table takedowns add column if not exists reverted_at timestamptz;

create table appeals (
  id uuid primary key default gen_random_uuid(),
  takedown_id uuid not null unique references takedowns(id) on delete cascade,
  game_id uuid not null references games(id) on delete cascade,
  owner_id uuid not null references profiles(id) on delete cascade,
  statement text not null check (char_length(statement) between 20 and 2000),
  contact_name text not null check (char_length(contact_name) between 1 and 120),
  contact_email text not null check (char_length(contact_email) between 3 and 200),
  consent boolean not null default false,
  status appeal_status not null default 'open',
  reinstate_after timestamptz not null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references profiles(id),
  decision_note text not null default '' check (char_length(decision_note) <= 1000)
);
create index appeals_status_idx on appeals(status, created_at);

alter table appeals enable row level security;
create policy "appeals: owner or moderator" on appeals for select using (owner_id = auth.uid() or is_moderator(auth.uid()));

create or replace function appeal_takedown(p_user_id uuid, p_game_id uuid, p_statement text, p_name text, p_email text, p_consent boolean default false)
returns appeals
language plpgsql security definer as $$
declare me uuid := community_user(p_user_id); g games; t takedowns; k report_kind; a appeals;
begin
  select * into g from games where id = p_game_id for update;
  if g.id is null or g.owner_id <> me then raise exception 'game not found'; end if;
  if g.state <> 'removed' then raise exception 'only a removed game can be appealed'; end if;
  select * into t from takedowns where game_id = g.id and action = 'removed' and reverted_at is null order by created_at desc limit 1;
  if t.id is null then raise exception 'no standing takedown to appeal'; end if;
  if exists (select 1 from appeals where takedown_id = t.id) then raise exception 'this takedown was already appealed'; end if;
  select kind into k from reports where id = t.report_id;
  if k = 'ip' and not coalesce(p_consent, false) then
    raise exception 'a counter-notice needs your consent to the jurisdiction of the courts and to accept service from the claimant';
  end if;
  insert into appeals (takedown_id, game_id, owner_id, statement, contact_name, contact_email, consent, reinstate_after)
    values (t.id, g.id, me, p_statement, p_name, p_email, coalesce(p_consent, false), now() + case when k = 'ip' then interval '14 days' else interval '0 seconds' end)
    returning * into a;
  return a;
end $$;

create or replace function decide_appeal(p_user_id uuid, p_appeal_id uuid, p_decision text, p_note text default '')
returns appeals
language plpgsql security definer as $$
declare me uuid := community_user(p_user_id); a appeals; t takedowns;
begin
  if not is_moderator(me) then raise exception 'only moderators can decide appeals'; end if;
  select * into a from appeals where id = p_appeal_id for update;
  if a.id is null then raise exception 'appeal not found'; end if;
  if a.status <> 'open' then raise exception 'this appeal is already decided'; end if;
  if a.owner_id = me then raise exception 'moderators cannot decide appeals on their own games'; end if;
  if p_decision is null or p_decision not in ('reinstate','uphold') then raise exception 'decision must be reinstate or uphold'; end if;
  if p_decision = 'reinstate' then
    if now() < a.reinstate_after then
      raise exception 'a counter-notice waits 14 days for the claimant to go to court; the game can be restored from %', a.reinstate_after;
    end if;
    select * into t from takedowns where id = a.takedown_id;
    -- Everything this report took down comes back: the game and the unedited remixes removed with it.
    update games g set state = 'playable', visibility = 'unlisted', updated_at = now()
      from takedowns x
      where x.report_id = t.report_id and x.action = 'removed' and x.reverted_at is null and g.id = x.game_id and g.state = 'removed';
    update takedowns set reverted_at = now() where report_id = t.report_id and action = 'removed' and reverted_at is null;
    delete from strikes where report_id = t.report_id;
  end if;
  update appeals set status = case when p_decision = 'reinstate' then 'reinstated'::appeal_status else 'upheld'::appeal_status end,
    decided_at = now(), decided_by = me, decision_note = coalesce(p_note, '')
    where id = a.id returning * into a;
  return a;
end $$;
