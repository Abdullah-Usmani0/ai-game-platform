-- Distillation data: the worker records a verified (input -> artifact) pair for every model-written artifact of a stage
-- whose gate passed (workers/generator/src/training.ts), and tools/distill exports them per stage as chat-format JSONL.
-- A pair names everyone whose content it carries (the requester, the game's owner, the owners of the games it was
-- remixed from). Opting out (profiles.training_opt_out) or deleting the profile removes every pair the user is in, and
-- no pair naming an opted-out user is stored. Same rules as the file store; migrations.test.ts runs them.

alter table training_pairs
  add column if not exists artifact text not null default '',
  add column if not exists input_hash text not null default '',
  add column if not exists model text not null default '',
  add column if not exists provider text not null default '',
  add column if not exists job_id uuid references generation_jobs(id) on delete set null,
  add column if not exists game_id uuid references games(id) on delete cascade,
  add column if not exists contributors uuid[] not null default '{}';
create index if not exists training_pairs_stage_idx on training_pairs(stage, exported_at, created_at);
create index if not exists training_pairs_contributors_idx on training_pairs using gin (contributors);

-- Security definer: the trigger reads opt-outs and the forget trigger runs on a user's own profile update, while the
-- table itself is service-role only.
create or replace function training_pairs_consent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from profiles where id = any(new.contributors) and training_opt_out) then return null; end if;
  return new;
end $$;
create trigger training_pairs_consent before insert on training_pairs for each row execute function training_pairs_consent();

create or replace function forget_training_pairs() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from training_pairs where old.id = any(contributors);
  return null;
end $$;
create trigger profiles_training_opt_out after update of training_opt_out on profiles
  for each row when (new.training_opt_out and not old.training_opt_out) execute function forget_training_pairs();
create trigger profiles_forget_training after delete on profiles for each row execute function forget_training_pairs();

-- Prompts are user content: nothing reaches a client, whatever policies are added later.
revoke all on training_pairs, distill_runs from anon, authenticated;
