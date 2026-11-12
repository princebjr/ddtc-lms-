// Phase 13: the security headers Vercel serves (vercel.json) and the same set in the local preview.
// The inline theme script is allowed only by its SHA-256 hash, so changing the script without updating the
// hash would break the theme on every page: this test fails first.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inlineScriptHashes, previewHeaders, vercelPageHeaders } from '../../scripts/security-headers.mjs';

const headers = Object.fromEntries(vercelPageHeaders());
const csp = headers['Content-Security-Policy'];

describe('security headers (vercel.json)', () => {
  it('allows the inline theme script by its exact hash, and no other inline script', () => {
    const hashes = inlineScriptHashes(readFileSync('index.html', 'utf8'));
    expect(hashes).toHaveLength(1);
    expect(csp).toContain(`script-src 'self' ${hashes[0]};`);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
  });

  it('locks down framing, objects, base and forms, and only talks to Supabase', () => {
    for (const d of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", 'upgrade-insecure-requests']) expect(csp).toContain(d);
    // blob: = the page's own recordings and files: the audio player reads a fresh recording to draw its waveform.
    expect(csp).toContain("connect-src 'self' blob: https://*.supabase.co wss://*.supabase.co;");
    expect(csp).toContain("media-src 'self' blob: https://*.supabase.co;");
  });

  it('sets HSTS, nosniff, DENY framing, a referrer policy, and the microphone for this site only', () => {
    expect(headers['Strict-Transport-Security']).toMatch(/^max-age=\d{8,}; includeSubDomains$/);
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['Permissions-Policy']).toMatch(/^microphone=\(self\), camera=\(\)/);
  });

  it('the local preview serves the same policy with the local Supabase origin, over plain http', () => {
    const local = Object.fromEntries(previewHeaders('http://127.0.0.1:54321'));
    expect(local['Content-Security-Policy']).toContain('connect-src \'self\' blob: https://*.supabase.co wss://*.supabase.co http://127.0.0.1:54321 ws://127.0.0.1:54321');
    expect(local['Content-Security-Policy']).toContain('media-src \'self\' blob: https://*.supabase.co http://127.0.0.1:54321');
    expect(local['Content-Security-Policy']).not.toContain('upgrade-insecure-requests');
    expect(local['Strict-Transport-Security']).toBeUndefined();
    expect(local['X-Frame-Options']).toBe('DENY');
  });
});
