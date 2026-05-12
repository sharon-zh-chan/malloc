-- Add optimistic concurrency version column to app_state
alter table public.app_state
  add column if not exists version bigint not null default 0;
