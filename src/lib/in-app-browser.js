// In-app browser detection (D36, RESPONSIVE.md 15.6). WhatsApp, Facebook, Instagram and TikTok
// browsers often block the microphone, downloads and Google sign-in. Best effort from the user agent.

/** @type {ReadonlyArray<[app: string, pattern: RegExp]>} */
const IN_APP_PATTERNS = Object.freeze([
  ['Facebook', /\bFBAN\/|\bFBAV\/|\bFB_IAB\/|\bFBIOS\b|\bFB4A\b|\[FB/i],
  ['Messenger', /\bMessenger(ForiOS|LiteForiOS)?\b|\bOrca-Android\b/i],
  ['Instagram', /\bInstagram\b/i],
  ['WhatsApp', /\bWhatsApp\b/i],
  ['TikTok', /\bTikTok\b|\bmusical_ly\b|\bBytedanceWebview\b|\btrill_/i],
]);

/**
 * @param {string | null | undefined} userAgent
 * @returns {string | null} the app name when the page is inside an in-app browser
 */
export function detectInAppBrowser(userAgent) {
  if (!userAgent) return null;
  for (const [app, pattern] of IN_APP_PATTERNS) if (pattern.test(userAgent)) return app;
  return null;
}
