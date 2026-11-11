// Phase 11 (D21, D31, ADR-019): the notification email and how a Resend reply is classed (transient
// failures are retried on the D31 schedule; a permanent one is FAILED at once).
import { describe, expect, it } from 'vitest';
import { classifyResponse, renderEmail } from '../../supabase/functions/_shared/email.ts';

describe('the notification email', () => {
  it('greets the person, gives the message and a View link, and says how to stop course emails', () => {
    const e = renderEmail({ firstName: 'Kwame', title: 'New assignment', message: 'Reflection on Genesis 1 in BIB101.', linkPath: '/learner/courses/c1' }, 'https://lms.example/');
    expect(e.subject).toBe('DDTC LMS: New assignment');
    expect(e.text).toContain('Hello Kwame,');
    expect(e.text).toContain('View in DDTC LMS: https://lms.example/learner/courses/c1');
    expect(e.text).toContain('Email me about my courses');
    expect(e.html).toContain('href="https://lms.example/learner/courses/c1"');
  });

  it('escapes what people typed', () => {
    const e = renderEmail({ firstName: '<b>K</b>', title: 'T & "Q"', message: '<script>x</script>', linkPath: null }, '');
    expect(e.html).not.toContain('<script>');
    expect(e.html).toContain('&lt;script&gt;');
    expect(e.html).toContain('T &amp; &quot;Q&quot;');
    expect(e.text).not.toContain('View in DDTC LMS');
  });
});

describe('a provider reply', () => {
  it('is sent on 2xx, with the message id', () => {
    expect(classifyResponse(200, '{"id":"re_123"}')).toEqual({ ok: true, id: 're_123' });
  });
  it('is retried on 429 and 5xx', () => {
    expect(classifyResponse(429, 'slow down')).toMatchObject({ ok: false, permanent: false, stopBatch: false });
    expect(classifyResponse(503, 'down')).toMatchObject({ ok: false, permanent: false });
  });
  it('is permanent on another 4xx, such as an invalid address', () => {
    expect(classifyResponse(422, '{"message":"Invalid `to` field"}')).toMatchObject({ ok: false, permanent: true });
  });
  it('stops the batch, without failing the emails, when the key is wrong', () => {
    expect(classifyResponse(401, 'bad key')).toMatchObject({ ok: false, permanent: false, stopBatch: true });
  });
});
