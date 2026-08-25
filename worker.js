// ------------------------------------------------------------------
// Scholar Brilliance Worker
// Serves the static site as usual, and adds one API route:
// GET /api/extract?url=<scholarship page> — best-effort heuristic
// extraction of a title, dollar amount, and deadline-like date from
// a public webpage's raw HTML. This is intentionally simple (Beta):
// no JS rendering, no AI — just pattern matching on the HTML text.
// ------------------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/extract') {
      const user = await verifySupabaseSession(request, env);
      if (!user) {
        return withSecurityHeaders(json({ error: 'You must be logged in to use this tool.' }, 401));
      }
      return withSecurityHeaders(await handleExtract(url));
    }

    // Everything else is a normal static asset request.
    const assetResponse = await env.ASSETS.fetch(request);
    return withSecurityHeaders(assetResponse);
  },
};

// Adds defense-in-depth HTTP security headers to every response —
// pages and API responses alike. These protect against clickjacking,
// MIME-type sniffing attacks, and add a second layer of XSS
// mitigation on top of the output-escaping already done in the app's
// own JavaScript (utils.js's escapeHtml/safeLink).
//
// Note on the CSP below: 'unsafe-inline' is kept for style-src only,
// since the site uses inline style="..." attributes extensively.
// script-src has no such exception — every page loads its JS from
// real files, so inline script injection is fully blocked.
function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      "connect-src 'self' https://*.supabase.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Asks Supabase itself to validate the caller's access token, rather
// than verifying the JWT signature ourselves. Supabase has been
// transitioning projects between HS256 (shared-secret) and newer
// ES256/JWKS (public-key) signing depending on when the project was
// created — asking Supabase directly means this keeps working
// correctly no matter which one a given project uses, with no crypto
// code or secrets to maintain here.
async function verifySupabaseSession(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;

  try {
    const resp = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: env.SUPABASE_ANON_KEY,
      },
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch (err) {
    return null;
  }
}

async function handleExtract(url) {
  const target = url.searchParams.get('url');

  if (!target || !/^https?:\/\//i.test(target)) {
    return json({ error: 'Please provide a valid http(s) URL.' }, 400);
  }

  let html;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(target, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ScholarBrillianceBot/1.0)' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      return json({ error: `The page responded with status ${resp.status}. It may block automated requests.` }, 502);
    }
    html = await resp.text();
  } catch (err) {
    return json({ error: "Couldn't reach that page — it may be slow, offline, or blocking automated requests (this happens with sites like Bold.org)." }, 502);
  }

  const result = extractInfo(html, target);
  return json(result);
}

function extractInfo(html, sourceUrl) {
  // Title: prefer og:title, fall back to <title>
  const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const titleTagMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const rawTitle = ogTitleMatch?.[1] || titleTagMatch?.[1] || null;
  const title = rawTitle ? decodeEntities(rawTitle.trim()).slice(0, 150) : null;

  // Amount: find $ figures in a plausible scholarship range, take the largest.
  const amountMatches = [...html.matchAll(/\$\s?([\d,]{3,7}(?:\.\d{2})?)/g)]
    .map(m => parseFloat(m[1].replace(/,/g, '')))
    .filter(n => n >= 100 && n <= 200000);
  const amount = amountMatches.length ? Math.max(...amountMatches) : null;

  // Deadline: look for "Month DD, YYYY" or "MM/DD/YYYY" style dates.
  const monthDateMatch = html.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/);
  const slashDateMatch = html.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/);
  const deadlineText = monthDateMatch?.[0] || slashDateMatch?.[0] || null;

  return {
    title,
    amount,
    deadlineText,
    source: sourceUrl,
    extracted: Boolean(title || amount || deadlineText),
  };
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ');
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
