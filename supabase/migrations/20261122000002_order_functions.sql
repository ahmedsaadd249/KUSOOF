-- ===========================================================================
-- KUSOOF — trusted business logic (SECURITY DEFINER, fixed search_path).
--   place_order             customer checkout: prices, fee and totals computed
--                           here; stock checked + deducted atomically;
--                           idempotent per (customer, idempotency key)
--   admin_set_order_status  forward-only state machine, history, one-time
--                           stock restoration on cancel, email outbox row
--   admin_list_customers    customers (admins excluded) with order stats
-- ===========================================================================

-- "+20 10 1234 5678", "01012345678", "٠١٠…" → "+201012345678" (or null)
create or replace function private.normalize_eg_phone(p text)
returns text language plpgsql immutable set search_path = '' as $$
declare d text;
begin
  d := translate(coalesce(p, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
  d := regexp_replace(d, '[^0-9]', '', 'g');
  if d like '0020%' then d := substr(d, 5);
  elsif d like '20%' and length(d) = 12 then d := substr(d, 3);
  end if;
  if d like '0%' then d := substr(d, 2); end if;
  if d ~ '^1[0125][0-9]{8}$' then return '+20' || d; end if;
  return null;
end $$;

-- KSF-YYMMDD-XXXX (Cairo date + 4 random chars without 0/O/1/I)
create or replace function private.new_order_number()
returns text language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  b bytea := extensions.gen_random_bytes(4);
  s text := '';
begin
  for i in 0..3 loop
    s := s || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return 'KSF-' || to_char(now() at time zone 'Africa/Cairo', 'YYMMDD') || '-' || s;
end $$;

-- Subjects match js/data/email-templates.js (the dispatcher stores the subject it actually sent)
create or replace function private.email_subject(p_type text, p_locale text, p_number text)
returns text language sql immutable set search_path = '' as $$
  select case when p_locale = 'ar' then
    case p_type
      when 'order_confirmation' then 'تم تأكيد طلبك — ' || p_number
      when 'preparing' then 'طلبك قيد التجهيز!'
      when 'shipped' then 'تم شحن طلبك!'
      when 'delivered' then 'تم استلام طلبك!'
      when 'cancelled' then 'تم إلغاء طلبك!'
    end
  else
    case p_type
      when 'order_confirmation' then 'Order Confirmed — ' || p_number
      when 'preparing' then 'Your Order Is Being Prepared!'
      when 'shipped' then 'Your Order Has Been Shipped!'
      when 'delivered' then 'Your Order Has Been Delivered!'
      when 'cancelled' then 'Your Order Has Been Cancelled!'
    end
  end;
$$;

-- Settings › Notifications toggles
create or replace function private.email_enabled(p_type text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case p_type
      when 'order_confirmation' then s.notify_order_confirmation
      when 'shipped' then s.notify_shipped
      when 'delivered' then s.notify_delivered
      when 'cancelled' then s.notify_cancelled
      else true end
    from public.store_settings s where s.id = 1), true);
$$;

-- ---------------------------------------------------------------------------
-- place_order(payload, idempotency key)
-- payload: { customer_name, phone, locale, shipping_zone_id, area (only for a
--   governorate-wide zone), street, building_number, apartment_number,
--   delivery_instructions, latitude, longitude, formatted_address,
--   items: [{ product_id, quantity }] }
-- Prices, fee and totals sent by the client are ignored by design.
-- Errors: message = not_authenticated | validation (detail = field) |
--   delivery_disabled | invalid_zone | outside_egypt | empty_cart |
--   product_unavailable | insufficient_stock (detail = json)
-- ---------------------------------------------------------------------------
create or replace function public.place_order(payload jsonb, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid          uuid := auth.uid();
  v_email        text;
  v_existing     record;
  v_settings     public.store_settings;
  v_name         text := btrim(coalesce(payload ->> 'customer_name', ''));
  v_phone        text := private.normalize_eg_phone(payload ->> 'phone');
  v_locale       text := case when payload ->> 'locale' = 'ar' then 'ar' else 'en' end;
  v_zone         public.shipping_zones;
  v_area         text;
  v_area_ar      text;
  v_street       text := btrim(coalesce(payload ->> 'street', ''));
  v_building     text := btrim(coalesce(payload ->> 'building_number', ''));
  v_apartment    text := btrim(coalesce(payload ->> 'apartment_number', ''));
  v_instructions text := btrim(coalesce(payload ->> 'delivery_instructions', ''));
  v_formatted    text := left(btrim(coalesce(payload ->> 'formatted_address', '')), 300);
  v_lat          numeric;
  v_lng          numeric;
  v_line         record;
  v_product      public.products;
  v_lines        jsonb := '[]'::jsonb;
  v_subtotal     numeric(10, 2) := 0;
  v_order_id     uuid;
  v_number       text;
  v_tries        int := 0;
begin
  if v_uid is null then
    raise exception using message = 'not_authenticated', errcode = '28000';
  end if;
  if p_idempotency_key is null then
    raise exception using message = 'validation', detail = 'idempotency_key';
  end if;

  -- Same checkout attempt submitted again → return the order already created
  select o.id, o.order_number into v_existing
    from public.orders o where o.customer_id = v_uid and o.idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('order_id', v_existing.id, 'order_number', v_existing.order_number, 'duplicate', true);
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_uid;
  if v_email is null then
    raise exception using message = 'not_authenticated', errcode = '28000';
  end if;

  select * into v_settings from public.store_settings where id = 1;
  if not coalesce(v_settings.delivery_enabled, true) then
    raise exception using message = 'delivery_disabled';
  end if;

  -- Fields (same rules as the checkout form)
  if char_length(v_name) not between 3 and 120 or v_name !~ '\S\s+\S' then
    raise exception using message = 'validation', detail = 'customer_name';
  end if;
  if v_phone is null then raise exception using message = 'validation', detail = 'phone'; end if;
  if char_length(v_street) not between 1 and 200 then raise exception using message = 'validation', detail = 'street'; end if;
  if char_length(v_building) not between 1 and 40 then raise exception using message = 'validation', detail = 'building_number'; end if;
  if char_length(v_apartment) not between 1 and 40 then raise exception using message = 'validation', detail = 'apartment_number'; end if;
  if char_length(v_instructions) > 500 then raise exception using message = 'validation', detail = 'delivery_instructions'; end if;

  -- Location: optional (manual address when maps are unavailable), but always inside Egypt
  if coalesce(payload ->> 'latitude', '') !~ '^-?[0-9]{1,3}(\.[0-9]+)?$' and coalesce(payload ->> 'latitude', '') <> ''
     or coalesce(payload ->> 'longitude', '') !~ '^-?[0-9]{1,3}(\.[0-9]+)?$' and coalesce(payload ->> 'longitude', '') <> '' then
    raise exception using message = 'validation', detail = 'location';
  end if;
  v_lat := round(nullif(payload ->> 'latitude', '')::numeric, 6);
  v_lng := round(nullif(payload ->> 'longitude', '')::numeric, 6);
  if (v_lat is null) <> (v_lng is null) then raise exception using message = 'validation', detail = 'location'; end if;
  if v_lat is not null and (v_lat not between 21.7 and 31.8 or v_lng not between 24.6 and 37.1) then
    raise exception using message = 'outside_egypt';
  end if;

  -- Delivery zone: the fee always comes from the database
  if coalesce(payload ->> 'shipping_zone_id', '') ~ '^[0-9a-fA-F-]{36}$' then
    select * into v_zone from public.shipping_zones z
      where z.id = (payload ->> 'shipping_zone_id')::uuid and z.is_active;
  end if;
  if v_zone.id is null then raise exception using message = 'invalid_zone'; end if;
  if v_zone.area is null then
    v_area := btrim(coalesce(payload ->> 'area', ''));
    v_area_ar := '';
    if char_length(v_area) not between 1 and 80 then raise exception using message = 'validation', detail = 'area'; end if;
  else
    v_area := v_zone.area;
    v_area_ar := coalesce(v_zone.area_ar, '');
  end if;

  -- Items: well-formed, merged per product, locked in a stable order
  if jsonb_typeof(payload -> 'items') is distinct from 'array' or jsonb_array_length(payload -> 'items') = 0 then
    raise exception using message = 'empty_cart';
  end if;
  if jsonb_array_length(payload -> 'items') > 20 or exists (
      select 1 from jsonb_array_elements(payload -> 'items') e
      where coalesce(e ->> 'product_id', '') !~ '^[0-9a-fA-F-]{36}$' or coalesce(e ->> 'quantity', '') !~ '^[0-9]{1,2}$') then
    raise exception using message = 'validation', detail = 'items';
  end if;

  for v_line in
    select (e ->> 'product_id')::uuid as product_id, sum((e ->> 'quantity')::int)::int as quantity
      from jsonb_array_elements(payload -> 'items') e
     group by 1
     order by 1
  loop
    if v_line.quantity not between 1 and 20 then
      raise exception using message = 'validation', detail = 'quantity';
    end if;
    select * into v_product from public.products p where p.id = v_line.product_id for update;
    if v_product.id is null or not v_product.is_available then
      raise exception using message = 'product_unavailable', detail = coalesce(v_product.name, v_line.product_id::text);
    end if;
    if v_product.stock_quantity < v_line.quantity then
      raise exception using message = 'insufficient_stock',
        detail = jsonb_build_object('product_id', v_product.id, 'slug', v_product.slug, 'name', v_product.name, 'available', v_product.stock_quantity)::text;
    end if;
    v_subtotal := v_subtotal + v_product.price * v_line.quantity;
    v_lines := v_lines || jsonb_build_object(
      'product_id', v_product.id,
      'name', v_product.name,
      'name_ar', v_product.name_ar,
      'price', v_product.price,
      'quantity', v_line.quantity,
      'image', coalesce((
        select case when pi.storage_path is not null then 'sb:' || pi.storage_path else coalesce(pi.mobile_path, pi.static_path) end
          from public.product_images pi where pi.product_id = v_product.id order by pi.sort_order limit 1), ''));
  end loop;

  -- Order (unique number; a unique clash on the idempotency key means a parallel duplicate)
  loop
    begin
      v_number := private.new_order_number();
      insert into public.orders (
        order_number, customer_id, customer_name, customer_email, customer_phone, locale,
        subtotal, delivery_fee, total_amount,
        shipping_zone_id, shipping_governorate, shipping_governorate_ar, shipping_area, shipping_area_ar,
        street, building_number, apartment_number, delivery_instructions,
        latitude, longitude, formatted_address, idempotency_key)
      values (
        v_number, v_uid, v_name, v_email, v_phone, v_locale,
        v_subtotal, v_zone.delivery_fee, v_subtotal + v_zone.delivery_fee,
        v_zone.id, v_zone.governorate, v_zone.governorate_ar, v_area, v_area_ar,
        v_street, v_building, v_apartment, v_instructions,
        v_lat, v_lng, v_formatted, p_idempotency_key)
      returning id into v_order_id;
      exit;
    exception when unique_violation then
      select o.id, o.order_number into v_existing
        from public.orders o where o.customer_id = v_uid and o.idempotency_key = p_idempotency_key;
      if found then
        return jsonb_build_object('order_id', v_existing.id, 'order_number', v_existing.order_number, 'duplicate', true);
      end if;
      v_tries := v_tries + 1;
      if v_tries >= 5 then raise; end if;
    end;
  end loop;

  insert into public.order_items (order_id, product_id, product_name, product_name_ar, product_image, product_price, quantity, line_total)
  select v_order_id, (l ->> 'product_id')::uuid, l ->> 'name', l ->> 'name_ar', l ->> 'image',
         (l ->> 'price')::numeric, (l ->> 'quantity')::int, (l ->> 'price')::numeric * (l ->> 'quantity')::int
    from jsonb_array_elements(v_lines) l;

  -- Stock is deducted once, in the same transaction as the order
  update public.products p
     set stock_quantity = p.stock_quantity - (l ->> 'quantity')::int
    from jsonb_array_elements(v_lines) l
   where p.id = (l ->> 'product_id')::uuid;

  insert into public.order_status_history (order_id, previous_status, new_status, changed_by)
  values (v_order_id, null, 'preparing', v_uid);

  insert into public.email_notifications (order_id, customer_email, locale, notification_type, email_subject, delivery_status)
  values (v_order_id, v_email, v_locale, 'order_confirmation',
          private.email_subject('order_confirmation', v_locale, v_number),
          case when private.email_enabled('order_confirmation') then 'pending' else 'skipped' end);

  -- Keep the profile in step with the latest checkout
  update public.profiles set full_name = v_name, phone = v_phone, locale = v_locale where id = v_uid;

  return jsonb_build_object('order_id', v_order_id, 'order_number', v_number, 'duplicate', false);
end $$;
revoke all on function public.place_order(jsonb, uuid) from public, anon;
grant execute on function public.place_order(jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_set_order_status — forward only:
--   preparing → shipped | cancelled
--   shipped   → delivered | cancelled
--   delivered, cancelled → final
-- Inventory policy: stock is deducted when the order is placed and restored
-- exactly once when it is cancelled (stock_restored_at guards the restore).
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_order_status(p_order_id uuid, p_new_status text, p_note text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_order   public.orders;
  v_history uuid;
begin
  if not public.is_admin() then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception using message = 'not_found'; end if;

  if not (case v_order.order_status
            when 'preparing' then p_new_status in ('shipped', 'cancelled')
            when 'shipped' then p_new_status in ('delivered', 'cancelled')
            else false end) then
    raise exception using message = 'invalid_transition', detail = v_order.order_status || '->' || coalesce(p_new_status, '');
  end if;

  update public.orders
     set order_status = p_new_status,
         payment_status = case p_new_status when 'delivered' then 'paid' when 'cancelled' then 'void' else payment_status end
   where id = v_order.id;

  if p_new_status = 'cancelled' and v_order.stock_restored_at is null then
    update public.products p
       set stock_quantity = p.stock_quantity + i.quantity
      from public.order_items i
     where i.order_id = v_order.id and i.product_id = p.id;
    update public.orders set stock_restored_at = now() where id = v_order.id;
  end if;

  insert into public.order_status_history (order_id, previous_status, new_status, changed_by, note)
  values (v_order.id, v_order.order_status, p_new_status, auth.uid(), left(coalesce(p_note, ''), 500))
  returning id into v_history;

  insert into public.email_notifications (order_id, status_history_id, customer_email, locale, notification_type, email_subject, delivery_status)
  values (v_order.id, v_history, v_order.customer_email, v_order.locale, p_new_status,
          private.email_subject(p_new_status, v_order.locale, v_order.order_number),
          case when private.email_enabled(p_new_status) then 'pending' else 'skipped' end)
  on conflict (order_id, notification_type) do nothing;

  return jsonb_build_object('order_id', v_order.id, 'order_status', p_new_status, 'history_id', v_history);
end $$;
revoke all on function public.admin_set_order_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_order_status(uuid, text, text) to authenticated;

-- Customers (admins excluded) with order stats. Spend excludes cancelled orders.
create or replace function public.admin_list_customers()
returns table (id uuid, full_name text, email text, phone text, locale text, created_at timestamptz,
               order_count bigint, total_spent numeric, last_order_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  return query
    select p.id, p.full_name, p.email, p.phone, p.locale, p.created_at,
           count(o.id),
           coalesce(sum(o.total_amount) filter (where o.order_status <> 'cancelled'), 0)::numeric,
           max(o.created_at)
      from public.profiles p
      left join public.orders o on o.customer_id = p.id
     where not exists (select 1 from public.admin_users a where a.user_id = p.id)
     group by p.id
     order by p.created_at desc;
end $$;
revoke all on function public.admin_list_customers() from public, anon;
grant execute on function public.admin_list_customers() to authenticated;
