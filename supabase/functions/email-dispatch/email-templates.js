/* ==========================================================================
   Customer email templates — 5 types × 2 languages (en / ar, RTL).

   ONE source for both places that render emails:
     • the browser   — Admin › Email notifications preview
     • the server    — supabase/functions/email-dispatch (copied next to
                       it by scripts/sync-functions.mjs before deploy)
   So this module is pure: no DOM, no storage, no imports.
   The language is always the ORDER's locale (the language the customer
   shopped in).
   ========================================================================== */

/** Types the admin can preview, in lifecycle order. */
export const TEMPLATE_TYPES = ['welcome', 'order_confirmation', 'shipped', 'delivered', 'cancelled'];

const COPY = {
  en: {
    welcome: {
      subject: 'Welcome to KUSOOF',
      eyebrow: 'Welcome',
      heading: 'Welcome to KUSOOF',
      body: 'Hi {name}, your KUSOOF account is ready. There’s no password to remember: you sign in with your email and a one-time code. Explore the collection — every detail has a purpose — and pay in cash when your order arrives.',
      cta: 'Explore the collection',
      footer: 'You’re receiving this email because you created a KUSOOF account.',
      step: -1,
    },
    order_confirmation: {
      subject: 'Order Confirmed — {number}',
      eyebrow: 'Order confirmed',
      heading: 'Thank you for your order',
      body: 'Hi {name}, we’ve received your order and our team is already preparing it with care. Here are the details. You’ll pay in cash when it arrives.',
      step: 0,
    },
    preparing: {
      subject: 'Your Order Is Being Prepared!',
      eyebrow: 'Preparing',
      heading: 'Your order is being prepared',
      body: 'Hi {name}, thank you for your order. Our team is preparing your KUSOOF eyewear with care. We’ll let you know as soon as it ships.',
      step: 0,
    },
    shipped: {
      subject: 'Your Order Has Been Shipped!',
      eyebrow: 'Shipped',
      heading: 'Your order is on its way',
      body: 'Hi {name}, good news: your order has left our studio and is on its way to you. Our courier will call you before delivery.',
      step: 1,
    },
    delivered: {
      subject: 'Your Order Has Been Delivered!',
      eyebrow: 'Delivered',
      heading: 'Your order has been delivered',
      body: 'Hi {name}, your order has been delivered. We hope you love your new KUSOOF frame. Every detail has a purpose.',
      step: 2,
    },
    cancelled: {
      subject: 'Your Order Has Been Cancelled!',
      eyebrow: 'Cancelled',
      heading: 'Your order has been cancelled',
      body: 'Hi {name}, your order has been cancelled and nothing is due. If you didn’t ask for this or have a question, reply to this email and we’ll help.',
      step: -1,
    },
    steps: ['Preparing', 'Shipped', 'Delivered'],
    order: 'Order number',
    customer: 'Customer',
    subtotal: 'Subtotal',
    delivery: 'Delivery',
    total: 'Total',
    address: 'Delivery address',
    payment: 'Payment: Cash on delivery',
    cta: 'View your order',
    rateTitle: 'How was your order?',
    rateHint: 'Tap a star to rate it. It takes ten seconds and helps other customers.',
    rateStar: '{n} of 5 stars',
    footer: 'You’re receiving this email because you placed an order with KUSOOF.',
    store: 'KUSOOF · Cairo, Egypt',
  },
  ar: {
    welcome: {
      subject: 'أهلًا بك في كسوف',
      eyebrow: 'أهلًا بك',
      heading: 'أهلًا بك في كسوف',
      body: 'مرحبًا {name}، حسابك في كسوف جاهز. لا حاجة لكلمة مرور: تسجّل الدخول ببريدك الإلكتروني ورمز لمرة واحدة. تصفّح المجموعة — لكلّ تفصيلةٍ غاية — وادفع نقدًا عند استلام طلبك.',
      cta: 'تصفّح المجموعة',
      footer: 'تصلك هذه الرسالة لأنك أنشأت حسابًا لدى كسوف.',
      step: -1,
    },
    order_confirmation: {
      subject: 'تم تأكيد طلبك — {number}',
      eyebrow: 'تم تأكيد الطلب',
      heading: 'شكرًا لطلبك',
      body: 'مرحبًا {name}، استلمنا طلبك ويعمل فريقنا على تجهيزه بعناية. إليك التفاصيل، وستدفع نقدًا عند الاستلام.',
      step: 0,
    },
    preparing: {
      subject: 'طلبك قيد التجهيز!',
      eyebrow: 'قيد التجهيز',
      heading: 'طلبك قيد التجهيز',
      body: 'مرحبًا {name}، شكرًا لطلبك. يعمل فريقنا على تجهيز نظارتك من كسوف بعناية، وسنخبرك فور شحنها.',
      step: 0,
    },
    shipped: {
      subject: 'تم شحن طلبك!',
      eyebrow: 'تم الشحن',
      heading: 'طلبك في الطريق إليك',
      body: 'مرحبًا {name}، أخبار سارة: غادر طلبك الاستوديو وهو في طريقه إليك. سيتصل بك مندوب التوصيل قبل الوصول.',
      step: 1,
    },
    delivered: {
      subject: 'تم استلام طلبك!',
      eyebrow: 'تم الاستلام',
      heading: 'تم استلام طلبك',
      body: 'مرحبًا {name}، تم توصيل طلبك. نتمنى أن تنال نظارتك الجديدة من كسوف إعجابك. لكلّ تفصيلةٍ غاية.',
      step: 2,
    },
    cancelled: {
      subject: 'تم إلغاء طلبك!',
      eyebrow: 'ملغي',
      heading: 'تم إلغاء طلبك',
      body: 'مرحبًا {name}، تم إلغاء طلبك ولا يوجد أي مبلغ مستحق. إن لم تطلب ذلك أو كان لديك سؤال، ردّ على هذه الرسالة وسنساعدك.',
      step: -1,
    },
    steps: ['قيد التجهيز', 'تم الشحن', 'تم الاستلام'],
    order: 'رقم الطلب',
    customer: 'العميل',
    subtotal: 'المجموع الفرعي',
    delivery: 'التوصيل',
    total: 'الإجمالي',
    address: 'عنوان التوصيل',
    payment: 'الدفع: نقدًا عند الاستلام',
    cta: 'عرض طلبك',
    rateTitle: 'كيف كان طلبك؟',
    rateHint: 'اضغط على نجمة لتقييمه. يستغرق الأمر ثوانيَ ويساعد العملاء الآخرين.',
    rateStar: '{n} من 5 نجوم',
    footer: 'تصلك هذه الرسالة لأنك قدّمت طلبًا لدى كسوف.',
    store: 'كسوف · القاهرة، مصر',
  },
};

