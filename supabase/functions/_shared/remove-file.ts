// Removes a file's object from Storage with the service role and records the outcome on its
// file_objects record: DELETED (with the time), or DELETE_FAILED for the cleanup-files job to retry.
// A file already missing from Storage counts as removed (Storage answers success for it), and a
// record already DELETED is left as it is. Used by finalize-upload (replaced profile photos and
// covers) and delete-media (ADR-007).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';

/** @returns whether the object is gone from Storage */
export async function removeStoredFile(admin: SupabaseClient, fileId: string): Promise<boolean> {
  const { data: file } = await admin.from('file_objects').select('bucket_name, storage_path, status').eq('id', fileId).maybeSingle();
  if (!file) return false;
  if (file.status === 'DELETED') return true;
  const { error } = await admin.storage.from(file.bucket_name).remove([file.storage_path]);
  await admin
    .from('file_objects')
    .update(error ? { status: 'DELETE_FAILED' } : { status: 'DELETED', deleted_at: new Date().toISOString() })
    .eq('id', fileId);
  return !error;
}
