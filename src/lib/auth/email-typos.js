// Spots common typing mistakes in the domain of an email address on Sign Up (owner, 2026-11-17: "the system
// accepts wrong emails when signing up") and suggests the address the person most likely meant, for example
// abena@gmial.com -> abena@gmail.com. The server separately refuses domains that cannot receive email at all
// (supabase/functions/check-signup-email); this catches typos of real providers, which would pass that check.

/** Providers DDTC's learners use; a near miss of one of these is almost always a typo. */
const POPULAR = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'live.com', 'aol.com',
  'ymail.com', 'googlemail.com', 'protonmail.com', 'proton.me', 'yahoo.co.uk', 'hotmail.co.uk', 'msn.com',
];

/** Real domains close to a popular one: never "corrected". */
const REAL = new Set([
  ...POPULAR, 'mail.com', 'email.com', 'gmx.com', 'gmx.net', 'aim.com', 'me.com', 'mac.com', 'live.co.uk',
  'yahoo.fr', 'yahoo.ca', 'yahoo.co.in', 'yahoo.com.gh', 'hotmail.fr', 'outlook.fr', 'live.fr', 'zoho.com',
]);

/** Mistyped endings of ".com". */
const TYPO_TLDS = new Set(['co', 'cm', 'con', 'comm', 'cpm', 'cim', 'vom', 'xom', 'om', 'cmo', 'ocm', 'c', 'coom', 'clm']);

/** Optimal string alignment distance: edits, with a swap of two neighbouring letters counted as one. */
export function distance(/** @type {string} */ a, /** @type {string} */ b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * The address the person probably meant, or null when the address looks right.
 * @param {string} raw the address as typed
 * @returns {string | null}
 */
export function suggestEmail(raw) {
  const value = String(raw ?? '').trim();
  const at = value.lastIndexOf('@');
  if (at < 1 || at === value.length - 1) return null;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1).toLowerCase();
  if (REAL.has(domain)) return null;

  // The provider is right but ".com" is mistyped (gmail.con, yahoo.cm).
  const dot = domain.indexOf('.');
  const name = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot + 1) : '';
  const exact = POPULAR.find((p) => p.startsWith(`${name}.`));
  if (exact) return TYPO_TLDS.has(tld) || tld === '' ? `${local}@${exact}` : null;

  // A near miss of a popular provider (gmial.com, yaho.com, hotmal.com, outlok.com).
  let best = null;
  let bestDistance = Infinity;
  for (const p of POPULAR) {
    const d = distance(domain, p);
    if (d < bestDistance) {
      best = p;
      bestDistance = d;
    }
  }
  const allowed = domain.length <= 8 ? 1 : 2;
  return best && bestDistance > 0 && bestDistance <= allowed ? `${local}@${best}` : null;
}
