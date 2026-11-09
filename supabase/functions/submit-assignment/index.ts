// submit-assignment (Phase 8; SECURITY_AND_ACCESS.md section 8; D10, D24, ADR-009, owner decisions 2,
// 3 and 4 of 2026-11-08). A learner sends their answer, a plain-text answer and up to 5 of their own
// validated uploads, as the next version, or removes an upload they have not sent. The database
// functions decide everything (enrolment, publication, due date and extension, version rules,
// lateness from server time) and audit it; the same requestId sent twice returns the first result,
// so a retry after a dropped connection never makes a second version.
import { z } from 'npm:zod@4.6.7';
import { requireUser, serviceClient } from '../_shared/auth.ts';
import { fromDbError, HttpError, json, readJson, serve } from '../_shared/http.ts';
import { removeStoredFile } from '../_shared/remove-file.ts';

const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('submit'),
    assignmentId: z.uuid(),
    // Counted in characters as the database counts them (an emoji is one).
    text: z
      .string()
      .default('')
      .refine((s) => [...s].length <= 20000, 'Your text answer is longer than 20,000 characters'),
    fileIds: z.array(z.uuid()).max(5, 'You can add at most 5 files').default([]),
    requestId: z.uuid(),
  }),
  z.object({ action: z.literal('remove-file'), fileId: z.uuid() }),
]);

serve(async (req) => {
  const caller = await requireUser(req);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, 'invalid', parsed.error.issues[0]?.message ?? 'Invalid request');
  const b = parsed.data;
  const admin = serviceClient();

  if (b.action === 'submit') {
    const { data, error } = await admin.rpc('submission_submit', {
      p_actor: caller.id,
      p_assignment: b.assignmentId,
      p_text: b.text,
      p_files: b.fileIds,
      p_request: b.requestId,
    });
    if (error) throw fromDbError(error);
    const row = (data as Array<{ submission_id: string; version_number: number; is_late: boolean; resubmitted: boolean; replayed: boolean }>)[0];
    return json(req, 200, {
      submissionId: row.submission_id,
      versionNumber: row.version_number,
      isLate: row.is_late,
      resubmitted: row.resubmitted,
      replayed: row.replayed,
    });
  }

  const { error } = await admin.rpc('submission_draft_file_remove', { p_actor: caller.id, p_file: b.fileId });
  if (error) throw fromDbError(error);
  // Gone from Storage now; a failed removal is marked DELETE_FAILED and retried by cleanup-files.
  const removed = await removeStoredFile(admin, b.fileId);
  return json(req, 200, { fileId: b.fileId, removed });
});
