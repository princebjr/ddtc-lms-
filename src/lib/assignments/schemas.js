import * as z from 'zod/mini';

// The assignment form (CLAUDE.md section 2: Zod validation on every input). manage-assignments and
// the assignments table check the same rules again; these give inline errors first.

export const assignmentSchema = z.object({
  title: z.string().check(z.trim(), z.minLength(3, 'Enter a title of at least 3 characters'), z.maxLength(200, 'Use 200 characters or fewer')),
  categoryId: z.string().check(z.minLength(1, 'Choose a category')),
  contentType: z.enum(['TEXT', 'AUDIO', 'TEXT_AND_AUDIO'], 'Choose how the instructions are given'),
  dueAt: z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Choose a due date and time')),
  maxMarks: z.pipe(
    z.string().check(z.trim(), z.regex(/^\d+(\.\d{1,2})?$/, 'Maximum marks must be more than 0')),
    z.transform(Number),
  ).check(z.refine((n) => n > 0, 'Maximum marks must be more than 0'), z.refine((n) => n <= 10000, 'Maximum marks must be at most 10000')),
  description: z.string().check(z.maxLength(2000, 'Keep the description to 2,000 characters')),
  gradingCriteria: z.string().check(z.maxLength(5000, 'Keep the grading criteria to 5,000 characters')),
});

/** Whether instruction HTML has visible text (tags and spaces alone do not count). @param {string} html */
function hasVisibleText(html) {
  return /\S/.test(html.replace(/<[^>]*>|&nbsp;/g, ''));
}

/**
 * What the instruction type still needs before the assignment can be published (the server checks
 * again), or null. @param {{ contentType: string, textInstructions: string, hasAudio: boolean }} a
 */
export function publishProblem({ contentType, textInstructions, hasAudio }) {
  if ((contentType === 'TEXT' || contentType === 'TEXT_AND_AUDIO') && !hasVisibleText(textInstructions)) return 'Write the instructions before publishing';
  if ((contentType === 'AUDIO' || contentType === 'TEXT_AND_AUDIO') && !hasAudio) return 'Add the instruction audio before publishing';
  return null;
}

/**
 * ADR-009: answers are always text and audio, plus PDF and Word when allowed.
 * @param {{ pdf: boolean, docx: boolean }} extra
 * @returns {Array<'TEXT' | 'AUDIO' | 'PDF' | 'DOCX'>}
 */
export function answerFormats({ pdf, docx }) {
  return ['TEXT', 'AUDIO', ...(pdf ? /** @type {const} */ (['PDF']) : []), ...(docx ? /** @type {const} */ (['DOCX']) : [])];
}
