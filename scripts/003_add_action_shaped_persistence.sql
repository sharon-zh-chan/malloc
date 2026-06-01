-- Normalize workspace data and expose transactional, action-shaped mutations.
-- The existing app_state table remains available as a migration source only.

create table if not exists public.workspace_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  time_range text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.stickies (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  title text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.sticky_tasks (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  sticky_id text not null,
  text text not null,
  status text not null default 'todo'
    check (status in ('todo', 'completed', 'deleted')),
  sort_order bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, sticky_id)
    references public.stickies(user_id, id) on delete cascade
);

create table if not exists public.memo_collections (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  title text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.memos (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  title text not null,
  content text not null default '',
  collection_id text,
  previous_collection_id text,
  archived_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.workspace_mutations (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_mutation_id text not null,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, client_mutation_id)
);

create index if not exists stickies_user_sort_order_idx
  on public.stickies(user_id, sort_order);
create index if not exists sticky_tasks_user_sticky_sort_order_idx
  on public.sticky_tasks(user_id, sticky_id, sort_order);
create index if not exists memo_collections_user_sort_order_idx
  on public.memo_collections(user_id, sort_order);
create index if not exists memos_user_sort_order_idx
  on public.memos(user_id, sort_order);
create index if not exists workspace_mutations_user_id_idx
  on public.workspace_mutations(user_id, id);

alter table public.workspace_settings enable row level security;
alter table public.stickies enable row level security;
alter table public.sticky_tasks enable row level security;
alter table public.memo_collections enable row level security;
alter table public.memos enable row level security;
alter table public.workspace_mutations enable row level security;

create or replace function public.safe_integer(value text, fallback integer)
returns integer
language plpgsql
immutable
as $$
begin
  return coalesce(value::integer, fallback);
exception
  when others then return fallback;
end;
$$;

create or replace function public.safe_bigint(value text, fallback bigint)
returns bigint
language plpgsql
immutable
as $$
begin
  return coalesce(value::bigint, fallback);
exception
  when others then return fallback;
end;
$$;

create or replace function public.safe_milliseconds_timestamp(
  value text,
  fallback timestamptz
)
returns timestamptz
language plpgsql
immutable
as $$
begin
  return coalesce(to_timestamp(value::numeric / 1000), fallback);
exception
  when others then return fallback;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'workspace_settings',
    'stickies',
    'sticky_tasks',
    'memo_collections',
    'memos',
    'workspace_mutations'
  ]
  loop
    begin
      execute format(
        'create policy %I on public.%I for select using (auth.uid() = user_id)',
        table_name || '_select_own',
        table_name
      );
    exception
      when duplicate_object then null;
    end;

    begin
      execute format(
        'create policy %I on public.%I for insert with check (auth.uid() = user_id)',
        table_name || '_insert_own',
        table_name
      );
    exception
      when duplicate_object then null;
    end;

    begin
      execute format(
        'create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)',
        table_name || '_update_own',
        table_name
      );
    exception
      when duplicate_object then null;
    end;

    begin
      execute format(
        'create policy %I on public.%I for delete using (auth.uid() = user_id)',
        table_name || '_delete_own',
        table_name
      );
    exception
      when duplicate_object then null;
    end;
  end loop;
end
$$;

-- Backfill the normalized tables from the original per-user JSON blob.
insert into public.workspace_settings (user_id, time_range, updated_at)
select user_id, coalesce(state->>'timeRange', ''), updated_at
from public.app_state
on conflict (user_id) do nothing;

insert into public.stickies (user_id, id, title, sort_order, updated_at)
select
  app_state.user_id,
  sticky->>'id',
  coalesce(sticky->>'title', ''),
  public.safe_integer(sticky->>'order', (sticky_index - 1)::integer),
  app_state.updated_at
from public.app_state
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(state->'blocks') = 'array' then state->'blocks'
    else '[]'::jsonb
  end
)
  with ordinality as source(sticky, sticky_index)
where nullif(sticky->>'id', '') is not null
on conflict (user_id, id) do nothing;

insert into public.sticky_tasks (
  user_id,
  id,
  sticky_id,
  text,
  status,
  sort_order,
  created_at,
  updated_at
)
select
  app_state.user_id,
  task->>'id',
  sticky->>'id',
  coalesce(task->>'text', ''),
  case
    when task->>'status' in ('todo', 'completed', 'deleted') then task->>'status'
    else 'todo'
  end,
  public.safe_bigint(task->>'order', task_index - 1),
  public.safe_milliseconds_timestamp(task->>'createdAt', to_timestamp(0)),
  app_state.updated_at
