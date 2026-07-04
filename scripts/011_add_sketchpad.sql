-- Add first-class sketch documents and folders. Drawing elements are stored as
-- JSON so the client can evolve the canvas format without schema churn.

create table if not exists public.sketch_collections (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  title text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.sketches (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  title text not null,
  elements jsonb not null default '[]'::jsonb
    check (jsonb_typeof(elements) = 'array'),
  collection_id text,
  previous_collection_id text,
  archived_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, collection_id)
    references public.sketch_collections(user_id, id) on delete no action
);

alter table public.sketches
  add column if not exists previous_collection_id text,
  add column if not exists archived_at timestamptz;

create index if not exists sketch_collections_user_sort_order_idx
  on public.sketch_collections(user_id, sort_order);
create index if not exists sketches_user_sort_order_idx
  on public.sketches(user_id, sort_order);

alter table public.sketch_collections enable row level security;
alter table public.sketches enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['sketch_collections', 'sketches']
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

-- Extend the workspace serializer without replacing later task/subtask changes.
do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.get_workspace_state()'::regprocedure)
  into function_definition;

  if position('''sketchCollections''' in function_definition) = 0 then
    if position('      ''lastUpdatedAt'', round(extract(epoch from settings.updated_at) * 1000)::bigint' in function_definition) = 0 then
      raise exception 'get_workspace_state sketch insertion point was not found';
    end if;

    function_definition := replace(
      function_definition,
      '      ''lastUpdatedAt'', round(extract(epoch from settings.updated_at) * 1000)::bigint',
      '      ''sketches'', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            ''id'', sketch.id,
            ''title'', sketch.title,
            ''elements'', sketch.elements,
            ''collectionId'', sketch.collection_id,
            ''previousCollectionId'', sketch.previous_collection_id,
            ''archivedAt'', case
              when sketch.archived_at is null then null
              else round(extract(epoch from sketch.archived_at) * 1000)::bigint
            end,
            ''createdAt'', round(extract(epoch from sketch.created_at) * 1000)::bigint,
            ''updatedAt'', round(extract(epoch from sketch.updated_at) * 1000)::bigint,
            ''order'', sketch.sort_order
          )
          order by sketch.sort_order, sketch.created_at, sketch.id
        )
        from public.sketches sketch
        where sketch.user_id = current_user_id
      ), ''[]''::jsonb),
      ''sketchCollections'', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            ''id'', collection.id,
            ''title'', collection.title,
            ''createdAt'', round(extract(epoch from collection.created_at) * 1000)::bigint,
            ''updatedAt'', round(extract(epoch from collection.updated_at) * 1000)::bigint,
            ''order'', collection.sort_order
          )
          order by collection.sort_order, collection.created_at, collection.id
        )
        from public.sketch_collections collection
        where collection.user_id = current_user_id
      ), ''[]''::jsonb),
      ''lastUpdatedAt'', round(extract(epoch from settings.updated_at) * 1000)::bigint'
    );
  end if;

  execute function_definition;
end
$$;

