-- Add recoverable task History support.
--
-- Completed/deleted tasks stay on their sticky until the user clears them from
-- the board. Clearing records cleared_at instead of deleting the task, so
-- History can recover or permanently delete it later.

alter table public.sticky_tasks
  add column if not exists cleared_at timestamptz;

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'public.get_workspace_state()'::regprocedure
  )
  into function_definition;

  if position('task.cleared_at' in function_definition) = 0 then
    if position('                  ''order'', task.sort_order' in function_definition) = 0 then
      raise exception 'get_workspace_state task serializer insertion point was not found';
    end if;

    execute replace(
      function_definition,
      '                  ''order'', task.sort_order',
      '                  ''clearedAt'', case
                    when task.cleared_at is null then null
                    else round(extract(epoch from task.cleared_at) * 1000)::bigint
                  end,
                  ''order'', task.sort_order'
    );
  end if;
end
$$;

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'public.apply_workspace_mutation(text, text, jsonb)'::regprocedure
  )
  into function_definition;

  if position('cleared_at = null' in function_definition) = 0 then
    if position('        sort_order = (payload->>''order'')::bigint,' in function_definition) = 0 then
      raise exception 'setTaskStatus cleared_at insertion point was not found';
    end if;

    function_definition := replace(
      function_definition,
      '        sort_order = (payload->>''order'')::bigint,
        updated_at = now()',
      '        sort_order = (payload->>''order'')::bigint,
        cleared_at = null,
        updated_at = now()'
    );
  end if;

  if position('update public.sticky_tasks
      set cleared_at = to_timestamp' in function_definition) = 0 then
    if position('    when ''clearArchivedTasks'' then
      delete from public.sticky_tasks
      where user_id = current_user_id and status <> ''todo'';' in function_definition) = 0 then
      raise exception 'clearArchivedTasks replacement point was not found';
    end if;

    function_definition := replace(
      function_definition,
      '    when ''clearArchivedTasks'' then
      delete from public.sticky_tasks
      where user_id = current_user_id and status <> ''todo'';',
      '    when ''clearArchivedTasks'' then
      update public.sticky_tasks
      set cleared_at = to_timestamp(
        coalesce((payload->>''clearedAt'')::numeric, extract(epoch from now()) * 1000) / 1000
      ),
      updated_at = now()
      where user_id = current_user_id
        and status <> ''todo''
        and cleared_at is null;'
    );
  end if;

  if position('and sticky_id = payload->>''stickyId''
        and status <> ''todo''
        and cleared_at is null' in function_definition) = 0 then
    if position('    when ''clearStickyArchivedTasks'' then
      delete from public.sticky_tasks
      where user_id = current_user_id
        and sticky_id = payload->>''stickyId''
        and status <> ''todo'';' in function_definition) = 0 then
      raise exception 'clearStickyArchivedTasks replacement point was not found';
    end if;

    function_definition := replace(
      function_definition,
      '    when ''clearStickyArchivedTasks'' then
      delete from public.sticky_tasks
      where user_id = current_user_id
        and sticky_id = payload->>''stickyId''
        and status <> ''todo'';',
      '    when ''clearStickyArchivedTasks'' then
      update public.sticky_tasks
      set cleared_at = to_timestamp(
        coalesce((payload->>''clearedAt'')::numeric, extract(epoch from now()) * 1000) / 1000
      ),
      updated_at = now()
      where user_id = current_user_id
        and sticky_id = payload->>''stickyId''
        and status <> ''todo''
        and cleared_at is null;'
    );
  end if;

  if position('when ''restoreTask''' in function_definition) = 0 then
    if position('    when ''addMemo'' then' in function_definition) = 0 then
      raise exception 'history task mutation insertion point was not found';
    end if;

    function_definition := replace(
      function_definition,
      '    when ''addMemo'' then',
      '    when ''restoreTask'' then
      update public.sticky_tasks
      set
        status = ''todo'',
        sort_order = (payload->>''order'')::bigint,
        cleared_at = null,
        updated_at = now()
      where user_id = current_user_id
        and sticky_id = payload->>''stickyId''
        and id = payload->>''taskId'';

      if not found then
        raise exception ''Task not found'';
      end if;

    when ''deleteTasksPermanently'' then
      delete from public.sticky_tasks
      where user_id = current_user_id
        and id in (
          select value
          from jsonb_array_elements_text(coalesce(payload->''taskIds'', ''[]''::jsonb))
        );

    when ''addMemo'' then'
    );
  end if;

  execute function_definition;
end
$$;
