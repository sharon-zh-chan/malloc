-- Apply after 003 if workspace writes fail with:
-- column reference "client_mutation_id" is ambiguous
--
-- Keep the public RPC argument names stable for existing clients while making
-- the mutation idempotency constraint unambiguous inside the PL/pgSQL body.
do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'public.apply_workspace_mutation(text, text, jsonb)'::regprocedure
  )
  into function_definition;

  if position(
    'on conflict (user_id, client_mutation_id) do nothing'
    in function_definition
  ) = 0 then
    raise exception 'apply_workspace_mutation conflict target was not found';
  end if;

  execute replace(
    function_definition,
    'on conflict (user_id, client_mutation_id) do nothing',
    'on conflict on constraint workspace_mutations_user_id_client_mutation_id_key do nothing'
  );
end
$$;
