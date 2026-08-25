// ------------------------------------------------------------------
// Shared security utilities. Any user-entered text (names, essay
// content, scholarship titles/descriptions, interests, etc.) must be
// passed through escapeHtml() before being inserted via innerHTML —
// otherwise a student could put HTML/JavaScript in a field like
// their name or an essay title and have it execute in classmates'
// browsers wherever that field is displayed (the Leaderboard, in
// particular, shows one student's name to everyone in their school).
// ------------------------------------------------------------------

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Only allow http/https links through. Prevents a javascript: URL
// entered as a "website" field from executing when someone clicks it.
function safeUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch (err) {
    // Not a parseable URL at all.
  }
  return null;
}

// Convenience for building a safe <a> tag, or an empty string if the
// URL isn't safe/present.
function safeLink(url, innerHtml, attrs = '') {
  const clean = safeUrl(url);
  if (!clean) return '';
  return `<a href="${escapeHtml(clean)}" ${attrs}>${innerHtml}</a>`;
}
