// Six-digit DDTC ID numbers (ADR-008): assigned by the database, 100000 to 999999, never changed.

/**
 * The ID number in what a person typed or pasted (spaces allowed), or null when it is not one.
 * @param {string} text
 * @returns {number | null}
 */
export function parseIdNumber(text) {
  const digits = text.replace(/\s/g, '');
  return /^[1-9]\d{5}$/.test(digits) ? Number(digits) : null;
}

/** @param {number | null | undefined} idNumber */
export function formatIdNumber(idNumber) {
  return idNumber === null || idNumber === undefined ? '' : String(idNumber);
}
