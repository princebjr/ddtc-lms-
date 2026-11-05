import * as z from 'zod/mini';

// Zod schemas for every authentication form (CLAUDE.md section 2: Zod validation on every input).
// zod/mini is the tree-shakeable build of Zod (same rules, a fraction of the bundle: RESPONSIVE.md
// 15.5 caps the first route at 200 KB of JavaScript). The database re-checks names (sign-up
// trigger) and Supabase Auth re-checks the password length; these give inline errors first.

/** D22: at least 8 characters (owner change 2026-11-05, was 10). Supabase Auth hashes with bcrypt, which reads at most 72 bytes. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;
export const NAME_MAX = 100;

/** @param {string} label */
const name = (label) =>
  z
    .string()
    .check(
      z.trim(),
      z.minLength(1, `Enter your ${label}`),
      z.maxLength(NAME_MAX, `${label[0].toUpperCase()}${label.slice(1)} must be ${NAME_MAX} characters or fewer`),
    );

const email = z
  .string()
  .check(
    z.trim(),
    z.minLength(1, 'Enter your email address'),
    z.maxLength(320, 'Enter a valid email address'),
    z.regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address'),
  );

const newPassword = z
  .string()
  .check(
    z.minLength(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`),
    z.refine((v) => new TextEncoder().encode(v).length <= PASSWORD_MAX, `Use ${PASSWORD_MAX} characters or fewer`),
  );

export const signInSchema = z.object({
  email,
  password: z.string().check(z.minLength(1, 'Enter your password')),
});

export const signUpSchema = z.object({
  firstName: name('first name'),
  secondName: name('second name'),
  email,
  password: newPassword,
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ password: newPassword, confirmPassword: z.string() })
  .check(z.refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'The passwords do not match' }));

export const completeProfileSchema = z.object({
  firstName: name('first name'),
  secondName: name('second name'),
});

export const otpSchema = z.object({
  code: z.pipe(
    z.pipe(z.string(), z.transform((v) => v.replace(/\s+/g, ''))),
    z.string().check(z.regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app')),
  ),
});

/**
 * Validates form values and returns either the parsed data or one message per field.
 * @template {z.ZodMiniType} S
 * @param {S} schema
 * @param {unknown} values
 * @returns {{ ok: true, data: z.infer<S> } | { ok: false, errors: Record<string, string> }}
 */
export function validate(schema, values) {
  const result = schema.safeParse(values);
  if (result.success) return { ok: true, data: result.data };
  /** @type {Record<string, string>} */
  const errors = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? 'form');
    errors[key] ??= issue.message;
  }
  return { ok: false, errors };
}

/** Same rule as the database CHECK on profiles.contact_number. */
const CONTACT = /^\+?[0-9][0-9 ()-]{5,19}$/;

export const profileSchema = z.object({
  firstName: name('first name'),
  secondName: name('second name'),
  contactNumber: z.string().check(
    z.trim(),
    z.refine((v) => v === '' || CONTACT.test(v), 'Enter a phone number, for example +233 20 123 4567'),
  ),
});

/** D17: profile photos are JPG, PNG or WebP, at most 2 MB (checked again on the server). */
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

/** @param {{ type: string, size: number }} file @returns {string | null} a reason, or null when fine */
export function photoProblem(file) {
  if (!PHOTO_TYPES.includes(file.type)) return 'use a JPG, PNG or WebP image';
  if (file.size > PHOTO_MAX_BYTES) return 'the image is larger than 2 MB';
  if (file.size === 0) return 'the file is empty';
  return null;
}
