// ------------------------------------------------------------------
// Login / sign-up logic for login.html
// ------------------------------------------------------------------

const els = {
  heading:     document.getElementById('form-heading'),
  sub:         document.getElementById('form-sub'),
  nameField:   document.getElementById('name-field'),
  nameInput:   document.getElementById('full-name'),
  email:       document.getElementById('email'),
  password:    document.getElementById('password'),
  submitBtn:   document.getElementById('submit-btn'),
  form:        document.getElementById('login-form'),
  toggleLink:  document.getElementById('toggle-mode-link'),
  toggleText:  document.getElementById('toggle-mode-text'),
  forgotRow:   document.getElementById('forgot-row'),
  forgotLink:  document.getElementById('forgot-link'),
  message:     document.getElementById('form-message'),
  studentTab:  document.getElementById('tab-student'),
  staffTab:    document.getElementById('tab-staff'),
  demoNote:    document.getElementById('demo-note'),
  demoCred:    document.getElementById('demo-cred'),
};

let mode = 'login';       // 'login' | 'signup'
let selectedRole = 'student'; // 'student' | 'staff'

function setRole(role) {
  selectedRole = role;
  const isStudent = role === 'student';
  els.studentTab.setAttribute('aria-pressed', String(isStudent));
  els.staffTab.setAttribute('aria-pressed', String(!isStudent));
  els.demoCred.textContent = isStudent ? 'student@demo.org · password123' : 'staff@demo.org · password123';
  els.email.placeholder = isStudent ? 'you@student.edu' : 'you@school.edu';
}

function setMode(next) {
  mode = next;
  const isLogin = mode === 'login';

  els.heading.textContent = isLogin ? 'Log in to your account' : 'Create your account';
  els.sub.textContent = isLogin
    ? "Choose how you're joining us today."
    : "Set up your account to start tracking scholarships.";
  els.nameField.style.display = isLogin ? 'none' : 'block';
  els.nameInput.required = !isLogin;
  els.submitBtn.textContent = isLogin ? 'Log in' : 'Create account';
  els.forgotRow.style.display = isLogin ? 'flex' : 'none';
  els.demoNote.style.display = isLogin ? 'block' : 'none';
  els.toggleText.textContent = isLogin ? "New to Scholar Brilliance?" : 'Already have an account?';
  els.toggleLink.textContent = isLogin ? 'Create a free account' : 'Log in';
  clearMessage();
}

function showMessage(text, kind) {
  els.message.textContent = text;
  els.message.style.display = 'block';
  els.message.style.borderColor = kind === 'error' ? 'var(--fg)' : 'var(--line-strong)';
}

function clearMessage() {
  els.message.style.display = 'none';
  els.message.textContent = '';
}

els.studentTab.addEventListener('click', () => setRole('student'));
els.staffTab.addEventListener('click', () => setRole('staff'));

els.toggleLink.addEventListener('click', (e) => {
  e.preventDefault();
  setMode(mode === 'login' ? 'signup' : 'login');
});

els.forgotLink.addEventListener('click', async (e) => {
  e.preventDefault();
  const email = els.email.value.trim();
  if (!email) {
    showMessage('Enter your email above first, then click "Forgot password?" again.', 'error');
    return;
  }
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/login.html',
  });
  showMessage(
    error ? error.message : `Password reset email sent to ${email}.`,
    error ? 'error' : 'success'
  );
});

els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMessage();

  const email = els.email.value.trim();
  const password = els.password.value;

  els.submitBtn.disabled = true;
  const originalLabel = els.submitBtn.textContent;
  els.submitBtn.textContent = mode === 'login' ? 'Logging in…' : 'Creating account…';

  if (mode === 'login') {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      showMessage(error.message, 'error');
      els.submitBtn.disabled = false;
      els.submitBtn.textContent = originalLabel;
      return;
    }
    window.location.href = 'dashboard.html';
  } else {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: els.nameInput.value.trim(),
          role: selectedRole,
        },
      },
    });
    els.submitBtn.disabled = false;
    els.submitBtn.textContent = originalLabel;

    if (error) {
      showMessage(error.message, 'error');
      return;
    }
    // If email confirmation is on (the default), there's no session yet.
    if (data.session) {
      window.location.href = 'dashboard.html';
    } else {
      showMessage(`Check ${email} for a confirmation link to finish creating your account.`, 'success');
      setMode('login');
    }
  }
});

// If someone's already logged in, skip straight to the dashboard.
(async () => {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) window.location.href = 'dashboard.html';
})();
