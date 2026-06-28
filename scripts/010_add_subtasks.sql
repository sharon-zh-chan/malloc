-- Add one-level subtasks to sticky tasks while keeping each subtask attached to
-- its parent through moves, restoration, archival, and permanent deletion.

alter table public.sticky_tasks
  add column if not exists parent_task_id text,
  add column if not exists subtasks_expanded boolean not null default false;

create index if not exists sticky_tasks_user_parent_sort_order_idx
  on public.sticky_tasks(user_id, parent_task_id, sort_order);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sticky_tasks_parent_task_id_fkey'
  ) then
    alter table public.sticky_tasks
      add constraint sticky_tasks_parent_task_id_fkey
      foreign key (user_id, parent_task_id)
      references public.sticky_tasks(user_id, id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'sticky_tasks_not_own_parent_check'
  ) then
    alter table public.sticky_tasks
      add constraint sticky_tasks_not_own_parent_check
      check (parent_task_id is null or parent_task_id <> id);
  end if;
end
$$;

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.get_workspace_state()'::regprocedure)
  into function_definition;

  if position('''parentTaskId'', task.parent_task_id' in function_definition) = 0 then
    if position('                  ''status'', task.status,' in function_definition) = 0 then
      raise exception 'get_workspace_state task serializer insertion point was not found';
    end if;

    function_definition := replace(
      function_definition,
      '                  ''status'', task.status,',
      '                  ''status'', task.status,
                  ''parentTaskId'', task.parent_task_id,
                  ''subtasksExpanded'', task.subtasks_expanded,'
    );
  end if;

  execute function_definition;
end
$$;

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.replace_workspace_state(jsonb)'::regprocedure)
  into function_definition;

  if position('parent_task_id, subtasks_expanded' in function_definition) = 0 then
    function_definition := replace(
      function_definition,
      '        user_id, id, sticky_id, text, status, sort_order, created_at',
      '        user_id, id, sticky_id, text, status, parent_task_id, subtasks_expanded, sort_order, created_at'
    );
    function_definition := replace(
      function_definition,
      '          else ''todo''
        end,
        coalesce((task->>''order'')::bigint, 0),',
      '          else ''todo''
        end,
        nullif(task->>''parentTaskId'', ''''),
        coalesce((task->>''subtasksExpanded'')::boolean, false),
        coalesce((task->>''order'')::bigint, 0),'
    );
  end if;

  execute function_definition;
end
$$;

