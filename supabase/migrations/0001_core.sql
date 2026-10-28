-- Core schema: identity, games and versions, style references, assets, jobs, model layer.
-- Community and moderation tables arrive in phase 3 (0003_community.sql).
create extension if not exists pgcrypto;

-- ---------- enums ----------
create type genre as enum ('platformer','survivors','topdown-action','metroidvania','shmup','puzzle','deckbuilder','lifesim','roguelike');
create type game_visibility as enum ('private','unlisted','listed');
create type game_state as enum ('draft','generating','playable','published','suspended','removed');
create type version_kind as enum ('stage','accepted','published');
create type job_kind as enum ('create','edit_parameter','edit_style','edit_behaviour','edit_content','edit_code','remix','republish');
create type job_status as enum ('queued','running','waiting_assets','needs_human','succeeded','failed','cancelled');
create type job_event_type as enum ('stage_started','gate_passed','gate_failed','retry','escalation','checkpoint','cost','warning','assistant_summary','needs_human','finished');
create type asset_kind as enum ('sprite','tileset','audio_sfx','music','font','ui');
create type asset_status as enum ('requested','generating','qa_failed','screened','ready','rejected','substituted');
create type style_source as enum ('catalog','extracted','manual','remix');
create type risk_tier as enum ('low','medium','high');
create type runner_kind as enum ('claude-sdk','open','structured');
create type failure_mode as enum ('spec_violation','repetition','context_loss','premature_done','no_verification','wrong_verification','api_misuse','schema_invalid','semantic_invalid','budget','infra');
create type credit_reason as enum ('purchase','generation','edit','test_reward','refund','admin');

-- ---------- identity ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique not null check (handle ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null default '',
  avatar_url text,
  credits_balance integer not null default 0,
  tester_reliability numeric(3,2) not null default 0.50,
  strikes_active integer not null default 0,
  plan text not null default 'free',
  training_opt_out boolean not null default false,
  created_at timestamptz not null default now()
);

create table credits_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  delta integer not null,
  reason credit_reason not null,
  ref_id uuid,
  balance_after integer not null,
  created_at timestamptz not null default now()
);
create index credits_ledger_user_idx on credits_ledger(user_id, created_at desc);

-- ---------- style references (the legal boundary lives here) ----------
create table reference_catalog (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  aliases text[] not null default '{}',
  card jsonb not null,
  blocked_terms text[] not null default '{}',
  risk_tier risk_tier not null default 'medium',
  curated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reference_catalog_title_idx on reference_catalog (lower(title));
create index reference_catalog_aliases_idx on reference_catalog using gin (aliases);

create table style_cards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  game_id uuid,
  name text not null,
  card jsonb not null,
  source style_source not null default 'manual',
  resolution_ids uuid[] not null default '{}',
  version integer not null default 1,
  prompt_prefix_hash text,
  created_at timestamptz not null default now()
);

