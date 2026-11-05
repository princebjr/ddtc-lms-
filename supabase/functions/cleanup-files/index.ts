// cleanup-files (SECURITY_AND_ACCESS.md section 8): run hourly by pg_cron with the service-role
// key. Removes expired PENDING uploads, REJECTED objects and replaced profile images, and retries
// DELETE_FAILED. The list comes from public.files_due_for_cleanup, which never returns lesson
// audio, instruction audio, attachments or validated submission files. Outcomes are audited.
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
  let failed = 0;
  for (const f of (due ?? []) as Array<{ id: string; bucket_name: string; storage_path: string }>) {
    const { error: removeError } = await admin.storage.from(f.bucket_name).remove([f.storage_path]);
    if (removeError) {
      failed += 1;
      await admin.from('file_objects').update({ status: 'DELETE_FAILED' }).eq('id', f.id);
    } else {
      deleted += 1;
      await admin.from('file_objects').update({ status: 'DELETED', deleted_at: new Date().toISOString() }).eq('id', f.id);
    }
  }
  if (deleted || failed) {
    await admin.from('audit_logs').insert({ actor_id: null, action: 'files.cleanup', entity_type: 'file_object', entity_id: null, metadata: { deleted, failed } });
  }
  return json(req, 200, { deleted, failed });
});
