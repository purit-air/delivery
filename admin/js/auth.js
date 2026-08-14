import { supabase } from './supabase.js';
import { evaluateAdminAccess, getFriendlyErrorMessage } from '../../js/shared-contract.js';

// Elements
const loginForm = document.getElementById('login-form');
const authMsg = document.getElementById('auth-msg');

function setAuthMessage(message, type = 'error') {
  if (!authMsg) return;
  if (!message) {
    authMsg.textContent = '';
    authMsg.className = 'form-message';
    return;
  }
  authMsg.textContent = message;
  authMsg.className = `form-message ${type}`;
}

function setLoginBusy(isBusy) {
  const submitButton = loginForm?.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.disabled = isBusy;
    submitButton.textContent = isBusy ? 'Signing in…' : 'Login';
  }
  if (loginForm) {
    loginForm.setAttribute('aria-busy', isBusy ? 'true' : 'false');
  }
}

async function checkAdminAccess({ redirectOnLogin = true } = {}) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    console.error('Supabase session check failed', sessionError);
    if (location.pathname.endsWith('/admin/login.html') && authMsg) {
      setAuthMessage(getFriendlyErrorMessage(sessionError, 'Your session could not be verified. Please sign in again.'), 'error');
    }
    return false;
  }

  const session = sessionData?.session ?? null;
  const user = session?.user ?? null;
  if (!user || !session) {
    if (location.pathname.endsWith('/admin/dashboard.html') || location.pathname.endsWith('/admin/create.html') || location.pathname.endsWith('/admin/edit.html')) {
      location.href = '/admin/login.html';
    }
    return false;
  }

  const { data: profile, error: profileError } = await supabase
    .from('admin_profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error('admin profile check failed', profileError);
    await supabase.auth.signOut();
    if (location.pathname.endsWith('/admin/login.html') && authMsg) {
      setAuthMessage('Your admin profile could not be verified. Please contact support.', 'error');
    }
    location.href = '/admin/login.html?reason=profile_error';
    return false;
  }

  const verdict = evaluateAdminAccess({ user, session, adminProfile: profile, expiresAt: session.expires_at });
  if (!verdict.canAccessAdmin) {
    await supabase.auth.signOut();
    if (redirectOnLogin) {
      if (location.pathname.endsWith('/admin/login.html') && authMsg) {
        setAuthMessage('This account is not authorized for admin access.', 'warning');
      } else {
        location.href = '/admin/login.html?reason=' + verdict.reason;
      }
    }
    return false;
  }

  if (redirectOnLogin && location.pathname.endsWith('/admin/login.html')) {
    location.href = '/admin/dashboard.html';
  }

  return true;
}

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
      setAuthMessage('Enter both your email and password to continue.', 'warning');
      return;
    }

    setAuthMessage('Checking your credentials…', 'info');
    setLoginBusy(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const user = data?.user ?? null;
      const session = data?.session ?? null;
      if (!user || !session) throw new Error('No active session returned after login.');

      const { data: profile, error: profileError } = await supabase
        .from('admin_profiles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      const verdict = evaluateAdminAccess({ user, session, adminProfile: profile, expiresAt: session.expires_at });
      if (!verdict.canAccessAdmin) {
        await supabase.auth.signOut();
        setAuthMessage('This account does not have admin access. Please use an authorized admin account.', 'warning');
        return;
      }

      setAuthMessage('Signed in successfully. Redirecting to the dashboard…', 'success');
      location.href = '/admin/dashboard.html';
    } catch (err) {
      console.error(err);
      const friendly = getFriendlyErrorMessage(err, 'Login failed. Please check your credentials and try again.');
      setAuthMessage(friendly, 'error');
    } finally {
      setLoginBusy(false);
    }
  });
}

supabase.auth.onAuthStateChange(async (event, session) => {
  const user = session?.user ?? null;
  if (!user) {
    if (location.pathname.endsWith('/admin/dashboard.html') || location.pathname.endsWith('/admin/create.html') || location.pathname.endsWith('/admin/edit.html')) {
      location.href = '/admin/login.html';
    }
    return;
  }

  await checkAdminAccess({ redirectOnLogin: true });
});

(async ()=>{
  if (location.pathname.endsWith('/admin/login.html')) {
    await checkAdminAccess({ redirectOnLogin: true });
  } else {
    await checkAdminAccess({ redirectOnLogin: false });
  }
})();

export async function logout() {
  const logoutButton = document.querySelector('#logout-btn');
  if (logoutButton) {
    logoutButton.disabled = true;
    logoutButton.textContent = 'Logging out…';
  }
  try {
    await supabase.auth.signOut();
  } catch (error) {
    console.error('Logout failed', error);
    if (document.getElementById('dashboard-banner')) {
      const banner = document.getElementById('dashboard-banner');
      banner.textContent = 'Unable to sign out right now. Please try again.';
      banner.className = 'dashboard-banner error';
      banner.classList.remove('hidden');
    }
    return;
  }
  location.href = '/admin/login.html';
}
