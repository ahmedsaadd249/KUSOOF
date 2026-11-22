-- ===========================================================================
-- KUSOOF — realtime change feeds (RLS still applies to every subscriber):
-- products (storefront stock/price updates), orders + email_notifications
-- (admin live refresh), shipping_zones (checkout fees).
-- ===========================================================================
alter publication supabase_realtime add table public.products, public.orders, public.email_notifications, public.shipping_zones;
