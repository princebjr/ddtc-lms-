import DOMPurify from 'dompurify';
import { clearOnSignOut } from '@/lib/private-caches.js';

// Lesson text and assignment instructions are cleaned on the server when saved (the allow-list in
// supabase/functions/_shared/lesson-html.ts) and checked by the database; learners' browsers clean
// them once more with the same allow-list before showing them (defence in depth).

const ALLOWED = {
  ALLOWED_TAGS: ['p', 'br', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 's', 'blockquote', 'ul', 'ol', 'li', 'a', 'code', 'pre', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img'],
  ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'src', 'alt', 'width', 'height', 'colspan', 'rowspan', 'start'],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
};

/** The last few cleaned texts: a screen redraws often, and cleaning a long lesson each time costs 10–100 ms on a
 * budget phone (Phase 15). Lesson text is private to the course, so the cache is emptied on sign-out (D43). */
/** @type {Map<string, string>} */
const recent = new Map();
clearOnSignOut(() => recent.clear());

/** @param {string} html */
export function cleanForDisplay(html) {
  const hit = recent.get(html);
  if (hit !== undefined) return hit;
  const clean = DOMPurify.sanitize(html, ALLOWED);
  recent.set(html, clean);
  if (recent.size > 8) recent.delete(/** @type {string} */ (recent.keys().next().value));
  return clean;
}
