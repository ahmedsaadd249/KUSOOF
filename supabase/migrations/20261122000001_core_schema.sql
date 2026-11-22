-- ===========================================================================
-- KUSOOF — core schema: tables, constraints, indexes, triggers, RLS.
-- Writes to orders / items / history / notifications happen ONLY through the
-- SECURITY DEFINER functions in 0002 (no insert/update policies for clients).
-- ===========================================================================

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------- helpers ----------
create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- admin allowlist ----------
-- One row per administrator email. Inserted by the owner with SQL
-- (docs/SETUP.md › Admin); user_id is linked by the admin-request-code
-- Edge Function. No client can read or write this table.
create table public.admin_users (
  email      text primary key check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  user_id    uuid unique references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()));
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------- profiles ----------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '' check (char_length(full_name) <= 120),
  email      text not null check (email = lower(email)),
  phone      text check (phone is null or phone ~ '^\+201[0125][0-9]{8}$'),
  locale     text not null default 'en' check (locale in ('en', 'ar')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_email_key on public.profiles (email);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- New auth user → profile (name + language from sign-up metadata)
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, locale)
  values (
    new.id,
    lower(new.email),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
    case when new.raw_user_meta_data ->> 'locale' = 'ar' then 'ar' else 'en' end
  )
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------- store settings (single row) ----------
create table public.store_settings (
  id                          smallint primary key default 1 check (id = 1),
  store_name                  text not null default 'KUSOOF',
  store_email                 text not null default '',
  store_phone                 text not null default '',
  store_address               text not null default '',
  currency_code               text not null default 'EGP' check (currency_code = 'EGP'),
  currency_display            text not null default 'code' check (currency_display in ('code', 'symbol')),
  currency_decimals           smallint not null default 0 check (currency_decimals in (0, 2)),
  default_low_stock_threshold integer not null default 5 check (default_low_stock_threshold >= 0),
  low_stock_alert             boolean not null default true,
  notify_order_confirmation   boolean not null default true,
  notify_shipped              boolean not null default true,
  notify_delivered            boolean not null default true,
  notify_cancelled            boolean not null default true,
  delivery_enabled            boolean not null default true,
  updated_at                  timestamptz not null default now()
);
create trigger store_settings_updated_at before update on public.store_settings
  for each row execute function private.set_updated_at();

-- ---------- products ----------
create table public.products (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name                 text not null check (char_length(name) between 1 and 120),
  name_ar              text not null default '' check (char_length(name_ar) <= 120),
  category             text not null default 'eyeglasses' check (category in ('sunglasses', 'eyeglasses')),
  short_description    text not null default '' check (char_length(short_description) <= 600),
  short_description_ar text not null default '' check (char_length(short_description_ar) <= 600),
  description          text not null default '' check (char_length(description) <= 6000),
  description_ar       text not null default '' check (char_length(description_ar) <= 6000),
  content              jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),
  price                numeric(10, 2) not null check (price >= 0),
  stock_quantity       integer not null default 0 check (stock_quantity >= 0),
  low_stock_threshold  integer check (low_stock_threshold is null or low_stock_threshold >= 0),
  is_available         boolean not null default true,
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index products_listing_idx on public.products (is_available, sort_order);
create trigger products_updated_at before update on public.products
  for each row execute function private.set_updated_at();

create table public.product_images (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products (id) on delete cascade,
  storage_path text,           -- object in the product-images bucket (admin uploads)
  static_path  text,           -- file shipped with the site (the original photos)
  mobile_path  text,           -- smaller variant, when one exists
  width        integer check (width is null or width > 0),
  height       integer check (height is null or height > 0),
  label_en     text not null default '',
  label_ar     text not null default '',
  alt_en       text not null default '',
  alt_ar       text not null default '',
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  check (storage_path is not null or static_path is not null)
);
create index product_images_product_idx on public.product_images (product_id, sort_order);