-- ---------- games and versions ----------
create table games (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  slug text unique not null check (slug ~ '^[a-z0-9-]{3,64}$'),
  title text not null,
  genre genre not null,
  visibility game_visibility not null default 'private',
  state game_state not null default 'draft',
  head_version_id uuid,
  style_card_id uuid references style_cards(id),
  concept_md text,
  concept jsonb,
  listing jsonb not null default '{}',
  origin_version_id uuid,
  root_game_id uuid,
  remix_depth integer not null default 0,
  stats jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index games_owner_idx on games(owner_id);
create index games_listed_idx on games(visibility, state) where visibility = 'listed';

create table generation_jobs (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  kind job_kind not null,
  status job_status not null default 'queued',
  stage text,
  stages jsonb not null default '{}',
  input jsonb not null default '{}',
  base_version_id uuid,
  result_version_id uuid,
  policy_version integer not null default 1,
  budget_usd_cap numeric(8,2) not null default 15,
  cost_usd numeric(10,4) not null default 0,
  provider_cost_usd numeric(10,4) not null default 0,
  turns integer not null default 0,
  priority integer not null default 0,
  worker_id text,
  attempts integer not null default 0,
  error jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index generation_jobs_queue_idx on generation_jobs(priority desc, created_at) where status = 'queued';
create index generation_jobs_game_idx on generation_jobs(game_id, created_at desc);

create table game_versions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  number integer not null,
  kind version_kind not null,
  stage text,
  parent_version_id uuid references game_versions(id),
  job_id uuid references generation_jobs(id),
  source_path text,
  bundle_path text,
  manifest jsonb,
  design jsonb not null default '{}',
  gate_results jsonb not null default '{}',
  evidence jsonb not null default '{}',
  engine_version text,
  content_hash text,
  cost_usd numeric(10,4) not null default 0,
  policy_version integer,
  is_head boolean not null default false,
  created_at timestamptz not null default now(),
  unique (game_id, number)
);
alter table games add constraint games_head_version_fk foreign key (head_version_id) references game_versions(id);
alter table games add constraint games_origin_version_fk foreign key (origin_version_id) references game_versions(id);
alter table style_cards add constraint style_cards_game_fk foreign key (game_id) references games(id) on delete set null;

create table remix_lineage (
  game_id uuid not null references games(id) on delete cascade,
  ancestor_game_id uuid not null references games(id) on delete cascade,
  depth integer not null,
  forked_from_version_id uuid references game_versions(id),
  license text not null default 'gg-remix-1.0',
  primary key (game_id, ancestor_game_id)
);
create index remix_lineage_ancestor_idx on remix_lineage(ancestor_game_id);

create table reference_resolutions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  game_id uuid references games(id) on delete cascade,
  query_text text not null,
  matched_reference_id uuid references reference_catalog(id),
  extracted_card jsonb,
  confirmed_card jsonb,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- assets ----------
create table assets (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  version_id uuid references game_versions(id),
  key text not null,
  kind asset_kind not null,
  status asset_status not null default 'requested',
  request jsonb not null,
  storage_path text,
  width integer,
  height integer,
  frames integer,
  bytes integer,
  qa jsonb,
  ip_screen jsonb,
  attempt integer not null default 1,
  provider text,
  provider_model text,
  prompt_hash text,
  created_at timestamptz not null default now(),
  unique (game_id, key, attempt)
);

create table asset_provenance (
  asset_id uuid primary key references assets(id) on delete cascade,
  tool text not null,
  model_version text,
  prompt text,
  negative_prompt text,
  "references" jsonb not null default '[]',
  postprocess jsonb not null default '[]',
  human_edits jsonb not null default '[]',
  license_grant jsonb,
  commercial_ok boolean not null default false,
  watermark text
);

-- ---------- jobs: events and reports ----------
create table job_events (
  id bigserial primary key,
  job_id uuid not null references generation_jobs(id) on delete cascade,
  seq integer not null,
  ts timestamptz not null default now(),
  stage text,
  type job_event_type not null,
  payload jsonb not null default '{}',
  unique (job_id, seq)
);

create table playtest_reports (
  id uuid primary key default gen_random_uuid(),
  version_id uuid references game_versions(id) on delete cascade,
  job_id uuid references generation_jobs(id) on delete cascade,
  seed integer not null,
  bots text[] not null default '{}',
  summary jsonb not null,
  juice jsonb,
  budget jsonb,
  art_review jsonb,
  contact_sheet_path text,
  passed boolean not null,
  created_at timestamptz not null default now()
);

-- ---------- model layer ----------
create table model_policies (
  version integer primary key,
  name text not null,
  stages jsonb not null,
  job_caps jsonb not null,
  active boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index model_policies_one_active on model_policies(active) where active;

create table trajectories (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references generation_jobs(id) on delete cascade,
  stage text not null,
  attempt integer not null,
  sample_idx integer not null default 0,
  runner runner_kind not null,
  provider text not null,
  model text not null,
  prompt_hash text,
  input_tokens integer not null default 0,
  cached_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(10,4) not null default 0,
  duration_ms integer not null default 0,
  passed boolean not null,
  gate_report_path text,
  failure_mode failure_mode,
  artifact_path text,
  scrubbed boolean not null default false,
  created_at timestamptz not null default now()
);
create index trajectories_stage_idx on trajectories(stage, passed, created_at desc);

create table eval_cases (
  id uuid primary key default gen_random_uuid(),
  prompt text not null,
  genre genre not null,
  scope text not null default 'small',
  expected_gates text[] not null default '{}',
  origin text not null default 'synthetic',
  source_trajectory_id uuid references trajectories(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table eval_runs (
  id uuid primary key default gen_random_uuid(),
  policy_version integer not null references model_policies(version),
  case_id uuid not null references eval_cases(id) on delete cascade,
  k integer not null default 1,
  pass_k numeric(4,3),
  cost_usd numeric(10,4) not null default 0,
  duration_ms integer not null default 0,
  gate_results jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table playbook_entries (
  id uuid primary key default gen_random_uuid(),
  genre genre,
  stage text not null,
  text text not null,
  source_trajectory_id uuid references trajectories(id),
  verified boolean not null default false,
  hits integer not null default 0,
  retired_at timestamptz,
  created_at timestamptz not null default now()
);

create table training_pairs (
  id uuid primary key default gen_random_uuid(),
  stage text not null,
  genre genre,
  input jsonb not null,
  output jsonb,
  output_path text,
  verified_by text,
  policy_version integer,
  exported_at timestamptz,
  created_at timestamptz not null default now()
);

create table distill_runs (
  id uuid primary key default gen_random_uuid(),
  stage text not null,
  base_model text not null,
  provider text not null,
  pairs_count integer not null,
  cost_usd numeric(10,4) not null default 0,
  bench_pass_k numeric(4,3),
  promoted boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- storage buckets ----------
insert into storage.buckets (id, name, public) values
  ('engine', 'engine', true),
  ('bundles', 'bundles', true),
  ('checkpoints', 'checkpoints', false),
  ('asset-raw', 'asset-raw', false),
  ('asset-final', 'asset-final', true),
  ('screenshots', 'screenshots', true),
  ('references', 'references', false),
  ('trajectories', 'trajectories', false)
on conflict (id) do nothing;

-- ---------- row level security ----------
alter table profiles enable row level security;
alter table credits_ledger enable row level security;
alter table games enable row level security;
alter table game_versions enable row level security;
alter table generation_jobs enable row level security;
alter table job_events enable row level security;
alter table style_cards enable row level security;
alter table reference_resolutions enable row level security;
alter table reference_catalog enable row level security;
alter table assets enable row level security;
alter table asset_provenance enable row level security;
alter table playtest_reports enable row level security;
alter table remix_lineage enable row level security;
alter table model_policies enable row level security;
alter table trajectories enable row level security;
alter table eval_cases enable row level security;
alter table eval_runs enable row level security;
alter table playbook_entries enable row level security;
alter table training_pairs enable row level security;
alter table distill_runs enable row level security;

create policy "profiles are readable" on profiles for select using (true);
create policy "own profile" on profiles for update using (auth.uid() = id);
create policy "own ledger" on credits_ledger for select using (auth.uid() = user_id);
create policy "games: owner or listed" on games for select using (owner_id = auth.uid() or visibility in ('listed','unlisted'));
create policy "games: owner writes" on games for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "versions: via game" on game_versions for select using (exists (select 1 from games g where g.id = game_id and (g.owner_id = auth.uid() or g.visibility in ('listed','unlisted'))));
create policy "jobs: owner" on generation_jobs for select using (user_id = auth.uid());
create policy "jobs: owner inserts" on generation_jobs for insert with check (user_id = auth.uid());
create policy "events: job owner" on job_events for select using (exists (select 1 from generation_jobs j where j.id = job_id and j.user_id = auth.uid()));
create policy "style cards: owner" on style_cards for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "resolutions: owner" on reference_resolutions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "catalog: public cards" on reference_catalog for select using (true);
create policy "assets: via game" on assets for select using (exists (select 1 from games g where g.id = game_id and (g.owner_id = auth.uid() or g.visibility in ('listed','unlisted'))));
create policy "reports: via version" on playtest_reports for select using (exists (select 1 from game_versions v join games g on g.id = v.game_id where v.id = version_id and (g.owner_id = auth.uid() or g.visibility in ('listed','unlisted'))));
create policy "lineage: public" on remix_lineage for select using (true);
-- model-layer tables are service-role only (no policies => no anon/auth access).

-- Hide blocked_terms from non-service readers through a view.
create view reference_catalog_public as
  select id, title, aliases, card, risk_tier, updated_at from reference_catalog;

-- ---------- RPCs ----------
create or replace function claim_job(p_worker_id text)
returns generation_jobs
language plpgsql security definer as $$
declare j generation_jobs;
begin
  select * into j from generation_jobs
    where status = 'queued'
    order by priority desc, created_at
    for update skip locked
    limit 1;
  if j.id is null then return null; end if;
  update generation_jobs
    set status = 'running', worker_id = p_worker_id, started_at = now(), attempts = attempts + 1
    where id = j.id
    returning * into j;
  return j;
end $$;

create or replace function accept_version(p_version_id uuid)
returns void
language plpgsql security definer as $$
declare v game_versions;
begin
  select * into v from game_versions where id = p_version_id;
  if v.id is null then raise exception 'version not found'; end if;
  update game_versions set is_head = false where game_id = v.game_id and is_head;
  update game_versions set is_head = true, kind = 'accepted' where id = v.id;
  update games set head_version_id = v.id, state = 'playable', updated_at = now() where id = v.game_id;
end $$;

create or replace function fork_game(p_origin_version_id uuid, p_new_owner uuid, p_slug text, p_title text)
returns games
language plpgsql security definer as $$
declare
  origin game_versions;
  src games;
  g games;
begin
  select * into origin from game_versions where id = p_origin_version_id;
  if origin.id is null then raise exception 'origin version not found'; end if;
  select * into src from games where id = origin.game_id;
  insert into games (owner_id, slug, title, genre, state, concept_md, concept, origin_version_id, root_game_id, remix_depth, style_card_id)
    values (p_new_owner, p_slug, p_title, src.genre, 'draft', src.concept_md, src.concept, origin.id, coalesce(src.root_game_id, src.id), src.remix_depth + 1, src.style_card_id)
    returning * into g;
  insert into remix_lineage (game_id, ancestor_game_id, depth, forked_from_version_id)
    select g.id, l.ancestor_game_id, l.depth + 1, origin.id from remix_lineage l where l.game_id = src.id;
  insert into remix_lineage (game_id, ancestor_game_id, depth, forked_from_version_id)
    values (g.id, src.id, 1, origin.id);
  return g;
end $$;

-- ---------- seed: the first model policy (frontier only; k=1, no escalation) ----------
insert into model_policies (version, name, stages, job_caps, active) values (
  1,
  'frontier-v1',
  '{
    "gdd":       {"runner":"claude-sdk","provider":"anthropic","model":"claude-opus-5-5","effort":"high","k":1,"repairRounds":2,"caps":{"turns":40,"usd":1.5,"wallMin":10}},
    "systems":   {"runner":"structured","provider":"anthropic","model":"claude-opus-5-5","effort":"medium","k":1,"repairRounds":2,"caps":{"turns":0,"usd":0.5,"wallMin":5}},
    "behaviour": {"runner":"structured","provider":"anthropic","model":"claude-sonnet-5-5","effort":"medium","k":1,"repairRounds":2,"caps":{"turns":0,"usd":0.5,"wallMin":5}},
    "implement": {"runner":"claude-sdk","provider":"anthropic","model":"claude-sonnet-5-5","effort":"medium","k":1,"repairRounds":2,"escalateTo":{"provider":"anthropic","model":"claude-opus-5-5","effort":"high"},"caps":{"turns":120,"usd":4,"wallMin":30}},
    "levels":    {"runner":"claude-sdk","provider":"anthropic","model":"claude-sonnet-5-5","effort":"low","k":1,"repairRounds":2,"caps":{"turns":60,"usd":1,"wallMin":15}},
    "integrate": {"runner":"claude-sdk","provider":"anthropic","model":"claude-sonnet-5-5","effort":"medium","k":1,"repairRounds":1,"caps":{"turns":40,"usd":1,"wallMin":10}},
    "playtest":  {"runner":"claude-sdk","provider":"anthropic","model":"claude-haiku-5-5","effort":"low","k":1,"repairRounds":0,"caps":{"turns":30,"usd":0.5,"wallMin":15}},
    "juice":     {"runner":"claude-sdk","provider":"anthropic","model":"claude-sonnet-5-5","effort":"medium","k":1,"repairRounds":1,"caps":{"turns":40,"usd":1,"wallMin":10}},
    "review":    {"runner":"claude-sdk","provider":"anthropic","model":"claude-sonnet-5-5","effort":"low","k":1,"repairRounds":1,"caps":{"turns":25,"usd":0.75,"wallMin":8}}
  }'::jsonb,
  '{"softUsd":10,"hardUsd":15,"providerUsd":3,"wallMin":90}'::jsonb,
  true
);
