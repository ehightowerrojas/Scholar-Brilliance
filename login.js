// ------------------------------------------------------------------
// Login / sign-up logic for login.html
// ------------------------------------------------------------------

const els = {
  heading:      document.getElementById('form-heading'),
  sub:          document.getElementById('form-sub'),
  nameField:    document.getElementById('name-field'),
  nameInput:    document.getElementById('full-name'),
  orgField:     document.getElementById('org-name-field'),
  orgInput:     document.getElementById('org-name'),
  referralField:document.getElementById('referral-field'),
  referralInput:document.getElementById('referral-code'),
  consentField:  document.getElementById('consent-field'),
  consentCheckbox: document.getElementById('consent-checkbox'),
  email:        document.getElementById('email'),
  password:     document.getElementById('password'),
  submitBtn:    document.getElementById('submit-btn'),
  form:         document.getElementById('login-form'),
  toggleLink:   document.getElementById('toggle-mode-link'),
  toggleText:   document.getElementById('toggle-mode-text'),
  forgotRow:    document.getElementById('forgot-row'),
  forgotLink:   document.getElementById('forgot-link'),
  message:      document.getElementById('form-message'),
  studentTab:   document.getElementById('tab-student'),
  staffTab:     document.getElementById('tab-staff'),
  demoNote:     document.getElementById('demo-note'),
  demoCred:     document.getElementById('demo-cred'),
};

let mode = 'login';           // 'login' | 'signup'
let selectedRole = 'student'; // 'student' | 'staff'
const inviteToken = new URLSearchParams(window.location.search).get('invite');

function landingPageFor(role) {
  return role === 'staff' ? 'staff-dashboard.html' : 'dashboard.html';
}

// Supabase's raw error text is accurate but not written for end
// users ("Invalid login credentials" reads like a system log). This
// maps the common ones to plain language; anything unrecognized
// still falls through to the original message so nothing gets
// silently swallowed.
function friendlyAuthError(message) {
  const map = [
    [/invalid login credentials/i, "That email or password doesn't look right. Try again, or use \"Forgot password?\" below."],
    [/user already registered/i, 'An account with that email already exists. Try logging in instead.'],
    [/email not confirmed/i, 'Check your inbox for a confirmation link before logging in.'],
    [/password should be at least/i, 'Choose a password with at least 6 characters.'],
    [/rate limit/i, "That's a lot of attempts. Wait a minute and try again."],
    [/network/i, "Couldn't reach the server. Check your connection and try again."],
  ];
  const match = map.find(([pattern]) => pattern.test(message));
  return match ? match[1] : message;
}

function setRole(role) {
  selectedRole = role;
  const isStudent = role === 'student';
  els.studentTab.setAttribute('aria-pressed', String(isStudent));
  els.staffTab.setAttribute('aria-pressed', String(!isStudent));
  els.demoCred.textContent = isStudent ? 'student@demo.org · password123' : 'staff@demo.org · password123';
  els.email.placeholder = isStudent ? 'you@student.edu' : 'you@school.edu';

  if (mode === 'signup') {
    els.orgField.style.display = isStudent ? 'none' : 'block';
    els.referralField.style.display = isStudent ? 'block' : 'none';
  }
}

function setMode(next) {
  mode = next;
  const isLogin = mode === 'login';
  const isStudent = selectedRole === 'student';

  els.heading.textContent = isLogin ? 'Log in to your account' : 'Create your account';
  els.sub.textContent = isLogin
    ? "Choose how you're joining us today."
    : "Set up your account to start tracking scholarships.";
  els.nameField.style.display = isLogin ? 'none' : 'block';
  els.nameInput.required = !isLogin;
  els.orgField.style.display = (!isLogin && !isStudent) ? 'block' : 'none';
  els.referralField.style.display = (!isLogin && isStudent) ? 'block' : 'none';
  els.consentField.style.display = isLogin ? 'none' : 'block';
  els.consentCheckbox.checked = false;
  els.submitBtn.textContent = isLogin ? 'Log in' : 'Create account';
  els.forgotRow.style.display = isLogin ? 'flex' : 'none';
  els.demoNote.style.display = isLogin ? 'block' : 'none';
  els.toggleText.textContent = isLogin ? "New to Scholar Brilliance?" : 'Already have an account?';
  els.toggleLink.textContent = isLogin ? 'Create an account' : 'Log in';
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
    error ? friendlyAuthError(error.message) : `Password reset email sent to ${email}.`,
    error ? 'error' : 'success'
  );
});

