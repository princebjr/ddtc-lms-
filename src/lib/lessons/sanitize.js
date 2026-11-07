import DOMPurify from 'dompurify';

// Lesson text and assignment instructions are cleaned on the server when saved (the allow-list in
// supabase/functions/_shared/lesson-html.ts) and checked by the database; learners' browsers clean
// them once more with the same allow-list before showing them (defence in depth).

const ALLOWED = {
  ALLOWED_TAGS: ['p', 'br', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 's', 'blockquote', 'ul', 'ol', 'li', 'a', 'code', 'pre', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img'],
  ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'src', 'alt', 'width', 'height', 'colspan', 'rowspan', 'start'],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
};

/** @param {string} html */
export function cleanForDisplay(html) {
  return DOMPurify.sanitize(html, ALLOWED);
}