from public.app_state
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(state->'blocks') = 'array' then state->'blocks'
    else '[]'::jsonb
  end
)
  as sticky_source(sticky)
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(sticky->'items') = 'array' then sticky->'items'
    else '[]'::jsonb
  end
)
  with ordinality as task_source(task, task_index)
where nullif(sticky->>'id', '') is not null
  and nullif(task->>'id', '') is not null
on conflict (user_id, id) do nothing;

insert into public.memo_collections (
  user_id,
  id,
  title,
  sort_order,
  created_at,
  updated_at
)
select
  app_state.user_id,
  collection->>'id',
  coalesce(collection->>'title', ''),
  public.safe_integer(collection->>'order', (collection_index - 1)::integer),
  public.safe_milliseconds_timestamp(collection->>'createdAt', to_timestamp(0)),
  public.safe_milliseconds_timestamp(collection->>'updatedAt', to_timestamp(0))
from public.app_state
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(state->'memoCollections') = 'array' then state->'memoCollections'
    else '[]'::jsonb
  end
)
  with ordinality as source(collection, collection_index)
where nullif(collection->>'id', '') is not null
on conflict (user_id, id) do nothing;

insert into public.memos (
  user_id,
  id,
  title,
  content,
  collection_id,
  previous_collection_id,
  archived_at,
  sort_order,
  created_at,
  updated_at
)
select
  app_state.user_id,
  memo->>'id',
  coalesce(memo->>'title', ''),
  coalesce(memo->>'content', ''),
  nullif(memo->>'collectionId', ''),
  nullif(memo->>'previousCollectionId', ''),
  case
    when memo->>'archivedAt' is null then null
    else public.safe_milliseconds_timestamp(memo->>'archivedAt', null)
  end,
  public.safe_integer(memo->>'order', (memo_index - 1)::integer),
  public.safe_milliseconds_timestamp(memo->>'createdAt', to_timestamp(0)),
  public.safe_milliseconds_timestamp(memo->>'updatedAt', to_timestamp(0))
from public.app_state
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(state->'textBlocks') = 'array' then state->'textBlocks'
    else '[]'::jsonb
  end
)
  with ordinality as source(memo, memo_index)
where nullif(memo->>'id', '') is not null
on conflict (user_id, id) do nothing;

-- Legacy JSON did not enforce collection references. Preserve the memo while
-- clearing any dangling links before adding relational constraints.
update public.memos memo
set collection_id = null
where collection_id is not null
  and not exists (
    select 1
    from public.memo_collections collection
    where collection.user_id = memo.user_id
      and collection.id = memo.collection_id
  );

update public.memos memo
set previous_collection_id = null
where previous_collection_id is not null
  and not exists (
    select 1
    from public.memo_collections collection
    where collection.user_id = memo.user_id
      and collection.id = memo.previous_collection_id
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'memos_collection_id_fkey'
  ) then
    alter table public.memos
      add constraint memos_collection_id_fkey
      foreign key (user_id, collection_id)
      references public.memo_collections(user_id, id)
      on delete no action;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'memos_previous_collection_id_fkey'
  ) then
    alter table public.memos
      add constraint memos_previous_collection_id_fkey
      foreign key (user_id, previous_collection_id)
      references public.memo_collections(user_id, id)
      on delete no action;
  end if;
end
$$;

drop function public.safe_integer(text, integer);
drop function public.safe_bigint(text, bigint);
drop function public.safe_milliseconds_timestamp(text, timestamptz);

