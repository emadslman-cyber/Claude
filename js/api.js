/* API client — replaces IndexedDB with backend REST calls.
 * Exposes the same DB interface so existing modules work unchanged.
 */

const API_BASE = 'http://localhost:3001';

// Map store names to API paths
const STORE_PATH = {
  customers: 'customers',
  invoices:  'invoices',
  expenses:  'expenses',
};

function getHeaders() {
  const token = localStorage.getItem('mohaseb_token');
  const companyId = localStorage.getItem('mohaseb_company_id');
  const headers = { 'Content-Type': 'application/json' };
  if (token)     headers['Authorization'] = `Bearer ${token}`;
  if (companyId) headers['X-Company-Id']  = companyId;
  return headers;
}

async function apiFetch(method, path, body) {
  const opts = { method, headers: getHeaders() };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, opts);

  if (res.status === 401) {
    // Token expired — force re-login
    localStorage.removeItem('mohaseb_token');
    localStorage.removeItem('mohaseb_company_id');
    window.location.reload();
    return null;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'خطأ في الخادم' }));
    throw new Error(err.error || 'خطأ في الخادم');
  }

  return res.json();
}

// ── Data normalisation: frontend ↔ backend ────────────────────────────────

/** Customer: {name,phone,email,address,taxRegNumber,notes} → backend {taxId,...} */
function customerOut(c) {
  return { name: c.name, phone: c.phone||'', email: c.email||'',
           address: c.address||'', taxId: c.taxRegNumber||'', notes: c.notes||'' };
}
/** Customer: backend → frontend */
function customerIn(c) {
  return { id: c.id, name: c.name, phone: c.phone||'', email: c.email||'',
           address: c.address||'', taxRegNumber: c.taxId||'', governate: '',
           notes: c.notes||'', createdAt: c.createdAt };
}

/** Expense: {date,category,description,amount,notes} → backend {vendor,...} */
function expenseOut(e) {
  return { date: e.date, category: e.category,
           description: e.description||'', amount: Number(e.amount), vendor: e.notes||'' };
}
/** Expense: backend → frontend */
function expenseIn(e) {
  const d = typeof e.date === 'string' ? e.date.slice(0,10) : new Date(e.date).toISOString().slice(0,10);
  return { id: e.id, date: d, category: e.category,
           description: e.description||'', amount: parseFloat(e.amount),
           notes: e.vendor||'', createdAt: e.createdAt };
}

/** Invoice: frontend → backend (includes items array normalisation) */
function invoiceOut(inv) {
  const taxPct = Number(inv.taxPct) || 0;
  return {
    number:     String(inv.number),
    date:       inv.date,
    customerId: inv.customerId || undefined,
    status:     (inv.status||'pending').toUpperCase(),
    subtotal:   Number(inv.subtotal)||0,
    taxAmount:  Number(inv.taxAmt)||0,
    discount:   Number(inv.discount)||0,
    total:      Number(inv.total)||0,
    notes:      inv.notes||'',
    items: (inv.items||[]).map(item => ({
      description: item.name,
      quantity:    Number(item.qty)||1,
      unitPrice:   Number(item.price)||0,
      taxRate:     taxPct,
      total:       (Number(item.qty)||1) * (Number(item.price)||0),
    })),
  };
}

/** Invoice: backend → frontend */
function invoiceIn(inv) {
  const items  = (inv.items||[]).map(i => ({
    name: i.description, qty: parseFloat(i.quantity),
    price: parseFloat(i.unitPrice), unitType: 'EA',
  }));
  const taxPct = inv.items?.[0]?.taxRate != null ? parseFloat(inv.items[0].taxRate) : 0;
  const d      = typeof inv.date === 'string' ? inv.date.slice(0,10)
               : new Date(inv.date).toISOString().slice(0,10);
  return {
    id:            inv.id,
    number:        parseInt(inv.number, 10) || inv.number,
    customerId:    inv.customerId  || null,
    customerName:  inv.customer?.name  || 'عميل غير محدد',
    customerPhone: inv.customer?.phone || '',
    date:          d,
    status:        (inv.status||'PENDING').toLowerCase(),
    items, taxPct,
    subtotal:      parseFloat(inv.subtotal  ||0),
    discount:      parseFloat(inv.discount  ||0),
    taxAmt:        parseFloat(inv.taxAmount ||0),
    total:         parseFloat(inv.total     ||0),
    notes:         inv.notes||'',
    etaUUID:       inv.etaUuid   || null,
    etaStatus:     inv.etaStatus || null,
    createdAt:     inv.createdAt,
  };
}

