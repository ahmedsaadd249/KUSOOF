-- ===========================================================================
-- KUSOOF — email outbox processing + product image storage.
--
-- Email flow (separate from order changes, so a Brevo failure never undoes
-- an order or a status change):
--   1. place_order / admin_set_order_status insert a row into
--      email_notifications (status pending) in the same transaction.
--   2. An AFTER INSERT trigger asks pg_net to POST the email-dispatch Edge
--      Function (queued; sent only if the transaction commits).
--   3. email-dispatch claims due rows (claim_email_jobs), sends them via
--      Brevo and records the result (complete_email_job). Temporary failures
--      retry with backoff 1 / 5 / 15 / 60 min, up to 5 attempts.
--   4. pg_cron runs every minute to pick up retries.
-- Settings (dispatch URL, shared secret) live in private.app_config, which
-- no client can read. See docs/SETUP.md › Email dispatch.
-- ===========================================================================

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create table if not exists private.app_config (
  key   text primary key,
  value text not null
);
revoke all on private.app_config from public, anon, authenticated;

create or replace function private.kick_email_dispatch()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_url    text;
  v_secret text;
  v_anon   text;
begin
  select value into v_url from private.app_config where key = 'dispatch_url';
  select value into v_secret from private.app_config where key = 'dispatch_secret';
  select value into v_anon from private.app_config where key = 'anon_key';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('source', 'database'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_anon, ''),
      'x-dispatch-secret', v_secret),
    timeout_milliseconds := 10000);
end $$;

create or replace function private.on_email_queued()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.delivery_status = 'pending' then
    perform private.kick_email_dispatch();
  end if;
  return null;
end $$;
create trigger email_notifications_dispatch after insert on public.email_notifications
  for each row execute function private.on_email_queued();

create or replace function private.kick_email_dispatch_if_due()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.email_notifications
     where (delivery_status = 'pending' and next_attempt_at <= now())
        or (delivery_status = 'sending' and updated_at < now() - interval '10 minutes')) then
    perform private.kick_email_dispatch();
  end if;
end $$;

select cron.schedule('kusoof-email-dispatch', '* * * * *', 'select private.kick_email_dispatch_if_due()');

-- ---------- called by the email-dispatch Edge Function (service role only) ----------
create or replace function public.email_dispatch_authorized(p_secret text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(p_secret, '') <> ''
     and exists (select 1 from private.app_config where key = 'dispatch_secret' and value = p_secret);
$$;

create or replace function public.claim_email_jobs(p_limit integer default 10)
returns setof public.email_notifications
language plpgsql security definer set search_path = '' as $$
begin
  -- A run that died mid-send leaves rows in "sending"; give them back after 10 minutes
  update public.email_notifications
     set delivery_status = 'pending'
   where delivery_status = 'sending' and updated_at < now() - interval '10 minutes';

  return query
    update public.email_notifications n
       set delivery_status = 'sending', attempts = n.attempts + 1
     where n.id in (
       select q.id from public.email_notifications q
        where q.delivery_status = 'pending' and q.next_attempt_at <= now()
        order by q.created_at
        limit greatest(1, least(coalesce(p_limit, 10), 50))
        for update skip locked)
    returning n.*;
end $$;

create or replace function public.complete_email_job(
  p_id uuid, p_ok boolean, p_message_id text default null, p_error text default null,
  p_subject text default null, p_permanent boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_attempts integer;
begin
  select attempts into v_attempts from public.email_notifications where id = p_id and delivery_status = 'sending';
  if v_attempts is null then
    return; -- not claimed (already completed elsewhere)
  end if;
  if p_ok then
    update public.email_notifications
       set delivery_status = 'sent', sent_at = now(), brevo_message_id = p_message_id, error_message = null,
           email_subject = coalesce(nullif(p_subject, ''), email_subject)
     where id = p_id;
  elsif p_permanent or v_attempts >= 5 then
    update public.email_notifications
       set delivery_status = 'failed', error_message = left(coalesce(p_error, 'Unknown error'), 1000)
     where id = p_id;
  else
    update public.email_notifications
       set delivery_status = 'pending',
           error_message = left(coalesce(p_error, 'Unknown error'), 1000),
           next_attempt_at = now() + case v_attempts
             when 1 then interval '1 minute'
             when 2 then interval '5 minutes'
             when 3 then interval '15 minutes'
             else interval '60 minutes' end
     where id = p_id;
  end if;
end $$;

revoke all on function public.email_dispatch_authorized(text) from public, anon, authenticated;
revoke all on function public.claim_email_jobs(integer) from public, anon, authenticated;
revoke all on function public.complete_email_job(uuid, boolean, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.email_dispatch_authorized(text) to service_role;
grant execute on function public.claim_email_jobs(integer) to service_role;
grant execute on function public.complete_email_job(uuid, boolean, text, text, text, boolean) to service_role;

-- Admin: send a failed email again (same row, so it can never become two emails)
create or replace function public.admin_retry_email(p_notification_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  update public.email_notifications
     set delivery_status = 'pending', next_attempt_at = now(), attempts = 0, error_message = null
   where id = p_notification_id and delivery_status = 'failed';
  if not found then
    raise exception using message = 'not_retryable';
  end if;
  perform private.kick_email_dispatch();
end $$;
revoke all on function public.admin_retry_email(uuid) from public, anon;
grant execute on function public.admin_retry_email(uuid) to authenticated;

-- ---------- product images bucket ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public bucket: files are served by URL without a select policy (no listing).
create policy "product-images admin select" on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));
create policy "product-images admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.is_admin()));
create policy "product-images admin update" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()))
  with check (bucket_id = 'product-images' and (select public.is_admin()));
create policy "product-images admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));
