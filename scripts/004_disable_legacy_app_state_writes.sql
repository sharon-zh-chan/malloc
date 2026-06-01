-- Apply only after the RPC-based frontend and external helpers are deployed.
-- Legacy reads remain available temporarily for migration verification.
revoke insert, update, delete on public.app_state from anon, authenticated;
