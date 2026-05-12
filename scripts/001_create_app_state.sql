-- Create the app_state table for storing per-user todo state as JSON
create table if not exists public.app_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Enable Row Level Security
alter table public.app_state enable row level security;

-- Users can only read their own state
create policy "app_state_select_own"
  on public.app_state for select
  using (auth.uid() = user_id);

-- Users can only insert their own state
create policy "app_state_insert_own"
  on public.app_state for insert
  with check (auth.uid() = user_id);

-- Users can only update their own state
create policy "app_state_update_own"
  on public.app_state for update
  using (auth.uid() = user_id);

-- Users can only delete their own state
create policy "app_state_delete_own"
  on public.app_state for delete
  using (auth.uid() = user_id);
