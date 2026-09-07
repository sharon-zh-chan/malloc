-- Add first-class journal entries. Journal dates are stored separately from
-- titles so users can rename entries without breaking calendar placement.

create table if not exists public.journal_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  title text not null,
  content text not null default '',
  journal_date text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists journal_entries_user_date_idx
  on public.journal_entries(user_id, journal_date);
create index if not exists journal_entries_user_sort_order_idx
  on public.journal_entries(user_id, sort_order);

alter table public.journal_entries enable row level security;

do $$
begin
  begin
    create policy journal_entries_select_own
      on public.journal_entries for select
      using (auth.uid() = user_id);
  exception when duplicate_object then null;
  end;

  begin
    create policy journal_entries_insert_own
      on public.journal_entries for insert
      with check (auth.uid() = user_id);
  exception when duplicate_object then null;
  end;

  begin
    create policy journal_entries_update_own
      on public.journal_entries for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  exception when duplicate_object then null;
  end;

  begin
    create policy journal_entries_delete_own
      on public.journal_entries for delete
      using (auth.uid() = user_id);
  exception when duplicate_object then null;
  end;
end
$$;

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.get_workspace_state()'::regprocedure)
  into function_definition;

  if position('''journalEntries''' in function_definition) = 0 then
    if position('      ''lastUpdatedAt'', round(extract(epoch from settings.updated_at) * 1000)::bigint' in function_definition) = 0 then
      raise exception 'get_workspace_state journal insertion point was not found';
    end if;

    function_definition := replace(
      function_definition,
      '      ''lastUpdatedAt'', round(extract(epoch from settings.updated_at) * 1000)::bigint',
      '      ''journalEntries'', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            ''id'', entry.id,
            ''title'', entry.title,
            ''content'', entry.content,
            ''journalDate'', entry.journal_date,
            ''createdAt'', round(extract(epoch from entry.created_at) * 1000)::bigint,
            ''updatedAt'', round(extract(epoch from entry.updated_at) * 1000)::bigint,
            ''order'', entry.sort_order
          )
          order by entry.sort_order, entry.journal_date, entry.created_at, entry.id
        )
        from public.journal_entries entry
        where entry.user_id = current_user_id
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

  if position('when ''addJournalEntry''' in function_definition) = 0 then
    if position('    else
      raise exception ''Unsupported workspace action: %'', action;' in function_definition) = 0 then
      raise exception 'apply_workspace_mutation journal insertion point was not found';
    end if;

    function_definition := replace(
      function_definition,
      '    else
      raise exception ''Unsupported workspace action: %'', action;',
      '    when ''addJournalEntry'' then
      insert into public.journal_entries (
        user_id, id, title, content, journal_date, sort_order, created_at, updated_at
      ) values (
        current_user_id,
        payload->''entry''->>''id'',
        payload->''entry''->>''title'',
        coalesce(payload->''entry''->>''content'', ''''),
        payload->''entry''->>''journalDate'',
        (payload->''entry''->>''order'')::integer,
        to_timestamp((payload->''entry''->>''createdAt'')::numeric / 1000),
        to_timestamp((payload->''entry''->>''updatedAt'')::numeric / 1000)
      );

    when ''renameJournalEntry'' then
      update public.journal_entries
      set title = payload->>''title'',
          updated_at = to_timestamp((payload->>''updatedAt'')::numeric / 1000)
      where user_id = current_user_id and id = payload->>''entryId'';
      if not found then raise exception ''Journal entry not found''; end if;

    when ''editJournalEntry'' then
      update public.journal_entries
      set content = payload->>''content'',
          updated_at = to_timestamp((payload->>''updatedAt'')::numeric / 1000)
      where user_id = current_user_id and id = payload->>''entryId'';
      if not found then raise exception ''Journal entry not found''; end if;

    when ''deleteJournalEntry'' then
      delete from public.journal_entries
      where user_id = current_user_id and id = payload->>''entryId'';
      if not found then raise exception ''Journal entry not found''; end if;

      with ordered as (
        select id, row_number() over (order by sort_order, journal_date, created_at, id) - 1 as sort_order
        from public.journal_entries where user_id = current_user_id
      )
      update public.journal_entries entry
      set sort_order = ordered.sort_order, updated_at = now()
      from ordered
      where entry.user_id = current_user_id and entry.id = ordered.id;

    else
      raise exception ''Unsupported workspace action: %'', action;'
    );
  end if;

  execute function_definition;
end
$$;

revoke insert, update, delete on public.journal_entries from anon, authenticated;
grant select on public.journal_entries to authenticated;
