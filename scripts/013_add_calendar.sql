-- Add first-class calendar events and categories. Recurrence metadata stays in
-- JSON so natural-language captured events can evolve without schema churn.

create table if not exists public.calendar_categories (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  title text not null,
  color text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.calendar_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  title text not null,
  event_date text not null,
  start_time text,
  end_time text,
  category_id text,
  recurrence jsonb not null default '{"frequency":"none","interval":1,"untilDate":null}'::jsonb
    check (jsonb_typeof(recurrence) = 'object'),
  description text not null default '',
  location text,
  deleted_occurrence_dates jsonb not null default '[]'::jsonb
    check (jsonb_typeof(deleted_occurrence_dates) = 'array'),
  source jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, category_id)
    references public.calendar_categories(user_id, id) on delete no action
);

create index if not exists calendar_categories_user_sort_order_idx
  on public.calendar_categories(user_id, sort_order);
create index if not exists calendar_events_user_date_idx
  on public.calendar_events(user_id, event_date);
create index if not exists calendar_events_user_sort_order_idx
  on public.calendar_events(user_id, sort_order);

alter table public.calendar_categories enable row level security;
alter table public.calendar_events enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['calendar_categories', 'calendar_events']
  loop
    begin
      execute format(
        'create policy %I on public.%I for select using (auth.uid() = user_id)',
        table_name || '_select_own', table_name
      );
    exception when duplicate_object then null;
    end;

    begin
      execute format(
        'create policy %I on public.%I for insert with check (auth.uid() = user_id)',
        table_name || '_insert_own', table_name
      );
    exception when duplicate_object then null;
    end;

    begin
      execute format(
        'create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)',
        table_name || '_update_own', table_name
      );
    exception when duplicate_object then null;
    end;

    begin
      execute format(
        'create policy %I on public.%I for delete using (auth.uid() = user_id)',
        table_name || '_delete_own', table_name
      );
    exception when duplicate_object then null;
    end;
  end loop;
end
$$;

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.get_workspace_state()'::regprocedure)
  into function_definition;

  if position('''calendarEvents''' in function_definition) = 0 then
    if position('      ''lastUpdatedAt'', round(extract(epoch from settings.updated_at) * 1000)::bigint' in function_definition) = 0 then
      raise exception 'get_workspace_state calendar insertion point was not found';
    end if;

    function_definition := replace(
      function_definition,
      '      ''lastUpdatedAt'', round(extract(epoch from settings.updated_at) * 1000)::bigint',
      '      ''calendarEvents'', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            ''id'', event.id,
            ''title'', event.title,
            ''date'', event.event_date,
            ''startTime'', event.start_time,
            ''endTime'', event.end_time,
            ''categoryId'', event.category_id,
            ''recurrence'', event.recurrence,
            ''description'', event.description,
            ''location'', event.location,
            ''deletedOccurrenceDates'', event.deleted_occurrence_dates,
            ''source'', event.source,
            ''createdAt'', round(extract(epoch from event.created_at) * 1000)::bigint,
            ''updatedAt'', round(extract(epoch from event.updated_at) * 1000)::bigint,
            ''order'', event.sort_order
          )
          order by event.sort_order, event.event_date, event.created_at, event.id
        )
        from public.calendar_events event
        where event.user_id = current_user_id
      ), ''[]''::jsonb),
      ''calendarCategories'', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            ''id'', category.id,
            ''title'', category.title,
            ''color'', category.color,
            ''createdAt'', round(extract(epoch from category.created_at) * 1000)::bigint,
            ''updatedAt'', round(extract(epoch from category.updated_at) * 1000)::bigint,
            ''order'', category.sort_order
          )
          order by category.sort_order, category.created_at, category.id
        )
        from public.calendar_categories category
        where category.user_id = current_user_id
      ), ''[]''::jsonb),
      ''lastUpdatedAt'', round(extract(epoch from settings.updated_at) * 1000)::bigint'
    );
  end if;

  execute function_definition;
