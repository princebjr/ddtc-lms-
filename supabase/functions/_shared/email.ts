// Phase 11 (D21, D31, ADR-019): the notification email and how a provider reply is classed. Pure
// functions (no Deno APIs), so Vitest checks them too.

export type EmailNotice = { firstName: string; title: string; message: string; linkPath: string | null };
export type SendOutcome = { ok: true; id: string } | { ok: false; permanent: boolean; error: string; stopBatch: boolean };

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** Subject, plain text and simple HTML for one notification (no private data beyond the recipient's own notice). */
export function renderEmail(n: EmailNotice, appUrl: string) {
  const link = n.linkPath && appUrl ? `${appUrl.replace(/\/$/, '')}${n.linkPath}` : null;
  const footer = 'You receive this because you use DDTC LMS. To stop course emails, turn off "Email me about my courses" on your Notifications page.';
  const text = [`Hello ${n.firstName},`, '', n.message, ...(link ? ['', `View in DDTC LMS: ${link}`] : []), '', footer].join('\n');
  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#111827;max-width:560px">',
    `<p>Hello ${escapeHtml(n.firstName)},</p>`,
    `<p><strong>${escapeHtml(n.title)}</strong></p>`,
    `<p>${escapeHtml(n.message)}</p>`,
    link ? `<p><a href="${escapeHtml(link)}">View in DDTC LMS</a></p>` : '',
    `<p style="font-size:13px;color:#4b5563">${escapeHtml(footer)}</p>`,
    '</div>',
  ].join('');
  return { subject: `DDTC LMS: ${n.title}`, text, html };
}

/**
 * D31: 2xx is sent; 429, 5xx and network errors are transient (retried); 401 and 403 mean the service is
 * not set up correctly, so they are transient and stop the batch; any other 4xx (for example an invalid
 * address) is permanent.
 */
export function classifyResponse(status: number, body: string): SendOutcome {
  if (status >= 200 && status < 300) {
    let id = '';
    try {
      id = String(JSON.parse(body)?.id ?? '');
    } catch {
      id = '';
    }
    return { ok: true, id };
  }
  const error = `Provider replied ${status}: ${body.slice(0, 300)}`;
  if (status === 401 || status === 403) return { ok: false, permanent: false, error, stopBatch: true };
  if (status === 429 || status >= 500) return { ok: false, permanent: false, error, stopBatch: false };
  return { ok: false, permanent: true, error, stopBatch: false };
}
