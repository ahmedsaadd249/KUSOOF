-- ===========================================================================
-- KUSOOF — helper for the admin-request-code Edge Function (service role
-- only): find an existing auth user by email, so an allowlisted admin who
-- already has a login (e.g. registered as a customer) gets linked to it.
-- ===========================================================================
create or replace function public.auth_user_id_by_email(p_email text)
returns uuid language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1;
$$;
revoke all on function public.auth_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.auth_user_id_by_email(text) to service_role;
