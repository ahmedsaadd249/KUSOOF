/* ==========================================================================
   Customers service (admin) — admin_list_customers RPC (admins excluded,
   spend excludes cancelled orders) + the customer's orders (RLS: admin).
   ========================================================================== */
import { sb, run } from './api.js';
import { listOrders } from './orders.js';

const mapCustomer = (r) => ({
  id: r.id,
  name: r.full_name || r.email,
  email: r.email,
  phone: r.phone || '',
  locale: r.locale,
  createdAt: r.created_at,
  verified: true,
  orderCount: Number(r.order_count) || 0,
  totalSpent: Number(r.total_spent) || 0,
  lastOrderAt: r.last_order_at,
});

export async function listCustomers({ search } = {}) {
  const rows = await run(sb().rpc('admin_list_customers'));
  const q = String(search || '').trim().toLowerCase();
  return (rows || [])
    .map(mapCustomer)
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.phone.includes(q));
}

export async function getCustomer(id) {
  const all = await listCustomers();
  const c = all.find((x) => x.id === id);
  if (!c) return null;
  const orders = await listOrders({ customerId: id });
  return { ...c, orders };
}
