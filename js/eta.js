/* ===== EGYPT TAX AUTHORITY (ETA) e-Invoice Integration =====
 * Docs: https://sdk.invoicing.eta.gov.eg
 * Preprod portal: https://invoicing.preprod.eta.gov.eg
 * Production portal: https://invoicing.eta.gov.eg
 */

const ETA = (() => {

  const ENDPOINTS = {
    preprod: {
      auth: 'https://id.preprod.eta.gov.eg/connect/token',
      api:  'https://api.preprod.eta.gov.eg/api/v1'
    },
    production: {
      auth: 'https://id.eta.gov.eg/connect/token',
      api:  'https://api.invoicing.eta.gov.eg/api/v1'
    }
  };

  // ETA uses ISIC4 activity codes. Common Egyptian codes:
  const ACTIVITY_CODES = [
    { code: '4711', label: 'تجزئة — متاجر عامة' },
    { code: '4719', label: 'تجزئة — محلات متنوعة' },
    { code: '4610', label: 'وكلاء بيع الجملة' },
    { code: '4620', label: 'جملة — مواد خام زراعية' },
    { code: '4630', label: 'جملة — غذاء ومشروبات' },
    { code: '4641', label: 'جملة — مفروشات وأقمشة' },
    { code: '4649', label: 'جملة — منزليات أخرى' },
    { code: '4651', label: 'جملة — أجهزة كمبيوتر' },
    { code: '4659', label: 'جملة — آلات ومعدات' },
    { code: '4690', label: 'جملة — بضائع متنوعة' },
    { code: '5610', label: 'مطاعم وكافيهات' },
    { code: '6201', label: 'برمجة وتطوير' },
    { code: '6920', label: 'محاسبة وضرائب' },
    { code: '7010', label: 'إدارة الشركات' },
    { code: '7490', label: 'أعمال تجارية متنوعة' },
    { code: '8211', label: 'خدمات سكرتارية ومكتبية' },
    { code: '9529', label: 'إصلاح سلع متنوعة' },
  ];

  // ETA unit type codes
  const UNIT_TYPES = [
    { code: 'EA',  label: 'قطعة / عدد' },
    { code: 'KGM', label: 'كيلوجرام' },
    { code: 'GRM', label: 'جرام' },
    { code: 'LTR', label: 'لتر' },
    { code: 'MTR', label: 'متر' },
    { code: 'MTK', label: 'متر مربع' },
    { code: 'MTQ', label: 'متر مكعب' },
    { code: 'SET', label: 'مجموعة / طقم' },
    { code: 'HUR', label: 'ساعة' },
    { code: 'DAY', label: 'يوم' },
    { code: 'MON', label: 'شهر' },
    { code: 'TNE', label: 'طن' },
    { code: 'BOX', label: 'صندوق / كرتونة' },
    { code: 'PKG', label: 'طرد / عبوة' },
  ];

  // ── Token management ──────────────────────────────────────────────────────
  let _accessToken = null;
  let _tokenExpiry  = 0;

  async function getToken(cfg) {
    if (_accessToken && Date.now() < _tokenExpiry) return _accessToken;

    const proxyBase = cfg.proxyUrl || 'http://localhost:3001';
    const res = await fetch(`${proxyBase}/eta/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        env: cfg.environment || 'preprod',
        clientId: cfg.clientId,
        clientSecret: cfg.clientSecret
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`ETA Auth failed: ${err}`);
    }

    const data = await res.json();
    _accessToken = data.access_token;
    _tokenExpiry  = Date.now() + (data.expires_in - 30) * 1000;
    return _accessToken;
  }

  // ── Document serialization (required for digital signature) ───────────────
  function serializeDocument(obj) {
    if (obj === null || obj === undefined) return '';
    if (typeof obj === 'string')  return `"${obj}"`;
    if (typeof obj === 'number')  return String(obj);
    if (typeof obj === 'boolean') return String(obj);

    if (Array.isArray(obj)) {
      return obj.map(item => serializeDocument(item)).join('');
    }

    // Object: sort keys alphabetically (case-insensitive per ETA spec)
    const keys = Object.keys(obj).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    return keys.map(k => {
      const val = obj[k];
      if (val === null || val === undefined || val === '') return '';
      return `"${k.toUpperCase()}"${serializeDocument(val)}`;
    }).join('');
  }

  // ── Build ETA document from app invoice ──────────────────────────────────
  function buildDocument(inv, cfg) {
    const issuerTaxReg = cfg.taxRegNumber || '';

    const lines = (inv.items || []).map((item, idx) => {
      const lineTotal      = item.qty * item.price;
      const lineDiscount   = (inv.discount && idx === 0) ? parseFloat(inv.discount) : 0; // spread discount on first line for simplicity
      const netLine        = lineTotal - lineDiscount;
      const taxRate        = inv.taxPct || 0;
      const taxAmt         = parseFloat((netLine * (taxRate / 100)).toFixed(5));
      const totalLine      = netLine + taxAmt;

      return {
        description:      item.name,
        itemType:         'EGS',
        itemCode:         `EG-${issuerTaxReg}-${String(idx + 1).padStart(4, '0')}`,
        unitType:         item.unitType || 'EA',
        quantity:         item.qty,
        internalCode:     String(idx + 1),
        salesTotal:       parseFloat(lineTotal.toFixed(5)),
        total:            parseFloat(totalLine.toFixed(5)),
        valueDifference:  0,
        totalTaxableFees: 0,
        netTotal:         parseFloat(netLine.toFixed(5)),
        itemsDiscount:    parseFloat(lineDiscount.toFixed(5)),
        discount: {
          rate:   lineDiscount > 0 ? parseFloat(((lineDiscount / lineTotal) * 100).toFixed(5)) : 0,
          amount: parseFloat(lineDiscount.toFixed(5))
        },
        taxableItems: taxRate > 0 ? [{
          taxType:  'T1',
          amount:   taxAmt,
          subType:  'V009',
          rate:     taxRate
        }] : [],
        unitValue: {
          currencySold: 'EGP',
          amountEGP:    parseFloat(item.price.toFixed(5))
        }
      };
    });

    const totalSales    = lines.reduce((s, l) => s + l.salesTotal, 0);
    const totalDiscount = lines.reduce((s, l) => s + l.itemsDiscount, 0);
    const netAmount     = totalSales - totalDiscount;
    const taxTotal      = lines.reduce((s, l) => s + (l.taxableItems[0]?.amount || 0), 0);
    const grandTotal    = netAmount + taxTotal;

    const customer = inv.customerId ? Customers.getById(inv.customerId) : null;

    const doc = {
      issuer: {
        address: {
          branchID:  cfg.branchId || '0',
          country:   'EG',
          governate: cfg.governate    || 'القاهرة',
          regionCity: cfg.regionCity  || 'القاهرة',
          street:    cfg.street       || '',
          buildingNumber: cfg.building || '1',
          postalCode: cfg.postalCode  || ''
        },
        type: 'B',
        id:   issuerTaxReg,
        name: cfg.bizName || window._settings?.bizName || 'الشركة'
      },
      receiver: buildReceiver(customer, cfg),
      documentType:        'I',
      documentTypeVersion: '1.0',
      dateTimeIssued:      inv.date + 'T00:00:00Z',
      taxpayerActivityCode: cfg.activityCode || '4711',
      internalID:          String(inv.number),
      invoiceLines:        lines,
      taxTotals: taxTotal > 0 ? [{ taxType: 'T1', amount: parseFloat(taxTotal.toFixed(5)) }] : [],
      totalSalesAmount:    parseFloat(totalSales.toFixed(5)),
      totalDiscountAmount: parseFloat(totalDiscount.toFixed(5)),
      netAmount:           parseFloat(netAmount.toFixed(5)),
      extraDiscountAmount: 0,
      totalItemsDiscountAmount: 0,
      totalAmount:         parseFloat(grandTotal.toFixed(5))
    };

    return doc;
  }

  function buildReceiver(customer, cfg) {
    if (!customer || !customer.taxRegNumber) {
      // Consumer (person without tax registration)
      return {
        address: { country: 'EG' },
        type: 'P',
        id:   '0',
        name: customer ? customer.name : 'مستهلك'
      };
    }
    return {
      address: {
        country:   'EG',
        governate: customer.governate || 'القاهرة',
        regionCity: customer.city    || 'القاهرة',
        street:    customer.address  || '',
        buildingNumber: '1'
      },
      type: 'B',
      id:   customer.taxRegNumber,
      name: customer.name
    };
  }

  // ── Submit document ───────────────────────────────────────────────────────
  async function submitDocument(inv) {
    const cfg = await loadConfig();
    if (!cfg.clientId || !cfg.clientSecret) {
      throw new Error('أدخل بيانات ETA في الإعدادات أولاً');
    }

    const doc = buildDocument(inv, cfg);
    const serialized = serializeDocument(doc);

    const proxyBase = cfg.proxyUrl || 'http://localhost:3001';

    const res = await fetch(`${proxyBase}/eta/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        env: cfg.environment || 'preprod',
        clientId: cfg.clientId,
        clientSecret: cfg.clientSecret,
        certPassword: cfg.certPassword || '',
        document: doc,
        serialized
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || 'فشل الإرسال');
    return data; // { submissionId, acceptedDocuments, rejectedDocuments }
  }

  // ── Check submission status ───────────────────────────────────────────────
  async function checkStatus(submissionId) {
    const cfg = await loadConfig();
    const proxyBase = cfg.proxyUrl || 'http://localhost:3001';

    const res = await fetch(`${proxyBase}/eta/status/${submissionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        env: cfg.environment || 'preprod',
        clientId: cfg.clientId,
        clientSecret: cfg.clientSecret
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'فشل جلب الحالة');
    return data;
  }

  // ── Export ETA JSON (portal manual submission) ────────────────────────────
  async function exportETAJson(inv) {
    const cfg = await loadConfig();
    const doc = buildDocument(inv, cfg);
    const payload = { documents: [{ ...doc, signatures: [{ signatureType: 'I', value: '' }] }] };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `ETA-Invoice-${inv.number}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('تم تحميل ملف ETA ✓ — ارفعه على بوابة الفاتورة الإلكترونية', 'success');
  }

  // ── Config helpers ────────────────────────────────────────────────────────
  async function loadConfig() {
    const keys = ['etaClientId','etaClientSecret','etaTaxReg','etaActivityCode',
                  'etaEnvironment','etaProxyUrl','etaBizName','etaBranch',
                  'etaGovornate','etaCity','etaStreet','etaBuilding',
                  'etaPostal','etaCertPassword'];
    const cfg = {};
    await Promise.all(keys.map(async k => {
      const v = await DB.getSetting(k);
      if (v) cfg[k.replace('eta','').replace(/^./, c => c.toLowerCase())] = v;
    }));
    // Map normalized keys
    return {
      clientId:     cfg.clientId     || '',
      clientSecret: cfg.clientSecret || '',
      taxRegNumber: cfg.taxReg       || '',
      activityCode: cfg.activityCode || '4711',
      environment:  cfg.environment  || 'preprod',
      proxyUrl:     cfg.proxyUrl     || 'http://localhost:3001',
      bizName:      cfg.bizName      || window._settings?.bizName || '',
      branchId:     cfg.branch       || '0',
      governate:    cfg.govornate    || 'القاهرة',
      regionCity:   cfg.city         || 'القاهرة',
      street:       cfg.street       || '',
      building:     cfg.building     || '1',
      postalCode:   cfg.postal       || '',
      certPassword: cfg.certPassword || ''
    };
  }

  async function saveConfig() {
    const fields = {
      etaClientId:     'eta-client-id',
      etaClientSecret: 'eta-client-secret',
      etaTaxReg:       'eta-tax-reg',
      etaActivityCode: 'eta-activity-code',
      etaEnvironment:  'eta-environment',
      etaProxyUrl:     'eta-proxy-url',
      etaBranch:       'eta-branch',
      etaGovornate:    'eta-governate',
      etaCity:         'eta-city',
      etaStreet:       'eta-street',
      etaBuilding:     'eta-building',
      etaPostal:       'eta-postal',
      etaCertPassword: 'eta-cert-password'
    };
    await Promise.all(Object.entries(fields).map(([key, elId]) => {
      const el = document.getElementById(elId);
      if (el) return DB.setSetting(key, el.value.trim());
    }));
    toast('تم حفظ إعدادات ETA ✓', 'success');
  }

  async function loadConfigUI() {
    const cfg = await loadConfig();
    const map = {
      'eta-client-id':     cfg.clientId,
      'eta-client-secret': cfg.clientSecret,
      'eta-tax-reg':       cfg.taxRegNumber,
      'eta-activity-code': cfg.activityCode,
      'eta-environment':   cfg.environment,
      'eta-proxy-url':     cfg.proxyUrl,
      'eta-branch':        cfg.branchId,
      'eta-governate':     cfg.governate,
      'eta-city':          cfg.regionCity,
      'eta-street':        cfg.street,
      'eta-building':      cfg.building,
      'eta-postal':        cfg.postalCode
    };
    Object.entries(map).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el && val) el.value = val;
    });
    fillActivityCodes();
    fillUnitTypes();
  }

  function fillActivityCodes() {
    const sel = document.getElementById('eta-activity-code');
    if (!sel || sel.options.length > 1) return;
    ACTIVITY_CODES.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.code;
      opt.textContent = `${a.code} — ${a.label}`;
      sel.appendChild(opt);
    });
  }

  function fillUnitTypes() {
    document.querySelectorAll('.eta-unit-select').forEach(sel => {
      if (sel.options.length > 0) return;
      UNIT_TYPES.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.code;
        opt.textContent = `${u.code} — ${u.label}`;
        sel.appendChild(opt);
      });
    });
  }

  // ── Test connection ───────────────────────────────────────────────────────
  async function testConnection() {
    const btn = document.getElementById('eta-test-btn');
    const statusEl = document.getElementById('eta-test-status');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري الاختبار...'; }

    try {
      const cfg = await loadConfig();
      if (!cfg.clientId || !cfg.clientSecret) {
        throw new Error('أدخل Client ID و Client Secret أولاً');
      }

      const proxyBase = cfg.proxyUrl || 'http://localhost:3001';

      // First check if proxy is running
      const pingRes = await fetch(`${proxyBase}/ping`, { signal: AbortSignal.timeout(3000) });
      if (!pingRes.ok) throw new Error('الخادم غير متاح — شغّل: npm run dev');

      // Try token
      const tokenRes = await fetch(`${proxyBase}/eta/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          env: cfg.environment,
          clientId: cfg.clientId,
          clientSecret: cfg.clientSecret
        }),
        signal: AbortSignal.timeout(10000)
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.json();
        throw new Error(err.error || 'بيانات الدخول خاطئة');
      }

      if (statusEl) {
        statusEl.innerHTML = '<span style="color:var(--success)">✅ الاتصال بـ ETA ناجح</span>';
      }
      toast('تم الاتصال بـ ETA بنجاح ✓', 'success');

    } catch (err) {
      if (statusEl) {
        statusEl.innerHTML = `<span style="color:var(--danger)">❌ ${err.message}</span>`;
      }
      toast(err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🔌 اختبار الاتصال'; }
    }
  }

  // ── UI: Submit invoice to ETA ─────────────────────────────────────────────
  async function openSubmitModal(invId) {
    const invoices = Invoices.getAll();
    const inv = invoices.find(i => i.id === invId);
    if (!inv) return;

    document.getElementById('eta-submit-inv-id').value = invId;
    document.getElementById('eta-submit-inv-num').textContent = `#${inv.number}`;
    document.getElementById('eta-submit-inv-total').textContent = fmtMoney(inv.total);
    document.getElementById('eta-submit-result').innerHTML = '';

    Modal.open('eta-submit-modal');
  }

  async function doSubmit() {
    const invId = parseInt(document.getElementById('eta-submit-inv-id').value);
    const invoices = Invoices.getAll();
    const inv = invoices.find(i => i.id === invId);
    if (!inv) return;

    const resultEl = document.getElementById('eta-submit-result');
    const btn = document.getElementById('eta-submit-btn');
    btn.disabled = true;
    btn.textContent = '⏳ جاري الإرسال...';
    resultEl.innerHTML = '';

    try {
      const result = await submitDocument(inv);

      const accepted = result.acceptedDocuments || [];
      const rejected = result.rejectedDocuments || [];

      if (accepted.length > 0) {
        const uuid = accepted[0]?.uuid || '';
        const longId = accepted[0]?.longId || '';

        // Save ETA submission info via dedicated PATCH endpoint
        await DB.updateEtaStatus(inv.id, uuid, 'Valid');
        await Invoices.load();

        resultEl.innerHTML = `
          <div style="background:var(--success-light);border-radius:8px;padding:14px;margin-top:12px">
            <div style="color:var(--success);font-weight:700;margin-bottom:8px">✅ تم إرسال الفاتورة بنجاح</div>
            <div style="font-size:.85rem"><strong>UUID:</strong> ${uuid}</div>
            ${longId ? `<div style="font-size:.85rem;margin-top:4px"><strong>Long ID:</strong> ${longId}</div>` : ''}
          </div>`;
        toast('تم إرسال الفاتورة لـ ETA ✓', 'success');
      }

      if (rejected.length > 0) {
        const errors = rejected[0]?.error?.details || [];
        resultEl.innerHTML = `
          <div style="background:var(--danger-light);border-radius:8px;padding:14px;margin-top:12px">
            <div style="color:var(--danger);font-weight:700;margin-bottom:8px">❌ رُفضت الفاتورة من ETA</div>
            ${errors.map(e => `<div style="font-size:.83rem">• ${e.message || JSON.stringify(e)}</div>`).join('')}
          </div>`;
      }

    } catch (err) {
      resultEl.innerHTML = `
        <div style="background:var(--danger-light);border-radius:8px;padding:14px;margin-top:12px">
          <div style="color:var(--danger);font-weight:700">❌ خطأ في الإرسال</div>
          <div style="font-size:.85rem;margin-top:6px">${err.message}</div>
          <div style="font-size:.8rem;margin-top:8px;color:var(--gray-500)">
            تأكد من تشغيل الخادم: <code>npm run dev</code>
          </div>
        </div>`;
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '📤 إرسال لـ ETA';
    }
  }

  return {
    loadConfigUI, saveConfig, testConnection,
    exportETAJson, openSubmitModal, doSubmit,
    ACTIVITY_CODES, UNIT_TYPES,
    buildDocument, serializeDocument
  };
})();
