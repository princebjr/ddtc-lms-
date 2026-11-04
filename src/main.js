// Phase 0 placeholder entry point. Replaced by the React application in Phase 1.

/**
 * Returns the product name shown in the document title.
 * @returns {string}
 */
export function productName() {
  return 'DDTC LMS';
}

if (typeof document !== 'undefined') {
  document.title = productName();
}
