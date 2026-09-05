-- Add manual memo and memo folder ordering to the workspace mutation RPC.

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.apply_workspace_mutation(text, text, jsonb)'::regprocedure)
  into function_definition;

  if position('and sort_order >= (payload->''collection''->>''order'')::integer' in function_definition) = 0 then
    if position($needle$
    when 'addMemoCollection' then
      insert into public.memo_collections (
$needle$ in function_definition) = 0 then
      raise exception 'apply_workspace_mutation memo collection insert point was not found';
    end if;

    function_definition := replace(
      function_definition,
      $needle$
    when 'addMemoCollection' then
      insert into public.memo_collections (
$needle$,
      $replacement$
    when 'addMemoCollection' then
      update public.memo_collections
      set sort_order = sort_order + 1
      where user_id = current_user_id
        and sort_order >= (payload->'collection'->>'order')::integer;

      insert into public.memo_collections (
$replacement$
    );

    execute function_definition;
  end if;
end
$$;

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.apply_workspace_mutation(text, text, jsonb)'::regprocedure)
  into function_definition;

  if position('when ''reorderMemos'' then' in function_definition) = 0 then
    if position($needle$
    when 'archiveMemo' then
$needle$ in function_definition) = 0 then
      raise exception 'apply_workspace_mutation memo reorder insertion point was not found';
    end if;

    function_definition := replace(
      function_definition,
      $needle$
    when 'archiveMemo' then
$needle$,
      $replacement$
    when 'reorderMemos' then
      if exists (
        select 1
        from jsonb_array_elements(payload->'memos') source(memo)
        left join public.memos memo
          on memo.user_id = current_user_id
          and memo.id = source.memo->>'memoId'
        where memo.id is null
      ) then
        raise exception 'Memo not found';
      end if;

      if exists (
        select 1
        from jsonb_array_elements(payload->'memos') source(memo)
        left join public.memo_collections collection
          on collection.user_id = current_user_id
          and collection.id = source.memo->>'collectionId'
        where source.memo->>'collectionId' is not null
          and collection.id is null
      ) then
        raise exception 'Memo collection not found';
      end if;

      if (
        select count(*)
        from jsonb_array_elements(payload->'memos')
      ) <> (
        select count(*)
        from public.memos
        where user_id = current_user_id
      ) or (
        select count(*)
        from jsonb_array_elements(payload->'memos')
      ) <> (
        select count(distinct source.memo->>'memoId')
        from jsonb_array_elements(payload->'memos') source(memo)
      ) then
        raise exception 'memos must list every memo exactly once';
      end if;

      update public.memos memo
      set
        sort_order = source.sort_order::integer,
        collection_id = case
          when memo.archived_at is null then nullif(source.collection_id, '')
          else memo.collection_id
        end,
        previous_collection_id = case
          when memo.archived_at is null then null
          else memo.previous_collection_id
        end,
        updated_at = case
          when memo.archived_at is null then to_timestamp((payload->>'updatedAt')::numeric / 1000)
          else memo.updated_at
        end
      from (
        select
          value->>'memoId' as memo_id,
          value->>'collectionId' as collection_id,
          ordinality - 1 as sort_order
        from jsonb_array_elements(payload->'memos') with ordinality
      ) source
      where memo.user_id = current_user_id and memo.id = source.memo_id;

    when 'archiveMemo' then
$replacement$
    );

    execute function_definition;
  end if;
end
$$;

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.apply_workspace_mutation(text, text, jsonb)'::regprocedure)
  into function_definition;

  if position('when ''reorderMemoCollections'' then' in function_definition) = 0 then
    with ordered as (
      select
        user_id,
        id,
        row_number() over (
          partition by user_id
          order by lower(title), title, created_at, id
        ) - 1 as sort_order
      from public.memo_collections
    )
    update public.memo_collections collection
    set sort_order = ordered.sort_order
    from ordered
    where collection.user_id = ordered.user_id
      and collection.id = ordered.id;

    if position($needle$
    else
      raise exception 'Unsupported workspace action: %', action;
$needle$ in function_definition) = 0 then
      raise exception 'apply_workspace_mutation memo collection reorder insertion point was not found';
    end if;

    function_definition := replace(
      function_definition,
      $needle$
    else
      raise exception 'Unsupported workspace action: %', action;
$needle$,
      $replacement$
    when 'reorderMemoCollections' then
      if exists (
        select 1
        from jsonb_array_elements_text(payload->'collectionIds') source(collection_id)
        left join public.memo_collections collection
          on collection.user_id = current_user_id
          and collection.id = source.collection_id
        where collection.id is null
      ) then
        raise exception 'Memo collection not found';
      end if;

      if (
        select count(*)
        from jsonb_array_elements_text(payload->'collectionIds')
      ) <> (
        select count(*)
        from public.memo_collections
        where user_id = current_user_id
      ) or (
        select count(*)
        from jsonb_array_elements_text(payload->'collectionIds')
      ) <> (
        select count(distinct collection_id)
        from jsonb_array_elements_text(payload->'collectionIds') source(collection_id)
      ) then
        raise exception 'collectionIds must list every memo collection exactly once';
      end if;

      update public.memo_collections collection
      set sort_order = source.sort_order::integer, updated_at = now()
      from (
        select value as collection_id, ordinality - 1 as sort_order
        from jsonb_array_elements_text(payload->'collectionIds') with ordinality
      ) source
      where collection.user_id = current_user_id
        and collection.id = source.collection_id;

    else
      raise exception 'Unsupported workspace action: %', action;
$replacement$
    );

    execute function_definition;
  end if;
end
$$;