const CURRENCY = { EGP: { code: 'EGP', symbol: 'LE', ar: 'ج.م' } };

/** formatMoney(8900, 'en') → "EGP 8,900" · (…, 'ar') → "8,900 ج.م". Latin digits in both. */
export function formatMoney(amount, locale = 'en', { code = 'EGP', display = 'code', decimals = 0 } = {}) {
  const n = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(amount) || 0);
  const label = CURRENCY[code] || { code, symbol: code, ar: code };
  if (locale === 'ar') return `${n} ${label.ar}`;
  return `${display === 'symbol' ? label.symbol : label.code} ${n}`;
}

export function subjectFor(type, locale = 'en', orderNumber = '') {
  const c = COPY[locale] || COPY.en;
  const copy = c[type];
  return copy ? copy.subject.replace('{number}', orderNumber) : '';
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ESC[ch]);

/**
 * renderEmail({ type, locale, data, logoUrl }) → { subject, html }
 * data: { customerName, customerPhone, orderNumber, items: [{ name, qty, lineTotal }],
 *         subtotal, deliveryFee, total, address, orderUrl, rateUrl (delivered),
 *         shopUrl (welcome),
 *         currency: { code, display, decimals }, storeLine }
 */
export function renderEmail({ type, locale = 'en', data = {}, logoUrl = '' }) {
  const L = COPY[locale] ? locale : 'en';
  const c = COPY[L];
  const copy = c[type] || c.order_confirmation;
  const rtl = L === 'ar';
  const align = rtl ? 'right' : 'left';
  const opp = rtl ? 'left' : 'right';
  const serif = rtl ? "'Amiri', 'Times New Roman', serif" : "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
  const sans = rtl ? "Tahoma, 'Segoe UI', Arial, sans-serif" : "'Helvetica Neue', Helvetica, Arial, sans-serif";
  const track = rtl ? '0' : '0.22em';
  const upper = rtl ? 'none' : 'uppercase';
  const fmt = (n) => esc(formatMoney(n, L, data.currency || {}));

  const subject = copy.subject.replace('{number}', data.orderNumber || '');
  const name = esc(data.customerName || '');
  const number = esc(data.orderNumber || '');
  const body = name ? esc(copy.body).replace('{name}', name) : esc(copy.body).replace(' {name}', '');
  const welcome = type === 'welcome';
  const ctaUrl = welcome ? data.shopUrl : data.orderUrl;

  const itemRow = (n, q, total) => `
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid #EFEFED;font-family:${sans};font-size:14px;color:#0E0E0E;text-align:${align};">${n}</td>
            <td style="padding:12px 0;border-bottom:1px solid #EFEFED;font-family:${sans};font-size:13px;color:#6B6B6B;text-align:center;width:48px;">× ${q}</td>
            <td style="padding:12px 0;border-bottom:1px solid #EFEFED;font-family:${sans};font-size:14px;color:#0E0E0E;text-align:${opp};white-space:nowrap;">${total}</td>
          </tr>`;
  const rows = (data.items || []).map((it) => itemRow(esc(it.name), esc(it.qty), fmt(it.lineTotal))).join('');

  const steps =
    copy.step < 0
      ? ''
      : `<tr><td align="center" style="padding:26px 40px 8px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${c.steps
          .map((label, i) => {
            const done = i <= copy.step;
            return `<td align="center" style="padding:0 6px;font-family:${sans};font-size:11px;letter-spacing:${track};text-transform:${upper};color:${done ? '#0E0E0E' : '#A3A3A3'};">
          <div style="width:10px;height:10px;border-radius:10px;margin:0 auto 8px;background:${done ? '#0E0E0E' : '#FFFFFF'};border:1px solid ${done ? '#0E0E0E' : '#CFCFCF'};"></div>${esc(label)}</td>`;
          })
          .join('')}</tr></table></td></tr>`;

  const customer =
    type === 'order_confirmation' && (data.customerName || data.customerPhone)
      ? `<p style="margin:0 0 4px;font-family:${sans};font-size:11px;letter-spacing:${track};text-transform:${upper};color:#6B6B6B;text-align:${align};">${esc(c.customer)}</p>
        <p style="margin:0 0 16px;font-family:${sans};font-size:14px;line-height:1.6;color:#0E0E0E;text-align:${align};">${name}${data.customerPhone ? ` · <span dir="ltr">${esc(data.customerPhone)}</span>` : ''}</p>`
      : '';

  // Delivered email: 5 star links → rate.html?t=<order's rating token>&r=<n>
  const rate =
    type === 'delivered' && data.rateUrl
      ? `<tr><td align="center" style="padding:30px 40px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #EFEFED;border-radius:6px;background:#FAFAF9;">
          <tr><td align="center" style="padding:22px 18px 20px;">
            <p style="margin:0 0 4px;font-family:${serif};font-size:24px;color:#0E0E0E;">${esc(c.rateTitle)}</p>
            <p style="margin:0 0 14px;font-family:${sans};font-size:13px;line-height:1.6;color:#6B6B6B;">${esc(c.rateHint)}</p>
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>${[1, 2, 3, 4, 5]
              .map(
                (n) => `<td style="padding:0 3px;"><a href="${esc(`${data.rateUrl}${data.rateUrl.includes('?') ? '&' : '?'}r=${n}`)}" title="${esc(c.rateStar.replace('{n}', n))}" style="display:block;width:40px;height:40px;line-height:40px;font-size:30px;text-align:center;color:#E0A526;text-decoration:none;font-family:Arial,sans-serif;">&#9733;</a></td>`
              )
              .join('')}</tr></table>
          </td></tr>
        </table>
      </td></tr>`
      : '';

  const logo = esc(logoUrl);
  const html = `<!doctype html>
