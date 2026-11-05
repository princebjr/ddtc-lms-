import { Eye, EyeOff } from 'lucide-react';
import { useId, useState } from 'react';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { cn } from '@/lib/utils.js';

// A labelled field with an inline error (UI_FEEDBACK.md: field errors are inline, never toasts).
// Inputs are 16 px so iOS does not zoom (RESPONSIVE.md 15). The focused field scrolls into view
// above the on-screen keyboard.

/**
 * @param {{ label: string, name: string, error?: string, hint?: string, labelAction?: import('react').ReactNode }
 *   & import('react').ComponentProps<'input'>} props
 */
export function FormField({ label, name, error, hint, labelAction, className, type, ...inputProps }) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const [reveal, setReveal] = useState(false);
  const isPassword = type === 'password';
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {labelAction}
      </div>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={isPassword && reveal ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={isPassword ? 'pr-12' : undefined}
          onFocus={(event) => {
            const el = event.currentTarget;
            // Keep the field above the on-screen keyboard once it opens.
            setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
          }}
          {...inputProps}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? 'Hide password' : 'Show password'}
            aria-pressed={reveal}
            className="absolute top-0.5 right-0.5 inline-flex size-11 items-center justify-center rounded-full text-ink-secondary hover:bg-fill focus-visible:focus-ring"
          >
            {reveal ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
          </button>
        ) : null}
      </div>
      {hint && !error ? (
        <p id={hintId} className="m-0 text-body-sm text-ink-secondary">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="m-0 text-body-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Reads a form's fields as strings.
 * @param {HTMLFormElement} form
 * @returns {Record<string, string>}
 */
export function formValues(form) {
  /** @type {Record<string, string>} */
  const values = {};
  for (const [key, value] of new FormData(form).entries()) values[key] = typeof value === 'string' ? value : '';
  return values;
}
