// ------------------------------------------------------------------
// Shared formatting helpers used across the app. Previously these
// were copy-pasted separately into browse.js, tracker.js,
// staff-scholarships.js, dashboard.js, staff-referrals.js, and
// staff-students.js — harmless today since they were all logically
// identical, but that kind of duplication is exactly how small,
// silent behavior drift creeps in over time as files get edited
// independently. Consolidated here instead.
// ------------------------------------------------------------------

// Formats a number as a dollar amount, e.g. 1234.5 -> "$1,235".
// Returns an empty string for null/undefined so callers can safely
// interpolate it without an extra guard.
function fmtMoney(n) {
  if (n === null || n === undefined || n === '') return '';
  return `$${Math.round(Number(n)).toLocaleString()}`;
}

// Short date, no year — e.g. "Sep 1". Used where space is tight and
// the year is implied, like the dashboard's upcoming-deadlines list.
function fmtDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Full date with year — e.g. "Sep 1, 2027". Used wherever the date
// might be far enough out (or in the past) that the year matters.
function fmtDateLong(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// How many days ago a timestamp was, as a plain number (not rounded
// or formatted) — callers compare it against a threshold like <= 7.
function daysAgo(timestamp) {
  return (Date.now() - new Date(timestamp).getTime()) / 86400000;
}
