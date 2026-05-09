/* Auth overlay — shown before the app loads if no valid session exists */

const AuthUI = (() => {
  function show() {
    document.getElementById('auth-overlay')?.classList.add('open');
    document.getElementById('app-wrapper')?.classList.add('hidden');
  }

  function hide() {
    document.getElementById('auth-overlay')?.classList.remove('open');
    document.getElementById('app-wrapper')?.classList.remove('hidden');
  }

  function showTab(tab) {
    document.getElementById('auth-login-tab')?.classList.toggle('active', tab === 'login');
    document.getElementById('auth-register-tab')?.classList.toggle('active', tab === 'register');
    document.getElementById('auth-login-form')?.classList.toggle('hidden', tab !== 'login');
    document.getElementById('auth-register-form')?.classList.toggle('hidden', tab !== 'register');
  }

  function setError(formId, msg) {
    const el = document.getElementById(`${formId}-error`);
    if (el) { el.textContent = msg; el.style.display = msg ? 'block' : 'none'; }
  }

  function setLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.disabled = loading;
      btn.textContent = loading ? '...جاري' : btn.dataset.label;
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    setError('auth-login', '');
    setLoading('login-btn', true);

    try {
      const data = await Auth.login(email, password);
      const profile = await Auth.fetchProfile();

      if (!profile.companies || profile.companies.length === 0) {
        setError('auth-login', 'لا توجد شركات مرتبطة بهذا الحساب');
        return;
      }

      if (profile.companies.length === 1) {
        Auth.selectCompany(profile.companies[0].id);
        hide();
        window.App?.init?.();
      } else {
        showCompanyPicker(profile.companies);
      }
    } catch (err) {
      setError('auth-login', err.message);
    } finally {
      setLoading('login-btn', false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    const email       = document.getElementById('reg-email').value.trim();
    const password    = document.getElementById('reg-password').value;
    const companyName = document.getElementById('reg-company').value.trim();
    setError('auth-register', '');
    setLoading('register-btn', true);

    try {
      const res = await fetch('http://localhost:3001/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, companyName }),
      });
      const data = await res.json();
      if (!res.ok) { setError('auth-register', data.error || 'فشل التسجيل'); return; }

      toast('تم إنشاء الحساب — يمكنك تسجيل الدخول الآن', 'success');
      showTab('login');
    } catch (err) {
      setError('auth-register', err.message);
    } finally {
      setLoading('register-btn', false);
    }
  }

  function showCompanyPicker(companies) {
    const container = document.getElementById('company-picker-list');
    if (!container) return;
    container.innerHTML = companies.map(c => `
      <button class="company-picker-item" onclick="AuthUI._selectCompany('${c.id}')">
        <strong>${c.name}</strong>
        <span class="badge">${c.role}</span>
      </button>
    `).join('');
    document.getElementById('auth-login-form')?.classList.add('hidden');
    document.getElementById('auth-register-form')?.classList.add('hidden');
    document.getElementById('company-picker')?.classList.remove('hidden');
  }

  function _selectCompany(id) {
    Auth.selectCompany(id);
    hide();
    window.App?.init?.();
  }

  async function init() {
    if (!Auth.isLoggedIn()) { show(); return; }

    // Validate token by fetching profile
    try {
      await Auth.fetchProfile();
      hide();
    } catch {
      Auth.logout();
    }
  }

  // Wire up form events after DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('auth-login-form')?.addEventListener('submit', handleLogin);
    document.getElementById('auth-register-form')?.addEventListener('submit', handleRegister);

    document.getElementById('auth-login-tab')?.addEventListener('click', () => showTab('login'));
    document.getElementById('auth-register-tab')?.addEventListener('click', () => showTab('register'));

    document.getElementById('logout-btn')?.addEventListener('click', () => Auth.logout());

    init();
  });

  return { show, hide, showTab, _selectCompany };
})();