-- ---------- shipping zones ----------
create table public.shipping_zones (
  id             uuid primary key default gen_random_uuid(),
  governorate    text not null check (char_length(btrim(governorate)) between 1 and 80),
  governorate_ar text not null default '' check (char_length(governorate_ar) <= 80),
  area           text check (area is null or char_length(btrim(area)) between 1 and 80), -- null = whole governorate
  area_ar        text check (area_ar is null or char_length(area_ar) <= 80),
  delivery_fee   numeric(10, 2) not null check (delivery_fee >= 0),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index shipping_zones_unique_idx on public.shipping_zones (lower(governorate), lower(coalesce(area, '')));
create index shipping_zones_active_idx on public.shipping_zones (is_active, governorate);
create trigger shipping_zones_updated_at before update on public.shipping_zones
  for each row execute function private.set_updated_at();

-- ---------- orders ----------
create table public.orders (
  id                     uuid primary key default gen_random_uuid(),
  order_number           text not null unique check (order_number ~ '^KSF-[0-9]{6}-[0-9A-Z]{4}$'),
  customer_id            uuid references public.profiles (id) on delete set null,
  customer_name          text not null check (char_length(customer_name) between 3 and 120),
  customer_email         text not null,
  customer_phone         text not null check (customer_phone ~ '^\+201[0125][0-9]{8}$'),
  locale                 text not null default 'en' check (locale in ('en', 'ar')),
  subtotal               numeric(10, 2) not null check (subtotal >= 0),
  delivery_fee           numeric(10, 2) not null check (delivery_fee >= 0),
  total_amount           numeric(10, 2) not null check (total_amount = subtotal + delivery_fee),
  payment_method         text not null default 'cash_on_delivery' check (payment_method = 'cash_on_delivery'),
  payment_status         text not null default 'pending' check (payment_status in ('pending', 'paid', 'void')),
  order_status           text not null default 'preparing' check (order_status in ('preparing', 'shipped', 'delivered', 'cancelled')),
  shipping_zone_id       uuid references public.shipping_zones (id) on delete set null,
  shipping_governorate   text not null,
  shipping_governorate_ar text not null default '',
  shipping_area          text not null,
  shipping_area_ar       text not null default '',
  street                 text not null check (char_length(street) between 1 and 200),
  building_number        text not null check (char_length(building_number) between 1 and 40),
  apartment_number       text not null check (char_length(apartment_number) between 1 and 40),
  delivery_instructions  text not null default '' check (char_length(delivery_instructions) <= 500),
  latitude               numeric(9, 6) check (latitude is null or latitude between 21.7 and 31.8),
  longitude              numeric(9, 6) check (longitude is null or longitude between 24.6 and 37.1),
  formatted_address      text not null default '' check (char_length(formatted_address) <= 300),
  idempotency_key        uuid not null,
  stock_restored_at      timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check ((latitude is null) = (longitude is null)),
  unique (customer_id, idempotency_key)
);
create index orders_customer_idx on public.orders (customer_id, created_at desc);
create index orders_status_created_idx on public.orders (order_status, created_at desc);
create index orders_created_idx on public.orders (created_at desc);
create index orders_zone_idx on public.orders (shipping_zone_id);
create trigger orders_updated_at before update on public.orders
  for each row execute function private.set_updated_at();

create table public.order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders (id) on delete cascade,
  product_id      uuid references public.products (id) on delete set null,
  product_name    text not null,
  product_name_ar text not null default '',
  product_image   text not null default '',
  product_price   numeric(10, 2) not null check (product_price >= 0),
  quantity        integer not null check (quantity between 1 and 20),
  line_total      numeric(10, 2) not null check (line_total = product_price * quantity)
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);

