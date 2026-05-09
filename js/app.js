/* ===== MAIN APPLICATION ===== */

// ---- Utility helpers ----
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtMoney(n) {
  if (n == null) return '0 ج.م';
  return Number(n).toLocaleString('ar-EG', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' ج.م';
}

function formatDate(s) {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function toast(msg, type = '') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ---- Modal ----
const Modal = {
  open(id) {
    document.getElementById(id)?.classList.add('open');
    document.body.style.overflow = 'hidden';
  },
  close(id) {
    document.getElementById(id)?.classList.remove('open');
    document.body.style.overflow = '';
  }
};

// Close modal on overlay click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
    document.body.style.overflow = '';
  }
});

// ---- Navigation ----
function navigate(section) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const sec = document.getElementById(`sec-${section}`);
  if (sec) sec.classList.add('active');

  const nav = document.querySelector(`[data-nav="${section}"]`);
  if (nav) nav.classList.add('active');

  const titles = {
    dashboard: 'لوحة التحكم',
    invoices:  'الفواتير',
    customers: 'العملاء',
    expenses:  'المصروفات',
    reports:   'التقارير',
    tax:       'حاسبة الضريبة',
    eta:       '🏛️ هيئة الضرائب المصرية (ETA)',
    backup:    'النسخ الاحتياطي',
    settings:  'الإعدادات'
  };
  setText('topbar-title', titles[section] || section);

  // Close sidebar on mobile
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('open');
  }

  if (section === 'reports')   Reports.render(document.querySelector('.tab-btn.active')?.dataset.period || 'monthly');
  if (section === 'dashboard') Dashboard.refresh();
  if (section === 'backup')    Backup.loadBackupDate();
  if (section === 'settings')  loadSettings();
  if (section === 'eta')       { ETA.loadConfigUI(); renderEtaSubmitted(); }
}

// ---- Dashboard ----
const Dashboard = {
  async refresh() {
    const invoices = Invoices.getAll();
    const expenses = Expenses.getAll();
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    const monthInv = invoices.filter(i => {
      const d = new Date(i.date);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });

    const monthExp = expenses.filter(e => {
      const d = new Date(e.date);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });

    const monthSales = monthInv.filter(i => i.status !== 'cancelled').reduce((s, i) => s + i.total, 0);
    const monthExpTotal = monthExp.reduce((s, e) => s + e.amount, 0);
    const monthProfit = monthSales - monthExpTotal;
    const pendingCount = invoices.filter(i => i.status === 'pending').length;
    const pendingAmt = invoices.filter(i => i.status === 'pending').reduce((s, i) => s + i.total, 0);

    setText('dash-sales', fmtMoney(monthSales));
    setText('dash-expenses', fmtMoney(monthExpTotal));
    setText('dash-profit', fmtMoney(monthProfit));
    setText('dash-pending', pendingCount + ' فاتورة');
    setText('dash-pending-amt', fmtMoney(pendingAmt));

    const profitEl = document.getElementById('dash-profit');
    if (profitEl) profitEl.style.color = monthProfit >= 0 ? 'var(--success)' : 'var(--danger)';

    // Recent invoices
    const recentInv = [...invoices].slice(0, 5);
    const recentList = document.getElementById('dash-recent-invoices');
    if (recentList) {
      recentList.innerHTML = recentInv.length
        ? recentInv.map(i => `
          <li class="recent-item">
            <div>
              <div class="name">${esc(i.customerName || 'عميل غير محدد')}</div>
              <div class="meta">#${i.number} · ${formatDate(i.date)}</div>
            </div>
            <div class="amount">${fmtMoney(i.total)}</div>
          </li>`).join('')
        : '<li style="text-align:center;padding:20px;color:var(--gray-500)">لا فواتير بعد</li>';
    }

    // Recent expenses
    const recentExp = [...expenses].slice(0, 5);
    const expList = document.getElementById('dash-recent-expenses');
    if (expList) {
      expList.innerHTML = recentExp.length
        ? recentExp.map(e => `
          <li class="recent-item">
            <div>
              <div class="name">${esc(e.description)}</div>
              <div class="meta">${esc(e.category)} · ${formatDate(e.date)}</div>
            </div>
            <div class="amount expense">${fmtMoney(e.amount)}</div>
          </li>`).join('')
        : '<li style="text-align:center;padding:20px;color:var(--gray-500)">لا مصروفات بعد</li>';
    }
  }
};

