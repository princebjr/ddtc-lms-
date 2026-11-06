// bulk-import-learners (SECURITY_AND_ACCESS.md section 8): administrator only. The app parses the
// CSV and sends rows; every row is re-validated here (never trust the client). `commit: false`
// returns a preview with a status per row; `commit: true` invites every valid new learner and
// returns an error report. Enrolment into courses arrives with courses in Phase 5.
import { z } from 'npm:zod@4.6.7';
import { requireAdmin, serviceClient } from '../_shared/auth.ts';
import { HttpError, json, readJson, serve } from '../_shared/http.ts';
import { audit, findByEmail, invite, Person } from '../_shared/people.ts';

const MAX_ROWS = 500;
const Body = z.object({
  rows: z.array(z.object({ firstName: z.string(), secondName: z.string(), email: z.string() })).min(1).max(MAX_ROWS),
  commit: z.boolean().default(false),
});

type RowResult = { row: number; email: string; status: 'ready' | 'created' | 'error'; message?: string };

serve(async (req) => {
  const caller = await requireAdmin(req);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, 'invalid', `Send between 1 and ${MAX_ROWS} rows`);
  const admin = serviceClient();
  const seen = new Set<string>();
  const results: RowResult[] = [];

  for (const [i, raw] of parsed.data.rows.entries()) {
    const row = i + 2; // row 1 is the CSV header
    const person = Person.safeParse(raw);
    if (!person.success) {
      results.push({ row, email: String(raw.email ?? ''), status: 'error', message: person.error.issues[0]?.message });
      continue;
    }
    const email = person.data.email;
    if (seen.has(email)) {
      results.push({ row, email, status: 'error', message: 'This address appears more than once in the file' });
      continue;
    }
    seen.add(email);
    if (await findByEmail(admin, email)) {
      results.push({ row, email, status: 'error', message: 'An account with this address already exists' });
      continue;
    }
    if (!parsed.data.commit) {
      results.push({ row, email, status: 'ready' });
      continue;
    }
    try {
      await invite(admin, person.data, req.headers.get('Origin'));
      results.push({ row, email, status: 'created' });
    } catch {
      results.push({ row, email, status: 'error', message: 'The invitation email could not be sent' });
    }
  }

  const summary = {
    total: results.length,
    ready: results.filter((r) => r.status === 'ready').length,
    created: results.filter((r) => r.status === 'created').length,
    errors: results.filter((r) => r.status === 'error').length,
  };
  if (parsed.data.commit) await audit(admin, caller.id, 'admin.learners_imported', 'profile', null, summary);
  return json(req, 200, { summary, results });
});