<html lang="${L}" dir="${rtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#F4F4F2;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F2;">
  <tr><td align="center" style="padding:32px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#FEFEFE;border-radius:6px;" dir="${rtl ? 'rtl' : 'ltr'}">
      <tr><td align="center" style="padding:36px 40px 26px;">
        ${logo ? `<img src="${logo}" width="132" alt="KUSOOF" style="display:block;width:132px;height:auto;border:0;">` : `<div style="font-family:${sans};font-size:18px;letter-spacing:0.3em;color:#0E0E0E;">KUSOOF</div>`}
      </td></tr>
      <tr><td style="padding:0 40px;"><div style="height:1px;line-height:1px;background:#E7E5E3;">&nbsp;</div></td></tr>
      <tr><td align="center" style="padding:34px 40px 10px;">
        <p style="margin:0 0 14px;font-family:${sans};font-size:11px;letter-spacing:${track};text-transform:${upper};color:#6B6B6B;">${esc(copy.eyebrow)}</p>
        <h1 style="margin:0 0 16px;font-family:${serif};font-weight:400;font-size:32px;line-height:1.15;color:#0E0E0E;">${esc(copy.heading)}</h1>
        <p style="margin:0;font-family:${sans};font-size:15px;line-height:1.7;color:#5E5E5E;">${body}</p>
      </td></tr>
      ${steps}
      ${rate}
      ${
        welcome
          ? ''
          : `<tr><td style="padding:26px 40px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #EFEFED;border-radius:6px;">
          <tr><td style="padding:18px 22px;">
            <p style="margin:0 0 4px;font-family:${sans};font-size:11px;letter-spacing:${track};text-transform:${upper};color:#6B6B6B;text-align:${align};">${esc(c.order)}</p>
            <p style="margin:0 0 14px;font-family:${sans};font-size:16px;font-weight:600;color:#0E0E0E;text-align:${align};" dir="ltr">${number}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}
              <tr><td colspan="2" style="padding:12px 0 2px;font-family:${sans};font-size:13px;color:#6B6B6B;text-align:${align};">${esc(c.subtotal)}</td><td style="padding:12px 0 2px;font-family:${sans};font-size:13px;color:#0E0E0E;text-align:${opp};">${fmt(data.subtotal)}</td></tr>
              <tr><td colspan="2" style="padding:2px 0;font-family:${sans};font-size:13px;color:#6B6B6B;text-align:${align};">${esc(c.delivery)}</td><td style="padding:2px 0;font-family:${sans};font-size:13px;color:#0E0E0E;text-align:${opp};">${fmt(data.deliveryFee)}</td></tr>
              <tr><td colspan="2" style="padding:10px 0 0;font-family:${sans};font-size:15px;font-weight:600;color:#0E0E0E;text-align:${align};">${esc(c.total)}</td><td style="padding:10px 0 0;font-family:${sans};font-size:15px;font-weight:600;color:#0E0E0E;text-align:${opp};">${fmt(data.total)}</td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:22px 40px 0;">
        ${customer}
        <p style="margin:0 0 4px;font-family:${sans};font-size:11px;letter-spacing:${track};text-transform:${upper};color:#6B6B6B;text-align:${align};">${esc(c.address)}</p>
        <p style="margin:0;font-family:${sans};font-size:14px;line-height:1.6;color:#0E0E0E;text-align:${align};">${esc(data.address || '')}</p>
        <p style="margin:10px 0 0;font-family:${sans};font-size:13px;color:#6B6B6B;text-align:${align};">${esc(c.payment)}</p>
      </td></tr>`
      }
      ${
        ctaUrl
          ? `<tr><td align="center" style="padding:30px 40px 36px;">
        <a href="${esc(ctaUrl)}" style="display:inline-block;padding:14px 30px;border-radius:999px;background:#0E0E0E;color:#FEFEFE;font-family:${sans};font-size:12px;letter-spacing:${track};text-transform:${upper};text-decoration:none;">${esc(copy.cta || c.cta)}</a>
      </td></tr>`
          : '<tr><td style="padding:16px 40px 0;"></td></tr>'
      }
      <tr><td style="padding:0 40px;"><div style="height:1px;line-height:1px;background:#E7E5E3;">&nbsp;</div></td></tr>
      <tr><td align="center" style="padding:22px 40px 30px;">
        <p style="margin:0 0 6px;font-family:${sans};font-size:12px;line-height:1.6;color:#8A8A8A;">${esc(copy.footer || c.footer)}</p>
        <p style="margin:0;font-family:${sans};font-size:12px;color:#8A8A8A;">${esc(data.storeLine || c.store)}</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  return { subject, html };
}
