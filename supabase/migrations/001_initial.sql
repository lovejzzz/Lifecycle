-- Lifecycle — Initial Schema
-- Tables: profiles, projects, project_data
-- RLS enabled on all tables; policies scope access to the authenticated user.

-- ── profiles ────────────────────────────────────────────────────────────────
-- One row per auth user. Auto-created via trigger on sign-up.

create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- ── projects ────────────────────────────────────────────────────────────────
-- Lightweight metadata per project (mirrors ProjectMeta in storage.ts).

create table if not exists public.projects (
  id            text primary key,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  name          text not null default 'Untitled',
  node_count    int not null default 0,
  edge_count    int not null default 0,
  created_at    timestamptz not null default now(),
  last_modified timestamptz not null default now()
);

create index idx_projects_user_id on public.projects(user_id);

alter table public.projects enable row level security;

create policy "Users can read own projects"
  on public.projects for select
  using (auth.uid() = user_id);

create policy "Users can insert own projects"
  on public.projects for insert
  with check (auth.uid() = user_id);

create policy "Users can update own projects"
  on public.projects for update
  using (auth.uid() = user_id);

create policy "Users can delete own projects"
  on public.projects for delete
  using (auth.uid() = user_id);

-- ── project_data ────────────────────────────────────────────────────────────
-- Full project payload (nodes, edges, events, messages) as JSONB.
-- One row per project; upserted on save.

create table if not exists public.project_data (
  project_id text primary key references public.projects(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.project_data enable row level security;

-- RLS policies join through projects to verify ownership.
create policy "Users can read own project data"
  on public.project_data for select
  using (
    exists (
      select 1 from public.projects
      where projects.id = project_data.project_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can insert own project data"
  on public.project_data for insert
  with check (
    exists (
      select 1 from public.projects
      where projects.id = project_data.project_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can update own project data"
  on public.project_data for update
  using (
    exists (
      select 1 from public.projects
      where projects.id = project_data.project_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can delete own project data"
  on public.project_data for delete
  using (
    exists (
      select 1 from public.projects
      where projects.id = project_data.project_id
        and projects.user_id = auth.uid()
    )
  );

-- ── Auto-create profile on sign-up ─────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

-- Drop if exists to make migration idempotent
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── updated_at auto-touch ──────────────────────────────────────────────────

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();

create trigger project_data_updated_at
  before update on public.project_data
  for each row execute function public.touch_updated_at();
