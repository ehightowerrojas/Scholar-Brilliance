// ------------------------------------------------------------------
// Cookie/storage consent banner. Scholar Brilliance doesn't use
// advertising or tracking cookies, so this is a simple acknowledgment
// banner rather than a multi-category consent manager — there's
// nothing non-essential to opt in or out of. See /cookies.html for
// the full policy.
// ------------------------------------------------------------------

(function () {
  const ACK_KEY = 'sb_cookie_ack';
  if (localStorage.getItem(ACK_KEY) === 'true') return;

  const banner = document.createElement('div');
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', 'Cookie notice');
  banner.style.cssText = 'position:fixed; left:0; right:0; bottom:0; z-index:200; background:var(--charcoal-band, #37474f); color:var(--white, #fff); padding:16px 20px; display:flex; align-items:center; justify-content:center; gap:18px; flex-wrap:wrap; font-family:var(--font-body, sans-serif); box-shadow:0 -4px 20px rgba(0,0,0,0.2);';
  banner.innerHTML = `
    <p style="margin:0; font-size:13.5px; max-width:640px;">We use essential browser storage to keep you signed in — no advertising or tracking cookies. <a href="/cookies.html" style="color:var(--amber, #e3a73c); text-decoration:underline;">Learn more</a></p>
    <button id="cookie-ack-btn" style="background:var(--amber, #e3a73c); color:var(--ink-on-amber, #2b2206); border:none; border-radius:6px; padding:8px 18px; font-weight:700; font-size:13.5px; cursor:pointer; white-space:nowrap;">Got it</button>
  `;
  document.body.appendChild(banner);

  document.getElementById('cookie-ack-btn').addEventListener('click', () => {
    localStorage.setItem(ACK_KEY, 'true');
    banner.remove();
  });
})();
