/* ===== INVOICES MODULE ===== */
const Invoices = (() => {
  let _list = [];
  let _itemCount = 0;

  async function load() {
    _list = await DB.getAll('invoices');
    _list.sort((a, b) => new Date(b.date) - new Date(a.date));
    render();
  }

  function getAll() { return _list; }

  function render(filter = '', statusFilter = 'all') {
    const tbody = document.getElementById('inv-tbody');
    if (!tbody) return;
    const low = filter.toLowerCase();

    let filtered = _list;
    if (filter) filtered = filtered.filter(i =>
      String(i.number).includes(filter) ||
      (i.customerName || '').toLowerCase().includes(low)
    );
    if (statusFilter !== 'all') filtered = filtered.filter(i => i.status === statusFilter);

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7">
        <div class="empty-state">
          <div class="empty-icon">🧾</div>
          <h3>لا توجد فواتير</h3>
          <p>أنشئ فاتورتك الأولى الآن</p>
        </div></td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(inv => `
      <tr>
        <td><strong>#${inv.number}</strong></td>
        <td>${esc(inv.customerName || 'عميل غير محدد')}</td>
        <td>${formatDate(inv.date)}</td>
        <td><strong>${fmtMoney(inv.total)}</strong></td>
        <td>${statusBadge(inv.status)}</td>
        <td>${etaBadge(inv)}</td>
        <td>
          <div style="display:flex;gap:5px;flex-wrap:wrap">
            <button class="btn btn-sm btn-outline" onclick="Invoices.viewInvoice(${inv.id})">👁️ عرض</button>
            <button class="btn btn-sm btn-ghost" onclick="Invoices.openEdit(${inv.id})">✏️</button>
            <button class="btn btn-sm btn-whatsapp" onclick="Invoices.shareWhatsApp(${inv.id})">📱</button>
            <button class="btn btn-sm btn-ghost" title="إرسال لـ ETA" onclick="ETA.openSubmitModal(${inv.id})">🏛️</button>
            <button class="btn btn-sm btn-ghost" onclick="Invoices.deleteInvoice(${inv.id})">🗑️</button>
          </div>
        </td>
      </tr>`).join('');
  }

  function statusBadge(s) {
    const map = { paid: ['badge-green', 'مدفوعة'], pending: ['badge-yellow', 'معلقة'], cancelled: ['badge-red', 'ملغية'] };
    const [cls, label] = map[s] || ['badge-blue', s];
    return `<span class="badge ${cls}">${label}</span>`;
  }

  function etaBadge(inv) {
    if (inv.etaUUID) {
      const statusMap = {
        Valid:    ['badge-green', '✅ مقبولة'],
        Invalid:  ['badge-red',   '❌ مرفوضة'],
        Cancelled:['badge-red',   '🚫 ملغية'],
        Submitted:['badge-blue',  '⏳ معلقة']
      };
      const [cls, label] = statusMap[inv.etaStatus] || ['badge-blue', inv.etaStatus || 'مرسلة'];
      return `<span class="badge ${cls}" title="UUID: ${inv.etaUUID}">${label}</span>`;
    }
    return `<span class="badge" style="background:var(--gray-100);color:var(--gray-500);font-size:.72rem">غير مرسلة</span>`;
  }

  function openNew() {
    document.getElementById('inv-modal-title').textContent = 'فاتورة جديدة';
    document.getElementById('inv-form').reset();
    document.getElementById('inv-id').value = '';
    document.getElementById('inv-date').value = todayStr();
    document.getElementById('inv-status').value = 'pending';
    _itemCount = 0;
    document.getElementById('inv-items').innerHTML = '';
    addItem();
    calcTotals();
    Modal.open('inv-modal');
  }

  function openEdit(id) {
    const inv = _list.find(i => i.id === id);
    if (!inv) return;
    document.getElementById('inv-modal-title').textContent = 'تعديل الفاتورة';
    document.getElementById('inv-id').value = inv.id;
    document.getElementById('inv-customer').value = inv.customerId || '';
    document.getElementById('inv-date').value = inv.date;
    document.getElementById('inv-status').value = inv.status;
    document.getElementById('inv-notes').value = inv.notes || '';
    document.getElementById('inv-discount').value = inv.discount || 0;
    document.getElementById('inv-tax-pct').value = inv.taxPct !== undefined ? inv.taxPct : getDefaultTax();

    _itemCount = 0;
    document.getElementById('inv-items').innerHTML = '';
    (inv.items || []).forEach(item => addItem(item));
    calcTotals();
    Modal.open('inv-modal');
  }

  function addItem(data = {}) {
    _itemCount++;
    const i = _itemCount;
    const row = document.createElement('div');
    row.className = 'inv-item-row';
    row.id = `item-row-${i}`;
    row.innerHTML = `
      <input type="text" placeholder="اسم المنتج / الخدمة" id="item-name-${i}" value="${esc(data.name||'')}" required>
      <input type="number" placeholder="الكمية" id="item-qty-${i}" value="${data.qty||1}" min="1" step="any" oninput="Invoices.calcTotals()">
      <input type="number" placeholder="السعر" id="item-price-${i}" value="${data.price||''}" min="0" step="any" oninput="Invoices.calcTotals()">
      <div class="item-total" id="item-total-${i}">0 ج.م</div>
      <button type="button" class="btn-remove" onclick="Invoices.removeItem(${i})">✕</button>`;
    document.getElementById('inv-items').appendChild(row);
    calcTotals();
  }

  function removeItem(i) {
    document.getElementById(`item-row-${i}`)?.remove();
    calcTotals();
  }

  function calcTotals() {
    let subtotal = 0;
    document.querySelectorAll('[id^="item-row-"]').forEach(row => {
      const idx = row.id.replace('item-row-', '');
      const qty = parseFloat(document.getElementById(`item-qty-${idx}`)?.value) || 0;
      const price = parseFloat(document.getElementById(`item-price-${idx}`)?.value) || 0;
      const total = qty * price;
      const el = document.getElementById(`item-total-${idx}`);
      if (el) el.textContent = fmtMoney(total);
      subtotal += total;
    });

    const discount = parseFloat(document.getElementById('inv-discount')?.value) || 0;
    const taxPct = parseFloat(document.getElementById('inv-tax-pct')?.value) || 0;
    const afterDiscount = subtotal - discount;
    const taxAmt = afterDiscount * (taxPct / 100);
    const total = afterDiscount + taxAmt;

    setText('inv-subtotal', fmtMoney(subtotal));
    setText('inv-discount-show', fmtMoney(discount));
    setText('inv-tax-amt', fmtMoney(taxAmt));
    setText('inv-total', fmtMoney(total));
  }

  async function save() {
    const id = document.getElementById('inv-id').value;
    const customerId = parseInt(document.getElementById('inv-customer').value) || null;
    const customer = customerId ? Customers.getById(customerId) : null;

    const items = [];
    let subtotal = 0;
    document.querySelectorAll('[id^="item-row-"]').forEach(row => {
      const idx = row.id.replace('item-row-', '');
      const name = document.getElementById(`item-name-${idx}`)?.value.trim();
      const qty = parseFloat(document.getElementById(`item-qty-${idx}`)?.value) || 0;
      const price = parseFloat(document.getElementById(`item-price-${idx}`)?.value) || 0;
      if (name) { items.push({ name, qty, price }); subtotal += qty * price; }
    });

    if (items.length === 0) { toast('أضف منتجاً واحداً على الأقل', 'error'); return; }

    const discount = parseFloat(document.getElementById('inv-discount').value) || 0;
    const taxPct = parseFloat(document.getElementById('inv-tax-pct').value) || 0;
    const afterDiscount = subtotal - discount;
    const taxAmt = afterDiscount * (taxPct / 100);
    const total = afterDiscount + taxAmt;

    const data = {
      customerId,
      customerName: customer ? customer.name : 'عميل غير محدد',
      customerPhone: customer ? customer.phone : '',
      date: document.getElementById('inv-date').value,
      status: document.getElementById('inv-status').value,
      notes: document.getElementById('inv-notes').value.trim(),
      items, subtotal, discount, taxPct, taxAmt, total
    };

    if (id) {
      data.id = parseInt(id);
      const old = _list.find(i => i.id === data.id);
      data.number = old.number;
      await DB.put('invoices', data);
      toast('تم تحديث الفاتورة ✓');
    } else {
      data.number = await nextNumber();
      await DB.add('invoices', data);
      toast('تم حفظ الفاتورة ✓', 'success');
    }

    Modal.close('inv-modal');
    await load();
    Dashboard.refresh();
  }

  async function nextNumber() {
    const all = await DB.getAll('invoices');
    if (all.length === 0) return 1001;
    return Math.max(...all.map(i => i.number || 0)) + 1;
  }

  async function deleteInvoice(id) {
    if (!confirm('هل تريد حذف هذه الفاتورة؟')) return;
    await DB.delete('invoices', id);
    toast('تم الحذف');
    await load();
    Dashboard.refresh();
  }

  function viewInvoice(id) {
    const inv = _list.find(i => i.id === id);
    if (!inv) return;
    const settings = window._settings || {};
    const html = buildInvoiceHTML(inv, settings);
    document.getElementById('invoice-print-area').innerHTML = html;
    Modal.open('invoice-view-modal');
  }

  function buildInvoiceHTML(inv, settings = {}) {
    const rows = (inv.items || []).map(item => `
      <tr>
        <td>${esc(item.name)}</td>
        <td style="text-align:center">${item.qty}</td>
        <td style="text-align:left">${fmtMoney(item.price)}</td>
        <td style="text-align:left"><strong>${fmtMoney(item.qty * item.price)}</strong></td>
      </tr>`).join('');

    return `
    <div class="invoice-preview">
      <div class="inv-header">
        <div>
          <div class="inv-title">فاتورة</div>
          <div style="font-size:.85rem;color:#6b7280">رقم: <strong>#${inv.number}</strong></div>
          <div style="font-size:.85rem;color:#6b7280">التاريخ: ${formatDate(inv.date)}</div>
        </div>
        <div style="text-align:left">
          <div style="font-size:1.1rem;font-weight:700">${esc(settings.bizName || 'اسم الشركة')}</div>
          <div style="font-size:.82rem;color:#6b7280">${esc(settings.bizPhone || '')}</div>
          <div style="font-size:.82rem;color:#6b7280">${esc(settings.bizAddress || '')}</div>
        </div>
      </div>

      <div style="margin-bottom:20px;background:#f9fafb;padding:12px;border-radius:8px">
        <strong>العميل:</strong> ${esc(inv.customerName || 'عميل غير محدد')}<br>
        ${inv.customerPhone ? `<span style="color:#6b7280;font-size:.85rem">📞 ${esc(inv.customerPhone)}</span>` : ''}
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <thead>
          <tr>
            <th style="text-align:right;padding:8px 12px;background:#1a56db;color:white">المنتج / الخدمة</th>
            <th style="text-align:center;padding:8px 12px;background:#1a56db;color:white">الكمية</th>
            <th style="text-align:left;padding:8px 12px;background:#1a56db;color:white">السعر</th>
            <th style="text-align:left;padding:8px 12px;background:#1a56db;color:white">الإجمالي</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="inv-total-box" style="max-width:260px;margin-right:auto">
        <div class="inv-total-row"><span>المجموع الفرعي</span><span>${fmtMoney(inv.subtotal)}</span></div>
        ${inv.discount ? `<div class="inv-total-row"><span>الخصم</span><span>- ${fmtMoney(inv.discount)}</span></div>` : ''}
        ${inv.taxPct ? `<div class="inv-total-row"><span>ضريبة القيمة المضافة (${inv.taxPct}%)</span><span>${fmtMoney(inv.taxAmt)}</span></div>` : ''}
        <div class="inv-total-row grand"><span>الإجمالي</span><span>${fmtMoney(inv.total)}</span></div>
      </div>

      ${inv.notes ? `<div style="margin-top:20px;padding:12px;background:#f9fafb;border-radius:8px;font-size:.85rem"><strong>ملاحظات:</strong> ${esc(inv.notes)}</div>` : ''}

      <div style="margin-top:24px;text-align:center;font-size:.78rem;color:#9ca3af">شكراً لتعاملكم معنا</div>
    </div>`;
  }

  function printInvoice() {
    window.print();
  }

  function shareWhatsApp(id) {
    const inv = _list.find(i => i.id === id);
    if (!inv) return;
    const phone = inv.customerPhone ? inv.customerPhone.replace(/[^0-9]/g, '') : '';
    const msg = buildWhatsAppMsg(inv);
    const url = phone
      ? `https://wa.me/2${phone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  }

  function buildWhatsAppMsg(inv) {
    const lines = [
      `🧾 *فاتورة رقم #${inv.number}*`,
      `📅 التاريخ: ${formatDate(inv.date)}`,
      ``,
      `*المنتجات:*`,
      ...(inv.items || []).map(i => `▪️ ${i.name} × ${i.qty} = ${fmtMoney(i.qty * i.price)}`),
      ``,
    ];
    if (inv.discount) lines.push(`🏷️ خصم: ${fmtMoney(inv.discount)}`);
    if (inv.taxPct) lines.push(`📊 ضريبة (${inv.taxPct}%): ${fmtMoney(inv.taxAmt)}`);
    lines.push(`💰 *الإجمالي: ${fmtMoney(inv.total)}*`);
    if (inv.notes) lines.push(`\n📝 ${inv.notes}`);
    lines.push(`\nشكراً لتعاملكم معنا 🙏`);
    return lines.join('\n');
  }

  function getDefaultTax() {
    return window._settings?.defaultTax ?? 14;
  }

  return { load, getAll, render, openNew, openEdit, save, addItem, removeItem, calcTotals, deleteInvoice, viewInvoice, printInvoice, shareWhatsApp };
})();
