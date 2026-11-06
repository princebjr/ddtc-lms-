// The allow-list for lesson content (Phase 6 build list: "sanitised rich-text editor"). The editor
// produces this structure; anything else (scripts, event handlers, styles, iframes, forms, data and
// script URLs) is removed on the server before saving, and the lessons table checks again. Learners'
// browsers clean it once more when showing it (DOMPurify).
import sanitizeHtml from 'npm:sanitize-html@2.18.1';

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 's', 'blockquote', 'ul', 'ol', 'li',
    'a', 'code', 'pre', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img',
  ],
  allowedAttributes: {
    a: ['href', 'title'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    ol: ['start'],
    th: ['colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
  },
  allowedSchemes: ['https', 'http', 'mailto'],
  allowedSchemesByTag: { img: ['https'] },
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  // Links open in a new tab without giving the other site access to this page.
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer nofollow' }),
    h1: 'h2',
  },
};
// target and rel are added by the transform above, so allow them on links.
(OPTIONS.allowedAttributes as Record<string, string[]>).a.push('target', 'rel');

export function cleanLessonHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS).trim();
}
