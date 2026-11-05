import { z } from 'zod';

// Zod schemas for every authentication form (CLAUDE.md section 2: Zod validation on every input).
// The database re-checks names (sign-up trigger) and Supabase Auth re-checks the password length;
// these schemas give inline errors before anything is sent.

/** D22: at least 10 characters. Supabase Auth hashes with bcrypt, which reads at most 72 bytes. */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 72;
export const NAME_MAX = 100;

/** @param {string} label */
const name = (label) =>
  z
    .string()
    .trim()
    .min(1, `Enter your ${label}`)
    .max(NAME_MAX, `${label[0].toUpperCase()}${label.slice(1)} must be ${NAME_MAX} characters or fewer`);

const email = z.string().trim().min(1, 'Enter your email address').email('Enter a valid email address').max(320, 'Enter a valid email address');

const newPassword = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
  .refine((v) => new TextEncoder().encode(v).length <= PASSWORD_MAX, `Use ${PASSWORD_MAX} characters or fewer`);

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password'),
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
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'The passwords do not match' });

export const completeProfileSchema = z.object({
  firstName: name('first name'),
  secondName: name('second name'),
});

export const otpSchema = z.object({
  code: z
    .string()
    .transform((v) => v.replace(/\s+/g, ''))
    .pipe(z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app')),
});

/**
 * Validates form values and returns either the parsed data or one message per field.
 * @template {z.ZodType} S
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
