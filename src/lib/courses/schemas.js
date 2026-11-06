import * as z from 'zod/mini';

// Zod schema for the course form (CLAUDE.md section 2: Zod validation on every input). The same
// rules are enforced again by create-course and by the courses table (check constraints and the
// courses_guard trigger); these give inline errors first.

export const COURSE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,19}$/;

export const courseSchema = z.object({
  title: z.string().check(z.trim(), z.minLength(3, 'Enter a title of at least 3 characters'), z.maxLength(150, 'Use 150 characters or fewer')),
  courseCode: z
    .string()
    .check(
      z.trim(),
      z.toUpperCase(),
      z.minLength(1, 'Enter a course code, for example BIB101'),
      z.regex(COURSE_CODE_PATTERN, 'Use 2 to 20 capital letters, digits or dashes, for example BIB101'),
    ),
  category: z.string().check(z.trim(), z.maxLength(100, 'Use 100 characters or fewer')),
  description: z.string().check(z.maxLength(5000, 'Use 5,000 characters or fewer')),
  learningObjectives: z.string().check(z.maxLength(5000, 'Use 5,000 characters or fewer')),
});

export const returnReasonSchema = z.string().check(z.trim(), z.minLength(3, 'Tell the lecturer what to change'), z.maxLength(1000, 'Use 1,000 characters or fewer'));