// ---- Tax Calculator ----
function calcTax() {
  const amount = parseFloat(document.getElementById('tax-amount').value) || 0;
  const pct = parseFloat(document.getElementById('tax-pct').value) || 14;
  const taxAmt = amount * (pct / 100);
  const total = amount + taxAmt;
  setText('tax-result-base', fmtMoney(amount));
  setText('tax-result-pct', pct + '%');
  setText('tax-result-tax', fmtMoney(taxAmt));
  setText('tax-result-total', fmtMoney(total));
}

// ---- Settings ----
window._settings = {};

async function loadSettings() {
  const keys = ['bizName','bizPhone','bizAddress','bizTaxId','defaultTax','currency'];
  await Promise.all(keys.map(async k => {
    const v = await DB.getSetting(k);
    if (v !== null) {
      window._settings[k] = v;
      const el = document.getElementById(`set-${k}`);
      if (el) el.value = v;
    }
  }));
}

async function saveSettings() {
  const fields = ['bizName','bizPhone','bizAddress','bizTaxId','defaultTax'];
  await Promise.all(fields.map(k => {
    const el = document.getElementById(`set-${k}`);
    if (el) {
      window._settings[k] = el.value;
      return DB.setSetting(k, el.value);
    }
  }));
  toast('تم حفظ الإعدادات ✓', 'success');
  updateBizDisplay();
}

function updateBizDisplay() {
  const name = window._settings.bizName;
  if (name) {
    document.querySelector('.sidebar-logo h1').textContent = name;
  }
}

// ---- ETA submitted invoices table ----
function renderEtaSubmitted() {
  const tbody = document.getElementById('eta-submitted-tbody');
  if (!tbody) return;
  const submitted = Invoices.getAll().filter(i => i.etaUUID);
  if (submitted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--gray-500);padding:20px">لا توجد فواتير مرسلة بعد</td></tr>`;
    return;
  }
  const statusMap = {
    Valid:    ['badge-green', '✅ مقبولة'],
    Invalid:  ['badge-red',   '❌ مرفوضة'],
    Cancelled:['badge-red',   '🚫 ملغية'],
    Submitted:['badge-blue',  '⏳ معلقة']
  };
  tbody.innerHTML = submitted.map(inv => {
    const [cls, label] = statusMap[inv.etaStatus] || ['badge-blue', inv.etaStatus || 'مرسلة'];
    const short = inv.etaUUID ? inv.etaUUID.substring(0, 16) + '…' : '—';
    return `<tr>
      <td><strong>#${inv.number}</strong></td>
      <td><span title="${inv.etaUUID}" style="font-size:.8rem;font-family:monospace">${short}</span></td>
      <td>${inv.etaSubmittedAt ? formatDate(inv.etaSubmittedAt.slice(0,10)) : '—'}</td>
      <td><span class="badge ${cls}">${label}</span></td>
    </tr>`;
  }).join('');
}

// ---- Init ----
async function init() {
  // Load settings first
  await loadSettings();
  updateBizDisplay();

  // Load all data
  await Promise.all([
    Customers.load(),
    Invoices.load(),
    Expenses.load()
  ]);

  // Populate customer selects
  Customers.updateCustomerSelects();

  // Default to dashboard
  navigate('dashboard');

  // Sidebar toggle
  document.getElementById('hamburger-btn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // Nav items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigate(item.dataset.nav));
  });

  // Reports period tabs
  document.querySelectorAll('.rep-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.rep-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      Reports.render(btn.dataset.period);
    });
  });

  // Invoice search
  document.getElementById('inv-search')?.addEventListener('input', e => {
    const status = document.getElementById('inv-status-filter')?.value || 'all';
    Invoices.render(e.target.value, status);
  });

  document.getElementById('inv-status-filter')?.addEventListener('change', e => {
    const search = document.getElementById('inv-search')?.value || '';
    Invoices.render(search, e.target.value);
  });

  // Customer search
  document.getElementById('cust-search')?.addEventListener('input', e => Customers.render(e.target.value));

  // Expense search
  document.getElementById('exp-search')?.addEventListener('input', e => {
    const cat = document.getElementById('exp-cat-filter')?.value || 'all';
    Expenses.render(e.target.value, cat);
  });

  document.getElementById('exp-cat-filter')?.addEventListener('change', e => {
    const search = document.getElementById('exp-search')?.value || '';
    Expenses.render(search, e.target.value);
  });

  // Tax calculator live
  ['tax-amount','tax-pct'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', calcTax);
  });
  calcTax();

  // Service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // Offline indicator
  const offlineBar = document.getElementById('offline-bar');
  window.addEventListener('online', () => offlineBar.classList.remove('show'));
  window.addEventListener('offline', () => offlineBar.classList.add('show'));
  if (!navigator.onLine) offlineBar.classList.add('show');
}

document.addEventListener('DOMContentLoaded', init);
