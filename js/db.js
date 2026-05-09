/* DB — delegates to the backend API (api.js).
 * The original IndexedDB implementation is kept below as DB_LOCAL
 * for offline-fallback reference but is no longer the active DB.
 */

// Active DB: backend API (defined in api.js, loaded before this file)
// eslint-disable-next-line no-undef
const DB = typeof API !== 'undefined' ? API : null;

/* ── Original IndexedDB implementation (offline reference) ── */
/* IndexedDB wrapper — all data stays locally, works offline */
const DB_NAME = 'mohasebDB';
const DB_VERSION = 1;

const STORES = {
  customers: 'customers',
  invoices:  'invoices',
  expenses:  'expenses',
  settings:  'settings'
};

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains('customers')) {
        const cs = db.createObjectStore('customers', { keyPath: 'id', autoIncrement: true });
        cs.createIndex('name', 'name');
        cs.createIndex('phone', 'phone');
      }

      if (!db.objectStoreNames.contains('invoices')) {
        const inv = db.createObjectStore('invoices', { keyPath: 'id', autoIncrement: true });
        inv.createIndex('date', 'date');
        inv.createIndex('customerId', 'customerId');
        inv.createIndex('status', 'status');
      }

      if (!db.objectStoreNames.contains('expenses')) {
        const exp = db.createObjectStore('expenses', { keyPath: 'id', autoIncrement: true });
        exp.createIndex('date', 'date');
        exp.createIndex('category', 'category');
      }

      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    req.onsuccess = e => { _db = e.target.result; res(_db); };
    req.onerror = e => rej(e.target.error);
  });
}

function tx(storeName, mode = 'readonly') {
  return openDB().then(db => db.transaction(storeName, mode).objectStore(storeName));
}

const DB = {
  async add(store, data) {
    const s = await tx(store, 'readwrite');
    return new Promise((res, rej) => {
      const r = s.add({ ...data, createdAt: Date.now() });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  },

  async put(store, data) {
    const s = await tx(store, 'readwrite');
    return new Promise((res, rej) => {
      const r = s.put({ ...data, updatedAt: Date.now() });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  },

  async get(store, id) {
    const s = await tx(store);
    return new Promise((res, rej) => {
      const r = s.get(id);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  },

  async getAll(store) {
    const s = await tx(store);
    return new Promise((res, rej) => {
      const r = s.getAll();
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  },

  async delete(store, id) {
    const s = await tx(store, 'readwrite');
    return new Promise((res, rej) => {
      const r = s.delete(id);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
  },

  async getSetting(key) {
    const s = await tx('settings');
    return new Promise((res, rej) => {
      const r = s.get(key);
      r.onsuccess = () => res(r.result ? r.result.value : null);
      r.onerror = () => rej(r.error);
    });
  },

  async setSetting(key, value) {
    const s = await tx('settings', 'readwrite');
    return new Promise((res, rej) => {
      const r = s.put({ key, value });
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
  },

  async exportAll() {
    const [customers, invoices, expenses] = await Promise.all([
      this.getAll('customers'),
      this.getAll('invoices'),
      this.getAll('expenses')
    ]);
    return { customers, invoices, expenses, exportedAt: new Date().toISOString() };
  },

  async importAll(data) {
    const stores = ['customers', 'invoices', 'expenses'];
    const db = await openDB();
    return new Promise((res, rej) => {
      const t = db.transaction(stores, 'readwrite');
      stores.forEach(name => {
        const s = t.objectStore(name);
        s.clear();
        (data[name] || []).forEach(item => s.put(item));
      });
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  }
};
