-- ===========================================================================
-- KUSOOF — initial data: the two existing products (no others), their photos
-- (served from the site's products/ folder), delivery zones for Cairo, Giza
-- and Alexandria, and the store settings row. Everything is editable in the
-- admin afterwards.
-- ===========================================================================

insert into public.store_settings (id, store_name, store_address) values (1, 'KUSOOF', 'Cairo, Egypt') on conflict (id) do nothing;

insert into public.products (slug, name, name_ar, category, short_description, short_description_ar, description, description_ar, content, price, stock_quantity, is_available, sort_order)
values ($q$sunglasses$q$, $q$Classic Black Sunglasses$q$, $q$نظارة شمسية سوداء كلاسيكية$q$, 'sunglasses', $q$Gloss-black acetate with deep tinted lenses and silver rivet details. A quiet, confident shape for bright days.$q$, $q$أسيتات أسود لامع مع عدسات داكنة وتفاصيل مسامير فضية. تصميم هادئ وواثق للأيام المشمسة.$q$, $q$The Classic Black Sunglasses take our signature frame into the sun. A deep gloss-black acetate front is paired with dark tinted lenses for a calm, shaded view.

Silver-tone rivets at each corner and precisely fitted steel hinges keep the design minimal and balanced, ready to be worn every day.$q$, $q$تأخذ النظارة الشمسية السوداء الكلاسيكية إطارنا المميز إلى الشمس. واجهة من الأسيتات الأسود اللامع مع عدسات داكنة تمنحك رؤية هادئة ومظللة.

مسامير فضية عند كل زاوية ومفصلات فولاذية مركّبة بدقة تحافظ على تصميم بسيط ومتوازن، جاهز للارتداء كل يوم.$q$, $q${"index":"01","specs":[{"label":{"en":"Frame","ar":"الإطار"},"value":{"en":"Gloss black acetate","ar":"أسيتات أسود لامع"}},{"label":{"en":"Lenses","ar":"العدسات"},"value":{"en":"Dark tinted","ar":"داكنة"}},{"label":{"en":"Hinges","ar":"المفصلات"},"value":{"en":"Silver-tone steel","ar":"فولاذ فضي اللون"}},{"label":{"en":"Accents","ar":"اللمسات"},"value":{"en":"Silver rivets","ar":"مسامير فضية"}}],"details":{"en":["Signature KUSOOF frame shape","Dark tinted lenses","Silver-tone steel hinges","Polished gloss-black finish"],"ar":["شكل إطار كسوف المميز","عدسات داكنة","مفصلات فولاذية فضية اللون","لمسة نهائية سوداء لامعة"]}}$q$::jsonb, 8900, 14, true, 1)
on conflict (slug) do nothing;
insert into public.product_images (product_id, static_path, mobile_path, width, height, label_en, label_ar, alt_en, alt_ar, sort_order)
select id, $q$products/black-wayfarer-sun.png$q$, $q$products/mobile/black-wayfarer-sun-960.webp$q$, 1672, 941, $q$Studio view$q$, $q$صورة الاستوديو$q$, $q$Classic Black Sunglasses: gloss-black frame with dark tinted lenses and silver rivet details, three-quarter studio view.$q$, $q$نظارة شمسية سوداء كلاسيكية: إطار أسود لامع مع عدسات داكنة وتفاصيل مسامير فضية، بزاوية ثلاثة أرباع.$q$, 0 from public.products where slug = $q$sunglasses$q$
  and not exists (select 1 from public.product_images pi join public.products pp on pp.id = pi.product_id where pp.slug = $q$sunglasses$q$ and pi.static_path = $q$products/black-wayfarer-sun.png$q$);
insert into public.product_images (product_id, static_path, mobile_path, width, height, label_en, label_ar, alt_en, alt_ar, sort_order)
select id, $q$products/details/sun-lens.webp$q$, null, 640, 480, $q$Lens detail$q$, $q$تفاصيل العدسة$q$, $q$Close-up of the dark tinted lens and glossy acetate rim.$q$, $q$لقطة مقرّبة للعدسة الداكنة وحافة الأسيتات اللامعة.$q$, 1 from public.products where slug = $q$sunglasses$q$
  and not exists (select 1 from public.product_images pi join public.products pp on pp.id = pi.product_id where pp.slug = $q$sunglasses$q$ and pi.static_path = $q$products/details/sun-lens.webp$q$);
insert into public.product_images (product_id, static_path, mobile_path, width, height, label_en, label_ar, alt_en, alt_ar, sort_order)
select id, $q$products/details/sun-hinge.webp$q$, null, 640, 480, $q$Hinge detail$q$, $q$تفاصيل المفصلة$q$, $q$Close-up of the silver rivet and the joint between the front and the temple arm.$q$, $q$لقطة مقرّبة للمسمار الفضي وموضع اتصال الواجهة بالذراع.$q$, 2 from public.products where slug = $q$sunglasses$q$
  and not exists (select 1 from public.product_images pi join public.products pp on pp.id = pi.product_id where pp.slug = $q$sunglasses$q$ and pi.static_path = $q$products/details/sun-hinge.webp$q$);
insert into public.products (slug, name, name_ar, category, short_description, short_description_ar, description, description_ar, content, price, stock_quantity, is_available, sort_order)
values ($q$optical$q$, $q$Classic Black Optical Glasses$q$, $q$نظارة طبية سوداء كلاسيكية$q$, 'eyeglasses', $q$Our signature gloss-black frame with crystal-clear prescription lenses and silver-steel hinges. Made for every day.$q$, $q$إطارنا المميز بالأسود اللامع مع عدسات طبية صافية كالكريستال ومفصلات فولاذية فضية. صُنعت لكل يوم.$q$, $q$The Classic Black Optical Glasses are the frame behind every KUSOOF detail: a sculpted gloss-black acetate front, crystal-clear prescription lenses and silver-steel hinges that lock each temple arm precisely into place.

Light on the face and balanced behind the ear, it is designed to be worn from morning to night, and kept for years.$q$, $q$النظارة الطبية السوداء الكلاسيكية هي الإطار وراء كل تفصيلة في كسوف: واجهة منحوتة من الأسيتات الأسود اللامع، وعدسات طبية صافية كالكريستال، ومفصلات فولاذية فضية تثبّت كل ذراع في مكانه بدقة.

خفيفة على الوجه ومتوازنة خلف الأذن، صُمّمت لتُرتدى من الصباح حتى المساء، وتبقى معك لسنوات.$q$, $q${"index":"02","specs":[{"label":{"en":"Frame","ar":"الإطار"},"value":{"en":"Gloss black acetate","ar":"أسيتات أسود لامع"}},{"label":{"en":"Lenses","ar":"العدسات"},"value":{"en":"Clear prescription lenses","ar":"عدسات طبية صافية"}},{"label":{"en":"Hinges","ar":"المفصلات"},"value":{"en":"Silver-tone steel","ar":"فولاذ فضي اللون"}},{"label":{"en":"Accents","ar":"اللمسات"},"value":{"en":"Silver rivets","ar":"مسامير فضية"}}],"details":{"en":["Signature KUSOOF frame shape","Clear prescription lenses","Silver-tone steel hinges","Polished gloss-black finish"],"ar":["شكل إطار كسوف المميز","عدسات طبية صافية","مفصلات فولاذية فضية اللون","لمسة نهائية سوداء لامعة"]}}$q$::jsonb, 7900, 4, true, 2)
on conflict (slug) do nothing;
insert into public.product_images (product_id, static_path, mobile_path, width, height, label_en, label_ar, alt_en, alt_ar, sort_order)
select id, $q$products/black-wayfarer-optical.png$q$, $q$products/mobile/black-wayfarer-optical-960.webp$q$, 1672, 941, $q$Assembled$q$, $q$مجمّعة$q$, $q$Classic Black Optical Glasses: gloss-black frame with clear lenses and silver rivet details, three-quarter studio view.$q$, $q$نظارة طبية سوداء كلاسيكية: إطار أسود لامع مع عدسات صافية وتفاصيل مسامير فضية، بزاوية ثلاثة أرباع.$q$, 0 from public.products where slug = $q$optical$q$
  and not exists (select 1 from public.product_images pi join public.products pp on pp.id = pi.product_id where pp.slug = $q$optical$q$ and pi.static_path = $q$products/black-wayfarer-optical.png$q$);
insert into public.product_images (product_id, static_path, mobile_path, width, height, label_en, label_ar, alt_en, alt_ar, sort_order)
select id, $q$products/black-wayfarer-exploded.png$q$, $q$products/mobile/black-wayfarer-exploded-960.webp$q$, 1672, 941, $q$Every component$q$, $q$كل المكوّنات$q$, $q$Exploded view showing the clear lenses, acetate front, steel hinges and temple arms.$q$, $q$عرض مفكك يُظهر العدسات الصافية وواجهة الأسيتات والمفصلات الفولاذية والأذرع.$q$, 1 from public.products where slug = $q$optical$q$
  and not exists (select 1 from public.product_images pi join public.products pp on pp.id = pi.product_id where pp.slug = $q$optical$q$ and pi.static_path = $q$products/black-wayfarer-exploded.png$q$);
insert into public.product_images (product_id, static_path, mobile_path, width, height, label_en, label_ar, alt_en, alt_ar, sort_order)
select id, $q$products/details/optical-hinge.webp$q$, null, 640, 480, $q$Hinge detail$q$, $q$تفاصيل المفصلة$q$, $q$Close-up of the silver rivet and the joint between the front and the temple arm.$q$, $q$لقطة مقرّبة للمسمار الفضي وموضع اتصال الواجهة بالذراع.$q$, 2 from public.products where slug = $q$optical$q$
  and not exists (select 1 from public.product_images pi join public.products pp on pp.id = pi.product_id where pp.slug = $q$optical$q$ and pi.static_path = $q$products/details/optical-hinge.webp$q$);

insert into public.shipping_zones (governorate, governorate_ar, area, area_ar, delivery_fee) values
  ($q$Cairo$q$, $q$القاهرة$q$, null, null, 75),
  ($q$Cairo$q$, $q$القاهرة$q$, $q$Downtown Cairo$q$, $q$وسط البلد$q$, 75),
  ($q$Cairo$q$, $q$القاهرة$q$, $q$Zamalek$q$, $q$الزمالك$q$, 75),
  ($q$Cairo$q$, $q$القاهرة$q$, $q$Garden City$q$, $q$جاردن سيتي$q$, 75),
  ($q$Cairo$q$, $q$القاهرة$q$, $q$Manial$q$, $q$المنيل$q$, 75),
  ($q$Cairo$q$, $q$القاهرة$q$, $q$Maadi$q$, $q$المعادي$q$, 75),
  ($q$Cairo$q$, $q$القاهرة$q$, $q$Heliopolis$q$, $q$مصر الجديدة$q$, 75),
  ($q$Cairo$q$, $q$القاهرة$q$, $q$Nasr City$q$, $q$مدينة نصر$q$, 75),
  ($q$Cairo$q$, $q$القاهرة$q$, $q$New Cairo$q$, $q$القاهرة الجديدة$q$, 75),
  ($q$Cairo$q$, $q$القاهرة$q$, $q$Al Rehab City$q$, $q$مدينة الرحاب$q$, 75),
  ($q$Cairo$q$, $q$القاهرة$q$, $q$Mokattam$q$, $q$المقطم$q$, 75),
  ($q$Cairo$q$, $q$القاهرة$q$, $q$Shubra$q$, $q$شبرا$q$, 75),
  ($q$Giza$q$, $q$الجيزة$q$, null, null, 75),
  ($q$Giza$q$, $q$الجيزة$q$, $q$Dokki$q$, $q$الدقي$q$, 75),
  ($q$Giza$q$, $q$الجيزة$q$, $q$Mohandessin$q$, $q$المهندسين$q$, 75),
  ($q$Giza$q$, $q$الجيزة$q$, $q$Agouza$q$, $q$العجوزة$q$, 75),
  ($q$Giza$q$, $q$الجيزة$q$, $q$Giza$q$, $q$الجيزة$q$, 75),
  ($q$Giza$q$, $q$الجيزة$q$, $q$Al Haram$q$, $q$الهرم$q$, 75),
  ($q$Giza$q$, $q$الجيزة$q$, $q$Sheikh Zayed City$q$, $q$الشيخ زايد$q$, 75),
  ($q$Giza$q$, $q$الجيزة$q$, $q$6th of October City$q$, $q$السادس من أكتوبر$q$, 75),
  ($q$Alexandria$q$, $q$الإسكندرية$q$, null, null, 100),
  ($q$Alexandria$q$, $q$الإسكندرية$q$, $q$El Mansheya$q$, $q$المنشية$q$, 100),
  ($q$Alexandria$q$, $q$الإسكندرية$q$, $q$Raml Station$q$, $q$محطة الرمل$q$, 100),
  ($q$Alexandria$q$, $q$الإسكندرية$q$, $q$Moharam Bek$q$, $q$محرم بك$q$, 100),
  ($q$Alexandria$q$, $q$الإسكندرية$q$, $q$Smouha$q$, $q$سموحة$q$, 100),
  ($q$Alexandria$q$, $q$الإسكندرية$q$, $q$Sporting$q$, $q$سبورتنج$q$, 100),
  ($q$Alexandria$q$, $q$الإسكندرية$q$, $q$Sidi Gaber$q$, $q$سيدي جابر$q$, 100),
  ($q$Alexandria$q$, $q$الإسكندرية$q$, $q$Stanley$q$, $q$ستانلي$q$, 100),
  ($q$Alexandria$q$, $q$الإسكندرية$q$, $q$Gleem$q$, $q$جليم$q$, 100),
  ($q$Alexandria$q$, $q$الإسكندرية$q$, $q$San Stefano$q$, $q$سان ستيفانو$q$, 100),
  ($q$Alexandria$q$, $q$الإسكندرية$q$, $q$Miami$q$, $q$ميامي$q$, 100),
  ($q$Alexandria$q$, $q$الإسكندرية$q$, $q$Montaza$q$, $q$المنتزه$q$, 100)
on conflict do nothing;