-- Enforce the one-level and same-sticky rules at the mutation boundary too,
-- so API clients cannot create relationships the UI would never allow.
do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'public.apply_workspace_mutation(text, text, jsonb)'::regprocedure
  ) into function_definition;

  if position('Subtasks cannot be nested' in function_definition) = 0 then
    function_definition := replace(
      function_definition,
      '    when ''addTask'' then
      insert into public.sticky_tasks',
      '    when ''addTask'' then
      if nullif(payload->''task''->>''parentTaskId'', '''') is not null and not exists (
        select 1
        from public.sticky_tasks parent
        where parent.user_id = current_user_id
          and parent.id = payload->''task''->>''parentTaskId''
          and parent.sticky_id = payload->>''stickyId''
          and parent.parent_task_id is null
      ) then
        raise exception ''Subtasks cannot be nested or moved outside their parent sticky'';
      end if;

      insert into public.sticky_tasks'
    );
  end if;

  if position('Only parent tasks can move between stickies' in function_definition) = 0 then
    function_definition := replace(
      function_definition,
      '    when ''moveTask'' then
      if not exists (',
      '    when ''moveTask'' then
      if exists (
        select 1
        from public.sticky_tasks
        where user_id = current_user_id
          and id = payload->>''taskId''
          and parent_task_id is not null
      ) then
        raise exception ''Only parent tasks can move between stickies'';
      end if;

      if not exists ('
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

  if position('parent_task_id, subtasks_expanded, sort_order' in function_definition) = 0 then
    function_definition := replace(
      function_definition,
      '        user_id, id, sticky_id, text, status, sort_order, created_at',
      '        user_id, id, sticky_id, text, status, parent_task_id, subtasks_expanded, sort_order, created_at'
    );
    function_definition := replace(
      function_definition,
      '        payload->''task''->>''status'',
        (payload->''task''->>''order'')::bigint,',
      '        payload->''task''->>''status'',
        nullif(payload->''task''->>''parentTaskId'', ''''),
        coalesce((payload->''task''->>''subtasksExpanded'')::boolean, false),
        (payload->''task''->>''order'')::bigint,'
    );
  end if;

  if position('when ''setTaskExpanded''' in function_definition) = 0 then
    function_definition := replace(
      function_definition,
      '    when ''setTaskStatus'' then',
      '    when ''setTaskExpanded'' then
      update public.sticky_tasks
      set subtasks_expanded = (payload->>''expanded'')::boolean,
          updated_at = now()
      where user_id = current_user_id
        and sticky_id = payload->>''stickyId''
        and id = payload->>''taskId''
        and parent_task_id is null;

      if not found then
        raise exception ''Task not found'';
      end if;

    when ''setTaskStatus'' then'
    );
  end if;

  if position('Complete or delete all subtasks first' in function_definition) = 0 then
    function_definition := replace(
      function_definition,
      '    when ''setTaskStatus'' then
      update public.sticky_tasks',
      '    when ''setTaskStatus'' then
      if payload->>''status'' = ''completed'' and exists (
        select 1
        from public.sticky_tasks child
        where child.user_id = current_user_id
          and child.parent_task_id = payload->>''taskId''
          and child.status = ''todo''
          and child.cleared_at is null
      ) then
        raise exception ''Complete or delete all subtasks first'';
      end if;

      update public.sticky_tasks'
    );
  end if;

  if position('parent_task_id = payload->>''taskId''' in function_definition) = 0 then
    function_definition := replace(
      function_definition,
      '      update public.sticky_tasks
      set
        sticky_id = payload->>''toStickyId'',
        sort_order = (payload->>''order'')::bigint,
        updated_at = now()
      where user_id = current_user_id
        and id = payload->>''taskId'';',
      '      update public.sticky_tasks
      set
        sticky_id = payload->>''toStickyId'',
        sort_order = case
          when id = payload->>''taskId'' then (payload->>''order'')::bigint
          else sort_order
        end,
        updated_at = now()
      where user_id = current_user_id
        and (id = payload->>''taskId'' or parent_task_id = payload->>''taskId'');'
    );
  end if;

  if position('parent_task_id is not null and status = ''deleted''' in function_definition) = 0 then
    function_definition := replace(
      function_definition,
      '        and status <> ''todo''
        and cleared_at is null;',
      '        and (
          (parent_task_id is null and status <> ''todo'')
          or (parent_task_id is not null and status = ''deleted'')
        )
        and cleared_at is null;'
    );
  end if;

  if position('subtasks_expanded = true
      where user_id = current_user_id' in function_definition) = 0 then
    function_definition := replace(
      function_definition,
      '      if not found then
        raise exception ''Task not found'';
      end if;

    when ''deleteTasksPermanently'' then',
      '      if not found then
        raise exception ''Task not found'';
      end if;

      update public.sticky_tasks parent
      set status = ''todo'',
          cleared_at = null,
          subtasks_expanded = true,
          updated_at = now()
      where parent.user_id = current_user_id
        and parent.id = (
          select child.parent_task_id
          from public.sticky_tasks child
          where child.user_id = current_user_id
            and child.id = payload->>''taskId''
        )
        and parent.status <> ''todo'';

    when ''deleteTasksPermanently'' then'
    );
  end if;

  if position('or parent_task_id in (' in function_definition) = 0 then
    function_definition := replace(
      function_definition,
      '        and id in (
          select value
          from jsonb_array_elements_text(coalesce(payload->''taskIds'', ''[]''::jsonb))
        );',
      '        and (
          id in (
            select value
            from jsonb_array_elements_text(coalesce(payload->''taskIds'', ''[]''::jsonb))
          )
          or parent_task_id in (
            select value
            from jsonb_array_elements_text(coalesce(payload->''taskIds'', ''[]''::jsonb))
          )
        );'
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

  if position('when ''setTaskExpanded''' in function_definition) = 0
    or position('parent_task_id, subtasks_expanded, sort_order' in function_definition) = 0
    or position('Subtasks cannot be nested' in function_definition) = 0
    or position('Only parent tasks can move between stickies' in function_definition) = 0
    or position('parent_task_id = payload->>''taskId''' in function_definition) = 0
    or position('Complete or delete all subtasks first' in function_definition) = 0
  then
    raise exception 'Subtask mutation installation verification failed';
  end if;
end
$$;
