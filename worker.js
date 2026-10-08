// ------------------------------------------------------------------
// Scholar Brilliance Worker
// Serves the static site as usual, and adds these API routes:
// GET  /api/extract            — best-effort heuristic extraction of
//                                 a title/amount/deadline from a
//                                 public scholarship page's HTML.
// POST /api/billing/checkout   — create a Stripe Checkout session
//                                 (individual student or org seats).
// POST /api/billing/portal     — create a Stripe Billing Portal
//                                 session so a payer can manage/
//                                 cancel their own subscription.
// POST /api/billing/webhook    — Stripe's webhook delivery endpoint;
//                                 keeps the `subscriptions` table in
//                                 sync with what Stripe actually has.
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

    if (url.pathname === '/api/billing/checkout' && request.method === 'POST') {
      try {
        return withSecurityHeaders(await handleCreateCheckout(request, env, url.origin));
      } catch (err) {
        return withSecurityHeaders(json({ error: err.message || 'Something went wrong starting checkout.' }, 500));
      }
    }

    if (url.pathname === '/api/billing/portal' && request.method === 'POST') {
      try {
        return withSecurityHeaders(await handleCreatePortalSession(request, env, url.origin));
      } catch (err) {
        return withSecurityHeaders(json({ error: err.message || 'Something went wrong opening billing settings.' }, 500));
      }
    }

    if (url.pathname === '/api/billing/webhook' && request.method === 'POST') {
      try {
        return withSecurityHeaders(await handleStripeWebhook(request, env));
      } catch (err) {
        return withSecurityHeaders(json({ error: err.message || 'Webhook processing failed.' }, 500));
      }
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

// ------------------------------------------------------------------
// Billing — shared plumbing for both billing workflows (an
// individual student's own subscription, and an org's seat-pool
// subscription). Neither checkout flow has a pricing page wired to
// it yet; this is the infrastructure both will call into once they
// exist: find-or-create a Stripe customer, start a Checkout session,
// open the Billing Portal, and keep `subscriptions` in sync via
// webhook. See sql/add-billing.sql for the schema this reads/writes.
// ------------------------------------------------------------------

// Reads the caller's own profile (role, org_id) using THEIR OWN
// access token, so this respects RLS rather than reaching for the
// service role key just to check who's asking.
async function getOwnProfile(request, env, userId) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=role,org_id`, {
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!resp.ok) return null;
  const rows = await resp.json();
  return rows[0] || null;
}

// Every write to `subscriptions`/`stripe_events` happens here, with
// the service_role key, which bypasses RLS. That's intentional: the
// webhook has no logged-in user to act as, and by the time the
// checkout/portal handlers below reach this helper they've already
// done their own authorization check (is this really this student,
// or staff of this org).
async function supabaseServiceRequest(env, method, path, body, extraHeaders) {
  const resp = await fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(extraHeaders || {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Supabase error (${resp.status}): ${text}`);
  }
  if (resp.status === 204) return null;
  const text = await resp.text();
  return text ? JSON.parse(text) : null;
}

// Stripe's REST API takes application/x-www-form-urlencoded bodies
// with bracket notation for nested objects/arrays (e.g.
// line_items[0][price]=price_123). This flattens a plain JS object
// into that shape so the rest of this file can just pass normal
// nested params.
function toStripeForm(params, prefix) {
  const out = [];
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item !== null && typeof item === 'object') {
          out.push(...toStripeForm(item, `${name}[${i}]`));
        } else {
          out.push([`${name}[${i}]`, String(item)]);
        }
      });
    } else if (typeof value === 'object') {
      out.push(...toStripeForm(value, name));
    } else {
      out.push([name, String(value)]);
    }
  }
  return out;
}

async function stripeRequest(env, method, path, params) {
  const resp = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: method === 'GET' ? undefined : new URLSearchParams(toStripeForm(params)).toString(),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.error?.message || `Stripe API error (${resp.status})`);
  }
  return data;
}

// Verifies the `Stripe-Signature` header per Stripe's documented
// scheme (t=<timestamp>,v1=<hmac>) using the Web Crypto API, which
// is available in Workers — no Stripe SDK/npm dependency needed,
// consistent with the rest of this file's plain-fetch style.
async function verifyStripeSignature(payload, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  const parts = Object.fromEntries(
    sigHeader.split(',').map((p) => {
      const [k, v] = p.split('=');
      return [k, v];
    })
  );
  const timestamp = parts.t;
  const expectedSig = parts.v1;
  if (!timestamp || !expectedSig) return false;

  // Reject anything older than 5 minutes — defends against a
  // replayed webhook delivery being accepted long after the fact.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const digest = [...new Uint8Array(signed)].map((b) => b.toString(16).padStart(2, '0')).join('');

  if (digest.length !== expectedSig.length) return false;
  let mismatch = 0;
  for (let i = 0; i < digest.length; i++) {
    mismatch |= digest.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }
  return mismatch === 0;
}

