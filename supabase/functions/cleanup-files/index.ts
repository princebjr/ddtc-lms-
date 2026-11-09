// cleanup-files (SECURITY_AND_ACCESS.md section 8): run hourly by pg_cron with the service-role
// key. Removes expired PENDING uploads, REJECTED objects, replaced profile images and covers, the
// files of deleted lesson media (ADR-007) and answers' files never sent within 24 hours (Phase 8,
// owner decision 4), and retries DELETE_FAILED. The list comes from public.files_due_for_cleanup,
// which never returns lesson audio or attachments in use, instruction audio or submitted answers'
// files. Outcomes are audited; each failed removal is counted with its error (D18), so files that
// keep failing appear in public.cleanup_failures() for administrators.
import { serviceClient } from '../_shared/auth.ts';
import { HttpError, json, serve } from '../_shared/http.ts';

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

serve(async (req) => {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  if (!SERVICE_KEY || token !== SERVICE_KEY) throw new HttpError(403, 'forbidden', 'Scheduled job only');

  const admin = serviceClient();
  const { data: due, error } = await admin.rpc('files_due_for_cleanup', { p_limit: 200 });
  if (error) throw new HttpError(500, 'server_error', 'Could not list files');

  let deleted = 0;
  const failures: string[] = [];
  for (const f of (due ?? []) as Array<{ id: string; bucket_name: string; storage_path: string }>) {
    const { error: removeError } = await admin.storage.from(f.bucket_name).remove([f.storage_path]);
    if (removeError) {
      failures.push(f.id);
      const { data: row } = await admin.from('file_objects').select('delete_attempts').eq('id', f.id).maybeSingle();
      await admin
        .from('file_objects')
        .update({ status: 'DELETE_FAILED', delete_attempts: (row?.delete_attempts ?? 0) + 1, last_delete_error: removeError.message.slice(0, 1000) })
        .eq('id', f.id);
    } else {
      deleted += 1;
      await admin.from('file_objects').update({ status: 'DELETED', deleted_at: new Date().toISOString() }).eq('id', f.id);
    }
  }
  if (deleted || failures.length) {
    await admin.from('audit_logs').insert({
      actor_id: null,
      action: failures.length ? 'files.cleanup_failed' : 'files.cleanup',
      entity_type: 'file_object',
      entity_id: null,
      metadata: { deleted, failed: failures.length, failed_ids: failures.slice(0, 50) },
    });
  }
  if (failures.length) console.error(`cleanup-files: ${failures.length} removal(s) failed`);
  return json(req, 200, { deleted, failed: failures.length });
});