create or replace function public.get_workspace_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  settings public.workspace_settings%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into settings
  from public.workspace_settings
  where user_id = current_user_id;

  if not found then
    return jsonb_build_object(
      'state', null,
      'updated_at', null
    );
  end if;

  return jsonb_build_object(
    'state',
    jsonb_build_object(
      'timeRange', settings.time_range,
      'blocks', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', sticky.id,
            'title', sticky.title,
            'items', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', task.id,
                  'text', task.text,
                  'status', task.status,
                  'createdAt', round(extract(epoch from task.created_at) * 1000)::bigint,
                  'order', task.sort_order
                )
                order by task.sort_order, task.created_at, task.id
              )
              from public.sticky_tasks task
              where task.user_id = current_user_id
                and task.sticky_id = sticky.id
            ), '[]'::jsonb),
            'order', sticky.sort_order
          )
          order by sticky.sort_order, sticky.created_at, sticky.id
        )
        from public.stickies sticky
        where sticky.user_id = current_user_id
      ), '[]'::jsonb),
      'textBlocks', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', memo.id,
            'title', memo.title,
            'content', memo.content,
            'collectionId', memo.collection_id,
            'previousCollectionId', memo.previous_collection_id,
            'archivedAt', case
              when memo.archived_at is null then null
              else round(extract(epoch from memo.archived_at) * 1000)::bigint
            end,
            'createdAt', round(extract(epoch from memo.created_at) * 1000)::bigint,
            'updatedAt', round(extract(epoch from memo.updated_at) * 1000)::bigint,
            'order', memo.sort_order
          )
          order by memo.sort_order, memo.created_at, memo.id
        )
        from public.memos memo
        where memo.user_id = current_user_id
      ), '[]'::jsonb),
      'memoCollections', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', collection.id,
            'title', collection.title,
            'createdAt', round(extract(epoch from collection.created_at) * 1000)::bigint,
            'updatedAt', round(extract(epoch from collection.updated_at) * 1000)::bigint,
            'order', collection.sort_order
          )
          order by collection.sort_order, collection.created_at, collection.id
        )
        from public.memo_collections collection
        where collection.user_id = current_user_id
      ), '[]'::jsonb),
      'lastUpdatedAt', round(extract(epoch from settings.updated_at) * 1000)::bigint
    ),
    'updated_at', settings.updated_at
  );
end;
$$;

