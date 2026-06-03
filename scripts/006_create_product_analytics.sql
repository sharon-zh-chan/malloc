-- Supabase product analytics setup for malloc.
-- This intentionally stores product actions and counts, not user-entered text.

create table if not exists public.analytics_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.analytics_sessions(id) on delete set null,
  event_name text not null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_user_created_idx
  on public.analytics_events(user_id, created_at desc);

create index if not exists analytics_events_name_created_idx
  on public.analytics_events(event_name, created_at desc);

create index if not exists analytics_sessions_user_started_idx
  on public.analytics_sessions(user_id, started_at desc);

alter table public.analytics_sessions enable row level security;
alter table public.analytics_events enable row level security;

do $$
begin
  begin
    create policy "analytics_sessions_select_own"
      on public.analytics_sessions for select
      using (auth.uid() = user_id);
  exception
    when duplicate_object then null;
  end;

  begin
    create policy "analytics_sessions_insert_own"
      on public.analytics_sessions for insert
      with check (auth.uid() = user_id);
  exception
    when duplicate_object then null;
  end;

  begin
    create policy "analytics_sessions_update_own"
      on public.analytics_sessions for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  exception
    when duplicate_object then null;
  end;

  begin
    create policy "analytics_events_insert_own"
      on public.analytics_events for insert
      with check (auth.uid() = user_id);
  exception
    when duplicate_object then null;
  end;
end
$$;

drop view if exists public.analytics_daily_user_summary;
drop view if exists public.analytics_daily_summary;

create view public.analytics_daily_summary
with (security_invoker = true)
as
select
  date_trunc('day', created_at)::date as day,
  count(distinct user_id) as active_users,
  count(*) filter (where event_name = 'session_started') as sessions_started,
  count(*) filter (where event_name = 'view_switched') as view_switches,
  count(*) filter (where event_name = 'sticky_created') as stickies_created,
  count(*) filter (where event_name = 'sticky_deleted') as stickies_deleted,
  count(*) filter (where event_name = 'stickies_reordered') as stickies_reordered,
  count(*) filter (where event_name = 'task_created') as tasks_created,
  count(*) filter (where event_name = 'task_completed') as tasks_completed,
  count(*) filter (where event_name = 'task_deleted') as tasks_deleted,
  count(*) filter (where event_name = 'task_restored') as tasks_restored,
  count(*) filter (where event_name = 'tasks_reordered') as tasks_reordered,
  count(*) filter (where event_name = 'archived_tasks_cleared') as archived_tasks_cleared,
  count(*) filter (where event_name = 'memo_created') as memos_created,
  count(*) filter (where event_name = 'memo_moved') as memos_moved,
  count(*) filter (where event_name = 'memo_archived') as memos_archived,
  count(*) filter (where event_name = 'memo_restored') as memos_restored,
  count(*) filter (where event_name = 'memo_deleted') as memos_deleted,
  count(*) filter (where event_name = 'memo_collection_created') as memo_collections_created,
  count(*) filter (where event_name = 'memo_collection_deleted') as memo_collections_deleted,
  count(*) as total_events
from public.analytics_events
group by 1
order by 1 desc;

create view public.analytics_daily_user_summary
with (security_invoker = true)
as
select
  date_trunc('day', created_at)::date as day,
  user_id,
  count(*) filter (where event_name = 'session_started') as sessions_started,
  count(*) filter (where event_name = 'view_switched') as view_switches,
  count(*) filter (where event_name = 'sticky_created') as stickies_created,
  count(*) filter (where event_name = 'sticky_deleted') as stickies_deleted,
  count(*) filter (where event_name = 'stickies_reordered') as stickies_reordered,
  count(*) filter (where event_name = 'task_created') as tasks_created,
  count(*) filter (where event_name = 'task_completed') as tasks_completed,
  count(*) filter (where event_name = 'task_deleted') as tasks_deleted,
  count(*) filter (where event_name = 'task_restored') as tasks_restored,
  count(*) filter (where event_name = 'tasks_reordered') as tasks_reordered,
  count(*) filter (where event_name = 'archived_tasks_cleared') as archived_tasks_cleared,
  count(*) filter (where event_name = 'memo_created') as memos_created,
  count(*) filter (where event_name = 'memo_moved') as memos_moved,
  count(*) filter (where event_name = 'memo_archived') as memos_archived,
  count(*) filter (where event_name = 'memo_restored') as memos_restored,
  count(*) filter (where event_name = 'memo_deleted') as memos_deleted,
  count(*) filter (where event_name = 'memo_collection_created') as memo_collections_created,
  count(*) filter (where event_name = 'memo_collection_deleted') as memo_collections_deleted,
  count(*) as total_events
from public.analytics_events
group by 1, 2
order by 1 desc, total_events desc;

revoke all on table public.analytics_daily_summary from anon;
revoke all on table public.analytics_daily_summary from authenticated;
revoke all on table public.analytics_daily_user_summary from anon;
revoke all on table public.analytics_daily_user_summary from authenticated;

revoke all on table public.analytics_events from anon;
revoke all on table public.analytics_events from authenticated;
revoke all on table public.analytics_sessions from anon;
revoke all on table public.analytics_sessions from authenticated;

grant insert on table public.analytics_events to authenticated;
grant select, insert, update on table public.analytics_sessions to authenticated;
