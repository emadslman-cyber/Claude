/* ===== EXPENSES MODULE ===== */
const Expenses = (() => {
  let _list = [];

  const CATEGORIES = [
    'إيجار', 'رواتب', 'كهرباء وماء', 'مواد خام', 'شحن وتوصيل',
    'تسويق وإعلان', 'صيانة', 'ضرائب ورسوم', 'أدوات مكتبية', 'أخرى'
  ];

  async function load() {
    _list = await DB.getAll('expenses');
    _list.sort((a, b) => new Date(b.date) - new Date(a.date));
    render();
    fillCategoryOptions();
  }

  function getAll() { return _list; }

  function fillCategoryOptions() {
    const sels = document.querySelectorAll('.expense-category-select');
    const opts = CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');
    sels.forEach(s => { if (!s.options.length) s.innerHTML = opts; });
  }

  function render(filter = '', categoryFilter = 'all') {
    const tbody = document.getElementById('exp-tbody');
    if (!tbody) return;
    const low = filter.toLowerCase();

    let filtered = _list;
    if (filter) filtered = filtered.filter(e =>
      e.description.toLowerCase().includes(low) || (e.category || '').includes(filter)
    );
    if (categoryFilter !== 'all') filtered = filtered.filter(e => e.category === categoryFilter);

    const total = filtered.reduce((s, e) => s + e.amount, 0);
    setText('exp-total-shown', fmtMoney(total));

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5">
        <div class="empty-state">
          <div class="empty-icon">💸</div>
          <h3>لا توجد مصروفات</h3>
          <p>سجّل مصروفاتك لمتابعة التكاليف</p>
        </div></td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(e => `
      <tr>
        <td>${formatDate(e.date)}</td>
        <td>${esc(e.description)}</td>
        <td><span class="badge badge-blue">${esc(e.category)}</span></td>
        <td><strong style="color:var(--danger)">${fmtMoney(e.amount)}</strong></td>
        <td>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm btn-outline" onclick="Expenses.openEdit(${e.id})">✏️</button>
            <button class="btn btn-sm btn-ghost" onclick="Expenses.deleteExpense(${e.id})">🗑️</button>
          </div>
        </td>
      </tr>`).join('');
  }

  function openAdd() {
    document.getElementById('exp-modal-title').textContent = 'إضافة مصروف';
    document.getElementById('exp-form').reset();
    document.getElementById('exp-id').value = '';
    document.getElementById('exp-date').value = todayStr();
    fillCategoryOptions();
    Modal.open('exp-modal');
  }

  function openEdit(id) {
    const e = _list.find(x => x.id === id);
    if (!e) return;
    document.getElementById('exp-modal-title').textContent = 'تعديل المصروف';
    document.getElementById('exp-id').value = e.id;
    document.getElementById('exp-date').value = e.date;
    document.getElementById('exp-description').value = e.description;
    document.getElementById('exp-category').value = e.category;
    document.getElementById('exp-amount').value = e.amount;
    document.getElementById('exp-notes').value = e.notes || '';
    fillCategoryOptions();
    Modal.open('exp-modal');
  }

  async function save() {
    const id = document.getElementById('exp-id').value;
    const description = document.getElementById('exp-description').value.trim();
    const amount = parseFloat(document.getElementById('exp-amount').value);

    if (!description) { toast('اكتب وصف المصروف', 'error'); return; }
    if (!amount || amount <= 0) { toast('اكتب مبلغ صحيح', 'error'); return; }

    const data = {
      date: document.getElementById('exp-date').value,
      description,
      category: document.getElementById('exp-category').value,
      amount,
      notes: document.getElementById('exp-notes').value.trim()
    };

    if (id) {
      data.id = parseInt(id);
      await DB.put('expenses', data);
      toast('تم التحديث ✓');
    } else {
      await DB.add('expenses', data);
      toast('تم تسجيل المصروف ✓', 'success');
    }

    Modal.close('exp-modal');
    await load();
    Dashboard.refresh();
  }

  async function deleteExpense(id) {
    if (!confirm('هل تريد حذف هذا المصروف؟')) return;
    await DB.delete('expenses', id);
    toast('تم الحذف');
    await load();
    Dashboard.refresh();
  }

  function getCategoryTotals() {
    const map = {};
    _list.forEach(e => { map[e.category] = (map[e.category] || 0) + e.amount; });
    return map;
  }

  function getMonthTotal(year, month) {
    return _list
      .filter(e => { const d = new Date(e.date); return d.getFullYear() === year && d.getMonth() === month; })
      .reduce((s, e) => s + e.amount, 0);
  }

  return { load, getAll, render, openAdd, openEdit, save, deleteExpense, getCategoryTotals, getMonthTotal };
})();