els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMessage();

  if (mode === 'signup' && !els.consentCheckbox.checked) {
    showMessage('Please agree to the Terms of Service and Privacy Policy to continue.', 'error');
    return;
  }

  const email = els.email.value.trim();
  const password = els.password.value;

  els.submitBtn.disabled = true;
  const originalLabel = els.submitBtn.textContent;
  els.submitBtn.textContent = mode === 'login' ? 'Logging in…' : 'Creating account…';

  if (mode === 'login') {
    // Defensive: clear any residual session before signing in, in
    // case a previous session wasn't fully cleared on logout (or the
    // user navigated here directly without logging out properly).
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('sb-')) localStorage.removeItem(key);
    });

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      showMessage(friendlyAuthError(error.message), 'error');
      els.submitBtn.disabled = false;
      els.submitBtn.textContent = originalLabel;
      return;
    }
    window.location.href = landingPageFor(data.user.user_metadata?.role);
  } else {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: els.nameInput.value.trim(),
          role: selectedRole,
          org_name: selectedRole === 'staff' ? els.orgInput.value.trim() : null,
          referral_code: selectedRole === 'student' ? els.referralInput.value.trim() : null,
          invite_token: inviteToken || null,
        },
      },
    });
    els.submitBtn.disabled = false;
    els.submitBtn.textContent = originalLabel;

    if (error) {
      showMessage(friendlyAuthError(error.message), 'error');
      return;
    }
    // If email confirmation is on (the default), there's no session yet.
    if (data.session) {
      await awardAchievement('profile_builder', data.user.id);
      window.location.href = landingPageFor(selectedRole);
    } else {
      document.getElementById('confirm-email-address').textContent = email;
      document.getElementById('login-main-content').style.display = 'none';
      document.getElementById('email-confirm-state').style.display = 'block';
    }
  }
});

document.getElementById('back-to-login-btn').addEventListener('click', () => {
  document.getElementById('email-confirm-state').style.display = 'none';
  document.getElementById('login-main-content').style.display = 'block';
  setMode('login');
});

document.getElementById('resend-confirmation-btn').addEventListener('click', async (e) => {
  const btn = e.target;
  const email = document.getElementById('confirm-email-address').textContent;
  btn.disabled = true;
  btn.textContent = 'Sending…';

  const { error } = await supabaseClient.auth.resend({ type: 'signup', email });

  btn.disabled = false;
  btn.textContent = 'Resend confirmation email';
  const msg = document.getElementById('resend-msg');
  msg.style.display = 'block';
  msg.textContent = error ? 'Could not resend, try again in a moment.' : 'Sent! Check your inbox (and spam folder).';
  msg.style.color = error ? '#c62828' : 'var(--teal-deep)';
});

// If someone's already logged in, skip straight to the right dashboard.
(async () => {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) window.location.href = landingPageFor(session.user.user_metadata?.role);
})();

// An invite link (?invite=token) always means a student signing up.
if (inviteToken) {
  setRole('student');
  setMode('signup');
  showMessage("You've been invited by your school — just set a password to finish joining.", 'success');
}

// Aligns the two headings ("Every finished application is a level
// up." / "Log in to your account") without breaking the vertical
// centering that makes the page scale correctly on tall viewports.
// A plain margin-top would get re-absorbed by the flex container's
// own centering (it would just re-center around the new, taller
// box), so this uses a transform instead, which shifts the element
// visually without affecting layout/centering math at all.
function alignLoginHeadings() {
  const questHeading = document.getElementById('quest-heading');
  const formHeading = document.getElementById('form-heading');
  const questBlock = document.querySelector('.login-quote');
  const formBlock = document.querySelector('.login-card');
  if (!questHeading || !formHeading || !questBlock || !formBlock) return;

  // Reset first, so repeated calls (e.g. on resize) measure real
  // positions rather than compounding a previous correction.
  questBlock.style.transform = '';
  formBlock.style.transform = '';

  const questTop = questHeading.getBoundingClientRect().top;
  const formTop = formHeading.getBoundingClientRect().top;
  const diff = questTop - formTop;

  if (Math.abs(diff) < 1) return; // already aligned, nothing to do
  if (diff > 0) {
    formBlock.style.transform = `translateY(${diff}px)`;
  } else {
    questBlock.style.transform = `translateY(${-diff}px)`;
  }
}

window.addEventListener('load', alignLoginHeadings);
let alignResizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(alignResizeTimer);
  alignResizeTimer = setTimeout(alignLoginHeadings, 150);
});
