import '@fontsource/roboto/latin-500.css';
import { LoaderCircle } from 'lucide-react';
import googleG from '@/assets/brand/google-g.svg';
import { cn } from '@/lib/utils.js';

// Continue with Google (D27, DESIGN.md 21), following Google's identity branding guidelines:
// the official multi-colour G mark (never recoloured), the label "Continue with Google",
// Roboto Medium 14 px, 48 px high, pill, full width, below the main button after an "or"
// divider. Light variant (white fill, neutral border, dark text) in light mode and dark variant
// (dark fill, light text) in dark mode. Never styled as a primary button.
// Phase 3 wires the Supabase Google provider; the refusal for ADMIN and LECTURER is server-side.

export const GOOGLE_BUTTON_LABEL = 'Continue with Google';

/** @param {{ onClick?: () => void, loading?: boolean, disabled?: boolean, className?: string }} props */
export function GoogleButton({ onClick, loading = false, disabled = false, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-slot="google-button"
      className={cn(
        'relative inline-flex h-12 w-full items-center justify-center gap-3 rounded-full border border-google-border bg-google-fill px-6',
        'font-google text-label text-google-text',
        'transition-[filter,transform] duration-fast ease-standard hover:brightness-95 active:scale-98 dark:hover:brightness-125',
        'focus-visible:focus-ring disabled:pointer-events-none disabled:opacity-60',
        className,
      )}
    >
      {loading ? (
        <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
      ) : (
        <img src={googleG} alt="" aria-hidden="true" width="20" height="20" className="size-5" />
      )}
      <span>{GOOGLE_BUTTON_LABEL}</span>
    </button>
  );
}