end
$$;

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'public.apply_workspace_mutation(text, text, jsonb)'::regprocedure
  ) into function_definition;

  if position('when ''addCalendarEvent''' in function_definition) = 0 then
    if position('    else
      raise exception ''Unsupported workspace action: %'', action;' in function_definition) = 0 then
      raise exception 'apply_workspace_mutation calendar insertion point was not found';
    end if;

    function_definition := replace(
      function_definition,
      '    else
      raise exception ''Unsupported workspace action: %'', action;',
      '    when ''addCalendarEvent'' then
      insert into public.calendar_events (
        user_id, id, title, event_date, start_time, end_time, category_id,
        recurrence, description, location, deleted_occurrence_dates, source,
        sort_order, created_at, updated_at
      ) values (
        current_user_id,
        payload->''event''->>''id'',
        payload->''event''->>''title'',
        payload->''event''->>''date'',
        nullif(payload->''event''->>''startTime'', ''''),
        nullif(payload->''event''->>''endTime'', ''''),
        nullif(payload->''event''->>''categoryId'', ''''),
        coalesce(payload->''event''->''recurrence'', ''{"frequency":"none","interval":1,"untilDate":null}''::jsonb),
        coalesce(payload->''event''->>''description'', ''''),
        nullif(payload->''event''->>''location'', ''''),
        coalesce(payload->''event''->''deletedOccurrenceDates'', ''[]''::jsonb),
        payload->''event''->''source'',
        (payload->''event''->>''order'')::integer,
        to_timestamp((payload->''event''->>''createdAt'')::numeric / 1000),
        to_timestamp((payload->''event''->>''updatedAt'')::numeric / 1000)
      );

    when ''updateCalendarEvent'' then
      update public.calendar_events
      set title = payload->''event''->>''title'',
          event_date = payload->''event''->>''date'',
          start_time = nullif(payload->''event''->>''startTime'', ''''),
          end_time = nullif(payload->''event''->>''endTime'', ''''),
          category_id = nullif(payload->''event''->>''categoryId'', ''''),
          recurrence = coalesce(payload->''event''->''recurrence'', ''{"frequency":"none","interval":1,"untilDate":null}''::jsonb),
          description = coalesce(payload->''event''->>''description'', ''''),
          location = nullif(payload->''event''->>''location'', ''''),
          deleted_occurrence_dates = coalesce(payload->''event''->''deletedOccurrenceDates'', ''[]''::jsonb),
          source = payload->''event''->''source'',
          updated_at = to_timestamp((payload->''event''->>''updatedAt'')::numeric / 1000)
      where user_id = current_user_id and id = payload->>''eventId'';
      if not found then raise exception ''Calendar event not found''; end if;

    when ''deleteCalendarEvent'' then
      delete from public.calendar_events
      where user_id = current_user_id and id = payload->>''eventId'';
      if not found then raise exception ''Calendar event not found''; end if;

      with ordered as (
        select id, row_number() over (order by sort_order, event_date, created_at, id) - 1 as sort_order
        from public.calendar_events where user_id = current_user_id
      )
      update public.calendar_events event
      set sort_order = ordered.sort_order, updated_at = now()
      from ordered
      where event.user_id = current_user_id and event.id = ordered.id;

    when ''deleteCalendarOccurrence'' then
      update public.calendar_events
      set deleted_occurrence_dates = (
            select coalesce(jsonb_agg(date_value), ''[]''::jsonb)
            from (
              select distinct date_value
              from jsonb_array_elements_text(
                deleted_occurrence_dates || jsonb_build_array(payload->>''date'')
              ) source(date_value)
              order by date_value
            ) dates
          ),
          updated_at = to_timestamp((payload->>''updatedAt'')::numeric / 1000)
      where user_id = current_user_id and id = payload->>''eventId'';
      if not found then raise exception ''Calendar event not found''; end if;

    when ''deleteCalendarFutureOccurrences'' then
      update public.calendar_events
      set recurrence = jsonb_set(
            coalesce(recurrence, ''{"frequency":"none","interval":1,"untilDate":null}''::jsonb),
            ''{untilDate}'',
            to_jsonb((to_date(payload->>''fromDate'', ''YYYY-MM-DD'') - 1)::text),
            true
          ),
          updated_at = to_timestamp((payload->>''updatedAt'')::numeric / 1000)
      where user_id = current_user_id and id = payload->>''eventId'';
      if not found then raise exception ''Calendar event not found''; end if;

    when ''addCalendarCategory'' then
      insert into public.calendar_categories (
        user_id, id, title, color, sort_order, created_at, updated_at
      ) values (
        current_user_id,
        payload->''category''->>''id'',
        payload->''category''->>''title'',
        payload->''category''->>''color'',
        (payload->''category''->>''order'')::integer,
        to_timestamp((payload->''category''->>''createdAt'')::numeric / 1000),
        to_timestamp((payload->''category''->>''updatedAt'')::numeric / 1000)
      );

    when ''updateCalendarCategory'' then
      update public.calendar_categories
      set title = payload->>''title'',
          color = payload->>''color'',
          updated_at = to_timestamp((payload->>''updatedAt'')::numeric / 1000)
      where user_id = current_user_id and id = payload->>''categoryId'';
      if not found then raise exception ''Calendar category not found''; end if;

    when ''deleteCalendarCategory'' then
      update public.calendar_events
      set category_id = null, updated_at = now()
      where user_id = current_user_id and category_id = payload->>''categoryId'';

      delete from public.calendar_categories
      where user_id = current_user_id and id = payload->>''categoryId'';
      if not found then raise exception ''Calendar category not found''; end if;

      with ordered as (
        select id, row_number() over (order by sort_order, created_at, id) - 1 as sort_order
        from public.calendar_categories where user_id = current_user_id
      )
      update public.calendar_categories category
      set sort_order = ordered.sort_order, updated_at = now()
      from ordered
      where category.user_id = current_user_id and category.id = ordered.id;

    else
      raise exception ''Unsupported workspace action: %'', action;'
    );
  end if;

  execute function_definition;
end
$$;

revoke insert, update, delete on public.calendar_categories from anon, authenticated;
revoke insert, update, delete on public.calendar_events from anon, authenticated;
grant select on public.calendar_categories to authenticated;
grant select on public.calendar_events to authenticated;
