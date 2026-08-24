// Shared Supabase client. Loaded after the Supabase SDK and config.js
// on every page that needs auth (login.html, dashboard.html, etc).

if (!window.SUPABASE_URL || window.SUPABASE_URL.includes("YOUR-PROJECT-REF")) {
  console.warn(
    "Scholar Brilliance: config.js still has placeholder Supabase credentials. " +
    "Auth calls will fail until you fill in SUPABASE_URL and SUPABASE_ANON_KEY."
  );
}

const supabaseClient = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);
