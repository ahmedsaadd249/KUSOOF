-- Order ratings: the "Delivered" email carries 5 star links to rate.html.
-- Each order has a private, unguessable rating_token (only in that email),
-- so a customer can rate without signing in. One rating per order (it can
-- be changed later). Ratings are shown to the admin and, unless the admin
-- hides one, as reviews on the products in that order.

alter table public.orders add column rating_token uuid not null default gen_random_uuid();
create unique index orders_rating_token_key on public.orders (rating_token);

create table public.order_ratings (
  order_id     uuid primary key references public.orders (id) on delete cascade,
  rating       smallint not null check (rating between 1 and 5),
  comment      text not null default '' check (char_length(comment) <= 1000),
  locale       text not null default 'en' check (locale in ('en', 'ar')),
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger order_ratings_updated_at before update on public.order_ratings
  for each row execute function private.set_updated_at();
create index order_ratings_published_idx on public.order_ratings (is_published, created_at desc);

alter table public.order_ratings enable row level security;
-- Admins read and moderate (hide / show); everything else goes through the functions below.
create policy order_ratings_admin_select on public.order_ratings for select to authenticated using ((select public.is_admin()));
create policy order_ratings_admin_update on public.order_ratings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke insert, delete on public.order_ratings from anon, authenticated;
revoke update on public.order_ratings from anon;

-- "Ahmed Algaly" → "Ahmed A." (all a product page ever shows of a customer)
create or replace function private.display_name(p_name text)
returns text language sql immutable set search_path = '' as $$
  select case
    when coalesce(btrim(p_name), '') = '' then ''
    when position(' ' in btrim(p_name)) = 0 then btrim(p_name)
    else split_part(btrim(p_name), ' ', 1) || ' ' || left(split_part(btrim(p_name), ' ', array_length(regexp_split_to_array(btrim(p_name), '\s+'), 1)), 1) || '.'
  end;
$$;

-- What the rating page shows for a token (never the address, phone or email)
create or replace function public.get_rating_context(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_order public.orders%rowtype;
  v_rating public.order_ratings%rowtype;
begin
  select * into v_order from public.orders where rating_token = p_token;
  if not found then
    return null;
  end if;
  select * into v_rating from public.order_ratings where order_id = v_order.id;
  return jsonb_build_object(
    'order_number', v_order.order_number,
    'first_name', split_part(btrim(v_order.customer_name), ' ', 1),
    'status', v_order.order_status,
    'can_rate', v_order.order_status = 'delivered',
    'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i.product_name, 'name_ar', i.product_name_ar, 'image', i.product_image, 'qty', i.quantity) order by i.product_name), '[]'::jsonb)
                from public.order_items i where i.order_id = v_order.id),
    'rating', case when v_rating.order_id is null then null else v_rating.rating end,
    'comment', case when v_rating.order_id is null then null else v_rating.comment end
  );
end $$;

-- Save (or change) the rating for a delivered order
create or replace function public.submit_order_rating(p_token uuid, p_rating integer, p_comment text default '', p_locale text default 'en')
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where rating_token = p_token;
  if not found then
    raise exception using message = 'not_found', errcode = 'P0002';
  end if;
  if v_order.order_status <> 'delivered' then
    raise exception using message = 'not_delivered', errcode = 'P0001';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception using message = 'invalid_rating', errcode = '22023';
  end if;
  insert into public.order_ratings (order_id, rating, comment, locale)
  values (v_order.id, p_rating, left(btrim(coalesce(p_comment, '')), 1000), case when p_locale = 'ar' then 'ar' else 'en' end)
  on conflict (order_id) do update
    set rating = excluded.rating, comment = excluded.comment, locale = excluded.locale;
  return jsonb_build_object('ok', true, 'order_number', v_order.order_number);
end $$;

-- Public reviews of one product: the published ratings of delivered orders that contain it
create or replace function public.product_reviews(p_product_id uuid, p_limit integer default 20)
returns jsonb language sql stable security definer set search_path = '' as $$
  with r as (
    select distinct on (o.id) r.rating, r.comment, r.locale, r.created_at, private.display_name(o.customer_name) as name
      from public.order_ratings r
      join public.orders o on o.id = r.order_id
      join public.order_items i on i.order_id = o.id
     where i.product_id = p_product_id and r.is_published and o.order_status = 'delivered'
     order by o.id
  )
  select jsonb_build_object(
    'count', (select count(*) from r),
    'average', (select round(avg(rating)::numeric, 1) from r),
    'reviews', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select rating, comment, locale, created_at, name from r order by created_at desc
        limit greatest(1, least(coalesce(p_limit, 20), 50))) x)
  );
$$;

revoke all on function public.get_rating_context(uuid) from public;
revoke all on function public.submit_order_rating(uuid, integer, text, text) from public;
revoke all on function public.product_reviews(uuid, integer) from public;
grant execute on function public.get_rating_context(uuid) to anon, authenticated;
grant execute on function public.submit_order_rating(uuid, integer, text, text) to anon, authenticated;
grant execute on function public.product_reviews(uuid, integer) to anon, authenticated;
