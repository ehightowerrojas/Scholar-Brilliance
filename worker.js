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
      return handleExtract(url);
    }

    // Everything else is a normal static asset request.
    return env.ASSETS.fetch(request);
  },
};

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
