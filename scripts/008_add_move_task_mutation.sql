-- Add support for moving a task from one sticky to another while preserving
-- its text, status, and created timestamp.

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'public.apply_workspace_mutation(text, text, jsonb)'::regprocedure
  )
  into function_definition;

  if position('when ''moveTask''' in function_definition) > 0 then
    return;
  end if;

  if position('    when ''clearArchivedTasks'' then' in function_definition) = 0 then
    raise exception 'apply_workspace_mutation insertion point was not found';
  end if;

  execute replace(
    function_definition,
    '    when ''clearArchivedTasks'' then',
    '    when ''moveTask'' then
      if not exists (
        select 1
        from public.stickies
        where user_id = current_user_id and id = payload->>''toStickyId''
      ) then
        raise exception ''Sticky not found'';
      end if;

      update public.sticky_tasks
      set
        sticky_id = payload->>''toStickyId'',
        sort_order = (payload->>''order'')::bigint,
        updated_at = now()
      where user_id = current_user_id
        and id = payload->>''taskId'';

      if not found then
        raise exception ''Task not found'';
      end if;

    when ''clearArchivedTasks'' then'
  );
end
$$;
