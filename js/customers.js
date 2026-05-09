/* ===== CUSTOMERS MODULE ===== */
const Customers = (() => {
  let _list = [];

  async function load() {
    _list = await DB.getAll('customers');
    render();
  }

  function getAll() { return _list; }

  function getById(id) { return _list.find(c => c.id === id); }

  function render(filter = '') {
    const tbody = document.getElementById('cust-tbody');
    if (!tbody) return;
    const low = filter.toLowerCase();
    const filtered = filter
      ? _list.filter(c => c.name.toLowerCase().includes(low) || (c.phone || '').includes(low))
      : _list;

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5">
        <div class="empty-state">
          <div class="empty-icon">👥</div>
          <h3>لا يوجد عملاء</h3>
          <p>أضف عميلك الأول الآن</p>
        </div></td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(c => `
      <tr>
        <td><strong>${esc(c.name)}</strong></td>
        <td>${esc(c.phone || '—')}</td>
        <td>${esc(c.email || '—')}</td>
        <td>${esc(c.address || '—')}</td>
        <td>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm btn-outline" onclick="Customers.openEdit(${c.id})">✏️ تعديل</button>
            <button class="btn btn-sm btn-ghost" onclick="Customers.deleteCustomer(${c.id})">🗑️</button>
          </div>
        </td>
      </tr>`).join('');
  }

  function openAdd() {
    document.getElementById('cust-modal-title').textContent = 'إضافة عميل جديد';
    document.getElementById('cust-form').reset();
    document.getElementById('cust-id').value = '';
    document.getElementById('cust-tax-reg').value = '';
    document.getElementById('cust-governate').value = '';
    Modal.open('cust-modal');
  }

  function openEdit(id) {
    const c = getById(id);
    if (!c) return;
    document.getElementById('cust-modal-title').textContent = 'تعديل بيانات العميل';
    document.getElementById('cust-id').value = c.id;
    document.getElementById('cust-name').value = c.name;
    document.getElementById('cust-phone').value = c.phone || '';
    document.getElementById('cust-email').value = c.email || '';
    document.getElementById('cust-address').value = c.address || '';
    document.getElementById('cust-tax-reg').value = c.taxRegNumber || '';
    document.getElementById('cust-governate').value = c.governate || '';
    document.getElementById('cust-notes').value = c.notes || '';
    Modal.open('cust-modal');
  }

  async function save() {
    const id = document.getElementById('cust-id').value;
    const name = document.getElementById('cust-name').value.trim();
    if (!name) { toast('اكتب اسم العميل', 'error'); return; }

    const data = {
      name,
      phone:         document.getElementById('cust-phone').value.trim(),
      email:         document.getElementById('cust-email').value.trim(),
      address:       document.getElementById('cust-address').value.trim(),
      taxRegNumber:  document.getElementById('cust-tax-reg').value.trim(),
      governate:     document.getElementById('cust-governate').value.trim(),
      notes:         document.getElementById('cust-notes').value.trim()
    };

    if (id) {
      data.id = parseInt(id);
      await DB.put('customers', data);
      toast('تم تحديث بيانات العميل ✓');
    } else {
      await DB.add('customers', data);
      toast('تم إضافة العميل بنجاح ✓', 'success');
    }

    Modal.close('cust-modal');
    await load();
    updateCustomerSelects();
  }

  async function deleteCustomer(id) {
    if (!confirm('هل تريد حذف هذا العميل؟')) return;
    await DB.delete('customers', id);
    toast('تم الحذف');
    await load();
    updateCustomerSelects();
  }

  function updateCustomerSelects() {
    const selects = document.querySelectorAll('.customer-select');
    const options = '<option value="">-- اختر العميل --</option>' +
      _list.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    selects.forEach(s => { const v = s.value; s.innerHTML = options; s.value = v; });
  }

  return { load, getAll, getById, render, openAdd, openEdit, save, deleteCustomer, updateCustomerSelects };
})();