create or replace function public.replace_workspace_state(replacement_state jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  sticky jsonb;
  task jsonb;
  memo jsonb;
  collection jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  delete from public.sticky_tasks where user_id = current_user_id;
  delete from public.stickies where user_id = current_user_id;
  delete from public.memos where user_id = current_user_id;
  delete from public.memo_collections where user_id = current_user_id;

  insert into public.workspace_settings (user_id, time_range, updated_at)
  values (current_user_id, coalesce(replacement_state->>'timeRange', ''), now())
  on conflict (user_id) do update
  set time_range = excluded.time_range,
      updated_at = excluded.updated_at;

  for sticky in
    select value from jsonb_array_elements(coalesce(replacement_state->'blocks', '[]'::jsonb))
  loop
    insert into public.stickies (user_id, id, title, sort_order)
    values (
      current_user_id,
      sticky->>'id',
      coalesce(sticky->>'title', ''),
      coalesce((sticky->>'order')::integer, 0)
    );

    for task in
      select value from jsonb_array_elements(coalesce(sticky->'items', '[]'::jsonb))
    loop
      insert into public.sticky_tasks (
        user_id, id, sticky_id, text, status, sort_order, created_at
      )
      values (
        current_user_id,
        task->>'id',
        sticky->>'id',
        coalesce(task->>'text', ''),
        case
          when task->>'status' in ('todo', 'completed', 'deleted') then task->>'status'
          else 'todo'
        end,
        coalesce((task->>'order')::bigint, 0),
        to_timestamp(coalesce((task->>'createdAt')::numeric, 0) / 1000)
      );
    end loop;
  end loop;

  for collection in
    select value from jsonb_array_elements(coalesce(replacement_state->'memoCollections', '[]'::jsonb))
  loop
    insert into public.memo_collections (
      user_id, id, title, sort_order, created_at, updated_at
    )
    values (
      current_user_id,
      collection->>'id',
      coalesce(collection->>'title', ''),
      coalesce((collection->>'order')::integer, 0),
      to_timestamp(coalesce((collection->>'createdAt')::numeric, 0) / 1000),
      to_timestamp(coalesce((collection->>'updatedAt')::numeric, 0) / 1000)
    );
  end loop;

  for memo in
    select value from jsonb_array_elements(coalesce(replacement_state->'textBlocks', '[]'::jsonb))
  loop
    insert into public.memos (
      user_id,
      id,
      title,
      content,
      collection_id,
      previous_collection_id,
      archived_at,
      sort_order,
      created_at,
      updated_at
    )
    values (
      current_user_id,
      memo->>'id',
      coalesce(memo->>'title', ''),
      coalesce(memo->>'content', ''),
      nullif(memo->>'collectionId', ''),
      nullif(memo->>'previousCollectionId', ''),
      case
        when memo->>'archivedAt' is null then null
        else to_timestamp((memo->>'archivedAt')::numeric / 1000)
      end,
      coalesce((memo->>'order')::integer, 0),
      to_timestamp(coalesce((memo->>'createdAt')::numeric, 0) / 1000),
      to_timestamp(coalesce((memo->>'updatedAt')::numeric, 0) / 1000)
    );
  end loop;

  return public.get_workspace_state();
end;
$$;

create or replace function public.delete_workspace()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  delete from public.sticky_tasks where user_id = current_user_id;
  delete from public.stickies where user_id = current_user_id;
  delete from public.memos where user_id = current_user_id;
  delete from public.memo_collections where user_id = current_user_id;
  delete from public.workspace_mutations where user_id = current_user_id;
  delete from public.workspace_settings where user_id = current_user_id;
end;
$$;

create or replace function public.apply_workspace_mutation(
  client_mutation_id text,
  action text,
  payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  inserted_mutation_id bigint;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.workspace_mutations (
    user_id, client_mutation_id, action, payload
  )
  values (current_user_id, client_mutation_id, action, payload)
  on conflict (user_id, client_mutation_id) do nothing
  returning id into inserted_mutation_id;

  if inserted_mutation_id is null then
    return public.get_workspace_state();
  end if;

  insert into public.workspace_settings (user_id)
  values (current_user_id)
  on conflict (user_id) do nothing;

  case action
    when 'setTimeRange' then
      update public.workspace_settings
      set time_range = coalesce(payload->>'timeRange', '')
      where user_id = current_user_id;

    when 'addSticky' then
      insert into public.stickies (user_id, id, title, sort_order)
      values (
        current_user_id,
        payload->'sticky'->>'id',
        payload->'sticky'->>'title',
        (payload->'sticky'->>'order')::integer
      );

    when 'renameSticky' then
      update public.stickies
      set title = payload->>'title', updated_at = now()
      where user_id = current_user_id and id = payload->>'stickyId';

      if not found then
        raise exception 'Sticky not found';
      end if;

    when 'deleteSticky' then
      delete from public.stickies
      where user_id = current_user_id and id = payload->>'stickyId';

      if not found then
        raise exception 'Sticky not found';
      end if;

      with ordered as (
        select
          id,
          row_number() over (order by sort_order, created_at, id) - 1 as sort_order
        from public.stickies
        where user_id = current_user_id
      )
      update public.stickies sticky
      set sort_order = ordered.sort_order, updated_at = now()
      from ordered
      where sticky.user_id = current_user_id and sticky.id = ordered.id;

    when 'reorderStickies' then
      if exists (
        select 1
        from jsonb_array_elements_text(payload->'stickyIds') source(sticky_id)
        left join public.stickies sticky
          on sticky.user_id = current_user_id
          and sticky.id = source.sticky_id
        where sticky.id is null
      ) then
        raise exception 'Sticky not found';
      end if;

      if (
        select count(*)
        from jsonb_array_elements_text(payload->'stickyIds')
      ) <> (
        select count(*)
        from public.stickies
        where user_id = current_user_id
      ) or (
        select count(*)
        from jsonb_array_elements_text(payload->'stickyIds')
      ) <> (
        select count(distinct sticky_id)
        from jsonb_array_elements_text(payload->'stickyIds') source(sticky_id)
      ) then
        raise exception 'stickyIds must list every sticky exactly once';
      end if;

      update public.stickies sticky
      set sort_order = source.sort_order::integer, updated_at = now()
      from (
        select value as sticky_id, ordinality - 1 as sort_order
        from jsonb_array_elements_text(payload->'stickyIds') with ordinality
      ) source
      where sticky.user_id = current_user_id and sticky.id = source.sticky_id;

    when 'addTask' then
      insert into public.sticky_tasks (
        user_id, id, sticky_id, text, status, sort_order, created_at
      )
      values (
        current_user_id,
        payload->'task'->>'id',
        payload->>'stickyId',
        payload->'task'->>'text',
        payload->'task'->>'status',
        (payload->'task'->>'order')::bigint,
        to_timestamp((payload->'task'->>'createdAt')::numeric / 1000)
      );

    when 'editTask' then
      update public.sticky_tasks
      set text = payload->>'text', updated_at = now()
      where user_id = current_user_id
        and sticky_id = payload->>'stickyId'
        and id = payload->>'taskId';

      if not found then
        raise exception 'Task not found';
      end if;

    when 'setTaskStatus' then
      update public.sticky_tasks
      set
        status = payload->>'status',
        sort_order = (payload->>'order')::bigint,
        updated_at = now()
      where user_id = current_user_id
        and sticky_id = payload->>'stickyId'
        and id = payload->>'taskId';

      if not found then
        raise exception 'Task not found';
      end if;

    when 'reorderTasks' then
      if not exists (
        select 1
        from public.stickies
        where user_id = current_user_id and id = payload->>'stickyId'
      ) then
        raise exception 'Sticky not found';
      end if;

      if exists (
        select 1
        from jsonb_array_elements_text(payload->'taskIds') source(task_id)
        left join public.sticky_tasks task
          on task.user_id = current_user_id
          and task.sticky_id = payload->>'stickyId'
          and task.id = source.task_id
        where task.id is null
      ) then
        raise exception 'Task not found';
      end if;

      if (
        select count(*)
        from jsonb_array_elements_text(payload->'taskIds')
      ) <> (
        select count(*)
        from public.sticky_tasks
        where user_id = current_user_id
          and sticky_id = payload->>'stickyId'
      ) or (
        select count(*)
        from jsonb_array_elements_text(payload->'taskIds')
      ) <> (
        select count(distinct task_id)
        from jsonb_array_elements_text(payload->'taskIds') source(task_id)
      ) then
        raise exception 'taskIds must list every task exactly once';
      end if;

      update public.sticky_tasks task
      set sort_order = source.sort_order, updated_at = now()
      from (
        select value as task_id, ordinality - 1 as sort_order
        from jsonb_array_elements_text(payload->'taskIds') with ordinality
      ) source
      where task.user_id = current_user_id
        and task.sticky_id = payload->>'stickyId'
        and task.id = source.task_id;

    when 'clearArchivedTasks' then
      delete from public.sticky_tasks
      where user_id = current_user_id and status <> 'todo';

    when 'clearStickyArchivedTasks' then
      delete from public.sticky_tasks
      where user_id = current_user_id
        and sticky_id = payload->>'stickyId'
        and status <> 'todo';

    when 'addMemo' then
      insert into public.memos (
        user_id,
        id,
        title,
        content,
        collection_id,
        previous_collection_id,
        archived_at,
        sort_order,
        created_at,
        updated_at
      )
      values (
        current_user_id,
        payload->'memo'->>'id',
        payload->'memo'->>'title',
        coalesce(payload->'memo'->>'content', ''),
        nullif(payload->'memo'->>'collectionId', ''),
        nullif(payload->'memo'->>'previousCollectionId', ''),
        null,
        (payload->'memo'->>'order')::integer,
        to_timestamp((payload->'memo'->>'createdAt')::numeric / 1000),
        to_timestamp((payload->'memo'->>'updatedAt')::numeric / 1000)
      );

    when 'renameMemo' then
      update public.memos
      set
        title = payload->>'title',
        updated_at = to_timestamp((payload->>'updatedAt')::numeric / 1000)
      where user_id = current_user_id and id = payload->>'memoId';

      if not found then
        raise exception 'Memo not found';
      end if;

    when 'editMemo' then
      update public.memos
      set
        content = payload->>'content',
        updated_at = to_timestamp((payload->>'updatedAt')::numeric / 1000)
      where user_id = current_user_id and id = payload->>'memoId';

      if not found then
        raise exception 'Memo not found';
      end if;

    when 'moveMemo' then
      update public.memos
      set
        collection_id = nullif(payload->>'collectionId', ''),
        previous_collection_id = null,
        archived_at = null,
        updated_at = to_timestamp((payload->>'updatedAt')::numeric / 1000)
      where user_id = current_user_id and id = payload->>'memoId';

      if not found then
        raise exception 'Memo not found';
      end if;

    when 'archiveMemo' then
      update public.memos
      set
        previous_collection_id = coalesce(previous_collection_id, collection_id),
        collection_id = null,
        archived_at = to_timestamp((payload->>'archivedAt')::numeric / 1000),
        updated_at = to_timestamp((payload->>'updatedAt')::numeric / 1000)
      where user_id = current_user_id and id = payload->>'memoId';

      if not found then
        raise exception 'Memo not found';
      end if;

    when 'restoreMemo' then
      update public.memos
      set
        collection_id = previous_collection_id,
        previous_collection_id = null,
        archived_at = null,
        updated_at = to_timestamp((payload->>'updatedAt')::numeric / 1000)
      where user_id = current_user_id and id = payload->>'memoId';

      if not found then
        raise exception 'Memo not found';
      end if;

    when 'deleteMemo' then
      delete from public.memos
      where user_id = current_user_id and id = payload->>'memoId';

      if not found then
        raise exception 'Memo not found';
      end if;

      with ordered as (
        select
          id,
          row_number() over (order by sort_order, created_at, id) - 1 as sort_order
        from public.memos
        where user_id = current_user_id
      )
      update public.memos memo
      set sort_order = ordered.sort_order, updated_at = now()
      from ordered
      where memo.user_id = current_user_id and memo.id = ordered.id;

    when 'addMemoCollection' then
      insert into public.memo_collections (
        user_id, id, title, sort_order, created_at, updated_at
      )
      values (
        current_user_id,
        payload->'collection'->>'id',
        payload->'collection'->>'title',
        (payload->'collection'->>'order')::integer,
        to_timestamp((payload->'collection'->>'createdAt')::numeric / 1000),
        to_timestamp((payload->'collection'->>'updatedAt')::numeric / 1000)
      );

    when 'renameMemoCollection' then
      update public.memo_collections
      set
        title = payload->>'title',
        updated_at = to_timestamp((payload->>'updatedAt')::numeric / 1000)
      where user_id = current_user_id and id = payload->>'collectionId';

      if not found then
        raise exception 'Memo collection not found';
      end if;

    when 'deleteMemoCollection' then
      update public.memos
      set
        collection_id = case
          when collection_id = payload->>'collectionId' then null
          else collection_id
        end,
        previous_collection_id = case
          when previous_collection_id = payload->>'collectionId' then null
          else previous_collection_id
        end,
        updated_at = now()
      where user_id = current_user_id
        and (
          collection_id = payload->>'collectionId'
          or previous_collection_id = payload->>'collectionId'
        );

      delete from public.memo_collections
      where user_id = current_user_id and id = payload->>'collectionId';

      if not found then
        raise exception 'Memo collection not found';
      end if;

      with ordered as (
        select
          id,
          row_number() over (order by sort_order, created_at, id) - 1 as sort_order
        from public.memo_collections
        where user_id = current_user_id
      )
      update public.memo_collections collection
      set sort_order = ordered.sort_order, updated_at = now()
      from ordered
      where collection.user_id = current_user_id
        and collection.id = ordered.id;

    else
      raise exception 'Unsupported workspace action: %', action;
  end case;

  update public.workspace_settings
  set updated_at = now()
  where user_id = current_user_id;

  return public.get_workspace_state();
end;
$$;

revoke insert, update, delete on public.workspace_settings from anon, authenticated;
revoke insert, update, delete on public.stickies from anon, authenticated;
revoke insert, update, delete on public.sticky_tasks from anon, authenticated;
revoke insert, update, delete on public.memo_collections from anon, authenticated;
revoke insert, update, delete on public.memos from anon, authenticated;
revoke insert, update, delete on public.workspace_mutations from anon, authenticated;

grant select on public.workspace_settings to authenticated;
grant select on public.stickies to authenticated;
grant select on public.sticky_tasks to authenticated;
grant select on public.memo_collections to authenticated;
grant select on public.memos to authenticated;
grant select on public.workspace_mutations to authenticated;

revoke all on function public.get_workspace_state() from public;
revoke all on function public.replace_workspace_state(jsonb) from public;
revoke all on function public.delete_workspace() from public;
revoke all on function public.apply_workspace_mutation(text, text, jsonb) from public;

grant execute on function public.get_workspace_state() to authenticated;
grant execute on function public.replace_workspace_state(jsonb) to authenticated;
grant execute on function public.delete_workspace() to authenticated;
grant execute on function public.apply_workspace_mutation(text, text, jsonb) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'workspace_mutations'
  ) then
    alter publication supabase_realtime add table public.workspace_mutations;
  end if;
end
$$;
