import { useEffect, useRef } from 'react';
import { useTheme } from '@/components/theme/ThemeProvider.jsx';

// Cloudflare Turnstile (D22: CAPTCHA on email sign-up, sign-in and password recovery). The token
// goes to Supabase Auth as `captchaToken`; Supabase verifies it with the secret, which lives only in
// the Supabase dashboard. Rendered only when VITE_TURNSTILE_SITE_KEY is set (staging, production);
// local and CI runs have CAPTCHA off in supabase/config.toml.

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** @returns {string} the public site key, or '' when CAPTCHA is not configured */
export function turnstileSiteKey() {
  const key = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  return typeof key === 'string' ? key.trim() : '';
}

/** @type {Promise<any> | null} */
let scriptPromise = null;

/** @returns {Promise<any>} window.turnstile */
function loadScript() {
  const w = /** @type {any} */ (window);
  if (w.turnstile) return Promise.resolve(w.turnstile);
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(w.turnstile);
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Turnstile failed to load'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * @param {{ onToken: (token: string | null) => void, resetKey?: number }} props
 *   resetKey: change it after each submit so a fresh token is issued (tokens are single-use)
 */
export function Turnstile({ onToken, resetKey = 0 }) {
  const siteKey = turnstileSiteKey();
  const { resolved } = useTheme();
  const ref = useRef(/** @type {HTMLDivElement | null} */ (null));
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!siteKey || !ref.current) return undefined;
    let widgetId = /** @type {string | null} */ (null);
    let cancelled = false;
    const el = ref.current;
    loadScript()
      .then((turnstile) => {
        if (cancelled || !turnstile) return;
        widgetId = turnstile.render(el, {
          sitekey: siteKey,
          theme: resolved,
          size: 'flexible',
          callback: (/** @type {string} */ token) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        });
      })
      .catch(() => onTokenRef.current(null));
    return () => {
      cancelled = true;
      const w = /** @type {any} */ (window);
      if (widgetId && w.turnstile) w.turnstile.remove(widgetId);
    };
  }, [siteKey, resolved, resetKey]);

  if (!siteKey) return null;
  return <div ref={ref} data-slot="turnstile" className="min-h-16 w-full" />;
}
