/* ===== REPORTS MODULE ===== */
const Reports = (() => {

  function render(period = 'monthly') {
    const invoices = Invoices.getAll();
    const expenses = Expenses.getAll();
    const now = new Date();

    let salesData, labels, invFiltered, expFiltered;

    if (period === 'daily') {
      // Last 7 days
      labels = [];
      salesData = [];
      const expData = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const ds = d.toISOString().slice(0, 10);
        labels.push(dayLabel(d));
        salesData.push(invoices.filter(inv => inv.date === ds && inv.status !== 'cancelled').reduce((s, i) => s + i.total, 0));
        expData.push(expenses.filter(e => e.date === ds).reduce((s, e) => s + e.amount, 0));
      }
      invFiltered = invoices.filter(inv => {
        const d = new Date(inv.date);
        return (now - d) / 86400000 <= 7;
      });
      expFiltered = expenses.filter(e => { const d = new Date(e.date); return (now - d) / 86400000 <= 7; });
      renderChart(labels, salesData, expData, 'آخر 7 أيام');

    } else if (period === 'weekly') {
      // Last 8 weeks
      labels = [];
      salesData = [];
      const expData = [];
      for (let i = 7; i >= 0; i--) {
        const wEnd = new Date(now);
        wEnd.setDate(wEnd.getDate() - i * 7);
        const wStart = new Date(wEnd);
        wStart.setDate(wStart.getDate() - 6);
        const ws = wStart.toISOString().slice(0, 10);
        const we = wEnd.toISOString().slice(0, 10);
        labels.push(`أ${i === 0 ? 'هذا' : i}`);
        salesData.push(invoices.filter(inv => inv.date >= ws && inv.date <= we && inv.status !== 'cancelled').reduce((s, i) => s + i.total, 0));
        expData.push(expenses.filter(e => e.date >= ws && e.date <= we).reduce((s, e) => s + e.amount, 0));
      }
      invFiltered = invoices.filter(inv => { const d = new Date(inv.date); return (now - d) / 86400000 <= 56; });
      expFiltered = expenses.filter(e => { const d = new Date(e.date); return (now - d) / 86400000 <= 56; });
      renderChart(labels, salesData, expData, 'آخر 8 أسابيع');

    } else {
      // Monthly — last 12 months
      const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
      labels = [];
      salesData = [];
      const expData = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        labels.push(MONTHS_AR[d.getMonth()]);
        const y = d.getFullYear(), m = d.getMonth();
        salesData.push(invoices.filter(inv => {
          const id = new Date(inv.date);
          return id.getFullYear() === y && id.getMonth() === m && inv.status !== 'cancelled';
        }).reduce((s, i) => s + i.total, 0));
        expData.push(expenses.filter(e => {
          const ed = new Date(e.date);
          return ed.getFullYear() === y && ed.getMonth() === m;
        }).reduce((s, e) => s + e.amount, 0));
      }
      invFiltered = invoices.filter(inv => { const d = new Date(inv.date); return (now - d) / (86400000 * 365) <= 1; });
      expFiltered = expenses.filter(e => { const d = new Date(e.date); return (now - d) / (86400000 * 365) <= 1; });
      renderChart(labels, salesData, expData, 'آخر 12 شهر');
    }

    // Summary stats
    const totalSales = invFiltered.filter(i => i.status !== 'cancelled').reduce((s, i) => s + i.total, 0);
    const totalExpenses = expFiltered.reduce((s, e) => s + e.amount, 0);
    const profit = totalSales - totalExpenses;
    const paidCount = invFiltered.filter(i => i.status === 'paid').length;

    setText('rep-sales', fmtMoney(totalSales));
    setText('rep-expenses', fmtMoney(totalExpenses));
    setText('rep-profit', fmtMoney(profit));
    const profitEl = document.getElementById('rep-profit');
    if (profitEl) profitEl.style.color = profit >= 0 ? 'var(--success)' : 'var(--danger)';
    setText('rep-invoices', invFiltered.length);
    setText('rep-paid', paidCount);

    // Top customers
    const custMap = {};
    invFiltered.filter(i => i.status !== 'cancelled').forEach(i => {
      const k = i.customerName || 'غير محدد';
      custMap[k] = (custMap[k] || 0) + i.total;
    });
    const topCusts = Object.entries(custMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topList = document.getElementById('rep-top-customers');
    if (topList) {
      topList.innerHTML = topCusts.length
        ? topCusts.map(([name, total]) => `
          <li class="recent-item">
            <div><div class="name">${esc(name)}</div></div>
            <div class="amount">${fmtMoney(total)}</div>
          </li>`).join('')
        : '<li style="text-align:center;padding:20px;color:var(--gray-500)">لا بيانات</li>';
    }

    // Expenses by category
    const catMap = {};
    expFiltered.forEach(e => { catMap[e.category] = (catMap[e.category] || 0) + e.amount; });
    const catList = document.getElementById('rep-expenses-breakdown');
    if (catList) {
      const entries = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
      catList.innerHTML = entries.length
        ? entries.map(([cat, amt]) => `
          <li class="recent-item">
            <div class="name">${esc(cat)}</div>
            <div class="amount expense">${fmtMoney(amt)}</div>
          </li>`).join('')
        : '<li style="text-align:center;padding:20px;color:var(--gray-500)">لا مصروفات</li>';
    }
  }

  function renderChart(labels, salesData, expData, title) {
    const container = document.getElementById('rep-chart');
    if (!container) return;

    const maxVal = Math.max(...salesData, ...expData, 1);

    container.innerHTML = `
      <div style="font-size:.85rem;font-weight:700;color:var(--gray-700);margin-bottom:12px">${title}</div>
      <div style="display:flex;gap:16px;margin-bottom:8px;font-size:.78rem">
        <span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;background:var(--primary);display:inline-block;border-radius:2px"></span>المبيعات</span>
        <span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;background:var(--danger);display:inline-block;border-radius:2px"></span>المصروفات</span>
      </div>
      <div class="bar-chart">
        ${labels.map((lbl, i) => {
          const sh = Math.max((salesData[i] / maxVal) * 180, salesData[i] > 0 ? 4 : 0);
          const eh = Math.max((expData[i] / maxVal) * 180, expData[i] > 0 ? 4 : 0);
          return `
          <div class="bar-wrap">
            <div style="display:flex;gap:2px;align-items:flex-end;height:180px">
              <div class="bar" style="height:${sh}px;width:50%" title="${fmtMoney(salesData[i])}"></div>
              <div class="bar bar-expense" style="height:${eh}px;width:50%" title="${fmtMoney(expData[i])}"></div>
            </div>
            <div class="bar-label">${lbl}</div>
          </div>`;
        }).join('')}
      </div>`;
  }

  function dayLabel(d) {
    const DAYS = ['أحد','اثن','ثلا','أرب','خمي','جمع','سبت'];
    return DAYS[d.getDay()];
  }

  return { render };
})();
