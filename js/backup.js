/* ===== BACKUP MODULE ===== */
const Backup = (() => {

  async function exportData() {
    const data = await DB.exportAll();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `mohaseb-backup-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('تم تحميل النسخة الاحتياطية ✓', 'success');
    updateBackupDate();
  }

  function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.customers && !data.invoices && !data.expenses) {
          toast('ملف غير صالح', 'error'); return;
        }
        if (!confirm(`استيراد البيانات من ${file.name}؟\nسيتم استبدال جميع البيانات الحالية.`)) return;
        await DB.importAll(data);
        toast('تم استيراد البيانات ✓', 'success');
        await reloadAll();
      } catch {
        toast('خطأ في قراءة الملف', 'error');
      }
    };
    input.click();
  }

  async function reloadAll() {
    await Promise.all([
      Customers.load(),
      Invoices.load(),
      Expenses.load()
    ]);
    Dashboard.refresh();
  }

  function updateBackupDate() {
    const now = new Date().toLocaleString('ar-EG');
    DB.setSetting('lastBackup', now);
    setText('last-backup-date', now);
  }

  async function loadBackupDate() {
    const date = await DB.getSetting('lastBackup');
    setText('last-backup-date', date || 'لم يتم النسخ بعد');
  }

  return { exportData, importData, loadBackupDate };
})();
