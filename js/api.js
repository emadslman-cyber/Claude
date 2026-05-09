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

// DB interface — same API as the IndexedDB DB object in db.js
const API = {
  async add(store, data) {
    const path = STORE_PATH[store];
    if (!path) throw new Error(`Unknown store: ${store}`);
    return apiFetch('POST', `/api/${path}`, data);
  },

  async put(store, data) {
    const path = STORE_PATH[store];
    if (!path) throw new Error(`Unknown store: ${store}`);
    return apiFetch('PUT', `/api/${path}/${data.id}`, data);
  },

  async get(store, id) {
    const path = STORE_PATH[store];
    if (!path) throw new Error(`Unknown store: ${store}`);
    return apiFetch('GET', `/api/${path}/${id}`);
  },

  async getAll(store) {
    const path = STORE_PATH[store];
    if (!path) throw new Error(`Unknown store: ${store}`);
    return apiFetch('GET', `/api/${path}`);
  },

  async delete(store, id) {
    const path = STORE_PATH[store];
    if (!path) throw new Error(`Unknown store: ${store}`);
    return apiFetch('DELETE', `/api/${path}/${id}`);
  },

  async getSetting(key) {
    const data = await apiFetch('GET', `/api/settings/${key}`);
    return data?.value ?? null;
  },

  async setSetting(key, value) {
    return apiFetch('PUT', `/api/settings/${key}`, { value: String(value) });
  },

  async exportAll() {
    const [customers, invoices, expenses] = await Promise.all([
      this.getAll('customers'),
      this.getAll('invoices'),
      this.getAll('expenses'),
    ]);
    return { customers, invoices, expenses, exportedAt: new Date().toISOString() };
  },

  async importAll(data) {
    // Bulk import: clear then re-create each record
    const stores = ['customers', 'expenses'];
    for (const store of stores) {
      const existing = await this.getAll(store);
      for (const item of existing) {
        await this.delete(store, item.id).catch(() => {});
      }
      for (const item of (data[store] || [])) {
        const { id: _id, createdAt: _c, updatedAt: _u, companyId: _co, ...rest } = item;
        await this.add(store, rest);
      }
    }
    // Invoices have nested items — handle separately
    const existingInv = await this.getAll('invoices');
    for (const inv of existingInv) {
      await this.delete('invoices', inv.id).catch(() => {});
    }
    for (const inv of (data.invoices || [])) {
      const { id: _id, createdAt: _c, updatedAt: _u, companyId: _co, ...rest } = inv;
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