create table public.order_status_history (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders (id) on delete cascade,
  previous_status text check (previous_status is null or previous_status in ('preparing', 'shipped', 'delivered', 'cancelled')),
  new_status      text not null check (new_status in ('preparing', 'shipped', 'delivered', 'cancelled')),
  changed_by      uuid references auth.users (id) on delete set null,
  note            text not null default '' check (char_length(note) <= 500),
  changed_at      timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history (order_id, changed_at);
create index order_status_history_changed_by_idx on public.order_status_history (changed_by);

-- ---------- email notifications (outbox + history) ----------
create table public.email_notifications (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders (id) on delete cascade,
  status_history_id uuid unique references public.order_status_history (id) on delete set null,
  customer_email    text not null,
  locale            text not null default 'en' check (locale in ('en', 'ar')),
  notification_type text not null check (notification_type in ('order_confirmation', 'preparing', 'shipped', 'delivered', 'cancelled')),
  email_subject     text not null default '',
  delivery_status   text not null default 'pending' check (delivery_status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts          integer not null default 0 check (attempts >= 0),
  next_attempt_at   timestamptz not null default now(),
  brevo_message_id  text,
  error_message     text,
  sent_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- one email of each type per order, ever (idempotency)
  unique (order_id, notification_type)
);
create index email_notifications_queue_idx on public.email_notifications (delivery_status, next_attempt_at);
create index email_notifications_created_idx on public.email_notifications (created_at desc);
create trigger email_notifications_updated_at before update on public.email_notifications
  for each row execute function private.set_updated_at();

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
alter table public.profiles             enable row level security;
alter table public.store_settings       enable row level security;
alter table public.products             enable row level security;
alter table public.product_images       enable row level security;
alter table public.shipping_zones       enable row level security;
alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.order_status_history enable row level security;
alter table public.email_notifications  enable row level security;

-- profiles: own row (read + limited update), admins read all
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name, phone, locale) on public.profiles to authenticated;

-- store settings: public read, admin update
create policy store_settings_select on public.store_settings for select to anon, authenticated using (true);
create policy store_settings_update on public.store_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke insert, delete on public.store_settings from anon, authenticated;

-- products: public read of available; admins manage
create policy products_select on public.products for select to anon, authenticated
  using (is_available or (select public.is_admin()));
create policy products_insert on public.products for insert to authenticated with check ((select public.is_admin()));
create policy products_update on public.products for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy products_delete on public.products for delete to authenticated using ((select public.is_admin()));

create policy product_images_select on public.product_images for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and (p.is_available or (select public.is_admin()))));
create policy product_images_insert on public.product_images for insert to authenticated with check ((select public.is_admin()));
create policy product_images_update on public.product_images for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy product_images_delete on public.product_images for delete to authenticated using ((select public.is_admin()));

-- shipping zones: public read of active; admins manage
create policy shipping_zones_select on public.shipping_zones for select to anon, authenticated
  using (is_active or (select public.is_admin()));
create policy shipping_zones_insert on public.shipping_zones for insert to authenticated with check ((select public.is_admin()));
create policy shipping_zones_update on public.shipping_zones for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy shipping_zones_delete on public.shipping_zones for delete to authenticated using ((select public.is_admin()));

-- orders and children: customers read their own, admins read all; no client writes
create policy orders_select on public.orders for select to authenticated
  using (customer_id = (select auth.uid()) or (select public.is_admin()));
create policy order_items_select on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (o.customer_id = (select auth.uid()) or (select public.is_admin()))));
create policy order_status_history_select on public.order_status_history for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (o.customer_id = (select auth.uid()) or (select public.is_admin()))));
revoke insert, update, delete on public.orders, public.order_items, public.order_status_history from anon, authenticated;

-- email notifications: admins read; writes only by SECURITY DEFINER functions / service role
create policy email_notifications_select on public.email_notifications for select to authenticated
  using ((select public.is_admin()));
revoke insert, update, delete on public.email_notifications from anon, authenticated;

-- admin_users: no policies → no client access at all
revoke all on public.admin_users from anon, authenticated;

-- Shipping zone deletion is blocked while an open order uses it
create or replace function private.guard_zone_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.orders o where o.shipping_zone_id = old.id and o.order_status in ('preparing', 'shipped')) then
    raise exception using message = 'zone_in_use', hint = 'Deactivate the zone instead; open orders still use it.';
  end if;
  return old;
end $$;
create trigger shipping_zones_guard_delete before delete on public.shipping_zones
  for each row execute function private.guard_zone_delete();