-- Extend the mutation switch while preserving all previously added actions.
do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'public.apply_workspace_mutation(text, text, jsonb)'::regprocedure
  ) into function_definition;

  if position('when ''addSketch''' in function_definition) = 0 then
    if position('    else
      raise exception ''Unsupported workspace action: %'', action;' in function_definition) = 0 then
      raise exception 'apply_workspace_mutation sketch insertion point was not found';
    end if;

    function_definition := replace(
      function_definition,
      '    else
      raise exception ''Unsupported workspace action: %'', action;',
      '    when ''addSketch'' then
      insert into public.sketches (
        user_id, id, title, elements, collection_id, previous_collection_id,
        archived_at, sort_order, created_at, updated_at
      ) values (
        current_user_id,
        payload->''sketch''->>''id'',
        payload->''sketch''->>''title'',
        coalesce(payload->''sketch''->''elements'', ''[]''::jsonb),
        nullif(payload->''sketch''->>''collectionId'', ''''),
        nullif(payload->''sketch''->>''previousCollectionId'', ''''),
        case when payload->''sketch''->>''archivedAt'' is null then null
          else to_timestamp((payload->''sketch''->>''archivedAt'')::numeric / 1000)
        end,
        (payload->''sketch''->>''order'')::integer,
        to_timestamp((payload->''sketch''->>''createdAt'')::numeric / 1000),
        to_timestamp((payload->''sketch''->>''updatedAt'')::numeric / 1000)
      );

    when ''renameSketch'' then
      update public.sketches
      set title = payload->>''title'',
          updated_at = to_timestamp((payload->>''updatedAt'')::numeric / 1000)
      where user_id = current_user_id and id = payload->>''sketchId'';
      if not found then raise exception ''Sketch not found''; end if;

    when ''editSketch'' then
      update public.sketches
      set elements = coalesce(payload->''elements'', ''[]''::jsonb),
          updated_at = to_timestamp((payload->>''updatedAt'')::numeric / 1000)
      where user_id = current_user_id and id = payload->>''sketchId'';
      if not found then raise exception ''Sketch not found''; end if;

    when ''moveSketch'' then
      update public.sketches
      set collection_id = nullif(payload->>''collectionId'', ''''),
          previous_collection_id = null,
          archived_at = null,
          updated_at = to_timestamp((payload->>''updatedAt'')::numeric / 1000)
      where user_id = current_user_id and id = payload->>''sketchId'';
      if not found then raise exception ''Sketch not found''; end if;

    when ''archiveSketch'' then
      update public.sketches
      set previous_collection_id = coalesce(previous_collection_id, collection_id),
          collection_id = null,
          archived_at = to_timestamp((payload->>''archivedAt'')::numeric / 1000),
          updated_at = to_timestamp((payload->>''updatedAt'')::numeric / 1000)
      where user_id = current_user_id and id = payload->>''sketchId'';
      if not found then raise exception ''Sketch not found''; end if;

    when ''restoreSketch'' then
      update public.sketches
      set collection_id = previous_collection_id,
          previous_collection_id = null,
          archived_at = null,
          updated_at = to_timestamp((payload->>''updatedAt'')::numeric / 1000)
      where user_id = current_user_id and id = payload->>''sketchId'';
      if not found then raise exception ''Sketch not found''; end if;

    when ''deleteSketch'' then
      delete from public.sketches
      where user_id = current_user_id and id = payload->>''sketchId'';
      if not found then raise exception ''Sketch not found''; end if;

      with ordered as (
        select id, row_number() over (order by sort_order, created_at, id) - 1 as sort_order
        from public.sketches where user_id = current_user_id
      )
      update public.sketches sketch
      set sort_order = ordered.sort_order, updated_at = now()
      from ordered
      where sketch.user_id = current_user_id and sketch.id = ordered.id;

    when ''addSketchCollection'' then
      insert into public.sketch_collections (
        user_id, id, title, sort_order, created_at, updated_at
      ) values (
        current_user_id,
        payload->''collection''->>''id'',
        payload->''collection''->>''title'',
        (payload->''collection''->>''order'')::integer,
        to_timestamp((payload->''collection''->>''createdAt'')::numeric / 1000),
        to_timestamp((payload->''collection''->>''updatedAt'')::numeric / 1000)
      );

    when ''renameSketchCollection'' then
      update public.sketch_collections
      set title = payload->>''title'',
          updated_at = to_timestamp((payload->>''updatedAt'')::numeric / 1000)
      where user_id = current_user_id and id = payload->>''collectionId'';
      if not found then raise exception ''Sketch collection not found''; end if;

    when ''deleteSketchCollection'' then
      update public.sketches
      set collection_id = case
            when collection_id = payload->>''collectionId'' then null
            else collection_id
          end,
          previous_collection_id = case
            when previous_collection_id = payload->>''collectionId'' then null
            else previous_collection_id
          end,
          updated_at = now()
      where user_id = current_user_id
        and (
          collection_id = payload->>''collectionId''
          or previous_collection_id = payload->>''collectionId''
        );

      delete from public.sketch_collections
      where user_id = current_user_id and id = payload->>''collectionId'';
      if not found then raise exception ''Sketch collection not found''; end if;

      with ordered as (
        select id, row_number() over (order by sort_order, created_at, id) - 1 as sort_order
        from public.sketch_collections where user_id = current_user_id
      )
      update public.sketch_collections collection
      set sort_order = ordered.sort_order, updated_at = now()
      from ordered
      where collection.user_id = current_user_id and collection.id = ordered.id;

    else
      raise exception ''Unsupported workspace action: %'', action;'
    );
  end if;

  execute function_definition;
end
$$;

revoke insert, update, delete on public.sketch_collections from anon, authenticated;
revoke insert, update, delete on public.sketches from anon, authenticated;
grant select on public.sketch_collections to authenticated;
grant select on public.sketches to authenticated;
