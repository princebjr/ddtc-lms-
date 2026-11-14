// retention-runner (D20; ADR-022; Phase 12): run daily by pg_cron with the service-role key.
// Asks the database for the mode (retention_run_begin: DRY_RUN unless retention is switched on AND dry
// runs began at least retention_dry_run_days ago) and for the candidates (retention_candidates: only
// learner audio on submitted assignment and examination answers whose grade or result was released at
// least retention_days ago, with no active hold). A dry run changes nothing. A live run deletes one
// object at a time by its exact stored path and records each outcome (retention_record: DELETED keeps
// the row with deleted_at; DELETE_FAILED is retried by the next run, after holds are checked again).
// retention_run_finish closes the run with the per-file details and audits it.
import { requireScheduler, serviceClient } from '../_shared/auth.ts';
import { HttpError, json, serve } from '../_shared/http.ts';

/** At most this many files a run (the next run takes the rest). */
const BATCH = 500;

type Candidate = { file_id: string; bucket_name: string; storage_path: string; status: string; source: string; answer_id: string; released_at: string };
type Outcome = { file_id: string; source: string; answer_id: string; outcome: 'ELIGIBLE' | 'DELETED' | 'FAILED'; error?: string };

serve(async (req) => {
  await requireScheduler(req);

  const admin = serviceClient();
  const { data: begun, error: beginError } = await admin.rpc('retention_run_begin');
  if (beginError) throw new HttpError(500, 'server_error', 'Could not start the run');
  const run = (Array.isArray(begun) ? begun[0] : begun) as { run_id: string; mode: 'DRY_RUN' | 'LIVE' };

  const { data: rows, error: listError } = await admin.rpc('retention_candidates', { p_limit: BATCH });
  if (listError) throw new HttpError(500, 'server_error', 'Could not list candidates');
  const candidates = (rows ?? []) as Candidate[];

  const outcomes: Outcome[] = [];
  for (const c of candidates) {
    const base = { file_id: c.file_id, source: c.source, answer_id: c.answer_id };
    if (run.mode !== 'LIVE') {
      outcomes.push({ ...base, outcome: 'ELIGIBLE' });
      continue;
    }
    // Checked again just before deleting: a hold placed since the list was read keeps the file.
    const { data: still, error: checkError } = await admin.rpc('retention_still_candidate', { p_file: c.file_id });
    if (checkError || still !== true) {
      outcomes.push({ ...base, outcome: 'ELIGIBLE', error: checkError ? 'Not checked again; left in place' : 'Held or changed since listed; left in place' });
      continue;
    }
    // One object, by its exact stored path.
    const { error: removeError } = await admin.storage.from(c.bucket_name).remove([c.storage_path]);
    const failed = removeError ? removeError.message.slice(0, 1000) : null;
    const { error: recordError } = await admin.rpc('retention_record', { p_run: run.run_id, p_file: c.file_id, p_deleted: !failed, p_error: failed });
    if (recordError) {
      // The object was removed but its outcome was not saved (rare: the database refused or was
      // unreachable); said plainly in the run for an administrator to look at.
      outcomes.push({ ...base, outcome: 'FAILED', error: `Not recorded: ${recordError.message}`.slice(0, 1000) });
      continue;
    }
    outcomes.push({ ...base, outcome: failed ? 'FAILED' : 'DELETED', ...(failed ? { error: failed } : {}) });
  }

  const { error: finishError } = await admin.rpc('retention_run_finish', {
    p_run: run.run_id,
    p_eligible: candidates.length,
    p_details: { files: outcomes.slice(0, BATCH) },
  });
  if (finishError) throw new HttpError(500, 'server_error', 'Could not finish the run');

  const deleted = outcomes.filter((o) => o.outcome === 'DELETED').length;
  const failed = outcomes.filter((o) => o.outcome === 'FAILED').length;
  if (failed) console.error(`retention-runner: ${failed} deletion(s) failed`);
  return json(req, 200, { runId: run.run_id, mode: run.mode, eligible: candidates.length, deleted, failed });
});
