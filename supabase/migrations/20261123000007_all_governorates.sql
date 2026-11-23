-- Delivery to every Egyptian governorate. Cairo, Giza and Alexandria already exist
-- (with their areas); the other 24 are added as governorate-wide zones at 100 EGP,
-- which the admin can change in Settings › Shipping zones.
insert into public.shipping_zones (governorate, governorate_ar, area, area_ar, delivery_fee, is_active)
select g.en, g.ar, null, null, 100, true
from (values
  ('Qalyubia', 'القليوبية'),
  ('Sharqia', 'الشرقية'),
  ('Dakahlia', 'الدقهلية'),
  ('Gharbia', 'الغربية'),
  ('Monufia', 'المنوفية'),
  ('Beheira', 'البحيرة'),
  ('Kafr El Sheikh', 'كفر الشيخ'),
  ('Damietta', 'دمياط'),
  ('Port Said', 'بورسعيد'),
  ('Ismailia', 'الإسماعيلية'),
  ('Suez', 'السويس'),
  ('North Sinai', 'شمال سيناء'),
  ('South Sinai', 'جنوب سيناء'),
  ('Red Sea', 'البحر الأحمر'),
  ('Matrouh', 'مطروح'),
  ('Faiyum', 'الفيوم'),
  ('Beni Suef', 'بني سويف'),
  ('Minya', 'المنيا'),
  ('Asyut', 'أسيوط'),
  ('Sohag', 'سوهاج'),
  ('Qena', 'قنا'),
  ('Luxor', 'الأقصر'),
  ('Aswan', 'أسوان'),
  ('New Valley', 'الوادي الجديد')
) as g(en, ar)
where not exists (
  select 1 from public.shipping_zones z where z.governorate = g.en and z.area is null
);
