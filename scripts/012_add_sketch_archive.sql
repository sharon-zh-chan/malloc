-- Add soft deletion/restoration for sketches. This migration is safe whether
-- 011_add_sketchpad.sql is new or was already applied.

alter table public.sketches
  add column if not exists previous_collection_id text,
  add column if not exists archived_at timestamptz;

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.get_workspace_state()'::regprocedure)
  into function_definition;

  if position('''previousCollectionId'', sketch.previous_collection_id' in function_definition) = 0 then
    function_definition := replace(
      function_definition,
      '            ''collectionId'', sketch.collection_id,',
      '            ''collectionId'', sketch.collection_id,
            ''previousCollectionId'', sketch.previous_collection_id,
            ''archivedAt'', case
              when sketch.archived_at is null then null
              else round(extract(epoch from sketch.archived_at) * 1000)::bigint
            end,'
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

  if position('when ''archiveSketch''' in function_definition) = 0 then
    function_definition := replace(
      function_definition,
      '    when ''deleteSketch'' then',
      '    when ''archiveSketch'' then
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

    when ''deleteSketch'' then'
    );
  end if;

  if position('previous_collection_id = null,
          archived_at = null' in function_definition) = 0 then
    function_definition := replace(
      function_definition,
      '      set collection_id = nullif(payload->>''collectionId'', ''''),
          updated_at = to_timestamp((payload->>''updatedAt'')::numeric / 1000)',
      '      set collection_id = nullif(payload->>''collectionId'', ''''),
          previous_collection_id = null,
          archived_at = null,
          updated_at = to_timestamp((payload->>''updatedAt'')::numeric / 1000)'
    );
  end if;

  execute function_definition;
end
$$;
