-- Welcome email: one per customer, sent when a new customer verifies their
-- email for the first time (the sign-up code). Same outbox as the order
-- emails, so it gets the same retries, history and Settings toggle.
-- Admins never get one; customers who signed up before this don't either.

-- An outbox row now belongs to an order (order emails) or a customer (welcome).
alter table public.email_notifications alter column order_id drop not null;
alter table public.email_notifications
  add column customer_id uuid references public.profiles (id) on delete set null;

alter table public.email_notifications drop constraint email_notifications_notification_type_check;
alter table public.email_notifications add constraint email_notifications_notification_type_check
  check (notification_type in ('welcome', 'order_confirmation', 'preparing', 'shipped', 'delivered', 'cancelled'));
alter table public.email_notifications add constraint email_notifications_target_check
  check ((notification_type = 'welcome') = (order_id is null));

create unique index email_notifications_one_welcome
  on public.email_notifications (customer_id) where notification_type = 'welcome';
create index email_notifications_customer_idx on public.email_notifications (customer_id);

alter table public.store_settings add column notify_welcome boolean not null default true;

-- Subjects match js/data/email-templates.js
create or replace function private.email_subject(p_type text, p_locale text, p_number text)
returns text language sql immutable set search_path = '' as $$
  select case when p_locale = 'ar' then
    case p_type
      when 'welcome' then 'أهلًا بك في كسوف'
      when 'order_confirmation' then 'تم تأكيد طلبك — ' || p_number
      when 'preparing' then 'طلبك قيد التجهيز!'
      when 'shipped' then 'تم شحن طلبك!'
      when 'delivered' then 'تم استلام طلبك!'
      when 'cancelled' then 'تم إلغاء طلبك!'
    end
  else
    case p_type
      when 'welcome' then 'Welcome to KUSOOF'
      when 'order_confirmation' then 'Order Confirmed — ' || p_number
      when 'preparing' then 'Your Order Is Being Prepared!'
      when 'shipped' then 'Your Order Has Been Shipped!'
      when 'delivered' then 'Your Order Has Been Delivered!'
      when 'cancelled' then 'Your Order Has Been Cancelled!'
    end
  end;
$$;

create or replace function private.email_enabled(p_type text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case p_type
      when 'welcome' then s.notify_welcome
      when 'order_confirmation' then s.notify_order_confirmation
      when 'shipped' then s.notify_shipped
      when 'delivered' then s.notify_delivered
      when 'cancelled' then s.notify_cancelled
      else true end
    from public.store_settings s where s.id = 1), true);
$$;

-- Queue the welcome email for one customer (at most once, ever).
create or replace function private.queue_welcome_email(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_email  text;
  v_locale text;
begin
  select p.email, p.locale into v_email, v_locale from public.profiles p where p.id = p_user_id;
  if v_email is null then
    return;
  end if;
  if exists (select 1 from public.admin_users a where a.user_id = p_user_id or a.email = v_email) then
    return;
  end if;
  insert into public.email_notifications (customer_id, customer_email, locale, notification_type, email_subject, delivery_status)
  values (p_user_id, v_email, v_locale, 'welcome',
          private.email_subject('welcome', v_locale, ''),
          case when private.email_enabled('welcome') then 'pending' else 'skipped' end)
  on conflict do nothing;
end $$;
revoke all on function private.queue_welcome_email(uuid) from public, anon, authenticated;

-- First email verification (the 6-digit sign-up code) → welcome email.
create or replace function private.handle_user_confirmed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    begin
      perform private.queue_welcome_email(new.id);
    exception when others then
      -- an email problem must never block signing in
      raise warning 'welcome email not queued for %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end $$;
create trigger on_auth_user_confirmed after update of email_confirmed_at on auth.users
  for each row execute function private.handle_user_confirmed();
