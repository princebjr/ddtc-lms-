// Avatar initials (BUILD_PLAN Phase 1): first letter of the first name and first letter of the
// second name, uppercase. Computed in code on every render and never stored (exit gate).

/** @type {any} One grapheme segmenter, created on first use and reused (avatars render in long lists). */
let segmenter;

/**
 * First user-perceived character of a name, so accented and non-Latin letters stay whole.
 * @param {string | null | undefined} name
 * @returns {string}
 */
function firstLetter(name) {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '';
  const Segmenter = /** @type {any} */ (Intl).Segmenter;
  if (typeof Segmenter === 'function') {
    segmenter ??= new Segmenter('en', { granularity: 'grapheme' });
    const first = segmenter.segment(trimmed)[Symbol.iterator]().next();
    return first.done ? '' : first.value.segment;
  }
  return Array.from(trimmed)[0] ?? '';
}

/**
 * @param {string | null | undefined} firstName
 * @param {string | null | undefined} secondName
 * @returns {string} for example "PB" for Prince Boateng, "S" for Sarah, "" when there is no name
 */
export function getInitials(firstName, secondName) {
  return `${firstLetter(firstName)}${firstLetter(secondName)}`.toLocaleUpperCase('en');
}

/**
 * @param {string | null | undefined} firstName
 * @param {string | null | undefined} secondName
 * @returns {string}
 */
export function fullName(firstName, secondName) {
  return [firstName, secondName]
    .map((n) => (n ?? '').trim())
    .filter(Boolean)
    .join(' ');
}