async function handleCreateCheckout(request, env, origin) {
  const user = await verifySupabaseSession(request, env);
  if (!user) return json({ error: 'You must be logged in to start checkout.' }, 401);

  if (!env.STRIPE_SECRET_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Billing is not configured yet.' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  let priceId;
  let quantity;
  let column;
  let value;
  let metadata;

  if (body.plan === 'individual') {
    priceId = env.STRIPE_PRICE_INDIVIDUAL_MONTHLY;
    quantity = 1;
    column = 'user_id';
    value = user.id;
    metadata = { user_id: user.id };
  } else if (body.plan === 'org_seats') {
    const profile = await getOwnProfile(request, env, user.id);
    if (!profile || profile.role !== 'staff' || !profile.org_id) {
      return json({ error: 'Only staff with an organization can buy seats.' }, 403);
    }
    const seats = Number(body.seats);
    if (!Number.isInteger(seats) || seats < 1 || seats > 5000) {
      return json({ error: 'Enter a valid number of seats.' }, 400);
    }
    priceId = env.STRIPE_PRICE_ORG_SEAT_MONTHLY;
    quantity = seats;
    column = 'org_id';
    value = profile.org_id;
    metadata = { org_id: profile.org_id };
  } else {
    return json({ error: 'Unknown plan.' }, 400);
  }

  if (!priceId) {
    return json({ error: 'Billing is not fully configured yet — missing a Stripe price id.' }, 500);
  }

  // Find or create the Stripe customer that owns this user/org.
  const existing = await supabaseServiceRequest(
    env,
    'GET',
    `/subscriptions?${column}=eq.${value}&select=stripe_customer_id&limit=1`
  );
  let customerId = existing?.[0]?.stripe_customer_id;

  if (!customerId) {
    const customer = await stripeRequest(env, 'POST', '/customers', {
      email: user.email,
      metadata,
    });
    customerId = customer.id;
  }

  const session = await stripeRequest(env, 'POST', '/checkout/sessions', {
    mode: 'subscription',
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: priceId, quantity }],
    subscription_data: { metadata },
    success_url: `${origin}/account.html?billing=success`,
    cancel_url: `${origin}/account.html?billing=canceled`,
  });

  return json({ url: session.url });
}

async function handleCreatePortalSession(request, env, origin) {
  const user = await verifySupabaseSession(request, env);
  if (!user) return json({ error: 'You must be logged in.' }, 401);

  if (!env.STRIPE_SECRET_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Billing is not configured yet.' }, 500);
  }

  const profile = await getOwnProfile(request, env, user.id);
  const isStaffWithOrg = Boolean(profile?.role === 'staff' && profile?.org_id);
  const column = isStaffWithOrg ? 'org_id' : 'user_id';
  const value = isStaffWithOrg ? profile.org_id : user.id;

  const existing = await supabaseServiceRequest(
    env,
    'GET',
    `/subscriptions?${column}=eq.${value}&select=stripe_customer_id&limit=1`
  );
  const customerId = existing?.[0]?.stripe_customer_id;
  if (!customerId) {
    return json({ error: "You don't have a billing account yet." }, 400);
  }

  const portalSession = await stripeRequest(env, 'POST', '/billing_portal/sessions', {
    customer: customerId,
    return_url: `${origin}/account.html`,
  });

  return json({ url: portalSession.url });
}

async function handleStripeWebhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Webhook is not configured yet.' }, 500);
  }

  const payload = await request.text();
  const sigHeader = request.headers.get('Stripe-Signature');
  const verified = await verifyStripeSignature(payload, sigHeader, env.STRIPE_WEBHOOK_SECRET);
  if (!verified) {
    return json({ error: 'Invalid signature.' }, 400);
  }

  const event = JSON.parse(payload);

  // Idempotency: Stripe retries delivery on anything but a 2xx, so a
  // duplicate event id means this was already applied. A conflict on
  // this insert is expected and fine — it's exactly what we're
  // checking for, not a real error.
  try {
    await supabaseServiceRequest(env, 'POST', '/stripe_events', { id: event.id, type: event.type }, {
      Prefer: 'resolution=ignore-duplicates,return=representation',
    });
  } catch (err) {
    // Non-fatal — proceed rather than block billing on a logging write.
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    if (session.mode === 'subscription' && session.subscription) {
      const subscription = await stripeRequest(env, 'GET', `/subscriptions/${session.subscription}`);
      await upsertSubscriptionRow(env, subscription, session.metadata);
    }
  } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    await upsertSubscriptionRow(env, subscription, subscription.metadata);
  }
  // Any other event type is simply acknowledged below — Stripe only
  // needs a 2xx, not special handling for every event it can send.

  return json({ received: true });
}

async function upsertSubscriptionRow(env, subscription, metadata) {
  const userId = metadata?.user_id || null;
  const orgId = metadata?.org_id || null;
  if (!userId && !orgId) {
    // No attribution to go on — nothing safe to write.
    return;
  }

  const item = subscription.items?.data?.[0];
  const row = {
    user_id: userId,
    org_id: orgId,
    stripe_customer_id: subscription.customer,
    stripe_subscription_id: subscription.id,
    stripe_price_id: item?.price?.id || null,
    status: subscription.status,
    seats: item?.quantity ?? null,
    current_period_end: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
  };

  await supabaseServiceRequest(env, 'POST', '/subscriptions?on_conflict=stripe_subscription_id', row, {
    Prefer: 'resolution=merge-duplicates,return=minimal',
  });
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
    return json({ error: "Couldn't reach that page. It may be slow, offline, or blocking automated requests (this happens with sites like Bold.org)." }, 502);
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
