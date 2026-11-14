// @vitest-environment jsdom
// The learner's browser cleans lesson text and instructions once more before showing them (defence in depth;
// the server cleans them when saved). Phase 15 keeps the last few results so redraws do not clean again; the
// result must be the same, and the cache is emptied on sign-out (lesson text is private to the course).
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanForDisplay } from '@/lib/lessons/sanitize.js';
import { clearPrivateCaches } from '@/lib/private-caches.js';

beforeEach(() => clearPrivateCaches());

describe('cleanForDisplay', () => {
  it('removes scripts, event handlers and javascript: links', () => {
    const out = cleanForDisplay('<p onclick="steal()">Hi<script>alert(1)</script></p><a href="javascript:alert(1)">x</a><img src=x onerror="steal()">');
    expect(out).not.toMatch(/script|onclick|onerror|javascript:/i);
    expect(out).toContain('<p>Hi</p>');
  });

  it('keeps the formatting lecturers use, and safe links', () => {
    const html = '<h2>Genesis</h2><p><strong>In</strong> the <em>beginning</em></p><ul><li>One</li></ul><a href="https://bible.example/gen1">Read</a>';
    expect(cleanForDisplay(html)).toBe(html);
  });

  it('gives the same result from its cache as when it cleans', () => {
    const html = '<p>Hello <b>world</b><iframe src="https://evil.example"></iframe></p>';
    const first = cleanForDisplay(html);
    expect(first).not.toContain('iframe');
    expect(cleanForDisplay(html)).toBe(first);
  });

  it('keeps nothing after sign-out, and still cleans afterwards', () => {
    const html = '<p>Private lesson<script>x()</script></p>';
    cleanForDisplay(html);
    clearPrivateCaches();
    expect(cleanForDisplay(html)).toBe('<p>Private lesson</p>');
  });
});