function toBackend(store, data) {
  if (store === 'customers') return customerOut(data);
  if (store === 'invoices')  return invoiceOut(data);
  if (store === 'expenses')  return expenseOut(data);
  return data;
}

function fromBackend(store, data) {
  if (!data) return data;
  if (store === 'customers') return customerIn(data);
  if (store === 'invoices')  return invoiceIn(data);
  if (store === 'expenses')  return expenseIn(data);
  return data;
}

// DB interface — same API as the IndexedDB DB object in db.js
const API = {
  async add(store, data) {
    const path = STORE_PATH[store];
    if (!path) throw new Error(`Unknown store: ${store}`);
    const result = await apiFetch('POST', `/api/${path}`, toBackend(store, data));
    return result?.id ?? result;
  },

  async put(store, data) {
    const path = STORE_PATH[store];
    if (!path) throw new Error(`Unknown store: ${store}`);
    const { id, ...rest } = data;
    await apiFetch('PUT', `/api/${path}/${id}`, toBackend(store, rest));
    return id;
  },

  async get(store, id) {
    const path = STORE_PATH[store];
    if (!path) throw new Error(`Unknown store: ${store}`);
    return fromBackend(store, await apiFetch('GET', `/api/${path}/${id}`));
  },

  async getAll(store) {
    const path = STORE_PATH[store];
    if (!path) throw new Error(`Unknown store: ${store}`);
    const result = await apiFetch('GET', `/api/${path}`);
    return Array.isArray(result) ? result.map(r => fromBackend(store, r)) : [];
  },

  async delete(store, id) {
    const path = STORE_PATH[store];
    if (!path) throw new Error(`Unknown store: ${store}`);
    await apiFetch('DELETE', `/api/${path}/${id}`);
  },

  async getSetting(key) {
    try {
      const data = await apiFetch('GET', `/api/settings/${encodeURIComponent(key)}`);
      return data?.value ?? null;
    } catch { return null; }
  },

  async setSetting(key, value) {
    return apiFetch('PUT', `/api/settings/${encodeURIComponent(key)}`, { value: value == null ? '' : String(value) });
  },

  /** Dedicated ETA status patch (avoids re-sending full invoice) */
  async updateEtaStatus(invoiceId, etaUuid, etaStatus) {
    return apiFetch('PATCH', `/api/invoices/${invoiceId}/eta`, { etaUuid, etaStatus });
  },

  async exportAll() {
    const [customers, invoices, expenses] = await Promise.all([
      this.getAll('customers'), this.getAll('invoices'), this.getAll('expenses'),
    ]);
    return { customers, invoices, expenses, exportedAt: new Date().toISOString() };
  },

  async importAll(data) {
    for (const store of ['customers', 'expenses']) {
      const existing = await this.getAll(store);
      for (const item of existing) await this.delete(store, item.id).catch(() => {});
      for (const item of (data[store]||[])) {
        const { id: _, createdAt: __, ...rest } = item;
        await this.add(store, rest);
      }
    }
    const existingInv = await this.getAll('invoices');
    for (const inv of existingInv) await this.delete('invoices', inv.id).catch(() => {});
    for (const inv of (data.invoices||[])) {
      const { id: _, createdAt: __, ...rest } = inv;
      await this.add('invoices', rest);
    }
  },
};

// Auth helpers used by other modules
const Auth = {
  isLoggedIn() {
    return !!(localStorage.getItem('mohaseb_token') && localStorage.getItem('mohaseb_company_id'));
  },

  async login(email, password) {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'بيانات الدخول غير صحيحة');
    }
    const data = await res.json();
    localStorage.setItem('mohaseb_token', data.accessToken);
    localStorage.setItem('mohaseb_refresh_token', data.refreshToken || '');
    return data;
  },

  async fetchProfile() {
    return apiFetch('GET', '/api/auth/me');
  },

  selectCompany(companyId) {
    localStorage.setItem('mohaseb_company_id', companyId);
  },

  logout() {
    localStorage.removeItem('mohaseb_token');
    localStorage.removeItem('mohaseb_refresh_token');
    localStorage.removeItem('mohaseb_company_id');
    window.location.reload();
  },
};
