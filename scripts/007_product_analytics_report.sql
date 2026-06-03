-- One-shot product analytics report for Supabase SQL Editor.
-- Run the whole file to see overall usage plus yesterday's per-user breakdown.

with periods as (
  select
    1 as sort_order,
    'today'::text as report_section,
    current_date::timestamptz as starts_at,
    (current_date + 1)::timestamptz as ends_at
  union all
  select
    2,
    'yesterday',
    (current_date - 1)::timestamptz,
    current_date::timestamptz
  union all
  select
    3,
    'last_7_days',
    (current_date - 6)::timestamptz,
    (current_date + 1)::timestamptz
),
event_rollup as (
  select
    periods.sort_order,
    periods.report_section,
    count(distinct events.user_id) as active_users,
    count(*) filter (where events.event_name = 'session_started') as sessions_started,
    count(*) filter (where events.event_name = 'view_switched') as view_switches,
    count(*) filter (where events.event_name = 'sticky_created') as stickies_created,
    count(*) filter (where events.event_name = 'sticky_deleted') as stickies_deleted,
    count(*) filter (where events.event_name = 'stickies_reordered') as stickies_reordered,
    count(*) filter (where events.event_name = 'task_created') as tasks_created,
    count(*) filter (where events.event_name = 'task_completed') as tasks_completed,
    count(*) filter (where events.event_name = 'task_deleted') as tasks_deleted,
    count(*) filter (where events.event_name = 'task_restored') as tasks_restored,
    count(*) filter (where events.event_name = 'tasks_reordered') as tasks_reordered,
    count(*) filter (where events.event_name = 'archived_tasks_cleared') as archived_tasks_cleared,
    count(*) filter (where events.event_name = 'memo_created') as memos_created,
    count(*) filter (where events.event_name = 'memo_moved') as memos_moved,
    count(*) filter (where events.event_name = 'memo_archived') as memos_archived,
    count(*) filter (where events.event_name = 'memo_restored') as memos_restored,
    count(*) filter (where events.event_name = 'memo_deleted') as memos_deleted,
    count(*) filter (where events.event_name = 'memo_collection_created') as memo_collections_created,
    count(*) filter (where events.event_name = 'memo_collection_deleted') as memo_collections_deleted,
    count(events.id) as total_events
  from periods
  left join public.analytics_events events
    on events.created_at >= periods.starts_at
   and events.created_at < periods.ends_at
  group by periods.sort_order, periods.report_section
),
session_rollup as (
  select
    periods.sort_order,
    count(sessions.id) as sessions_seen,
    round(
      avg(
        greatest(
          extract(
            epoch from (
              coalesce(sessions.ended_at, sessions.last_seen_at)
              - sessions.started_at
            )
          ) / 60,
          0
        )
      )::numeric,
      1
    ) as avg_session_minutes
  from periods
  left join public.analytics_sessions sessions
    on sessions.started_at < periods.ends_at
   and coalesce(sessions.ended_at, sessions.last_seen_at) >= periods.starts_at
  group by periods.sort_order
),
overall_rows as (
  select
    event_rollup.sort_order,
    'overall'::text as row_type,
    event_rollup.report_section,
    null::uuid as user_id,
    event_rollup.active_users,
    session_rollup.sessions_seen,
    session_rollup.avg_session_minutes,
    event_rollup.view_switches,
    event_rollup.stickies_created,
    event_rollup.stickies_deleted,
    event_rollup.stickies_reordered,
    event_rollup.tasks_created,
    event_rollup.tasks_completed,
    event_rollup.tasks_deleted,
    event_rollup.tasks_restored,
    event_rollup.tasks_reordered,
    event_rollup.archived_tasks_cleared,
    event_rollup.memos_created,
    event_rollup.memos_moved,
    event_rollup.memos_archived,
    event_rollup.memos_restored,
    event_rollup.memos_deleted,
    event_rollup.memo_collections_created,
    event_rollup.memo_collections_deleted,
    event_rollup.total_events
  from event_rollup
  join session_rollup
    on session_rollup.sort_order = event_rollup.sort_order
),
per_user_yesterday_rows as (
  select
    4 as sort_order,
    'per_user'::text as row_type,
    'yesterday'::text as report_section,
    user_id,
    1::bigint as active_users,
    null::bigint as sessions_seen,
    null::numeric as avg_session_minutes,
    view_switches,
    stickies_created,
    stickies_deleted,
    stickies_reordered,
    tasks_created,
    tasks_completed,
    tasks_deleted,
    tasks_restored,
    tasks_reordered,
    archived_tasks_cleared,
    memos_created,
    memos_moved,
    memos_archived,
    memos_restored,
    memos_deleted,
    memo_collections_created,
    memo_collections_deleted,
    total_events
  from public.analytics_daily_user_summary
  where day = current_date - 1
)
select
  row_type,
  report_section,
  user_id,
  active_users,
  sessions_seen,
  avg_session_minutes,
  view_switches,
  stickies_created,
  stickies_deleted,
  stickies_reordered,
  tasks_created,
  tasks_completed,
  tasks_deleted,
  tasks_restored,
  tasks_reordered,
  archived_tasks_cleared,
  memos_created,
  memos_moved,
  memos_archived,
  memos_restored,
  memos_deleted,
  memo_collections_created,
  memo_collections_deleted,
  total_events
from (
  select *
  from overall_rows
  union all
  select *
  from per_user_yesterday_rows
) report
order by sort_order, total_events desc nulls last;
