// Dashboard greeting (owner request 2026-11-06): the time of day in Ghana (Africa/Accra, D35)
// followed by the person's first name, for example "Blessed morning, Ama".

/**
 * @param {string | null | undefined} firstName
 * @param {Date} [now]
 * @returns {string}
 */
export function greeting(firstName, now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Africa/Accra' }).format(now));
  // Morning from midnight until noon (owner decision 2026-11-06), afternoon until 5 pm, then evening.
  // Owner request 2026-11-10: Blessed morning, Good afternoon, Glorious evening.
  const part = hour < 12 ? 'Blessed morning' : hour < 17 ? 'Good afternoon' : 'Glorious evening';
  const name = (firstName ?? '').trim();
  return name ? `${part}, ${name}` : part;
}
